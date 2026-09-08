"""Cognitive Mirror API entry point.

Authentication is handled by Firebase on the client; this service verifies the
resulting ID token (see app/auth.py). There is deliberately no password
endpoint here — credentials never reach this service.
"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth import verify_token
from app.config import get_settings
from app.database import dispose_engine
from app.routers import evidence as evidence_router

settings = get_settings()
logging.basicConfig(level=settings.log_level)

@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    yield
    await dispose_engine()


app = FastAPI(
    title="Cognitive Mirror",
    description="AI-powered Capability Intelligence Platform",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(evidence_router.router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def home() -> dict:
    return {"message": "Hello Cognitive Mirror"}


@app.get("/health")
def health() -> dict:
    """Liveness probe. Reports configuration state without leaking secrets."""
    return {
        "status": "ok",
        "environment": settings.environment,
        "llm_provider": settings.llm_provider,
        "llm_configured": bool(settings.llm_api_key),
    }


@app.get("/auth/me")
def get_me(decoded_token: dict = Depends(verify_token)) -> dict:
    """Return the authenticated user's identity from their verified ID token."""
    return {
        "uid": decoded_token.get("uid") or decoded_token.get("sub"),
        "email": decoded_token.get("email"),
        "name": decoded_token.get("name"),
        "picture": decoded_token.get("picture"),
    }
