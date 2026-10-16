"""Learning journey endpoints: e-learns, knowledge checks, pre/post assessments.

Tenant and learner come from the caller's users row, never the body (thesis 24).
Answer keys never appear in any response before submission, and after it they
are revealed for e-learn knowledge checks only: an assessment that revealed its
answers would contaminate its own post-test.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.auth import current_user, require_supervisor
from app.database import get_db, get_session_factory
from app.models import (
    ActivityAttempt,
    AssessmentItem,
    Capability,
    ItemResponse,
    LearningActivity,
    Role,
    User,
)
from app.schemas.learning import ActivityKind, ItemType, ScoredBy
from app.services.learning_service import (
    LearningError,
    is_available,
    public_item,
    score_pending_responses,
    score_response_by_human,
    submit_attempt,
)

router = APIRouter(prefix="/learning", tags=["learning"])
logger = logging.getLogger(__name__)


def background_session_factory() -> async_sessionmaker[AsyncSession]:
    """Session factory for post-response work. A dependency so tests can swap it."""
    return get_session_factory()


# --- Models --------------------------------------------------------------------


class ActivitySummary(BaseModel):
    id: str
    slug: str
    title: str
    summary: str
    kind: str
    phase: str
    capability_id: str
    capability_name: str
    sequence: int
    estimated_minutes: int
    item_count: int
    available: bool
    available_from: datetime | None
    attempts_used: int
    max_attempts: int
    first_score: float | None
    latest_score: float | None
    latest_status: str | None
    pass_mark: float


class ActivityDetail(ActivitySummary):
    sections: list[dict]
    items: list[dict]


class AttemptRequest(BaseModel):
    responses: dict[str, dict[str, Any]] = Field(
        default_factory=dict, description="item_id -> response payload"
    )


class ItemResult(BaseModel):
    item_id: str
    response_id: str
    credit: float | None
    scored_by: str
    feedback: str
    explanation: str = ""
    reveal: dict | None = None
    # Open answers: the key points the AI credited and the verbatim quotes it
    # credited them on, each located in the answer server-side. Key point TEXT
    # stays in `reveal`, which assessments never send.
    ai_detail: dict | None = None


class AttemptResult(BaseModel):
    attempt_id: str
    activity_id: str
    attempt_number: int
    status: str
    score: float | None
    points_earned: float
    points_scored: float
    points_possible: float
    passed: bool | None
    pending_items: int
    items: list[ItemResult]


class HumanScoreRequest(BaseModel):
    credit: float = Field(ge=0.0, le=1.0)
    feedback: str = ""


class HumanScoreResult(BaseModel):
    attempt_id: str
    status: str
    score: float | None


class OpenAnswer(BaseModel):
    response_id: str
    learner_id: str
    learner_name: str
    activity_title: str
    question: str
    answer: str
    key_points: list[str]
    ai_note: str
    submitted_at: datetime | None


# --- Helpers -----------------------------------------------------------------


def _reveal(item: AssessmentItem) -> dict | None:
    """The correct answer, in the item's own shape. E-learn checks only."""
    key = item.answer_key or {}
    t = item.item_type
    if t is ItemType.SINGLE_CHOICE:
        return {"correct": key.get("correct")}
    if t is ItemType.MULTI_CHOICE:
        return {"correct": key.get("correct", [])}
    if t is ItemType.MATCH:
        return {"pairs": key.get("pairs", {})}
    if t is ItemType.RANK:
        return {"order": key.get("order", [])}
    if t is ItemType.CATEGORIZE:
        return {"placement": key.get("placement", {})}
    if t is ItemType.SHORT_ANSWER:
        return {"accepted": key.get("accepted", [])[:1]}
    if t is ItemType.FREE_RESPONSE:
        return {
            "key_points": key.get("key_points", []),
            "model_answer": key.get("model_answer", ""),
        }
    return None


