"""Load a learner's knowledge snapshot for one capability from the database."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ActivityAttempt, LearningActivity
from app.scoring.knowledge import AttemptSummary, KnowledgeSnapshot, knowledge_snapshot


async def load_knowledge_snapshot(
    session: AsyncSession, *, tenant_id: str, learner_id: str, capability_id: str
) -> KnowledgeSnapshot:
    rows = (
        await session.execute(
            select(ActivityAttempt, LearningActivity)
            .join(LearningActivity, LearningActivity.id == ActivityAttempt.activity_id)
            .where(
                ActivityAttempt.tenant_id == tenant_id,
                ActivityAttempt.learner_id == learner_id,
                ActivityAttempt.capability_id == capability_id,
                ActivityAttempt.score.is_not(None),
                ActivityAttempt.submitted_at.is_not(None),
            )
        )
    ).all()

    return knowledge_snapshot([
        AttemptSummary(
            activity_id=activity.id,
            kind=activity.kind,
            phase=activity.phase,
            instrument_ref=activity.instrument_ref,
            attempt_number=attempt.attempt_number,
            score=attempt.score,
            submitted_at=attempt.submitted_at,
        )
        for attempt, activity in rows
    ])
