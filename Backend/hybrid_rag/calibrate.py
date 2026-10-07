"""Per-class fusion weight calibration.

Motivation, learned the hard way in this project's own benchmark: the widely
circulated 0.25/0.75 sparse/dense split is a property of *someone else's corpus
and someone else's embedding model*, not a universal constant. On a corpus where
the questions name their entities explicitly, BM25 is the stronger arm and
tilting the fusion toward dense actively destroys accuracy.

So weights are a fitted parameter, not a configuration default. This module
grid-searches them per query class on a labelled dev split, which is the
smallest amount of supervision that makes the routing gate worth having.

You need maybe 30-50 labelled queries per class. That is an afternoon of
annotation and it is the highest-return labelling you will do on a RAG system.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Sequence, Tuple, Any
import math

from .interfaces import Hit
from .evaluation import QueryCase, ndcg_at_k, recall_at_k
from . import fusion as fz


@dataclass
class CalibrationResult:
    weights: Dict[str, Tuple[float, float]]
    per_class: Dict[str, Dict[str, Any]]
    grid: List[float]

    def summary(self) -> str:
        out = []
        for cls, d in sorted(self.per_class.items()):
            w = self.weights[cls]
            out.append(f"{cls:<9} w_sparse={w[0]:.2f} w_dense={w[1]:.2f}  "
                       f"ndcg@10={d['best_score']:.4f} "
                       f"(vs {d['default_score']:.4f} at default, "
                       f"{d['n_queries']} dev queries)")
        return "\n".join(out)


def calibrate_weights(bm25, dense, cases: Sequence[QueryCase],
                      k_candidates: int = 50, rrf_k: int = 60,
                      grid_step: float = 0.05, metric: str = "ndcg@10",
                      default: Tuple[float, float] = (0.25, 0.75)
                      ) -> CalibrationResult:
    """Grid-search (w_sparse, 1 - w_sparse) per class.

    Candidate lists are retrieved ONCE per query and re-fused at every grid
    point, so the search costs one retrieval pass regardless of grid density --
    the expensive part is retrieval, and fusion over cached ranks is arithmetic.
    """
    # one retrieval pass, cached
    cached: Dict[str, Tuple[List[Hit], List[Hit]]] = {}
    for c in cases:
        cached[c.qid] = (bm25.search(c.query, k=k_candidates),
                         dense.search(c.query, k=k_candidates))

    by_class: Dict[str, List[QueryCase]] = {}
    for c in cases:
        by_class.setdefault(c.query_class or "UNKNOWN", []).append(c)

    grid = [round(i * grid_step, 4) for i in range(int(1 / grid_step) + 1)]

    def score(subset: Sequence[QueryCase], ws: float) -> float:
        vals = []
        for c in subset:
            s, d = cached[c.qid]
            fused = fz.weighted_rrf([(s, ws), (d, 1.0 - ws)], k=rrf_k, top=50)
            ranked = [h.doc_id for h in fused]
            vals.append(ndcg_at_k(ranked, c.gold, 10) if metric == "ndcg@10"
                        else recall_at_k(ranked, c.gold, 10))
        vals = [v for v in vals if not math.isnan(v)]
        return sum(vals) / len(vals) if vals else float("nan")

    weights, per_class = {}, {}
    for cls, subset in by_class.items():
        curve = [(ws, score(subset, ws)) for ws in grid]
        best_ws, best = max(curve, key=lambda x: (x[1] if not math.isnan(x[1]) else -1))
        weights[cls] = (round(best_ws, 4), round(1.0 - best_ws, 4))
        per_class[cls] = {
            "best_w_sparse": round(best_ws, 4),
            "best_score": round(best, 6),
            "default_score": round(score(subset, default[0]), 6),
            "n_queries": len(subset),
            "curve": [(ws, None if math.isnan(v) else round(v, 6)) for ws, v in curve],
        }
    return CalibrationResult(weights, per_class, grid)
