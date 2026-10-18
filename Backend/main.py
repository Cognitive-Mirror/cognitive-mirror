"""Cognitive Mirror API entry point.

Sign-in happens in Firebase on the client. This service verifies the resulting
ID token and maps it to a `users` row (app/auth.py); it never sees a password.
"""

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from ai.config import resolve_endpoint
from app.auth import current_user
from app.config import get_settings
from app.database import dispose_engine, get_session_factory
from app.models import User
from app.routers import capabilities, demo, evidence, knowledge, learning

settings = get_settings()
logging.basicConfig(level=settings.log_level)
logger = logging.getLogger("cognitive-mirror")


async def _prepare_demo() -> None:
    """Seed the demo tenant on first boot and warm its retrieval index.

    After this, the presenter's first reset is as fast as every later one.
    Never fatal: a missing schema is reported, and the server still starts.
    """
    from app.demo_seed import demo_is_seeded, demo_tenant, reset_demo
    try:
        async with get_session_factory()() as session:
            if not await demo_is_seeded(session):
                report = await reset_demo(session)
                await session.commit()
                logger.info("Demo tenant seeded in %.0f ms.", report.elapsed_ms)
    except Exception as exc:
        logger.warning(
            "Demo tenant not prepared (%s). Run `python -m alembic upgrade head` "
            "in Backend/, then POST /api/demo/reset.", exc,
        )


async def _warm_demo_index() -> None:
    """Build the demo retrieval index when explicitly requested.

    Index construction is intentionally lazy in local development: it is not
    needed for login or the first-page render, and warming it here needlessly
    delays the frontend while the backend is already otherwise healthy.
    """
    from app.demo_seed import demo_tenant
    from rag.knowledge_index import get_index

    try:
        async with get_session_factory()() as session:
            await get_index(session, demo_tenant())
    except Exception as exc:
        logger.warning("Demo retrieval index warmup failed: %s", exc)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    warm_task: asyncio.Task[None] | None = None
    if settings.demo_enabled:
        await _prepare_demo()
        if settings.demo_warm_index:
            warm_task = asyncio.create_task(_warm_demo_index())
    yield
    if warm_task is not None:
        warm_task.cancel()
        await asyncio.gather(warm_task, return_exceptions=True)
    await dispose_engine()


app = FastAPI(
    title="Cognitive Mirror",
    description="Capability intelligence platform",
    version="0.1.0",
    lifespan=lifespan,
)

for module in (evidence, capabilities, knowledge, learning, demo):
    app.include_router(module.router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Me(BaseModel):
    id: str
    email: str
    display_name: str
    role: str
    tenant_id: str


@app.get("/health")
def health() -> dict:
    """Liveness probe. Reports configuration state without leaking secrets."""
    endpoint = resolve_endpoint(settings)
    return {
        "status": "ok",
        "service": "cognitive-mirror",
        "environment": settings.environment,
        "llm_configured": bool(endpoint.api_key),
        "llm_vendor": endpoint.vendor,
        "demo_mode": settings.demo_enabled,
    }


@app.get("/auth/me", response_model=Me)
async def get_me(user: User = Depends(current_user)) -> Me:
    """The signed-in user. The frontend routes by `role` from here."""
    return Me(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        role=str(user.role),
        tenant_id=user.tenant_id,
    )
