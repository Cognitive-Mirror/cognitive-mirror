"""Capability State Model enumerations.

Shared by the ORM models, the scoring engine and the API. The model itself is
specified in Docs/Architecture/Capability_State_Model.md; the persisted state is
app.models.capability.CapabilityStateRecord.
"""

from enum import StrEnum

# ───────────────────────── Enumerations ───────────────────────── #


class CapabilityLevel(StrEnum):
    """Progressive levels of demonstrated capability."""

    NOVICE = "novice"
    DEVELOPING = "developing"
    COMPETENT = "competent"
    PROFICIENT = "proficient"
    EXPERT = "expert"


class CapabilityClass(StrEnum):
    """Decay archetype for a capability (CSM D1).

    Determines the base half-life. Procedural skills retain best over non-use;
    interpersonal, context-dependent ones retain worst.
    """

    PROCEDURAL = "procedural"
    ANALYTICAL = "analytical"
    INTERPERSONAL = "interpersonal"


class ConfidenceBand(StrEnum):
    """Reporting band for state_confidence (CSM D5)."""

    HIGH = "high"
    MODERATE = "moderate"
    LOW = "low"
    REVALIDATION_DUE = "revalidation_due"


class RequiredLevelSource(StrEnum):
    """Which layer resolved required_level (CSM D6). Lowest to highest precedence."""

    SPINE_DEFAULT = "spine_default"
    TENANT_ROLE = "tenant_role"
    PROGRAM_TARGET = "program_target"


class CapabilityStatus(StrEnum):
    """Lifecycle status of a capability for a specific subject."""

    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    EVIDENCED = "evidenced"
    UNDER_REVIEW = "under_review"
    VALIDATED = "validated"
    NEEDS_IMPROVEMENT = "needs_improvement"
    REVALIDATION_DUE = "revalidation_due"


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
