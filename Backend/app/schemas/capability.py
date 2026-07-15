"""Capability domain schemas.

Capabilities are the spine of Cognitive Mirror.
Every learner has a capability state for each capability in their path.
"""

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class CapabilityLevel(StrEnum):
    """Progressive levels of demonstrated capability."""

    NOVICE = "novice"
    DEVELOPING = "developing"
    COMPETENT = "competent"
    PROFICIENT = "proficient"
    EXPERT = "expert"


class CapabilityStatus(StrEnum):
    """Lifecycle status of a capability for a specific learner."""

    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    EVIDENCED = "evidenced"
    UNDER_REVIEW = "under_review"
    VALIDATED = "validated"
    NEEDS_IMPROVEMENT = "needs_improvement"


class CapabilityState(BaseModel):
    """Current state of a single capability for a learner."""

    capability_id: str
    learner_id: str
    name: str = Field(..., description="Human-readable capability name")
    level: CapabilityLevel = Field(default=CapabilityLevel.NOVICE)
    status: CapabilityStatus = Field(default=CapabilityStatus.NOT_STARTED)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0, description="AI confidence in current level")
    evidence_count: int = Field(default=0, ge=0)
    last_evidence_at: datetime | None = Field(default=None)
    last_reviewed_at: datetime | None = Field(default=None)
    validated_by: str | None = Field(default=None, description="Manager who validated")
    validated_at: datetime | None = Field(default=None)


class CapabilityUpdate(BaseModel):
    """Request to update a learner's capability state."""

    capability_id: str
    learner_id: str
    new_level: CapabilityLevel | None = Field(default=None)
    new_status: CapabilityStatus | None = Field(default=None)
    reason: str = Field(..., description="Why this update is being made")
    triggered_by: str = Field(..., description="ai_review | manager_validation | system")
