"""AI-specific configuration.

Extends app-level settings with AI-tuning parameters and resolves which
provider actually serves a call.

Provider resolution
-------------------
An explicit LLM_API_KEY always wins and is used with LLM_PROVIDER, LLM_BASE_URL
and LLM_MODEL_NAME exactly as configured. When it is empty, the first vendor key
present is used with that vendor's OpenAI-compatible endpoint:

    NVIDIA_API_KEY -> GROQ_API_KEY -> GEMINI_API_KEY -> OPENAI_API_KEY

An explicitly set LLM_MODEL_NAME / LLM_MODEL_NAME_FAST still overrides the
preset model, so a team can pin a model without hard-coding a key name.
"""

from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urlparse

from app.config import Settings, get_settings


@dataclass(frozen=True)
class AIConfig:
    """Immutable AI configuration for a single invocation context."""

    provider: str
    model_name: str
    temperature: float
    max_tokens: int
    api_key: str
    base_url: str = ""
    timeout: float = 120.0
    reasoning: bool = True
    max_retries: int = 1
    vendor: str = ""
    """Who serves the call (nvidia, groq, gemini, openai, anthropic, custom)."""


@dataclass(frozen=True)
class _Preset:
    base_url: str
    model: str
    model_fast: str


# OpenAI-compatible endpoints. Model names are defaults only; set
# LLM_MODEL_NAME to pin a different one.
PRESETS: dict[str, _Preset] = {
    "nvidia": _Preset("https://integrate.api.nvidia.com/v1", "", ""),
    "groq": _Preset(
        "https://api.groq.com/openai/v1", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"
    ),
    "gemini": _Preset(
        "https://generativelanguage.googleapis.com/v1beta/openai/",
        "gemini-2.5-flash",
        "gemini-2.5-flash",
    ),
    "openai": _Preset("", "gpt-4.1-mini", "gpt-4.1-mini"),
}

# Hosts that implement the OpenAI protocol strictly and reject unknown request
# fields such as `chat_template_kwargs`.
_STRICT_HOSTS = {"api.openai.com", "api.groq.com", "generativelanguage.googleapis.com"}


@dataclass(frozen=True)
class Endpoint:
    builder: str      # key into llm_factory._PROVIDER_BUILDERS
    vendor: str
    api_key: str
    base_url: str
    model: str
    model_fast: str


def resolve_endpoint(settings: Settings | None = None) -> Endpoint:
    """Decide which provider, key, URL and model serve LLM calls."""
    s = settings or get_settings()
    explicit = s.model_fields_set

    def pick(preset: _Preset) -> tuple[str, str]:
        pinned = "llm_model_name" in explicit or not preset.model
        model = s.llm_model_name if pinned else preset.model
        fast = (
            s.llm_model_name_fast
            if "llm_model_name_fast" in explicit or not preset.model_fast
            else preset.model_fast
        )
        return model, fast

    if s.llm_api_key:
        vendor = s.llm_provider
        if vendor in ("groq", "gemini"):
            preset = PRESETS[vendor]
            model, fast = pick(preset)
            return Endpoint(
                "openai", vendor, s.llm_api_key, s.llm_base_url or preset.base_url, model, fast
            )
        if vendor == "openai" and s.llm_base_url:
            host = urlparse(s.llm_base_url).hostname or ""
            vendor = "nvidia" if host.endswith("nvidia.com") else "custom"
        return Endpoint(
            s.llm_provider, vendor, s.llm_api_key, s.llm_base_url,
            s.llm_model_name, s.llm_model_name_fast,
        )

    for vendor, key in (
        ("nvidia", s.nvidia_api_key),
        ("groq", s.groq_api_key),
        ("gemini", s.gemini_api_key),
        ("openai", s.openai_api_key),
    ):
        if key:
            preset = PRESETS[vendor]
            model, fast = pick(preset)
            return Endpoint("openai", vendor, key, preset.base_url, model, fast)

    return Endpoint(
        s.llm_provider, "none", "", s.llm_base_url, s.llm_model_name, s.llm_model_name_fast
    )


def sends_reasoning_switch(base_url: str) -> bool:
    """Whether the endpoint accepts the `chat_template_kwargs` thinking switch.

    vLLM/NIM-style servers take it; strict OpenAI-protocol hosts 400 on it.
    """
    if not base_url:
        return False
    return (urlparse(base_url).hostname or "") not in _STRICT_HOSTS


def get_ai_config(
    *,
    temperature: float | None = None,
    max_tokens: int | None = None,
    fast: bool = False,
    timeout: float | None = None,
) -> AIConfig:
    """Build AIConfig from application settings with optional overrides.

    Args:
        temperature: Override the configured default temperature.
        max_tokens: Override the configured token ceiling.
        fast: Route to the smaller/cheaper model. Use for high-volume,
            low-stakes work such as classification and summarisation
            (AI Thesis §26 model routing, Risk 6 cost control).
        timeout: Tighter per-call ceiling, e.g. when a verified fallback exists.
    """
    settings = get_settings()
    endpoint = resolve_endpoint(settings)
    configured = settings.llm_timeout_seconds
    return AIConfig(
        provider=endpoint.builder,
        vendor=endpoint.vendor,
        model_name=endpoint.model_fast if fast else endpoint.model,
        temperature=temperature if temperature is not None else settings.ai_default_temperature,
        max_tokens=max_tokens if max_tokens is not None else settings.ai_max_tokens,
        api_key=endpoint.api_key,
        base_url=endpoint.base_url,
        timeout=min(configured, timeout) if timeout else configured,
        # A tight ceiling exists because a fallback is ready; retrying would
        # double the wait the ceiling was meant to bound.
        max_retries=0 if timeout else 1,
        # Routing and reranking are classification: thinking buys nothing and
        # costs latency on every request.
        reasoning=settings.llm_reasoning and not fast,
    )
