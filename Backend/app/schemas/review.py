"""Review and validation schemas.

Reviews are the human-in-the-loop layer.
AI produces recommendations; managers make decisions.
"""

from datetime import UTC, datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class ReviewDecision(StrEnum):
    """Possible outcomes when a manager reviews evidence."""

    APPROVED = "approved"
    NEEDS_REVISION = "needs_revision"
    REJECTED = "rejected"
    ESCALATED = "escalated"


class ReviewRequest(BaseModel):
    """A request for manager review of AI-processed evidence."""

    review_id: str = Field(default="", description="Auto-generated if empty")
    evidence_id: str
    learner_id: str
    capability_id: str
    ai_summary: str = Field(..., description="AI-generated summary for the manager")
    ai_confidence: float = Field(..., ge=0.0, le=1.0)
    ai_recommendation: str
    requested_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class ManagerValidation(BaseModel):
    """Manager's decision on a review request."""

    review_id: str
    manager_id: str
    decision: ReviewDecision
    feedback: str = Field(default="", description="Optional manager commentary")
    capability_level_override: str | None = Field(
        default=None,
        description="Manager can override the AI-recommended level",
    )
    decided_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
