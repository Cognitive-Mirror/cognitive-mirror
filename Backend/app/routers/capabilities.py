"""Capability state read endpoints.

The D1 split stays visible in every payload: `attained_level` and
`current_support_level` are separate fields with a confidence band, never one
score. Aggregates follow D2: coverage and distribution, never an average level.
The knowledge dimension (ADR-003) is reported beside the level, never in it.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import current_user, require_supervisor
from app.database import get_db
from app.models import Capability, CapabilityStateRecord, User
from app.schemas.capability import CapabilityLevel, SubjectType
from app.scoring.engine import SubjectState, aggregate, level_index
from app.services.requirement_resolver import resolve_required_level

router = APIRouter(prefix="/capabilities", tags=["capabilities"])


class CapabilityItem(BaseModel):
    id: str
    slug: str
    name: str
    description: str
    capability_class: str
    linked_kpi_ids: list[str]


class CapabilityStateItem(BaseModel):
    """One capability for one learner, with the D1 split intact."""

    capability_id: str
    capability_name: str
    capability_class: str

    required_level: str
    required_level_source: str
    required_level_provenance: str

    attained_level: str
    current_support_level: str
    # Decayed evidence supports less than what was validated: a prompt to
    # revalidate, never a statement that the person declined (D1).
    needs_revalidation: bool

    status: str
    gap: int
    state_confidence: float
    confidence_band: str
    validated_points: float
    provisional_points: float
    independent_contexts: int
    half_life_days: float
    recommended_next_action: str
    scoring_model_version: str

    knowledge_mastery: float | None
    knowledge_source: str
    knowledge_pre: float | None
    knowledge_post: float | None
    knowledge_gain: float | None
    knowing_doing: str


class TeamAggregate(BaseModel):
    """Group view. Deliberately has no average level (D2)."""

    capability_id: str
    capability_name: str
    subject_count: int
    validated_coverage: float
    nominal_coverage: float
    median_level: str | None
    distribution: dict[str, int]
    critical_gap_count: int
    revalidation_due_count: int


async def _tenant_capabilities(session: AsyncSession, tenant_id: str) -> list[Capability]:
    return list(
        (
            await session.execute(
                select(Capability)
                .where(Capability.tenant_id == tenant_id)
                .order_by(Capability.name)
            )
        ).scalars()
    )


async def _states_for(session: AsyncSession, subject: User) -> list[CapabilityStateItem]:
    """Every capability in the Spine with this person's state against it.

    Capabilities with no activity yet are returned at novice with zero
    confidence. Omitting them would hide exactly the gaps the product surfaces.
    """
    records = {
        row.capability_id: row
        for row in (
            await session.execute(
                select(CapabilityStateRecord).where(
                    CapabilityStateRecord.tenant_id == subject.tenant_id,
                    CapabilityStateRecord.subject_id == subject.id,
                    CapabilityStateRecord.subject_type == SubjectType.LEARNER,
                )
            )
        ).scalars()
    }

    items: list[CapabilityStateItem] = []
    for capability in await _tenant_capabilities(session, subject.tenant_id):
        record = records.get(capability.id)
        requirement = await resolve_required_level(
            session,
            tenant_id=subject.tenant_id,
            capability_id=capability.id,
            subject_id=subject.id,
            role_ref=subject.role_ref,
            program_ref=subject.program_ref,
        )
        attained = record.attained_level if record else CapabilityLevel.NOVICE
        support = record.current_support_level if record else CapabilityLevel.NOVICE

        items.append(
            CapabilityStateItem(
                capability_id=capability.id,
                capability_name=capability.name,
                capability_class=str(capability.capability_class),
                required_level=str(requirement.level),
                required_level_source=str(requirement.source),
                required_level_provenance=requirement.provenance,
                attained_level=str(attained),
                current_support_level=str(support),
                needs_revalidation=level_index(support) < level_index(attained),
                status=str(record.status) if record else "not_started",
                gap=level_index(requirement.level) - level_index(attained),
                state_confidence=record.state_confidence if record else 0.0,
                confidence_band=str(record.confidence_band) if record else "revalidation_due",
                validated_points=record.validated_points if record else 0.0,
                provisional_points=record.provisional_points if record else 0.0,
                independent_contexts=record.independent_contexts if record else 0,
                half_life_days=record.half_life_days if record else 0.0,
                recommended_next_action=(
                    record.recommended_next_action
                    if record and record.recommended_next_action
                    else "Start the learning journey, then apply it at work."
                ),
                scoring_model_version=record.scoring_model_version if record else "",
                knowledge_mastery=record.knowledge_mastery if record else None,
                knowledge_source=record.knowledge_source if record else "none",
                knowledge_pre=record.knowledge_pre if record else None,
                knowledge_post=record.knowledge_post if record else None,
                knowledge_gain=record.knowledge_gain if record else None,
                knowing_doing=str(record.knowing_doing) if record else "insufficient_data",
            )
        )
    return items


@router.get("", response_model=list[CapabilityItem])
async def list_capabilities(
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_db),
) -> list[CapabilityItem]:
    """The Capability Spine for this tenant."""
    return [
        CapabilityItem(
            id=c.id,
            slug=c.slug,
            name=c.name,
            description=c.description,
            capability_class=str(c.capability_class),
            linked_kpi_ids=[k for k in c.linked_kpi_ids.split(",") if k],
        )
        for c in await _tenant_capabilities(session, user.tenant_id)
    ]


@router.get("/me", response_model=list[CapabilityStateItem])
async def my_capability_states(
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_db),
) -> list[CapabilityStateItem]:
    return await _states_for(session, user)


@router.get("/learner/{learner_id}", response_model=list[CapabilityStateItem])
async def learner_capability_states(
    learner_id: str,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_db),
) -> list[CapabilityStateItem]:
    """One person's state: visible to them, their manager, and admins."""
    learner = await session.get(User, learner_id)
    if learner is None or learner.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="Learner not found.")
    if learner.id != user.id and not user.can_supervise(learner):
        # Capability state is developmental data, not a directory.
        raise HTTPException(
            status_code=403,
            detail="Only this learner, their manager or an admin may view this state.",
        )
    return await _states_for(session, learner)


