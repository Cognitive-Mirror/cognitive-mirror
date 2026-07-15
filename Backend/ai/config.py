"""AI-specific configuration.

Extends app-level settings with AI-tuning parameters.
Keeps AI concerns separated from application concerns.
"""

from dataclasses import dataclass, field

from app.config import get_settings


@dataclass(frozen=True)
class AIConfig:
    """Immutable AI configuration for a single invocation context."""

    provider: str
    model_name: str
    temperature: float
    max_tokens: int
    api_key: str


def get_ai_config(
    *,
    temperature: float | None = None,
    max_tokens: int | None = None,
) -> AIConfig:
    """Build AIConfig from application settings with optional overrides."""
    settings = get_settings()
    return AIConfig(
        provider=settings.llm_provider,
        model_name=settings.llm_model_name,
        temperature=temperature if temperature is not None else settings.ai_default_temperature,
        max_tokens=max_tokens if max_tokens is not None else settings.ai_max_tokens,
        api_key=settings.nvidia_api_key,
    )
