"""Resolve required_level through the three D6 layers.

    spine_default  <  tenant_role  <  program_target
    (Impact owns)     (client owns)   (program owner owns)

Every resolution returns provenance alongside the level. A bare number is not
an acceptable answer: when a CFO asks who decided a person needs to be
proficient, the system must be able to say.

AI never writes here. It may propose a Spine mapping; a human ratifies it.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CapabilityRequirement, User
from app.schemas.capability import CapabilityLevel, RequiredLevelSource

# Higher wins. Mirrors the D6 table.
PRECEDENCE: dict[RequiredLevelSource, int] = {
    RequiredLevelSource.SPINE_DEFAULT: 1,
    RequiredLevelSource.TENANT_ROLE: 2,
    RequiredLevelSource.PROGRAM_TARGET: 3,
}

# Used only when a tenant has no Spine entry at all for a capability. Kept
# deliberately modest so an unconfigured tenant understates rather than
# overstates what it demands of people.
FALLBACK_LEVEL = CapabilityLevel.COMPETENT


@dataclass(frozen=True)
class ResolvedRequirement:
    """A required level with the provenance that justifies it."""

    level: CapabilityLevel
    source: RequiredLevelSource
    set_by: str
    rationale: str
    requirement_id: str | None
    is_fallback: bool = False

    @property
    def provenance(self) -> str:
        """One-line explanation suitable for showing to a manager or auditor."""
        if self.is_fallback:
            return (
                "System default: no Capability Spine entry exists for this "
                "capability in this tenant."
            )
        return f"Set via {self.source.value.replace('_', ' ')} by {self.set_by}."


async def resolve_required_level(
    session: AsyncSession,
    *,
    tenant_id: str,
    capability_id: str,
    subject_id: str,
    role_ref: str | None = None,
    program_ref: str | None = None,
    now: datetime | None = None,
) -> ResolvedRequirement:
    """Resolve the required level for one subject and capability.

    Considers only requirements that are active at `now`: effective_from has
    passed and effective_to is unset. Requirements are superseded by writing a
    new row and closing the old one, never edited in place, so history stays
    reconstructable.

    Ties within a layer are broken by the most recent `effective_from`.
    """
    now = now or datetime.now(UTC)

    if role_ref is None or program_ref is None:
        user = await session.get(User, subject_id)
        if user is not None and user.tenant_id == tenant_id:
            role_ref = role_ref or user.role_ref
            program_ref = program_ref or user.program_ref

    candidates = (
        await session.execute(
            select(CapabilityRequirement).where(
                CapabilityRequirement.tenant_id == tenant_id,
                CapabilityRequirement.capability_id == capability_id,
                CapabilityRequirement.effective_from <= now,
                CapabilityRequirement.effective_to.is_(None),
                or_(
                    # Spine default: either global, or scoped to this role.
                    CapabilityRequirement.source == RequiredLevelSource.SPINE_DEFAULT,
                    # Tenant role override.
                    CapabilityRequirement.role_ref == role_ref,
                    # Program target, or an individual override.
                    CapabilityRequirement.program_ref == program_ref,
                    CapabilityRequirement.subject_id == subject_id,
                ),
            )
        )
    ).scalars().all()

    applicable = [
        row for row in candidates if _applies_to(row, role_ref, program_ref, subject_id)
    ]

    if not applicable:
        return ResolvedRequirement(
            level=FALLBACK_LEVEL,
            source=RequiredLevelSource.SPINE_DEFAULT,
            set_by="system",
            rationale="No requirement configured for this capability.",
            requirement_id=None,
            is_fallback=True,
        )

    winner = max(
        applicable,
        key=lambda row: (PRECEDENCE[row.source], row.effective_from),
    )
    return ResolvedRequirement(
        level=winner.required_level,
        source=winner.source,
        set_by=winner.set_by,
        rationale=winner.rationale,
        requirement_id=winner.id,
    )


def _applies_to(
    row: CapabilityRequirement,
    role_ref: str | None,
    program_ref: str | None,
    subject_id: str,
) -> bool:
    """Whether a requirement row is in scope for this subject."""
    if row.subject_id is not None:
        return row.subject_id == subject_id
    if row.source is RequiredLevelSource.PROGRAM_TARGET:
        return row.program_ref is not None and row.program_ref == program_ref
    if row.source is RequiredLevelSource.TENANT_ROLE:
        return row.role_ref is not None and row.role_ref == role_ref
    # Spine default applies globally, or to a named role archetype.
    return row.role_ref is None or row.role_ref == role_ref
