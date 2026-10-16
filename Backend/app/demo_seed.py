"""Deterministic demo tenant: Apex Systems Engineering.

    python -m app.demo_seed            # seed or reset from the command line
    POST /api/demo/reset               # the same, from the presenter toolbar

What it builds
--------------
A separate tenant (`DEMO_TENANT_ID`, default "apex-demo") so a reset can never
touch real data, and so the persona header in app/auth.py has a hard boundary.

Static content is cloned from the repository's own seed modules - nothing is
re-authored here:

  * the Capability Spine and D6 requirement layers   scripts/seed_demo.py
  * the 27 approved rubric clauses, verbatim          scripts/seed_knowledge.py
  * the learning journey and its exercises            scripts/seed_learning.py

plus one demo-only open question on the post-assessment, so the presenter can
show AI marking with server-verified quotes there.

People and history
------------------
Six people: one manager, one admin and four learner archetypes. Each learner's
history is REPLAYED, oldest event first, through the production services -
attempt scoring, evidence review, manager validation, state recompute - with the
clock set to when each event happened. Nothing writes a capability state
directly. Every level, confidence and audit event on screen is the Capability
State Model's own output over that history, which is the point of the demo.

  Priya Nair     pre-assessment and e-learn done, post-assessment open; one
                 strong item validated (1.7 of the 2.0 points developing needs)
                 and a second strong item pending with Dev. Validating it moves
                 her from novice to developing and confidence from 0.00 to ~0.85.
  Arjun Mehta    100% on pre, e-learn and post. No workplace evidence, so novice
                 with zero confidence: knowing is not doing.
  Elena Rostova  three validated items in three independent contexts, competent
                 at her required level, confidence ~0.88 (high).
  Marcus Vance   validated competent, but his evidence is over 14 months old and
                 last week's post-assessment came in at 25%. The level stands;
                 confidence has decayed into revalidation due.

Reset wipes only the demo tenant's mutable rows (evidence, reviews, validations,
attempts, responses, states, audit events) and replays. No model is ever called:
reviews come from the verified demo cache via the same guardrails.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ai.demo_cache import (
    EVIDENCE_BY_KEY,
    FREE_BY_KEY,
    POST_OPEN_KEY_POINTS,
    POST_OPEN_MODEL_ANSWER,
    POST_OPEN_QUESTION,
)
from ai.services.evidence_intelligence import (
    recompute_capability_state,
    record_manager_validation,
    run_ai_review,
)
from app.config import get_settings
from app.models import (
    ActivityAttempt,
    AssessmentItem,
    Capability,
    CapabilityRequirement,
    CapabilityStateEvent,
    CapabilityStateRecord,
    Evidence,
    EvidenceReview,
    ItemResponse,
    KnowledgeDocument,
    LearningActivity,
    ManagerValidation,
    Role,
    User,
)
from app.schemas.capability import (
    CapabilityLevel,
    RequiredLevelSource,
    SignalSource,
    ValidationStatus,
)
from app.schemas.evidence import EvidenceStrengthBand, EvidenceType
from app.schemas.learning import ItemDimension, ItemType
from app.schemas.review import ReviewDecision
from app.services.learning_service import score_pending_responses, submit_attempt
from app.services.urls import classify_artifacts
from scripts import seed_demo, seed_knowledge, seed_learning

logger = logging.getLogger(__name__)

ORG_NAME = "Apex Systems Engineering"
PREFIX = "apex-"


def demo_tenant() -> str:
    return get_settings().demo_tenant_id


def _cap(source_id: str) -> str:
    return f"{PREFIX}{source_id}"


# --- People -------------------------------------------------------------------

MANAGER_ID = f"{PREFIX}user-dev"
ADMIN_ID = f"{PREFIX}user-sarah"
PRIYA_ID = f"{PREFIX}user-priya"
ARJUN_ID = f"{PREFIX}user-arjun"
ELENA_ID = f"{PREFIX}user-elena"
MARCUS_ID = f"{PREFIX}user-marcus"

PROGRAM_REF = seed_demo.PROGRAM_REF
SENIOR = seed_demo.ROLE_REF


@dataclass(frozen=True)
class Persona:
    id: str
    key: str
    email: str
    display_name: str
    role: Role
    title: str
    archetype: str
    headline: str
    focus_capability: str | None = None
    role_ref: str | None = None
    program_ref: str | None = None
    manager_id: str | None = None


PERSONAS: tuple[Persona, ...] = (
    Persona(
        id=PRIYA_ID, key="priya", email="priya.nair@demo.local", display_name="Priya Nair",
        role=Role.LEARNER, title="Senior Systems Analyst", archetype="Active demo learner",
        headline="Evidence waiting on her manager. Validation unlocks her confidence.",
        focus_capability="cap-stakeholder-influence", role_ref=SENIOR,
        program_ref=PROGRAM_REF, manager_id=MANAGER_ID,
    ),
    Persona(
        id=ARJUN_ID, key="arjun", email="arjun.mehta@demo.local", display_name="Arjun Mehta",
        role=Role.LEARNER, title="Systems Analyst", archetype="Knows vs. does",
        headline="100% on every assessment, nothing shown at work. Level unmoved.",
        focus_capability="cap-stakeholder-influence", role_ref=SENIOR,
        program_ref=PROGRAM_REF, manager_id=MANAGER_ID,
    ),
    Persona(
        id=ELENA_ID, key="elena", email="elena.rostova@demo.local", display_name="Elena Rostova",
        role=Role.LEARNER, title="Principal Engineer", archetype="Validated multi-context",
        headline="Three validated decisions in three independent contexts.",
        focus_capability="cap-strategic-decision", role_ref="principal-engineer",
        manager_id=MANAGER_ID,
    ),
    Persona(
        id=MARCUS_ID, key="marcus", email="marcus.vance@demo.local", display_name="Marcus Vance",
        role=Role.LEARNER, title="Programme Lead", archetype="Confidence decay",
        headline="Validated competent 14 months ago; recent assessment contradicts it.",
        focus_capability="cap-stakeholder-influence", role_ref=SENIOR,
        manager_id=MANAGER_ID,
    ),
    Persona(
        id=MANAGER_ID, key="dev", email="manager@demo.local", display_name="Dev Malhotra",
        role=Role.MANAGER, title="Engineering Manager", archetype="Manager",
        headline="Validates the team's workplace evidence.", role_ref="engineering-manager",
    ),
    Persona(
        id=ADMIN_ID, key="sarah", email="admin@demo.local", display_name="Sarah Chen",
        role=Role.ADMIN, title="Capability Programme Admin", archetype="Admin",
        headline="Owns the approved rubric and the capability matrix.",
        role_ref="platform-admin",
    ),
)
PERSONA_BY_EMAIL = {p.email: p for p in PERSONAS}


# --- Static content ---------------------------------------------------------------

POST_OPEN_ITEM_ID = f"{PREFIX}itm-si-post-5"


def _activities() -> list[dict]:
    """The repository's learning journey, re-keyed for the demo tenant."""
    out = []
    for spec in seed_learning.ACTIVITIES:
        items = [dict(i) for i in spec["items"]]
        if spec["id"] == "act-si-post":
            items.append({
                "id": "itm-si-post-5", "type": ItemType.FREE_RESPONSE,
                "dimension": ItemDimension.JUDGEMENT, "points": 2.0,
                "prompt": POST_OPEN_QUESTION,
                "payload": {
                    "min_words": 40,
                    "guidance": (
                        "Say who you would speak to, what you would ask, and what "
                        "you might change."
                    ),
                },
                "key": {"key_points": POST_OPEN_KEY_POINTS, "model_answer": POST_OPEN_MODEL_ANSWER},
            })
        out.append({**spec, "items": items})
    return out