async def _attempt_result(
    session: AsyncSession, attempt: ActivityAttempt, activity: LearningActivity
) -> AttemptResult:
    pairs = (
        await session.execute(
            select(AssessmentItem, ItemResponse)
            .join(ItemResponse, ItemResponse.item_id == AssessmentItem.id)
            .where(ItemResponse.attempt_id == attempt.id)
            .order_by(AssessmentItem.position)
        )
    ).all()
    teach = activity.kind is ActivityKind.ELEARN
    pending = sum(1 for _, r in pairs if r.scored_by is ScoredBy.PENDING)
    return AttemptResult(
        attempt_id=attempt.id,
        activity_id=activity.id,
        attempt_number=attempt.attempt_number,
        status=str(attempt.status),
        score=attempt.score,
        points_earned=attempt.points_earned,
        points_scored=attempt.points_scored,
        points_possible=attempt.points_possible,
        passed=(
            None if attempt.score is None or pending
            else attempt.score >= activity.pass_mark
        ),
        pending_items=pending,
        items=[
            ItemResult(
                item_id=item.id,
                response_id=resp.id,
                credit=resp.credit,
                scored_by=str(resp.scored_by),
                feedback=resp.feedback,
                explanation=item.explanation if teach else "",
                reveal=_reveal(item) if teach else None,
                ai_detail=resp.ai_detail,
            )
            for item, resp in pairs
        ],
    )


async def _summaries(
    session: AsyncSession,
    *,
    tenant_id: str,
    learner_id: str,
    activities: list[LearningActivity],
) -> list[ActivitySummary]:
    caps = {
        c.id: c.name
        for c in (
            await session.execute(select(Capability).where(Capability.tenant_id == tenant_id))
        ).scalars()
    }
    out: list[ActivitySummary] = []
    for a in activities:
        item_count = len(
            (
                await session.execute(
                    select(AssessmentItem.id).where(AssessmentItem.activity_id == a.id)
                )
            ).all()
        )
        attempts = (
            await session.execute(
                select(ActivityAttempt)
                .where(
                    ActivityAttempt.tenant_id == tenant_id,
                    ActivityAttempt.learner_id == learner_id,
                    ActivityAttempt.activity_id == a.id,
                )
                .order_by(ActivityAttempt.attempt_number)
            )
        ).scalars().all()
        out.append(
            ActivitySummary(
                id=a.id,
                slug=a.slug,
                title=a.title,
                summary=a.summary,
                kind=str(a.kind),
                phase=str(a.phase),
                capability_id=a.capability_id,
                capability_name=caps.get(a.capability_id, ""),
                sequence=a.sequence,
                estimated_minutes=a.estimated_minutes,
                item_count=item_count,
                available=is_available(a),
                available_from=a.available_from,
                attempts_used=len(attempts),
                max_attempts=a.max_attempts,
                first_score=attempts[0].score if attempts else None,
                latest_score=attempts[-1].score if attempts else None,
                latest_status=str(attempts[-1].status) if attempts else None,
                pass_mark=a.pass_mark,
            )
        )
    return out


async def _activity_or_404(
    session: AsyncSession, tenant_id: str, activity_id: str
) -> LearningActivity:
    activity = (
        await session.execute(
            select(LearningActivity).where(
                LearningActivity.id == activity_id,
                LearningActivity.tenant_id == tenant_id,
                LearningActivity.is_published.is_(True),
            )
        )
    ).scalar_one_or_none()
    if activity is None:
        raise HTTPException(status_code=404, detail="Activity not found.")
    return activity


# --- Routes ------------------------------------------------------------------


@router.get("/activities", response_model=list[ActivitySummary])
async def list_activities(
    capability_id: str | None = None,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_db),
) -> list[ActivitySummary]:
    """The learner's journey: every published activity, with their progress."""
    tenant_id = user.tenant_id
    q = select(LearningActivity).where(
        LearningActivity.tenant_id == tenant_id,
        LearningActivity.is_published.is_(True),
    )
    if capability_id:
        q = q.where(LearningActivity.capability_id == capability_id)
    activities = (
        await session.execute(
            q.order_by(LearningActivity.capability_id, LearningActivity.sequence)
        )
    ).scalars().all()
    return await _summaries(
        session, tenant_id=tenant_id, learner_id=user.id, activities=list(activities)
    )


@router.get("/activities/{activity_id}", response_model=ActivityDetail)
async def get_activity(
    activity_id: str,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_db),
) -> ActivityDetail:
    """Content and exercises. No answer keys."""
    tenant_id = user.tenant_id
    learner_id = user.id
    activity = await _activity_or_404(session, tenant_id, activity_id)
    if not is_available(activity):
        raise HTTPException(status_code=403, detail="This activity is not available yet.")

    items = (
        await session.execute(
            select(AssessmentItem)
            .where(AssessmentItem.activity_id == activity.id)
            .order_by(AssessmentItem.position)
        )
    ).scalars().all()
    [summary] = await _summaries(
        session, tenant_id=tenant_id, learner_id=learner_id, activities=[activity]
    )
    return ActivityDetail(
        **summary.model_dump(),
        sections=list(activity.sections or []),
        items=[public_item(i, learner_id) for i in items],
    )


