"""Learning activities, their items, and learner attempts.

    LearningActivity  ->  AssessmentItem (n)
           |
    ActivityAttempt   ->  ItemResponse (n)

Answer keys live on AssessmentItem and are never serialised to a learner. The
router builds a separate public view; there is no path that returns this row
as-is.

Attempts are append-only in spirit: a retake is a new attempt row, never an
overwrite. First-attempt scores are what knowledge mastery is computed from,
because a retake partly measures memory of the previous attempt's feedback.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
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
from app.schemas.learning import (
    ActivityKind,
    AssessmentPhase,
    AttemptStatus,
    ItemDimension,
    ItemType,
    ScoredBy,
)


class LearningActivity(Base, TenantScoped, Timestamped):
    """An e-learn module or a standalone assessment, tied to one capability."""

    __tablename__ = "learning_activities"
    __table_args__ = (
        UniqueConstraint("tenant_id", "slug", name="uq_activity_tenant_slug"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    slug: Mapped[str] = mapped_column(String(120), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    summary: Mapped[str] = mapped_column(Text, default="")

    kind: Mapped[ActivityKind] = mapped_column(
        StrEnumType(ActivityKind), nullable=False
    )
    phase: Mapped[AssessmentPhase] = mapped_column(
        StrEnumType(AssessmentPhase), default=AssessmentPhase.NONE, nullable=False
    )
    instrument_ref: Mapped[str] = mapped_column(
        String(120), default="", index=True,
        doc=(
            "Pairs a pre-assessment with its post-assessment. Both should be "
            "parallel forms of one instrument, or the gain is not meaningful."
        ),
    )

    capability_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("capabilities.id", ondelete="CASCADE"), index=True
    )
    program_ref: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)

    # Ordered content sections for an e-learn: [{"heading": str, "body": str}].
    # Items attach after a section via AssessmentItem.section.
    sections: Mapped[list] = mapped_column(JSON, default=list)

    sequence: Mapped[int] = mapped_column(
        Integer, default=0, doc="Position in the learner journey for its capability."
    )
    estimated_minutes: Mapped[int] = mapped_column(Integer, default=10)
    pass_mark: Mapped[float] = mapped_column(
        Float, default=0.7,
        doc="Knowledge-check threshold. Passing is a learning signal, not a capability claim.",
    )
    max_attempts: Mapped[int] = mapped_column(
        Integer, default=0, doc="0 = unlimited. Pre-assessments should be 1."
    )
    available_from: Mapped[datetime | None] = mapped_column(
        UTCDateTime(), nullable=True,
        doc="Components are not all live on day one. Null = available now.",
    )
    is_published: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class AssessmentItem(Base, TenantScoped, Timestamped):
    """One interactive exercise. Carries the answer key - server side only."""

    __tablename__ = "assessment_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    activity_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("learning_activities.id", ondelete="CASCADE"), index=True
    )
    position: Mapped[int] = mapped_column(Integer, default=0)
    section: Mapped[int] = mapped_column(
        Integer, default=-1,
        doc="E-learn section this item follows. -1 = after all content.",
    )

    item_type: Mapped[ItemType] = mapped_column(StrEnumType(ItemType), nullable=False)
    dimension: Mapped[ItemDimension] = mapped_column(
        StrEnumType(ItemDimension), default=ItemDimension.RECALL, nullable=False
    )
    prompt: Mapped[str] = mapped_column(Text, nullable=False)

    # What the learner sees: options, pairs, buckets, items to rank.
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    # What the scorer sees. NEVER sent to the client.
    answer_key: Mapped[dict] = mapped_column(JSON, default=dict)

    points: Mapped[float] = mapped_column(Float, default=1.0)
    explanation: Mapped[str] = mapped_column(
        Text, default="", doc="Shown after submission. Teaching, not just marking."
    )


class ActivityAttempt(Base, TenantScoped, Timestamped):
    """One learner's attempt at one activity."""

    __tablename__ = "activity_attempts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    activity_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("learning_activities.id", ondelete="CASCADE"), index=True
    )
    learner_id: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    capability_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    attempt_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    status: Mapped[AttemptStatus] = mapped_column(
        StrEnumType(AttemptStatus), default=AttemptStatus.IN_PROGRESS, nullable=False
    )
    submitted_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)

    points_earned: Mapped[float] = mapped_column(Float, default=0.0)
    points_scored: Mapped[float] = mapped_column(
        Float, default=0.0,
        doc="Points possible over items that HAVE a score. Pending items are excluded, not zeroed.",
    )
    points_possible: Mapped[float] = mapped_column(Float, default=0.0)
    score: Mapped[float | None] = mapped_column(
        Float, nullable=True, doc="points_earned / points_scored, 0..1. Null until scored."
    )
    scoring_version: Mapped[str] = mapped_column(String(16), default="")


class ItemResponse(Base, TenantScoped, Timestamped):
    """A learner's answer to one item, with its score and where it came from."""

    __tablename__ = "item_responses"
    __table_args__ = (
        UniqueConstraint("attempt_id", "item_id", name="uq_response_per_item"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    attempt_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("activity_attempts.id", ondelete="CASCADE"), index=True
    )
    item_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("assessment_items.id", ondelete="CASCADE"), index=True
    )

    response: Mapped[dict] = mapped_column(JSON, default=dict)
    credit: Mapped[float | None] = mapped_column(
        Float, nullable=True, doc="0..1 credit. Null while pending or unscored."
    )
    scored_by: Mapped[ScoredBy] = mapped_column(
        StrEnumType(ScoredBy), default=ScoredBy.PENDING, nullable=False
    )
    feedback: Mapped[str] = mapped_column(Text, default="")
    # AI scoring provenance, for free response only.
    ai_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    model_name: Mapped[str] = mapped_column(String(120), default="")
    prompt_version: Mapped[str] = mapped_column(String(16), default="")
    ai_detail: Mapped[dict | None] = mapped_column(
        JSON, nullable=True,
        doc=(
            "Free response only: {met_key_points, quotes: [{key_point, quote, "
            "start, end}], provenance}. Every quote was located verbatim in the "
            "answer; unverifiable ones were discarded before this was written."
        ),
    )
