"""Presenter tooling: personas, one-click reset, sample texts, AI status.

Every route here returns 404 unless demo mode is on (development only), so in
any other environment this router does not exist as far as a caller can tell.

None of these routes take a token. They act only on the demo tenant, and the
persona list is the demo tenant's own seeded people.
"""

from __future__ import annotations

import asyncio
import logging
import time
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ai.config import resolve_endpoint
from ai.demo_cache import EVIDENCE, FREE_RESPONSES, samples
from app.config import get_settings
from app.database import get_db
from app.demo_seed import (
    ORG_NAME,
    PERSONAS,
    Persona,
    _cap,
    demo_is_seeded,
    demo_tenant,
    reset_demo,
)
from app.models import Capability, CapabilityStateRecord

router = APIRouter(prefix="/api/demo", tags=["demo"])
logger = logging.getLogger(__name__)


def require_demo() -> None:
    if not get_settings().demo_enabled:
        raise HTTPException(status_code=404, detail="Not found.")


class PersonaSummary(BaseModel):
    capability_name: str
    attained_level: str
    current_support_level: str
    state_confidence: float
    confidence_band: str
    knowledge_mastery: float | None
    knowing_doing: str
    provisional_points: float
    validated_points: float


class PersonaOut(BaseModel):
    key: str
    email: str
    display_name: str
    role: str
    title: str
    archetype: str
    headline: str
    summary: PersonaSummary | None


class PersonasResponse(BaseModel):
    enabled: bool
    org_name: str
    tenant_id: str
    seeded: bool
    personas: list[PersonaOut]


class ResetResponse(BaseModel):
    ok: bool
    tenant_id: str
    org_name: str
    elapsed_ms: float
    personas: int
    evidence: int
    pending_validation: int
    audit_events: int


class SamplesResponse(BaseModel):
    evidence: list[dict]
    free_response: list[dict]
    capability_names: dict[str, str]


class ProbeResult(BaseModel):
    ok: bool
    latency_ms: float | None = None
    error: str = ""
    error_kind: str = ""


class AIStatus(BaseModel):
    vendor: str
    model: str
    endpoint_host: str
    key_configured: bool
    demo_cache_entries: int
    live_timeout_seconds: float
    probe: ProbeResult | None = None


async def _summary(session: AsyncSession, persona: Persona) -> PersonaSummary | None:
    if persona.focus_capability is None:
        return None
    cap_id = _cap(persona.focus_capability)
    capability = await session.get(Capability, cap_id)
    record = (
        await session.execute(
            select(CapabilityStateRecord).where(
                CapabilityStateRecord.tenant_id == demo_tenant(),
                CapabilityStateRecord.subject_id == persona.id,
                CapabilityStateRecord.capability_id == cap_id,
            )
        )
    ).scalar_one_or_none()
    if capability is None or record is None:
        return None
    return PersonaSummary(
        capability_name=capability.name,
        attained_level=str(record.attained_level),
        current_support_level=str(record.current_support_level),
        state_confidence=record.state_confidence,
        confidence_band=str(record.confidence_band),
        knowledge_mastery=record.knowledge_mastery,
        knowing_doing=str(record.knowing_doing),
        provisional_points=record.provisional_points,
        validated_points=record.validated_points,
    )


@router.get("/personas", response_model=PersonasResponse, dependencies=[Depends(require_demo)])
async def personas(session: AsyncSession = Depends(get_db)) -> PersonasResponse:
    seeded = await demo_is_seeded(session)
    return PersonasResponse(
        enabled=True,
        org_name=ORG_NAME,
        tenant_id=demo_tenant(),
        seeded=seeded,
        personas=[
            PersonaOut(
                key=p.key, email=p.email, display_name=p.display_name, role=p.role.value,
                title=p.title, archetype=p.archetype, headline=p.headline,
                summary=await _summary(session, p) if seeded else None,
            )
            for p in PERSONAS
        ],
    )


@router.post("/reset", response_model=ResetResponse, dependencies=[Depends(require_demo)])
async def reset(session: AsyncSession = Depends(get_db)) -> ResetResponse:
    """Wipe and re-seed the demo tenant. Committed by the session dependency."""
    report = await reset_demo(session)
    logger.info("Demo tenant reset in %.0f ms", report.elapsed_ms)
    return ResetResponse(ok=True, **report.__dict__)


@router.get("/samples", response_model=SamplesResponse, dependencies=[Depends(require_demo)])
async def demo_samples(session: AsyncSession = Depends(get_db)) -> SamplesResponse:
    """Fill-sample texts. The same strings key the verified demo cache."""
    names = {
        c.slug: c.name
        for c in (
            await session.execute(select(Capability).where(Capability.tenant_id == demo_tenant()))
        ).scalars()
    }
    s = samples()
    return SamplesResponse(
        evidence=s.evidence, free_response=s.free_response, capability_names=names
    )


def _classify(exc: Exception) -> str:
    text = f"{type(exc).__name__} {exc}".lower()
    if any(k in text for k in ("401", "403", "unauthor", "permission", "invalid api key")):
        return "unauthorized"
    if "timeout" in text or "timed out" in text:
        return "timeout"
    if "no llm api key" in text:
        return "missing_key"
    if "404" in text or "model" in text and "not found" in text:
        return "model_not_found"
    return "error"


def _probe_sync(timeout: float) -> ProbeResult:
    from ai.utils.llm_factory import create_llm

    started = time.perf_counter()
    try:
        llm = create_llm(timeout=timeout, max_tokens=8)
        llm.invoke("Reply with the single word OK.")
    except Exception as exc:
        return ProbeResult(
            ok=False, error=str(exc)[:300], error_kind=_classify(exc),
            latency_ms=round((time.perf_counter() - started) * 1000, 1),
        )
    return ProbeResult(ok=True, latency_ms=round((time.perf_counter() - started) * 1000, 1))


@router.get("/ai-status", response_model=AIStatus, dependencies=[Depends(require_demo)])
async def ai_status(probe: bool = Query(default=False)) -> AIStatus:
    """Which provider would serve a live call, and optionally a 1-token probe.

    Run with ?probe=true before a client call: an `unauthorized` result means
    the key is wrong, and every canonical demo input will be served from the
    verified cache instead.
    """
    settings = get_settings()
    endpoint = resolve_endpoint(settings)
    result = None
    if probe:
        result = await asyncio.to_thread(_probe_sync, settings.demo_llm_timeout_seconds)
    return AIStatus(
        vendor=endpoint.vendor,
        model=endpoint.model,
        endpoint_host=(
            urlparse(endpoint.base_url).hostname or ("default" if endpoint.api_key else "")
        ),
        key_configured=bool(endpoint.api_key),
        demo_cache_entries=len(EVIDENCE) + len(FREE_RESPONSES),
        live_timeout_seconds=settings.demo_llm_timeout_seconds,
        probe=result,
    )
