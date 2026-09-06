"""Capability domain schemas — the Capability State Model.

This is the core object of the platform. Per the Impact AI Thesis (v1.2):

  §12  "The Capability State Model is the live representation of demonstrated
        capability... This becomes the heart of Impact's long-term AI moat."
  §27  Priority 1 — "Define the Capability State Model. This is the core of the
        AI system. Before building agents or advanced AI, define what capability
        state means and how it updates."

Design rules this file enforces:
  - Capability is a *live state*, never a completion record (§7.6).
  - Completion and assessment scores are weak signals, not proof (§7.2, §7.3).
  - Manager validation is the trust anchor (§7.5, §17).
  - Attribution is confidence-scored, never causal (§19).
  - Every state carries a tenant boundary (§24).

The prose specification lives in Docs/Architecture/Capability_State_Model.md.
Keep the two in sync.
"""

from datetime import UTC, datetime
from enum import StrEnum

from pydantic import BaseModel, Field


# ───────────────────────── Enumerations ───────────────────────── #


class CapabilityLevel(StrEnum):
    """Progressive levels of demonstrated capability."""

    NOVICE = "novice"
    DEVELOPING = "developing"
    COMPETENT = "competent"
    PROFICIENT = "proficient"
    EXPERT = "expert"


class CapabilityStatus(StrEnum):
    """Lifecycle status of a capability for a specific subject."""

    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    EVIDENCED = "evidenced"
    UNDER_REVIEW = "under_review"
    VALIDATED = "validated"
    NEEDS_IMPROVEMENT = "needs_improvement"


class SubjectType(StrEnum):
    """Levels at which capability state exists (§12).

    The same model is computed at every level; only the subject changes.
    """

    LEARNER = "learner"
    TEAM = "team"
    COHORT = "cohort"
    ROLE = "role"
    PROGRAM = "program"
    ORG_UNIT = "org_unit"
    TENANT = "tenant"


class Trajectory(StrEnum):
    """Direction of capability movement over the observation window."""

    IMPROVING = "improving"
    STAGNANT = "stagnant"
    DECLINING = "declining"
    INSUFFICIENT_DATA = "insufficient_data"


class DecayRisk(StrEnum):
    """Risk that demonstrated capability is decaying from disuse (§7.6)."""

    NONE = "none"
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"


class TransferStrength(StrEnum):
    """How well capability transfers into real workplace context (§7.1)."""

    UNPROVEN = "unproven"
    EMERGING = "emerging"
    CONSISTENT = "consistent"
    GENERALISED = "generalised"


class ValidationStatus(StrEnum):
    """Manager validation state — the trust anchor (§17)."""

    NOT_REQUESTED = "not_requested"
    PENDING = "pending"
    VALIDATED = "validated"
    DISPUTED = "disputed"
    REJECTED = "rejected"


class ConfidenceCalibration(StrEnum):
    """Self-reported confidence measured against demonstrated competence (§12).

    Overconfidence is a developmental risk signal, not a performance rating.
    """

    UNKNOWN = "unknown"
    OVERCONFIDENT = "overconfident"
    CALIBRATED = "calibrated"
    UNDERCONFIDENT = "underconfident"


class SignalSource(StrEnum):
    """What produced a state change. Every update must name its source."""

    ASSESSMENT = "assessment"
    SCENARIO = "scenario"
    REFLECTION = "reflection"
    EVIDENCE = "evidence"
    AI_REVIEW = "ai_review"
    MANAGER_VALIDATION = "manager_validation"
    IN_FLOW_SUPPORT = "in_flow_support"
    COHORT_PRACTICE = "cohort_practice"
    KPI_MOVEMENT = "kpi_movement"
    SYSTEM = "system"


# ───────────────────────── Signal groups ───────────────────────── #


class AssessmentSignals(BaseModel):
    """Diagnostic signals. Weak on their own — never sufficient proof (§7.3)."""

    assessment_score: float | None = Field(
        default=None, ge=0.0, le=1.0,
        description="Normalised assessment performance.",
    )
    scenario_judgement: float | None = Field(
        default=None, ge=0.0, le=1.0,
        description="Quality of judgement shown in scenario responses.",
    )
    reflection_quality: float | None = Field(
        default=None, ge=0.0, le=1.0,
        description="Depth and specificity of learner reflection.",
    )
    self_reported_confidence: float | None = Field(
        default=None, ge=0.0, le=1.0,
    )
    confidence_calibration: ConfidenceCalibration = Field(
        default=ConfidenceCalibration.UNKNOWN,
        description="Self-reported confidence vs demonstrated competence.",
    )


class EvidenceSignals(BaseModel):
    """Workplace evidence signals — the substance of the model (§16)."""

    evidence_count: int = Field(default=0, ge=0)
    strongest_evidence_strength: str | None = Field(
        default=None,
        description="Strength of the best supporting evidence item.",
    )
    application_frequency: int = Field(
        default=0, ge=0,
        description="Distinct workplace applications observed in the window.",
    )
    last_evidence_at: datetime | None = Field(default=None)
    authenticity_concerns: list[str] = Field(
        default_factory=list,
        description="Superficiality or authenticity flags raised during review (§16.4).",
    )


