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

In demo mode a canonical sample answer whose live call fails is judged from the
verified golden cache instead. The cached judgements go through exactly the same
quote verification and credit arithmetic as a live model's.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from ai.demo_cache import CACHE_MODEL_NAME, cache_applies, lookup_free_response
from ai.prompt_registry.registry import get_prompt_registry
from ai.schemas.free_response import FreeResponseAssessment
from ai.utils.quotes import locate_quote
from ai.utils.structured import invoke_structured
from app.config import get_settings
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
    quotes: list[dict] = field(default_factory=list)
    """Verified supporting quotes: {key_point, quote, start, end}."""
    provenance: str = "live_model"
    """live_model | verified_cache | none."""

    @property
    def cached(self) -> bool:
        return self.provenance == "verified_cache"

    def detail(self, answer: str) -> dict:
        """What is persisted on the response for the UI to highlight."""
        return {
            "met_key_points": list(self.met_key_points),
            "quotes": list(self.quotes),
            "provenance": self.provenance,
            "answer_text": answer,
        }


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


def verified_quotes(
    assessment: FreeResponseAssessment, key_points: list[str], answer: str
) -> list[dict]:
    """Spans of the quotes behind each key point that `credit_from_judgements` counted."""
    out: list[dict] = []
    answer_norm = normalise_text(answer)
    for j in assessment.judgements:
        if not j.met or not 0 <= j.index < len(key_points):
            continue
        if not _quote_verified(j.quote, answer_norm):
            continue
        located = locate_quote(answer, j.quote, min_words=MIN_QUOTE_WORDS)
        if located is not None:
            out.append({
                "key_point": j.index,
                "quote": located.quote,
                "start": located.start,
                "end": located.end,
            })
    out.sort(key=lambda q: q["start"])
    return out


def _outcome_from(
    assessment: FreeResponseAssessment,
    *,
    key_points: list[str],
    answer: str,
    model_name: str,
    prompt_version: str,
    provenance: str,
) -> FreeResponseOutcome:
    credit, met, rejected = credit_from_judgements(assessment, key_points, answer)
    concerns = list(assessment.concerns) + rejected
    quotes = verified_quotes(assessment, key_points, answer)

    if assessment.key_points_insufficient:
        return FreeResponseOutcome(
            credit=None, needs_human=True, model_name=model_name,
            prompt_version=prompt_version,
            confidence=assessment.confidence,
            feedback=(assessment.feedback or "")
            + " A facilitator will confirm the mark, because the marking guide "
            "did not anticipate your answer.",
            concerns=concerns, met_key_points=met, quotes=quotes, provenance=provenance,
        )

    return FreeResponseOutcome(
        credit=round(credit, 4),
        feedback=assessment.feedback,
        # Rejected quotes are evidence the judgement was unreliable.
        confidence=max(0.0, assessment.confidence - 0.2 * len(rejected)),
        model_name=model_name,
        prompt_version=prompt_version,
        concerns=concerns,
        met_key_points=met,
        quotes=quotes,
        provenance=provenance,
    )


def assess_free_response(
    *,
    question: str,
    key_points: list[str],
    model_answer: str,
    answer: str,
    allow_live: bool = True,
    tenant_id: str | None = None,
) -> FreeResponseOutcome:
    if not key_points:
        return FreeResponseOutcome(
            credit=None, needs_human=True, provenance="none",
            feedback="This question has no key points to mark against; it will be reviewed.",
        )
    if len(answer.split()) < MIN_QUOTE_WORDS:
        return FreeResponseOutcome(
            credit=0.0, feedback="The answer is too short to assess.", provenance="none"
        )

    entry = get_prompt_registry().get("free_response")
    settings = get_settings()
    golden = lookup_free_response(question, answer) if cache_applies(tenant_id) else None

    def from_cache() -> FreeResponseOutcome:
        return _outcome_from(
            FreeResponseAssessment(**golden.assessment),
            key_points=key_points, answer=answer, model_name=CACHE_MODEL_NAME,
            prompt_version=entry.metadata.version, provenance="verified_cache",
        )

    if golden is not None and not allow_live:
        return from_cache()

    try:
        from ai.utils.llm_factory import create_llm

        llm = create_llm(timeout=settings.demo_llm_timeout_seconds if golden else None)
    except Exception as exc:
        logger.info("No LLM for free-response scoring (%s).", exc)
        if golden is not None:
            return from_cache()
        return FreeResponseOutcome(
            credit=None, needs_human=True,
            feedback="Your answer is recorded and will be reviewed.",
            concerns=["Automatic scoring unavailable."],
            provenance="none",
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
        if golden is not None:
            return from_cache()
        return FreeResponseOutcome(
            credit=None, needs_human=True, model_name=model_name,
            prompt_version=entry.metadata.version,
            feedback="Your answer is recorded and will be reviewed.",
            concerns=[f"Automatic scoring failed: {result.error}"],
            provenance="none",
        )

    return _outcome_from(
        result.value, key_points=key_points, answer=answer, model_name=model_name,
        prompt_version=entry.metadata.version, provenance="live_model",
    )


__all__ = [
    "FreeResponseOutcome",
    "assess_free_response",
    "credit_from_judgements",
    "verified_quotes",
]
