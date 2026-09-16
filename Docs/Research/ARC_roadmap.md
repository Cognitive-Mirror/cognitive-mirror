# Build roadmap

Seven phases. Each one ships, gets measured, and has a stop rule. The stop rules
matter more than the phases: most hybrid RAG systems are over-built because
nobody defined the point at which added complexity stops earning its cost.

**Before phase 1, build the eval set.** Not after. 150-300 queries with labelled
relevant documents, tagged by query class (lexical / semantic / multi-hop /
global). Without it every phase below is guesswork, and you will not be able to
tell a regression from noise. This is the single highest-return day of work in
the whole project. Aim for 30-50 labelled queries per class, which is also
exactly what phase 3 needs for calibration.

---

## Phase 1 — BM25 + eval harness

**Build:** sparse index, the metrics harness (Recall@k, nDCG@10, MRR), CI that
fails on regression.

**Why first:** it is the cheapest thing that works, it is your regression
baseline forever, and on lexical-heavy corpora it is genuinely hard to beat. In
this project's benchmark BM25 alone got **perfect Recall@10 on lexical queries**
— better than any dense configuration, and better than the inherited-weight
hybrid.

**Target:** a number on the board for every query class.

**Stop rule:** if BM25 already clears your product bar on every class, ship it
and stop. Re-read that sentence before starting phase 2.

---

## Phase 2 — Dense retrieval + rank fusion

**Build:** embedding index, then fuse with BM25 using **weighted RRF on ranks**.

**Do not** min-max normalise scores and add them. BM25 scores are unbounded and
scale with corpus term statistics; cosine similarity is bounded in [-1, 1]. In
this benchmark rank fusion beat score fusion on Recall@10 (0.958 vs 0.920).

**Target:** beat phase 1 on semantic and multi-hop without losing lexical.

**Stop rule:** if fusion loses to BM25 alone on any class, do not proceed to
phase 4 — go to phase 3 first. That regression is a weighting problem, not a
reranking problem, and reranking will mask it rather than fix it.

---

## Phase 3 — Calibrate the fusion weights

**Build:** grid-search `(w_sparse, w_dense)` per query class on your dev split
(`calibrate.py`).

**This is the cheapest real accuracy in the entire stack, and the most commonly
skipped.** The 0.25/0.75 split circulating in tutorials is a property of someone
else's corpus and embedding model. Measured here: inherited weights scored
**0.845 nDCG@10** and dropped lexical Recall@10 to **0.729**; calibrated,
per-class weights scored **0.905 nDCG@10** and restored lexical to **1.000**.
The inherited-weight hybrid was *worse than unweighted RRF*.

**Target:** +0.03 to +0.06 nDCG@10 over phase 2 for an afternoon of labelling.

**Stop rule:** if calibration lands on the same weights for every class, you do
not need a router. Delete the routing plan and keep one global weight — you have
just saved yourself the whole of phase 7's complexity.

**Caveat found the hard way:** calibration often lands on an *endpoint*
(1.0/0.0). That maximises in-class accuracy but silently disables the phase 6
gate, which needs both arms contributing to detect consensus. Floor each weight
at ~0.15; it costs about 0.01 nDCG@10 and keeps the gate alive.

---

## Phase 4 — Reranking

**Build:** cross-encoder or listwise LLM reranker over the top 30-50 candidates,
keeping 5-10.

**Expect this to be your largest single jump.** Measured here: **+0.043
Recall@5** and **+0.037 nDCG@10** over calibrated fusion, and multi-hop
Recall@10 from 0.939 to 0.975 — and that is a *diluted* estimate, because 15% of
queries fell back to unreranked order when their LLM calls failed.

Reranking also has a second, less obvious benefit: **it absorbs routing errors.**
With a 68.8%-accurate router, a perfect router would have bought +0.016 nDCG@10
before reranking and **essentially nothing after** (0.9420 vs 0.9424). Reranking
is therefore the cheaper way to buy robustness than router engineering.

**Target:** the biggest delta on the board.

**Stop rule:** if reranking gains less than ~0.01, your first-stage recall is the
bottleneck, not ordering. Raise `k_sparse`/`k_dense` and re-measure before
touching anything else — a reranker cannot retrieve what fusion never returned.

---

## Phase 5 — Contextual chunk prefixes

**Build:** one LLM call per chunk at index time generating a 50-100 token
situating summary; prepend it before indexing into **both** the dense and the
sparse index.

