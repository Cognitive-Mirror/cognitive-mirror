"""Tests for the capability state read endpoints.

Covers the two properties the frontend depends on:
  * the D1 split stays visible in the payload (attained vs current support),
  * aggregates expose coverage and distribution, never an average level.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.database import Base, get_db
from app.models import Capability, CapabilityRequirement, User
from app.schemas.capability import (
    CapabilityClass,
    CapabilityLevel,
    RequiredLevelSource,
)

TENANT = "default"
LEARNER = "u-learner"
OTHER_LEARNER = "u-other"
MANAGER = "u-manager"
STRANGER = "u-stranger"


@pytest_asyncio.fixture
async def client(tmp_path):
    from app.auth import verify_token
    from main import app

    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path/'c.db'}")
    factory = async_sessionmaker(bind=engine, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with factory() as s:
        s.add_all(
            [
                Capability(
                    id="cap-a", tenant_id=TENANT, slug="a", name="Alpha",
                    capability_class=CapabilityClass.ANALYTICAL,
                ),
                Capability(
                    id="cap-b", tenant_id=TENANT, slug="b", name="Beta",
                    capability_class=CapabilityClass.INTERPERSONAL,
                ),
                User(
                    id=MANAGER, tenant_id=TENANT, firebase_uid="m",
                    email="m@x.com", role="manager",
                ),
            ]
        )
        await s.flush()
        s.add_all(
            [
                User(
                    id=LEARNER, tenant_id=TENANT, firebase_uid="l",
                    email="l@x.com", role="learner",
                    role_ref="analyst", manager_id=MANAGER,
                ),
                User(
                    id=OTHER_LEARNER, tenant_id=TENANT, firebase_uid="o",
                    email="o@x.com", role="learner",
                    role_ref="analyst", manager_id=MANAGER,
                ),
                User(
                    id=STRANGER, tenant_id=TENANT, firebase_uid="s",
                    email="s@x.com", role="learner",
                ),
                CapabilityRequirement(
                    id="req-a", tenant_id=TENANT, capability_id="cap-a",
                    required_level=CapabilityLevel.PROFICIENT,
                    source=RequiredLevelSource.TENANT_ROLE,
                    role_ref="analyst", set_by=MANAGER,
                    rationale="Analysts must reach proficient.",
                    effective_from=datetime.now(UTC) - timedelta(days=5),
                ),
            ]
        )
        await s.commit()

    async def override_db():
        async with factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    current = {"uid": LEARNER}
    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[verify_token] = lambda: dict(current)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        yield c, current

    app.dependency_overrides.clear()
    await engine.dispose()


@pytest.mark.asyncio
async def test_lists_the_capability_spine(client):
    c, _ = client
    body = (await c.get("/capabilities")).json()
    assert {row["name"] for row in body} == {"Alpha", "Beta"}


@pytest.mark.asyncio
async def test_returns_capabilities_with_no_evidence_yet(client):
    """Omitting untouched capabilities would hide the gaps we exist to surface."""
    c, _ = client
    body = (await c.get("/capabilities/me")).json()

    assert len(body) == 2
    assert all(row["attained_level"] == "novice" for row in body)
    assert all(row["state_confidence"] == 0.0 for row in body)


@pytest.mark.asyncio
async def test_payload_keeps_the_d1_split_visible(client):
    c, _ = client
    row = (await c.get("/capabilities/me")).json()[0]

    for field in (
        "attained_level",
        "current_support_level",
        "needs_revalidation",
        "confidence_band",
        "state_confidence",
    ):
        assert field in row, f"{field} must stay in the payload"


@pytest.mark.asyncio
async def test_required_level_carries_provenance(client):
    """D6: a bare number is not an acceptable answer."""
    c, _ = client
    body = (await c.get("/capabilities/me")).json()
    alpha = next(r for r in body if r["capability_name"] == "Alpha")

    assert alpha["required_level"] == "proficient"
    assert alpha["required_level_source"] == "tenant_role"
    assert MANAGER in alpha["required_level_provenance"]


@pytest.mark.asyncio
async def test_capability_without_a_requirement_falls_back(client):
    c, _ = client
    body = (await c.get("/capabilities/me")).json()
    beta = next(r for r in body if r["capability_name"] == "Beta")

    assert beta["required_level"] == "competent"
    assert "no Capability Spine entry" in beta["required_level_provenance"]


@pytest.mark.asyncio
async def test_manager_can_view_their_own_report(client):
    c, current = client
    current["uid"] = MANAGER
    response = await c.get(f"/capabilities/learner/{LEARNER}")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_non_manager_cannot_view_someone_elses_state(client):
    """Capability state is developmental data, not browsable."""
    c, current = client
    current["uid"] = STRANGER
    response = await c.get(f"/capabilities/learner/{LEARNER}")
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_learner_can_view_their_own_state(client):
    c, current = client
    current["uid"] = LEARNER
    response = await c.get(f"/capabilities/learner/{LEARNER}")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_team_aggregate_reports_coverage_not_an_average(client):
    """D2: no mean of an ordinal scale, anywhere in the payload."""
    c, current = client
    current["uid"] = MANAGER
    body = (await c.get("/capabilities/team")).json()

    assert len(body) == 2
    for row in body:
        assert row["subject_count"] == 2  # two direct reports
        assert "validated_coverage" in row
        assert "distribution" in row
        assert "average_level" not in row
        assert "mean_level" not in row


@pytest.mark.asyncio
async def test_team_aggregate_is_empty_for_a_manager_with_no_reports(client):
    c, current = client
    current["uid"] = STRANGER
    body = (await c.get("/capabilities/team")).json()
    assert all(row["subject_count"] == 0 for row in body)


@pytest.mark.asyncio
async def test_endpoints_require_authentication():
    """No dependency overrides: every route must reject an anonymous caller."""
    from main import app

    app.dependency_overrides.clear()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        for path in ("/capabilities", "/capabilities/me", "/capabilities/team"):
            assert (await c.get(path)).status_code == 401, path
