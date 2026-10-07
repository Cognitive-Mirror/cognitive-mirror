"""Learning journey: serving exercises, scoring attempts, updating state.

    submit attempt
      -> deterministic items scored immediately
      -> free-response items queued (AI scoring is slow on reasoning models;
         a learner must never wait on it to see their quiz result)
      -> attempt totals over SCORED items only - pending is excluded, not zeroed
      -> capability state recomputed: the knowledge dimension moves,
         attained_level cannot (ADR-003)

Answer keys never leave this module in a learner-facing shape. `public_item`
is the only serialiser for items, and it builds from an allowlist.
"""

from __future__ import annotations

import hashlib
import logging
import random
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ai.services.evidence_intelligence import recompute_capability_state
from ai.services.free_response_scoring import assess_free_response
from app.models import (
    ActivityAttempt,
    AssessmentItem,
    ItemResponse,
    LearningActivity,
    User,
)
from app.schemas.capability import SignalSource
from app.schemas.learning import AttemptStatus, ItemType, ScoredBy
from app.scoring.items import ITEM_SCORING_VERSION, is_deterministic, score_item

logger = logging.getLogger(__name__)


class LearningError(Exception):
    """A request the learning domain refuses, with a learner-safe message."""

    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code


# --- Serving items -----------------------------------------------------------


def _stable_shuffle(values: list, seed: str) -> list:
    """Shuffle per (learner, item), stable across reloads.

    Ranking and matching are meaningless if presented in answer order; a fresh
    shuffle on every load would let a learner refresh until the order is easy.
    """
    rng = random.Random(int(hashlib.sha256(seed.encode()).hexdigest()[:16], 16))
    out = list(values)
    rng.shuffle(out)
    return out


def public_item(item: AssessmentItem, learner_id: str) -> dict:
    """Learner-facing view of an item. Built from an allowlist: no answer key."""
    payload = dict(item.payload or {})
    seed = f"{learner_id}:{item.id}"
    if item.item_type is ItemType.RANK:
        payload["items"] = _stable_shuffle(payload.get("items", []), seed)
    elif item.item_type is ItemType.MATCH:
        payload["right"] = _stable_shuffle(payload.get("right", []), seed)
    elif item.item_type is ItemType.CATEGORIZE:
        payload["items"] = _stable_shuffle(payload.get("items", []), seed)

    allowed = {
        "options", "items", "left", "right", "buckets", "placeholder",
        "min_words", "guidance",
    }
    return {
        "id": item.id,
        "position": item.position,
        "section": item.section,
        "item_type": str(item.item_type),
        "dimension": str(item.dimension),
        "prompt": item.prompt,
        "points": item.points,
        "payload": {k: v for k, v in payload.items() if k in allowed},
    }


# --- Availability -------------------------------------------------------------


def is_available(activity: LearningActivity, now: datetime | None = None) -> bool:
    now = now or datetime.now(UTC)
    return activity.is_published and (
        activity.available_from is None or activity.available_from <= now
    )


async def attempts_used(
    session: AsyncSession, *, tenant_id: str, learner_id: str, activity_id: str
) -> int:
    return (
        await session.execute(
            select(func.count(ActivityAttempt.id)).where(
                ActivityAttempt.tenant_id == tenant_id,
                ActivityAttempt.learner_id == learner_id,
                ActivityAttempt.activity_id == activity_id,
                ActivityAttempt.submitted_at.is_not(None),
            )
        )
    ).scalar_one()


# --- Scoring -----------------------------------------------------------------


def finalize_totals(
    attempt: ActivityAttempt,
    pairs: list[tuple[AssessmentItem, ItemResponse]],
) -> None:
    """Recompute attempt totals. Pending items are excluded, never zeroed.

    Zeroing a pending free-response answer would show a learner a wrong, low
    mark while the AI is still working, and would feed that mark into the
    knowledge estimate.
    """
    earned = scored = possible = 0.0
    pending = False
    for item, resp in pairs:
        possible += item.points
        if resp.credit is None:
            pending = pending or resp.scored_by is ScoredBy.PENDING
            continue
        earned += resp.credit * item.points
        scored += item.points
    attempt.points_earned = round(earned, 4)
    attempt.points_scored = round(scored, 4)
    attempt.points_possible = round(possible, 4)
    attempt.score = round(earned / scored, 4) if scored > 0 else None
    attempt.status = AttemptStatus.SCORING if pending else AttemptStatus.SCORED


@dataclass
class SubmissionResult:
    attempt: ActivityAttempt
    pairs: list[tuple[AssessmentItem, ItemResponse]]
    pending_response_ids: list[str]


