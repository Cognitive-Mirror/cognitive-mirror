"""Seed a demo tenant with a Capability Spine, users and requirements.

Run from Backend/:

    python -m scripts.seed_demo

Idempotent: re-running updates the existing rows rather than duplicating them.

This is a *demo* Spine, not a real one. A production Spine is built with the
client from their goals and KPIs (thesis 10). The point here is to give the
frontend real data to render and to exercise the D6 three-layer resolution.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.database import Base, get_engine, get_session_factory
from app.models import Capability, CapabilityRequirement, User
from app.schemas.capability import (
    CapabilityClass,
    CapabilityLevel,
    RequiredLevelSource,
)

TENANT = "default"
ROLE_REF = "senior-analyst"
PROGRAM_REF = "q4-leadership-2026"

# The three capabilities the existing UI already speaks about, now with the
# decay archetype that drives their half-life (D1).
SPINE: list[dict] = [
    {
        "id": "cap-strategic-decision",
        "slug": "strategic-decision-making",
        "name": "Strategic decision making",
        "description": (
            "Frames a decision, surfaces the trade-off, and commits with the "
            "uncertainty stated."
        ),
        "capability_class": CapabilityClass.ANALYTICAL,
        "linked_kpi_ids": "kpi-delivery-predictability,kpi-margin",
        "spine_default": CapabilityLevel.COMPETENT,
    },
    {
        "id": "cap-stakeholder-influence",
        "slug": "stakeholder-influence",
        "name": "Stakeholder influence",
        "description": (
            "Moves a decision through people who do not report to them, "
            "without escalation."
        ),
        "capability_class": CapabilityClass.INTERPERSONAL,
        "linked_kpi_ids": "kpi-cycle-time,kpi-customer-retention",
        "spine_default": CapabilityLevel.COMPETENT,
    },
    {
        "id": "cap-data-storytelling",
        "slug": "data-storytelling",
        "name": "Data storytelling",
        "description": (
            "Turns an analysis into a decision a non-analyst can act on, "
            "without hiding the uncertainty."
        ),
        "capability_class": CapabilityClass.PROCEDURAL,
        "linked_kpi_ids": "kpi-forecast-accuracy",
        "spine_default": CapabilityLevel.DEVELOPING,
    },
]

USERS: list[dict] = [
    {
        "id": "user-learner-demo",
        "firebase_uid": "demo-learner-uid",
        "email": "learner@cognitivemirror.ai",
        "display_name": "Priya Shah",
        "role": "learner",
        "role_ref": ROLE_REF,
        "program_ref": PROGRAM_REF,
        "manager_id": "user-manager-demo",
    },
    {
        "id": "user-manager-demo",
        "firebase_uid": "demo-manager-uid",
        "email": "manager@cognitivemirror.ai",
        "display_name": "Jordan Lee",
        "role": "manager",
        "role_ref": "team-lead",
        "program_ref": None,
        "manager_id": None,
    },
    {
        "id": "user-admin-demo",
        "firebase_uid": "demo-admin-uid",
        "email": "admin@cognitivemirror.ai",
        "display_name": "Sam Rivera",
        "role": "admin",
        "role_ref": "platform-admin",
        "program_ref": None,
        "manager_id": None,
    },
]


async def upsert_capabilities(session) -> None:
    for entry in SPINE:
        existing = (
            await session.execute(
                select(Capability).where(Capability.id == entry["id"])
            )
        ).scalar_one_or_none()

        if existing is None:
            session.add(
                Capability(
                    id=entry["id"],
                    tenant_id=TENANT,
                    slug=entry["slug"],
                    name=entry["name"],
                    description=entry["description"],
                    capability_class=entry["capability_class"],
                    linked_kpi_ids=entry["linked_kpi_ids"],
                )
            )
        else:
            existing.name = entry["name"]
            existing.description = entry["description"]
            existing.capability_class = entry["capability_class"]
            existing.linked_kpi_ids = entry["linked_kpi_ids"]


async def upsert_users(session) -> None:
    # Managers first so the self-referential FK resolves.
    for entry in sorted(USERS, key=lambda u: u["manager_id"] is not None):
        existing = (
            await session.execute(select(User).where(User.id == entry["id"]))
        ).scalar_one_or_none()
        if existing is None:
            session.add(User(tenant_id=TENANT, **entry))
        else:
            for key, value in entry.items():
                setattr(existing, key, value)


async def upsert_requirements(session) -> None:
    """Seed all three D6 layers so the precedence is demonstrable."""
    started = datetime.now(UTC) - timedelta(days=90)

    rows: list[dict] = []

    # Layer 1 - Spine default. Impact-owned, applies to everyone.
    for entry in SPINE:
        rows.append(
            {
                "id": f"req-spine-{entry['slug']}",
                "capability_id": entry["id"],
                "role_ref": None,
                "program_ref": None,
                "subject_id": None,
                "required_level": entry["spine_default"],
                "source": RequiredLevelSource.SPINE_DEFAULT,
                "set_by": "impact-spine",
                "rationale": "Impact Capability Spine baseline for this capability.",
                "effective_from": started,
            }
        )

    # Layer 2 - tenant role override. The client decided senior analysts need
    # more stakeholder influence than the Spine baseline.
    rows.append(
        {
            "id": "req-role-stakeholder",
            "capability_id": "cap-stakeholder-influence",
            "role_ref": ROLE_REF,
            "program_ref": None,
            "subject_id": None,
            "required_level": CapabilityLevel.PROFICIENT,
            "source": RequiredLevelSource.TENANT_ROLE,
            "set_by": "user-admin-demo",
            "rationale": (
                "Senior analysts drive cross-functional decisions without "
                "formal authority; the Spine baseline understates this role."
            ),
            "effective_from": started + timedelta(days=10),
        }
    )

    # Layer 3 - program target. Highest precedence; overrides both above.
    rows.append(
        {
            "id": "req-program-decision",
            "capability_id": "cap-strategic-decision",
            "role_ref": None,
            "program_ref": PROGRAM_REF,
            "subject_id": None,
            "required_level": CapabilityLevel.PROFICIENT,
            "source": RequiredLevelSource.PROGRAM_TARGET,
            "set_by": "user-admin-demo",
            "rationale": (
                "Q4 leadership programme targets proficient decision making as "
                "its exit bar."
            ),
            "effective_from": started + timedelta(days=20),
        }
    )

    for row in rows:
        existing = (
            await session.execute(
                select(CapabilityRequirement).where(
                    CapabilityRequirement.id == row["id"]
                )
            )
        ).scalar_one_or_none()
        if existing is None:
            session.add(CapabilityRequirement(tenant_id=TENANT, **row))
        else:
            for key, value in row.items():
                setattr(existing, key, value)


async def main() -> None:
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = get_session_factory()
    async with factory() as session:
        await upsert_capabilities(session)
        await upsert_users(session)
        await session.flush()
        await upsert_requirements(session)
        await session.commit()

    print(f"Seeded tenant '{TENANT}':")
    print(f"  {len(SPINE)} capabilities")
    print(f"  {len(USERS)} users")
    print("  5 requirements across all three D6 layers")
    print()
    print("Resolution the seed demonstrates:")
    print("  strategic-decision-making -> proficient  (program_target beats spine)")
    print("  stakeholder-influence     -> proficient  (tenant_role beats spine)")
    print("  data-storytelling         -> developing  (spine_default, unopposed)")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
