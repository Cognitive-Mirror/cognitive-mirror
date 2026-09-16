# ARC: Adaptive Routed Cascade

A specification for hybrid retrieval-augmented generation, written to be built
from rather than read about. Every parameter has a default, a justification, and
a note on what breaks if you move it.

## 1. What "hybrid" has to mean

The word is used for at least four different things, and conflating them is the
main reason teams build the wrong system:

| Sense | Combines | Wins on | Costs |
|---|---|---|---|
| Sparse + dense | BM25/SPLADE with embeddings | lexical robustness plus paraphrase tolerance | one extra index |
| Vector + graph | embeddings with an entity/relation graph | multi-hop, corpus-level synthesis | LLM graph construction, traversal latency |
| Retrieve + rerank | first-stage recall with a cross-encoder | precision at the top of the list | per-query model calls |
| Adaptive / agentic | per-query strategy selection | heterogeneous query mixes | routing overhead, harder to debug |

These are **orthogonal axes, not competing products**. A system can and should
sit on all four. ARC does, and the ordering between them is the actual design
content: each axis is placed where its benefit is largest and its cost is
smallest.

## 2. The three claims ARC is built on

**Claim 1 — fuse on ranks, never on scores.** BM25 emits unbounded scores whose
scale depends on corpus term statistics; a dense retriever emits bounded cosine
similarities. The distributions have different shapes, so min-max normalising
and weighted-summing them lets a single outlier in either list reorder the merged
ranking in a way that does not hold across queries. Reciprocal rank fusion
discards magnitude and keeps only the ordering each retriever is reliable about.

**Claim 2 — the graph is an expander, not a retriever.** Published graph-RAG
designs build an LLM-extracted graph over the whole corpus at index time and
enter retrieval *through* it. That is where both the indexing bill and the
per-query latency come from, and it is paid on every query whether or not the
question is relational. Graph traversal on a large graph runs in seconds where
HNSW runs in milliseconds. ARC enters through text retrieval and runs one graph
hop *afterwards*, over the handful of documents that already survived reranking.

**Claim 3 — fusion weights are fitted, not inherited.** The widely circulated
0.25/0.75 sparse/dense split is a property of someone else's corpus and someone
else's embedding model. On a corpus whose questions name their entities
explicitly, BM25 is the stronger arm and tilting toward dense destroys accuracy.
This is not a hypothetical: it is what this project's own benchmark showed, and
it is why `calibrate.py` exists.

## 3. Algorithm

```
ARC(query q, index I, graph G, config C) -> (ranked documents, context, trace)

 0  ROUTE
 1      cls, use_graph <- Router(q)              # LEXICAL|SEMANTIC|MULTIHOP|GLOBAL
 2      w_s, w_d       <- C.weights[cls]         # fitted, not assumed

 3  GENERATE                                      # both arms ALWAYS run
 4      S <- BM25(q, k = C.k_sparse)              # ranks only
 5      D <- Dense(q, k = C.k_dense)              # ranks only

 6  FUSE
 7      F <- WeightedRRF([(S, w_s), (D, w_d)], k = C.rrf_k)
 8          score(d) = SUM_i  w_i / (C.rrf_k + rank_i(d))

 9  GATE                                          # cost control
10      margin <- (F[1].score - F[2].score) / F[1].score
11      agree  <- (S[1].id == D[1].id)
12      if C.early_exit AND margin >= C.exit_margin AND agree:
13          R <- F ; skip to 20

14  RERANK
15      R <- Rerank(q, F[1 .. C.rerank_top_n])

16  EXPAND                                        # class-gated
17      K <- R[1 .. C.rerank_keep]
18      if C.graph_expansion AND use_graph:
19          K <- K + G.expand(seeds = K, hops = 1, budget = C.graph_budget)

20  VERIFY
21      if R[1].score < C.rerank_score_floor AND retries < C.max_retries:
22          return ARC(broaden(q), I, G, C)       # ONE retry, not a loop

23  ASSEMBLE
24      return K, pack(K, C.context_budget_tokens), trace
```

Note what line 3 does **not** do: it never disables a retriever based on the
class. Misclassification is the router's dominant failure mode, so a wrong class
should shift weights and skip a graph hop, never remove an arm entirely. The
blast radius of a routing error is bounded by construction.

## 4. Parameters

