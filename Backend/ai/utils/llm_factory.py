"""Model-agnostic LLM factory.

Swapping LLM providers requires only a config change — no code changes.

Supported providers:
  - nvidia  → ChatNVIDIA (build.nvidia.com)
  - openai  → ChatOpenAI
  - anthropic → ChatAnthropic

Add new providers by extending the _PROVIDER_BUILDERS dict.
"""

from __future__ import annotations

from typing import Any

from langchain_core.language_models import BaseChatModel

from ai.config import AIConfig, get_ai_config


def create_llm(
    *,
    config: AIConfig | None = None,
    temperature: float | None = None,
    max_tokens: int | None = None,
) -> BaseChatModel:
    """Create a chat model instance from configuration.

    Args:
        config: Explicit AIConfig. If None, builds from app settings.
        temperature: Override temperature (only used if config is None).
        max_tokens: Override max_tokens (only used if config is None).

    Returns:
        A LangChain BaseChatModel ready for invocation.

    Raises:
        ValueError: If the provider is not supported.
        ImportError: If the provider's LangChain package is not installed.
    """
    if config is None:
        config = get_ai_config(temperature=temperature, max_tokens=max_tokens)

    builder = _PROVIDER_BUILDERS.get(config.provider)
    if builder is None:
        supported = ", ".join(sorted(_PROVIDER_BUILDERS.keys()))
        raise ValueError(
            f"Unsupported LLM provider: '{config.provider}'. "
            f"Supported: {supported}"
        )

    return builder(config)


# ─── Provider Builders ─── #
# Each function returns a BaseChatModel for its provider.
# Import is deferred to avoid requiring all provider packages.


def _build_nvidia(config: AIConfig) -> BaseChatModel:
    try:
        from langchain_nvidia_ai_endpoints import ChatNVIDIA
    except ImportError as e:
        raise ImportError(
            "Install langchain-nvidia-ai-endpoints: "
            "pip install langchain-nvidia-ai-endpoints"
        ) from e

    return ChatNVIDIA(
        model=config.model_name,
        api_key=config.api_key,
        temperature=config.temperature,
        max_tokens=config.max_tokens,
    )


def _build_openai(config: AIConfig) -> BaseChatModel:
    try:
        from langchain_openai import ChatOpenAI
    except ImportError as e:
        raise ImportError(
            "Install langchain-openai: pip install langchain-openai"
        ) from e

    return ChatOpenAI(
        model=config.model_name,
        api_key=config.api_key,
        temperature=config.temperature,
        max_tokens=config.max_tokens,
    )


def _build_anthropic(config: AIConfig) -> BaseChatModel:
    try:
        from langchain_anthropic import ChatAnthropic
    except ImportError as e:
        raise ImportError(
            "Install langchain-anthropic: pip install langchain-anthropic"
        ) from e

    return ChatAnthropic(
        model=config.model_name,
        api_key=config.api_key,
        temperature=config.temperature,
        max_tokens=config.max_tokens,
    )


_PROVIDER_BUILDERS: dict[str, Any] = {
    "nvidia": _build_nvidia,
    "openai": _build_openai,
    "anthropic": _build_anthropic,
}
