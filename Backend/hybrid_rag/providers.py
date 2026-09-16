"""Concrete providers.

Two families, both satisfying the protocols in `interfaces.py`:

CLOUD (your stated deployment target) -- thin REST adapters for OpenAI / Voyage
embeddings and Cohere / Voyage reranking. These read keys from the environment
and are the ones you would run in production. They are NOT exercised in this
workspace because no such API credentials are configured here; treat them as
reviewed-but-unrun code and smoke-test them against your own keys before
trusting them.

LOCAL -- what the benchmark in this report actually ran on. `LSAEmbedder` needs
no network and no model download, which makes the ablation reproducible from a
cold start; `SentenceTransformerEmbedder` is the better local option when the
model can be downloaded. `HostLLMReranker` and `HostLLMGenerator` use the
platform LLM, so the reranking and generation stages are genuinely measured
rather than stubbed.
"""
from __future__ import annotations

import json
import os
import re
from typing import Sequence, List, Tuple, Dict, Any, Callable, Optional

import numpy as np

from .interfaces import Doc, Embedder, Reranker, Generator


# ======================================================================
# CLOUD ADAPTERS
# ======================================================================

class OpenAIEmbedder:
    """text-embedding-3-large by default. dim=3072; pass `dimensions` to use
    OpenAI's native truncation (cheaper storage, small accuracy cost)."""

    def __init__(self, model: str = "text-embedding-3-large",
                 dim: int | None = None, api_key_env: str = "OPENAI_API_KEY"):
        self.model, self._dim_override = model, dim
        self.api_key = os.environ.get(api_key_env)
        self.dim = dim or (3072 if "large" in model else 1536)

    def encode(self, texts: Sequence[str], is_query: bool = False) -> np.ndarray:
        import requests
        if not self.api_key:
            raise RuntimeError("OPENAI_API_KEY not set")
        body: Dict[str, Any] = {"model": self.model, "input": list(texts)}
        if self._dim_override:
            body["dimensions"] = self._dim_override
        r = requests.post("https://api.openai.com/v1/embeddings",
                          headers={"Authorization": f"Bearer {self.api_key}"},
                          json=body, timeout=60)
        r.raise_for_status()
        data = sorted(r.json()["data"], key=lambda d: d["index"])
        return np.array([d["embedding"] for d in data], dtype=np.float32)


class VoyageEmbedder:
    """Voyage exposes an explicit query/document asymmetry via input_type, which
    materially helps retrieval; the interface carries `is_query` for exactly
    this reason."""

    def __init__(self, model: str = "voyage-3", dim: int = 1024,
                 api_key_env: str = "VOYAGE_API_KEY"):
        self.model, self.dim = model, dim
        self.api_key = os.environ.get(api_key_env)

    def encode(self, texts: Sequence[str], is_query: bool = False) -> np.ndarray:
        import requests
        if not self.api_key:
            raise RuntimeError("VOYAGE_API_KEY not set")
        r = requests.post("https://api.voyageai.com/v1/embeddings",
                          headers={"Authorization": f"Bearer {self.api_key}"},
                          json={"model": self.model, "input": list(texts),
                                "input_type": "query" if is_query else "document"},
                          timeout=60)
        r.raise_for_status()
        data = sorted(r.json()["data"], key=lambda d: d["index"])
        return np.array([d["embedding"] for d in data], dtype=np.float32)


class CohereReranker:
    def __init__(self, model: str = "rerank-v3.5",
                 api_key_env: str = "COHERE_API_KEY"):
        self.model = model
        self.api_key = os.environ.get(api_key_env)

    def rerank(self, query: str, docs: Sequence[Doc]) -> List[Tuple[str, float]]:
        import requests
        if not self.api_key:
            raise RuntimeError("COHERE_API_KEY not set")
        r = requests.post("https://api.cohere.com/v2/rerank",
                          headers={"Authorization": f"Bearer {self.api_key}"},
                          json={"model": self.model, "query": query,
                                "documents": [d.indexed_text for d in docs],
                                "top_n": len(docs)}, timeout=60)
        r.raise_for_status()
        return [(docs[x["index"]].doc_id, float(x["relevance_score"]))
                for x in r.json()["results"]]


# ======================================================================
# LOCAL ADAPTERS
# ======================================================================

