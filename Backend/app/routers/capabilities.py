"""Capability state endpoints.

Read paths for the learner and manager workspaces. Every response keeps the D1
split visible: `attained_level` and `current_support_level` are returned as
separate fields with a confidence band, never collapsed into one score. A UI
that merges them loses the entire argument for the model.

Aggregates follow D2: coverage and distribution, never an average level.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import verify_token
from app.database import get_db
from app.models import Capability, CapabilityStateRecord, User
from app.routers.evidence import subject_of, tenant_of
from app.schemas.capability import CapabilityLevel, SubjectType
from app.scoring.engine import LEVEL_ORDER, SubjectState, aggregate, level_index
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
    # True when decayed evidence supports less than what was validated. This is
    # a prompt to revalidate, never a statement that the person declined (D1).
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


@router.get("", response_model=list[CapabilityItem])
async def list_capabilities(
    token: dict = Depends(verify_token),
    session: AsyncSession = Depends(get_db),
) -> list[CapabilityItem]:
    """The Capability Spine for this tenant."""
    rows = (
        await session.execute(
            select(Capability)
            .where(Capability.tenant_id == tenant_of(token))
            .order_by(Capability.name)
        )
    ).scalars().all()

    return [
        CapabilityItem(
            id=row.id,
            slug=row.slug,
            name=row.name,
            description=row.description,
            capability_class=str(row.capability_class),
            linked_kpi_ids=[k for k in row.linked_kpi_ids.split(",") if k],
        )
        for row in rows
    ]


async def _states_for_subject(
    session: AsyncSession, *, tenant_id: str, subject_id: str
) -> list[CapabilityStateItem]:
    """Every capability in the Spine, with this subject's state against it.

    Capabilities with no evidence yet are still returned, at novice with zero
    confidence. Omitting them would hide exactly the gaps the product exists
    to surface.
    """
    capabilities = (
        await session.execute(
            select(Capability)
            .where(Capability.tenant_id == tenant_id)
            .order_by(Capability.name)
        )
    ).scalars().all()

    records = {
        row.capability_id: row
        for row in (
            await session.execute(
                select(CapabilityStateRecord).where(
                    CapabilityStateRecord.tenant_id == tenant_id,
                    CapabilityStateRecord.subject_id == subject_id,
                    CapabilityStateRecord.subject_type == SubjectType.LEARNER,
                )
            )
        ).scalars().all()
    }

    items: list[CapabilityStateItem] = []
    for capability in capabilities:
        record = records.get(capability.id)
        requirement = await resolve_required_level(
            session,
            tenant_id=tenant_id,
            capability_id=capability.id,
            subject_id=subject_id,
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
                confidence_band=(
                    str(record.confidence_band) if record else "revalidation_due"
                ),
                validated_points=record.validated_points if record else 0.0,
                provisional_points=record.provisional_points if record else 0.0,
                independent_contexts=record.independent_contexts if record else 0,
                half_life_days=record.half_life_days if record else 0.0,
                recommended_next_action=(
                    record.recommended_next_action
                    if record and record.recommended_next_action
                    else "Submit workplace evidence to begin."
                ),
                scoring_model_version=(
                    record.scoring_model_version if record else ""
                ),
            )
        )
    return items


@router.get("/me", response_model=list[CapabilityStateItem])
async def my_capability_states(
    token: dict = Depends(verify_token),
    session: AsyncSession = Depends(get_db),
) -> list[CapabilityStateItem]:
    """The signed-in learner's capability state across the Spine."""
    return await _states_for_subject(
        session, tenant_id=tenant_of(token), subject_id=subject_of(token)
    )


@router.get("/learner/{learner_id}", response_model=list[CapabilityStateItem])
async def learner_capability_states(
    learner_id: str,
    token: dict = Depends(verify_token),
    session: AsyncSession = Depends(get_db),
) -> list[CapabilityStateItem]:
    """One report's state. Restricted to that person's own manager."""
    tenant_id = tenant_of(token)
    viewer_id = subject_of(token)

    learner = (
        await session.execute(
            select(User).where(User.id == learner_id, User.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if learner is None:
        raise HTTPException(status_code=404, detail="Learner not found.")

    if learner.manager_id != viewer_id and learner_id != viewer_id:
        # Capability state is developmental data. Anyone may not browse it.
        raise HTTPException(
            status_code=403,
            detail="Only this learner or their manager may view this state.",
        )

    return await _states_for_subject(
        session, tenant_id=tenant_id, subject_id=learner_id
    )


@router.get("/team", response_model=list[TeamAggregate])
async def team_aggregate(
    token: dict = Depends(verify_token),
    session: AsyncSession = Depends(get_db),
) -> list[TeamAggregate]:
    """Aggregate state across the signed-in manager's direct reports (D2).

    Returns coverage and the full distribution. There is deliberately no team
    average: levels are ordinal, so a mean is undefined, and it would hide the
    distribution that decides what intervention is needed.
    """
    tenant_id = tenant_of(token)
    manager_id = subject_of(token)

    reports = (
        await session.execute(
            select(User).where(
                User.tenant_id == tenant_id,
                User.manager_id == manager_id,
                User.is_active.is_(True),
            )
        )
    ).scalars().all()

    capabilities = (
        await session.execute(
            select(Capability)
            .where(Capability.tenant_id == tenant_id)
            .order_by(Capability.name)
        )
    ).scalars().all()

    if not reports:
        return [
            TeamAggregate(
                capability_id=c.id,
                capability_name=c.name,
                subject_count=0,
                validated_coverage=0.0,
                nominal_coverage=0.0,
                median_level=None,
                distribution={level.value: 0 for level in LEVEL_ORDER},
                critical_gap_count=0,
                revalidation_due_count=0,
            )
            for c in capabilities
        ]

    per_learner = {
        report.id: await _states_for_subject(
            session, tenant_id=tenant_id, subject_id=report.id
        )
        for report in reports
    }

    results: list[TeamAggregate] = []
    for capability in capabilities:
        states: list[SubjectState] = []
        for items in per_learner.values():
            item = next(
                (i for i in items if i.capability_id == capability.id), None
            )
            if item is None:
                continue
            states.append(
                SubjectState(
                    attained_level=CapabilityLevel(item.attained_level),
                    required_level=CapabilityLevel(item.required_level),
                    state_confidence=item.state_confidence,
                    manager_validated=item.validated_points > 0,
                    revalidation_due=item.confidence_band == "revalidation_due",
                )
            )

        summary = aggregate(states)
        results.append(
            TeamAggregate(
                capability_id=capability.id,
                capability_name=capability.name,
                subject_count=summary.subject_count,
                validated_coverage=summary.validated_coverage,
                nominal_coverage=summary.nominal_coverage,
                median_level=(
                    summary.median_level.value if summary.median_level else None
                ),
                distribution=summary.distribution,
                critical_gap_count=summary.critical_gap_count,
                revalidation_due_count=summary.revalidation_due_count,
            )
        )
    return results
