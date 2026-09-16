# Hybrid RAG: what works, what doesn't, and the algorithm to build

The best hybrid RAG architecture is not a fixed pipeline. It is a **routed
cascade**: run both a sparse and a dense retriever on every query, fuse them on
ranks with weights *fitted to your own corpus*, rerank the survivors, and use a
graph only to expand evidence afterwards and only for the queries that need it.
On a 276-query held-out benchmark that design took Recall@5 from 0.765 (BM25
alone) to **0.960**, and nDCG@10 from 0.776 to **0.942**.

Two of those words are load-bearing and they are where most implementations go
wrong. **Fitted**: the 0.25/0.75 sparse/dense split that circulates in tutorials
scored *worse than unweighted rank fusion* on this corpus, and dropped lexical
recall from a perfect 1.000 to 0.729. **Afterwards**: graph retrieval as a
primary entry point pays multi-hop indexing and latency cost on every query to
benefit a minority of them; as a post-rerank expander it delivered the multi-hop
gain for about one extra document of context.

![ARC pipeline, with each stage's measured contribution]({{artifact:art_dbc4bd9f-706a-4fec-9aab-489fbcd2d73d}})

## What "hybrid" actually means

The term covers four orthogonal design axes, and conflating them is the main
reason teams build the wrong system:

| Sense | Combines | Wins on | Costs |
|---|---|---|---|
| Sparse + dense | BM25/SPLADE with embeddings | exact tokens plus paraphrase | one extra index |
| Vector + graph | embeddings with an entity/relation graph | multi-hop, corpus-level synthesis | LLM graph build, traversal latency |
| Retrieve + rerank | first-stage recall with a cross-encoder | precision at the top | per-query model calls |
| Adaptive / agentic | per-query strategy selection | heterogeneous query mixes | routing overhead, harder to debug |

These are not competing products to choose between. A serious system sits on all
four, and the design question is *where each one goes in the sequence* — which is
what the measurements below settle.

## The evidence landscape, and how much of it to trust

The published and vendor literature converges on a few things and is unreliable
on others. It converges on rank-based fusion: BM25 emits unbounded scores driven
by corpus term statistics while dense retrievers emit bounded cosine
similarities, so normalising and summing two differently-shaped distributions
lets outliers reorder the merged list unpredictably. It converges on reranking as
the largest single quality lever, and on contextual chunk prefixes as the largest
*indexing* lever — Anthropic reports roughly a 49% reduction in failed
retrievals from contextual embeddings plus contextual BM25, rising to about 67%
when reranking is added.

It is much less reliable on graph RAG. The most dramatic accuracy claims — 3x
improvements, 86%-versus-32% multi-hop gaps — come from vendors benchmarking
their own products on question sets they wrote. Treat those as marketing until
replicated. The credible signal is narrower and more useful: graph structure
helps *specific query shapes*, and independent comparisons find hybrid
approaches winning on factual correctness with low variability precisely because
they fall back to vector retrieval when graph context is thin and vice versa.
The cost objection has a published answer worth designing around — deferring LLM
graph summarization to query time brings graph indexing cost near vector-RAG
cost.

A 1,661-paper branch-tagged corpus assembled for this review is saved alongside
as `evidence_corpus.csv`; it spans the sparse, dense, reranking, graph, adaptive
and evaluation branches from 2019 onward.

## What I measured

**Setup.** 2,980 Wikipedia paragraphs drawn from HotpotQA's distractor split,
with 460 labelled queries in three classes: 300 multi-hop (gold = the two
labelled supporting paragraphs), 80 lexical (gold = the single paragraph
containing a distinctive quoted span, mean content-token document frequency 7.6
out of 2,980), and 80 semantic (LLM-generated paraphrase questions, filtered to
remove any sharing a 5-gram with their source). Split 40/60 into a dev set for
weight calibration and a 276-query test set for everything reported. Retrieval
is BM25 against bge-small-en-v1.5 embeddings, fused with weighted RRF
(`rrf_k=60`), reranked listwise by an LLM, expanded over a graph of 1,095
label-free link edges.

![Ablation across configurations, and per-class recall]({{artifact:art_749a248c-b3ae-4e10-8752-75da244f3107}})

**Every retriever fails a different query class, and that is the whole argument
for routing.** BM25 got lexical Recall@10 of 1.000 and multi-hop 0.878. The dense
retriever inverted it exactly: multi-hop 0.939, lexical **0.667**. No single
retriever and no single fixed blend is good at both.

**Fitted weights beat inherited weights decisively.** Grid-searching
`(w_sparse, w_dense)` per class on the dev split moved nDCG@10 from 0.845 to
**0.905** and restored lexical recall to 1.000. The calibration landed at the
grid *endpoints* — pure BM25 for lexical, pure dense for multi-hop — which means
that on this corpus the value of "hybrid" is almost entirely in **choosing the
right retriever per query**, not in blending them. Semantic queries were the
exception, optimal at 50/50.

**Reranking is the largest single gain and it absorbs routing error.** Adding
the listwise reranker took Recall@5 from 0.917 to **0.960** and multi-hop
Recall@10 from 0.939 to 0.975. That is a conservative estimate: 15% of queries
lost their LLM call to a token ceiling and fell back to unreranked order,
diluting the measured effect. Separately, the heuristic router was only **68.8%**
accurate, yet an oracle router bought just +0.016 nDCG@10 before reranking and
**nothing at all after it** (0.9420 vs 0.9424).

The router's error profile is worth stating precisely rather than waving at,
because it is not uniformly harmless. Of 86 misroutes, 49 (57%) sat on the
semantic/multi-hop boundary where both classes prefer the dense arm — those cost
little. But **30 multi-hop queries (17% of all multi-hop) were routed LEXICAL**,
which is the maximally damaging direction: LEXICAL is weighted to pure BM25 and
multi-hop wants pure dense, so those queries got the exactly wrong retriever.
Semantic queries fared worst of all in classification terms, with only 3 of 48
labelled correctly (most were absorbed into MULTIHOP).

That a 68.8%-accurate router with a 17% catastrophic-misroute rate still lands
within 0.0004 nDCG@10 of an oracle *after reranking* is the actual finding: the
reranker is what makes the router's errors survivable. Buy robustness there, not
in router engineering — but do not mistake that for the router being accurate.

## Where my own modifications landed

![Gate cost/quality frontier, and graph expansion at a tight context window]({{artifact:art_9a6c40d0-ccc6-4180-835a-5f0d709f97c7}})

**The early-exit gate works, but the threshold is not transferable.** The gate
skips reranking when both retrievers independently rank the same document first
and the fused margin is wide. My initial threshold of 0.35 fired on **zero of
276 queries** — because the test is on the *relative* gap between the top two
fused scores, and RRF gives adjacent ranks nearly equal scores, so that ratio
never exceeded 0.141 across the whole test set. Once re-measured,
the frontier is clean: a margin of 0.03 skips **17%** of rerank calls for −0.018
Recall@5, and 0.02 skips **31%** for −0.029. A second interaction is worth
knowing: endpoint-calibrated weights disable the gate entirely, because a weight
of 0.0 means only one list feeds the fusion and no consensus bonus can form.
Flooring each weight at 0.15 costs about 0.01 nDCG@10 and buys the gate back.

**Graph expansion is genuinely conditional.** Link-derived edges — computed with
no LLM and no access to the labels — recovered **42% of gold multi-hop pairs**.
At a tight context window (5 reranked documents) expansion lifted multi-hop
Recall@8 from 0.944 to **0.964** for about one extra document. But at a generous
window (20 documents) it fired on 67% of queries and changed the metrics *not at
all* — Recall@20 was already 0.986, so there was nothing left to recover. Graph
expansion buys back documents a tight context window would have dropped. If you
are already passing twenty chunks to the model, you have paid for that recall in
context tokens and the graph has nothing to add.

That is the most useful negative result here, and it cuts against how graph RAG
is usually sold: the question is not whether your corpus has relational structure
but whether your context budget is tight enough for the structure to matter.

## Honest limitations

Retrieval latency was never the constraint — the full cascade ran at 4.7 ms mean
over a flat 2,980-document index, three orders of magnitude below the model calls
around it. That also means these latency numbers say nothing about production
scale; substitute HNSW and re-measure.

The corpus is Wikipedia, which is the wrong place to test contextual chunk
prefixes: those paragraphs already name their subjects, so the technique's main
benefit cannot show up. It is in the implementation and in the roadmap on the
strength of the published evidence, not because I reproduced it.

Reranking used an LLM rather than a trained cross-encoder, and 15% of calls
failed. Absolute numbers would differ with Cohere or Voyage reranking; the
*ordering* of the stages is what I would expect to transfer.

Finally, the cloud provider adapters — OpenAI and Voyage embeddings, Cohere
reranking — are written against their documented APIs but **were never executed**,
because no such credentials exist in this workspace. Everything measured ran on
the local path. Smoke-test those adapters against your own keys before trusting
them.

## What to build

The full algorithm with numbered pseudocode, a parameter table giving every
default and the symptom when it is wrong, and a failure-mode table is in
`algorithm_spec.md`. The phased build order — seven phases, each with entry
criteria, an expected delta and an explicit **stop rule** for when added
complexity has stopped earning its cost — is in `roadmap.md`.

If you read only one thing from the roadmap, read the instruction that precedes
phase 1: build the labelled evaluation set *before* the first retriever, 30-50
queries per class. Every result in this report exists because that set existed.
Without it, the weight calibration that produced the single largest
accuracy-per-effort gain here is not possible, the gate threshold cannot be
derived, and a regression is indistinguishable from noise.
