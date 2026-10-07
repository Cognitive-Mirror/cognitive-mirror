"""ARC -- Adaptive Routed Cascade.

The full retrieval algorithm, in the order it executes:

  0. ROUTE       classify query -> LEXICAL | SEMANTIC | MULTIHOP | GLOBAL
  1. GENERATE    BM25 top-k_s and dense top-k_d, always both, in parallel
  2. FUSE        weighted RRF with per-class weights (rank-based, not score)
  3. GATE        if the fused head is confident, exit early and skip reranking
  4. RERANK      listwise/cross-encoder rerank of the candidate pool
  5. EXPAND      graph 1-hop expansion over reranked survivors, gated by class
  6. VERIFY      if top score is below the floor, one corrective re-query
  7. ASSEMBLE    dedupe, budget, order for the generator

VERIFY precedes ASSEMBLE because the corrective retry returns early -- there is
no point packing a context window we are about to discard.

Three deliberate departures from the published designs:

* Graph as expander, not retriever (step 5 after step 4, not before step 1).
  Keeps the multi-hop recall gain; drops the whole-corpus LLM graph build and
  the per-query traversal latency on queries that do not need it.
* Early-exit gate (step 3). Reranking dominates per-query cost in an API
  deployment and is wasted on queries where both retrievers already agree.
* Class-conditional fusion weights (step 2) rather than one global alpha. A
  single alpha is a compromise between query types that want opposite things.

Every stage records into `Trace`, so the ablation harness can attribute a win
or a regression to a specific stage rather than to the pipeline as a whole.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Any, Optional, Sequence

from .config import ARCConfig
from .interfaces import Doc, Hit, Embedder, Reranker, Generator
from .sparse import BM25Index
from .dense import DenseIndex
from .graph import EvidenceGraph
from .router import HeuristicRouter, Route
from . import fusion as fz


@dataclass
class Trace:
    query: str = ""
    query_class: str = ""
    route_confidence: float = 0.0
    route_features: Dict[str, Any] = field(default_factory=dict)
    n_sparse: int = 0
    n_dense: int = 0
    n_fused: int = 0
    early_exit: bool = False
    exit_signal: Dict[str, Any] = field(default_factory=dict)
    reranked: bool = False
    n_graph_added: int = 0
    graph_added_ids: List[str] = field(default_factory=list)
    retried: bool = False
    top_score: float = 0.0
    stage_ms: Dict[str, float] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class ARCResult:
    query: str
    hits: List[Hit]              # what the generator actually sees (kept + graph)
    docs: List[Doc]
    context: str
    answer: Optional[str]
    trace: Trace
    ranked_full: List[Hit] = field(default_factory=list)
    """The complete ranking before the `rerank_keep` cut. Retrieval metrics at
    k > rerank_keep must be computed from this, not from `hits` -- otherwise
    recall@10 and recall@20 both silently collapse to recall@rerank_keep."""


class ARCPipeline:
    def __init__(self, config: ARCConfig | None = None,
                 embedder: Embedder | None = None,
                 reranker: Reranker | None = None,
                 generator: Generator | None = None,
                 router=None, graph: EvidenceGraph | None = None):
        self.cfg = config or ARCConfig()
        self.bm25 = BM25Index()
        self.dense = DenseIndex(embedder) if embedder is not None else None
        self.reranker = reranker
        self.generator = generator
        self.router = router or HeuristicRouter()
        self.graph = graph or EvidenceGraph()
        self.docs: Dict[str, Doc] = {}

    # ---- indexing -------------------------------------------------------
    def index(self, docs: Sequence[Doc]) -> "ARCPipeline":
        for d in docs:
            self.docs[d.doc_id] = d
        self.bm25.add(docs)
        if self.dense is not None:
            self.dense.add(docs)
        return self

    # ---- retrieval ------------------------------------------------------
    def retrieve(self, query: str, route: Route | None = None,
                 _depth: int = 0) -> ARCResult:
        cfg, tr = self.cfg, Trace(query=query)
        t0 = time.perf_counter()

        # -- 0. ROUTE
        route = route or self.router.classify(query)
        tr.query_class = route.query_class
        tr.route_confidence = route.confidence
        tr.route_features = route.features
        w_sparse, w_dense = cfg.weights.get(route.query_class, (0.5, 0.5))
        tr.stage_ms["route"] = (time.perf_counter() - t0) * 1e3

        # -- 1. GENERATE (both arms always run; the class only reweights them)
        t = time.perf_counter()
        sparse_hits = self.bm25.search(query, k=cfg.k_sparse)
        tr.stage_ms["sparse"] = (time.perf_counter() - t) * 1e3

        t = time.perf_counter()
        dense_hits = self.dense.search(query, k=cfg.k_dense) if self.dense else []
        tr.stage_ms["dense"] = (time.perf_counter() - t) * 1e3
        tr.n_sparse, tr.n_dense = len(sparse_hits), len(dense_hits)

        # -- 2. FUSE
        t = time.perf_counter()
        pairs = [(sparse_hits, w_sparse), (dense_hits, w_dense)]
        if cfg.fusion == "score":
            fused = fz.score_fusion(pairs, top=cfg.rerank_top_n)
        elif cfg.fusion == "rrf":
            fused = fz.plain_rrf([sparse_hits, dense_hits], k=cfg.rrf_k,
                                 top=cfg.rerank_top_n)
        else:
            fused = fz.weighted_rrf(pairs, k=cfg.rrf_k, top=cfg.rerank_top_n)
        tr.n_fused = len(fused)
        tr.stage_ms["fuse"] = (time.perf_counter() - t) * 1e3

        # -- 3. GATE
        ranked = fused
        if cfg.early_exit and self.reranker is not None:
            ok, sig = fz.exit_signal(fused, sparse_hits, dense_hits,
                                     cfg.exit_margin, cfg.exit_requires_agreement)
            tr.early_exit, tr.exit_signal = ok, sig
        else:
            tr.exit_signal = {"reason": "gate_disabled_or_no_reranker"}

        # -- 4. RERANK
        if self.reranker is not None and not tr.early_exit:
            t = time.perf_counter()
            pool = [self.docs[h.doc_id] for h in fused[:cfg.rerank_top_n]
                    if h.doc_id in self.docs]
            if pool:
                scored = self.reranker.rerank(query, pool)
                ranked = [Hit(doc_id=d, score=s, source="rerank", rank=i + 1)
                          for i, (d, s) in enumerate(scored)]
                tr.reranked = True
            tr.stage_ms["rerank"] = (time.perf_counter() - t) * 1e3

        kept = ranked[:cfg.rerank_keep]

        # -- 5. EXPAND (graph, class-gated)
        if cfg.graph_expansion and route.use_graph and self.graph.n_edges:
            t = time.perf_counter()
            seeds = [h.doc_id for h in kept]
            seed_scores = {h.doc_id: max(h.score, 1e-6) for h in kept}
            extra = self.graph.expand(seeds, budget=cfg.graph_budget,
                                      hops=cfg.graph_hops,
                                      min_weight=cfg.graph_min_edge_weight,
                                      seed_scores=seed_scores)
            extra = [h for h in extra if h.doc_id in self.docs]
            kept = kept + extra
            tr.n_graph_added = len(extra)
            tr.graph_added_ids = [h.doc_id for h in extra]
            tr.stage_ms["graph"] = (time.perf_counter() - t) * 1e3

        tr.top_score = float(kept[0].score) if kept else 0.0

        # -- 6. VERIFY / corrective re-query
        if (self.reranker is not None and tr.reranked
                and tr.top_score < cfg.rerank_score_floor
                and _depth < cfg.max_retries):
            broadened = self._broaden(query)
            if broadened and broadened != query:
                retry = self.retrieve(broadened, route=route, _depth=_depth + 1)
                retry.trace.retried = True
                retry.trace.stage_ms["total"] = (time.perf_counter() - t0) * 1e3
                return retry

        # -- 7. ASSEMBLE
        docs = [self.docs[h.doc_id] for h in kept if h.doc_id in self.docs]
        context = self._assemble(docs)
        tr.stage_ms["total"] = (time.perf_counter() - t0) * 1e3

        # Full ranking = the kept head (with any graph additions) followed by the
        # rest of the ranking, deduped. Lets metrics probe deeper than rerank_keep.
        seen = {h.doc_id for h in kept}
        tail = [h for h in ranked if h.doc_id not in seen]
        return ARCResult(query, kept, docs, context, None, tr,
                         ranked_full=list(kept) + tail)

    # ---- generation -----------------------------------------------------
    def answer(self, query: str) -> ARCResult:
        res = self.retrieve(query)
        if self.generator is None:
            return res
        cite = ("Cite the source id in square brackets after every claim. "
                if self.cfg.require_citations else "")
        prompt = (f"{res.context}\n\nQuestion: {query}\n\n"
                  f"Answer using only the sources above. {cite}"
                  "If the sources do not contain the answer, say so explicitly.")
        res.answer = self.generator.generate(
            prompt, system="You are a precise retrieval-grounded assistant.")
        return res

    # ---- helpers --------------------------------------------------------
    def _assemble(self, docs: Sequence[Doc]) -> str:
        """Pack under the token budget. Approximates 4 chars/token -- replace
        with a real tokenizer when the budget is tight enough to matter."""
        budget, out, used = self.cfg.context_budget_tokens, [], 0
        for d in docs:
            body = d.indexed_text
            cost = len(body) // 4
            if used + cost > budget:
                continue
            out.append(f"[{d.doc_id}] {body}")
            used += cost
        return "\n\n".join(out)

    def _broaden(self, query: str) -> str:
        """Cheap deterministic broadening for the single corrective retry: drop
        interrogative scaffolding and keep content terms. A decomposition model
        does better; this keeps the retry free and dependency-light."""
        import re
        q = re.sub(r"^(what|which|who|when|where|why|how)\s+(is|are|was|were|do|does|did)\s+",
                   "", query.strip(), flags=re.I)
        return re.sub(r"[?]", "", q).strip()
