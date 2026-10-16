"""Structured output schema for AI evidence review.

This is the JSON contract the LLM must produce when reviewing
a piece of learner-submitted evidence. Every field is typed
and constrained — no free-form text responses.
"""

from pydantic import BaseModel, Field

from app.schemas.evidence import EvidenceStrengthBand

# Single source of truth: the AI output contract and the scoring engine share
# one strength enum so they cannot drift apart.
EvidenceStrength = EvidenceStrengthBand


class EvidenceQuote(BaseModel):
    """A passage of the submission the judgement rests on.

    The guardrail locates every quote verbatim in the evidence text and drops
    any it cannot find, so a reviewer cannot support a rating with words the
    learner never wrote.
    """

    quote: str = Field(..., description="Exact words copied from the submission")
    rubric_citation: str = Field(
        default="", description="Slug of the supplied clause this passage bears on"
    )
    note: str = Field(default="", description="What this passage shows, in rubric terms")


class EvidenceReviewOutput(BaseModel):
    """Complete AI output from reviewing a piece of evidence.

    This schema is used as the structured output format for the
    evidence review LangGraph and is what the manager sees.
    """

    summary: str = Field(..., description="Concise summary of the evidence")
    evidence_type_detected: str = Field(..., description="AI-classified evidence type")
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
    rubric_citations: list[str] = Field(
        default_factory=list,
        description=(
            "Slugs of the approved rubric clauses this judgement rests on, e.g. "
            "['CAP-DS.RUBRIC.STRONG']. Thesis 23 asks of every AI output whether "
            "it used only approved sources; this field is how that question is "
            "answered from the data. A review citing nothing is ungrounded and "
            "is forced to human review."
        ),
    )
    evidence_quotes: list[EvidenceQuote] = Field(
        default_factory=list,
        description=(
            "Verbatim passages of the submission behind the rating. Verified "
            "server-side; unlocatable quotes are removed and flagged."
        ),
    )
    grounded: bool = Field(
        default=False,
        description="Set by the guardrail from retrieval, never trusted from the model.",
    )
