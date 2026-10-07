"""AI scoring of free-response e-learn answers.

    prompt (item key points)  ->  structured judgements  ->  quote verification
                                                          ->  credit = verified / total

The verification step is the reason this is safe to automate. The model may
claim a key point is met only by quoting the learner, and any quote that does
not appear in the answer is discarded. A model that pads or hallucinates gets
marked down by arithmetic rather than trusted.

Returns None credit - meaning "route to a human" - when no model is available,
when the call fails, or when the model reports that the key points cannot
settle the answer. That last case is a first-class outcome, not an error.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from ai.prompt_registry.registry import get_prompt_registry
from ai.schemas.free_response import FreeResponseAssessment
from ai.utils.structured import invoke_structured
from app.scoring.items import normalise_text

logger = logging.getLogger(__name__)

# A quote shorter than this cannot demonstrate a key point ("yes", "the team").
MIN_QUOTE_WORDS = 3


@dataclass
class FreeResponseOutcome:
    credit: float | None
    feedback: str
    confidence: float | None = None
    model_name: str = ""
    prompt_version: str = ""
    needs_human: bool = False
    concerns: list[str] = field(default_factory=list)
    met_key_points: list[int] = field(default_factory=list)


def _quote_verified(quote: str, answer_norm: str) -> bool:
    q = normalise_text(quote)
    return len(q.split()) >= MIN_QUOTE_WORDS and q in answer_norm


def credit_from_judgements(
    assessment: FreeResponseAssessment, key_points: list[str], answer: str
) -> tuple[float, list[int], list[str]]:
    """Pure: verified met key points / total key points."""
    answer_norm = normalise_text(answer)
    met: set[int] = set()
    rejected: list[str] = []
    for j in assessment.judgements:
        if not j.met or not 0 <= j.index < len(key_points):
            continue
        if _quote_verified(j.quote, answer_norm):
            met.add(j.index)
        else:
            rejected.append(
                f"Key point {j.index + 1} claimed met, but its supporting quote is "
                "not in the answer; not counted."
            )
    total = len(key_points)
    credit = 0.0 if total == 0 else len(met) / total
    return credit, sorted(met), rejected


def assess_free_response(
    *, question: str, key_points: list[str], model_answer: str, answer: str
) -> FreeResponseOutcome:
    if not key_points:
        return FreeResponseOutcome(
            credit=None, needs_human=True,
            feedback="This question has no key points to mark against; it will be reviewed.",
        )
    if len(answer.split()) < MIN_QUOTE_WORDS:
        return FreeResponseOutcome(credit=0.0, feedback="The answer is too short to assess.")

    entry = get_prompt_registry().get("free_response")
    try:
        from ai.utils.llm_factory import create_llm

        llm = create_llm()
    except Exception as exc:
        logger.info("No LLM for free-response scoring (%s).", exc)
        return FreeResponseOutcome(
            credit=None, needs_human=True,
            feedback="Your answer is recorded and will be reviewed.",
            concerns=["Automatic scoring unavailable."],
        )

    prompt_value = entry.template.invoke({
        "question": question,
        "key_points": "\n".join(f"[{i}] {kp}" for i, kp in enumerate(key_points)),
        "model_answer": model_answer or "(none supplied)",
        "answer": answer,
    })
    result = invoke_structured(llm, prompt_value, FreeResponseAssessment)
    model_name = getattr(llm, "model_name", "") or getattr(llm, "model", "")

    if not result.ok:
        return FreeResponseOutcome(
            credit=None, needs_human=True, model_name=model_name,
            prompt_version=entry.metadata.version,
            feedback="Your answer is recorded and will be reviewed.",
            concerns=[f"Automatic scoring failed: {result.error}"],
        )

    assessment: FreeResponseAssessment = result.value
    credit, met, rejected = credit_from_judgements(assessment, key_points, answer)
    concerns = list(assessment.concerns) + rejected

    if assessment.key_points_insufficient:
        return FreeResponseOutcome(
            credit=None, needs_human=True, model_name=model_name,
            prompt_version=entry.metadata.version,
            confidence=assessment.confidence,
            feedback=(assessment.feedback or "")
            + " A facilitator will confirm the mark, because the marking guide "
            "did not anticipate your answer.",
            concerns=concerns, met_key_points=met,
        )

    return FreeResponseOutcome(
        credit=round(credit, 4),
        feedback=assessment.feedback,
        # Rejected quotes are evidence the judgement was unreliable.
        confidence=max(0.0, assessment.confidence - 0.2 * len(rejected)),
        model_name=model_name,
        prompt_version=entry.metadata.version,
        concerns=concerns,
        met_key_points=met,
    )


__all__ = ["FreeResponseOutcome", "assess_free_response", "credit_from_judgements"]
