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
  LLM         GLM-5.3 via NVIDIA's OpenAI-compatible endpoint
  embeddings  Jina jina-embeddings-v4 (query/passage asymmetric), else local
  reranker    Jina reranker -> Cohere -> listwise LLM, as a fallback chain

The Jina adapters live here rather than in the vendored package because they
are Impact's addition, not part of what the ARC benchmark ran.

Every one of those is a config change, not a code change (thesis 26).
"""

from __future__ import annotations

import logging
from collections.abc import Callable

import httpx
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


_JINA_BASE = "https://api.jina.ai/v1"
# Small batches keep one oversized clause from failing the whole index build.
_JINA_BATCH = 64


class JinaEmbedder:
    """jina-embeddings-v4 through the hosted API.

    Uses Jina's task adapters for the query/passage asymmetry, the same reason
    the vendored Voyage adapter carries `is_query`: a short evidence query and a
    long rubric clause are different kinds of text and embed better as such.
    """

    def __init__(self, model: str, api_key: str, dim: int | None = None) -> None:
        self.model, self.api_key = model, api_key
        self._dim_override = dim
        self.dim = dim or 2048

    def encode(self, texts, is_query: bool = False) -> np.ndarray:
        items = list(texts)
        out: list[list[float]] = []
        for start in range(0, len(items), _JINA_BATCH):
            body: dict = {
                "model": self.model,
                "task": "retrieval.query" if is_query else "retrieval.passage",
                "input": items[start : start + _JINA_BATCH],
            }
            if self._dim_override:
                body["dimensions"] = self._dim_override
            r = httpx.post(
                f"{_JINA_BASE}/embeddings",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json=body,
                timeout=60,
            )
            r.raise_for_status()
            data = sorted(r.json()["data"], key=lambda d: d["index"])
            out.extend(d["embedding"] for d in data)
        arr = np.array(out, dtype=np.float32)
        if arr.size:
            self.dim = arr.shape[1]
        return arr


class JinaReranker:
    """Jina cross-encoder reranking. Same contract as the vendored CohereReranker."""

    def __init__(self, model: str, api_key: str) -> None:
        self.model, self.api_key = model, api_key

    def rerank(self, query: str, docs) -> list[tuple[str, float]]:
        if not docs:
            return []
        r = httpx.post(
            f"{_JINA_BASE}/rerank",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={
                "model": self.model,
                "query": query,
                "documents": [d.indexed_text for d in docs],
                "top_n": len(docs),
                "return_documents": False,
            },
            timeout=60,
        )
        r.raise_for_status()
        return [
            (docs[x["index"]].doc_id, float(x["relevance_score"]))
            for x in r.json()["results"]
        ]


class FallbackReranker:
    """Try rerankers in order; the first that answers wins.

    A free-tier reranker that rate-limits mid-request should cost one retry on
    the next provider, not the largest quality lever in the pipeline. Which
    provider actually answered is kept on `last_used` for the trace.
    """

    def __init__(self, chain: list) -> None:
        self.chain = chain
        self.last_used = "none"

    def rerank(self, query: str, docs) -> list[tuple[str, float]]:
        last_exc: Exception | None = None
        for reranker in self.chain:
            try:
                result = reranker.rerank(query, docs)
                self.last_used = type(reranker).__name__
                return result
            except Exception as exc:  # network, quota, malformed response
                logger.warning(
                    "%s failed (%s); trying next reranker.", type(reranker).__name__, exc
                )
                last_exc = exc
        raise RuntimeError(f"All rerankers failed: {last_exc}")


def build_embedder(corpus_texts: list[str] | None = None):
    """Return an embedder for the configured provider.

    Falls back to the local LSA embedder when no credential is configured. That
    fallback is deliberately *not* silent in behaviour: LSA is a genuine dense
    representation but far weaker than a neural embedder, so callers surface it
    in the retrieval trace rather than letting a degraded index look healthy.
    """
    settings = get_settings()
    provider = settings.embedding_provider.lower()

    if provider == "jina" and settings.jina_api_key:
        return JinaEmbedder(model=settings.embedding_model, api_key=settings.jina_api_key)

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
    """The configured reranker first, then every other available one.

    Reranking is the largest single quality lever in the ARC measurements
    (Recall@5 0.917 -> 0.960) and it is also what makes router misclassification
    survivable - an oracle router bought nothing at all once reranking was on.
    So it is built as a chain: RERANK_PROVIDER first, the remaining keyed
    providers next, the listwise LLM reranker last.
    """
    settings = get_settings()
    available: dict[str, object] = {}
    if settings.jina_api_key:
        available["jina"] = JinaReranker(
            model=settings.rerank_model, api_key=settings.jina_api_key
        )
    if settings.cohere_api_key:
        available["cohere"] = _KeyedCohereReranker(
            model=settings.cohere_rerank_model, api_key=settings.cohere_api_key
        )
    llm_fn = build_llm_fn(fast=True)
    if llm_fn is not None:
        available["llm"] = HostLLMReranker(llm_fn=llm_fn, batch=20)

    preferred = settings.rerank_provider.lower()
    order = [preferred] + [k for k in ("jina", "cohere", "llm") if k != preferred]
    chain = [available[k] for k in order if k in available]

    if not chain:
        logger.warning(
            "No reranker available. This removes the largest measured quality "
            "lever and makes router misclassification consequential again."
        )
        return None
    if len(chain) == 1:
        return chain[0]
    return FallbackReranker(chain)


def reranker_name(reranker) -> str:
    if reranker is None:
        return "none"
    if isinstance(reranker, FallbackReranker):
        names = ">".join(type(r).__name__ for r in reranker.chain)
        return f"chain[{names}] used={reranker.last_used}"
    return type(reranker).__name__


__all__ = [
    "FallbackReranker",
    "JinaEmbedder",
    "JinaReranker",
    "build_embedder",
    "build_llm_fn",
    "build_reranker",
    "embedder_name",
    "reranker_name",
]
