"""Evidence Review graph (Phase 2, Graph 1).

    triage  ->  review  ->  guardrails

`triage` is a cheap deterministic screen that rejects obviously insufficient
submissions before any model call. Beyond correctness this is cost control:
thesis Risk 6 warns that AI cost can scale faster than revenue, and the
cheapest token is the one never sent.

`guardrails` enforces post-conditions the model is asked for but must never be
trusted to honour on its own - human review requirements, confidence bounds,
and the ban on causal ROI claims (thesis 19, Risk 3).

The graph runs without an LLM configured. In that case `review` falls back to a
deterministic heuristic and marks the output `used_fallback`, so the full
pipeline is testable end to end before a provider key exists. Fallback output
always requires human review and can never exceed MODERATE strength.
"""

from __future__ import annotations

import logging
import re

from langgraph.graph import END, StateGraph

from ai.prompt_registry.registry import get_prompt_registry
from ai.schemas.evidence_review import EvidenceReviewOutput, EvidenceStrength
from ai.state.evidence_state import EvidenceReviewState

logger = logging.getLogger(__name__)

# Below this, a submission cannot carry enough specifics to be evidence
# (thesis 16.2). Screened out before any model call.
MIN_CONTENT_CHARS = 120

# Confidence at or above which the model may waive human review, and only when
# it also raised no concerns. Mirrors the instruction in the prompt.
AUTO_REVIEW_WAIVER_CONFIDENCE = 0.85

# Causal and ROI language the system must never emit unchallenged (thesis 19).
# A single bad causal claim in front of a CFO can lose the account.
_CAUSAL_PATTERNS = re.compile(
    r"\b("
    r"caused|causing|resulted in|led to|drove|proves|proven|demonstrates that"
    r"|roi|return on investment|increased revenue|reduced cost|because of this"
    r"|directly (?:improved|increased|reduced)"
    r")\b",
    re.IGNORECASE,
)


def _fallback_review(state: EvidenceReviewState, reason: str) -> EvidenceReviewOutput:
    """Deterministic review used when no model is available.

    Deliberately conservative: never better than MODERATE, always routed to a
    human. It exists so the workflow is exercisable without a provider, not to
    approximate judgement.
    """
    content = state.get("content", "") or ""
    words = len(content.split())
    has_context = bool((state.get("context") or "").strip())

    if words < 40 or not has_context:
        strength = EvidenceStrength.WEAK
    else:
        strength = EvidenceStrength.MODERATE

    return EvidenceReviewOutput(
        summary=(
            "Automated review unavailable; this is a deterministic placeholder "
            "based on submission length and context only."
        ),
        evidence_type_detected=state.get("evidence_type", "other"),
        capability_signals=[],
        strength=strength,
        confidence=0.0,
        concerns=[reason, "No model-based review was performed."],
        recommendation="Manager review required. No AI assessment was produced.",
        requires_human_review=True,
        reasoning=f"Fallback path: {reason}",
    )


# --- Nodes -----------------------------------------------------------------


def triage(state: EvidenceReviewState) -> EvidenceReviewState:
    """Cheap deterministic screen. Rejects non-evidence before spending tokens."""
    content = (state.get("content") or "").strip()
    notes = list(state.get("guardrail_notes", []))

    if len(content) < MIN_CONTENT_CHARS:
        notes.append(
            f"Submission is {len(content)} characters; below the "
            f"{MIN_CONTENT_CHARS}-character floor for reviewable evidence."
        )
        return {
            **state,
            "guardrail_notes": notes,
            "review": EvidenceReviewOutput(
                summary="Submission too short to evaluate as workplace evidence.",
                evidence_type_detected=state.get("evidence_type", "other"),
                capability_signals=[],
                strength=EvidenceStrength.WEAK,
                confidence=0.0,
                concerns=[
                    "Submission lacks the detail needed to show what was done, "
                    "where it was applied, and what changed."
                ],
                recommendation=(
                    "Ask the learner to add specific context, the actions they "
                    "personally took, and an observable outcome."
                ),
                requires_human_review=True,
                reasoning="Screened by triage before model review (thesis 16.2).",
            ),
            "used_fallback": True,
        }

    return {**state, "guardrail_notes": notes}


