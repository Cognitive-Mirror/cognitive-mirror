"""Output contract for free-response scoring.

The model never emits a score. It judges each key point separately and quotes
the learner's own words as proof; the service verifies every quote against the
response and computes credit arithmetically from the verified judgements.

That shape is the answer to "a vague rubric produces a vague review that looks
authoritative". A key point either has a verbatim quote that satisfies it or it
does not count, and a reviewer cannot reach a high mark by sounding confident.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class KeyPointJudgement(BaseModel):
    index: int = Field(..., ge=0, description="Index of the key point, as numbered in the prompt.")
    met: bool
    quote: str = Field(
        default="",
        description="Verbatim words from the learner's answer that satisfy this key point.",
    )


class FreeResponseAssessment(BaseModel):
    judgements: list[KeyPointJudgement] = Field(default_factory=list)
    feedback: str = Field(
        default="",
        description="Two or three sentences to the learner: what was strong, what was missing.",
    )
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    key_points_insufficient: bool = Field(
        default=False,
        description=(
            "True when the key points do not let you judge this answer fairly - "
            "for example a defensible answer the key points did not anticipate."
        ),
    )
    concerns: list[str] = Field(default_factory=list)
