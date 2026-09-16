"""Evidence, AI review and manager validation.

The chain these three tables encode is the product:

    Evidence  ->  EvidenceReview (AI)  ->  ManagerValidation (human)

Only the last step can move capability state. The AI review is advisory and is
stored so that the manager can see what it said and so the output is auditable
later (thesis 16.3).
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import StrEnumType, TenantScoped, Timestamped, UTCDateTime, new_id
from app.schemas.capability import ValidationStatus
from app.schemas.evidence import EvidenceStrengthBand, EvidenceType
from app.schemas.review import ReviewDecision


class Evidence(Base, TenantScoped, Timestamped):
    """A learner submission claiming workplace application of a capability."""

    __tablename__ = "evidence"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    learner_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    capability_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("capabilities.id", ondelete="CASCADE"), index=True
    )

    evidence_type: Mapped[EvidenceType] = mapped_column(
        StrEnumType(EvidenceType, length=48), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    context: Mapped[str] = mapped_column(Text, default="")

    context_ref: Mapped[str] = mapped_column(
        String(120), default="", index=True,
        doc=(
            "Identifies the workplace situation (project, client, incident). "
            "Independence for D4 is judged on this: two items from the same "
            "context_ref are one demonstration, not two."
        ),
    )
    occurred_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), nullable=False,
        doc="When the work happened, not when it was submitted. Drives decay.",
    )

    validation_status: Mapped[ValidationStatus] = mapped_column(
        StrEnumType(ValidationStatus), default=ValidationStatus.NOT_REQUESTED,
        nullable=False, index=True
    )


class EvidenceReview(Base, TenantScoped, Timestamped):
    """Structured AI output for one evidence item (Phase 2).

    Advisory only. Stored verbatim, including the prompt version that produced
    it, so any output can be audited and replayed.
    """

    __tablename__ = "evidence_reviews"
    __table_args__ = (
        UniqueConstraint("evidence_id", name="uq_review_per_evidence"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    evidence_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("evidence.id", ondelete="CASCADE"), index=True
    )

    summary: Mapped[str] = mapped_column(Text, default="")
    evidence_type_detected: Mapped[str] = mapped_column(String(48), default="")
    strength: Mapped[EvidenceStrengthBand] = mapped_column(
        StrEnumType(EvidenceStrengthBand), default=EvidenceStrengthBand.WEAK, nullable=False
    )
    ai_confidence: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    concerns: Mapped[str] = mapped_column(
        Text, default="", doc="Newline-separated concerns raised by the reviewer."
    )
    authenticity_concern_count: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    recommendation: Mapped[str] = mapped_column(Text, default="")
    reasoning: Mapped[str] = mapped_column(Text, default="")
    requires_human_review: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False,
        doc="Defaults true. AI never clears its own review requirement.",
    )

    # --- Grounding (thesis 27 Priority 3, evaluation question in thesis 23) ---
    grounded: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False,
        doc="Whether approved rubric text was in the reviewer's context.",
    )
    rubric_citations: Mapped[str] = mapped_column(
        Text, default="",
        doc=(
            "Comma-separated slugs of the approved clauses this judgement rests "
            "on. Fabricated citations are stripped by the guardrail before this "
            "is written, so everything here was genuinely supplied to the model."
        ),
    )
    retrieval_trace: Mapped[str] = mapped_column(
        Text, default="",
        doc="JSON retrieval trace: query class, stages, embedder, reranker.",
    )

    # Auditability (thesis 22, 23).
    prompt_name: Mapped[str] = mapped_column(String(64), default="")
    prompt_version: Mapped[str] = mapped_column(String(16), default="")
    model_name: Mapped[str] = mapped_column(String(120), default="")
    structured_method: Mapped[str] = mapped_column(
        String(32), default="",
        doc=(
            "How structured output was obtained: native | json_extracted | "
            "fallback. A review needing JSON repair had no format guarantee, and "
            "evaluation should be able to segment quality by this."
        ),
    )


class ManagerValidation(Base, TenantScoped, Timestamped):
    """The human decision. The trust anchor (thesis 17).

    Nothing else in the system may move attained_level.
    """

    __tablename__ = "manager_validations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    evidence_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("evidence.id", ondelete="CASCADE"), index=True
    )
    manager_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)

    decision: Mapped[ReviewDecision] = mapped_column(
        StrEnumType(ReviewDecision), nullable=False
    )
    strength: Mapped[EvidenceStrengthBand] = mapped_column(
        StrEnumType(EvidenceStrengthBand), default=EvidenceStrengthBand.MODERATE, nullable=False,
        doc="The manager's strength judgement. Overrides the AI review.",
    )

    observed_in_work: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    applied_independently: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    feedback: Mapped[str] = mapped_column(Text, default="")

    # Section 11: the primary calibration signal. Logged from day one.
    overrode_ai: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False,
        doc=(
            "True when the manager's strength differs from the AI review. This "
            "is the main signal for recalibrating the seeded constants."
        ),
    )
    decided_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), nullable=False
    )