@router.post("/activities/{activity_id}/attempts", response_model=AttemptResult, status_code=201)
async def submit(
    activity_id: str,
    payload: AttemptRequest,
    background: BackgroundTasks,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_db),
    factory: async_sessionmaker[AsyncSession] = Depends(background_session_factory),
) -> AttemptResult:
    """Submit answers. Deterministic items are marked now; open answers follow."""
    tenant_id = user.tenant_id
    learner_id = user.id
    activity = await _activity_or_404(session, tenant_id, activity_id)
    try:
        result = await submit_attempt(
            session,
            tenant_id=tenant_id,
            learner_id=learner_id,
            activity=activity,
            responses=payload.responses,
        )
    except LearningError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    response = await _attempt_result(session, result.attempt, activity)

    if result.pending_response_ids:
        # The background task opens its own session, so this attempt must be
        # committed before it runs. An explicit commit is the exception to
        # "the dependency owns the transaction", and this is why.
        await session.commit()
        background.add_task(_score_in_background, factory, result.attempt.id)
    return response


async def _score_in_background(
    factory: async_sessionmaker[AsyncSession], attempt_id: str
) -> None:
    async with factory() as session:
        try:
            await score_pending_responses(session, attempt_id)
            await session.commit()
        except Exception:
            await session.rollback()
            logger.exception("Background scoring failed for attempt %s", attempt_id)


@router.get("/attempts/{attempt_id}", response_model=AttemptResult)
async def get_attempt(
    attempt_id: str,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_db),
) -> AttemptResult:
    """Poll an attempt while open answers are being scored. Owner only."""
    tenant_id = user.tenant_id
    attempt = await session.get(ActivityAttempt, attempt_id)
    if (
        attempt is None
        or attempt.tenant_id != tenant_id
        or attempt.learner_id != user.id
    ):
        raise HTTPException(status_code=404, detail="Attempt not found.")
    activity = await session.get(LearningActivity, attempt.activity_id)
    return await _attempt_result(session, attempt, activity)


@router.get("/review-queue", response_model=list[OpenAnswer])
async def review_queue(
    user: User = Depends(require_supervisor),
    session: AsyncSession = Depends(get_db),
) -> list[OpenAnswer]:
    """Open answers the AI could not settle, from people this user supervises."""
    query = (
        select(ItemResponse, AssessmentItem, ActivityAttempt, LearningActivity, User)
        .join(AssessmentItem, AssessmentItem.id == ItemResponse.item_id)
        .join(ActivityAttempt, ActivityAttempt.id == ItemResponse.attempt_id)
        .join(LearningActivity, LearningActivity.id == ActivityAttempt.activity_id)
        .join(User, User.id == ActivityAttempt.learner_id)
        .where(
            ItemResponse.tenant_id == user.tenant_id,
            ItemResponse.scored_by == ScoredBy.PENDING,
            ActivityAttempt.learner_id != user.id,
        )
        .order_by(ItemResponse.created_at)
    )
    if user.role is not Role.ADMIN:
        query = query.where(User.manager_id == user.id)

    return [
        OpenAnswer(
            response_id=resp.id,
            learner_id=learner.id,
            learner_name=learner.display_name or learner.email,
            activity_title=activity.title,
            question=item.prompt,
            answer=(resp.response or {}).get("text", ""),
            key_points=(item.answer_key or {}).get("key_points", []),
            ai_note=resp.feedback,
            submitted_at=attempt.submitted_at,
        )
        for resp, item, attempt, activity, learner in (await session.execute(query)).all()
    ]


@router.post("/responses/{response_id}/score", response_model=HumanScoreResult)
async def human_score(
    response_id: str,
    payload: HumanScoreRequest,
    user: User = Depends(require_supervisor),
    session: AsyncSession = Depends(get_db),
) -> HumanScoreResult:
    """A supervisor marks an open answer. Recorded as HUMAN, never as AI."""
    try:
        attempt = await score_response_by_human(
            session,
            scorer=user,
            response_id=response_id,
            credit=payload.credit,
            feedback=payload.feedback,
        )
    except LearningError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    return HumanScoreResult(attempt_id=attempt.id, status=str(attempt.status), score=attempt.score)
