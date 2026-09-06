"""Evidence domain schemas.

Evidence is the atomic unit of capability proof in Cognitive Mirror.
A learner submits evidence to demonstrate workplace capability.
"""

from datetime import UTC, datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class EvidenceType(StrEnum):
    """Categories of evidence a learner can submit."""

    WORKPLACE_APPLICATION = "workplace_application"
    SCENARIO_PRACTICE = "scenario_practice"
    REFLECTION = "reflection"
    PEER_FEEDBACK = "peer_feedback"
    MANAGER_OBSERVATION = "manager_observation"
    DOCUMENT = "document"
    OTHER = "other"


class EvidenceMetadata(BaseModel):
    """Contextual metadata attached to a piece of evidence."""

    source: str | None = Field(default=None, description="Where this evidence originated")
    file_type: str | None = Field(default=None, description="MIME type if file upload")
    file_size_bytes: int | None = Field(default=None, description="File size if applicable")
    submitted_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    tags: list[str] = Field(default_factory=list)


class EvidenceSubmission(BaseModel):
    """Payload when a learner submits evidence for AI review."""

    learner_id: str = Field(..., description="Unique learner identifier")
    capability_id: str = Field(..., description="Capability this evidence maps to")
    evidence_type: EvidenceType
    title: str = Field(..., min_length=3, max_length=200)
    content: str = Field(..., min_length=10, description="Evidence text or description")
    context: str = Field(default="", description="Workplace context for this evidence")
    metadata: EvidenceMetadata = Field(default_factory=EvidenceMetadata)
