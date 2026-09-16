"""Chunking.

Sentence-aware splitting with overlap. Chunk boundaries are placed at sentence
ends wherever possible because a chunk that begins mid-sentence loses the
subject, which hurts the sparse index (missing head terms) and the dense index
(degraded embedding) at the same time.
"""
from __future__ import annotations

import re
from typing import List, Dict, Any

from .interfaces import Doc

_SENT = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9])")


def approx_tokens(text: str) -> int:
    return max(1, len(text) // 4)


def chunk_text(text: str, doc_id: str, chunk_tokens: int = 400,
               overlap: float = 0.15, meta: Dict[str, Any] | None = None) -> List[Doc]:
    text = re.sub(r"\s+", " ", text or "").strip()
    if not text:
        return []
    target = chunk_tokens * 4
    step_back = int(target * overlap)

    sents = _SENT.split(text) or [text]
    chunks: List[str] = []
    buf = ""
    for s in sents:
        if buf and len(buf) + len(s) + 1 > target:
            chunks.append(buf.strip())
            buf = (buf[-step_back:] + " " + s) if step_back else s
        else:
            buf = (buf + " " + s).strip()
    if buf.strip():
        chunks.append(buf.strip())

    return [Doc(doc_id=f"{doc_id}::c{i}", text=c,
                meta={**(meta or {}), "parent": doc_id, "chunk_index": i})
            for i, c in enumerate(chunks)]
