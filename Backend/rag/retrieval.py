"""Retrieve the approved rubric that grounds an evidence review.

Without this module the evidence reviewer is an LLM offering an opinion about
workplace evidence from its own training. Thesis 2.9 is explicit that this is
the failure mode: "Without Impact's structured capability architecture ...
generic AI remains generic."

With it, a review becomes an assessment against named, versioned, approved
rubric clauses that a manager can click through and an auditor can check. That
difference is the moat, not the model.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.knowledge import KnowledgeDocument, KnowledgeKind
from rag.knowledge_index import get_index

logger = logging.getLogger(__name__)


@dataclass
class Passage:
    """One retrieved rubric clause, with everything needed to cite it."""

    slug: str
    title: str
    kind: str
    body: str
    level: str | None = None
    revision: int = 1
    score: float = 0.0
    via_graph: bool = False
    anchor: bool = False
    """True when fetched by key as a grading criterion, not via retrieval."""

    def as_prompt_block(self) -> str:
        """Rendered for the review prompt. The slug is the citation handle."""
        header = f"[{self.slug}] {self.title}"
        if self.level:
            header += f" (level: {self.level})"
        return f"{header}\n{self.body}"


@dataclass
class Grounding:
    """Retrieved evidence-review grounding, plus why it was retrieved.

    `available=False` means the review must proceed ungrounded, which is a
    governed downgrade: the caller is required to force human review and say so,
    never to quietly emit an ungrounded judgement as if it were grounded.
    """

    available: bool
    passages: list[Passage] = field(default_factory=list)
    query: str = ""
    reason: str = ""
    trace: dict[str, Any] = field(default_factory=dict)
    degraded: bool = False

    @property
    def citation_slugs(self) -> list[str]:
        return [p.slug for p in self.passages]

    def as_prompt_section(self) -> str:
        if not self.passages:
            return "(No approved rubric was retrieved for this capability.)"
        return "\n\n".join(p.as_prompt_block() for p in self.passages)


def build_query(capability_name: str, evidence_title: str, evidence_body: str) -> str:
    """Compose the retrieval query for grounding a review.

    The capability name leads because the rubric is what we are after; a slice
    of the submission follows so that retrieval can prefer the clauses this
    particular evidence bears on. The body is clipped hard - a long submission
    would otherwise swamp the capability terms and drag retrieval toward
    whatever the learner happened to write about.
    """
    excerpt = " ".join(evidence_body.split()[:60])
    return (
        f"{capability_name} evidence rubric and behavioural indicators. "
        f"What distinguishes strong from weak evidence. "
        f"Submission: {evidence_title}. {excerpt}"
    )


async def _anchor_passages(
    session: AsyncSession, *, tenant_id: str, capability_id: str
) -> list[Passage]:
    """The grading criteria, fetched deterministically rather than searched for.

    A capability's evidence rubric is known by construction: it is the approved
    EVIDENCE_RUBRIC documents for that capability. Making the reviewer discover
    them through semantic search is a category error - retrieval exists to find
    what you cannot enumerate, and these are enumerable.

    Doing it this way also removes a real failure mode observed in testing: with
    a weak embedder and no reranker, the STRONG rubric fell out of the top 5 and
    the reviewer would have graded against the insufficient-evidence rubric plus
    an unrelated capability's clause. The grading criteria must not be contingent
    on retrieval quality.
    """
    rows = (
        await session.execute(
            select(KnowledgeDocument)
            .where(
                KnowledgeDocument.tenant_id == tenant_id,
                KnowledgeDocument.capability_id == capability_id,
                KnowledgeDocument.is_approved.is_(True),
                KnowledgeDocument.kind.in_(
                    [KnowledgeKind.EVIDENCE_RUBRIC, KnowledgeKind.CAPABILITY_DEFINITION]
                ),
            )
            .order_by(KnowledgeDocument.kind, KnowledgeDocument.slug)
        )
    ).scalars().all()

    return [
        Passage(
            slug=row.slug,
            title=row.title,
            kind=row.kind.value,
            body=row.body,
            level=row.level,
            revision=row.revision,
            score=1.0,
            anchor=True,
        )
        for row in rows
    ]


async def ground_evidence_review(
    session: AsyncSession,
    *,
    tenant_id: str,
    capability_id: str,
    capability_name: str,
    evidence_title: str,
    evidence_body: str,
) -> Grounding:
    """Retrieve approved rubric passages for one evidence review.

    Two-part construction:

      anchors    the capability's definition and evidence rubrics, fetched by
                 key. Always present, never contingent on retrieval quality.
      retrieved  ARC fills the remaining budget with whatever else bears on this
                 submission - the level indicator it most resembles, the KPI
                 context, a sibling capability the evidence may actually be
                 about.

    Anchors make the review correct; retrieval makes it specific.
    """
    settings = get_settings()

    if not settings.rag_enabled:
        return Grounding(
            available=False,
            reason="Retrieval grounding is disabled (RAG_ENABLED=false).",
        )

    anchors = await _anchor_passages(
        session, tenant_id=tenant_id, capability_id=capability_id
    )

    index = await get_index(session, tenant_id)
    if index is None:
        return Grounding(
            available=bool(anchors),
            passages=anchors,
            reason=(
                ""
                if anchors
                else "No approved knowledge documents exist for this tenant."
            ),
            trace={"anchors_only": True, "reason": "no index"},
        )

    query = build_query(capability_name, evidence_title, evidence_body)
    anchor_slugs = {p.slug for p in anchors}

    try:
        result = index.pipeline.retrieve(query)
        trace = result.trace.to_dict()
        graph_added = set(result.trace.graph_added_ids)
    except Exception as exc:
        logger.warning("Rubric retrieval failed: %s", exc, exc_info=True)
        return Grounding(
            available=bool(anchors),
            passages=anchors,
            query=query,
            reason=f"Retrieval failed ({type(exc).__name__}); anchors only.",
            trace={"anchors_only": True, "error": type(exc).__name__},
            degraded=True,
        )

    # Budget: anchors are non-negotiable, retrieval fills what remains.
    remaining = max(0, settings.rag_rubric_passages - len(anchors))
    retrieved: list[Passage] = []

    for hit in result.hits:
        if len(retrieved) >= remaining:
            break
        doc = index.pipeline.docs.get(hit.doc_id)
        if doc is None or doc.doc_id in anchor_slugs:
            continue
        meta = doc.meta
        retrieved.append(
            Passage(
                slug=doc.doc_id,
                title=meta.get("title", doc.doc_id),
                kind=meta.get("kind", ""),
                body=doc.text,
                level=meta.get("level"),
                revision=int(meta.get("revision", 1)),
                score=float(hit.score),
                via_graph=hit.doc_id in graph_added,
            )
        )

    trace["embedder"] = index.embedder
    trace["reranker"] = index.reranker
    trace["corpus_docs"] = index.doc_count
    trace["graph_edges"] = index.edge_count
    trace["n_anchors"] = len(anchors)
    trace["n_retrieved"] = len(retrieved)
    # The weights were never calibrated on this corpus. The ARC report's single
    # largest finding is that inherited weights underperform fitted ones, so
    # this flag travels with every trace rather than living only in a doc.
    trace["weights_calibrated"] = False

    return Grounding(
        available=bool(anchors or retrieved),
        passages=anchors + retrieved,
        query=query,
        trace=trace,
        degraded=index.degraded,
    )


def _matches_capability(index, slug: str, capability_id: str) -> bool:
    doc = index.pipeline.docs.get(slug)
    return bool(doc and doc.meta.get("capability_id") == capability_id)


async def search_knowledge(
    session: AsyncSession, *, tenant_id: str, query: str, limit: int = 8
) -> Grounding:
    """Free-text search over approved knowledge. Backs the admin explorer UI."""
    index = await get_index(session, tenant_id)
    if index is None:
        return Grounding(available=False, query=query, reason="No approved knowledge.")

    result = index.pipeline.retrieve(query)
    graph_added = set(result.trace.graph_added_ids)

    passages = []
    for hit in result.hits[:limit]:
        doc = index.pipeline.docs.get(hit.doc_id)
        if doc is None:
            continue
        passages.append(
            Passage(
                slug=doc.doc_id,
                title=doc.meta.get("title", doc.doc_id),
                kind=doc.meta.get("kind", ""),
                body=doc.text,
                level=doc.meta.get("level"),
                revision=int(doc.meta.get("revision", 1)),
                score=float(hit.score),
                via_graph=hit.doc_id in graph_added,
            )
        )

    trace = result.trace.to_dict()
    trace.update(
        embedder=index.embedder,
        reranker=index.reranker,
        corpus_docs=index.doc_count,
        graph_edges=index.edge_count,
        weights_calibrated=False,
    )
    return Grounding(
        available=bool(passages),
        passages=passages,
        query=query,
        trace=trace,
        degraded=index.degraded,
    )
