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

from app.models import Capability, CapabilityRequirement, Role
from app.schemas.capability import (
    CapabilityClass,
    CapabilityLevel,
    RequiredLevelSource,
)
from tests.conftest import TENANT, make_user

LEARNER = "u-learner"
OTHER_LEARNER = "u-other"
MANAGER = "u-manager"
STRANGER = "u-stranger"
LONE_MANAGER = "u-lone-manager"


@pytest_asyncio.fixture
async def client(api, db):
    """Two learners reporting to one manager, an unrelated learner, two capabilities."""
    async with db() as s:
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
                make_user(MANAGER, Role.MANAGER),
                make_user(LONE_MANAGER, Role.MANAGER),
            ]
        )
        await s.flush()
        s.add_all(
            [
                make_user(LEARNER, manager=MANAGER, role_ref="analyst"),
                make_user(OTHER_LEARNER, manager=MANAGER, role_ref="analyst"),
                make_user(STRANGER),
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
    api.uid = LEARNER
    return api


@pytest.mark.asyncio
async def test_lists_the_capability_spine(client):
    c = client
    body = (await c.get("/capabilities")).json()
    assert {row["name"] for row in body} == {"Alpha", "Beta"}


@pytest.mark.asyncio
async def test_returns_capabilities_with_no_evidence_yet(client):
    """Omitting untouched capabilities would hide the gaps we exist to surface."""
    c = client
    body = (await c.get("/capabilities/me")).json()

    assert len(body) == 2
    assert all(row["attained_level"] == "novice" for row in body)
    assert all(row["state_confidence"] == 0.0 for row in body)


@pytest.mark.asyncio
async def test_payload_keeps_the_d1_split_visible(client):
    c = client
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
    c = client
    body = (await c.get("/capabilities/me")).json()
    alpha = next(r for r in body if r["capability_name"] == "Alpha")

    assert alpha["required_level"] == "proficient"
    assert alpha["required_level_source"] == "tenant_role"
    assert MANAGER in alpha["required_level_provenance"]


@pytest.mark.asyncio
async def test_capability_without_a_requirement_falls_back(client):
    c = client
    body = (await c.get("/capabilities/me")).json()
    beta = next(r for r in body if r["capability_name"] == "Beta")

    assert beta["required_level"] == "competent"
    assert "no Capability Spine entry" in beta["required_level_provenance"]


@pytest.mark.asyncio
async def test_manager_can_view_their_own_report(client):
    c = client
    c.uid = MANAGER
    response = await c.get(f"/capabilities/learner/{LEARNER}")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_non_manager_cannot_view_someone_elses_state(client):
    """Capability state is developmental data, not browsable."""
    c = client
    c.uid = STRANGER
    response = await c.get(f"/capabilities/learner/{LEARNER}")
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_learner_can_view_their_own_state(client):
    c = client
    c.uid = LEARNER
    response = await c.get(f"/capabilities/learner/{LEARNER}")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_team_aggregate_reports_coverage_not_an_average(client):
    """D2: no mean of an ordinal scale, anywhere in the payload."""
    c = client
    c.uid = MANAGER
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
    c = client
    c.uid = LONE_MANAGER
    body = (await c.get("/capabilities/team")).json()
    assert all(row["subject_count"] == 0 for row in body)


@pytest.mark.asyncio
async def test_learners_cannot_read_team_aggregates(client):
    c = client
    c.uid = LEARNER
    assert (await c.get("/capabilities/team")).status_code == 403


@pytest.mark.asyncio
async def test_first_sign_in_provisions_a_learner(client):
    """An unknown Firebase account becomes a learner, never a manager."""
    c = client
    c.uid = "brand-new-firebase-uid"
    me = (await c.get("/auth/me")).json()
    assert me["role"] == "learner"
    assert me["id"] != "brand-new-firebase-uid"  # users.id is our own key
    assert (await c.get("/capabilities/team")).status_code == 403


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
