"""Tests for D6 three-layer required_level resolution.

Precedence: spine_default < tenant_role < program_target.
Every resolution must carry provenance.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.database import Base
from app.models import Capability, CapabilityRequirement, User
from app.schemas.capability import (
    CapabilityClass,
    CapabilityLevel,
    RequiredLevelSource,
)
from app.services.requirement_resolver import resolve_required_level

TENANT = "acme"
CAP = "cap-1"
LEARNER = "u-1"
ROLE = "senior-analyst"
PROGRAM = "prog-q4"

PAST = datetime.now(UTC) - timedelta(days=30)


@pytest_asyncio.fixture
async def session(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path/'r.db'}")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(bind=engine, expire_on_commit=False)

    async with factory() as s:
        s.add(
            Capability(
                id=CAP, tenant_id=TENANT, slug="c", name="C",
                capability_class=CapabilityClass.ANALYTICAL,
            )
        )
        s.add(
            User(
                id=LEARNER, tenant_id=TENANT, firebase_uid="uid-1",
                email="l@x.com", role="learner",
                role_ref=ROLE, program_ref=PROGRAM,
            )
        )
        await s.commit()

    async with factory() as s:
        yield s
    await engine.dispose()


def req(rid: str, source, level, *, role=None, program=None, subject=None, offset=0):
    return CapabilityRequirement(
        id=rid,
        tenant_id=TENANT,
        capability_id=CAP,
        role_ref=role,
        program_ref=program,
        subject_id=subject,
        required_level=level,
        source=source,
        set_by="admin-1",
        rationale="because",
        effective_from=PAST + timedelta(days=offset),
    )


async def resolve(session):
    return await resolve_required_level(
        session, tenant_id=TENANT, capability_id=CAP, subject_id=LEARNER
    )


@pytest.mark.asyncio
async def test_falls_back_when_nothing_configured(session):
    result = await resolve(session)
    assert result.is_fallback is True
    assert result.level is CapabilityLevel.COMPETENT
    assert "no Capability Spine entry" in result.provenance


@pytest.mark.asyncio
async def test_spine_default_applies_when_alone(session):
    session.add(
        req("r1", RequiredLevelSource.SPINE_DEFAULT, CapabilityLevel.DEVELOPING)
    )
    await session.flush()

    result = await resolve(session)
    assert result.level is CapabilityLevel.DEVELOPING
    assert result.source is RequiredLevelSource.SPINE_DEFAULT
    assert result.is_fallback is False


@pytest.mark.asyncio
async def test_tenant_role_beats_spine_default(session):
    session.add(req("r1", RequiredLevelSource.SPINE_DEFAULT, CapabilityLevel.DEVELOPING))
    session.add(
        req("r2", RequiredLevelSource.TENANT_ROLE, CapabilityLevel.PROFICIENT, role=ROLE)
    )
    await session.flush()

    result = await resolve(session)
    assert result.level is CapabilityLevel.PROFICIENT
    assert result.source is RequiredLevelSource.TENANT_ROLE


@pytest.mark.asyncio
async def test_program_target_beats_everything(session):
    session.add(req("r1", RequiredLevelSource.SPINE_DEFAULT, CapabilityLevel.DEVELOPING))
    session.add(
        req("r2", RequiredLevelSource.TENANT_ROLE, CapabilityLevel.PROFICIENT, role=ROLE)
    )
    session.add(
        req("r3", RequiredLevelSource.PROGRAM_TARGET, CapabilityLevel.EXPERT, program=PROGRAM)
    )
    await session.flush()

    result = await resolve(session)
    assert result.level is CapabilityLevel.EXPERT
    assert result.source is RequiredLevelSource.PROGRAM_TARGET


@pytest.mark.asyncio
async def test_role_override_for_a_different_role_does_not_apply(session):
    session.add(req("r1", RequiredLevelSource.SPINE_DEFAULT, CapabilityLevel.DEVELOPING))
    session.add(
        req(
            "r2", RequiredLevelSource.TENANT_ROLE, CapabilityLevel.EXPERT,
            role="someone-elses-role",
        )
    )
    await session.flush()

    result = await resolve(session)
    assert result.level is CapabilityLevel.DEVELOPING


@pytest.mark.asyncio
async def test_program_target_for_a_different_programme_does_not_apply(session):
    session.add(req("r1", RequiredLevelSource.SPINE_DEFAULT, CapabilityLevel.DEVELOPING))
    session.add(
        req(
            "r2", RequiredLevelSource.PROGRAM_TARGET, CapabilityLevel.EXPERT,
            program="another-programme",
        )
    )
    await session.flush()

    result = await resolve(session)
    assert result.level is CapabilityLevel.DEVELOPING


@pytest.mark.asyncio
async def test_superseded_requirement_is_ignored(session):
    """Requirements are closed, not edited, so history stays reconstructable."""
    old = req("r1", RequiredLevelSource.TENANT_ROLE, CapabilityLevel.EXPERT, role=ROLE)
    old.effective_to = datetime.now(UTC) - timedelta(days=1)
    session.add(old)
    session.add(req("r2", RequiredLevelSource.SPINE_DEFAULT, CapabilityLevel.DEVELOPING))
    await session.flush()

    result = await resolve(session)
    assert result.level is CapabilityLevel.DEVELOPING


@pytest.mark.asyncio
async def test_future_dated_requirement_is_not_yet_active(session):
    session.add(req("r1", RequiredLevelSource.SPINE_DEFAULT, CapabilityLevel.DEVELOPING))
    future = req(
        "r2", RequiredLevelSource.TENANT_ROLE, CapabilityLevel.EXPERT, role=ROLE
    )
    future.effective_from = datetime.now(UTC) + timedelta(days=10)
    session.add(future)
    await session.flush()

    result = await resolve(session)
    assert result.level is CapabilityLevel.DEVELOPING


@pytest.mark.asyncio
async def test_later_requirement_wins_within_the_same_layer(session):
    session.add(
        req("r1", RequiredLevelSource.TENANT_ROLE, CapabilityLevel.COMPETENT,
            role=ROLE, offset=0)
    )
    session.add(
        req("r2", RequiredLevelSource.TENANT_ROLE, CapabilityLevel.PROFICIENT,
            role=ROLE, offset=5)
    )
    await session.flush()

    result = await resolve(session)
    assert result.level is CapabilityLevel.PROFICIENT


@pytest.mark.asyncio
async def test_individual_override_applies_to_that_subject_only(session):
    session.add(req("r1", RequiredLevelSource.SPINE_DEFAULT, CapabilityLevel.DEVELOPING))
    session.add(
        req(
            "r2", RequiredLevelSource.PROGRAM_TARGET, CapabilityLevel.EXPERT,
            subject=LEARNER,
        )
    )
    await session.flush()

    mine = await resolve(session)
    assert mine.level is CapabilityLevel.EXPERT

    theirs = await resolve_required_level(
        session, tenant_id=TENANT, capability_id=CAP, subject_id="someone-else"
    )
    assert theirs.level is CapabilityLevel.DEVELOPING


@pytest.mark.asyncio
async def test_resolution_always_carries_provenance(session):
    """A bare number is not an acceptable answer (D6)."""
    session.add(
        req("r1", RequiredLevelSource.TENANT_ROLE, CapabilityLevel.PROFICIENT, role=ROLE)
    )
    await session.flush()

    result = await resolve(session)
    assert result.set_by
    assert result.rationale
    assert result.requirement_id
    assert "admin-1" in result.provenance


@pytest.mark.asyncio
async def test_tenant_isolation(session):
    """A requirement from another tenant must never leak in."""
    other = req("r1", RequiredLevelSource.PROGRAM_TARGET, CapabilityLevel.EXPERT,
                program=PROGRAM)
    other.tenant_id = "other-tenant"
    session.add(other)
    session.add(req("r2", RequiredLevelSource.SPINE_DEFAULT, CapabilityLevel.DEVELOPING))
    await session.flush()

    result = await resolve(session)
    assert result.level is CapabilityLevel.DEVELOPING