async def _prefetch(session: AsyncSession, *models) -> list:
    """Load the tenant's static rows in one query per table.

    `session.get` then resolves them from the identity map instead of issuing a
    SELECT per row. The identity map holds rows weakly, so the caller must keep
    the returned list alive for as long as it wants the hits.
    """
    tenant = demo_tenant()
    pinned: list = []
    for model in models:
        pinned.extend(
            (await session.execute(select(model).where(model.tenant_id == tenant))).scalars()
        )
    return pinned


async def _upsert(session: AsyncSession, model, row_id: str, fields: dict) -> None:
    row = await session.get(model, row_id)
    if row is None:
        session.add(model(id=row_id, **fields))
    else:
        for k, v in fields.items():
            if getattr(row, k) != v:
                setattr(row, k, v)


async def _seed_static(session: AsyncSession, now: datetime) -> list:
    """Upsert the static content. Returns the rows to keep pinned in the session."""
    tenant = demo_tenant()
    pinned = await _prefetch(
        session, Capability, User, CapabilityRequirement, LearningActivity, AssessmentItem
    )

    for entry in seed_demo.SPINE:
        await _upsert(session, Capability, _cap(entry["id"]), {
            "tenant_id": tenant, "slug": entry["slug"], "name": entry["name"],
            "description": entry["description"],
            "capability_class": entry["capability_class"],
            "linked_kpi_ids": entry["linked_kpi_ids"],
        })
    await session.flush()

    for p in sorted(PERSONAS, key=lambda p: p.manager_id is not None):
        await _upsert(session, User, p.id, {
            "tenant_id": tenant, "firebase_uid": f"demo-persona-{p.key}",
            "email": p.email, "display_name": p.display_name, "role": p.role,
            "manager_id": p.manager_id, "role_ref": p.role_ref,
            "program_ref": p.program_ref,
            "org_unit": f"{ORG_NAME} / Systems Engineering", "is_active": True,
        })
    await session.flush()

    # D6: the same three layers seed_demo demonstrates, effective long enough
    # ago to cover the oldest replayed event.
    since = now - timedelta(days=730)
    rows = [
        {
            "id": f"{PREFIX}req-spine-{e['slug']}", "capability_id": _cap(e["id"]),
            "role_ref": None, "program_ref": None, "subject_id": None,
            "required_level": e["spine_default"], "source": RequiredLevelSource.SPINE_DEFAULT,
            "set_by": "impact-spine",
            "rationale": "Impact Capability Spine baseline for this capability.",
        }
        for e in seed_demo.SPINE
    ]
    rows.append({
        "id": f"{PREFIX}req-role-stakeholder", "capability_id": _cap("cap-stakeholder-influence"),
        "role_ref": SENIOR, "program_ref": None, "subject_id": None,
        "required_level": CapabilityLevel.PROFICIENT, "source": RequiredLevelSource.TENANT_ROLE,
        "set_by": ADMIN_ID,
        "rationale": (
            "Senior analysts at Apex drive cross-functional engineering decisions without "
            "formal authority; the Spine baseline understates this role."
        ),
    })
    rows.append({
        "id": f"{PREFIX}req-program-decision", "capability_id": _cap("cap-strategic-decision"),
        "role_ref": None, "program_ref": PROGRAM_REF, "subject_id": None,
        "required_level": CapabilityLevel.PROFICIENT,
        "source": RequiredLevelSource.PROGRAM_TARGET, "set_by": ADMIN_ID,
        "rationale": (
            "The Q4 leadership programme targets proficient decision making as its exit bar."
        ),
    })
    for row in rows:
        await _upsert(session, CapabilityRequirement, row.pop("id"), {
            "tenant_id": tenant, "effective_from": since, "effective_to": None, **row,
        })

    # The 27 approved clauses, verbatim. Slug is the citation handle, so it is
    # kept exactly; only the capability foreign key is re-pointed.
    existing = {
        d.slug: d for d in (
            await session.execute(
                select(KnowledgeDocument).where(KnowledgeDocument.tenant_id == tenant)
            )
        ).scalars()
    }
    for entry in seed_knowledge.DOCUMENTS:
        body = entry["body"].strip()
        fields = {
            "kind": entry["kind"], "title": seed_knowledge._title(entry), "body": body,
            "capability_id": _cap(entry["capability_id"]) if entry.get("capability_id") else None,
            "level": entry.get("level"), "kpi_ref": entry.get("kpi_ref"),
            "related_slugs": ",".join(entry.get("related", [])),
            "is_approved": True, "approved_by": ADMIN_ID,
        }
        doc = existing.get(entry["slug"])
        if doc is None:
            session.add(KnowledgeDocument(
                tenant_id=tenant, slug=entry["slug"], revision=1, approved_at=now, **fields
            ))
            continue
        if doc.body != body:
            doc.revision += 1
        for k, v in fields.items():
            if getattr(doc, k) != v:
                setattr(doc, k, v)

    for spec in _activities():
        days = spec.get("available_in_days")
        await _upsert(session, LearningActivity, f"{PREFIX}{spec['id']}", {
            "tenant_id": tenant, "slug": spec["slug"], "title": spec["title"],
            "summary": spec["summary"], "kind": spec["kind"], "phase": spec["phase"],
            "instrument_ref": spec["instrument_ref"],
            "capability_id": _cap(spec["capability_id"]), "sequence": spec["sequence"],
            "estimated_minutes": spec["estimated_minutes"],
            "max_attempts": spec["max_attempts"], "sections": spec["sections"],
            # Locked stages stay locked relative to "today", and a replayed
            # history must be able to submit before the reset instant.
            "available_from": now + timedelta(days=days) if days else None,
            "is_published": True,
        })
        await session.flush()
        for pos, item in enumerate(spec["items"]):
            await _upsert(session, AssessmentItem, f"{PREFIX}{item['id']}", {
                "tenant_id": tenant, "activity_id": f"{PREFIX}{spec['id']}",
                "position": pos, "section": item.get("section", -1),
                "item_type": item["type"], "dimension": item["dimension"],
                "prompt": item["prompt"], "payload": item["payload"],
                "answer_key": item["key"], "points": item.get("points", 1.0),
                "explanation": item.get("explanation", ""),
            })
    await session.flush()
    # Re-read so rows inserted on a first seed are pinned too.
    return pinned + await _prefetch(session, Capability, User, LearningActivity)


