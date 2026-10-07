"""Configuration for the ARC pipeline (Adaptive Routed Cascade).

Every default here is a decision with a reason. The docstring on each field is
not decoration -- it is the audit trail behind the parameter table in the
report, and it is what you read before overriding a value for your corpus.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Dict, Literal
import json

QueryClass = Literal["LEXICAL", "SEMANTIC", "MULTIHOP", "GLOBAL"]

# Per-class fusion weights: (sparse_weight, dense_weight).
# Rationale: BM25 owns exact-token queries (identifiers, SKUs, error codes) where
# dense retrievers return semantically adjacent but wrong documents. Dense owns
# paraphrase. The 0.25/0.75 split for SEMANTIC follows the weighting used in
# Anthropic's contextual-retrieval cookbook; LEXICAL inverts it.
CLASS_WEIGHTS: Dict[str, tuple] = {
    "LEXICAL":  (0.75, 0.25),
    "SEMANTIC": (0.25, 0.75),
    "MULTIHOP": (0.35, 0.65),
    "GLOBAL":   (0.20, 0.80),
}

# Which classes are allowed to pay for graph expansion. Graph traversal costs
# seconds where HNSW costs milliseconds, so it is gated rather than global.
GRAPH_CLASSES = ("MULTIHOP", "GLOBAL")


@dataclass
class ARCConfig:
    # ---- chunking -------------------------------------------------------
    chunk_tokens: int = 400
    chunk_overlap: float = 0.15
    contextualize: bool = True
    context_tokens: int = 80
    # chunk_tokens: sub-page chunks thin out per-chunk term context and make the
    #   sparse signal noisier, degrading fusion; page-size chunks blur the
    #   embedding. 400 is the compromise.
    # contextualize: prepend a 50-100 token LLM situating summary to each chunk
    #   before BOTH embedding and BM25 indexing. Highest-leverage indexing change
    #   in the literature: ~49% fewer retrieval failures, ~67% with reranking.

    # ---- candidate generation -------------------------------------------
    k_sparse: int = 50
    k_dense: int = 50
    # Retrieve deep, rerank shallow. The reranker can only reorder within the
    # candidate set, so recall lost here is unrecoverable downstream.

    # ---- fusion ---------------------------------------------------------
    rrf_k: int = 60
    fusion: Literal["wrrf", "rrf", "score"] = "wrrf"
    # rrf_k=60 is the constant from the original Cormack et al. formulation and
    # remains the field default. Fusion is rank-based, never score-based: BM25
    # scores are unbounded while cosine sits in [-1,1], and normalising two
    # differently-shaped distributions lets outliers distort the merged ranking.

    # ---- early-exit gate (cost control) ---------------------------------
    early_exit: bool = True
    exit_margin: float = 0.03
    exit_requires_agreement: bool = True
    # Skip reranking when the fused ranking is already confident. Reranking is
    # the dominant per-query cost in an API deployment and on easy queries it
    # changes nothing. Margin = relative RRF gap between rank 1 and rank 2.
    #
    # CRITICAL SCALE NOTE. The comparison is against the RELATIVE gap between
    # the top two fused scores, (s1 - s2) / s1 -- a dimensionless ratio, not an
    # RRF score. Because RRF gives adjacent ranks nearly equal scores
    # (w/(rrf_k + rank) barely differs between rank 1 and rank 2 at rrf_k=60),
    # that ratio stays small: the largest value observed across 276 benchmark
    # queries was 0.141. A threshold near or above that ceiling disables the
    # gate entirely -- an earlier draft shipped 0.35 and the gate never fired
    # once. Do not derive this number; measure it on your own fused rankings.
    #
    # Measured frontier on this project's benchmark (rrf_k=60, floored weights):
    #   margin 0.02 -> 31% of rerank calls skipped, Recall@5 0.931 (-0.029)
    #   margin 0.03 -> 17% skipped,                 Recall@5 0.942 (-0.018)
    #   margin 0.04 ->  8% skipped,                 Recall@5 0.946 (-0.014)
    # Re-derive this if you change rrf_k, and re-measure if you change corpus.
    #
    # The gate also REQUIRES both arms to contribute: if a calibrated weight is
    # 0.0, only one list feeds the fusion, no consensus bonus can form, and the
    # margin collapses to ~0.016 regardless of threshold. Use `weight_floor`.

    weight_floor: float = 0.15
    """Minimum share each retriever keeps after calibration. Calibration often
    lands on an endpoint (1.0/0.0), which maximises in-class accuracy but
    disables both the early-exit gate and the robustness argument for always
    running both arms. Flooring costs ~0.01 nDCG@10 and buys back the gate."""

    # ---- reranking ------------------------------------------------------
    rerank_top_n: int = 50
    rerank_keep: int = 8
    rerank_score_floor: float = 0.15
    # rerank_keep=8: where context-stuffing stops paying for itself in most
    #   published ablations; raise only if answers need broad synthesis.
    # rerank_score_floor: below this top score, treat retrieval as failed and
    #   trigger one corrective re-query rather than generating on weak evidence.

    # ---- graph evidence expansion ---------------------------------------
    graph_expansion: bool = True
    graph_hops: int = 1
    graph_budget: int = 3
    graph_min_edge_weight: float = 0.0
    # The core modification: the graph is an evidence EXPANDER over reranked text
    # hits, not the primary retrieval substrate. One hop, at most 3 added docs.
    # Captures the multi-hop recall gain without paying full graph-construction
    # cost or routing easy queries through traversal.

    # ---- corrective retry -----------------------------------------------
    max_retries: int = 1
    # One retry, not a loop. Iterative retrieval has real gains but unbounded
    # latency; a single decomposition retry captures most of it.

    # ---- generation -----------------------------------------------------
    context_budget_tokens: int = 6000
    require_citations: bool = True

    weights: Dict[str, tuple] = field(default_factory=lambda: dict(CLASS_WEIGHTS))

    def to_json(self, path: str) -> None:
        with open(path, "w") as fh:
            json.dump(asdict(self), fh, indent=2)

    @classmethod
    def from_json(cls, path: str) -> "ARCConfig":
        with open(path) as fh:
            return cls(**json.load(fh))
