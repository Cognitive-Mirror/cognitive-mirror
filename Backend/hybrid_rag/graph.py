"""Graph evidence expansion.

The architectural claim this module encodes: a graph is a better *expander* than
it is a *retriever*. Published graph-RAG systems typically build an LLM-extracted
entity graph over the whole corpus at index time, then enter retrieval through
the graph -- which is where both the indexing cost and the query latency come
from, and it is paid on every query regardless of whether the question is
relational.

Here the entry point is always text retrieval, and the graph runs afterwards on
the handful of documents that already survived reranking. One hop, small budget.
That keeps the multi-hop recall gain (the neighbour that lexical and dense search
both missed because it shares no vocabulary with the query) while bounding cost.

Two edge sources are supported, and the distinction matters:

* `add_explicit_edges` -- structural edges you already have (citations, links,
  foreign keys, org charts). Free, exact, no LLM. If your corpus has these, this
  is the cheapest real accuracy you will find anywhere in the stack.
* `build_cooccurrence_edges` -- derived edges from shared rare terms. A cheap
  stand-in when no structure exists; deliberately uses rare-term overlap rather
  than LLM triple extraction, following the observation that deferring expensive
  LLM graph summarisation brings graph indexing cost near vector-RAG cost.
"""
from __future__ import annotations

import math
from collections import defaultdict, Counter
from typing import Dict, List, Sequence, Tuple, Iterable, Set

from .interfaces import Doc, Hit
from .sparse import tokenize


class EvidenceGraph:
    def __init__(self) -> None:
        self.adj: Dict[str, Dict[str, float]] = defaultdict(dict)
        self.edge_kind: Dict[Tuple[str, str], str] = {}

    # ---- construction ---------------------------------------------------
    def add_explicit_edges(self, edges: Iterable[Tuple[str, str]],
                           weight: float = 1.0, kind: str = "explicit") -> int:
        n = 0
        for a, b in edges:
            if a == b:
                continue
            self.adj[a][b] = max(self.adj[a].get(b, 0.0), weight)
            self.adj[b][a] = max(self.adj[b].get(a, 0.0), weight)
            self.edge_kind[(a, b)] = kind
            self.edge_kind[(b, a)] = kind
            n += 1
        return n

    def build_cooccurrence_edges(self, docs: Sequence[Doc],
                                 min_shared: int = 2,
                                 max_df_ratio: float = 0.08,
                                 top_per_doc: int = 8) -> int:
        """Link documents that share rare terms.

        Terms appearing in more than `max_df_ratio` of the corpus are dropped
        before linking -- common vocabulary would otherwise connect everything
        to everything and make traversal meaningless.
        """
        n_docs = len(docs)
        if n_docs < 2:
            return 0
        df: Counter = Counter()
        toks: Dict[str, Set[str]] = {}
        for d in docs:
            t = set(tokenize(d.indexed_text))
            toks[d.doc_id] = t
            df.update(t)
        cutoff = max(2, int(max_df_ratio * n_docs))
        rare = {d_id: {t for t in ts if df[t] <= cutoff} for d_id, ts in toks.items()}

        inverted: Dict[str, List[str]] = defaultdict(list)
        for d_id, ts in rare.items():
            for t in ts:
                inverted[t].append(d_id)

        pair: Counter = Counter()
        for t, ids in inverted.items():
            if len(ids) < 2 or len(ids) > 25:      # skip degenerate hubs
                continue
            w = 1.0 / math.log(2 + df[t])
            for i in range(len(ids)):
                for j in range(i + 1, len(ids)):
                    key = (ids[i], ids[j]) if ids[i] < ids[j] else (ids[j], ids[i])
                    pair[key] += w

        by_doc: Dict[str, List[Tuple[str, float]]] = defaultdict(list)
        for (a, b), w in pair.items():
            if len(rare[a] & rare[b]) >= min_shared:
                by_doc[a].append((b, w))
                by_doc[b].append((a, w))

        added = 0
        for d_id, nbrs in by_doc.items():
            for other, w in sorted(nbrs, key=lambda x: -x[1])[:top_per_doc]:
                self.adj[d_id][other] = max(self.adj[d_id].get(other, 0.0), w)
                self.adj[other][d_id] = max(self.adj[other].get(d_id, 0.0), w)
                self.edge_kind[(d_id, other)] = "cooccurrence"
                added += 1
        return added

    # ---- retrieval-time expansion ---------------------------------------
    def expand(self, seed_ids: Sequence[str], budget: int = 3, hops: int = 1,
               min_weight: float = 0.0,
               seed_scores: Dict[str, float] | None = None) -> List[Hit]:
        """Return up to `budget` neighbours of the seeds, excluding seeds.

        A neighbour's score sums its edge weights back to the seed set, weighted
        by each seed's own relevance -- so a document adjacent to two strong
        seeds outranks one adjacent to a single weak seed. That consensus
        behaviour is the point: it promotes documents the text retrievers could
        not see but that sit between things they ranked highly.
        """
        seeds = list(seed_ids)
        if not seeds or budget <= 0:
            return []
        sw = seed_scores or {}
        seen: Set[str] = set(seeds)
        frontier = seeds
        cand: Dict[str, float] = defaultdict(float)
        via: Dict[str, List[str]] = defaultdict(list)

        for hop in range(1, hops + 1):
            nxt = []
            decay = 1.0 / hop
            for s in frontier:
                base = sw.get(s, 1.0)
                for nbr, w in self.adj.get(s, {}).items():
                    if nbr in seen or w < min_weight:
                        continue
                    cand[nbr] += w * base * decay
                    via[nbr].append(s)
                    nxt.append(nbr)
            frontier = list(dict.fromkeys(nxt))
            seen |= set(frontier)

        ranked = sorted(cand.items(), key=lambda x: -x[1])[:budget]
        return [Hit(doc_id=d, score=float(s), source="graph", rank=i + 1,
                    provenance={"reached_via": sorted(set(via[d]))[:4],
                                "n_seed_paths": len(set(via[d]))})
                for i, (d, s) in enumerate(ranked)]

    @property
    def n_edges(self) -> int:
        return sum(len(v) for v in self.adj.values()) // 2

    @property
    def n_nodes(self) -> int:
        return len(self.adj)