class ValidationSignals(BaseModel):
    """Manager validation — without this the platform is self-reported (§17)."""

    status: ValidationStatus = Field(default=ValidationStatus.NOT_REQUESTED)
    validated_by: str | None = Field(default=None, description="Manager user id.")
    validated_at: datetime | None = Field(default=None)
    validation_count: int = Field(default=0, ge=0)
    observed_in_work: bool | None = Field(
        default=None,
        description="Did the manager observe this behaviour in actual work?",
    )
    applied_independently: bool | None = Field(default=None)
    manager_notes: str = Field(default="")


class EngagementSignals(BaseModel):
    """In-flow support and cohort/peer signals (§15.1, §15.2).

    These are supporting signals only. A support trigger indicates uncertainty,
    not proven weakness, and must never be treated as final proof (§15.1).
    """

    in_flow_support_events: int = Field(default=0, ge=0)
    cohort_interaction_quality: float | None = Field(default=None, ge=0.0, le=1.0)
    peer_practice_contributions: int = Field(default=0, ge=0)
    participation_risk: bool = Field(default=False)


class TrajectorySignals(BaseModel):
    """Movement over time — improvement, stagnation, decay (§12)."""

    trajectory: Trajectory = Field(default=Trajectory.INSUFFICIENT_DATA)
    decay_risk: DecayRisk = Field(default=DecayRisk.NONE)
    transfer_strength: TransferStrength = Field(default=TransferStrength.UNPROVEN)
    days_since_last_application: int | None = Field(default=None, ge=0)
    level_changed_at: datetime | None = Field(default=None)


class OutcomeSignals(BaseModel):
    """KPI linkage and outcome association (§19).

    Association only. This model must never express causality. The wording
    Impact commits to is: "this capability movement is associated with these
    observed KPI signals, with this level of confidence."
    """

    linked_kpi_ids: list[str] = Field(default_factory=list)
    observed_kpi_movement: str | None = Field(
        default=None,
        description="Human-readable description of the KPI signal observed.",
    )
    attribution_confidence: float | None = Field(
        default=None, ge=0.0, le=1.0,
        description="Confidence in the association — never a causal claim.",
    )
    confounding_factors: list[str] = Field(
        default_factory=list,
        description="Known external factors that could explain the movement.",
    )


# ───────────────────────── The state object ───────────────────────── #


class CapabilityState(BaseModel):
    """Live capability state for one capability and one subject.

    Instantiated per (tenant, subject, capability). The subject may be an
    individual learner or any aggregate level in SubjectType.
    """

    # Identity and boundary
    tenant_id: str = Field(..., description="Tenant boundary — required (§24).")
    capability_id: str
    capability_name: str = Field(..., description="Human-readable capability name.")
    subject_type: SubjectType = Field(default=SubjectType.LEARNER)
    subject_id: str = Field(..., description="Learner, team, cohort, role or unit id.")
    role_id: str | None = Field(default=None)
    program_id: str | None = Field(default=None)

    # Required vs demonstrated — the core comparison (§12)
    required_level: CapabilityLevel = Field(
        ..., description="Level the role/KPI requires.",
    )
    demonstrated_level: CapabilityLevel = Field(
        default=CapabilityLevel.NOVICE,
        description="Level actually evidenced and validated.",
    )
    status: CapabilityStatus = Field(default=CapabilityStatus.NOT_STARTED)

    # Signal groups
    assessment: AssessmentSignals = Field(default_factory=AssessmentSignals)
    evidence: EvidenceSignals = Field(default_factory=EvidenceSignals)
    validation: ValidationSignals = Field(default_factory=ValidationSignals)
    engagement: EngagementSignals = Field(default_factory=EngagementSignals)
    trajectory: TrajectorySignals = Field(default_factory=TrajectorySignals)
    outcome: OutcomeSignals = Field(default_factory=OutcomeSignals)

    # Overall interpretation
    state_confidence: float = Field(
        default=0.0, ge=0.0, le=1.0,
        description="Confidence that demonstrated_level reflects reality.",
    )
    recommended_next_action: str = Field(
        default="",
        description="Next capability-movement action — not a content recommendation (§18).",
    )

    # Audit
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    last_signal_source: SignalSource = Field(default=SignalSource.SYSTEM)

    @property
    def gap(self) -> int:
        """Levels between required and demonstrated. Positive means a gap remains."""
        order = list(CapabilityLevel)
        return order.index(self.required_level) - order.index(self.demonstrated_level)

    @property
    def is_manager_validated(self) -> bool:
        """True only when a manager has explicitly validated (§17)."""
        return self.validation.status is ValidationStatus.VALIDATED


class CapabilityUpdate(BaseModel):
    """A proposed change to a capability state.

    AI may *propose* an update; it never applies one. Any change to
    demonstrated_level requires manager approval (§7.7, §16.5, §24).
    """

    tenant_id: str
    capability_id: str
    subject_id: str
    subject_type: SubjectType = Field(default=SubjectType.LEARNER)

    new_level: CapabilityLevel | None = Field(default=None)
    new_status: CapabilityStatus | None = Field(default=None)

    reason: str = Field(..., description="Why this update is being made.")
    triggered_by: SignalSource = Field(..., description="What produced this update.")
    evidence_ids: list[str] = Field(default_factory=list)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    requires_manager_approval: bool = Field(
        default=True,
        description="AI-proposed level changes always require human approval.",
    )
    proposed_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
