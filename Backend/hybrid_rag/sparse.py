"""Okapi BM25 over an in-memory inverted index.

Implemented directly rather than pulled from a dependency so the term-saturation
and length-normalisation behaviour is inspectable -- this is the component whose
score distribution motivates rank-based fusion, and the report argues from it.

For production at scale this class is a drop-in stand-in for an Elasticsearch /
OpenSearch / Vespa sparse query; the interface is what matters.
"""
from __future__ import annotations

import math
import re
from collections import Counter, defaultdict
from typing import Sequence, List, Dict

from .interfaces import Doc, Hit

_TOKEN = re.compile(r"[a-z0-9]+(?:[-_.][a-z0-9]+)*")

# Minimal stoplist. Deliberately short: aggressive stopping hurts the exact-match
# queries that are the whole reason BM25 is in the stack.
_STOP = frozenset("""a an and are as at be by for from has have in is it its of on
that the to was were will with this these those or if then than there here what
which who whom how when where why do does did been being am s t""".split())


def tokenize(text: str, keep_stop: bool = False) -> List[str]:
    toks = _TOKEN.findall(text.lower())
    return toks if keep_stop else [t for t in toks if t not in _STOP]


class BM25Index:
    """k1 controls term-frequency saturation; b controls length normalisation.
    k1=1.5 / b=0.75 are the long-standing defaults and are not worth tuning
    before you have judged pairs from your own corpus."""

    def __init__(self, k1: float = 1.5, b: float = 0.75):
        self.k1, self.b = k1, b
        self.docs: Dict[str, Doc] = {}
        self._tf: Dict[str, Counter] = {}
        self._df: Counter = Counter()
        self._len: Dict[str, int] = {}
        self._postings: Dict[str, set] = defaultdict(set)
        self._avgdl = 0.0

    def add(self, docs: Sequence[Doc]) -> None:
        for d in docs:
            if d.doc_id in self.docs:
                continue
            toks = tokenize(d.indexed_text)
            tf = Counter(toks)
            self.docs[d.doc_id] = d
            self._tf[d.doc_id] = tf
            self._len[d.doc_id] = len(toks)
            for term in tf:
                self._df[term] += 1
                self._postings[term].add(d.doc_id)
        n = len(self._len)
        self._avgdl = (sum(self._len.values()) / n) if n else 0.0

    def _idf(self, term: str) -> float:
        n = len(self._len)
        df = self._df.get(term, 0)
        if df == 0:
            return 0.0
        # Robertson-Sparck Jones idf with the +0.5 smoothing that keeps very
        # common terms from going negative.
        return math.log(1.0 + (n - df + 0.5) / (df + 0.5))

    def search(self, query: str, k: int = 50) -> List[Hit]:
        q = tokenize(query)
        if not q or not self._len:
            return []
        cand = set()
        for term in q:
            cand |= self._postings.get(term, set())
        scored = []
        for doc_id in cand:
            tf, dl = self._tf[doc_id], self._len[doc_id]
            s = 0.0
            for term in q:
                f = tf.get(term, 0)
                if not f:
                    continue
                denom = f + self.k1 * (1 - self.b + self.b * dl / (self._avgdl or 1))
                s += self._idf(term) * (f * (self.k1 + 1)) / denom
            if s > 0:
                scored.append((doc_id, s))
        scored.sort(key=lambda x: -x[1])
        return [Hit(doc_id=d, score=s, source="sparse", rank=i + 1)
                for i, (d, s) in enumerate(scored[:k])]

    def __len__(self) -> int:
        return len(self.docs)
