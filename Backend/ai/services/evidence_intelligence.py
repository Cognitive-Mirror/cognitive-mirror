"""Evidence intelligence service.

Orchestrates the Phase 2 loop:

    submit evidence -> AI review -> manager validation -> capability state update

The division of responsibility is the point:

  * the graph (ai/graphs/evidence_review) produces advice,
  * the scoring engine (app/scoring/engine) is a pure function of the evidence,
  * this service is the only place that writes state, and it writes an audit
    event for every change (Update Rule 6).

AI never moves attained_level. Only a ManagerValidation can (Update Rule 1).
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ai.graphs.evidence_review import get_evidence_review_graph
from app.models import (
    Capability,
    CapabilityStateEvent,
    CapabilityStateRecord,
    Evidence,
    EvidenceReview,
    ManagerValidation,
)
from app.schemas.capability import (
    CapabilityLevel,
    CapabilityStatus,
    RequiredLevelSource,
    SignalSource,
    SubjectType,
    ValidationStatus,
)
from app.schemas.evidence import EvidenceStrengthBand
from app.schemas.review import ReviewDecision
from app.scoring import constants as C
from app.services.requirement_resolver import resolve_required_level
from app.scoring.engine import (
    ScoredEvidence,
    apply_step_limit,
    level_index,
    score_capability,
)

logger = logging.getLogger(__name__)

# Manager decisions that count as validated evidence.
_VALIDATING_DECISIONS = {ReviewDecision.APPROVED}


async def run_ai_review(
    session: AsyncSession,
    evidence: Evidence,
    capability: Capability,
) -> EvidenceReview:
    """Run the evidence review graph and persist its structured output.

    Advisory only. The stored row records which prompt version and model
    produced it so the output can be audited later (thesis 22, 23).
    """
    graph = get_evidence_review_graph()
    state = graph.invoke(
        {
            "tenant_id": evidence.tenant_id,
            "evidence_id": evidence.id,
            "learner_id": evidence.learner_id,
            "capability_id": evidence.capability_id,
            "capability_name": capability.name,
            "evidence_type": str(evidence.evidence_type),
            "title": evidence.title,
            "content": evidence.content,
            "context": evidence.context,
        }
    )

    output = state["review"]
    concerns = list(output.concerns) + list(state.get("guardrail_notes", []))

    row = EvidenceReview(
        tenant_id=evidence.tenant_id,
        evidence_id=evidence.id,
        summary=output.summary,
        evidence_type_detected=output.evidence_type_detected,
        strength=output.strength,
        ai_confidence=output.confidence,
        concerns="\n".join(concerns),
        authenticity_concern_count=len(concerns),
        recommendation=output.recommendation,
        reasoning=output.reasoning,
        requires_human_review=output.requires_human_review,
        prompt_name=state.get("prompt_name", ""),
        prompt_version=state.get("prompt_version", ""),
        model_name=(
            "fallback:deterministic" if state.get("used_fallback")
            else state.get("model_name", "")
        ),
    )
    session.add(row)
    await session.flush()
    return row


async def _load_scored_evidence(
    session: AsyncSession,
    *,
    tenant_id: str,
    learner_id: str,
    capability_id: str,
) -> list[ScoredEvidence]:
    """Build scoring input from the full evidence history.

    Strength comes from the manager where one has ruled, otherwise from the AI
    review. That ordering is the trust anchor: a human judgement always
    supersedes the model's (thesis 17).
    """
    rows = (
        await session.execute(
            select(Evidence).where(
                Evidence.tenant_id == tenant_id,
                Evidence.learner_id == learner_id,
                Evidence.capability_id == capability_id,
            )
        )
    ).scalars().all()

    scored: list[ScoredEvidence] = []
    for item in rows:
        validation = (
            await session.execute(
                select(ManagerValidation)
                .where(ManagerValidation.evidence_id == item.id)
                .order_by(ManagerValidation.decided_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()

        ai_review = (
            await session.execute(
                select(EvidenceReview).where(EvidenceReview.evidence_id == item.id)
            )
        ).scalar_one_or_none()

        if validation is not None:
            strength = validation.strength
        elif ai_review is not None:
            strength = ai_review.strength
        else:
            strength = EvidenceStrengthBand.WEAK

        scored.append(
            ScoredEvidence(
                evidence_id=item.id,
                strength=strength,
                validation_status=item.validation_status,
                occurred_at=item.occurred_at,
                context_ref=item.context_ref or item.id,
                authenticity_concerns=(
                    ai_review.authenticity_concern_count if ai_review else 0
                ),
            )
        )
    return scored


async def recompute_capability_state(
    session: AsyncSession,
    *,
    tenant_id: str,
    learner_id: str,
    capability_id: str,
    triggered_by: SignalSource,
    actor_id: str | None,
    reason: str,
    evidence_id: str | None = None,
) -> CapabilityStateRecord:
    """Recompute and persist capability state, writing an audit event.

    The scoring engine is a pure function of the evidence history, so this can
    be re-run at any time - after a validation, on a schedule to apply decay,
    or to replay a recalibration (CSM section 11).
    """
    capability = (
        await session.execute(
            select(Capability).where(Capability.id == capability_id)
        )
    ).scalar_one()

    record = (
        await session.execute(
            select(CapabilityStateRecord).where(
                CapabilityStateRecord.tenant_id == tenant_id,
                CapabilityStateRecord.subject_id == learner_id,
                CapabilityStateRecord.subject_type == SubjectType.LEARNER,
                CapabilityStateRecord.capability_id == capability_id,
            )
        )
    ).scalar_one_or_none()

    previous_level = record.attained_level if record else CapabilityLevel.NOVICE
    previous_confidence = record.state_confidence if record else 0.0

    items = await _load_scored_evidence(
        session,
        tenant_id=tenant_id,
        learner_id=learner_id,
        capability_id=capability_id,
    )
    score = score_capability(
        items,
        capability_class=capability.capability_class,
        now=datetime.now(UTC),
        previous_attained=previous_level,
    )

    # Update Rule 2 belongs to the transition, not to the recompute.
    attained, cap_note = apply_step_limit(previous_level, score.attained_level)
    if cap_note:
        reason = f"{reason} {cap_note}"

    # D6: required_level is resolved through the three layers, with provenance.
    requirement = await resolve_required_level(
        session,
        tenant_id=tenant_id,
        capability_id=capability_id,
        subject_id=learner_id,
    )

    if record is None:
        # Column defaults only apply at INSERT, and _next_action reads these
        # fields before the flush, so set them explicitly here.
        record = CapabilityStateRecord(
            tenant_id=tenant_id,
            capability_id=capability_id,
            subject_type=SubjectType.LEARNER,
            subject_id=learner_id,
            attained_level=CapabilityLevel.NOVICE,
            current_support_level=CapabilityLevel.NOVICE,
            status=CapabilityStatus.NOT_STARTED,
        )
        session.add(record)

    record.required_level = requirement.level
    record.required_level_source = requirement.source

    record.attained_level = attained
    record.current_support_level = score.current_support_level
    record.validated_points = score.validated_points
    record.provisional_points = score.provisional_points
    record.independent_contexts = score.independent_contexts
    record.half_life_days = score.half_life_days
    record.state_confidence = score.state_confidence
    record.confidence_band = score.confidence_band
    record.scoring_model_version = score.scoring_model_version

    if score.revalidation_due and attained is not CapabilityLevel.NOVICE:
        record.status = CapabilityStatus.REVALIDATION_DUE
    elif attained is CapabilityLevel.NOVICE and not items:
        record.status = CapabilityStatus.NOT_STARTED
    elif score.validated_points > 0:
        record.status = CapabilityStatus.VALIDATED
    else:
        record.status = CapabilityStatus.UNDER_REVIEW

    record.recommended_next_action = _next_action(score, record)

    # Update Rule 6: append-only history. Never overwrite.
    session.add(
        CapabilityStateEvent(
            tenant_id=tenant_id,
            capability_id=capability_id,
            subject_type=SubjectType.LEARNER,
            subject_id=learner_id,
            previous_level=previous_level,
            new_level=attained,
            previous_confidence=previous_confidence,
            new_confidence=score.state_confidence,
            triggered_by=triggered_by,
            actor_id=actor_id,
            evidence_id=evidence_id,
            reason=reason or "state recomputed",
            scoring_model_version=score.scoring_model_version,
        )
    )
    await session.flush()
    return record


def _next_action(score, record: CapabilityStateRecord) -> str:
    """Recommend the next capability-movement action (thesis 18).

    Never "recommend content" - the thesis is explicit that the output must be
    the next action that moves capability.
    """
    if score.provisional_points > 0:
        return "Awaiting manager validation of submitted evidence."
    if score.revalidation_due and record.attained_level is not CapabilityLevel.NOVICE:
        return (
            f"Revalidation due: last validated at {record.attained_level.value}, "
            "current evidence supports less. Arrange a manager check-in."
        )
    if score.independent_contexts < C.LEVEL_CONTEXT_REQUIREMENTS.get(
        record.required_level, 0
    ):
        return (
            "Apply this capability in a different workplace context to "
            "demonstrate transfer."
        )
    if level_index(record.attained_level) < level_index(record.required_level):
        return "Submit workplace evidence for the next level."
    return "At required level. Maintain through continued application."


async def record_manager_validation(
    session: AsyncSession,
    *,
    evidence: Evidence,
    manager_id: str,
    decision: ReviewDecision,
    strength: EvidenceStrengthBand,
    observed_in_work: bool | None,
    applied_independently: bool | None,
    feedback: str,
) -> tuple[ManagerValidation, CapabilityStateRecord]:
    """Record the manager decision and recompute state.

    This is the only path that can move attained_level (Update Rule 1).
    """
    ai_review = (
        await session.execute(
            select(EvidenceReview).where(EvidenceReview.evidence_id == evidence.id)
        )
    ).scalar_one_or_none()

    # Section 11: manager override rate is the primary calibration signal.
    overrode = bool(ai_review is not None and ai_review.strength != strength)

    validation = ManagerValidation(
        tenant_id=evidence.tenant_id,
        evidence_id=evidence.id,
        manager_id=manager_id,
        decision=decision,
        strength=strength,
        observed_in_work=observed_in_work,
        applied_independently=applied_independently,
        feedback=feedback,
        overrode_ai=overrode,
        decided_at=datetime.now(UTC),
    )
    session.add(validation)

    if decision in _VALIDATING_DECISIONS:
        evidence.validation_status = ValidationStatus.VALIDATED
    elif decision is ReviewDecision.REJECTED:
        evidence.validation_status = ValidationStatus.REJECTED
    elif decision is ReviewDecision.ESCALATED:
        evidence.validation_status = ValidationStatus.DISPUTED
    else:
        evidence.validation_status = ValidationStatus.PENDING

    await session.flush()

    reason = f"Manager {decision.value} evidence {evidence.id}."
    if overrode:
        reason += (
            f" Manager strength {strength.value} overrode AI "
            f"{ai_review.strength.value}."
        )

    record = await recompute_capability_state(
        session,
        tenant_id=evidence.tenant_id,
        learner_id=evidence.learner_id,
        capability_id=evidence.capability_id,
        triggered_by=SignalSource.MANAGER_VALIDATION,
        actor_id=manager_id,
        reason=reason,
        evidence_id=evidence.id,
    )
    if decision in _VALIDATING_DECISIONS:
        record.last_validated_at = validation.decided_at

    return validation, record
