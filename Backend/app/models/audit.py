"""Append-only audit log for capability state changes.

Update Rule 6: every update is appended; state history is never overwritten.
This table is insert-only. Nothing in the application may update or delete a
row here.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Float, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import StrEnumType, TenantScoped, UTCDateTime, new_id, utcnow
from app.schemas.capability import CapabilityLevel, SignalSource, SubjectType


class CapabilityStateEvent(Base, TenantScoped):
    """One recorded transition of a capability state.

    Carries before/after values, what triggered the change, and the scoring
    constants version in force. Together these let any historical state be
    reconstructed and any recalibration be evaluated against what actually
    happened.
    """

    __tablename__ = "capability_state_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)

    capability_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    subject_type: Mapped[SubjectType] = mapped_column(
        StrEnumType(SubjectType), default=SubjectType.LEARNER, nullable=False
    )
    subject_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)

    previous_level: Mapped[CapabilityLevel] = mapped_column(
        StrEnumType(CapabilityLevel), nullable=False
    )
    new_level: Mapped[CapabilityLevel] = mapped_column(
        StrEnumType(CapabilityLevel), nullable=False
    )
    previous_confidence: Mapped[float] = mapped_column(Float, default=0.0)
    new_confidence: Mapped[float] = mapped_column(Float, default=0.0)

    triggered_by: Mapped[SignalSource] = mapped_column(
        StrEnumType(SignalSource), nullable=False
    )
    actor_id: Mapped[str | None] = mapped_column(
        String(36), nullable=True,
        doc="User who caused the change. Null only for scheduled decay recomputation.",
    )
    evidence_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    reason: Mapped[str] = mapped_column(
        Text, nullable=False,
        doc="Update Rule 5: no anonymous mutations. Never empty.",
    )
    scoring_model_version: Mapped[str] = mapped_column(String(16), default="")

    occurred_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=utcnow, nullable=False, index=True
    )