| Parameter | Default | Why this value | Symptom if wrong |
|---|---|---|---|
| `chunk_tokens` | 400 | Sub-page chunks thin the per-chunk term context and make the sparse signal noisy; page-size chunks blur the embedding | Too small: lexical recall drops. Too large: reranker can't discriminate |
| `chunk_overlap` | 0.15 | A fact spanning a boundary survives in at least one chunk | Facts at boundaries become unretrievable |
| `contextualize` | on | Highest-leverage indexing change available; the prefix goes into **both** indexes, repairing implicit subjects for lexical matching too | Pronoun-heavy chunks retrieve poorly |
| `k_sparse`, `k_dense` | 50, 50 | Retrieve deep, rerank shallow — the reranker only reorders within the pool, so recall lost here is unrecoverable | Ceiling on final accuracy no reranker can lift |
| `rrf_k` | 60 | Original RRF formulation; damps deep ranks so rank 1 vs 2 matters more than 40 vs 41 | Too low: tail noise promoted. Too high: fusion flattens toward ties |
| `weights` | **fit it** | See Claim 3. Defaults are a starting point, not an answer | Silent accuracy loss, the hardest failure to notice |
| `exit_margin` | 0.03 | Skips reranking where both arms already agree. Compared against the **relative** gap `(s₁ − s₂) / s₁` between the top two fused scores. Because RRF assigns adjacent ranks nearly equal scores (`w/(rrf_k + rank)` differs little between rank 1 and 2 at `rrf_k=60`), that ratio stays small in practice: the largest value observed over 276 queries was **0.141**, so a threshold near or above ~0.15 disables the gate. Measured: 0.03 → gate fires on 16.7% of queries; 0.15 → 0.7%. Re-measure if you change `rrf_k` | Too low: quality loss on ambiguous queries. Too high: no savings, and past the observed ceiling the gate never fires at all |
| `rerank_top_n` | 50 | Matches candidate depth | Truncating below `k` wastes first-stage recall |
| `rerank_keep` | 8 | Where context-stuffing stops paying in most published ablations | Too many: attention dilution and cost |
| `rerank_score_floor` | 0.15 | Below this, generate-anyway produces confident wrong answers | Too high: retry storms |
| `graph_hops` | 1 | Two hops explodes the neighbourhood and dilutes precision | 2+ hops: unrelated documents in context |
| `graph_budget` | 3 | Enough to add the bridge document, not enough to flood | Too high: graph noise crowds out reranked hits |
| `max_retries` | 1 | Iterative retrieval helps but has unbounded latency | Loops on adversarial queries |

## 5. Cost and latency

Per query, with the gate firing at rate `e` and graph expansion at rate `g`:

```
latency  =  t_route + max(t_bm25, t_dense) + t_fuse
            + (1 - e) * t_rerank
            + g * t_graph
            + t_generate

cost     =  c_embed_query
            + (1 - e) * c_rerank(rerank_top_n)
            + c_generate(context_budget)
            + retry_rate * (everything above)
```

The two terms that dominate in an API deployment are `c_rerank` and
`c_generate`. The gate attacks the first directly; `rerank_keep` attacks the
second. Indexing cost is separate and is dominated by contextualization — one
LLM call per chunk, one time, and worth it.

## 6. Where this departs from published designs

**Graph after rerank, not before retrieval.** Keeps the multi-hop recall gain
while avoiding whole-corpus LLM graph construction and per-query traversal on
queries that don't need it. Related in spirit to deferring graph summarization
to query time, which brings graph indexing cost near vector-RAG cost.
*Risk:* if the correct bridge document ranks outside `rerank_top_n`, no amount of
expansion recovers it — expansion cannot fix first-stage recall failure.

**Early-exit gate.** Reranking is the dominant per-query cost and changes nothing
on queries where both retrievers already agree on the answer.
*Risk:* the gate is a heuristic on a score margin, and margin is not calibrated
probability. Tune `exit_margin` on your own dev set; audit skipped queries.

**Class-conditional fusion weights.** A single global alpha is a compromise
between query types that want opposite things.
*Risk:* adds a router, and router errors propagate. Mitigated by never dropping a
retriever (§3) and by failing closed to the heuristic router.

**Label-free structural edges preferred over LLM triple extraction.** Citations,
hyperlinks, foreign keys and org charts are free, exact, and already in your
data. In this project's benchmark, link-derived edges alone recovered 42% of the
gold multi-hop pairs at zero LLM cost.
*Risk:* corpora with no inherent structure fall back to co-occurrence edges,
which are much weaker.

## 7. Failure modes

| Failure | Cause | Mitigation |
|---|---|---|
| Confident wrong answer | Generation on weak evidence | `rerank_score_floor` + explicit "not in sources" instruction |
| Graph noise in context | Hub nodes, over-wide traversal | `graph_budget`, 1 hop, df-capped edge construction |
| Router misclassification | Ambiguous phrasing | Both arms always run; fail closed to heuristic |
| Fusion weight drift | Corpus or embedding model changed | Re-run `calibrate.py` on model or corpus change |
| Index staleness | Graph and embeddings built once | Version the index; rebuild edges incrementally |
| Reranker truncation | Passage longer than reranker context | Clip at rerank time, keep full text for generation |
| Retry storm | Floor set too high | Hard cap `max_retries = 1` |

## 8. Build order

Each phase ships and is measured before the next begins. If a phase does not
beat the previous one on *your* eval set, stop and keep the previous one — that
is the stop rule, and it is the most important line in this document.

1. **BM25 + eval harness.** No embeddings yet. This is your baseline and your
   regression test. A surprising number of corpora never need more.
2. **Add dense + RRF.** Measure. Fuse on ranks.
3. **Calibrate weights** on 30-50 labelled queries per class. Cheapest real
   accuracy in the stack.
4. **Add reranking.** Usually the single largest jump.
5. **Add contextual chunk prefixes.** Re-index. Measure both arms.
6. **Add the early-exit gate.** Pure cost reduction; verify quality is flat.
7. **Add structural graph edges** if your corpus has them, and the router to
   gate them. Only now, and only if multi-hop queries are a real share of
   traffic.
