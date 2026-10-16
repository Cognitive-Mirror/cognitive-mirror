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

from ai.config import AIConfig, get_ai_config, sends_reasoning_switch


def create_llm(
    *,
    config: AIConfig | None = None,
    temperature: float | None = None,
    max_tokens: int | None = None,
    fast: bool = False,
    timeout: float | None = None,
) -> BaseChatModel:
    """Create a chat model instance from configuration.

    Args:
        config: Explicit AIConfig. If None, builds from app settings.
        temperature: Override temperature (only used if config is None).
        max_tokens: Override max_tokens (only used if config is None).
        fast: Route to the cheaper model for high-volume, low-stakes calls
            (only used if config is None).
        timeout: Tighter per-call ceiling (only used if config is None).

    Returns:
        A LangChain BaseChatModel ready for invocation.

    Raises:
        ValueError: If the provider is not supported or no API key is set.
        ImportError: If the provider's LangChain package is not installed.
    """
    if config is None:
        config = get_ai_config(
            temperature=temperature,
            max_tokens=max_tokens,
            fast=fast,
            timeout=timeout,
        )

    if not config.api_key:
        raise ValueError(
            "No LLM API key configured. Set LLM_API_KEY, or one of NVIDIA_API_KEY, "
            "GROQ_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY, in Backend/.env (see "
            "Backend/.env.example). The key is server-side only and must "
            "never be placed in Frontend/ code."
        )

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

    kwargs: dict[str, Any] = {}
    if config.base_url:
        # Any OpenAI-compatible server: NVIDIA NIM, vLLM, Groq, Gemini, local.
        kwargs["base_url"] = config.base_url
    if sends_reasoning_switch(config.base_url):
        # Hybrid reasoning models (GLM, Qwen, DeepSeek) on these servers take
        # the thinking switch through the chat template. Servers that do not
        # know the key ignore it. Reasoning text comes back in a separate
        # `reasoning_content` field which LangChain does not fold into
        # `content`, so it can never be parsed as the answer.
        kwargs["extra_body"] = {
            "chat_template_kwargs": {"enable_thinking": config.reasoning}
        }

    return ChatOpenAI(
        model=config.model_name,
        api_key=config.api_key,
        temperature=config.temperature,
        max_tokens=config.max_tokens,
        timeout=config.timeout,
        max_retries=config.max_retries,
        **kwargs,
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
