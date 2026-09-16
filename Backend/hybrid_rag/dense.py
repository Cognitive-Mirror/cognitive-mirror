"""Dense retrieval over a flat cosine index.

Flat exact search is used deliberately: at reference-implementation scale it
removes ANN recall as a confounder, so an ablation measures the retrieval
strategy rather than the index approximation. Swap in HNSW (Qdrant, pgvector,
Weaviate) for production -- the interface is unchanged, and the accuracy
difference is an index-tuning question, not an architecture question.
"""
from __future__ import annotations

from typing import Sequence, List, Dict
import numpy as np

from .interfaces import Doc, Hit, Embedder


class DenseIndex:
    def __init__(self, embedder: Embedder):
        self.embedder = embedder
        self.docs: Dict[str, Doc] = {}
        self._ids: List[str] = []
        self._mat: np.ndarray | None = None

    def add(self, docs: Sequence[Doc], batch: int = 64) -> None:
        new = [d for d in docs if d.doc_id not in self.docs]
        if not new:
            return
        vecs = []
        for i in range(0, len(new), batch):
            chunk = new[i:i + batch]
            vecs.append(self.embedder.encode([d.indexed_text for d in chunk],
                                             is_query=False))
        v = np.vstack(vecs).astype(np.float32)
        v /= (np.linalg.norm(v, axis=1, keepdims=True) + 1e-9)
        for d in new:
            self.docs[d.doc_id] = d
        self._ids.extend(d.doc_id for d in new)
        self._mat = v if self._mat is None else np.vstack([self._mat, v])

    def search(self, query: str, k: int = 50) -> List[Hit]:
        if self._mat is None or not self._ids:
            return []
        q = self.embedder.encode([query], is_query=True).astype(np.float32)[0]
        q /= (np.linalg.norm(q) + 1e-9)
        sims = self._mat @ q
        k = min(k, len(self._ids))
        idx = np.argpartition(-sims, k - 1)[:k]
        idx = idx[np.argsort(-sims[idx])]
        return [Hit(doc_id=self._ids[j], score=float(sims[j]), source="dense",
                    rank=i + 1) for i, j in enumerate(idx)]

    def __len__(self) -> int:
        return len(self.docs)
