"""Wire the vendored ARC providers to application settings.

`Backend/hybrid_rag/` is vendored and must not be edited - it is the code the
benchmark in Docs/Research/ARC_hybrid_rag_report.md actually ran on, and editing
it in place would silently invalidate those numbers. Everything Impact-specific
lives here instead.

The vendored cloud adapters read credentials from `os.environ` directly. This
application reads configuration through `app.config.get_settings()`, so these
thin subclasses inject the key rather than requiring the process environment to
be mutated at import time.

Deployment shape chosen for this build:
  LLM         NVIDIA (build.nvidia.com), fast + strong models for routing
  embeddings  OpenAI text-embedding-3-large, switchable to local
  reranker    Cohere rerank-v3.5

Every one of those is a config change, not a code change (thesis 26).
"""

from __future__ import annotations

import logging
from typing import Callable

import numpy as np

from app.config import get_settings
from hybrid_rag.providers import (
    CohereReranker,
    HostLLMReranker,
    LSAEmbedder,
    OpenAIEmbedder,
    VoyageEmbedder,
)

logger = logging.getLogger(__name__)


# --- Embeddings ------------------------------------------------------------


class _KeyedOpenAIEmbedder(OpenAIEmbedder):
    def __init__(self, model: str, api_key: str, dim: int | None = None) -> None:
        super().__init__(model=model, dim=dim)
        self.api_key = api_key


class _KeyedVoyageEmbedder(VoyageEmbedder):
    def __init__(self, model: str, api_key: str, dim: int = 1024) -> None:
        super().__init__(model=model, dim=dim)
        self.api_key = api_key


class _KeyedCohereReranker(CohereReranker):
    def __init__(self, model: str, api_key: str) -> None:
        super().__init__(model=model)
        self.api_key = api_key


def build_embedder(corpus_texts: list[str] | None = None):
    """Return an embedder for the configured provider.

    Falls back to the local LSA embedder when no credential is configured. That
    fallback is deliberately *not* silent in behaviour: LSA is a genuine dense
    representation but far weaker than a neural embedder, so callers surface it
    in the retrieval trace rather than letting a degraded index look healthy.
    """
    settings = get_settings()
    provider = settings.embedding_provider.lower()

    if provider == "openai" and settings.openai_api_key:
        return _KeyedOpenAIEmbedder(
            model=settings.embedding_model, api_key=settings.openai_api_key
        )

    if provider == "voyage" and settings.voyage_api_key:
        return _KeyedVoyageEmbedder(
            model=settings.embedding_model, api_key=settings.voyage_api_key
        )

    if provider == "local":
        try:
            from hybrid_rag.providers import SentenceTransformerEmbedder

            return SentenceTransformerEmbedder()
        except Exception as exc:
            logger.warning(
                "sentence-transformers unavailable (%s); falling back to LSA.", exc
            )

    logger.warning(
        "No embedding credential for provider %r. Falling back to the local LSA "
        "embedder: retrieval quality will be materially worse and the trace will "
        "say so.",
        provider,
    )
    emb = LSAEmbedder(dim=256)
    if corpus_texts:
        emb.fit(corpus_texts)
    return emb


def embedder_name(embedder) -> str:
    """Short provenance label recorded on every retrieval trace."""
    return type(embedder).__name__


# --- LLM -------------------------------------------------------------------


def build_llm_fn(*, fast: bool = False) -> Callable[[str], str] | None:
    """A plain prompt -> text callable, which is what ARC expects.

    `fast=True` selects the cheaper model. Routing and reranking use it; the
    evidence review does not. That split is thesis 26 model routing and Risk 6
    cost control, implemented rather than described.

    Returns None when no LLM is configured, so callers can degrade explicitly
    instead of discovering it through an exception mid-pipeline.
    """
    try:
        from ai.utils.llm_factory import create_llm

        llm = create_llm(fast=fast)
    except Exception as exc:
        logger.warning("No LLM available for RAG (%s).", exc)
        return None

    def _call(prompt: str) -> str:
        response = llm.invoke(prompt)
        return getattr(response, "content", str(response)) or ""

    return _call


# --- Reranker --------------------------------------------------------------


def build_reranker():
    """Cohere when configured, else a listwise LLM reranker, else None.

    Reranking is the largest single quality lever in the ARC measurements
    (Recall@5 0.917 -> 0.960) and it is also what makes router misclassification
    survivable - an oracle router bought nothing at all once reranking was on.
    Losing it is a real regression, so the absence is logged loudly.
    """
    settings = get_settings()

    if settings.cohere_api_key:
        return _KeyedCohereReranker(
            model=settings.rerank_model, api_key=settings.cohere_api_key
        )

    llm_fn = build_llm_fn(fast=True)
    if llm_fn is not None:
        logger.info("No Cohere key; using the listwise LLM reranker.")
        return HostLLMReranker(llm_fn=llm_fn, batch=20)

    logger.warning(
        "No reranker available. This removes the largest measured quality lever "
        "and makes router misclassification consequential again."
    )
    return None


def reranker_name(reranker) -> str:
    return type(reranker).__name__ if reranker is not None else "none"


__all__ = [
    "build_embedder",
    "build_llm_fn",
    "build_reranker",
    "embedder_name",
    "reranker_name",
]
