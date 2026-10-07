"""Retrieval metrics and the ablation harness.

Metrics are the standard IR set. Recall@k is the one that matters most for RAG
specifically: a passage the retriever never returns cannot be reranked into
place and cannot be cited, so recall at the candidate-generation depth bounds
everything downstream. nDCG@10 is reported because it is what the retrieval
literature compares on, and MRR because it tracks the "is the right answer
first" experience.
"""
from __future__ import annotations

import math
import statistics
from dataclasses import dataclass, field
from typing import Dict, List, Sequence, Any, Callable, Iterable

from .interfaces import Hit


@dataclass
class QueryCase:
    qid: str
    query: str
    gold: List[str]                       # relevant doc_ids
    query_class: str = ""                 # ground-truth class, when known
    meta: Dict[str, Any] = field(default_factory=dict)


def recall_at_k(ranked: Sequence[str], gold: Sequence[str], k: int) -> float:
    if not gold:
        return float("nan")
    g = set(gold)
    return len(g & set(ranked[:k])) / len(g)


def precision_at_k(ranked: Sequence[str], gold: Sequence[str], k: int) -> float:
    if k == 0:
        return 0.0
    return len(set(gold) & set(ranked[:k])) / k


def mrr(ranked: Sequence[str], gold: Sequence[str]) -> float:
    g = set(gold)
    for i, d in enumerate(ranked, 1):
        if d in g:
            return 1.0 / i
    return 0.0


def ndcg_at_k(ranked: Sequence[str], gold: Sequence[str], k: int) -> float:
    """Binary relevance nDCG."""
    g = set(gold)
    dcg = sum((1.0 / math.log2(i + 1)) for i, d in enumerate(ranked[:k], 1) if d in g)
    ideal = sum(1.0 / math.log2(i + 1) for i in range(1, min(len(g), k) + 1))
    return (dcg / ideal) if ideal > 0 else float("nan")


def hit_rate(ranked: Sequence[str], gold: Sequence[str], k: int) -> float:
    return 1.0 if set(gold) & set(ranked[:k]) else 0.0


def evaluate_run(results: Dict[str, List[str]], cases: Sequence[QueryCase],
                 ks: Sequence[int] = (1, 5, 10, 20)) -> Dict[str, float]:
    per: Dict[str, List[float]] = {}
    for c in cases:
        ranked = results.get(c.qid, [])
        for k in ks:
            per.setdefault(f"recall@{k}", []).append(recall_at_k(ranked, c.gold, k))
            per.setdefault(f"hit@{k}", []).append(hit_rate(ranked, c.gold, k))
        per.setdefault("ndcg@10", []).append(ndcg_at_k(ranked, c.gold, 10))
        per.setdefault("mrr", []).append(mrr(ranked, c.gold))
        per.setdefault("precision@5", []).append(precision_at_k(ranked, c.gold, 5))
    out = {}
    for k, v in per.items():
        clean = [x for x in v if not math.isnan(x)]
        out[k] = statistics.mean(clean) if clean else float("nan")
    return out


def run_configuration(pipeline, cases: Sequence[QueryCase],
                      label: str) -> Dict[str, Any]:
    """Execute every case through one pipeline configuration.

    Returns metrics plus the latency distribution and the trace aggregates that
    let the report attribute a result to a stage (how often the gate fired, how
    often the graph contributed, how the router classified).
    """
    ranked_by_q: Dict[str, List[str]] = {}
    latencies, traces = [], []
    for c in cases:
        res = pipeline.retrieve(c.query)
        # ranked_full, not hits: `hits` is cut to rerank_keep for the generator.
        ranked_by_q[c.qid] = [h.doc_id for h in (res.ranked_full or res.hits)]
        latencies.append(res.trace.stage_ms.get("total", 0.0))
        traces.append(res.trace)

    m = evaluate_run(ranked_by_q, cases)
    m["label"] = label
    m["latency_ms_mean"] = statistics.mean(latencies) if latencies else 0.0
    m["latency_ms_p50"] = statistics.median(latencies) if latencies else 0.0
    m["latency_ms_p95"] = (sorted(latencies)[int(0.95 * (len(latencies) - 1))]
                           if latencies else 0.0)
    m["early_exit_rate"] = (sum(t.early_exit for t in traces) / len(traces)
                            if traces else 0.0)
    m["rerank_rate"] = (sum(t.reranked for t in traces) / len(traces)
                        if traces else 0.0)
    m["graph_contrib_rate"] = (sum(t.n_graph_added > 0 for t in traces) / len(traces)
                               if traces else 0.0)
    m["retry_rate"] = (sum(t.retried for t in traces) / len(traces)
                       if traces else 0.0)
    m["_ranked"] = ranked_by_q
    m["_traces"] = [t.to_dict() for t in traces]
    return m


def per_class_breakdown(results: Dict[str, List[str]],
                        cases: Sequence[QueryCase], k: int = 10) -> Dict[str, Dict]:
    """Metrics split by ground-truth query class.

    This is the table that decides whether routing is justified: if every class
    responds the same way to every configuration, a single global strategy is
    the right answer and the router is unnecessary complexity.
    """
    by: Dict[str, List[QueryCase]] = {}
    for c in cases:
        by.setdefault(c.query_class or "UNKNOWN", []).append(c)
    return {cls: evaluate_run(results, cs, ks=(1, 5, k))
            for cls, cs in sorted(by.items())}