class LSAEmbedder:
    """Latent Semantic Analysis: TF-IDF followed by truncated SVD.

    Included because it needs no network, no GPU and no model download, so the
    ablation is reproducible from a cold start. It is a genuine dense semantic
    representation -- the SVD captures term co-occurrence, so it retrieves on
    synonymy that BM25 cannot see, which is what makes it a valid stand-in for
    the dense arm of the comparison.

    It is NOT competitive with a modern neural embedder, and the report does not
    claim otherwise. Absolute numbers from an LSA-backed run understate what a
    production dense retriever achieves; the ablation is about the *relative*
    contribution of each stage, which is what transfers.
    """

    def __init__(self, dim: int = 256, min_df: int = 1):
        self.dim, self.min_df = dim, min_df
        self._vec = None
        self._svd = None
        self.fitted = False

    def fit(self, texts: Sequence[str]) -> "LSAEmbedder":
        from sklearn.decomposition import TruncatedSVD
        from sklearn.feature_extraction.text import TfidfVectorizer
        self._vec = TfidfVectorizer(min_df=self.min_df, sublinear_tf=True,
                                    stop_words="english", max_features=60000)
        X = self._vec.fit_transform(texts)
        n_comp = int(min(self.dim, min(X.shape) - 1))
        self._svd = TruncatedSVD(n_components=max(2, n_comp), random_state=0)
        self._svd.fit(X)
        self.dim = self._svd.n_components
        self.fitted = True
        return self

    def encode(self, texts: Sequence[str], is_query: bool = False) -> np.ndarray:
        if not self.fitted:
            raise RuntimeError("LSAEmbedder.fit(corpus) must be called first")
        return self._svd.transform(self._vec.transform(list(texts))).astype(np.float32)


class SentenceTransformerEmbedder:
    """Preferred local option. bge-small is the default for speed; bge-base or
    gte-base are better if you can afford the latency."""

    def __init__(self, model_name: str = "BAAI/bge-small-en-v1.5",
                 query_prefix: str = "Represent this sentence for searching relevant passages: "):
        from sentence_transformers import SentenceTransformer
        self.model = SentenceTransformer(model_name)
        self.query_prefix = query_prefix
        self.dim = self.model.get_sentence_embedding_dimension()

    def encode(self, texts: Sequence[str], is_query: bool = False) -> np.ndarray:
        t = [self.query_prefix + x for x in texts] if is_query else list(texts)
        return np.asarray(self.model.encode(t, normalize_embeddings=True,
                                            show_progress_bar=False),
                          dtype=np.float32)


_RERANK_PROMPT = """You are scoring search results for relevance to a query.

Query: {q}

For each numbered passage, output its relevance on a 0-10 integer scale, where
10 means the passage directly answers the query and 0 means it is unrelated.

Output one line per passage in the form `<number>: <score>` and nothing else.

{passages}"""


class HostLLMReranker:
    """Listwise LLM reranker.

    Listwise scoring is used rather than pointwise because the model sees the
    candidates together and can calibrate against each other, which is the
    behaviour that makes LLM rerankers competitive with trained cross-encoders.
    Batched to keep prompts inside a sane context and to bound the damage from
    a single malformed response.

    `llm_fn` maps prompt -> text. In this workspace it is wired to the platform
    LLM; in production swap in CohereReranker, a local cross-encoder, or your
    own model behind the same protocol.
    """

    def __init__(self, llm_fn: Callable[[str], str], batch: int = 20):
        self.llm_fn, self.batch = llm_fn, batch

    def rerank(self, query: str, docs: Sequence[Doc]) -> List[Tuple[str, float]]:
        out: List[Tuple[str, float]] = []
        for start in range(0, len(docs), self.batch):
            grp = list(docs)[start:start + self.batch]
            passages = "\n\n".join(
                f"[{i+1}] {d.indexed_text[:700]}" for i, d in enumerate(grp))
            scores = {}
            try:
                raw = self.llm_fn(_RERANK_PROMPT.format(q=query, passages=passages))
                for m in re.finditer(r"(\d+)\s*[:.)-]\s*(\d+(?:\.\d+)?)", raw or ""):
                    idx, sc = int(m.group(1)), float(m.group(2))
                    if 1 <= idx <= len(grp):
                        scores[idx - 1] = min(sc, 10.0) / 10.0
            except Exception:
                pass
            # Unscored passages keep a rank-decayed prior rather than dropping
            # out: a parse failure must not silently delete candidates.
            for i, d in enumerate(grp):
                out.append((d.doc_id, scores.get(i, 0.25 * (1.0 - i / max(len(grp), 1)))))
        out.sort(key=lambda x: -x[1])
        return out


class HostLLMGenerator:
    def __init__(self, llm_fn: Callable[[str, str], str]):
        self.llm_fn = llm_fn

    def generate(self, prompt: str, system: str = "", max_tokens: int = 1024) -> str:
        return self.llm_fn(prompt, system)


_CONTEXT_PROMPT = """<document>
{doc}
</document>

Here is a chunk from that document:
<chunk>
{chunk}
</chunk>

Write a short standalone context sentence (at most {n} tokens) that situates this
chunk within the document, so the chunk can be retrieved on its own. Give only
the sentence."""


def contextualize_chunks(chunks: Sequence[Doc], full_doc_text: str,
                         llm_fn: Callable[[str], str], max_tokens: int = 80,
                         doc_clip: int = 6000) -> None:
    """Populate `Doc.context` in place (Anthropic-style contextual retrieval).

    The prefix is added before BOTH the dense and sparse index, which is the
    part that matters: it repairs the pronoun-and-implicit-subject problem for
    lexical matching as well as for embeddings.
    """
    for c in chunks:
        try:
            c.context = (llm_fn(_CONTEXT_PROMPT.format(
                doc=full_doc_text[:doc_clip], chunk=c.text[:2000],
                n=max_tokens)) or "").strip().replace("\n", " ")
        except Exception:
            c.context = ""
