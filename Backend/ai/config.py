"""AI-specific configuration.

Extends app-level settings with AI-tuning parameters.
Keeps AI concerns separated from application concerns.
"""

from dataclasses import dataclass

from app.config import get_settings


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


def get_ai_config(
    *,
    temperature: float | None = None,
    max_tokens: int | None = None,
    fast: bool = False,
) -> AIConfig:
    """Build AIConfig from application settings with optional overrides.

    Args:
        temperature: Override the configured default temperature.
        max_tokens: Override the configured token ceiling.
        fast: Route to the smaller/cheaper model. Use for high-volume,
            low-stakes work such as classification and summarisation
            (AI Thesis §26 model routing, Risk 6 cost control).
    """
    settings = get_settings()
    return AIConfig(
        provider=settings.llm_provider,
        model_name=settings.llm_model_name_fast if fast else settings.llm_model_name,
        temperature=temperature if temperature is not None else settings.ai_default_temperature,
        max_tokens=max_tokens if max_tokens is not None else settings.ai_max_tokens,
        api_key=settings.llm_api_key,
        base_url=settings.llm_base_url,
        timeout=settings.llm_timeout_seconds,
        # Routing and reranking are classification: thinking buys nothing and
        # costs latency on every request.
        reasoning=settings.llm_reasoning and not fast,
    )
