"""Structured output schema for AI intervention recommendations.

After reviewing evidence and capability state, the AI suggests
what should happen next for the learner. These are suggestions,
never directives.
"""

from enum import StrEnum

from pydantic import BaseModel, Field


class InterventionType(StrEnum):
    """Categories of intervention the AI can recommend."""

    ADDITIONAL_EVIDENCE = "additional_evidence"
    SCENARIO_PRACTICE = "scenario_practice"
    COACHING = "coaching"
    PEER_LEARNING = "peer_learning"
    FORMAL_TRAINING = "formal_training"
    MANAGER_CONVERSATION = "manager_conversation"
    STRETCH_ASSIGNMENT = "stretch_assignment"
    NO_ACTION = "no_action"


class Priority(StrEnum):
    """Urgency level for the recommendation."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class InterventionRecommendation(BaseModel):
    """AI-generated recommendation for learner's next step."""

    learner_id: str
    capability_id: str
    intervention_type: InterventionType
    priority: Priority
    rationale: str = Field(..., description="Why this intervention is recommended")
    suggested_actions: list[str] = Field(
        default_factory=list,
        description="Concrete actions the learner or manager can take",
    )
    expected_outcome: str = Field(
        default="",
        description="What improvement is expected from this intervention",
    )
    confidence: float = Field(..., ge=0.0, le=1.0)
