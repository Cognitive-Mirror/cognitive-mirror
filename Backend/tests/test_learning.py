"""Learning journey: item scoring, knowledge signals, and the API loop.

The property under test throughout: knowledge moves the knowledge dimension and
may lower confidence, but never raises attained_level (ADR-003).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio

from ai.schemas.free_response import FreeResponseAssessment, KeyPointJudgement
from ai.services.free_response_scoring import FreeResponseOutcome, credit_from_judgements
from app.models import Capability, Role
from app.schemas.capability import (
    CapabilityClass,
    CapabilityLevel,
    ValidationStatus,
)
from app.schemas.evidence import EvidenceStrengthBand
from app.schemas.learning import ActivityKind, AssessmentPhase, ItemType, KnowingDoing
from app.scoring.engine import ScoredEvidence, score_capability
from app.scoring.items import score_item
from app.scoring.knowledge import AttemptSummary, knowing_doing, knowledge_snapshot
from tests.conftest import TENANT, make_user

NOW = datetime(2026, 10, 1, tzinfo=UTC)


# --- Item scorers ------------------------------------------------------------


def test_single_choice_all_or_nothing():
    key = {"correct": "b"}
    assert score_item(ItemType.SINGLE_CHOICE, key, {"choice": "b"}).credit == 1.0
    assert score_item(ItemType.SINGLE_CHOICE, key, {"choice": "a"}).credit == 0.0
    assert score_item(ItemType.SINGLE_CHOICE, key, {}).credit == 0.0


def test_multi_choice_select_all_earns_nothing():
    """Ticking every box is the obvious gaming strategy; it must score zero."""
    key = {"correct": ["a", "c"]}
    assert score_item(ItemType.MULTI_CHOICE, key, {"choices": ["a", "c"]}).credit == 1.0
    assert score_item(ItemType.MULTI_CHOICE, key, {"choices": ["a"]}).credit == 0.5
    assert score_item(ItemType.MULTI_CHOICE, key, {"choices": ["a", "b", "c", "d"]}).credit == 0.0


def test_match_and_categorize_partial_credit():
    match = score_item(
        ItemType.MATCH, {"pairs": {"1": "x", "2": "y"}}, {"pairs": {"1": "x", "2": "x"}}
    )
    assert match.credit == 0.5
    cat = score_item(
        ItemType.CATEGORIZE,
        {"placement": {"a": "p", "b": "q", "c": "q"}},
        {"placement": {"a": "p", "b": "q"}},
    )
    assert cat.credit == pytest.approx(2 / 3)


def test_rank_uses_pairwise_ordering_not_exact_positions():
    key = {"order": ["a", "b", "c", "d", "e"]}
    # One adjacent swap: 9 of 10 pairs still ordered correctly.
    one_swap = score_item(ItemType.RANK, key, {"order": ["b", "a", "c", "d", "e"]})
    assert one_swap.credit == pytest.approx(0.9)
    assert score_item(ItemType.RANK, key, {"order": ["e", "d", "c", "b", "a"]}).credit == 0.0
    # Incomplete or duplicated rankings are not partially credited.
    assert score_item(ItemType.RANK, key, {"order": ["a", "a", "c", "d", "e"]}).credit == 0.0


def test_short_answer_normalises_case_punctuation_and_hyphens():
    key = {"accepted": ["pre-wiring"]}
    assert score_item(ItemType.SHORT_ANSWER, key, {"text": "  Pre-Wiring. "}).credit == 1.0
    assert score_item(ItemType.SHORT_ANSWER, key, {"text": "pre wiring"}).credit == 1.0
    assert score_item(ItemType.SHORT_ANSWER, key, {"text": "lobbying"}).credit == 0.0


def test_malformed_response_scores_zero_without_raising():
    assert score_item(ItemType.MATCH, {"pairs": {"1": "x"}}, "garbage").credit == 0.0


# --- Free-response verification -------------------------------------------------


KEY_POINTS = ["meets them one to one", "asks about their interest", "adjusts the proposal"]
ANSWER = "I would meet the ops lead one to one and ask what worries their team about it."


def test_free_response_credit_counts_only_verified_quotes():
    assessment = FreeResponseAssessment(judgements=[
        KeyPointJudgement(index=0, met=True, quote="meet the ops lead one to one"),
        KeyPointJudgement(index=1, met=True, quote="ask what worries their team"),
        # Fabricated: these words are not in the answer.
        KeyPointJudgement(index=2, met=True, quote="offer a phased transition"),
    ])
    credit, met, rejected = credit_from_judgements(assessment, KEY_POINTS, ANSWER)
    assert met == [0, 1]
    assert credit == pytest.approx(2 / 3)
    assert len(rejected) == 1


def test_free_response_rejects_trivially_short_quotes():
    assessment = FreeResponseAssessment(judgements=[
        KeyPointJudgement(index=0, met=True, quote="ops lead"),
    ])
    credit, met, _ = credit_from_judgements(assessment, KEY_POINTS, ANSWER)
    assert credit == 0.0 and met == []


# --- Knowledge signals -----------------------------------------------------------


def _attempt(aid, kind, phase, score, n=1, instrument="inst"):
    return AttemptSummary(aid, kind, phase, instrument, n, score, NOW)


def test_mastery_uses_first_attempt_not_retakes():
    snap = knowledge_snapshot([
        _attempt("e1", ActivityKind.ELEARN, AssessmentPhase.NONE, 0.4, n=1),
        _attempt("e1", ActivityKind.ELEARN, AssessmentPhase.NONE, 1.0, n=2),
    ])
    assert snap.mastery == 0.4
    assert snap.retakes == 1
    assert snap.mastery_source == "knowledge_checks"


def test_hake_gain_and_post_assessment_precedence():
    snap = knowledge_snapshot([
        _attempt("pre", ActivityKind.ASSESSMENT, AssessmentPhase.PRE, 0.5),
        _attempt("e1", ActivityKind.ELEARN, AssessmentPhase.NONE, 0.6),
        _attempt("post", ActivityKind.ASSESSMENT, AssessmentPhase.POST, 0.8),
    ])
    assert snap.mastery == 0.8 and snap.mastery_source == "post_assessment"
    assert snap.normalized_gain == pytest.approx(0.6)  # (0.8 - 0.5) / (1 - 0.5)


def test_gain_is_undefined_when_pre_left_nothing_to_learn():
    snap = knowledge_snapshot([
        _attempt("pre", ActivityKind.ASSESSMENT, AssessmentPhase.PRE, 1.0),
        _attempt("post", ActivityKind.ASSESSMENT, AssessmentPhase.POST, 1.0),
    ])
    assert snap.normalized_gain is None


def test_knowing_doing_classification():
    assert knowing_doing(None, CapabilityLevel.NOVICE) is KnowingDoing.INSUFFICIENT_DATA
    assert knowing_doing(0.9, CapabilityLevel.NOVICE) is KnowingDoing.KNOWS_NOT_APPLIED
    assert knowing_doing(0.4, CapabilityLevel.NOVICE) is KnowingDoing.DEVELOPING
    assert knowing_doing(0.8, CapabilityLevel.COMPETENT) is KnowingDoing.ALIGNED
    assert knowing_doing(0.3, CapabilityLevel.COMPETENT) is KnowingDoing.APPLIED_WITHOUT_KNOWLEDGE


def _validated_history():
    return [
        ScoredEvidence(f"e{i}", EvidenceStrengthBand.STRONG, ValidationStatus.VALIDATED,
                       NOW - timedelta(days=20 * i), f"ctx-{i}")
        for i in range(3)
    ]


def test_perfect_knowledge_never_raises_level_or_confidence():
    """The structural promise: a learner who aces every quiz is still novice."""
    score = score_capability([], capability_class=CapabilityClass.INTERPERSONAL,
                             now=NOW, knowledge_mastery=1.0)
    assert score.attained_level is CapabilityLevel.NOVICE
    assert score.state_confidence == 0.0


def test_contradicting_knowledge_lowers_confidence_but_not_level():
    items = _validated_history()
    base = score_capability(items, capability_class=CapabilityClass.ANALYTICAL, now=NOW)
    doubted = score_capability(items, capability_class=CapabilityClass.ANALYTICAL,
                               now=NOW, knowledge_mastery=0.2)
    assert doubted.attained_level == base.attained_level
    assert doubted.state_confidence < base.state_confidence
    assert any("ADR-003" in r for r in doubted.rationale)


def test_high_knowledge_does_not_add_confidence_to_validated_work():
    items = _validated_history()
    base = score_capability(items, capability_class=CapabilityClass.ANALYTICAL, now=NOW)
    high = score_capability(items, capability_class=CapabilityClass.ANALYTICAL,
                            now=NOW, knowledge_mastery=1.0)
    assert high.state_confidence == base.state_confidence


# --- API ---------------------------------------------------------------------------

LEARNER = "learner-001"
FACILITATOR = "manager-001"


@pytest_asyncio.fixture
async def learning_client(api, db, monkeypatch):
    """The seeded learning journey, a learner and their manager, and a fake AI marker."""
    from scripts.seed_learning import upsert

    async with db() as session:
        for cid, name, cls in [
            ("cap-stakeholder-influence", "Stakeholder influence", CapabilityClass.INTERPERSONAL),
            ("cap-data-storytelling", "Data storytelling", CapabilityClass.PROCEDURAL),
        ]:
            session.add(Capability(id=cid, tenant_id=TENANT, slug=cid, name=name,
                                   capability_class=cls))
        session.add(make_user(FACILITATOR, Role.MANAGER))
        await session.flush()
        session.add(make_user(LEARNER, manager=FACILITATOR))
        await upsert(session)
        await session.commit()

    fake_ai = {"outcome": FreeResponseOutcome(credit=0.75, feedback="Good.", confidence=0.8,
                                              model_name="fake", prompt_version="1.0.0")}
    monkeypatch.setattr(
        "app.services.learning_service.assess_free_response",
        lambda **_: fake_ai["outcome"],
    )
    api.uid = LEARNER
    return api, fake_ai


PERFECT_ELEARN = {
    "itm-si-e1-1": {"choice": "satisfied"},
    "itm-si-e1-2": {"placement": {
        "coo": "close", "legal": "satisfied", "ops": "informed", "marketing": "monitor",
    }},
    "itm-si-e1-3": {"pairs": {"p1": "i1", "p2": "i2", "p3": "i3"}},
    "itm-si-e1-4": {"order": ["map", "listen", "adjust", "prewire", "meeting"]},
    "itm-si-e1-5": {"choices": ["restate", "concern", "say"]},
    "itm-si-e1-6": {"text": "Pre-wiring"},
    "itm-si-e1-7": {"text": (
        "I would meet the ops lead one to one before the meeting and ask what "
        "worries their team."
    )},
}


@pytest.mark.asyncio
async def test_activity_payload_never_contains_answer_keys(learning_client):
    client, _ = learning_client
    body = (await client.get("/learning/activities/act-si-elearn-1")).json()
    raw = str(body)
    assert "answer_key" not in raw and "key_points" not in raw and "model_answer" not in raw
    assert len(body["items"]) == 7
    assert {i["item_type"] for i in body["items"]} == {t.value for t in ItemType}


@pytest.mark.asyncio
async def test_locked_components_are_listed_but_not_openable(learning_client):
    client, _ = learning_client
    acts = {a["id"]: a for a in (await client.get("/learning/activities")).json()}
    assert acts["act-si-peer"]["available"] is False
    assert (await client.get("/learning/activities/act-si-peer")).status_code == 403


@pytest.mark.asyncio
async def test_elearn_submission_scores_and_moves_knowledge_not_level(learning_client):
    client, _ = learning_client
    r = await client.post("/learning/activities/act-si-elearn-1/attempts",
                          json={"responses": PERFECT_ELEARN})
    assert r.status_code == 201
    body = r.json()
    # The returned result is computed before background scoring: the open
    # answer is pending and excluded from the score, not counted as zero.
    assert body["pending_items"] == 1
    assert body["score"] == 1.0
    assert body["items"][0]["reveal"] == {"correct": "satisfied"}

    polled = (await client.get(f"/learning/attempts/{body['attempt_id']}")).json()
    assert polled["status"] == "scored" and polled["pending_items"] == 0
    # 6 deterministic points at full credit + 0.75 of 2 points.
    assert polled["score"] == pytest.approx(7.5 / 8)

    states = {s["capability_id"]: s for s in (await client.get("/capabilities/me")).json()}
    si = states["cap-stakeholder-influence"]
    assert si["attained_level"] == "novice"
    assert si["knowing_doing"] == "knows_not_applied"
    assert si["knowledge_source"] == "knowledge_checks"
    assert "applying it at work" in si["recommended_next_action"]


@pytest.mark.asyncio
async def test_assessment_hides_answers_and_baseline_is_taken_once(learning_client):
    client, _ = learning_client
    url = "/learning/activities/act-si-pre/attempts"
    answers = {"responses": {"itm-si-pre-1": {"choice": "close"}}}
    first = (await client.post(url, json=answers)).json()
    assert all(i["reveal"] is None and i["explanation"] == "" for i in first["items"])
    assert (await client.post(url, json={"responses": {}})).status_code == 409


@pytest.mark.asyncio
async def test_pre_post_pair_produces_normalised_gain(learning_client):
    client, _ = learning_client
    await client.post("/learning/activities/act-si-pre/attempts", json={"responses": {
        "itm-si-pre-1": {"choice": "satisfied"}, "itm-si-pre-2": {"choices": ["a"]},
    }})  # 1.5 of 4
    await client.post("/learning/activities/act-si-post/attempts", json={"responses": {
        "itm-si-post-1": {"choice": "informed"}, "itm-si-post-2": {"choices": ["b", "c"]},
        "itm-si-post-3": {"order": ["map", "listen", "adjust", "confirm"]},
        "itm-si-post-4": {"placement": {"fd": "close", "audit": "satisfied", "staff": "informed"}},
    }})  # 4 of 4
    si = {s["capability_id"]: s for s in (await client.get("/capabilities/me")).json()}[
        "cap-stakeholder-influence"]
    assert si["knowledge_pre"] == pytest.approx(0.375)
    assert si["knowledge_post"] == 1.0
    assert si["knowledge_gain"] == 1.0
    assert si["attained_level"] == "novice"


@pytest.mark.asyncio
async def test_unsettled_open_answer_goes_to_facilitator_not_learner(learning_client):
    client, fake_ai = learning_client
    fake_ai["outcome"] = FreeResponseOutcome(credit=None, needs_human=True,
                                             feedback="A facilitator will confirm the mark.")
    attempt = (await client.post("/learning/activities/act-si-elearn-1/attempts",
                                 json={"responses": PERFECT_ELEARN})).json()
    response_id = attempt["items"][-1]["response_id"]

    # The learner can neither open the queue nor mark their own answer.
    assert (await client.get("/learning/review-queue")).status_code == 403
    denied = await client.post(f"/learning/responses/{response_id}/score", json={"credit": 1.0})
    assert denied.status_code == 403

    client.uid = FACILITATOR
    queue = (await client.get("/learning/review-queue")).json()
    assert [q["response_id"] for q in queue] == [response_id]
    marked = (await client.post(f"/learning/responses/{response_id}/score",
                                json={"credit": 0.5, "feedback": "Half the key points."})).json()
    assert marked["status"] == "scored"
    assert marked["score"] == pytest.approx(7 / 8)
