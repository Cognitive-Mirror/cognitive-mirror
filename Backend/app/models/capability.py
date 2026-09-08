"""Capability, requirement and state models.

CapabilityStateRecord is the persisted output of the scoring engine. It is a
cache of a pure computation over evidence: it can always be rebuilt by
replaying `app.scoring.engine.score_capability` over the evidence history,
which is what makes recalibration safe (CSM section 11).
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
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
from app.schemas.capability import (
    CapabilityClass,
    CapabilityLevel,
    CapabilityStatus,
    ConfidenceBand,
    RequiredLevelSource,
    SubjectType,
)


class Capability(Base, TenantScoped, Timestamped):
    """A capability in the Capability Spine."""

    __tablename__ = "capabilities"
    __table_args__ = (
        UniqueConstraint("tenant_id", "slug", name="uq_capability_tenant_slug"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    slug: Mapped[str] = mapped_column(String(120), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")

    capability_class: Mapped[CapabilityClass] = mapped_column(
        StrEnumType(CapabilityClass), default=CapabilityClass.ANALYTICAL, nullable=False,
        doc="Decay archetype; sets the base half-life (D1).",
    )

    # KPI linkage. Association only, never causal (thesis 19).
    linked_kpi_ids: Mapped[str] = mapped_column(
        Text, default="",
        doc="Comma-separated KPI identifiers this capability supports.",
    )


class CapabilityRequirement(Base, TenantScoped, Timestamped):
    """A resolved required_level, with mandatory provenance (D6).

    Three layers write here, distinguished by `source`. Resolution takes the
    highest-precedence active row: program_target > tenant_role > spine_default.

    `set_by` and `rationale` are not optional. When a CFO asks who decided a
    person needs to be proficient, there must be an answer.
    """

    __tablename__ = "capability_requirements"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    capability_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("capabilities.id", ondelete="CASCADE"), index=True
    )

    # Scope: exactly one of these identifies who the requirement applies to.
    role_ref: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    program_ref: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    subject_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)

    required_level: Mapped[CapabilityLevel] = mapped_column(
        StrEnumType(CapabilityLevel), nullable=False
    )
    source: Mapped[RequiredLevelSource] = mapped_column(
        StrEnumType(RequiredLevelSource), nullable=False
    )

    set_by: Mapped[str] = mapped_column(
        String(36), nullable=False,
        doc="User id that set this. AI may propose but never writes here.",
    )
    rationale: Mapped[str] = mapped_column(Text, default="")
    effective_from: Mapped[datetime] = mapped_column(
        UTCDateTime(), nullable=False
    )
    effective_to: Mapped[datetime | None] = mapped_column(
        UTCDateTime(), nullable=True,
        doc="Null means currently active. Requirements are superseded, not edited.",
    )


class CapabilityStateRecord(Base, TenantScoped, Timestamped):
    """Persisted capability state for one (subject, capability) pair.

    Carries both D1 levels. `attained_level` is a historical fact that never
    falls on its own; `current_support_level` is what decayed evidence supports
    right now. Their divergence is what drives revalidation.
    """

    __tablename__ = "capability_states"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "subject_type", "subject_id", "capability_id",
            name="uq_state_identity",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    capability_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("capabilities.id", ondelete="CASCADE"), index=True
    )
    subject_type: Mapped[SubjectType] = mapped_column(
        StrEnumType(SubjectType), default=SubjectType.LEARNER, nullable=False
    )
    subject_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)

    # --- D6 ---
    required_level: Mapped[CapabilityLevel] = mapped_column(
        StrEnumType(CapabilityLevel), default=CapabilityLevel.COMPETENT, nullable=False
    )
    required_level_source: Mapped[RequiredLevelSource] = mapped_column(
        StrEnumType(RequiredLevelSource), default=RequiredLevelSource.SPINE_DEFAULT, nullable=False
    )

    # --- D1: the two levels ---
    attained_level: Mapped[CapabilityLevel] = mapped_column(
        StrEnumType(CapabilityLevel), default=CapabilityLevel.NOVICE, nullable=False
    )
    current_support_level: Mapped[CapabilityLevel] = mapped_column(
        StrEnumType(CapabilityLevel), default=CapabilityLevel.NOVICE, nullable=False
    )
    status: Mapped[CapabilityStatus] = mapped_column(
        StrEnumType(CapabilityStatus), default=CapabilityStatus.NOT_STARTED, nullable=False
    )

    # --- D3/D4: scoring outputs ---
    validated_points: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    provisional_points: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    independent_contexts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    half_life_days: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    # --- D5: confidence ---
    state_confidence: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    confidence_band: Mapped[ConfidenceBand] = mapped_column(
        StrEnumType(ConfidenceBand), default=ConfidenceBand.REVALIDATION_DUE, nullable=False
    )

    recommended_next_action: Mapped[str] = mapped_column(Text, default="")
    last_validated_at: Mapped[datetime | None] = mapped_column(
        UTCDateTime(), nullable=True
    )

    # Section 11: stamp the constants version so recalibration never silently
    # rewrites history.
    scoring_model_version: Mapped[str] = mapped_column(String(16), default="")
