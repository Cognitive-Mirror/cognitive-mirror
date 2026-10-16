"""Approved knowledge endpoints.

Two jobs:

  * make a citation clickable. A review that cites CAP-DS.RUBRIC.STRONG is only
    auditable if a manager can read that clause without leaving the validation
    screen. Citation without retrievability is decoration.
  * expose index health, so a degraded retrieval path is visible in the product
    rather than buried in a server log.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import current_user
from app.database import get_db
from app.models import Capability, KnowledgeDocument, User
from rag.knowledge_index import get_index
from rag.retrieval import search_knowledge

router = APIRouter(prefix="/knowledge", tags=["knowledge"])


class KnowledgeItem(BaseModel):
    slug: str
    kind: str
    title: str
    body: str
    level: str | None
    capability_id: str | None
    kpi_ref: str | None
    revision: int
    related: list[str]
    capability_name: str | None = None
    approved_at: str | None = None


class KnowledgeSummary(BaseModel):
    slug: str
    kind: str
    title: str
    level: str | None
    capability_id: str | None
    revision: int


class IndexStatus(BaseModel):
    """Retrieval health, surfaced to the product rather than hidden in logs."""

    available: bool
    doc_count: int
    edge_count: int
    embedder: str
    reranker: str
    degraded: bool
    # The ARC report's largest single finding is that inherited fusion weights
    # underperform weights fitted to your own corpus. Until a labelled eval set
    # over Impact content exists, these are the inherited defaults and the
    # product says so.
    weights_calibrated: bool = False
    notes: list[str] = []


class ArmScore(BaseModel):
    rank: int
    score: float


class DebugHit(BaseModel):
    """One fused result, with what each retrieval arm thought of it."""

    slug: str
    kind: str
    title: str
    level: str | None
    capability_id: str | None
    fused_rank: int
    fused_score: float
    bm25: ArmScore | None
    dense: ArmScore | None
    via_graph: bool
    excerpt: str


class DebugSearch(BaseModel):
    query: str
    query_class: str
    route_confidence: float
    weights: dict[str, float]
    embedder: str
    reranker: str
    reranked: bool
    early_exit: bool
    graph_added: list[str]
    stage_ms: dict[str, float]
    n_sparse: int
    n_dense: int
    corpus_docs: int
    hits: list[DebugHit]


class SearchHit(BaseModel):
    slug: str
    kind: str
    title: str
    level: str | None
    score: float
    via_graph: bool
    excerpt: str


@router.get("", response_model=list[KnowledgeSummary])
async def list_knowledge(
    capability_id: str | None = Query(default=None),
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_db),
) -> list[KnowledgeSummary]:
    """Approved knowledge for this tenant, optionally scoped to a capability."""
    stmt = select(KnowledgeDocument).where(
        KnowledgeDocument.tenant_id == user.tenant_id,
        KnowledgeDocument.is_approved.is_(True),
    )
    if capability_id:
        stmt = stmt.where(KnowledgeDocument.capability_id == capability_id)

    rows = (await session.execute(stmt.order_by(KnowledgeDocument.slug))).scalars().all()
    return [
        KnowledgeSummary(
            slug=r.slug, kind=str(r.kind), title=r.title, level=r.level,
            capability_id=r.capability_id, revision=r.revision,
        )
        for r in rows
    ]


@router.get("/status", response_model=IndexStatus)
async def index_status(
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_db),
) -> IndexStatus:
    index = await get_index(session, user.tenant_id)

    if index is None:
        return IndexStatus(
            available=False, doc_count=0, edge_count=0, embedder="none",
            reranker="none", degraded=True,
            notes=[
                "No approved knowledge documents exist. Evidence review will run "
                "ungrounded and every result will be routed to a human."
            ],
        )

    notes: list[str] = []
    if index.embedder == "LSAEmbedder":
        notes.append(
            "Running on the local LSA embedder because no embedding credential is "
            "configured. Retrieval quality is materially below the configured provider."
        )
    if index.reranker == "none":
        notes.append(
            "No reranker configured. This removes the largest measured quality "
            "lever and makes query misrouting consequential."
        )
    notes.append(
        "Fusion weights are the inherited class defaults, not fitted to this "
        "corpus. Calibration needs a labelled evaluation set over Impact content."
    )

    return IndexStatus(
        available=True, doc_count=index.doc_count, edge_count=index.edge_count,
        embedder=index.embedder, reranker=index.reranker, degraded=index.degraded,
        notes=notes,
    )


@router.get("/search", response_model=list[SearchHit])
async def search(
    q: str = Query(min_length=2),
    limit: int = Query(default=8, ge=1, le=25),
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_db),
) -> list[SearchHit]:
    """Free-text search over approved knowledge."""
    grounding = await search_knowledge(
        session, tenant_id=user.tenant_id, query=q, limit=limit
    )
    return [
        SearchHit(
            slug=p.slug, kind=p.kind, title=p.title, level=p.level,
            score=round(p.score, 4), via_graph=p.via_graph,
            excerpt=p.body[:400],
        )
        for p in grounding.passages
    ]


@router.get("/search/debug", response_model=DebugSearch)
async def search_debug(
    q: str = Query(min_length=2),
    limit: int = Query(default=8, ge=1, le=25),
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_db),
) -> DebugSearch:
    """The retrieval path evidence review uses, opened up arm by arm.

    BM25 and dense rankings are recomputed side by side for the same query so
    the fused ranking, and anything graph expansion added, can be read against
    them. Read-only; nothing here is used to ground a review.
    """
    index = await get_index(session, user.tenant_id)
    if index is None:
        raise HTTPException(status_code=404, detail="No approved knowledge is indexed.")

    pipeline = index.pipeline
    result = pipeline.retrieve(q)
    trace = result.trace
    k = max(limit, 20)
    sparse = {h.doc_id: (i + 1, h.score) for i, h in enumerate(pipeline.bm25.search(q, k=k))}
    dense = (
        {h.doc_id: (i + 1, h.score) for i, h in enumerate(pipeline.dense.search(q, k=k))}
        if pipeline.dense is not None else {}
    )
    w_sparse, w_dense = pipeline.cfg.weights.get(trace.query_class, (0.5, 0.5))
    graph = set(trace.graph_added_ids)

    hits = []
    for i, h in enumerate(result.hits[:limit]):
        doc = pipeline.docs.get(h.doc_id)
        if doc is None:
            continue
        s_arm, d_arm = sparse.get(h.doc_id), dense.get(h.doc_id)
        hits.append(DebugHit(
            slug=doc.doc_id, kind=doc.meta.get("kind", ""),
            title=doc.meta.get("title", doc.doc_id), level=doc.meta.get("level"),
            capability_id=doc.meta.get("capability_id"),
            fused_rank=i + 1, fused_score=round(float(h.score), 4),
            bm25=ArmScore(rank=s_arm[0], score=round(float(s_arm[1]), 4)) if s_arm else None,
            dense=ArmScore(rank=d_arm[0], score=round(float(d_arm[1]), 4)) if d_arm else None,
            via_graph=h.doc_id in graph, excerpt=doc.text[:300],
        ))

    return DebugSearch(
        query=q, query_class=trace.query_class,
        route_confidence=round(float(trace.route_confidence), 3),
        weights={"bm25": float(w_sparse), "dense": float(w_dense)},
        embedder=index.embedder, reranker=index.reranker, reranked=trace.reranked,
        early_exit=trace.early_exit, graph_added=list(trace.graph_added_ids),
        stage_ms={k: round(v, 2) for k, v in trace.stage_ms.items()},
        n_sparse=trace.n_sparse, n_dense=trace.n_dense, corpus_docs=index.doc_count,
        hits=hits,
    )


@router.get("/{slug}", response_model=KnowledgeItem)
async def get_knowledge(
    slug: str,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_db),
) -> KnowledgeItem:
    """One approved clause. This is what a citation resolves to."""
    row = (
        await session.execute(
            select(KnowledgeDocument).where(
                KnowledgeDocument.tenant_id == user.tenant_id,
                KnowledgeDocument.slug == slug,
                KnowledgeDocument.is_approved.is_(True),
            )
        )
    ).scalar_one_or_none()

    if row is None:
        raise HTTPException(status_code=404, detail="Knowledge document not found.")

    capability = (
        await session.get(Capability, row.capability_id) if row.capability_id else None
    )
    return KnowledgeItem(
        slug=row.slug, kind=str(row.kind), title=row.title, body=row.body,
        level=row.level, capability_id=row.capability_id, kpi_ref=row.kpi_ref,
        revision=row.revision, related=row.related,
        capability_name=capability.name if capability else None,
        approved_at=row.approved_at.isoformat() if row.approved_at else None,
    )
