"""Capability State Model scoring engine.

Pure functions over evidence records. No I/O, no database, no LLM. That is
deliberate: section 11 of the CSM doc requires that any recalibration can be
replayed against historical data before it ships, which is only possible if
scoring is a pure function of its inputs.

Implements decisions D1-D5 from Docs/Architecture/Capability_State_Model.md.
"""

from __future__ import annotations

import math
import statistics
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from app.schemas.capability import (
    CapabilityClass,
    CapabilityLevel,
    ConfidenceBand,
    ConfidenceCalibration,
    ValidationStatus,
)
from app.schemas.evidence import EvidenceStrengthBand
from app.scoring import constants as C
from app.scoring.knowledge import is_knowledge_contradiction

# Ordered level scale. Index arithmetic relies on this order.
LEVEL_ORDER: tuple[CapabilityLevel, ...] = (
    CapabilityLevel.NOVICE,
    CapabilityLevel.DEVELOPING,
    CapabilityLevel.COMPETENT,
    CapabilityLevel.PROFICIENT,
    CapabilityLevel.EXPERT,
)


def level_index(level: CapabilityLevel) -> int:
    return LEVEL_ORDER.index(level)


@dataclass(frozen=True)
class ScoredEvidence:
    """One evidence item, reduced to what scoring needs.

    context_ref identifies the workplace situation the evidence came from
    (a project, client, incident). Independence is judged on it (D4).
    """

    evidence_id: str
    strength: EvidenceStrengthBand
    validation_status: ValidationStatus
    occurred_at: datetime
    context_ref: str
    authenticity_concerns: int = 0


@dataclass(frozen=True)
class CapabilityScore:
    """Result of scoring one (subject, capability) pair."""

    validated_points: float
    provisional_points: float
    independent_contexts: int
    attained_level: CapabilityLevel
    current_support_level: CapabilityLevel
    state_confidence: float
    confidence_band: ConfidenceBand
    half_life_days: float
    revalidation_due: bool
    scoring_model_version: str = C.SCORING_MODEL_VERSION
    rationale: list[str] = field(default_factory=list)


# --- D1: decay -------------------------------------------------------------


def half_life_days(
    capability_class: CapabilityClass,
    validated_applications: int,
) -> float:
    """Half-life in days, extended by reinforcement (D1).

    half_life = BASE[class] * (1 + K * ln(1 + applications))

    The log encodes diminishing returns from overlearning: the 2nd validated
    application extends retention far more than the 10th.
    """
    base = C.BASE_HALF_LIFE_DAYS[capability_class]
    reinforcement = 1.0 + C.REINFORCEMENT_K * math.log1p(max(0, validated_applications))
    return base * reinforcement


def decay_weight(age_days: float, half_life: float) -> float:
    """Exponential decay with a floor (D1).

    weight(age) = max(FLOOR, 2 ** (-age / half_life))

    Never reaches zero: a validated past demonstration stays part of the
    longitudinal record, it is just weaker present-tense proof.
    """
    if half_life <= 0:
        return C.DECAY_FLOOR
    age_days = max(0.0, age_days)
    return max(C.DECAY_FLOOR, 2.0 ** (-age_days / half_life))


# --- D3/D4: points and independence ---------------------------------------


def evidence_points(
    item: ScoredEvidence,
    *,
    now: datetime,
    half_life: float,
) -> float:
    """Recency-weighted points contributed by one evidence item (D3).

    points = BASE_POINTS[strength] * validation_multiplier * decay_weight(age)

    Weak evidence and unvalidated evidence both contribute exactly zero.
    """
    base = C.BASE_POINTS[item.strength]
    if base == 0.0:
        return 0.0
    if item.validation_status is not ValidationStatus.VALIDATED:
        return 0.0
    age = (now - item.occurred_at).total_seconds() / 86400.0
    return base * decay_weight(age, half_life)


