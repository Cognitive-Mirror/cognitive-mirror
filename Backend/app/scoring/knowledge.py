"""Knowledge signals from e-learns and assessments. Pure functions.

What this module may and may not claim is the whole design:

  * It estimates what a learner KNOWS about a capability.
  * It never moves attained_level. Knowing is not doing (CSM section 2, 7.1).
  * It CAN lower confidence, when validated workplace capability and measured
    knowledge flatly disagree. Assessments can cast doubt; only work can prove.

That asymmetry is deliberate. If high quiz scores could raise confidence, a
cohort that crams would look capable on the dashboard. If low quiz scores could
not lower it, a generous manager validation would go unchallenged.

Three rules about which attempt counts:

  * Checks and post-assessments use the FIRST attempt for mastery. A retake
    partly measures memory of the previous attempt's feedback. Retakes are
    still recorded and shown - they are just not the mastery estimate.
  * A pre-assessment's baseline is its first attempt, always.
  * Learning gain uses Hake's normalised gain, g = (post - pre) / (1 - pre),
    per instrument. Raw difference punishes people who started high: 0.9 -> 1.0
    is a full recovery of what was left to learn, not a 0.1 improvement.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import datetime
from statistics import fmean

from app.schemas.capability import CapabilityLevel
from app.schemas.learning import ActivityKind, AssessmentPhase, KnowingDoing
from app.scoring import constants as C


@dataclass(frozen=True)
class AttemptSummary:
    """One scored attempt, reduced to what knowledge scoring needs."""

    activity_id: str
    kind: ActivityKind
    phase: AssessmentPhase
    instrument_ref: str
    attempt_number: int
    score: float
    submitted_at: datetime


@dataclass(frozen=True)
class KnowledgeSnapshot:
    """Current knowledge estimate for one (learner, capability)."""

    mastery: float | None
    mastery_source: str            # post_assessment | knowledge_checks | pre_assessment | none
    check_mastery: float | None
    pre_score: float | None
    post_score: float | None
    normalized_gain: float | None
    activities_completed: int
    retakes: int
    sources: list[str] = field(default_factory=list)


def _first_attempts(attempts: Sequence[AttemptSummary]) -> dict[str, AttemptSummary]:
    first: dict[str, AttemptSummary] = {}
    for a in sorted(attempts, key=lambda x: (x.attempt_number, x.submitted_at)):
        first.setdefault(a.activity_id, a)
    return first


def normalized_gain(pre: float, post: float) -> float | None:
    """Hake's g. None when the pre-score left nothing to learn."""
    headroom = 1.0 - pre
    if headroom <= 1e-9:
        return None
    return max(-1.0, min(1.0, (post - pre) / headroom))


def knowledge_snapshot(attempts: Sequence[AttemptSummary]) -> KnowledgeSnapshot:
    first = _first_attempts(attempts)
    retakes = sum(1 for a in attempts if a.attempt_number > 1)

    checks = [a.score for a in first.values() if a.kind is ActivityKind.ELEARN]
    check_mastery = fmean(checks) if checks else None

    by_instrument: dict[str, dict[AssessmentPhase, float]] = defaultdict(dict)
    for a in first.values():
        if a.kind is ActivityKind.ASSESSMENT and a.phase in (
            AssessmentPhase.PRE, AssessmentPhase.POST
        ):
            key = a.instrument_ref or a.activity_id
            by_instrument[key][a.phase] = a.score

    pres = [p[AssessmentPhase.PRE] for p in by_instrument.values() if AssessmentPhase.PRE in p]
    posts = [p[AssessmentPhase.POST] for p in by_instrument.values() if AssessmentPhase.POST in p]
    gains = [
        g for p in by_instrument.values()
        if AssessmentPhase.PRE in p and AssessmentPhase.POST in p
        and (g := normalized_gain(p[AssessmentPhase.PRE], p[AssessmentPhase.POST])) is not None
    ]

    pre_score = fmean(pres) if pres else None
    post_score = fmean(posts) if posts else None

    # Best available estimate of CURRENT knowledge: a post-assessment is a
    # purpose-built instrument taken after learning; checks are embedded and
    # low-stakes; a pre-score is a baseline and is used only when nothing else
    # exists.
    if post_score is not None:
        mastery, source = post_score, "post_assessment"
    elif check_mastery is not None:
        mastery, source = check_mastery, "knowledge_checks"
    elif pre_score is not None:
        mastery, source = pre_score, "pre_assessment"
    else:
        mastery, source = None, "none"

    sources = []
    if pres:
        sources.append("pre_assessment")
    if checks:
        sources.append("knowledge_checks")
    if posts:
        sources.append("post_assessment")

    return KnowledgeSnapshot(
        mastery=None if mastery is None else round(mastery, 4),
        mastery_source=source,
        check_mastery=None if check_mastery is None else round(check_mastery, 4),
        pre_score=None if pre_score is None else round(pre_score, 4),
        post_score=None if post_score is None else round(post_score, 4),
        normalized_gain=round(fmean(gains), 4) if gains else None,
        activities_completed=len(first),
        retakes=retakes,
        sources=sources,
    )


def _level_at_least(level: CapabilityLevel, floor: CapabilityLevel) -> bool:
    order = list(CapabilityLevel)
    return order.index(level) >= order.index(floor)


def is_knowledge_contradiction(
    mastery: float | None, attained: CapabilityLevel
) -> bool:
    """Validated at work at a substantive level, but knowledge measures low."""
    return (
        mastery is not None
        and mastery < C.KNOWLEDGE_MASTERY_LOW
        and _level_at_least(attained, C.KNOWLEDGE_CONTRADICTION_MIN_LEVEL)
    )


def knowing_doing(mastery: float | None, attained: CapabilityLevel) -> KnowingDoing:
    """Classify the relationship between knowledge and validated application."""
    applied = attained is not CapabilityLevel.NOVICE
    if mastery is None:
        return KnowingDoing.INSUFFICIENT_DATA
    if is_knowledge_contradiction(mastery, attained):
        return KnowingDoing.APPLIED_WITHOUT_KNOWLEDGE
    if applied:
        return KnowingDoing.ALIGNED
    if mastery >= C.KNOWLEDGE_MASTERY_HIGH:
        return KnowingDoing.KNOWS_NOT_APPLIED
    return KnowingDoing.DEVELOPING


__all__ = [
    "AttemptSummary",
    "KnowledgeSnapshot",
    "is_knowledge_contradiction",
    "knowing_doing",
    "knowledge_snapshot",
    "normalized_gain",
]