# --- History ------------------------------------------------------------------------


@dataclass(frozen=True)
class Attempt:
    days_ago: float
    learner_id: str
    activity: str               # source activity id, e.g. "act-si-pre"
    wrong: tuple[int, ...] = ()  # item positions answered incorrectly
    open_answers: dict[int, str] = field(default_factory=dict)  # position -> golden key


@dataclass(frozen=True)
class Submit:
    days_ago: float
    learner_id: str
    golden: str
    occurred_days_ago: float


@dataclass(frozen=True)
class Validate:
    days_ago: float
    golden: str
    strength: EvidenceStrengthBand
    feedback: str
    decision: ReviewDecision = ReviewDecision.APPROVED


EVIDENCE_CAPABILITY = {
    "stakeholder-influence": "cap-stakeholder-influence",
    "strategic-decision-making": "cap-strategic-decision",
    "data-storytelling": "cap-data-storytelling",
}

E = EvidenceStrengthBand
HISTORY: tuple[Attempt | Submit | Validate, ...] = (
    # Marcus: validated competent long ago, decayed since.
    Submit(479, MARCUS_ID, "si-marcus-supplier", occurred_days_ago=480),
    Validate(475, "si-marcus-supplier", E.EXCEPTIONAL,
             "I was in the VP review. The cost model changed the room. Exceptional."),
    Attempt(470, MARCUS_ID, "act-si-pre", wrong=(1, 3)),
    Submit(439, MARCUS_ID, "si-marcus-account", occurred_days_ago=440),
    Validate(436, "si-marcus-account", E.EXCEPTIONAL,
             "The CTO told me directly the reliability review won her back."),
    # Elena: three independent validated contexts.
    Submit(213, ELENA_ID, "sdm-elena-firmware", occurred_days_ago=215),
    Validate(210, "sdm-elena-firmware", E.EXCEPTIONAL,
             "Textbook go/no-go: the reversal condition was set before the data came in."),
    Submit(184, ELENA_ID, "sdm-elena-rig", occurred_days_ago=185),
    Validate(180, "sdm-elena-rig", E.STRONG, "Clear trade-off, recorded honestly for Pune."),
    Submit(159, ELENA_ID, "sdm-elena-pipeline", occurred_days_ago=160),
    Validate(157, "sdm-elena-pipeline", E.EXCEPTIONAL,
             "Held her position with the board on evidence, and named what would change it."),
    # Priya: one strong item validated, short of developing.
    Submit(39, PRIYA_ID, "si-priya-sso", occurred_days_ago=40),
    Validate(37, "si-priya-sso", E.STRONG,
             "Observed the security review. Strong; bring the rest of the rollout when it lands."),
    # Arjun: knows it, all of it.
    Attempt(20, ARJUN_ID, "act-si-pre"),
    Attempt(16, ARJUN_ID, "act-si-elearn-1", open_answers={6: "elearn-open-strong"}),
    Attempt(14, PRIYA_ID, "act-si-pre", wrong=(1, 3)),
    Attempt(11, ARJUN_ID, "act-si-post", open_answers={4: "post-open-strong"}),
    Attempt(10, PRIYA_ID, "act-si-elearn-1", wrong=(1,), open_answers={6: "elearn-open-strong"}),
    # Marcus: the contradictory post-assessment.
    Attempt(6, MARCUS_ID, "act-si-post", wrong=(1, 2, 3), open_answers={4: "post-open-weak"}),
    # Priya: the item waiting in Dev's queue.
    Submit(2, PRIYA_ID, "si-priya-freeze", occurred_days_ago=3),
)


