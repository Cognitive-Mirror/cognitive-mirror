"""Evidence submission, AI review and manager validation endpoints (Phase 2).

Every route is authenticated. Every route is tenant-scoped: `tenant_id` is
taken from the verified token, never from the request body, so a caller cannot
read or write another tenant's data by editing a payload (thesis 24).
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
from app.auth import verify_token
from app.database import get_db
from app.models import Capability, Evidence, EvidenceReview
from app.schemas.capability import SignalSource, ValidationStatus
from app.schemas.evidence import EvidenceStrengthBand, EvidenceType
from app.schemas.review import ReviewDecision

router = APIRouter(prefix="/evidence", tags=["evidence"])


def tenant_of(token: dict) -> str:
    """Resolve the tenant from verified token claims.

    Falls back to a single default tenant until multi-tenant provisioning
    exists. It must never be read from the request body.
    """
    return token.get("tenant_id") or token.get("tenant") or "default"


def subject_of(token: dict) -> str:
    uid = token.get("uid") or token.get("sub")
    if not uid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token carries no subject.",
        )
    return str(uid)


# --- Request / response models --------------------------------------------


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
    # Grounding. A review with grounded=False or no citations is an ungrounded
    # opinion and the UI must present it as one (thesis 23).
    grounded: bool = False
    rubric_citations: list[str] = []
    structured_method: str = ""


class EvidenceSubmitResponse(BaseModel):
    evidence_id: str
    validation_status: ValidationStatus
    review: EvidenceReviewResponse
    capability_state: "CapabilityStateResponse"


class CapabilityStateResponse(BaseModel):
    capability_id: str
    capability_name: str = ""
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


class ValidationRequest(BaseModel):
    decision: ReviewDecision
    strength: EvidenceStrengthBand = Field(
        description="The manager's own strength judgement. Overrides the AI review."
    )
    observed_in_work: bool | None = None
    applied_independently: bool | None = None
    feedback: str = ""


def _state_response(record, capability_name: str = "") -> CapabilityStateResponse:
    return CapabilityStateResponse(
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


# --- Routes ----------------------------------------------------------------


@router.post("", response_model=EvidenceSubmitResponse, status_code=201)
async def submit_evidence(
    payload: EvidenceSubmitRequest,
    token: dict = Depends(verify_token),
    session: AsyncSession = Depends(get_db),
) -> EvidenceSubmitResponse:
    """Submit workplace evidence and run AI review.

    The submission is stored with status PENDING. It contributes zero points to
    capability state until a manager validates it (thesis 17) - the response
    shows it under `provisional_points`.
    """
    tenant_id = tenant_of(token)
    learner_id = subject_of(token)

    capability = (
        await session.execute(
            select(Capability).where(
                Capability.id == payload.capability_id,
                Capability.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if capability is None:
        raise HTTPException(status_code=404, detail="Capability not found.")

    evidence = Evidence(
        tenant_id=tenant_id,
        learner_id=learner_id,
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

    review_row = await run_ai_review(session, evidence, capability)

    record = await recompute_capability_state(
        session,
        tenant_id=tenant_id,
        learner_id=learner_id,
        capability_id=capability.id,
        triggered_by=SignalSource.EVIDENCE,
        actor_id=learner_id,
        reason=f"Evidence {evidence.id} submitted and AI-reviewed.",
        evidence_id=evidence.id,
    )

    return EvidenceSubmitResponse(
        evidence_id=evidence.id,
        validation_status=evidence.validation_status,
        review=EvidenceReviewResponse(
            summary=review_row.summary,
            strength=review_row.strength,
            ai_confidence=review_row.ai_confidence,
            concerns=[c for c in review_row.concerns.split("\n") if c],
            recommendation=review_row.recommendation,
            requires_human_review=review_row.requires_human_review,
            model_name=review_row.model_name,
            prompt_version=review_row.prompt_version,
            grounded=review_row.grounded,
            rubric_citations=[
                c for c in review_row.rubric_citations.split(",") if c
            ],
            structured_method=review_row.structured_method,
        ),
        capability_state=_state_response(record, capability.name),
    )


@router.get("/pending", response_model=list[dict])
async def list_pending_validation(
    token: dict = Depends(verify_token),
    session: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Evidence awaiting manager validation, with the AI brief attached."""
    tenant_id = tenant_of(token)

    rows = (
        await session.execute(
            select(Evidence, EvidenceReview)
            .outerjoin(EvidenceReview, EvidenceReview.evidence_id == Evidence.id)
            .where(
                Evidence.tenant_id == tenant_id,
                Evidence.validation_status == ValidationStatus.PENDING,
            )
            .order_by(Evidence.created_at.desc())
        )
    ).all()

    return [
        {
            "evidence_id": ev.id,
            "learner_id": ev.learner_id,
            "capability_id": ev.capability_id,
            "title": ev.title,
            "context_ref": ev.context_ref,
            "occurred_at": ev.occurred_at.isoformat(),
            "ai_summary": rv.summary if rv else "",
            "ai_strength": str(rv.strength) if rv else None,
            "ai_confidence": rv.ai_confidence if rv else None,
            "concerns": [c for c in (rv.concerns.split("\n") if rv else []) if c],
            "requires_human_review": rv.requires_human_review if rv else True,
            "ai_generated": bool(rv and not rv.model_name.startswith("fallback")),
            "grounded": bool(rv and rv.grounded),
            "rubric_citations": [
                c for c in (rv.rubric_citations.split(",") if rv else []) if c
            ],
        }
        for ev, rv in rows
    ]


@router.post("/{evidence_id}/validate", response_model=CapabilityStateResponse)
async def validate_evidence(
    evidence_id: str,
    payload: ValidationRequest,
    token: dict = Depends(verify_token),
    session: AsyncSession = Depends(get_db),
) -> CapabilityStateResponse:
    """Record a manager decision. The only path that can move attained_level."""
    tenant_id = tenant_of(token)
    manager_id = subject_of(token)

    evidence = (
        await session.execute(
            select(Evidence).where(
                Evidence.id == evidence_id, Evidence.tenant_id == tenant_id
            )
        )
    ).scalar_one_or_none()
    if evidence is None:
        raise HTTPException(status_code=404, detail="Evidence not found.")

    if evidence.learner_id == manager_id:
        # Self-validation would make the platform self-reported (thesis 17).
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Evidence cannot be validated by the learner who submitted it.",
        )

    _, record = await record_manager_validation(
        session,
        evidence=evidence,
        manager_id=manager_id,
        decision=payload.decision,
        strength=payload.strength,
        observed_in_work=payload.observed_in_work,
        applied_independently=payload.applied_independently,
        feedback=payload.feedback,
    )

    capability = (
        await session.execute(
            select(Capability).where(Capability.id == record.capability_id)
        )
    ).scalar_one_or_none()

    return _state_response(record, capability.name if capability else "")