def provisional_points(
    items: Sequence[ScoredEvidence],
    *,
    now: datetime,
    half_life: float,
) -> float:
    """Points from evidence awaiting validation.

    Shown in the UI as pending work. Never feeds attained_level (D3).
    """
    total = 0.0
    for item in items:
        if item.validation_status is not ValidationStatus.PENDING:
            continue
        base = C.BASE_POINTS[item.strength]
        if base == 0.0:
            continue
        age = (now - item.occurred_at).total_seconds() / 86400.0
        total += base * decay_weight(age, half_life)
    return total


def count_independent_contexts(items: Sequence[ScoredEvidence]) -> int:
    """Number of independent validated contexts (D4).

    Two items are independent when they differ in context_ref AND are at least
    INDEPENDENCE_WINDOW_DAYS apart. Three submissions from one project week are
    one demonstration observed three times, and prove nothing about transfer
    (thesis 7.1).
    """
    validated = [
        i for i in items
        if i.validation_status is ValidationStatus.VALIDATED
        and C.BASE_POINTS[i.strength] > 0.0
    ]
    validated.sort(key=lambda i: i.occurred_at)

    window = timedelta(days=C.INDEPENDENCE_WINDOW_DAYS)
    accepted: list[ScoredEvidence] = []
    for item in validated:
        clash = any(
            item.context_ref == kept.context_ref
            or abs(item.occurred_at - kept.occurred_at) < window
            for kept in accepted
        )
        if not clash:
            accepted.append(item)
    return len(accepted)


# Points are continuous and decay begins the instant evidence is recorded, so
# a submission made "now" lands fractionally under its threshold. Strict
# floating-point comparison at the boundary is not meaningful here.
_THRESHOLD_EPSILON = 1e-6


def level_for(
    points: float,
    contexts: int,
    *,
    has_exceptional: bool,
) -> CapabilityLevel:
    """Highest level supported by points + independent contexts (D4).

    All constraints must hold simultaneously. Expert additionally requires at
    least one exceptional item.
    """
    result = CapabilityLevel.NOVICE
    for level in LEVEL_ORDER:
        if points + _THRESHOLD_EPSILON < C.LEVEL_POINT_THRESHOLDS[level]:
            break
        if contexts < C.LEVEL_CONTEXT_REQUIREMENTS[level]:
            break
        if (
            level is CapabilityLevel.EXPERT
            and C.EXPERT_REQUIRES_EXCEPTIONAL
            and not has_exceptional
        ):
            break
        result = level
    return result


def apply_step_limit(
    previous: CapabilityLevel,
    proposed: CapabilityLevel,
) -> tuple[CapabilityLevel, str | None]:
    """Update Rule 2 - never advance more than one level in a single update.

    Deliberately NOT applied inside score_capability. That function recomputes
    from the full evidence history, where a multi-level result reflects genuine
    accumulation rather than a jump, and capping it would pin everyone at
    developing forever.

    The rule belongs to the state *transition*, so the update service calls this
    when moving stored state from one validated level to the next.
    """
    max_index = level_index(previous) + 1
    if level_index(proposed) <= max_index:
        return proposed, None
    capped = LEVEL_ORDER[max_index]
    return capped, (
        f"Proposed {proposed.value} capped to {capped.value}: no more than one "
        "level per update (Update Rule 2)."
    )


# --- D5: confidence --------------------------------------------------------


def confidence_band(score: float) -> ConfidenceBand:
    if score < C.REVALIDATION_THRESHOLD:
        return ConfidenceBand.REVALIDATION_DUE
    if score < C.CONFIDENCE_MODERATE:
        return ConfidenceBand.LOW
    if score < C.CONFIDENCE_HIGH:
        return ConfidenceBand.MODERATE
    return ConfidenceBand.HIGH