The "both" is the part people get wrong. The prefix repairs implicit subjects and
pronouns, which helps BM25 as much as it helps embeddings.

**Target:** published results put this at roughly a 49% reduction in retrieval
failures, and about 67% when combined with reranking. **Not measured in this
project** — the benchmark corpus is Wikipedia paragraphs that are already
self-contained, so it is the wrong corpus to test it on. Expect a much larger
effect on internal documents full of "the system", "this release", "as above".

**Stop rule:** if your chunks are already self-contained (encyclopedia entries,
standalone product pages), skip this. It is an index-time cost per chunk and it
buys nothing on text that already names its subject.

---

## Phase 6 — Early-exit gate

**Build:** skip reranking when both retrievers independently rank the same
document first and the fused margin exceeds a threshold.

This is pure cost reduction; verify quality stays flat. **Measure the threshold
on your own fused rankings, do not copy a number.** The gate compares the
*relative* gap between the top two fused scores, `(s₁ − s₂) / s₁`. RRF gives
adjacent ranks nearly identical scores, so that ratio stays small in practice —
the largest value seen across 276 queries here was **0.141**. A threshold at or
above that ceiling disables the gate completely and silently. That is not
hypothetical: the first draft of this system used 0.35 and the gate fired on 0
of 276 queries until it was diagnosed.

Measured frontier: margin 0.03 skips **17%** of rerank calls for −0.018
Recall@5; margin 0.02 skips **31%** for −0.029.

**Target:** 15-30% of reranking cost removed for under 0.02 Recall@5.

**Stop rule:** if reranking is not a material share of your bill, skip this
phase. It adds a tuned threshold and a class of hard-to-notice quality
regressions in exchange for money you are not spending.

---

## Phase 7 — Graph expansion (conditional)

**Build:** structural edges first — citations, hyperlinks, foreign keys, org
charts. These are free, exact, and already in your data. Only fall back to
LLM-extracted entity graphs if you have no inherent structure, and prefer
deferring LLM summarization to query time to keep indexing cost near vector-RAG
cost.

Then run the graph **after** reranking, as expansion over the surviving hits —
not as the primary retrieval path. One hop, budget 3.

**Evidence it works:** link-derived edges alone recovered **42% of gold
multi-hop pairs** at zero LLM cost, and expansion lifted multi-hop Recall@8 from
0.944 to **0.964** with about one extra document in context.

**Evidence it is conditional:** at a *generous* context window (keep=20) graph
expansion fired on 67% of queries and changed the metrics **not at all**, because
recall@20 was already 0.986 — there was no headroom to recover. Graph expansion
buys back documents that a *tight* context window would have dropped. If you
pass 20 chunks to the model, you have already paid for that recall with context
tokens and the graph has nothing left to add.

**Stop rule:** measure multi-hop share of real traffic first. If relational
questions are a small fraction of queries, the graph is the most expensive way
to improve the smallest slice of your traffic. And if your context window is
generous, skip it regardless of traffic mix.

---

## Cost model

Per query, with gate firing rate `e` and graph rate `g`:

```
latency = t_route + max(t_bm25, t_dense) + t_fuse
          + (1 - e) * t_rerank + g * t_graph + t_generate

cost    = c_embed_query + (1 - e) * c_rerank(top_n)
          + c_generate(context_budget) + retry_rate * (all of the above)
```

`c_rerank` and `c_generate` dominate in an API deployment. The gate attacks the
first; `rerank_keep` attacks the second. Index-time cost is separate and is
dominated by contextualization (one call per chunk, once).

Retrieval latency itself was not the constraint in this benchmark — the full
routed cascade ran at **4.7 ms mean** over a 2,980-document flat index,
which is roughly three orders of magnitude below the LLM calls around it. At
production scale substitute HNSW and re-measure, but plan on model calls, not
retrieval, being your latency budget.

## What to watch after launch

| Signal | Why | Action |
|---|---|---|
| Per-class recall drift | Corpus or query mix moved | Re-run calibration |
| Gate firing rate change | Score distribution shifted | Re-derive threshold |
| Retry rate climbing | Rerank floor too high, or a real recall problem | Check first-stage recall |
| Graph contribution rate ~0 | Edges stale or context window too generous | Rebuild edges, or drop phase 7 |
| Router class distribution shift | New query types in traffic | Re-label a sample, retrain |
