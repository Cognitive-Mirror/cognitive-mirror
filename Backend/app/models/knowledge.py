"""Approved knowledge documents - the corpus the AI is allowed to retrieve.

Thesis 21 (Stage 1) permits "RAG over approved Impact content, rubrics,
capability structures, and client-specific context". The word doing the work is
*approved*: retrieval must never reach unreviewed text, because thesis 23 asks
of every AI output "did it use only approved sources?" and that question has to
be answerable from the data, not from a promise.

So approval is a column, not a convention. `KnowledgeIndexer` filters on it and
nothing else is indexable.

This table is also tenant-scoped like everything else. A client authors their
own rubrics against their own Capability Spine; one tenant's rubric must never
ground another tenant's evidence review.
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import (
    StrEnumType,
    TenantScoped,
    Timestamped,
    UTCDateTime,
    new_id,
)


class KnowledgeKind(StrEnum):
    """What a knowledge document is, which drives how it is retrieved.

    These map onto the Capability Spine contents listed in thesis 10:
    capabilities, behavioural indicators, proficiency expectations, evidence
    expectations, validation rubrics, outcome linkages.
    """

    CAPABILITY_DEFINITION = "capability_definition"
    BEHAVIOURAL_INDICATOR = "behavioural_indicator"
    EVIDENCE_RUBRIC = "evidence_rubric"
    VALIDATION_GUIDANCE = "validation_guidance"
    KPI_DEFINITION = "kpi_definition"
    PROGRAM_CONTEXT = "program_context"


class KnowledgeDocument(Base, TenantScoped, Timestamped):
    """One retrievable unit of approved Impact knowledge."""

    __tablename__ = "knowledge_documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)

    # Stable human-readable identifier. This is what the AI cites, so it must be
    # legible to a manager reading the review ("CAP-DS.RUBRIC.STRONG"), not a
    # UUID. Citations are only useful if a person can follow them.
    slug: Mapped[str] = mapped_column(String(120), index=True, nullable=False)

    kind: Mapped[KnowledgeKind] = mapped_column(
        StrEnumType(KnowledgeKind, length=48), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)

    # Optional anchor to a capability. Null for corpus-wide material such as a
    # KPI definition shared across capabilities.
    capability_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("capabilities.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    # Which proficiency level this describes, where the document is
    # level-specific (behavioural indicators mostly are).
    level: Mapped[str | None] = mapped_column(String(32), nullable=True)

    kpi_ref: Mapped[str | None] = mapped_column(String(120), nullable=True)

    # --- Governance -------------------------------------------------------
    is_approved: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, index=True,
        doc="Only approved documents are indexed. Unapproved text is invisible to AI.",
    )
    approved_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)

    # Bumped whenever the body changes, so a stored citation can be checked
    # against the text that actually produced it.
    revision: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    # Explicit graph edges, as sibling slugs. Thesis 10 gives the Spine real
    # structure (capability -> KPI -> indicator), and the ARC report is blunt
    # that structural edges you already have are "the cheapest real accuracy you
    # will find anywhere in the stack" - no LLM graph build required.
    related_slugs: Mapped[str] = mapped_column(
        Text, default="", doc="Comma-separated slugs of structurally related documents."
    )

    @property
    def related(self) -> list[str]:
        return [s.strip() for s in self.related_slugs.split(",") if s.strip()]
