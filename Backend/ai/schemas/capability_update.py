"""Structured output schema for AI capability state updates.

When evidence is reviewed, the AI recommends whether a learner's
capability level should change. This schema captures that recommendation.
Managers remain the final decision makers.
"""

from pydantic import BaseModel, Field


class CapabilityUpdateOutput(BaseModel):
    """AI recommendation for updating a learner's capability level."""

    capability_id: str
    learner_id: str
    previous_level: str = Field(..., description="Current level before this review")
    recommended_level: str = Field(..., description="AI-recommended new level")
    confidence: float = Field(..., ge=0.0, le=1.0)
    evidence_ids: list[str] = Field(
        default_factory=list,
        description="Evidence that supports this recommendation",
    )
    justification: str = Field(
        ..., description="Why the AI recommends this level change"
    )
    risk_flags: list[str] = Field(
        default_factory=list,
        description="Risks or caveats the manager should consider",
    )
    requires_manager_approval: bool = Field(
        default=True,
        description="AI never auto-updates capability — manager must approve",
    )
