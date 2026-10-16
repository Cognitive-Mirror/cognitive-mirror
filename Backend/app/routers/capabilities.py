"""Capability state read endpoints.

The D1 split stays visible in every payload: `attained_level` and
`current_support_level` are separate fields with a confidence band, never one
score. Aggregates follow D2: coverage and distribution, never an average level.
The knowledge dimension (ADR-003) is reported beside the level, never in it.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import current_user, require_supervisor
from app.database import get_db
from app.models import (
    Capability,
    CapabilityRequirement,
    CapabilityStateEvent,
    CapabilityStateRecord,
    Evidence,
    EvidenceReview,
    KnowledgeDocument,
    ManagerValidation,
    Role,
    User,
)
from app.schemas.capability import CapabilityLevel, SignalSource, SubjectType
from app.scoring import constants as C
from app.scoring.engine import SubjectState, aggregate, level_index
from app.services.requirement_resolver import PRECEDENCE, resolve_required_level

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


def _revalidation_due(item: CapabilityStateItem) -> bool:
    """Due only when something was validated. A novice has nothing to revalidate.

    Matches the status rule in recompute_capability_state; counting the
    low-confidence band alone flagged every untouched capability as due.
    """
    return item.confidence_band == "revalidation_due" and item.attained_level != "novice"


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
                    revalidation_due=_revalidation_due(item),
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


# --- Team members ----------------------------------------------------------------


class TeamMember(BaseModel):
    id: str
    display_name: str
    email: str
    role_ref: str | None
    program_ref: str | None
    states: list[CapabilityStateItem]


async def _supervised(session: AsyncSession, user: User) -> list[User]:
    """Direct reports for a manager; every active learner for an admin."""
    q = select(User).where(User.tenant_id == user.tenant_id, User.is_active.is_(True))
    if user.role is Role.ADMIN:
        q = q.where(User.role == Role.LEARNER)
    else:
        q = q.where(User.manager_id == user.id)
    return list((await session.execute(q.order_by(User.display_name))).scalars())


@router.get("/team/members", response_model=list[TeamMember])
async def team_members(
    user: User = Depends(require_supervisor),
    session: AsyncSession = Depends(get_db),
) -> list[TeamMember]:
    """Each person this user supervises, with their full capability state."""
    return [
        TeamMember(
            id=m.id, display_name=m.display_name or m.email, email=m.email,
            role_ref=m.role_ref, program_ref=m.program_ref,
            states=await _states_for(session, m),
        )
        for m in await _supervised(session, user)
    ]


# --- Audit trail ---------------------------------------------------------------------


class AuditEvidence(BaseModel):
    id: str
    title: str
    context_ref: str
    artifact_count: int


class AuditReview(BaseModel):
    strength: str
    provenance: str
    grounded: bool
    citations: list[str]
    verified_quotes: int


class AuditValidation(BaseModel):
    decision: str
    strength: str
    feedback: str
    overrode_ai: bool
    manager_name: str


class AuditEvent(BaseModel):
    """One immutable state transition, with what caused it."""

    id: str
    occurred_at: datetime
    kind: str          # evidence_submitted | manager_validation | assessment | decay | other
    label: str
    triggered_by: str
    actor_name: str
    reason: str
    previous_level: str
    new_level: str
    previous_confidence: float
    new_confidence: float
    level_changed: bool
    confidence_unlocked: bool
    """Crossed the unvalidated ceiling: only a manager validation can do this."""
    scoring_model_version: str
    evidence: AuditEvidence | None = None
    review: AuditReview | None = None
    validation: AuditValidation | None = None


class AuditTrail(BaseModel):
    subject_id: str
    subject_name: str
    capability_id: str
    capability_name: str
    unvalidated_ceiling: float
    events: list[AuditEvent]


_KIND = {
    SignalSource.EVIDENCE: ("evidence_submitted", "Evidence submitted · AI rubric review"),
    SignalSource.MANAGER_VALIDATION: ("manager_validation", "Manager decision"),
    SignalSource.ASSESSMENT: ("assessment", "Knowledge signal recorded"),
    SignalSource.SYSTEM: ("decay", "Scheduled decay recomputation"),
}


@router.get("/{capability_id}/audit", response_model=AuditTrail)
async def capability_audit(
    capability_id: str,
    learner_id: str | None = None,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_db),
) -> AuditTrail:
    """The append-only history behind one person's state on one capability.

    Visible to the person, their manager and admins - the same rule as reading
    the state itself.
    """
    subject = user if learner_id in (None, user.id) else await session.get(User, learner_id)
    if subject is None or subject.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="Learner not found.")
    if subject.id != user.id and not user.can_supervise(subject):
        raise HTTPException(
            status_code=403,
            detail="Only this learner, their manager or an admin may view this history.",
        )
    capability = await session.get(Capability, capability_id)
    if capability is None or capability.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="Capability not found.")

    events = (
        await session.execute(
            select(CapabilityStateEvent)
            .where(
                CapabilityStateEvent.tenant_id == user.tenant_id,
                CapabilityStateEvent.subject_id == subject.id,
                CapabilityStateEvent.capability_id == capability_id,
            )
            .order_by(CapabilityStateEvent.occurred_at, CapabilityStateEvent.id)
        )
    ).scalars().all()

    evidence_ids = {e.evidence_id for e in events if e.evidence_id}
    evidence = {
        e.id: e for e in (
            await session.execute(select(Evidence).where(Evidence.id.in_(evidence_ids)))
        ).scalars()
    } if evidence_ids else {}
    reviews = {
        r.evidence_id: r for r in (
            await session.execute(
                select(EvidenceReview).where(EvidenceReview.evidence_id.in_(evidence_ids))
            )
        ).scalars()
    } if evidence_ids else {}
    validations: dict[str, list[ManagerValidation]] = {}
    if evidence_ids:
        for v in (
            await session.execute(
                select(ManagerValidation)
                .where(ManagerValidation.evidence_id.in_(evidence_ids))
                .order_by(ManagerValidation.decided_at)
            )
        ).scalars():
            validations.setdefault(v.evidence_id, []).append(v)
    actor_ids = {e.actor_id for e in events if e.actor_id} | {
        v.manager_id for vs in validations.values() for v in vs
    }
    names = {
        u.id: u.display_name or u.email for u in (
            await session.execute(select(User).where(User.id.in_(actor_ids)))
        ).scalars()
    } if actor_ids else {}

    ceiling = C.UNVALIDATED_CONFIDENCE_CEILING
    out: list[AuditEvent] = []
    for e in events:
        kind, label = _KIND.get(e.triggered_by, ("other", e.triggered_by.value.replace("_", " ")))
        if kind == "assessment" and e.actor_id == "system":
            # The second event of an attempt with open answers: AI marking landed.
            label = "Open answer marked by AI"
        ev = evidence.get(e.evidence_id) if e.evidence_id else None
        rv = reviews.get(e.evidence_id) if e.evidence_id else None
        validation = None
        if kind == "manager_validation" and e.evidence_id:
            # The decision recorded at (or just before) this event.
            candidates = [
                v for v in validations.get(e.evidence_id, []) if v.decided_at <= e.occurred_at
            ] or validations.get(e.evidence_id, [])
            if candidates:
                v = candidates[-1]
                validation = AuditValidation(
                    decision=str(v.decision), strength=str(v.strength), feedback=v.feedback,
                    overrode_ai=v.overrode_ai, manager_name=names.get(v.manager_id, ""),
                )
                label = {
                    "approved": "Manager validated",
                    "rejected": "Manager rejected",
                    "needs_revision": "Manager requested revision",
                    "escalated": "Manager escalated",
                }.get(str(v.decision), label)
        out.append(AuditEvent(
            id=e.id, occurred_at=e.occurred_at, kind=kind, label=label,
            triggered_by=str(e.triggered_by),
            actor_name=names.get(e.actor_id, "System") if e.actor_id else "System",
            reason=e.reason,
            previous_level=str(e.previous_level), new_level=str(e.new_level),
            previous_confidence=e.previous_confidence, new_confidence=e.new_confidence,
            level_changed=e.previous_level != e.new_level,
            confidence_unlocked=e.previous_confidence <= ceiling < e.new_confidence,
            scoring_model_version=e.scoring_model_version,
            evidence=AuditEvidence(
                id=ev.id, title=ev.title, context_ref=ev.context_ref,
                artifact_count=len(ev.artifact_list),
            ) if ev else None,
            review=AuditReview(
                strength=str(rv.strength), provenance=rv.provenance, grounded=rv.grounded,
                citations=rv.citation_list, verified_quotes=len(rv.quote_list),
            ) if rv and kind == "evidence_submitted" else None,
            validation=validation,
        ))

    return AuditTrail(
        subject_id=subject.id, subject_name=subject.display_name or subject.email,
        capability_id=capability.id, capability_name=capability.name,
        unvalidated_ceiling=ceiling, events=out,
    )


# --- Governance matrix ------------------------------------------------------------------


class MatrixClause(BaseModel):
    slug: str
    kind: str
    title: str
    level: str | None
    revision: int


class MatrixRequirement(BaseModel):
    source: str
    precedence: int
    required_level: str
    scope: str
    set_by: str
    rationale: str
    effective_from: datetime


class MatrixCoverage(BaseModel):
    subject_count: int
    validated_coverage: float
    nominal_coverage: float
    median_level: str | None
    distribution: dict[str, int]
    critical_gap_count: int
    revalidation_due_count: int


class MatrixCapability(BaseModel):
    id: str
    slug: str
    name: str
    description: str
    capability_class: str
    base_half_life_days: float
    linked_kpi_ids: list[str]
    clauses: list[MatrixClause]
    requirements: list[MatrixRequirement]
    coverage: MatrixCoverage


class GovernanceMatrix(BaseModel):
    approved_clause_count: int
    clauses_by_kind: dict[str, int]
    shared_clauses: list[MatrixClause]
    capabilities: list[MatrixCapability]
    resolution_order: list[str]
    unvalidated_ceiling: float
    coverage_confidence_floor: float
    scoring_model_version: str


@router.get("/matrix", response_model=GovernanceMatrix)
async def governance_matrix(
    user: User = Depends(require_supervisor),
    session: AsyncSession = Depends(get_db),
) -> GovernanceMatrix:
    """Approved rubric by capability, D6 requirement layers, tenant-wide coverage."""
    tenant = user.tenant_id
    docs = (
        await session.execute(
            select(KnowledgeDocument)
            .where(KnowledgeDocument.tenant_id == tenant, KnowledgeDocument.is_approved.is_(True))
            .order_by(KnowledgeDocument.slug)
        )
    ).scalars().all()
    by_kind: dict[str, int] = {}
    for d in docs:
        by_kind[str(d.kind)] = by_kind.get(str(d.kind), 0) + 1

    now = datetime.now(UTC)
    requirements = (
        await session.execute(
            select(CapabilityRequirement).where(
                CapabilityRequirement.tenant_id == tenant,
                CapabilityRequirement.effective_from <= now,
                CapabilityRequirement.effective_to.is_(None),
            )
        )
    ).scalars().all()
    setters = {r.set_by for r in requirements}
    names = {
        u.id: u.display_name or u.email for u in (
            await session.execute(select(User).where(User.id.in_(setters)))
        ).scalars()
    } if setters else {}

    learners = list(
        (
            await session.execute(
                select(User).where(
                    User.tenant_id == tenant, User.role == Role.LEARNER,
                    User.is_active.is_(True),
                )
            )
        ).scalars()
    )
    states: dict[str, list[SubjectState]] = {}
    for learner in learners:
        for item in await _states_for(session, learner):
            states.setdefault(item.capability_id, []).append(
                SubjectState(
                    attained_level=CapabilityLevel(item.attained_level),
                    required_level=CapabilityLevel(item.required_level),
                    state_confidence=item.state_confidence,
                    manager_validated=item.validated_points > 0,
                    revalidation_due=_revalidation_due(item),
                )
            )

    def clause(d: KnowledgeDocument) -> MatrixClause:
        return MatrixClause(
            slug=d.slug, kind=str(d.kind), title=d.title, level=d.level, revision=d.revision
        )

    def scope(r: CapabilityRequirement) -> str:
        if r.subject_id:
            return f"individual {r.subject_id}"
        if r.program_ref:
            return f"programme {r.program_ref}"
        if r.role_ref:
            return f"role {r.role_ref}"
        return "everyone"

    capabilities = []
    for c in await _tenant_capabilities(session, tenant):
        summary = aggregate(states.get(c.id, []))
        capabilities.append(MatrixCapability(
            id=c.id, slug=c.slug, name=c.name, description=c.description,
            capability_class=str(c.capability_class),
            base_half_life_days=C.BASE_HALF_LIFE_DAYS[c.capability_class],
            linked_kpi_ids=[k for k in c.linked_kpi_ids.split(",") if k],
            clauses=[clause(d) for d in docs if d.capability_id == c.id],
            requirements=sorted(
                (
                    MatrixRequirement(
                        source=str(r.source), precedence=PRECEDENCE[r.source],
                        required_level=str(r.required_level), scope=scope(r),
                        set_by=names.get(r.set_by, r.set_by), rationale=r.rationale,
                        effective_from=r.effective_from,
                    )
                    for r in requirements if r.capability_id == c.id
                ),
                key=lambda m: m.precedence,
            ),
            coverage=MatrixCoverage(
                subject_count=summary.subject_count,
                validated_coverage=summary.validated_coverage,
                nominal_coverage=summary.nominal_coverage,
                median_level=summary.median_level.value if summary.median_level else None,
                distribution=summary.distribution,
                critical_gap_count=summary.critical_gap_count,
                revalidation_due_count=summary.revalidation_due_count,
            ),
        ))

    from app.scoring.constants import SCORING_MODEL_VERSION

    return GovernanceMatrix(
        approved_clause_count=len(docs),
        clauses_by_kind=by_kind,
        shared_clauses=[clause(d) for d in docs if d.capability_id is None],
        capabilities=capabilities,
        resolution_order=[s.value for s in sorted(PRECEDENCE, key=PRECEDENCE.get)],
        unvalidated_ceiling=C.UNVALIDATED_CONFIDENCE_CEILING,
        coverage_confidence_floor=C.COVERAGE_CONFIDENCE_FLOOR,
        scoring_model_version=SCORING_MODEL_VERSION,
    )
