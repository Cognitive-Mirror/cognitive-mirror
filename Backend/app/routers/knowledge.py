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

from app.auth import verify_token
from app.database import get_db
from app.models import KnowledgeDocument
from app.routers.evidence import tenant_of
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
    token: dict = Depends(verify_token),
    session: AsyncSession = Depends(get_db),
) -> list[KnowledgeSummary]:
    """Approved knowledge for this tenant, optionally scoped to a capability."""
    stmt = select(KnowledgeDocument).where(
        KnowledgeDocument.tenant_id == tenant_of(token),
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
    token: dict = Depends(verify_token),
    session: AsyncSession = Depends(get_db),
) -> IndexStatus:
    index = await get_index(session, tenant_of(token))

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
    token: dict = Depends(verify_token),
    session: AsyncSession = Depends(get_db),
) -> list[SearchHit]:
    """Free-text search over approved knowledge."""
    grounding = await search_knowledge(
        session, tenant_id=tenant_of(token), query=q, limit=limit
    )
    return [
        SearchHit(
            slug=p.slug, kind=p.kind, title=p.title, level=p.level,
            score=round(p.score, 4), via_graph=p.via_graph,
            excerpt=p.body[:400],
        )
        for p in grounding.passages
    ]


@router.get("/{slug}", response_model=KnowledgeItem)
async def get_knowledge(
    slug: str,
    token: dict = Depends(verify_token),
    session: AsyncSession = Depends(get_db),
) -> KnowledgeItem:
    """One approved clause. This is what a citation resolves to."""
    row = (
        await session.execute(
            select(KnowledgeDocument).where(
                KnowledgeDocument.tenant_id == tenant_of(token),
                KnowledgeDocument.slug == slug,
                KnowledgeDocument.is_approved.is_(True),
            )
        )
    ).scalar_one_or_none()

    if row is None:
        raise HTTPException(status_code=404, detail="Knowledge document not found.")

    return KnowledgeItem(
        slug=row.slug, kind=str(row.kind), title=row.title, body=row.body,
        level=row.level, capability_id=row.capability_id, kpi_ref=row.kpi_ref,
        revision=row.revision, related=row.related,
    )
