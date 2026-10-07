"""Build and cache an ARC index over approved Capability Spine knowledge.

This is the component thesis 27 Priority 3 asks for: "Build RAG over Impact
knowledge - AI must be grounded in approved Impact capability structures,
rubrics, program logic, and client context."

Three things about this corpus make it a better fit for ARC than the Wikipedia
benchmark the pipeline was measured on, and they are worth stating because they
change which parts of the report transfer:

1. Contextual prefixes are free. The ARC report calls them the largest single
   *indexing* lever but they normally cost one LLM call per chunk. Here the
   documents are authored with titles and a typed kind, so the situating prefix
   is constructed, not generated.

2. Graph edges are explicit and exact. `related_slugs` plus the capability
   foreign key give real structure - capability to indicator to rubric to KPI -
   so `add_explicit_edges` applies. The report: structural edges you already
   have are "the cheapest real accuracy you will find anywhere in the stack".
   No LLM graph build, no co-occurrence guessing.

3. The context budget is genuinely tight. The review prompt carries only
   `rag_rubric_passages` passages, which is the condition under which the report
   found graph expansion actually pays. At a generous window it measured no
   effect at all.

What does NOT transfer: the fitted fusion weights. Those were calibrated on
HotpotQA and the report is emphatic that inherited weights underperform. This
index ships with the class defaults and says so in the trace. See
`Docs/Decisions/ADR-002-retrieval.md`.
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.knowledge import KnowledgeDocument
from hybrid_rag import ARCConfig, ARCPipeline, Doc
from hybrid_rag.graph import EvidenceGraph
from rag.providers import (
    build_embedder,
    build_llm_fn,
    build_reranker,
    embedder_name,
    reranker_name,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class IndexFingerprint:
    """Cheap change detector: rebuild only when approved knowledge moves."""

    count: int
    latest: datetime | None

    @property
    def key(self) -> str:
        return f"{self.count}:{self.latest.isoformat() if self.latest else '-'}"


@dataclass
class TenantIndex:
    pipeline: ARCPipeline
    fingerprint: str
    doc_count: int
    edge_count: int
    embedder: str
    reranker: str

    @property
    def degraded(self) -> bool:
        """True when a fallback is in play and retrieval is weaker than configured."""
        return self.embedder == "LSAEmbedder" or self.reranker == "none"


_CACHE: dict[str, TenantIndex] = {}
_LOCK = threading.Lock()


def _arc_config() -> ARCConfig:
    """ARC configuration for this corpus.

    Deviations from the vendored defaults, each with its reason:

    * `contextualize=False` - the prefix is built from authored metadata in
      `_to_doc`, so the LLM contextualisation pass is redundant here.
    * `rerank_keep` follows `rag_rubric_passages` - a review prompt wants a
      handful of precise rubric clauses, not eight.
    * `graph_budget=2` - the Spine is densely interlinked, so a budget of 3
      pulls in loosely-related material at this corpus size.
    """
    settings = get_settings()
    cfg = ARCConfig()
    cfg.contextualize = False
    cfg.rerank_keep = settings.rag_rubric_passages
    cfg.graph_budget = 2
    return cfg


def _to_doc(row: KnowledgeDocument, capability_names: dict[str, str]) -> Doc:
    """Convert a knowledge row into an ARC document with a free contextual prefix.

    `Doc.indexed_text` prepends `context` before BOTH the dense and sparse index,
    which is the part that matters - it repairs implicit-subject matching for
    BM25 as well as for embeddings.
    """
    capability = capability_names.get(row.capability_id or "", "")
    parts = [p for p in (capability, row.kind.value.replace("_", " "), row.level) if p]
    context = f"{row.title}. {' | '.join(parts)}." if parts else row.title

    return Doc(
        doc_id=row.slug,
        text=row.body,
        context=context,
        meta={
            "title": row.title,
            "kind": row.kind.value,
            "capability_id": row.capability_id,
            "capability_name": capability,
            "level": row.level,
            "kpi_ref": row.kpi_ref,
            "revision": row.revision,
            "related": row.related,
        },
    )


async def _fingerprint(session: AsyncSession, tenant_id: str) -> IndexFingerprint:
    row = (
        await session.execute(
            select(
                func.count(KnowledgeDocument.id),
                func.max(KnowledgeDocument.updated_at),
            ).where(
                KnowledgeDocument.tenant_id == tenant_id,
                KnowledgeDocument.is_approved.is_(True),
            )
        )
    ).one()
    return IndexFingerprint(count=int(row[0] or 0), latest=row[1])


async def build_index(session: AsyncSession, tenant_id: str) -> TenantIndex | None:
    """Build an ARC pipeline over one tenant's approved knowledge.

    Returns None when the tenant has no approved knowledge. That is a real
    state, not an error: a client that has not authored a Spine yet gets
    ungrounded review, and the caller must surface that rather than hide it.
    """
    from app.models import Capability

    rows = (
        await session.execute(
            select(KnowledgeDocument).where(
                KnowledgeDocument.tenant_id == tenant_id,
                KnowledgeDocument.is_approved.is_(True),
            )
        )
    ).scalars().all()

    if not rows:
        logger.warning("Tenant %s has no approved knowledge documents.", tenant_id)
        return None

    capability_names = {
        c.id: c.name
        for c in (
            await session.execute(
                select(Capability).where(Capability.tenant_id == tenant_id)
            )
        ).scalars().all()
    }

    docs = [_to_doc(row, capability_names) for row in rows]

    embedder = build_embedder([d.indexed_text for d in docs])
    reranker = build_reranker()

    # LLM router where a model is available, heuristic otherwise. The report
    # found the heuristic only 68.8% accurate but also that reranking absorbed
    # almost all of that error, so the fallback is survivable rather than fatal.
    router = None
    llm_fn = build_llm_fn(fast=True)
    if llm_fn is not None:
        from hybrid_rag.router import LLMRouter

        router = LLMRouter(llm_fn=llm_fn)

    graph = _build_graph(rows, docs)

    pipeline = ARCPipeline(
        config=_arc_config(),
        embedder=embedder,
        reranker=reranker,
        router=router,
        graph=graph,
    ).index(docs)

    fp = await _fingerprint(session, tenant_id)
    index = TenantIndex(
        pipeline=pipeline,
        fingerprint=fp.key,
        doc_count=len(docs),
        edge_count=graph.n_edges,
        embedder=embedder_name(embedder),
        reranker=reranker_name(reranker),
    )

    logger.info(
        "Built knowledge index for %s: %d docs, %d edges, embedder=%s, reranker=%s",
        tenant_id, index.doc_count, index.edge_count, index.embedder, index.reranker,
    )
    return index


def _build_graph(rows, docs) -> EvidenceGraph:
    """Explicit structural edges only. No LLM, no co-occurrence guessing.

    Three edge families, all exact:
      related_slugs   author-declared links between documents
      capability      documents describing the same capability
      kpi             documents referencing the same KPI
    """
    graph = EvidenceGraph()
    known = {d.doc_id for d in docs}

    declared = [
        (row.slug, target)
        for row in rows
        for target in row.related
        if target in known
    ]
    graph.add_explicit_edges(declared, weight=1.0, kind="declared")

    def _group(attr: str, kind: str, weight: float) -> None:
        buckets: dict[str, list[str]] = {}
        for row in rows:
            value = getattr(row, attr, None)
            if value:
                buckets.setdefault(value, []).append(row.slug)
        for members in buckets.values():
            for i, a in enumerate(members):
                for b in members[i + 1:]:
                    graph.add_explicit_edges([(a, b)], weight=weight, kind=kind)

    _group("capability_id", "same_capability", 0.8)
    _group("kpi_ref", "same_kpi", 0.6)
    return graph


async def get_index(session: AsyncSession, tenant_id: str) -> TenantIndex | None:
    """Cached index for a tenant, rebuilt when approved knowledge changes."""
    fp = await _fingerprint(session, tenant_id)

    cached = _CACHE.get(tenant_id)
    if cached is not None and cached.fingerprint == fp.key:
        return cached

    index = await build_index(session, tenant_id)
    with _LOCK:
        if index is None:
            _CACHE.pop(tenant_id, None)
        else:
            _CACHE[tenant_id] = index
    return index


def invalidate(tenant_id: str | None = None) -> None:
    """Drop cached indexes. Call after approving or editing knowledge."""
    with _LOCK:
        if tenant_id is None:
            _CACHE.clear()
        else:
            _CACHE.pop(tenant_id, None)