def _response(item: AssessmentItem, correct: bool) -> dict:
    """A real answer, right or wrong, in the shape the scorer reads."""
    key, payload = item.answer_key or {}, item.payload or {}
    t = item.item_type
    if t is ItemType.SINGLE_CHOICE:
        if correct:
            return {"choice": key["correct"]}
        return {"choice": next(o["id"] for o in payload["options"] if o["id"] != key["correct"])}
    if t is ItemType.MULTI_CHOICE:
        right = set(key["correct"])
        if correct:
            return {"choices": sorted(right)}
        return {"choices": [o["id"] for o in payload["options"] if o["id"] not in right]}
    if t is ItemType.MATCH:
        pairs = key["pairs"]
        if correct:
            return {"pairs": dict(pairs)}
        rights = list(pairs.values())
        return {"pairs": {left: rights[(i + 1) % len(rights)] for i, left in enumerate(pairs)}}
    if t is ItemType.RANK:
        order = list(key["order"])
        return {"order": order if correct else order[::-1]}
    if t is ItemType.CATEGORIZE:
        placement = key["placement"]
        if correct:
            return {"placement": dict(placement)}
        buckets = [b["id"] for b in payload["buckets"]]
        return {"placement": {
            i: next(b for b in buckets if b != placement[i]) for i in placement
        }}
    if t is ItemType.SHORT_ANSWER:
        return {"text": key["accepted"][0] if correct else "not sure"}
    return {}


