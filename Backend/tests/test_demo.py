"""Demo tooling: reset, personas, the verified golden cache, and artifacts.

The demo is a client-facing claim about the product, so these tests hold it to
the product's own rules:

  * every cached evaluation survives the SAME verifiers as live model output,
  * the persona header cannot reach any tenant but the demo one,
  * each seeded archetype's state is the Capability State Model's own output,
  * provenance (live / cached / fallback) is never hidden.
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError

from ai.demo_cache import (
    ELEARN_OPEN_QUESTION,
    EVIDENCE,
    EVIDENCE_BY_KEY,
    FREE_BY_KEY,
    FREE_RESPONSES,
    POST_OPEN_KEY_POINTS,
    POST_OPEN_QUESTION,
)
from ai.graphs.evidence_review import guardrails
from ai.schemas.evidence_review import EvidenceReviewOutput
from ai.schemas.free_response import FreeResponseAssessment
from ai.services.free_response_scoring import credit_from_judgements, verified_quotes
from ai.utils.quotes import locate_quote
from app.config import Settings, get_settings
from app.models import Capability, Role
from app.schemas.capability import CapabilityClass
from app.services.urls import ArtifactError, classify_artifacts, classify_url
from tests.conftest import TENANT, make_user

DEMO = "apex-demo"
PRIYA = "priya.nair@demo.local"
ARJUN = "arjun.mehta@demo.local"
DEV = "manager@demo.local"
SARAH = "admin@demo.local"
HEADER = "X-Demo-Persona-Email"


def _anchors(slug: str) -> set[str]:
    prefix = {"stakeholder-influence": "CAP-SI", "strategic-decision-making": "CAP-SDM",
              "data-storytelling": "CAP-DS"}[slug]
    return {f"{prefix}.DEF", f"{prefix}.RUBRIC.STRONG", f"{prefix}.RUBRIC.INSUFFICIENT"}


# --- The golden cache passes the production verifiers --------------------------------


@pytest.mark.parametrize("entry", EVIDENCE, ids=lambda e: e.key)
def test_every_cached_evidence_review_survives_the_guardrails(entry):
    state = guardrails({
        "content": entry.content,
        "review": EvidenceReviewOutput(**entry.review),
        "rubric_slugs": sorted(_anchors(entry.capability_slug)),
        "grounded": True,
        "guardrail_notes": [],
    })
    out = state["review"]
    # Nothing stripped, nothing flagged: the cached output is clean by the same
    # rules a live model is held to.
    assert out.rubric_citations == entry.review["rubric_citations"]
    assert len(state["verified_quotes"]) == len(entry.review["evidence_quotes"])
    assert state["guardrail_notes"] == []
    assert out.requires_human_review is True
    for q in state["verified_quotes"]:
        assert entry.content[q["start"]:q["end"]] == q["quote"]
        assert q["clause"] in _anchors(entry.capability_slug)


def test_guardrail_drops_a_fabricated_quote():
    entry = EVIDENCE_BY_KEY["si-sample-strong"]
    review = dict(entry.review)
    review["evidence_quotes"] = review["evidence_quotes"] + [
        {"quote": "I single-handedly saved the company", "rubric_citation": "CAP-SI.DEF"},
    ]
    state = guardrails({
        "content": entry.content, "review": EvidenceReviewOutput(**review),
        "rubric_slugs": sorted(_anchors(SI_SLUG)), "grounded": True, "guardrail_notes": [],
    })
    assert len(state["verified_quotes"]) == len(entry.review["evidence_quotes"])
    assert any("not found verbatim" in n for n in state["guardrail_notes"])
    assert any("do not appear in the submission" in c for c in state["review"].concerns)


SI_SLUG = "stakeholder-influence"


def _key_points(question: str) -> list[str]:
    if question == POST_OPEN_QUESTION:
        return POST_OPEN_KEY_POINTS
    from scripts.seed_learning import ACTIVITIES

    [item] = [i for a in ACTIVITIES for i in a["items"] if i["prompt"] == ELEARN_OPEN_QUESTION]
    return item["key"]["key_points"]


EXPECTED_CREDIT = {
    "elearn-open-strong": 1.0, "elearn-open-weak": 0.0,
    "post-open-strong": 1.0, "post-open-weak": 0.25,
}


@pytest.mark.parametrize("entry", FREE_RESPONSES, ids=lambda e: e.key)
def test_every_cached_open_answer_verifies_against_the_real_key_points(entry):
    key_points = _key_points(entry.question)
    assessment = FreeResponseAssessment(**entry.assessment)
    credit, met, rejected = credit_from_judgements(assessment, key_points, entry.answer)
    assert rejected == []
    assert credit == EXPECTED_CREDIT[entry.key]
    quotes = verified_quotes(assessment, key_points, entry.answer)
    assert [q["key_point"] for q in quotes] == sorted(met, key=lambda i: next(
        q["start"] for q in quotes if q["key_point"] == i))
    for q in quotes:
        assert entry.answer[q["start"]:q["end"]] == q["quote"]


def test_quote_locator_maps_back_to_the_original_text():
    text = "We met the Ops Lead, one-to-one, before Thursday's meeting."
    located = locate_quote(text, "ops lead one to one before")
    assert located and text[located.start:located.end] == "Ops Lead, one-to-one, before"
    assert locate_quote(text, "we confronted them in the room") is None
    assert locate_quote(text, "the ops") is None  # too short to evidence anything


# --- Settings and provider resolution -------------------------------------------------


def test_demo_mode_is_refused_outside_development():
    with pytest.raises(ValidationError):
        Settings(environment="production", demo_mode=True)
    assert Settings(environment="production").demo_enabled is False
    assert Settings(environment="development").demo_enabled is True
    assert Settings(environment="development", demo_mode=False).demo_enabled is False


def test_vendor_key_is_used_when_no_llm_key_is_set():
    from ai.config import resolve_endpoint, sends_reasoning_switch

    groq = resolve_endpoint(Settings(llm_api_key="", groq_api_key="gk"))
    assert (groq.vendor, groq.builder, groq.api_key) == ("groq", "openai", "gk")
    assert "groq.com" in groq.base_url
    assert not sends_reasoning_switch(groq.base_url)

    explicit = resolve_endpoint(Settings(llm_api_key="lk", groq_api_key="gk"))
    assert explicit.api_key == "lk"

    pinned = resolve_endpoint(Settings(gemini_api_key="g", llm_model_name="my-model"))
    assert (pinned.vendor, pinned.model) == ("gemini", "my-model")

    nvidia = resolve_endpoint(Settings(llm_api_key="k", llm_base_url="https://integrate.api.nvidia.com/v1"))
    assert nvidia.vendor == "nvidia" and sends_reasoning_switch(nvidia.base_url)

    assert resolve_endpoint(Settings()).vendor == "none"


# --- Artifacts ---------------------------------------------------------------------------


def test_artifact_kinds_come_from_the_url_not_the_client():
    assert classify_url("https://github.com/org/repo/pull/12") == "github"
    assert classify_url("https://acme.atlassian.net/browse/OPS-1") == "ticket"
    assert classify_url("https://www.loom.com/share/abc") == "video"
    assert classify_url("https://docs.google.com/document/d/x") == "docs"
    assert classify_url("https://wiki.example.com/postmortem/42") == "docs"
    assert classify_url("https://example.com/") == "link"
    out = classify_artifacts([{"url": "https://github.com/a/b/pull/1", "kind": "video"}])
    assert out[0]["kind"] == "github"
    for bad in ("javascript:alert(1)", "data:text/html,x", "/relative", "ftp://x.y/z"):
        with pytest.raises(ArtifactError):
            classify_artifacts([{"url": bad}])


# --- HTTP: reset, personas, archetypes --------------------------------------------------


@pytest_asyncio.fixture
async def demo(db):
    """A client with NO token override, so the persona header is what authenticates."""
    from app.database import get_db
    from app.routers.learning import background_session_factory
    from main import app

    async def override_db():
        async with db() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[background_session_factory] = lambda: db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r = await client.post("/api/demo/reset")
        assert r.status_code == 200, r.text
        client.report = r.json()
        yield client
    app.dependency_overrides.clear()


def as_(email: str) -> dict:
    return {HEADER: email}


@pytest.mark.asyncio
async def test_reset_seeds_the_apex_tenant(demo):
    report = demo.report
    assert report["tenant_id"] == DEMO and report["org_name"] == "Apex Systems Engineering"
    assert report["personas"] == 6
    assert report["evidence"] == 7 and report["pending_validation"] == 1
    assert report["audit_events"] > 20


@pytest.mark.asyncio
async def test_reset_is_repeatable_and_restores_state_after_demo_actions(demo):
    pending = (await demo.get("/evidence/pending", headers=as_(DEV))).json()
    r = await demo.post(
        f"/evidence/{pending[0]['evidence_id']}/validate",
        json={"decision": "approved", "strength": "strong"}, headers=as_(DEV),
    )
    assert r.status_code == 200
    assert (await demo.get("/evidence/pending", headers=as_(DEV))).json() == []

    again = (await demo.post("/api/demo/reset")).json()
    assert again["evidence"] == demo.report["evidence"]
    assert again["audit_events"] == demo.report["audit_events"]
    assert len((await demo.get("/evidence/pending", headers=as_(DEV))).json()) == 1


@pytest.mark.asyncio
async def test_reset_never_touches_another_tenant(db, demo):
    async with db() as session:
        session.add(Capability(id="cap-real", tenant_id=TENANT, slug="real", name="Real",
                               capability_class=CapabilityClass.ANALYTICAL))
        session.add(make_user("real-person", Role.LEARNER))
        await session.commit()
    assert (await demo.post("/api/demo/reset")).status_code == 200
    async with db() as session:
        assert await session.get(Capability, "cap-real") is not None


@pytest.mark.asyncio
async def test_persona_header_acts_as_the_demo_user(demo):
    me = (await demo.get("/auth/me", headers=as_(PRIYA))).json()
    assert me["display_name"] == "Priya Nair" and me["role"] == "learner"
    assert me["tenant_id"] == DEMO
    assert (await demo.get("/auth/me", headers=as_(DEV))).json()["role"] == "manager"
    assert (await demo.get("/auth/me", headers=as_(SARAH))).json()["role"] == "admin"


@pytest.mark.asyncio
async def test_persona_header_cannot_reach_a_real_tenant(db, demo):
    async with db() as session:
        session.add(make_user("real-admin", Role.ADMIN))
        await session.commit()
    # A real user's email, in a real tenant: not a persona, so refused.
    r = await demo.get("/auth/me", headers=as_("real-admin@example.test"))
    assert r.status_code == 401
    assert (await demo.get("/auth/me", headers=as_("nobody@demo.local"))).status_code == 401
    # No header and no token is still a 401.
    assert (await demo.get("/auth/me")).status_code == 401


@pytest.mark.asyncio
async def test_without_demo_mode_the_header_and_routes_do_not_exist(demo, monkeypatch):
    monkeypatch.setenv("DEMO_MODE", "false")
    get_settings.cache_clear()
    try:
        assert (await demo.get("/auth/me", headers=as_(PRIYA))).status_code == 401
        assert (await demo.get("/api/demo/personas")).status_code == 404
        assert (await demo.post("/api/demo/reset")).status_code == 404
    finally:
        monkeypatch.delenv("DEMO_MODE")
        get_settings.cache_clear()


async def _focus(demo, email: str, capability: str) -> dict:
    states = (await demo.get("/capabilities/me", headers=as_(email))).json()
    return next(s for s in states if s["capability_name"] == capability)


@pytest.mark.asyncio
async def test_archetypes_are_the_state_models_own_output(demo):
    elena = await _focus(demo, "elena.rostova@demo.local", "Strategic decision making")
    assert elena["attained_level"] == "competent" and elena["confidence_band"] == "high"
    assert elena["state_confidence"] == pytest.approx(0.88, abs=0.01)
    assert elena["independent_contexts"] == 3 and elena["gap"] == 0

    arjun = await _focus(demo, ARJUN, "Stakeholder influence")
    assert arjun["knowledge_mastery"] == 1.0
    assert arjun["attained_level"] == "novice" and arjun["state_confidence"] == 0.0
    assert arjun["knowing_doing"] == "knows_not_applied"

    marcus = await _focus(demo, "marcus.vance@demo.local", "Stakeholder influence")
    assert marcus["attained_level"] == "competent"          # the level stands (D1)
    assert marcus["current_support_level"] == "novice"      # decayed evidence supports less
    assert marcus["needs_revalidation"] and marcus["confidence_band"] == "revalidation_due"
    assert marcus["knowing_doing"] == "applied_without_knowledge"
    assert marcus["knowledge_post"] == 0.25

    priya = await _focus(demo, PRIYA, "Stakeholder influence")
    assert priya["attained_level"] == "novice" and priya["state_confidence"] == 0.0
    assert priya["provisional_points"] > 1.9
    assert priya["required_level"] == "proficient"
    assert priya["required_level_source"] == "tenant_role"


@pytest.mark.asyncio
async def test_validating_priya_unlocks_confidence_and_is_audited(demo):
    [item] = (await demo.get("/evidence/pending", headers=as_(DEV))).json()
    assert item["learner_name"] == "Priya Nair"
    assert {a["kind"] for a in item["artifacts"]} == {"github", "video", "ticket"}
    review = item["review"]
    assert review["provenance"] == "verified_cache" and review["grounded"]
    assert review["verified_quotes"] and review["citation_details"][0]["anchor"] is True

    state = (await demo.post(
        f"/evidence/{item['evidence_id']}/validate",
        json={"decision": "approved", "strength": "strong", "feedback": "Saw it."},
        headers=as_(DEV),
    )).json()
    assert state["attained_level"] == "developing"
    assert state["state_confidence"] > 0.40

    caps = (await demo.get("/capabilities", headers=as_(PRIYA))).json()
    si = next(c for c in caps if c["name"] == "Stakeholder influence")
    trail = (await demo.get(f"/capabilities/{si['id']}/audit", headers=as_(PRIYA))).json()
    kinds = [e["kind"] for e in trail["events"]]
    assert "evidence_submitted" in kinds and "manager_validation" in kinds
    unlocked = [e for e in trail["events"] if e["confidence_unlocked"]]
    assert unlocked and unlocked[-1]["validation"]["manager_name"] == "Dev Malhotra"
    # The manager sees the same trail; a peer does not.
    assert (await demo.get(
        f"/capabilities/{si['id']}/audit?learner_id={trail['subject_id']}", headers=as_(DEV)
    )).status_code == 200
    assert (await demo.get(
        f"/capabilities/{si['id']}/audit?learner_id={trail['subject_id']}", headers=as_(ARJUN)
    )).status_code == 403


@pytest.mark.asyncio
async def test_canonical_sample_is_reviewed_from_the_verified_cache(demo):
    sample = next(
        s for s in (await demo.get("/api/demo/samples")).json()["evidence"]
        if s["key"] == "si-sample-strong"
    )
    caps = (await demo.get("/capabilities", headers=as_(ARJUN))).json()
    si = next(c for c in caps if c["slug"] == sample["capability_slug"])
    r = await demo.post("/evidence", headers=as_(ARJUN), json={
        "capability_id": si["id"], "evidence_type": "workplace_application",
        "title": sample["title"], "content": sample["content"], "context": sample["context"],
        "context_ref": sample["context_ref"], "artifacts": sample["artifacts"],
    })
    assert r.status_code == 201, r.text
    review = r.json()["review"]
    assert review["model_name"] == "demo-cache:golden-v1"
    assert review["provenance"] == "verified_cache"
    assert review["strength"] == "strong"
    assert len(review["verified_quotes"]) == 4
    mine = (await demo.get("/evidence/mine", headers=as_(ARJUN))).json()
    assert mine[0]["artifacts"][0]["kind"] == "ticket"


@pytest.mark.asyncio
async def test_a_live_model_answer_wins_over_the_cache(demo, monkeypatch):
    live = EvidenceReviewOutput(**{
        **EVIDENCE_BY_KEY["si-sample-strong"].review, "summary": "LIVE MODEL SAID THIS",
    })

    class FakeLLM:
        model = "fake-live-model"

        def with_structured_output(self, schema):
            return self

        def invoke(self, _):
            return live

    monkeypatch.setattr("ai.utils.llm_factory.create_llm", lambda **_: FakeLLM())
    sample = EVIDENCE_BY_KEY["si-sample-strong"]
    caps = (await demo.get("/capabilities", headers=as_(ARJUN))).json()
    si = next(c for c in caps if c["slug"] == sample.capability_slug)
    review = (await demo.post("/evidence", headers=as_(ARJUN), json={
        "capability_id": si["id"], "evidence_type": "workplace_application",
        "title": sample.title, "content": sample.content,
    })).json()["review"]
    assert review["summary"] == "LIVE MODEL SAID THIS"
    assert review["provenance"] == "live_model"


@pytest.mark.asyncio
async def test_text_the_presenter_types_is_never_served_from_the_cache(demo):
    caps = (await demo.get("/capabilities", headers=as_(ARJUN))).json()
    review = (await demo.post("/evidence", headers=as_(ARJUN), json={
        "capability_id": caps[0]["id"], "evidence_type": "workplace_application",
        "title": "Something I typed live",
        "content": "A " + "genuinely new piece of evidence typed during the call. " * 4,
    })).json()["review"]
    assert review["provenance"] == "fallback"


@pytest.mark.asyncio
async def test_unsafe_artifact_urls_are_refused(demo):
    caps = (await demo.get("/capabilities", headers=as_(ARJUN))).json()
    r = await demo.post("/evidence", headers=as_(ARJUN), json={
        "capability_id": caps[0]["id"], "evidence_type": "workplace_application",
        "title": "Bad link", "content": "x" * 130,
        "artifacts": [{"url": "javascript:alert(document.cookie)"}],
    })
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_post_assessment_open_answer_is_marked_with_verified_quotes(demo):
    acts = (await demo.get("/learning/activities", headers=as_(PRIYA))).json()
    post = next(a for a in acts if a["phase"] == "post")
    detail = (await demo.get(f"/learning/activities/{post['id']}", headers=as_(PRIYA))).json()
    assert "key_points" not in str(detail)
    open_item = next(i for i in detail["items"] if i["item_type"] == "free_response")
    responses = {open_item["id"]: {"text": FREE_BY_KEY["post-open-strong"].answer}}
    r = await demo.post(f"/learning/activities/{post['id']}/attempts",
                        json={"responses": responses}, headers=as_(PRIYA))
    assert r.status_code == 201
    result = (await demo.get(f"/learning/attempts/{r.json()['attempt_id']}",
                             headers=as_(PRIYA))).json()
    marked = next(i for i in result["items"] if i["item_id"] == open_item["id"])
    assert marked["scored_by"] == "ai" and marked["credit"] == 1.0
    detail = marked["ai_detail"]
    assert detail["provenance"] == "verified_cache" and len(detail["quotes"]) == 4
    answer = FREE_BY_KEY["post-open-strong"].answer
    assert all(answer[q["start"]:q["end"]] == q["quote"] for q in detail["quotes"])
    # Assessments never reveal key point text.
    assert marked["reveal"] is None


@pytest.mark.asyncio
async def test_supervisor_views_and_governance_matrix(demo):
    members = (await demo.get("/capabilities/team/members", headers=as_(DEV))).json()
    assert {m["display_name"] for m in members} == {
        "Priya Nair", "Arjun Mehta", "Elena Rostova", "Marcus Vance"
    }
    assert (await demo.get("/capabilities/team/members", headers=as_(PRIYA))).status_code == 403

    matrix = (await demo.get("/capabilities/matrix", headers=as_(SARAH))).json()
    assert matrix["approved_clause_count"] == 27
    assert sum(len(c["clauses"]) for c in matrix["capabilities"]) + len(
        matrix["shared_clauses"]) == 27
    assert matrix["resolution_order"] == ["spine_default", "tenant_role", "program_target"]
    si = next(c for c in matrix["capabilities"] if c["slug"] == "stakeholder-influence")
    assert [r["source"] for r in si["requirements"]] == ["spine_default", "tenant_role"]
    assert si["coverage"]["subject_count"] == 4
    assert sum(si["coverage"]["distribution"].values()) == 4
    # Only Marcus has validated work that decayed; untouched capabilities are not "due".
    assert si["coverage"]["revalidation_due_count"] == 1
    ds = next(c for c in matrix["capabilities"] if c["slug"] == "data-storytelling")
    assert ds["coverage"]["revalidation_due_count"] == 0
    team = (await demo.get("/capabilities/team", headers=as_(DEV))).json()
    assert sum(t["revalidation_due_count"] for t in team) == 1

    debug = (await demo.get("/knowledge/search/debug?q=what+counts+as+weak+evidence",
                            headers=as_(SARAH))).json()
    assert debug["hits"] and debug["corpus_docs"] == 27
    assert any(h["bm25"] or h["dense"] for h in debug["hits"])

    clause = (await demo.get("/knowledge/CAP-SI.RUBRIC.STRONG", headers=as_(PRIYA))).json()
    assert clause["capability_name"] == "Stakeholder influence"


@pytest.mark.asyncio
async def test_personas_samples_and_ai_status(demo):
    body = (await demo.get("/api/demo/personas")).json()
    assert body["seeded"] and len(body["personas"]) == 6
    priya = next(p for p in body["personas"] if p["key"] == "priya")
    assert priya["summary"]["provisional_points"] > 0

    samples = (await demo.get("/api/demo/samples")).json()
    assert {s["strength"] for s in samples["free_response"]} == {"strong", "weak"}
    assert {s["capability_slug"] for s in samples["evidence"]} == {
        "stakeholder-influence", "strategic-decision-making", "data-storytelling"
    }

    status = (await demo.get("/api/demo/ai-status?probe=true")).json()
    assert status["key_configured"] is False
    assert status["probe"]["ok"] is False and status["probe"]["error_kind"] == "missing_key"


# --- Resilience: a slow or refusing model must not stall the demo -------------------


class APITimeoutError(Exception):  # noqa: N818 - mirrors openai's class name
    """Stands in for openai.APITimeoutError; matched by class name."""


def test_structured_call_does_not_retry_an_endpoint_that_timed_out():
    from ai.utils.structured import invoke_structured

    calls = []

    class Slow:
        def with_structured_output(self, schema):
            return self

        def invoke(self, _):
            calls.append(1)
            raise APITimeoutError("timed out")

    result = invoke_structured(Slow(), "prompt", EvidenceReviewOutput)
    assert not result.ok and len(calls) == 1  # one ceiling, not two


def test_structured_call_still_falls_back_when_tool_calling_is_unsupported():
    from ai.utils.structured import invoke_structured

    body = EVIDENCE_BY_KEY["si-sample-strong"].review

    class NoTools:
        def with_structured_output(self, schema):
            raise NotImplementedError("no tool calling")

        def invoke(self, _):
            import json

            return type("R", (), {"content": "Here you go:\n" + json.dumps(body)})()

    result = invoke_structured(NoTools(), "prompt", EvidenceReviewOutput)
    assert result.ok and result.method == "json_extracted"


@pytest.mark.asyncio
async def test_a_slow_model_call_does_not_block_other_requests(demo, monkeypatch):
    import asyncio
    import time

    class SlowLLM:
        model = "slow"

        def with_structured_output(self, schema):
            return self

        def invoke(self, _):
            time.sleep(0.8)  # a synchronous provider SDK waiting on the network
            return EvidenceReviewOutput(**EVIDENCE_BY_KEY["si-sample-strong"].review)

    monkeypatch.setattr("ai.utils.llm_factory.create_llm", lambda **_: SlowLLM())
    sample = EVIDENCE_BY_KEY["si-sample-strong"]
    caps = (await demo.get("/capabilities", headers=as_(ARJUN))).json()
    si = next(c for c in caps if c["slug"] == sample.capability_slug)

    done: dict[str, float] = {}

    async def submit():
        await demo.post("/evidence", headers=as_(ARJUN), json={
            "capability_id": si["id"], "evidence_type": "workplace_application",
            "title": sample.title, "content": sample.content,
        })
        done["submit"] = time.perf_counter()

    async def health():
        await asyncio.sleep(0.2)  # arrive while the model is "thinking"
        await demo.get("/health")
        done["health"] = time.perf_counter()

    started = time.perf_counter()
    await asyncio.gather(submit(), health())
    # Unblocked, /health answers ~0.2s in. A blocked loop holds it until the
    # 0.8s model call returns.
    assert done["health"] - started < 0.6
    assert done["submit"] - started >= 0.8


@pytest.mark.asyncio
async def test_the_cache_never_serves_a_real_tenant(api, db):
    """Same canonical text, default tenant: the honest fallback, not the cache."""
    async with db() as session:
        session.add(Capability(id="cap-si-real", tenant_id=TENANT, slug=SI_SLUG,
                               name="Stakeholder influence",
                               capability_class=CapabilityClass.INTERPERSONAL))
        session.add(make_user("real-learner"))
        await session.commit()
    api.uid = "real-learner"
    sample = EVIDENCE_BY_KEY["si-sample-strong"]
    review = (await api.post("/evidence", json={
        "capability_id": "cap-si-real", "evidence_type": "workplace_application",
        "title": sample.title, "content": sample.content,
    })).json()["review"]
    assert review["provenance"] == "fallback"

    from ai.services.free_response_scoring import assess_free_response

    golden = FREE_BY_KEY["post-open-strong"]
    outcome = assess_free_response(question=golden.question, key_points=POST_OPEN_KEY_POINTS,
                                   model_answer="", answer=golden.answer, tenant_id=TENANT)
    assert outcome.provenance == "none" and outcome.credit is None
