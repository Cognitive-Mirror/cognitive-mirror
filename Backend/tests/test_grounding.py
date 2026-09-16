"""Tests for retrieval grounding of evidence review.

Each one pins a governance property, not an implementation detail:

  * the grading rubric is always present, whatever retrieval does
  * only approved knowledge is reachable
  * one tenant's rubric never grounds another tenant's review
  * a review cannot cite a clause it was not given
  * an ungrounded review cannot pass as a grounded one
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from ai.graphs.evidence_review import guardrails
from ai.schemas.evidence_review import EvidenceReviewOutput, EvidenceStrength
from ai.utils.structured import _extract_json_object
from app.database import Base
from app.models import Capability, KnowledgeDocument, KnowledgeKind
from app.schemas.capability import CapabilityClass
from rag import knowledge_index
from rag.retrieval import ground_evidence_review

TENANT = "acme"
OTHER = "rival"
CAP = "cap-x"

LONG_BODY = (
    "I rebuilt the quarterly variance analysis into a one-page decision brief for "
    "the leadership review, led with the recommendation, and stated the condition "
    "under which it would no longer hold. Leadership adopted the revision."
)


def doc(slug, kind, *, tenant=TENANT, capability=CAP, approved=True, body="Body text.",
        level=None, related=""):
    return KnowledgeDocument(
        tenant_id=tenant, slug=slug, kind=kind, title=slug, body=body,
        capability_id=capability, level=level, is_approved=approved,
        approved_by="admin", approved_at=datetime.now(UTC), related_slugs=related,
    )


@pytest_asyncio.fixture
async def session(tmp_path):
    knowledge_index.invalidate()
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path/'g.db'}")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(bind=engine, expire_on_commit=False)

    async with factory() as s:
        s.add_all([
            Capability(id=CAP, tenant_id=TENANT, slug="x", name="Capability X",
                       capability_class=CapabilityClass.ANALYTICAL),
            doc("CAP-X.DEF", KnowledgeKind.CAPABILITY_DEFINITION,
                body="Capability X is about framing a decision."),
            doc("CAP-X.RUBRIC.STRONG", KnowledgeKind.EVIDENCE_RUBRIC, level="strong",
                body="Strong evidence names the trade-off and the outcome."),
            doc("CAP-X.RUBRIC.INSUFFICIENT", KnowledgeKind.EVIDENCE_RUBRIC, level="weak",
                body="Weak evidence asserts a result with no observable marker."),
            doc("CAP-X.IND.COMPETENT", KnowledgeKind.BEHAVIOURAL_INDICATOR,
                level="competent", body="At competent the person states the assumption."),
            doc("CAP-X.DRAFT", KnowledgeKind.EVIDENCE_RUBRIC, approved=False,
                body="UNAPPROVED DRAFT that must never be retrieved."),
        ])
        await s.commit()

    async with factory() as s:
        yield s
    knowledge_index.invalidate()
    await engine.dispose()


async def _ground(session):
    return await ground_evidence_review(
        session, tenant_id=TENANT, capability_id=CAP, capability_name="Capability X",
        evidence_title="A decision brief", evidence_body=LONG_BODY,
    )


# --- Anchors ---------------------------------------------------------------


@pytest.mark.asyncio
async def test_grading_rubric_is_always_present(session):
    """The criteria must not depend on retrieval quality.

    Observed in development: with a weak embedder and no reranker the STRONG
    rubric fell out of the top 5 and the reviewer would have graded against the
    insufficient-evidence rubric alone.
    """
    grounding = await _ground(session)
    slugs = grounding.citation_slugs

    assert "CAP-X.RUBRIC.STRONG" in slugs
    assert "CAP-X.RUBRIC.INSUFFICIENT" in slugs
    assert "CAP-X.DEF" in slugs


@pytest.mark.asyncio
async def test_anchors_are_marked_as_anchors(session):
    grounding = await _ground(session)
    anchors = [p for p in grounding.passages if p.anchor]
    assert {p.slug for p in anchors} >= {"CAP-X.RUBRIC.STRONG", "CAP-X.RUBRIC.INSUFFICIENT"}


# --- Approval gate ---------------------------------------------------------


@pytest.mark.asyncio
async def test_unapproved_documents_are_never_retrieved(session):
    """Thesis 21: RAG over *approved* content. Approval is enforced, not assumed."""
    grounding = await _ground(session)
    assert "CAP-X.DRAFT" not in grounding.citation_slugs
    for passage in grounding.passages:
        assert "UNAPPROVED" not in passage.body


@pytest.mark.asyncio
async def test_index_excludes_unapproved_documents(session):
    index = await knowledge_index.get_index(session, TENANT)
    assert index is not None
    assert "CAP-X.DRAFT" not in index.pipeline.docs


# --- Tenant isolation ------------------------------------------------------


@pytest.mark.asyncio
async def test_another_tenants_rubric_is_unreachable(session):
    session.add(doc("RIVAL.SECRET", KnowledgeKind.EVIDENCE_RUBRIC, tenant=OTHER,
                    capability=None, body="Rival proprietary rubric."))
    await session.flush()
    knowledge_index.invalidate()

    grounding = await _ground(session)
    assert "RIVAL.SECRET" not in grounding.citation_slugs


@pytest.mark.asyncio
async def test_tenant_with_no_knowledge_gets_no_index(session):
    assert await knowledge_index.get_index(session, "empty-tenant") is None


# --- Trace honesty ---------------------------------------------------------


@pytest.mark.asyncio
async def test_trace_declares_weights_are_uncalibrated(session):
    """The ARC report's largest finding is that inherited weights underperform
    fitted ones. That caveat travels with every trace, not just in a document."""
    grounding = await _ground(session)
    assert grounding.trace.get("weights_calibrated") is False


@pytest.mark.asyncio
async def test_trace_records_which_providers_ran(session):
    grounding = await _ground(session)
    assert grounding.trace.get("embedder")
    assert "reranker" in grounding.trace


# --- Guardrails ------------------------------------------------------------


def _review(**kwargs) -> EvidenceReviewOutput:
    base = dict(
        summary="Summary.", evidence_type_detected="workplace_application",
        capability_signals=[], strength=EvidenceStrength.STRONG, confidence=0.9,
        concerns=[], recommendation="Proceed.", requires_human_review=False,
        reasoning="Because.", rubric_citations=[], grounded=True,
    )
    base.update(kwargs)
    return EvidenceReviewOutput(**base)


def test_fabricated_citations_are_stripped():
    """A model may not cite a clause it was never shown."""
    state = {
        "review": _review(rubric_citations=["CAP-X.RUBRIC.STRONG", "CAP-X.INVENTED"]),
        "rubric_slugs": ["CAP-X.RUBRIC.STRONG"],
        "grounded": True,
    }
    out = guardrails(state)
    assert out["review"].rubric_citations == ["CAP-X.RUBRIC.STRONG"]
    assert out["review"].requires_human_review is True
    assert any("not present in the supplied rubric" in n for n in out["guardrail_notes"])


def test_ungrounded_review_is_forced_to_human_and_capped():
    state = {
        "review": _review(confidence=0.95),
        "rubric_slugs": [],
        "grounded": False,
        "grounding_reason": "no approved knowledge",
    }
    out = guardrails(state)
    assert out["review"].requires_human_review is True
    assert out["review"].confidence <= 0.3
    assert out["review"].grounded is False


def test_grounded_review_citing_nothing_is_flagged():
    state = {
        "review": _review(rubric_citations=[], confidence=0.95),
        "rubric_slugs": ["CAP-X.RUBRIC.STRONG"],
        "grounded": True,
    }
    out = guardrails(state)
    assert out["review"].requires_human_review is True
    assert out["review"].confidence <= 0.4
    assert any("cited no rubric clause" in n for n in out["guardrail_notes"])


def test_valid_citations_survive():
    state = {
        "review": _review(rubric_citations=["CAP-X.RUBRIC.STRONG"], confidence=0.9),
        "rubric_slugs": ["CAP-X.RUBRIC.STRONG", "CAP-X.DEF"],
        "grounded": True,
    }
    out = guardrails(state)
    assert out["review"].rubric_citations == ["CAP-X.RUBRIC.STRONG"]
    assert out["review"].grounded is True


# --- Structured output repair ----------------------------------------------


class TestJSONExtraction:
    """NVIDIA-hosted models frequently wrap JSON in prose or fencing."""

    def test_bare_object(self):
        assert _extract_json_object('{"a": 1}') == '{"a": 1}'

    def test_fenced_block(self):
        raw = 'Here you go:\n```json\n{"a": 1}\n```\nHope that helps.'
        assert _extract_json_object(raw) == '{"a": 1}'

    def test_object_wrapped_in_prose(self):
        raw = 'Sure! {"a": 1, "b": "x"} Let me know if you need more.'
        assert _extract_json_object(raw) == '{"a": 1, "b": "x"}'

    def test_nested_objects_are_not_truncated(self):
        """A greedy regex breaks here; capability_signals is nested."""
        raw = 'text {"a": {"b": {"c": 1}}, "d": 2} more'
        assert _extract_json_object(raw) == '{"a": {"b": {"c": 1}}, "d": 2}'

    def test_braces_inside_strings_do_not_confuse_matching(self):
        raw = '{"note": "use {curly} braces", "n": 1}'
        assert _extract_json_object(raw) == raw

    def test_escaped_quote_inside_string(self):
        raw = '{"note": "he said \\"hi\\"", "n": 1}'
        assert _extract_json_object(raw) == raw

    def test_no_json_returns_none(self):
        assert _extract_json_object("I cannot help with that.") is None

    def test_empty_returns_none(self):
        assert _extract_json_object("") is None
