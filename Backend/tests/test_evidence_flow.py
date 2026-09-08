"""End-to-end test of the Phase 2 loop.

    submit evidence -> AI review -> manager validation -> capability state

Runs against a real (temporary SQLite) database and the real graph. No LLM is
configured, so the graph takes its deterministic fallback path - which is the
point: the workflow must be exercisable before a provider key exists.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.database import Base, get_db
from app.models import Capability, CapabilityStateEvent, Evidence
from app.schemas.capability import CapabilityClass, CapabilityLevel

LEARNER = "learner-001"
MANAGER = "manager-001"
TENANT = "default"

GOOD_EVIDENCE = (
    "I rebuilt the Q3 variance analysis into a one-page decision brief for the "
    "leadership review. I identified the three drivers behind the revenue miss, "
    "laid out two forecast options with their assumptions stated explicitly, and "
    "recommended the more conservative revision. I presented it to the CFO and "
    "the regional leads, answered challenges on the assumptions, and the revised "
    "forecast was adopted for the quarter."
)


@pytest_asyncio.fixture
async def app_client(tmp_path):
    """App wired to a throwaway SQLite database."""
    from app.auth import verify_token
    from main import app

    db_path = tmp_path / "test.db"
    engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}")
    factory = async_sessionmaker(bind=engine, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with factory() as session:
        session.add(
            Capability(
                id="cap-ds",
                tenant_id=TENANT,
                slug="data-storytelling",
                name="Data storytelling",
                capability_class=CapabilityClass.ANALYTICAL,
            )
        )
        await session.commit()

    async def override_db():
        async with factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    current = {"uid": LEARNER}

    def override_token():
        return dict(current)

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[verify_token] = override_token

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client, factory, current

    app.dependency_overrides.clear()
    await engine.dispose()


async def _submit(client, *, context_ref: str, days_ago: int = 0, content=GOOD_EVIDENCE):
    return await client.post(
        "/evidence",
        json={
            "capability_id": "cap-ds",
            "evidence_type": "workplace_application",
            "title": "Forecast decision brief",
            "content": content,
            "context": "Quarterly business review, finance team",
            "context_ref": context_ref,
            "occurred_at": (datetime.now(UTC) - timedelta(days=days_ago)).isoformat(),
        },
    )


@pytest.mark.asyncio
async def test_submission_creates_evidence_and_ai_review(app_client):
    client, _, _ = app_client
    response = await _submit(client, context_ref="proj-alpha")

    assert response.status_code == 201
    body = response.json()
    assert body["validation_status"] == "pending"
    assert body["review"]["requires_human_review"] is True
    # No provider configured, so the review must be the deterministic fallback.
    assert body["review"]["model_name"].startswith("fallback")


@pytest.mark.asyncio
async def test_pending_evidence_contributes_no_validated_points(app_client):
    """The trust anchor: a submission alone changes nothing (thesis 17)."""
    client, _, _ = app_client
    body = (await _submit(client, context_ref="proj-alpha")).json()

    state = body["capability_state"]
    assert state["validated_points"] == 0.0
    assert state["attained_level"] == "novice"
    assert state["state_confidence"] == 0.0
    assert "Awaiting manager validation" in state["recommended_next_action"]


@pytest.mark.asyncio
async def test_learner_cannot_validate_their_own_evidence(app_client):
    """Self-validation would make the platform self-reported."""
    client, _, _ = app_client
    evidence_id = (await _submit(client, context_ref="proj-alpha")).json()["evidence_id"]

    response = await client.post(
        f"/evidence/{evidence_id}/validate",
        json={"decision": "approved", "strength": "strong"},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_manager_validation_moves_capability_state(app_client):
    client, _, current = app_client
    evidence_id = (await _submit(client, context_ref="proj-alpha")).json()["evidence_id"]

    current["uid"] = MANAGER
    response = await client.post(
        f"/evidence/{evidence_id}/validate",
        json={
            "decision": "approved",
            "strength": "strong",
            "observed_in_work": True,
            "applied_independently": True,
            "feedback": "Clear framing, assumptions stated.",
        },
    )

    assert response.status_code == 200
    state = response.json()
    assert state["validated_points"] > 0
    assert state["attained_level"] == "developing"
    assert state["provisional_points"] == 0.0


@pytest.mark.asyncio
async def test_three_independent_contexts_reach_competent(app_client):
    """D4: progression needs transfer across independent contexts."""
    client, _, current = app_client

    ids = []
    for i, (ctx, days) in enumerate(
        [("proj-alpha", 0), ("proj-beta", 40), ("proj-gamma", 80)]
    ):
        current["uid"] = LEARNER
        ids.append((await _submit(client, context_ref=ctx, days_ago=days)).json()["evidence_id"])
        current["uid"] = MANAGER
        await client.post(
            f"/evidence/{ids[i]}/validate",
            json={"decision": "approved", "strength": "strong"},
        )

    # Read final state off the last validation response.
    current["uid"] = LEARNER
    final = (await _submit(client, context_ref="proj-delta", days_ago=100)).json()
    state = final["capability_state"]
    assert state["independent_contexts"] >= 3
    assert state["attained_level"] in {"competent", "proficient"}


@pytest.mark.asyncio
async def test_same_context_repeats_do_not_stack_contexts(app_client):
    """Three submissions from one project are one demonstration (D4)."""
    client, _, current = app_client

    for _ in range(3):
        current["uid"] = LEARNER
        eid = (await _submit(client, context_ref="proj-alpha")).json()["evidence_id"]
        current["uid"] = MANAGER
        await client.post(
            f"/evidence/{eid}/validate",
            json={"decision": "approved", "strength": "strong"},
        )

    current["uid"] = LEARNER
    state = (await _submit(client, context_ref="proj-alpha")).json()["capability_state"]
    assert state["independent_contexts"] == 1


@pytest.mark.asyncio
async def test_rejected_evidence_contributes_nothing(app_client):
    client, _, current = app_client
    eid = (await _submit(client, context_ref="proj-alpha")).json()["evidence_id"]

    current["uid"] = MANAGER
    state = (
        await client.post(
            f"/evidence/{eid}/validate",
            json={"decision": "rejected", "strength": "weak", "feedback": "Not specific."},
        )
    ).json()

    assert state["validated_points"] == 0.0
    assert state["attained_level"] == "novice"


@pytest.mark.asyncio
async def test_every_state_change_writes_an_audit_event(app_client):
    """Update Rule 6: state history is append-only and never anonymous."""
    client, factory, current = app_client
    eid = (await _submit(client, context_ref="proj-alpha")).json()["evidence_id"]
    current["uid"] = MANAGER
    await client.post(
        f"/evidence/{eid}/validate",
        json={"decision": "approved", "strength": "strong"},
    )

    async with factory() as session:
        from sqlalchemy import select

        events = (await session.execute(select(CapabilityStateEvent))).scalars().all()

    assert len(events) >= 2  # submission + validation
    assert all(e.reason for e in events), "Update Rule 5: no anonymous mutations"
    assert all(e.scoring_model_version for e in events)
    assert any(e.triggered_by == "manager_validation" for e in events)


@pytest.mark.asyncio
async def test_manager_override_is_recorded_for_calibration(app_client):
    """Section 11: override rate is the primary calibration signal."""
    client, factory, current = app_client
    eid = (await _submit(client, context_ref="proj-alpha")).json()["evidence_id"]

    current["uid"] = MANAGER
    await client.post(
        f"/evidence/{eid}/validate",
        json={"decision": "approved", "strength": "exceptional"},
    )

    async with factory() as session:
        from sqlalchemy import select

        from app.models import ManagerValidation

        validation = (
            await session.execute(select(ManagerValidation))
        ).scalar_one()

    # Fallback review rates weak; manager said exceptional.
    assert validation.overrode_ai is True


@pytest.mark.asyncio
async def test_short_submission_is_triaged_without_a_model_call(app_client):
    client, _, _ = app_client
    response = await _submit(client, context_ref="proj-alpha", content="Did the thing.")

    body = response.json()
    assert body["review"]["strength"] == "weak"
    assert body["review"]["requires_human_review"] is True
    assert any("too short" in c.lower() or "lacks the detail" in c.lower()
               for c in body["review"]["concerns"])


@pytest.mark.asyncio
async def test_tenant_comes_from_the_token_not_the_payload(app_client):
    """A caller must not be able to write into another tenant."""
    client, factory, _ = app_client
    await client.post(
        "/evidence",
        json={
            "capability_id": "cap-ds",
            "evidence_type": "workplace_application",
            "title": "Attempted tenant escape",
            "content": GOOD_EVIDENCE,
            "context": "x",
            "context_ref": "proj-x",
            "tenant_id": "other-tenant",  # ignored by the API
        },
    )

    async with factory() as session:
        from sqlalchemy import select

        rows = (await session.execute(select(Evidence))).scalars().all()

    assert all(r.tenant_id == TENANT for r in rows)
