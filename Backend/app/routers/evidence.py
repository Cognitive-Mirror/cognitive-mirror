"""Evidence submission, AI review and manager validation.

    learner submits  ->  AI review (advisory)  ->  manager validates  ->  state

Only a supervisor of the learner - their manager, or an admin - may see the
queue entry or validate it (thesis 17). Tenant and identity come from the
caller's `users` row, never from the request body (thesis 24).
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ai.services.evidence_intelligence import (
    recompute_capability_state,
    record_manager_validation,
    run_ai_review,
)
from app.auth import current_user, require_supervisor
from app.database import get_db
from app.models import Capability, CapabilityStateRecord, Evidence, EvidenceReview, Role, User
from app.schemas.capability import SignalSource, ValidationStatus
from app.schemas.evidence import EvidenceStrengthBand, EvidenceType
from app.schemas.review import ReviewDecision

router = APIRouter(prefix="/evidence", tags=["evidence"])


# --- Request / response models ---------------------------------------------


class EvidenceSubmitRequest(BaseModel):
    capability_id: str
    evidence_type: EvidenceType
    title: str = Field(min_length=3, max_length=200)
    content: str = Field(min_length=10)
    context: str = ""
    context_ref: str = Field(
        default="",
        description=(
            "The workplace situation this came from (project, client, incident). "
            "Independence for progression is judged on this."
        ),
    )
    occurred_at: datetime | None = Field(
        default=None, description="When the work happened. Defaults to now."
    )


class EvidenceReviewResponse(BaseModel):
    summary: str
    strength: EvidenceStrengthBand
    ai_confidence: float
    concerns: list[str]
    recommendation: str
    requires_human_review: bool
    model_name: str
    prompt_version: str
    # A review with grounded=False or no citations is an ungrounded opinion and
    # the UI must present it as one (thesis 23).
    grounded: bool
    rubric_citations: list[str]
    structured_method: str

    @classmethod
    def of(cls, row: EvidenceReview) -> EvidenceReviewResponse:
        return cls(
            summary=row.summary,
            strength=row.strength,
            ai_confidence=row.ai_confidence,
            concerns=row.concern_list,
            recommendation=row.recommendation,
            requires_human_review=row.requires_human_review,
            model_name=row.model_name,
            prompt_version=row.prompt_version,
            grounded=row.grounded,
            rubric_citations=row.citation_list,
            structured_method=row.structured_method,
        )


class CapabilityStateResponse(BaseModel):
    capability_id: str
    capability_name: str
    attained_level: str
    current_support_level: str
    required_level: str
    status: str
    state_confidence: float
    confidence_band: str
    validated_points: float
    provisional_points: float
    independent_contexts: int
    recommended_next_action: str
    scoring_model_version: str

    @classmethod
    def of(cls, record: CapabilityStateRecord, capability_name: str) -> CapabilityStateResponse:
        return cls(
            capability_id=record.capability_id,
            capability_name=capability_name,
            attained_level=str(record.attained_level),
            current_support_level=str(record.current_support_level),
            required_level=str(record.required_level),
            status=str(record.status),
            state_confidence=record.state_confidence,
            confidence_band=str(record.confidence_band),
            validated_points=record.validated_points,
            provisional_points=record.provisional_points,
            independent_contexts=record.independent_contexts,
            recommended_next_action=record.recommended_next_action,
            scoring_model_version=record.scoring_model_version,
        )


class EvidenceSubmitResponse(BaseModel):
    evidence_id: str
    validation_status: ValidationStatus
    review: EvidenceReviewResponse
    capability_state: CapabilityStateResponse


class PendingEvidence(BaseModel):
    evidence_id: str
    learner_id: str
    learner_name: str
    capability_id: str
    title: str
    content: str
    context: str
    context_ref: str
    occurred_at: datetime
    review: EvidenceReviewResponse | None
    # False when the deterministic fallback produced the review, not a model.
    ai_generated: bool


class ValidationRequest(BaseModel):
    decision: ReviewDecision
    strength: EvidenceStrengthBand = Field(
        description="The manager's own strength judgement. Overrides the AI review."
    )
    observed_in_work: bool | None = None
    applied_independently: bool | None = None
    feedback: str = ""


# --- Routes ----------------------------------------------------------------


@router.post("", response_model=EvidenceSubmitResponse, status_code=201)
async def submit_evidence(
    payload: EvidenceSubmitRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_db),
) -> EvidenceSubmitResponse:
    """Submit workplace evidence and run AI review.

    Stored as PENDING. It contributes zero validated points until a manager
    validates it (thesis 17); the response shows it under provisional_points.
    """
    capability = await session.scalar(
        select(Capability).where(
            Capability.id == payload.capability_id,
            Capability.tenant_id == user.tenant_id,
        )
    )
    if capability is None:
        raise HTTPException(status_code=404, detail="Capability not found.")

    evidence = Evidence(
        tenant_id=user.tenant_id,
        learner_id=user.id,
        capability_id=capability.id,
        evidence_type=payload.evidence_type,
        title=payload.title,
        content=payload.content,
        context=payload.context,
        context_ref=payload.context_ref,
        occurred_at=payload.occurred_at or datetime.now(UTC),
        validation_status=ValidationStatus.PENDING,
    )
    session.add(evidence)
    await session.flush()

    review = await run_ai_review(session, evidence, capability)
    record = await recompute_capability_state(
        session,
        tenant_id=user.tenant_id,
        learner_id=user.id,
        capability_id=capability.id,
        triggered_by=SignalSource.EVIDENCE,
        actor_id=user.id,
        reason=f"Evidence {evidence.id} submitted and AI-reviewed.",
        evidence_id=evidence.id,
    )

    return EvidenceSubmitResponse(
        evidence_id=evidence.id,
        validation_status=evidence.validation_status,
        review=EvidenceReviewResponse.of(review),
        capability_state=CapabilityStateResponse.of(record, capability.name),
    )


@router.get("/pending", response_model=list[PendingEvidence])
async def list_pending_validation(
    user: User = Depends(require_supervisor),
    session: AsyncSession = Depends(get_db),
) -> list[PendingEvidence]:
    """Evidence awaiting validation from people this user supervises."""
    query = (
        select(Evidence, EvidenceReview, User)
        .join(User, User.id == Evidence.learner_id)
        .outerjoin(EvidenceReview, EvidenceReview.evidence_id == Evidence.id)
        .where(
            Evidence.tenant_id == user.tenant_id,
            Evidence.validation_status == ValidationStatus.PENDING,
            Evidence.learner_id != user.id,
        )
        .order_by(Evidence.created_at.desc())
    )
    if user.role is not Role.ADMIN:
        query = query.where(User.manager_id == user.id)

    return [
        PendingEvidence(
            evidence_id=ev.id,
            learner_id=learner.id,
            learner_name=learner.display_name or learner.email,
            capability_id=ev.capability_id,
            title=ev.title,
            content=ev.content,
            context=ev.context,
            context_ref=ev.context_ref,
            occurred_at=ev.occurred_at,
            review=EvidenceReviewResponse.of(rv) if rv else None,
            ai_generated=bool(rv and rv.model_generated),
        )
        for ev, rv, learner in (await session.execute(query)).all()
    ]


@router.post("/{evidence_id}/validate", response_model=CapabilityStateResponse)
async def validate_evidence(
    evidence_id: str,
    payload: ValidationRequest,
    user: User = Depends(require_supervisor),
    session: AsyncSession = Depends(get_db),
) -> CapabilityStateResponse:
    """Record a manager decision. The only path that can move attained_level."""
    evidence = await session.scalar(
        select(Evidence).where(
            Evidence.id == evidence_id, Evidence.tenant_id == user.tenant_id
        )
    )
    if evidence is None:
        raise HTTPException(status_code=404, detail="Evidence not found.")

    learner = await session.get(User, evidence.learner_id)
    if learner is None or not user.can_supervise(learner):
        # Covers self-validation too, which would make the platform
        # self-reported (thesis 17).
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only this learner's manager or an admin may validate their evidence.",
        )

    _, record = await record_manager_validation(
        session,
        evidence=evidence,
        manager_id=user.id,
        decision=payload.decision,
        strength=payload.strength,
        observed_in_work=payload.observed_in_work,
        applied_independently=payload.applied_independently,
        feedback=payload.feedback,
    )
    capability = await session.get(Capability, record.capability_id)
    return CapabilityStateResponse.of(record, capability.name if capability else "")
