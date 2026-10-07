"""Cognitive Mirror API entry point.

Sign-in happens in Firebase on the client. This service verifies the resulting
ID token and maps it to a `users` row (app/auth.py); it never sees a password.
"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.auth import current_user
from app.config import get_settings
from app.database import dispose_engine
from app.models import User
from app.routers import capabilities, evidence, knowledge, learning

settings = get_settings()
logging.basicConfig(level=settings.log_level)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    yield
    await dispose_engine()


app = FastAPI(
    title="Cognitive Mirror",
    description="Capability intelligence platform",
    version="0.1.0",
    lifespan=lifespan,
)

for module in (evidence, capabilities, knowledge, learning):
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
    return {
        "status": "ok",
        "service": "cognitive-mirror",
        "environment": settings.environment,
        "llm_configured": bool(settings.llm_api_key),
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