def state_confidence(
    *,
    validated_points: float,
    attained: CapabilityLevel,
    independent_contexts: int,
    days_since_last_validation: float | None,
    half_life: float,
    authenticity_concerns: int,
    calibration: ConfidenceCalibration,
    manager_validated: bool,
    knowledge_contradiction: bool = False,
) -> float:
    """Confidence that attained_level reflects reality today (D5).

    The unvalidated ceiling is the platform's central governance commitment
    expressed as arithmetic: capability state cannot become confident without
    a human.
    """
    # NOVICE means nothing has been demonstrated yet. There is no affirmative
    # claim to be confident about, and the thresholds for it are trivially
    # satisfied, so reporting a positive confidence here would be misleading.
    if attained is CapabilityLevel.NOVICE:
        return 0.0

    threshold = C.LEVEL_POINT_THRESHOLDS[attained]
    sufficiency = 1.0 if threshold <= 0 else min(1.0, validated_points / threshold)

    if days_since_last_validation is None:
        freshness = 0.0
    else:
        freshness = decay_weight(days_since_last_validation, half_life)

    required_contexts = C.LEVEL_CONTEXT_REQUIREMENTS[attained]
    diversity = (
        1.0 if required_contexts <= 0
        else min(1.0, independent_contexts / required_contexts)
    )

    raw = (
        C.CONFIDENCE_WEIGHT_SUFFICIENCY * sufficiency
        + C.CONFIDENCE_WEIGHT_VALIDATION * freshness
        + C.CONFIDENCE_WEIGHT_DIVERSITY * diversity
    )

    penalty = min(
        C.PENALTY_CAP,
        C.PENALTY_PER_AUTHENTICITY_CONCERN * max(0, authenticity_concerns)
        + (
            C.PENALTY_CALIBRATION_MISMATCH
            if calibration is ConfidenceCalibration.OVERCONFIDENT
            else 0.0
        )
        # ADR-003: knowledge can cast doubt on validated work, never prove it.
        + (C.PENALTY_KNOWLEDGE_CONTRADICTION if knowledge_contradiction else 0.0),
    )

    score = raw * (1.0 - penalty)

    if not manager_validated:
        score = min(score, C.UNVALIDATED_CONFIDENCE_CEILING)

    return max(0.0, min(1.0, score))


# --- Top-level scoring -----------------------------------------------------


def score_capability(
    items: Sequence[ScoredEvidence],
    *,
    capability_class: CapabilityClass,
    now: datetime,
    previous_attained: CapabilityLevel = CapabilityLevel.NOVICE,
    calibration: ConfidenceCalibration = ConfidenceCalibration.UNKNOWN,
    knowledge_mastery: float | None = None,
) -> CapabilityScore:
    """Score one (subject, capability) pair from its evidence history.

    previous_attained implements the D1 ratchet: attained_level is a historical
    fact and never falls on its own. When decayed evidence supports less than
    what was attained, the result flags revalidation instead of downgrading.
    """
    rationale: list[str] = []

    validated_items = [
        i for i in items if i.validation_status is ValidationStatus.VALIDATED
    ]
    applications = len({i.context_ref for i in validated_items})
    hl = half_life_days(capability_class, applications)

    validated_pts = sum(evidence_points(i, now=now, half_life=hl) for i in items)
    provisional_pts = provisional_points(items, now=now, half_life=hl)
    contexts = count_independent_contexts(items)
    has_exceptional = any(
        i.strength is EvidenceStrengthBand.EXCEPTIONAL
        and i.validation_status is ValidationStatus.VALIDATED
        for i in items
    )

    current_support = level_for(
        validated_pts, contexts, has_exceptional=has_exceptional
    )

    # D1 ratchet: attained never falls automatically.
    attained = (
        current_support
        if level_index(current_support) >= level_index(previous_attained)
        else previous_attained
    )

    manager_validated = bool(validated_items)
    last_validation = max((i.occurred_at for i in validated_items), default=None)
    days_since = (
        None if last_validation is None
        else (now - last_validation).total_seconds() / 86400.0
    )

    concerns = sum(i.authenticity_concerns for i in items)
    contradiction = is_knowledge_contradiction(knowledge_mastery, attained)
    confidence = state_confidence(
        validated_points=validated_pts,
        attained=attained,
        independent_contexts=contexts,
        days_since_last_validation=days_since,
        half_life=hl,
        authenticity_concerns=concerns,
        calibration=calibration,
        manager_validated=manager_validated,
        knowledge_contradiction=contradiction,
    )
    band = confidence_band(confidence)

    if not manager_validated:
        rationale.append(
            "No manager validation: confidence capped at "
            f"{C.UNVALIDATED_CONFIDENCE_CEILING:.2f} (D5)."
        )
    if level_index(current_support) < level_index(attained):
        rationale.append(
            f"Validated at {attained.value}; current evidence supports "
            f"{current_support.value}. Revalidation due, not a downgrade (D1)."
        )
    if contradiction:
        rationale.append(
            f"Validated at {attained.value} but measured knowledge is "
            f"{knowledge_mastery:.0%}: confidence reduced and a manager check is "
            "advised. Knowledge never changes the level (ADR-003)."
        )
    if provisional_pts > 0:
        rationale.append(
            f"{provisional_pts:.1f} points awaiting manager validation."
        )

    return CapabilityScore(
        validated_points=round(validated_pts, 4),
        provisional_points=round(provisional_pts, 4),
        independent_contexts=contexts,
        attained_level=attained,
        current_support_level=current_support,
        state_confidence=round(confidence, 4),
        confidence_band=band,
        half_life_days=round(hl, 2),
        revalidation_due=band is ConfidenceBand.REVALIDATION_DUE,
        rationale=rationale,
    )


