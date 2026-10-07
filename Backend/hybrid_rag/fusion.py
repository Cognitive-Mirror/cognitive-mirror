"""Rank fusion.

Why rank-based and not score-based, stated once and relied on everywhere else:
BM25 emits unbounded scores whose scale depends on corpus term statistics, while
a dense retriever emits bounded cosine similarities. The two distributions have
different shapes, so min-max normalising them and taking a weighted sum lets a
single outlier in either list distort the merged order in a way that is not
stable across queries. Ranks discard magnitude and keep only the ordering each
retriever is actually reliable about.

`score` fusion is implemented anyway, because the ablation in the report needs
something to beat.
"""
from __future__ import annotations

from typing import Sequence, List, Dict, Tuple
from collections import defaultdict

from .interfaces import Hit


def weighted_rrf(lists: Sequence[Tuple[Sequence[Hit], float]],
                 k: int = 60, top: int = 100) -> List[Hit]:
    """Weighted Reciprocal Rank Fusion.

    score(d) = sum_i  w_i / (k + rank_i(d))

    k damps the influence of deep ranks: with k=60 the gap between rank 1 and
    rank 2 matters far more than the gap between rank 40 and 41, which is the
    behaviour you want when the tail of each list is mostly noise.
    """
    agg: Dict[str, float] = defaultdict(float)
    seen_in: Dict[str, List[str]] = defaultdict(list)
    ranks: Dict[str, Dict[str, int]] = defaultdict(dict)

    for hits, w in lists:
        if w <= 0:
            continue
        for h in hits:
            r = h.rank if h.rank is not None else 1
            agg[h.doc_id] += w / (k + r)
            seen_in[h.doc_id].append(h.source)
            ranks[h.doc_id][h.source] = r

    out = sorted(agg.items(), key=lambda x: -x[1])[:top]
    return [Hit(doc_id=d, score=s, source="fused", rank=i + 1,
                provenance={"found_by": seen_in[d], "ranks": ranks[d]})
            for i, (d, s) in enumerate(out)]


def plain_rrf(lists: Sequence[Sequence[Hit]], k: int = 60, top: int = 100) -> List[Hit]:
    return weighted_rrf([(l, 1.0) for l in lists], k=k, top=top)


def score_fusion(lists: Sequence[Tuple[Sequence[Hit], float]],
                 top: int = 100) -> List[Hit]:
    """Min-max normalise then weighted-sum. Present as the ablation baseline."""
    agg: Dict[str, float] = defaultdict(float)
    for hits, w in lists:
        if not hits or w <= 0:
            continue
        s = [h.score for h in hits]
        lo, hi = min(s), max(s)
        rng = (hi - lo) or 1.0
        for h in hits:
            agg[h.doc_id] += w * (h.score - lo) / rng
    out = sorted(agg.items(), key=lambda x: -x[1])[:top]
    return [Hit(doc_id=d, score=sc, source="fused", rank=i + 1)
            for i, (d, sc) in enumerate(out)]


def exit_signal(fused: Sequence[Hit], sparse: Sequence[Hit],
                dense: Sequence[Hit], margin: float,
                require_agreement: bool) -> Tuple[bool, Dict]:
    """Early-exit gate: is the fused ranking already confident enough to skip
    the reranker? Two independent signals must agree.

    1. Relative margin between rank 1 and rank 2 exceeds `margin`.
    2. Both retrievers independently put the same document first.

    Returning True saves the dominant per-query cost in an API deployment.
    """
    if len(fused) < 2:
        return False, {"reason": "too_few_candidates"}
    top1, top2 = fused[0].score, fused[1].score
    rel = (top1 - top2) / (top1 or 1e-9)
    agree = bool(sparse and dense and sparse[0].doc_id == dense[0].doc_id)
    ok = rel >= margin and (agree or not require_agreement)
    return ok, {"relative_margin": round(rel, 4), "retrievers_agree": agree,
                "threshold": margin}