def review(state: EvidenceReviewState) -> EvidenceReviewState:
    """Run the registered evidence review prompt against the configured model."""
    if state.get("review") is not None:
        return state  # triage already decided

    entry = get_prompt_registry().get("evidence_review")

    try:
        from ai.utils.llm_factory import create_llm

        llm = create_llm()
        structured = llm.with_structured_output(EvidenceReviewOutput)
        chain = entry.template | structured
        result: EvidenceReviewOutput = chain.invoke(
            {
                "learner_id": state.get("learner_id", ""),
                "capability_id": state.get("capability_id", ""),
                "capability_name": state.get("capability_name", ""),
                "evidence_type": state.get("evidence_type", ""),
                "title": state.get("title", ""),
                "content": state.get("content", ""),
                "context": state.get("context", ""),
            }
        )
        model_name = getattr(llm, "model", "") or getattr(llm, "model_name", "")
        return {
            **state,
            "review": result,
            "used_fallback": False,
            "model_name": str(model_name),
            "prompt_name": entry.metadata.name,
            "prompt_version": entry.metadata.version,
        }
    except Exception as exc:
        logger.warning("Evidence review model call failed: %s", exc)
        errors = list(state.get("errors", []))
        errors.append(str(exc))
        return {
            **state,
            "review": _fallback_review(state, f"model unavailable ({type(exc).__name__})"),
            "used_fallback": True,
            "errors": errors,
            "prompt_name": entry.metadata.name,
            "prompt_version": entry.metadata.version,
        }


def guardrails(state: EvidenceReviewState) -> EvidenceReviewState:
    """Enforce governance post-conditions on whatever the model returned.

    The model is instructed to respect these, but instruction is not
    enforcement. Every rule here is a thesis commitment.
    """
    result = state.get("review")
    if result is None:
        return {**state, "review": _fallback_review(state, "no review produced")}

    notes = list(state.get("guardrail_notes", []))
    concerns = list(result.concerns)
    requires_human = result.requires_human_review
    confidence = min(1.0, max(0.0, result.confidence))

    # 1. No unsupported causal or ROI claims (thesis 19, Risk 3).
    prose = " ".join([result.summary, result.recommendation, result.reasoning])
    causal_hits = sorted({m.group(0).lower() for m in _CAUSAL_PATTERNS.finditer(prose)})
    if causal_hits:
        note = (
            "Causal/ROI language detected and flagged for human review: "
            + ", ".join(causal_hits)
        )
        notes.append(note)
        concerns.append(
            "Review text contains causal or ROI phrasing. Capability evidence "
            "supports association, not causation."
        )
        requires_human = True

    # 2. Human review is the default; it may only be waived on a confident,
    #    concern-free review (thesis 16.3, 24).
    if concerns or confidence < AUTO_REVIEW_WAIVER_CONFIDENCE:
        requires_human = True

    # 3. Weak evidence never carries high confidence into the state model.
    if result.strength is EvidenceStrength.WEAK and confidence > 0.5:
        notes.append("Confidence reduced: weak evidence cannot be high-confidence.")
        confidence = 0.5

    # 4. Fallback output is capped and always human-reviewed.
    if state.get("used_fallback"):
        requires_human = True
        confidence = 0.0
        if result.strength is EvidenceStrength.EXCEPTIONAL:
            notes.append("Fallback review capped at moderate strength.")

    return {
        **state,
        "review": result.model_copy(
            update={
                "concerns": concerns,
                "confidence": confidence,
                "requires_human_review": requires_human,
            }
        ),
        "guardrail_notes": notes,
    }


# --- Graph -----------------------------------------------------------------


def build_evidence_review_graph():
    """Compile the evidence review graph.

    Linear by design. Thesis stage 1 rules out autonomous behaviour, so there
    are no loops, no tool calls and no agent deciding its own next step - just
    an auditable pipeline with a human at the end.
    """
    graph = StateGraph(EvidenceReviewState)
    graph.add_node("triage", triage)
    graph.add_node("review", review)
    graph.add_node("guardrails", guardrails)

    graph.set_entry_point("triage")
    graph.add_edge("triage", "review")
    graph.add_edge("review", "guardrails")
    graph.add_edge("guardrails", END)

    return graph.compile()


_compiled = None


def get_evidence_review_graph():
    """Return the process-wide compiled graph."""
    global _compiled
    if _compiled is None:
        _compiled = build_evidence_review_graph()
    return _compiled
