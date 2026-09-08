"""State passed between nodes of the evidence review graph."""

from __future__ import annotations

from typing import TypedDict

from ai.schemas.evidence_review import EvidenceReviewOutput


class EvidenceReviewState(TypedDict, total=False):
    """Working state for one evidence review run.

    Inputs are populated by the caller; the graph fills in the rest. Keeping
    every intermediate on the state (rather than in closures) is what makes a
    run reconstructable from its trace, which the governance requirements in
    thesis 23 depend on.
    """

    # --- inputs ---
    tenant_id: str
    evidence_id: str
    learner_id: str
    capability_id: str
    capability_name: str
    evidence_type: str
    title: str
    content: str
    context: str

    # --- outputs ---
    review: EvidenceReviewOutput | None
    guardrail_notes: list[str]
    errors: list[str]

    # --- provenance ---
    used_fallback: bool
    model_name: str
    prompt_name: str
    prompt_version: str
