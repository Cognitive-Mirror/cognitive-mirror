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

    # --- grounding (retrieved before the graph runs) ---
    rubric_text: str
    """Approved rubric clauses, rendered for the prompt."""
    rubric_slugs: list[str]
    """Slugs supplied to the model. A citation outside this set is a fabrication."""
    grounded: bool
    grounding_reason: str

    # --- demo ---
    allow_live: bool
    """False only when seeding: never spend a model call on seed data."""
    golden_used: bool
    """The verified demo cache supplied the review because the model could not."""

    # --- outputs ---
    review: EvidenceReviewOutput | None
    verified_quotes: list[dict]
    """Quotes located verbatim in the content: {quote, start, end, clause, note}."""
    guardrail_notes: list[str]
    errors: list[str]

    # --- provenance ---
    used_fallback: bool
    structured_method: str
    model_name: str
    prompt_name: str
    prompt_version: str
