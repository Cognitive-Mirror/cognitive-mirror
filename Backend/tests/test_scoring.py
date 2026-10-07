"""Tests for the Capability State Model scoring engine.

These are not incidental unit tests. Each one pins a decision from section 9 of
Docs/Architecture/Capability_State_Model.md, so that a future change to the
constants cannot silently break a governance commitment.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.schemas.capability import (
    CapabilityClass,
    CapabilityLevel,
    ConfidenceBand,
    ConfidenceCalibration,
    ValidationStatus,
)
from app.schemas.evidence import EvidenceStrengthBand as Strength
from app.scoring import constants as C
from app.scoring.engine import (
    ScoredEvidence,
    SubjectState,
    aggregate,
    apply_step_limit,
    count_independent_contexts,
    decay_weight,
    half_life_days,
    level_for,
    score_capability,
    state_confidence,
)

NOW = datetime(2026, 9, 6, tzinfo=UTC)


def ev(
    eid: str,
    strength: Strength = Strength.STRONG,
    status: ValidationStatus = ValidationStatus.VALIDATED,
    days_ago: int = 0,
    context: str = "proj-a",
    concerns: int = 0,
) -> ScoredEvidence:
    return ScoredEvidence(
        evidence_id=eid,
        strength=strength,
        validation_status=status,
        occurred_at=NOW - timedelta(days=days_ago),
        context_ref=context,
        authenticity_concerns=concerns,
    )


# --- D1: decay -------------------------------------------------------------


class TestD1Decay:
    def test_weight_is_one_at_zero_age(self):
        assert decay_weight(0, 180) == pytest.approx(1.0)

    def test_weight_halves_at_one_half_life(self):
        assert decay_weight(180, 180) == pytest.approx(0.5)

    def test_weight_quarters_at_two_half_lives(self):
        assert decay_weight(360, 180) == pytest.approx(0.25)

    def test_weight_never_falls_below_floor(self):
        """A validated past demonstration never becomes worth nothing."""
        assert decay_weight(100_000, 180) == C.DECAY_FLOOR

    def test_procedural_retains_longer_than_interpersonal(self):
        """The ORDERING is the claim; the numbers are seeded placeholders."""
        proc = half_life_days(CapabilityClass.PROCEDURAL, 0)
        anal = half_life_days(CapabilityClass.ANALYTICAL, 0)
        inter = half_life_days(CapabilityClass.INTERPERSONAL, 0)
        assert proc > anal > inter

    def test_reinforcement_extends_half_life_with_diminishing_returns(self):
        base = half_life_days(CapabilityClass.ANALYTICAL, 0)
        one = half_life_days(CapabilityClass.ANALYTICAL, 1)
        two = half_life_days(CapabilityClass.ANALYTICAL, 2)
        ten = half_life_days(CapabilityClass.ANALYTICAL, 10)
        assert base < one < two < ten
        # Diminishing: the 2nd application adds more than the 10th.
        assert (two - one) > (ten - half_life_days(CapabilityClass.ANALYTICAL, 9))

    def test_attained_level_never_falls_on_its_own(self):
        """THE core D1 commitment: absence of evidence is not evidence of decline."""
        stale = [
            ev("e1", days_ago=1100, context="a"),
            ev("e2", days_ago=1160, context="b"),
            ev("e3", days_ago=1220, context="c"),
        ]
        result = score_capability(
            stale,
            capability_class=CapabilityClass.ANALYTICAL,
            now=NOW,
            previous_attained=CapabilityLevel.COMPETENT,
        )
        assert result.attained_level is CapabilityLevel.COMPETENT
        assert result.current_support_level is CapabilityLevel.NOVICE
        assert result.revalidation_due is True
        assert any("Revalidation due" in r for r in result.rationale)


# --- D3: evidence points ---------------------------------------------------


class TestD3Points:
    def test_weak_evidence_is_worth_exactly_zero(self):
        """Thesis 16.2: unobservable submissions are not evidence, however many."""
        items = [ev(f"e{i}", strength=Strength.WEAK, context=f"c{i}") for i in range(20)]
        result = score_capability(
            items, capability_class=CapabilityClass.ANALYTICAL, now=NOW
        )
        assert result.validated_points == 0.0
        assert result.attained_level is CapabilityLevel.NOVICE

    def test_unvalidated_evidence_contributes_no_points(self):
        """The trust anchor as arithmetic (thesis 17)."""
        items = [
            ev("e1", status=ValidationStatus.PENDING, context="a"),
            ev("e2", status=ValidationStatus.REJECTED, context="b"),
            ev("e3", status=ValidationStatus.DISPUTED, context="c"),
        ]
        result = score_capability(
            items, capability_class=CapabilityClass.ANALYTICAL, now=NOW
        )
        assert result.validated_points == 0.0

    def test_pending_evidence_is_reported_separately(self):
        items = [ev("e1", status=ValidationStatus.PENDING, days_ago=0)]
        result = score_capability(
            items, capability_class=CapabilityClass.ANALYTICAL, now=NOW
        )
        assert result.validated_points == 0.0
        assert result.provisional_points > 0.0

    def test_older_evidence_is_worth_less_than_recent(self):
        recent = score_capability(
            [ev("e1", days_ago=1)],
            capability_class=CapabilityClass.ANALYTICAL,
            now=NOW,
        )
        old = score_capability(
            [ev("e1", days_ago=400)],
            capability_class=CapabilityClass.ANALYTICAL,
            now=NOW,
        )
        assert recent.validated_points > old.validated_points


# --- D4: progression and independence --------------------------------------


class TestD4Progression:
    def test_same_context_items_are_not_independent(self):
        """Three items from one project week are one demonstration."""
        items = [
            ev("e1", days_ago=0, context="proj-a"),
            ev("e2", days_ago=1, context="proj-a"),
            ev("e3", days_ago=2, context="proj-a"),
        ]
        assert count_independent_contexts(items) == 1

    def test_items_within_the_window_are_not_independent(self):
        """Different context but too close in time still fails independence."""
        items = [
            ev("e1", days_ago=0, context="proj-a"),
            ev("e2", days_ago=C.INDEPENDENCE_WINDOW_DAYS - 1, context="proj-b"),
        ]
        assert count_independent_contexts(items) == 1

    def test_distinct_contexts_far_apart_are_independent(self):
        items = [
            ev("e1", days_ago=0, context="proj-a"),
            ev("e2", days_ago=30, context="proj-b"),
            ev("e3", days_ago=60, context="proj-c"),
        ]
        assert count_independent_contexts(items) == 3

    def test_points_alone_cannot_promote_without_context_diversity(self):
        """Massive evidence from one context stays capped: no transfer proven."""
        level = level_for(100.0, contexts=1, has_exceptional=True)
        assert level is CapabilityLevel.DEVELOPING

    def test_contexts_alone_cannot_promote_without_points(self):
        assert level_for(0.5, contexts=10, has_exceptional=True) is CapabilityLevel.NOVICE

    def test_expert_requires_an_exceptional_item(self):
        without = level_for(100.0, contexts=10, has_exceptional=False)
        with_exc = level_for(100.0, contexts=10, has_exceptional=True)
        assert without is CapabilityLevel.PROFICIENT
        assert with_exc is CapabilityLevel.EXPERT

    def test_step_limit_blocks_multi_level_jumps_on_transition(self):
        capped, note = apply_step_limit(CapabilityLevel.NOVICE, CapabilityLevel.EXPERT)
        assert capped is CapabilityLevel.DEVELOPING
        assert note is not None

    def test_step_limit_allows_single_level_advance(self):
        result, note = apply_step_limit(
            CapabilityLevel.COMPETENT, CapabilityLevel.PROFICIENT
        )
        assert result is CapabilityLevel.PROFICIENT
        assert note is None


# --- D5: confidence --------------------------------------------------------


class TestD5Confidence:
    def test_unvalidated_confidence_cannot_exceed_the_ceiling(self):
        """THE governance test.

        No volume of unvalidated signal may make the system confident. If this
        test ever fails, the platform has become a self-reported training system
        (thesis 17) and the ceiling must be restored before shipping.
        """
        score = state_confidence(
            validated_points=9999.0,
            attained=CapabilityLevel.EXPERT,
            independent_contexts=999,
            days_since_last_validation=0.0,
            half_life=180.0,
            authenticity_concerns=0,
            calibration=ConfidenceCalibration.CALIBRATED,
            manager_validated=False,
        )
        assert score <= C.UNVALIDATED_CONFIDENCE_CEILING

    def test_unvalidated_state_can_never_reach_coverage_floor(self):
        """Validated coverage (D2) is unreachable without a human."""
        assert C.UNVALIDATED_CONFIDENCE_CEILING < C.COVERAGE_CONFIDENCE_FLOOR

    def test_authenticity_concerns_reduce_confidence(self):
        kwargs = dict(
            validated_points=10.0,
            attained=CapabilityLevel.COMPETENT,
            independent_contexts=3,
            days_since_last_validation=1.0,
            half_life=180.0,
            calibration=ConfidenceCalibration.CALIBRATED,
            manager_validated=True,
        )
        clean = state_confidence(authenticity_concerns=0, **kwargs)
        flagged = state_confidence(authenticity_concerns=2, **kwargs)
        assert flagged < clean

    def test_overconfidence_lowers_confidence_not_level(self):
        """Calibration mismatch means our estimate is shakier, not that they are worse."""
        items = [
            ev("e1", days_ago=0, context="a"),
            ev("e2", days_ago=30, context="b"),
            ev("e3", days_ago=60, context="c"),
        ]
        calibrated = score_capability(
            items,
            capability_class=CapabilityClass.ANALYTICAL,
            now=NOW,
            calibration=ConfidenceCalibration.CALIBRATED,
        )
        overconfident = score_capability(
            items,
            capability_class=CapabilityClass.ANALYTICAL,
            now=NOW,
            calibration=ConfidenceCalibration.OVERCONFIDENT,
        )
        assert overconfident.state_confidence < calibrated.state_confidence
        assert overconfident.attained_level is calibrated.attained_level

    def test_bands_are_ordered_and_cover_the_range(self):
        assert (
            C.REVALIDATION_THRESHOLD
            <= C.CONFIDENCE_LOW
            < C.CONFIDENCE_MODERATE
            < C.CONFIDENCE_HIGH
            <= 1.0
        )

    def test_stale_validation_lands_in_revalidation_band(self):
        result = score_capability(
            [ev("e1", days_ago=2000, context="a")],
            capability_class=CapabilityClass.INTERPERSONAL,
            now=NOW,
            previous_attained=CapabilityLevel.COMPETENT,
        )
        assert result.confidence_band is ConfidenceBand.REVALIDATION_DUE


# --- D2: aggregation -------------------------------------------------------


class TestD2Aggregation:
    def test_aggregate_exposes_no_average_level(self):
        """Averaging an ordinal scale is undefined; the field must not exist."""
        result = aggregate([])
        assert not hasattr(result, "average_level")
        assert not hasattr(result, "mean_level")

    def test_distribution_is_preserved_not_collapsed(self):
        """Uniform and bimodal teams must be distinguishable."""
        uniform = [
            SubjectState(
                CapabilityLevel.COMPETENT, CapabilityLevel.COMPETENT, 0.9, True, False
            )
            for _ in range(4)
        ]
        bimodal = [
            SubjectState(
                CapabilityLevel.NOVICE, CapabilityLevel.COMPETENT, 0.9, True, False
            ),
            SubjectState(
                CapabilityLevel.NOVICE, CapabilityLevel.COMPETENT, 0.9, True, False
            ),
            SubjectState(
                CapabilityLevel.EXPERT, CapabilityLevel.COMPETENT, 0.9, True, False
            ),
            SubjectState(
                CapabilityLevel.EXPERT, CapabilityLevel.COMPETENT, 0.9, True, False
            ),
        ]
        assert aggregate(uniform).distribution != aggregate(bimodal).distribution

    def test_validated_coverage_is_stricter_than_nominal(self):
        states = [
            # At level but low confidence -> counts nominally, not as validated.
            SubjectState(
                CapabilityLevel.COMPETENT, CapabilityLevel.COMPETENT, 0.30, True, True
            ),
            SubjectState(
                CapabilityLevel.COMPETENT, CapabilityLevel.COMPETENT, 0.90, True, False
            ),
        ]
        result = aggregate(states)
        assert result.nominal_coverage == 1.0
        assert result.validated_coverage == 0.5

    def test_unvalidated_subjects_never_count_toward_validated_coverage(self):
        states = [
            SubjectState(
                CapabilityLevel.EXPERT, CapabilityLevel.NOVICE, 0.99, False, False
            )
        ]
        assert aggregate(states).validated_coverage == 0.0

    def test_critical_gap_counts_two_or_more_levels_short(self):
        states = [
            SubjectState(
                CapabilityLevel.NOVICE, CapabilityLevel.PROFICIENT, 0.5, True, False
            ),
            SubjectState(
                CapabilityLevel.COMPETENT, CapabilityLevel.PROFICIENT, 0.5, True, False
            ),
        ]
        assert aggregate(states).critical_gap_count == 1

    def test_empty_group_is_safe(self):
        result = aggregate([])
        assert result.subject_count == 0
        assert result.median_level is None


# --- Cross-cutting ---------------------------------------------------------


def test_score_stamps_the_constants_version():
    """Section 11: recalibration must never silently rewrite history."""
    result = score_capability(
        [ev("e1")], capability_class=CapabilityClass.ANALYTICAL, now=NOW
    )
    assert result.scoring_model_version == C.SCORING_MODEL_VERSION


def test_no_evidence_yields_novice_and_low_confidence():
    result = score_capability(
        [], capability_class=CapabilityClass.ANALYTICAL, now=NOW
    )
    assert result.attained_level is CapabilityLevel.NOVICE
    assert result.state_confidence == 0.0
    assert result.revalidation_due is True
