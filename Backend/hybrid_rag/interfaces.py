"""Provider-agnostic interfaces.

The pipeline depends only on these protocols. Cloud adapters (OpenAI, Cohere,
Voyage, Anthropic) and local adapters (sentence-transformers, host LLM) both
satisfy them, so switching deployment mode is a config change, not a rewrite.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol, Sequence, List, Dict, Any, Optional, Tuple
import numpy as np


@dataclass
class Doc:
    doc_id: str
    text: str
    meta: Dict[str, Any] = field(default_factory=dict)
    context: str = ""          # LLM-generated situating summary, if any

    @property
    def indexed_text(self) -> str:
        """What goes into BOTH indexes. Contextual prefix included by design."""
        return (self.context + "\n" + self.text).strip() if self.context else self.text


@dataclass
class Hit:
    doc_id: str
    score: float
    source: str                # sparse | dense | graph | fused | rerank
    rank: Optional[int] = None
    provenance: Dict[str, Any] = field(default_factory=dict)


class Embedder(Protocol):
    dim: int
    def encode(self, texts: Sequence[str], is_query: bool = False) -> np.ndarray: ...


class Reranker(Protocol):
    def rerank(self, query: str, docs: Sequence[Doc]) -> List[Tuple[str, float]]:
        """Return (doc_id, score) sorted best-first. Scores normalised to [0,1]."""
        ...


class Generator(Protocol):
    def generate(self, prompt: str, system: str = "", max_tokens: int = 1024) -> str: ...
