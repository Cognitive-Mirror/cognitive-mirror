"""Structured output schema for AI evidence review.

This is the JSON contract the LLM must produce when reviewing
a piece of learner-submitted evidence. Every field is typed
and constrained — no free-form text responses.
"""

from enum import StrEnum

from pydantic import BaseModel, Field


class EvidenceStrength(StrEnum):
    """How strongly the evidence demonstrates capability."""

    WEAK = "weak"
    MODERATE = "moderate"
    STRONG = "strong"
    EXCEPTIONAL = "exceptional"


class CapabilitySignal(BaseModel):
    """A single capability signal detected in the evidence."""

    capability_id: str = Field(..., description="Capability this signal maps to")
    signal: str = Field(..., description="What was observed")
    strength: EvidenceStrength


class EvidenceReviewOutput(BaseModel):
    """Complete AI output from reviewing a piece of evidence.

    This schema is used as the structured output format for the
    evidence review LangGraph and is what the manager sees.
    """

    summary: str = Field(..., description="Concise summary of the evidence")
    evidence_type_detected: str = Field(..., description="AI-classified evidence type")
    capability_signals: list[CapabilitySignal] = Field(
        default_factory=list,
        description="Capability signals found in the evidence",
    )
    strength: EvidenceStrength = Field(..., description="Overall evidence strength")
    confidence: float = Field(
        ..., ge=0.0, le=1.0, description="AI confidence in this review"
    )
    concerns: list[str] = Field(
        default_factory=list,
        description="Any concerns, gaps, or risks identified",
    )
    recommendation: str = Field(
        ..., description="Recommended next step for the manager"
    )
    requires_human_review: bool = Field(
        default=True,
        description="Whether this evidence needs explicit manager review",
    )
    reasoning: str = Field(
        ..., description="AI reasoning chain — supports auditability"
    )