@router.get("/team", response_model=list[TeamAggregate])
async def team_aggregate(
    user: User = Depends(require_supervisor),
    session: AsyncSession = Depends(get_db),
) -> list[TeamAggregate]:
    """Coverage and distribution across this manager's direct reports (D2).

    No team average: levels are ordinal, so a mean is undefined, and it would
    hide the distribution that decides what intervention is needed.
    """
    reports = (
        await session.execute(
            select(User).where(
                User.tenant_id == user.tenant_id,
                User.manager_id == user.id,
                User.is_active.is_(True),
            )
        )
    ).scalars().all()

    states_by_capability: dict[str, list[SubjectState]] = {}
    for report in reports:
        for item in await _states_for(session, report):
            states_by_capability.setdefault(item.capability_id, []).append(
                SubjectState(
                    attained_level=CapabilityLevel(item.attained_level),
                    required_level=CapabilityLevel(item.required_level),
                    state_confidence=item.state_confidence,
                    manager_validated=item.validated_points > 0,
                    revalidation_due=item.confidence_band == "revalidation_due",
                )
            )

    results: list[TeamAggregate] = []
    for capability in await _tenant_capabilities(session, user.tenant_id):
        summary = aggregate(states_by_capability.get(capability.id, []))
        results.append(
            TeamAggregate(
                capability_id=capability.id,
                capability_name=capability.name,
                subject_count=summary.subject_count,
                validated_coverage=summary.validated_coverage,
                nominal_coverage=summary.nominal_coverage,
                median_level=summary.median_level.value if summary.median_level else None,
                distribution=summary.distribution,
                critical_gap_count=summary.critical_gap_count,
                revalidation_due_count=summary.revalidation_due_count,
            )
        )
    return results
