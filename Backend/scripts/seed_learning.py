"""Seed a demo learning journey: pre-assessment, e-learns, post-assessment.

Run from Backend/ after seed_demo:

    python -m scripts.seed_learning

Idempotent: activities and items have fixed ids and are upserted. Nothing is
ever deleted, because deleting an item would cascade to learners' responses.

The journey mirrors the client's description of the learning process:

  pre-assessment  ->  interactive e-learn with knowledge checks  ->
  post-assessment  ->  peer practice (later)  ->  AI practice (later)  ->
  implement at work (workplace evidence, manager-validated)

Peer and AI practice are seeded as locked stages with an availability date,
because not every component is live on day one and the learner should see the
whole path rather than a journey that silently grows.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

from app.database import Base, get_engine, get_session_factory
from app.models import AssessmentItem, LearningActivity
from app.schemas.learning import (
    ActivityKind,
    AssessmentPhase,
    ItemDimension,
    ItemType,
)

TENANT = "default"
SI = "cap-stakeholder-influence"
DS = "cap-data-storytelling"
INSTRUMENT = "si-core-v1"

GRID_OPTIONS = [
    {"id": "close", "text": "Manage closely"},
    {"id": "satisfied", "text": "Keep satisfied"},
    {"id": "informed", "text": "Keep informed"},
    {"id": "monitor", "text": "Monitor"},
]
GRID_BUCKETS = [{"id": o["id"], "label": o["text"]} for o in GRID_OPTIONS]


def _now() -> datetime:
    return datetime.now(UTC)


ACTIVITIES: list[dict] = [
    # --- Stakeholder influence ------------------------------------------------
    {
        "id": "act-si-pre",
        "slug": "si-pre-assessment",
        "title": "Stakeholder influence: starting point",
        "summary": "A short baseline before you begin. Taken once, so it stays a baseline.",
        "kind": ActivityKind.ASSESSMENT,
        "phase": AssessmentPhase.PRE,
        "instrument_ref": INSTRUMENT,
        "capability_id": SI,
        "sequence": 10,
        "estimated_minutes": 5,
        "max_attempts": 1,
        "sections": [],
        "items": [
            {
                "id": "itm-si-pre-1", "type": ItemType.SINGLE_CHOICE,
                "dimension": ItemDimension.RECALL,
                "prompt": "A stakeholder has high power over your decision but little interest in it. On a power-interest grid, you should:",
                "payload": {"options": GRID_OPTIONS},
                "key": {"correct": "satisfied"},
            },
            {
                "id": "itm-si-pre-2", "type": ItemType.MULTI_CHOICE,
                "dimension": ItemDimension.UNDERSTANDING,
                "prompt": "Which of these describe an INTEREST rather than a POSITION? Select all that apply.",
                "payload": {"options": [
                    {"id": "a", "text": "Not being blamed if the launch slips"},
                    {"id": "b", "text": "\"The launch date cannot move\""},
                    {"id": "c", "text": "Keeping the team's workload sustainable"},
                    {"id": "d", "text": "\"I need two more headcount\""},
                ]},
                "key": {"correct": ["a", "c"]},
            },
            {
                "id": "itm-si-pre-3", "type": ItemType.RANK,
                "dimension": ItemDimension.JUDGEMENT,
                "prompt": "Put these steps for moving a contested decision in the most effective order.",
                "payload": {"items": [
                    {"id": "map", "text": "Map who decides and who can block"},
                    {"id": "listen", "text": "Meet likely blockers one-to-one"},
                    {"id": "adjust", "text": "Adjust the proposal to what you heard"},
                    {"id": "meeting", "text": "Take it to the decision meeting"},
                ]},
                "key": {"order": ["map", "listen", "adjust", "meeting"]},
            },
            {
                "id": "itm-si-pre-4", "type": ItemType.CATEGORIZE,
                "dimension": ItemDimension.UNDERSTANDING,
                "prompt": "Drag each stakeholder to how you would engage them.",
                "payload": {"buckets": GRID_BUCKETS, "items": [
                    {"id": "cfo", "text": "CFO who signs the budget and wants weekly updates"},
                    {"id": "users", "text": "Analysts whose workflow changes but who have no say"},
                    {"id": "facilities", "text": "Facilities team, unaffected"},
                ]},
                "key": {"placement": {"cfo": "close", "users": "informed", "facilities": "monitor"}},
            },
        ],
    },
    {
        "id": "act-si-elearn-1",
        "slug": "si-elearn-mapping",
        "title": "Mapping and moving stakeholders",
        "summary": "Who decides, who can block, and what each of them actually needs.",
        "kind": ActivityKind.ELEARN,
        "phase": AssessmentPhase.NONE,
        "instrument_ref": "",
        "capability_id": SI,
        "sequence": 20,
        "estimated_minutes": 20,
        "max_attempts": 0,
        "sections": [
            {
                "heading": "Power and interest",
                "body": (
                    "Not everyone affected by a decision can shape it, and not everyone who can "
                    "shape it cares. Plot each stakeholder on two axes: their power over the "
                    "outcome and their interest in it.\n\n"
                    "High power, high interest: manage closely. These people decide or can veto, "
                    "and they are paying attention.\n"
                    "High power, low interest: keep satisfied. They can stop you, but will not "
                    "thank you for detail. Give them what they need to say yes, briefly.\n"
                    "Low power, high interest: keep informed. They live with the result.\n"
                    "Low power, low interest: monitor, and notice if either changes."
                ),
            },
            {
                "heading": "Positions and interests",
                "body": (
                    "A position is what someone says they want. An interest is why they want it. "
                    "\"The launch date cannot move\" is a position; the interest behind it might be "
                    "a commitment the speaker made to the board.\n\n"
                    "Positions conflict. Interests often do not. Influence that only argues with "
                    "positions produces winners and losers; influence that works with interests "
                    "finds proposals both sides can support."
                ),
            },
            {
                "heading": "Pre-wiring the decision",
                "body": (
                    "Decision meetings ratify decisions far more often than they make them. The "
                    "work happens beforehand, one-to-one: surfacing objections while they can still "
                    "be addressed, adjusting the proposal, and confirming what each person will "
                    "say in the room.\n\n"
                    "Someone has been pre-wired when they can restate your proposal in their own "
                    "words, have told you their remaining concern, and know what they will say. "
                    "Being copied on the deck is not pre-wiring."
                ),
            },
        ],
        "items": [
            {
                "id": "itm-si-e1-1", "type": ItemType.SINGLE_CHOICE, "section": 0,
                "dimension": ItemDimension.RECALL,
                "prompt": "Head of Legal holds a final veto on vendor contracts but rarely engages with operational detail. How should you engage them?",
                "payload": {"options": GRID_OPTIONS},
                "key": {"correct": "satisfied"},
                "explanation": "High power, low interest: they can stop you, so keep them satisfied - briefly and on their terms.",
            },
            {
                "id": "itm-si-e1-2", "type": ItemType.CATEGORIZE, "section": 0,
                "dimension": ItemDimension.UNDERSTANDING,
                "prompt": "Drag each stakeholder into the right quadrant for a proposal to consolidate two vendor contracts.",
                "payload": {"buckets": GRID_BUCKETS, "items": [
                    {"id": "coo", "text": "COO, owns the decision and asked for a recommendation"},
                    {"id": "legal", "text": "Head of Legal, contract veto, not following closely"},
                    {"id": "ops", "text": "Ops team who use the vendor daily, no formal say"},
                    {"id": "marketing", "text": "Marketing, no dependency on either vendor"},
                ]},
                "key": {"placement": {"coo": "close", "legal": "satisfied", "ops": "informed", "marketing": "monitor"}},
                "explanation": "Power decides the row, interest the column. The ops team has no formal power - which is exactly why their informal influence is easy to miss.",
            },
            {
                "id": "itm-si-e1-3", "type": ItemType.MATCH, "section": 1,
                "dimension": ItemDimension.UNDERSTANDING,
                "prompt": "Match each stated position to the interest most likely behind it.",
                "payload": {
                    "left": [
                        {"id": "p1", "text": "\"The launch date cannot move.\""},
                        {"id": "p2", "text": "\"Send it through procurement first.\""},
                        {"id": "p3", "text": "\"My team can't take this on.\""},
                    ],
                    "right": [
                        {"id": "i1", "text": "Protect a commitment already made to the board"},
                        {"id": "i2", "text": "Keep compliance exposure under control"},
                        {"id": "i3", "text": "Avoid burning out a stretched team"},
                    ],
                },
                "key": {"pairs": {"p1": "i1", "p2": "i2", "p3": "i3"}},
                "explanation": "Each interest suggests a proposal the speaker could accept - a phased launch, a pre-cleared contract, borrowed capacity - that the position alone hides.",
            },
            {
                "id": "itm-si-e1-4", "type": ItemType.RANK, "section": 2,
                "dimension": ItemDimension.JUDGEMENT,
                "prompt": "Order these steps for moving a contested decision.",
                "payload": {"items": [
                    {"id": "map", "text": "Map who decides and who can block"},
                    {"id": "listen", "text": "Meet blockers one-to-one to surface concerns"},
                    {"id": "adjust", "text": "Adjust the proposal to the interests you heard"},
                    {"id": "prewire", "text": "Pre-wire the decision-maker with the revised proposal"},
                    {"id": "meeting", "text": "Take it to the decision meeting"},
                ]},
                "key": {"order": ["map", "listen", "adjust", "prewire", "meeting"]},
                "explanation": "Listening comes before adjusting, and both come before the room. The meeting should ratify, not decide.",
            },
            {
                "id": "itm-si-e1-5", "type": ItemType.MULTI_CHOICE, "section": 2,
                "dimension": ItemDimension.JUDGEMENT,
                "prompt": "Which are signs a stakeholder has genuinely been pre-wired? Select all that apply.",
                "payload": {"options": [
                    {"id": "restate", "text": "They can restate your proposal in their own words"},
                    {"id": "copied", "text": "They were copied on the deck"},
                    {"id": "concern", "text": "They have told you their remaining concern"},
                    {"id": "silent", "text": "They did not object to your email"},
                    {"id": "say", "text": "They know what they will say in the meeting"},
                ]},
                "key": {"correct": ["restate", "concern", "say"]},
                "explanation": "Silence and being copied are absence of objection, not support.",
            },
            {
                "id": "itm-si-e1-6", "type": ItemType.SHORT_ANSWER, "section": 2,
                "dimension": ItemDimension.RECALL,
                "prompt": "What is the term for securing support with key individuals, one-to-one, before the formal decision meeting?",
                "payload": {"placeholder": "One or two words"},
                "key": {"accepted": ["pre-wiring", "prewiring", "pre-wire", "prewire", "pre-alignment", "prealignment"]},
                "explanation": "Pre-wiring. The decision meeting ratifies what was agreed beforehand.",
            },
            {
                "id": "itm-si-e1-7", "type": ItemType.FREE_RESPONSE, "section": -1,
                "dimension": ItemDimension.JUDGEMENT, "points": 2.0,
                "prompt": (
                    "Your proposal to consolidate two vendor contracts is opposed by the regional "
                    "ops lead. They have no formal authority over the decision, but their team runs "
                    "the vendor day to day. Describe what you would do before the decision meeting, "
                    "and why."
                ),
                "payload": {"min_words": 40, "guidance": "Be specific about who you would speak to, what you would ask, and what you might change."},
                "key": {
                    "key_points": [
                        "Meets the ops lead one-to-one before the meeting, rather than confronting the objection in it",
                        "Asks about or identifies the ops lead's underlying interest, such as disruption to their team or service quality",
                        "Adjusts the proposal or offers something concrete that addresses that interest",
                        "Recognises that the ops lead has informal influence on the outcome despite lacking formal authority",
                    ],
                    "model_answer": (
                        "I would meet the ops lead privately before the meeting and ask what worries "
                        "them about consolidation - most likely service disruption for their team. "
                        "Although they don't sign off, the decision-maker will listen to the person "
                        "whose team lives with the vendor, so their objection in the room would stall "
                        "it. I'd adjust the plan, for example a phased transition with their team "
                        "choosing the cut-over date, and check they could support that version."
                    ),
                },
                "explanation": "Formal authority and influence are different maps. The person who runs the work can stall a decision they do not own.",
            },
        ],
    },
    {
        "id": "act-si-post",
        "slug": "si-post-assessment",
        "title": "Stakeholder influence: after the e-learn",
        "summary": "The same ground as the starting point, with different questions, to measure what moved.",
        "kind": ActivityKind.ASSESSMENT,
        "phase": AssessmentPhase.POST,
        "instrument_ref": INSTRUMENT,
        "capability_id": SI,
        "sequence": 30,
        "estimated_minutes": 8,
        "max_attempts": 2,
        "sections": [],
        "items": [
            {
                "id": "itm-si-post-1", "type": ItemType.SINGLE_CHOICE,
                "dimension": ItemDimension.RECALL,
                "prompt": "A team that will live with the outcome of a decision but cannot influence it should be:",
                "payload": {"options": GRID_OPTIONS},
                "key": {"correct": "informed"},
            },
            {
                "id": "itm-si-post-2", "type": ItemType.MULTI_CHOICE,
                "dimension": ItemDimension.UNDERSTANDING,
                "prompt": "Which of these are INTERESTS rather than POSITIONS? Select all that apply.",
                "payload": {"options": [
                    {"id": "a", "text": "\"We must use the existing supplier\""},
                    {"id": "b", "text": "Avoiding a repeat of last year's failed migration"},
                    {"id": "c", "text": "Being seen as a reliable partner by the client"},
                    {"id": "d", "text": "\"Budget is frozen until Q3\""},
                ]},
                "key": {"correct": ["b", "c"]},
            },
            {
                "id": "itm-si-post-3", "type": ItemType.RANK,
                "dimension": ItemDimension.JUDGEMENT,
                "prompt": "Order these steps for getting a reluctant peer to support your proposal.",
                "payload": {"items": [
                    {"id": "map", "text": "Work out how much they can affect the outcome"},
                    {"id": "listen", "text": "Ask what concerns them about it"},
                    {"id": "adjust", "text": "Change the proposal where their concern is fair"},
                    {"id": "confirm", "text": "Confirm what they will say in the meeting"},
                ]},
                "key": {"order": ["map", "listen", "adjust", "confirm"]},
            },
            {
                "id": "itm-si-post-4", "type": ItemType.CATEGORIZE,
                "dimension": ItemDimension.UNDERSTANDING,
                "prompt": "Drag each stakeholder to how you would engage them for a new expenses policy.",
                "payload": {"buckets": GRID_BUCKETS, "items": [
                    {"id": "fd", "text": "Finance director who owns the policy and is drafting it"},
                    {"id": "audit", "text": "Internal audit, can block sign-off, not involved day to day"},
                    {"id": "staff", "text": "Employees who will submit expenses"},
                ]},
                "key": {"placement": {"fd": "close", "audit": "satisfied", "staff": "informed"}},
            },
        ],
    },
    {
        "id": "act-si-peer",
        "slug": "si-peer-practice",
        "title": "Peer practice circle",
        "summary": "Rehearse a real influence conversation with two peers and get structured feedback.",
        "kind": ActivityKind.PEER_ACTIVITY,
        "phase": AssessmentPhase.NONE,
        "instrument_ref": "",
        "capability_id": SI,
        "sequence": 40,
        "estimated_minutes": 45,
        "max_attempts": 0,
        "available_in_days": 30,
        "sections": [],
        "items": [],
    },
    {
        "id": "act-si-ai",
        "slug": "si-ai-rehearsal",
        "title": "Rehearse with an AI stakeholder",
        "summary": "Practise the pre-wiring conversation against a stakeholder who pushes back.",
        "kind": ActivityKind.AI_PRACTICE,
        "phase": AssessmentPhase.NONE,
        "instrument_ref": "",
        "capability_id": SI,
        "sequence": 50,
        "estimated_minutes": 15,
        "max_attempts": 0,
        "available_in_days": 60,
        "sections": [],
        "items": [],
    },
    # --- Data storytelling ------------------------------------------------------
    {
        "id": "act-ds-elearn-1",
        "slug": "ds-elearn-decision-first",
        "title": "Lead with the decision",
        "summary": "Structure an analysis so a non-analyst can act on it.",
        "kind": ActivityKind.ELEARN,
        "phase": AssessmentPhase.NONE,
        "instrument_ref": "",
        "capability_id": DS,
        "sequence": 20,
        "estimated_minutes": 12,
        "max_attempts": 0,
        "sections": [
            {
                "heading": "Decision first, evidence second",
                "body": (
                    "Analysts are trained to build up to a conclusion. Decision-makers read top "
                    "down and stop early. Open with the decision you recommend and what it will "
                    "change, then the two or three facts that carry it, then the uncertainty "
                    "that remains. The method goes in the appendix."
                ),
            },
        ],
        "items": [
            {
                "id": "itm-ds-e1-1", "type": ItemType.SINGLE_CHOICE, "section": 0,
                "dimension": ItemDimension.UNDERSTANDING,
                "prompt": "Your first slide to the leadership team should be:",
                "payload": {"options": [
                    {"id": "method", "text": "How the data was collected and cleaned"},
                    {"id": "decision", "text": "The decision you recommend and what it changes"},
                    {"id": "trend", "text": "The most interesting trend you found"},
                ]},
                "key": {"correct": "decision"},
                "explanation": "They may read only one slide. Make it the one they can act on.",
            },
            {
                "id": "itm-ds-e1-2", "type": ItemType.RANK, "section": 0,
                "dimension": ItemDimension.JUDGEMENT,
                "prompt": "Order the parts of a decision brief.",
                "payload": {"items": [
                    {"id": "rec", "text": "Recommendation"},
                    {"id": "facts", "text": "The two or three facts that carry it"},
                    {"id": "risk", "text": "What is still uncertain"},
                    {"id": "method", "text": "Method and data sources"},
                ]},
                "key": {"order": ["rec", "facts", "risk", "method"]},
                "explanation": "Uncertainty comes before method: hiding it in the appendix is how analyses lose trust.",
            },
        ],
    },
]


async def upsert(session) -> tuple[int, int]:
    n_act = n_items = 0
    for spec in ACTIVITIES:
        days = spec.get("available_in_days")
        fields = {
            "tenant_id": TENANT,
            "slug": spec["slug"],
            "title": spec["title"],
            "summary": spec["summary"],
            "kind": spec["kind"],
            "phase": spec["phase"],
            "instrument_ref": spec["instrument_ref"],
            "capability_id": spec["capability_id"],
            "sequence": spec["sequence"],
            "estimated_minutes": spec["estimated_minutes"],
            "max_attempts": spec["max_attempts"],
            "sections": spec["sections"],
            "available_from": _now() + timedelta(days=days) if days else None,
            "is_published": True,
        }
        row = await session.get(LearningActivity, spec["id"])
        if row is None:
            session.add(LearningActivity(id=spec["id"], **fields))
        else:
            for k, v in fields.items():
                setattr(row, k, v)
        n_act += 1

        for pos, item in enumerate(spec["items"]):
            ifields = {
                "tenant_id": TENANT,
                "activity_id": spec["id"],
                "position": pos,
                "section": item.get("section", -1),
                "item_type": item["type"],
                "dimension": item["dimension"],
                "prompt": item["prompt"],
                "payload": item["payload"],
                "answer_key": item["key"],
                "points": item.get("points", 1.0),
                "explanation": item.get("explanation", ""),
            }
            irow = await session.get(AssessmentItem, item["id"])
            if irow is None:
                session.add(AssessmentItem(id=item["id"], **ifields))
            else:
                for k, v in ifields.items():
                    setattr(irow, k, v)
            n_items += 1
        await session.flush()
    return n_act, n_items


async def main() -> None:
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with get_session_factory()() as session:
        n_act, n_items = await upsert(session)
        await session.commit()
    print(f"Seeded {n_act} learning activities and {n_items} exercises for tenant '{TENANT}'.")
    print("  Stakeholder influence: pre-assessment -> e-learn (7 exercise types) -> post-assessment")
    print("                         peer practice (+30 days), AI rehearsal (+60 days): locked")
    print("  Data storytelling:     e-learn with 2 exercises")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