async def submit_attempt(
    session: AsyncSession,
    *,
    tenant_id: str,
    learner_id: str,
    activity: LearningActivity,
    responses: dict[str, dict],
) -> SubmissionResult:
    """Score a complete submission. Unanswered items score zero."""
    if not is_available(activity):
        raise LearningError("This activity is not available yet.", 403)

    used = await attempts_used(
        session, tenant_id=tenant_id, learner_id=learner_id, activity_id=activity.id
    )
    if activity.max_attempts and used >= activity.max_attempts:
        raise LearningError(
            "No attempts remain for this activity. A baseline assessment is "
            "taken once so that it stays a baseline.",
            409,
        )

    items = (
        await session.execute(
            select(AssessmentItem)
            .where(AssessmentItem.activity_id == activity.id)
            .order_by(AssessmentItem.position)
        )
    ).scalars().all()
    if not items:
        raise LearningError("This activity has no exercises.", 422)

    unknown = set(responses) - {i.id for i in items}
    if unknown:
        raise LearningError("Responses reference items outside this activity.", 422)

    now = datetime.now(UTC)
    attempt = ActivityAttempt(
        tenant_id=tenant_id,
        activity_id=activity.id,
        learner_id=learner_id,
        capability_id=activity.capability_id,
        attempt_number=used + 1,
        submitted_at=now,
        scoring_version=ITEM_SCORING_VERSION,
    )
    session.add(attempt)
    await session.flush()

    pairs: list[tuple[AssessmentItem, ItemResponse]] = []
    for item in items:
        given = responses.get(item.id) or {}
        resp = ItemResponse(
            tenant_id=tenant_id, attempt_id=attempt.id, item_id=item.id, response=given
        )
        if is_deterministic(item.item_type):
            result = score_item(item.item_type, item.answer_key, given)
            resp.credit = result.credit
            resp.scored_by = ScoredBy.DETERMINISTIC
            resp.feedback = result.detail
        elif not (given.get("text") or "").strip():
            resp.credit = 0.0
            resp.scored_by = ScoredBy.DETERMINISTIC
            resp.feedback = "No answer entered."
        else:
            resp.credit = None
            resp.scored_by = ScoredBy.PENDING
            resp.feedback = "Being reviewed."
        session.add(resp)
        pairs.append((item, resp))

    await session.flush()
    pending = [r.id for i, r in pairs if r.scored_by is ScoredBy.PENDING]
    finalize_totals(attempt, pairs)

    await _recompute(session, attempt, activity, actor_id=learner_id)
    return SubmissionResult(attempt=attempt, pairs=pairs, pending_response_ids=pending)


async def _recompute(
    session: AsyncSession,
    attempt: ActivityAttempt,
    activity: LearningActivity,
    *,
    actor_id: str,
) -> None:
    score = "pending" if attempt.score is None else f"{attempt.score:.0%}"
    await recompute_capability_state(
        session,
        tenant_id=attempt.tenant_id,
        learner_id=attempt.learner_id,
        capability_id=attempt.capability_id,
        triggered_by=SignalSource.ASSESSMENT,
        actor_id=actor_id,
        reason=(
            f"{activity.kind.value} '{activity.title}' attempt "
            f"{attempt.attempt_number} scored {score}. Knowledge signal only; "
            "attained level unaffected (ADR-003)."
        ),
    )


async def _load_pairs(
    session: AsyncSession, attempt_id: str
) -> list[tuple[AssessmentItem, ItemResponse]]:
    return list(
        (
            await session.execute(
                select(AssessmentItem, ItemResponse)
                .join(ItemResponse, ItemResponse.item_id == AssessmentItem.id)
                .where(ItemResponse.attempt_id == attempt_id)
                .order_by(AssessmentItem.position)
            )
        ).tuples().all()
    )


async def score_pending_responses(session: AsyncSession, attempt_id: str) -> int:
    """AI-score every pending free response on an attempt. Returns how many scored.

    Runs after the HTTP response has gone back. Responses the AI cannot settle
    stay PENDING and appear in the facilitator queue.
    """
    attempt = await session.get(ActivityAttempt, attempt_id)
    if attempt is None:
        return 0
    activity = await session.get(LearningActivity, attempt.activity_id)
    pairs = await _load_pairs(session, attempt_id)

    scored = 0
    for item, resp in pairs:
        if resp.scored_by is not ScoredBy.PENDING or item.item_type is not ItemType.FREE_RESPONSE:
            continue
        key = item.answer_key or {}
        outcome = assess_free_response(
            question=item.prompt,
            key_points=list(key.get("key_points", [])),
            model_answer=key.get("model_answer", ""),
            answer=(resp.response or {}).get("text", ""),
        )
        resp.feedback = outcome.feedback
        resp.model_name = outcome.model_name
        resp.prompt_version = outcome.prompt_version
        resp.ai_confidence = outcome.confidence
        if outcome.credit is not None:
            resp.credit = outcome.credit
            resp.scored_by = ScoredBy.AI
            scored += 1

    finalize_totals(attempt, pairs)
    await session.flush()
    if scored:
        await _recompute(session, attempt, activity, actor_id="system")
    return scored


async def score_response_by_human(
    session: AsyncSession,
    *,
    scorer: User,
    response_id: str,
    credit: float,
    feedback: str,
) -> ActivityAttempt:
    """A supervisor settles a response the AI could not, or overrides it."""
    resp = await session.get(ItemResponse, response_id)
    if resp is None or resp.tenant_id != scorer.tenant_id:
        raise LearningError("Response not found.", 404)
    attempt = await session.get(ActivityAttempt, resp.attempt_id)
    learner = await session.get(User, attempt.learner_id)
    if learner is None or not scorer.can_supervise(learner):
        raise LearningError("Only this learner's manager or an admin may mark their answers.", 403)

    resp.credit = max(0.0, min(1.0, credit))
    resp.scored_by = ScoredBy.HUMAN
    if feedback:
        resp.feedback = feedback

    pairs = await _load_pairs(session, attempt.id)
    finalize_totals(attempt, pairs)
    await session.flush()
    activity = await session.get(LearningActivity, attempt.activity_id)
    await _recompute(session, attempt, activity, actor_id=scorer.id)
    return attempt


__all__ = [
    "LearningError",
    "SubmissionResult",
    "attempts_used",
    "finalize_totals",
    "is_available",
    "public_item",
    "score_pending_responses",
    "score_response_by_human",
    "submit_attempt",
]