# --- D2: aggregation -------------------------------------------------------


@dataclass(frozen=True)
class AggregateScore:
    """Aggregate capability state for a team, cohort, role or unit (D2).

    Deliberately has no average_level field. Levels are an ordinal scale, so a
    mean is undefined; and a mean hides the distribution that determines what
    intervention is needed.
    """

    subject_count: int
    validated_coverage: float
    nominal_coverage: float
    median_level: CapabilityLevel | None
    distribution: dict[str, int]
    critical_gap_count: int
    revalidation_due_count: int


@dataclass(frozen=True)
class SubjectState:
    """One subject's scored state, as input to aggregation."""

    attained_level: CapabilityLevel
    required_level: CapabilityLevel
    state_confidence: float
    manager_validated: bool
    revalidation_due: bool


def aggregate(states: Sequence[SubjectState]) -> AggregateScore:
    """Roll individual states up to a group (D2).

    validated_coverage is the headline: the share at-or-above required,
    manager-validated, and above the confidence floor. It is the strictest of
    the coverage figures by design - reporting the conservative number by
    default is what buys credibility (thesis 19).
    """
    n = len(states)
    if n == 0:
        return AggregateScore(
            subject_count=0,
            validated_coverage=0.0,
            nominal_coverage=0.0,
            median_level=None,
            distribution={level.value: 0 for level in LEVEL_ORDER},
            critical_gap_count=0,
            revalidation_due_count=0,
        )

    at_or_above = [
        s for s in states
        if level_index(s.attained_level) >= level_index(s.required_level)
    ]
    validated = [
        s for s in at_or_above
        if s.manager_validated and s.state_confidence >= C.COVERAGE_CONFIDENCE_FLOOR
    ]

    distribution = {level.value: 0 for level in LEVEL_ORDER}
    for s in states:
        distribution[s.attained_level.value] += 1

    # Median is legitimate for ordinal data; mean is not.
    median_idx = int(
        statistics.median_low([level_index(s.attained_level) for s in states])
    )

    critical = sum(
        1 for s in states
        if level_index(s.required_level) - level_index(s.attained_level)
        >= C.CRITICAL_GAP_THRESHOLD
    )

    return AggregateScore(
        subject_count=n,
        validated_coverage=round(len(validated) / n, 4),
        nominal_coverage=round(len(at_or_above) / n, 4),
        median_level=LEVEL_ORDER[median_idx],
        distribution=distribution,
        critical_gap_count=critical,
        revalidation_due_count=sum(1 for s in states if s.revalidation_due),
    )
