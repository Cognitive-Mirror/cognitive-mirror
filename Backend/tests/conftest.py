"""Shared test fixtures.

Tests are hermetic. Backend/.env carries real provider keys for local
development; environment variables take precedence over the .env file, so
blanking them here puts every test on the deterministic no-provider path.
Tests that exercise model output inject a fake at the call site instead.
"""

from __future__ import annotations

import os

for _key in (
    "LLM_API_KEY", "JINA_API_KEY", "COHERE_API_KEY", "OPENAI_API_KEY", "VOYAGE_API_KEY",
    "NVIDIA_API_KEY", "GROQ_API_KEY", "GEMINI_API_KEY",
):
    os.environ[_key] = ""
os.environ["DEMO_INFERENCE_DELAY_SECONDS"] = "0"

import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402

from app.config import get_settings  # noqa: E402

get_settings.cache_clear()

from app.database import Base, get_db  # noqa: E402
from app.models import Role, User  # noqa: E402

TENANT = "default"


def make_user(
    user_id: str,
    role: Role = Role.LEARNER,
    *,
    manager: str | None = None,
    tenant: str = TENANT,
    **fields,
) -> User:
    """A user whose id doubles as their Firebase uid, to keep tests readable."""
    return User(
        id=user_id,
        tenant_id=tenant,
        firebase_uid=user_id,
        email=f"{user_id}@example.test",
        display_name=user_id,
        role=role,
        manager_id=manager,
        **fields,
    )


@pytest_asyncio.fixture
async def db(tmp_path):
    """A session factory over a throwaway SQLite database."""
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'test.db'}")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield async_sessionmaker(bind=engine, expire_on_commit=False)
    await engine.dispose()


@pytest_asyncio.fixture
async def api(db):
    """HTTP client against the app. Set `api.uid` to act as a user."""
    from app.auth import verify_token
    from app.routers.learning import background_session_factory
    from main import app

    async def override_db():
        async with db() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        client.uid = None
        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[verify_token] = lambda: {
            "uid": client.uid,
            "email": f"{client.uid}@example.test",
        }
        app.dependency_overrides[background_session_factory] = lambda: db
        yield client
    app.dependency_overrides.clear()