async def _replay(session: AsyncSession, now: datetime) -> dict[str, str]:
    tenant = demo_tenant()
    evidence_ids: dict[str, str] = {}
    caps = {
        c.id: c for c in (
            await session.execute(select(Capability).where(Capability.tenant_id == tenant))
        ).scalars()
    }

    for event in sorted(HISTORY, key=lambda e: -e.days_ago):
        at = now - timedelta(days=event.days_ago)

        if isinstance(event, Attempt):
            activity = await session.get(LearningActivity, f"{PREFIX}{event.activity}")
            items = (
                await session.execute(
                    select(AssessmentItem)
                    .where(AssessmentItem.activity_id == activity.id)
                    .order_by(AssessmentItem.position)
                )
            ).scalars().all()
            responses: dict[str, dict] = {}
            for pos, item in enumerate(items):
                if item.item_type is ItemType.FREE_RESPONSE:
                    golden = FREE_BY_KEY[event.open_answers[pos]]
                    responses[item.id] = {"text": golden.answer}
                else:
                    responses[item.id] = _response(item, pos not in event.wrong)
            result = await submit_attempt(
                session, tenant_id=tenant, learner_id=event.learner_id,
                activity=activity, responses=responses, now=at,
            )
            if result.pending_response_ids:
                await score_pending_responses(
                    session, result.attempt.id, allow_live=False, now=at
                )

        elif isinstance(event, Submit):
            golden = EVIDENCE_BY_KEY[event.golden]
            capability = caps[_cap(EVIDENCE_CAPABILITY[golden.capability_slug])]
            evidence = Evidence(
                tenant_id=tenant, learner_id=event.learner_id, capability_id=capability.id,
                evidence_type=EvidenceType.WORKPLACE_APPLICATION, title=golden.title,
                content=golden.content, context=golden.context,
                context_ref=golden.context_ref,
                occurred_at=now - timedelta(days=event.occurred_days_ago),
                validation_status=ValidationStatus.PENDING,
                artifacts=classify_artifacts(list(golden.artifacts)),
                created_at=at, updated_at=at,
            )
            session.add(evidence)
            await session.flush()
            evidence_ids[event.golden] = evidence.id
            await run_ai_review(session, evidence, capability, allow_live=False, now=at)
            await recompute_capability_state(
                session, tenant_id=tenant, learner_id=event.learner_id,
                capability_id=capability.id, triggered_by=SignalSource.EVIDENCE,
                actor_id=event.learner_id,
                reason=f"Evidence {evidence.id} submitted and AI-reviewed.",
                evidence_id=evidence.id, now=at,
            )

        else:
            evidence = await session.get(Evidence, evidence_ids[event.golden])
            await record_manager_validation(
                session, evidence=evidence, manager_id=MANAGER_ID,
                decision=event.decision, strength=event.strength,
                observed_in_work=True, applied_independently=True,
                feedback=event.feedback, now=at,
            )

    # Stored state is as of each learner's last event. Bring it to today the
    # way the scheduled decay pass does: same engine, system actor, audited.
    touched = (
        await session.execute(
            select(CapabilityStateRecord.subject_id, CapabilityStateRecord.capability_id)
            .where(CapabilityStateRecord.tenant_id == tenant)
        )
    ).all()
    for subject_id, capability_id in touched:
        await recompute_capability_state(
            session, tenant_id=tenant, learner_id=subject_id, capability_id=capability_id,
            triggered_by=SignalSource.SYSTEM, actor_id=None,
            reason="Scheduled decay recomputation: evidence weight re-aged to today.",
            now=now,
        )
    return evidence_ids


# --- Reset ---------------------------------------------------------------------------

_lock = asyncio.Lock()


async def _wipe(session: AsyncSession) -> None:
    """Delete the demo tenant's mutable rows. Children before parents."""
    tenant = demo_tenant()
    for model in (
        ItemResponse, ActivityAttempt, ManagerValidation, EvidenceReview, Evidence,
        CapabilityStateEvent, CapabilityStateRecord,
    ):
        await session.execute(delete(model).where(model.tenant_id == tenant))
    await session.flush()


@dataclass
class ResetReport:
    tenant_id: str
    org_name: str
    elapsed_ms: float
    personas: int
    evidence: int
    pending_validation: int
    audit_events: int


async def reset_demo(session: AsyncSession, *, now: datetime | None = None) -> ResetReport:
    """Wipe and re-seed the demo tenant inside the caller's transaction."""
    async with _lock:
        started = time.perf_counter()
        now = now or datetime.now(UTC)
        await _wipe(session)
        pinned = await _seed_static(session, now)
        await _replay(session, now)
        del pinned
        await session.flush()

        tenant = demo_tenant()
        evidence = (
            await session.execute(select(Evidence).where(Evidence.tenant_id == tenant))
        ).scalars().all()
        events = (
            await session.execute(
                select(CapabilityStateEvent.id).where(CapabilityStateEvent.tenant_id == tenant)
            )
        ).all()
        return ResetReport(
            tenant_id=tenant,
            org_name=ORG_NAME,
            elapsed_ms=round((time.perf_counter() - started) * 1000, 1),
            personas=len(PERSONAS),
            evidence=len(evidence),
            pending_validation=sum(
                1 for e in evidence if e.validation_status is ValidationStatus.PENDING
            ),
            audit_events=len(events),
        )


async def demo_is_seeded(session: AsyncSession) -> bool:
    return (await session.get(User, PRIYA_ID)) is not None


async def main() -> None:
    from app.database import Base, get_engine, get_session_factory

    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with get_session_factory()() as session:
        report = await reset_demo(session)
        await session.commit()
    print(f"Seeded '{report.org_name}' into tenant '{report.tenant_id}' in {report.elapsed_ms} ms")
    print(f"  {report.personas} personas, {report.evidence} evidence items "
          f"({report.pending_validation} pending), {report.audit_events} audit events")
    for p in PERSONAS:
        print(f"  {p.display_name:15} {p.role.value:8} {p.email}")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
