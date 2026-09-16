# ADR-002 — Retrieval grounding for evidence review (ARC)

> **Status:** Accepted · **Date:** 2026-09-16
> **Related:** [ADR-001](ADR-001-agent-framework.md) · [Capability State Model](../Architecture/Capability_State_Model.md)
> **Source research:** [`Docs/Research/ARC_hybrid_rag_report.md`](../Research/ARC_hybrid_rag_report.md)

---

## Decision

Evidence review is grounded in **approved Capability Spine rubric clauses**
retrieved by the ARC pipeline, and every review cites the clauses it used.

The prototype in `arc_prototype/` is vendored unmodified at
`Backend/hybrid_rag/`. All Impact-specific adaptation lives in `Backend/rag/`.

---

## Why this, and why here

The v1 evidence reviewer asked an LLM to judge workplace evidence **from its own
general knowledge of what good work looks like**. That is precisely the failure
the thesis names:

> §2.9 — "Without Impact's structured capability architecture, workplace evidence
> model, manager validation workflow, KPI linkage, and governance layer, generic
> AI remains generic."

> §27 Priority 3 — "Build RAG over Impact knowledge. AI must be grounded in
> approved Impact capability structures, rubrics, program logic, and client
> context."

Grounding converts a review from *an opinion about evidence* into *an assessment
against a named, versioned, approved clause a manager can open and an auditor can
check*. That difference is the moat — not the model.

It also makes §23's evaluation question answerable from the data rather than from
a promise: **"Did the AI use only approved sources?"** is now a column.

---

## Why this corpus suits ARC better than the benchmark did

Three properties change which findings from the report transfer:

| Property | Consequence |
|---|---|
| Documents are **authored** with titles and a typed kind | The contextual prefix — the report's largest *indexing* lever — costs nothing. No LLM call per chunk. |
| The Spine has **real structure** (capability → indicator → rubric → KPI) | `add_explicit_edges` applies. The report: structural edges you already have are *"the cheapest real accuracy you will find anywhere in the stack."* 87 exact edges, no LLM graph build, no co-occurrence guessing. |
| The review prompt carries **7 passages** | This is the tight-context condition under which the report found graph expansion actually pays. At a generous window it measured *no effect at all*. |

---

## The one design change we made to ARC's shape

**Grading criteria are fetched by key, not retrieved.**

`ground_evidence_review` returns two kinds of passage:

```
anchors     capability definition + both evidence rubrics   (fetched by key)
retrieved   level indicators, KPI context, sibling clauses  (ARC)
```

This was not theoretical. In testing, with the LSA fallback embedder and no
reranker, **`CAP-DS.RUBRIC.STRONG` fell out of the top 5** — the reviewer would
have graded the submission against the *insufficient-evidence* rubric plus an
unrelated capability's clause.

Retrieval exists to find what you cannot enumerate. A capability's rubric is
enumerable: it is the approved `EVIDENCE_RUBRIC` rows for that capability.
Making the grading standard contingent on retrieval quality was a category
error, and it is now impossible by construction. `test_grading_rubric_is_always_present`
pins it.

---

## Governance properties, enforced not promised

| Property | Where enforced |
|---|---|
| Only **approved** knowledge is retrievable | `is_approved` filter in `KnowledgeIndexer`; unapproved rows never enter the index |
| One tenant's rubric never grounds another's review | `tenant_id` filter on both the anchor query and the index |
| A review cannot cite a clause it was not shown | `guardrails()` strips fabricated citations and forces human review |
| An ungrounded review cannot pass as grounded | `grounded=False` → confidence capped at 0.3, human review forced |
| A grounded review that cites nothing is flagged | confidence capped at 0.4, human review forced |
| Every review records how it was produced | `prompt_version`, `model_name`, `structured_method`, `retrieval_trace` |

---

## Structured output on NVIDIA

NIM-hosted models are less reliable at native tool-calling than Anthropic or
OpenAI. `ai/utils/structured.py` implements a fallback chain:

```
native with_structured_output  →  JSON extraction + Pydantic validation  →  deterministic fallback
```

The extractor does **brace matching, not regex** — nested objects
(`capability_signals`) defeat a greedy regex, and quoted braces defeat a naive
matcher. Eight tests cover fencing, prose wrapping, nesting, braces inside
strings, and escaped quotes.

The path taken is persisted as `structured_method`. A review that needed JSON
repair had no format guarantee, and §23 evaluation should be able to segment
quality by that.

---

## What is NOT calibrated, and why it matters

The report's single largest finding:

> "**Fitted** weights beat inherited weights decisively... the 0.25/0.75
> sparse/dense split that circulates in tutorials scored *worse than unweighted
> rank fusion* on this corpus."

**The weights shipped here are the inherited class defaults.** They were fitted
on HotpotQA, not on Impact content. Calibrating them requires what the report
says to build before anything else:

> "build the labelled evaluation set *before* the first retriever, 30-50 queries
> per class."

We do not have that, and with a 27-document corpus the numbers would not
discriminate anyway — recall@5 is near-trivially 1.0 at this size.

So `weights_calibrated: false` travels on **every retrieval trace** and appears
in the admin UI, rather than living only in this document. Same for the
early-exit gate: its threshold must be measured on real fused rankings, and the
report is explicit that an earlier draft shipped `0.35` and the gate *never fired
once*.

### What has to happen before these numbers mean anything

1. Author a real Spine with a client (hundreds of clauses, not 27).
2. Build a labelled eval set over it — 30–50 queries per class.
3. Run `hybrid_rag.calibrate` to fit per-class weights.
4. Re-measure the gate threshold on the resulting fused rankings.
5. Only then turn `weights_calibrated` true.

---

## Deployment shape

| Component | Chosen | Fallback |
|---|---|---|
| LLM | NVIDIA `build.nvidia.com` | deterministic reviewer |
| Embeddings | OpenAI `text-embedding-3-large` | local LSA (loudly degraded) |
| Reranker | Cohere `rerank-v3.5` | listwise LLM → none |
| Router | LLM router (fast model) | heuristic |
| Graph | explicit Spine edges | — |

Every one is a config change, not a code change (§26).

**Privacy note.** `EMBEDDING_PROVIDER=openai` sends employee workplace evidence
to a third party. That belongs in the DPA and works-council disclosure before a
regulated client accepts it. `EMBEDDING_PROVIDER=local` keeps it in-house at some
retrieval cost, and is a one-variable switch.

---

## Consequences

**Good.** Reviews are auditable and defensible. The knowledge corpus is a
tenant-owned proprietary asset, which is what §10 asks the Spine to be. Degraded
retrieval is visible in the product.

**Costs.** One embedding call per corpus change and one per review query; one
rerank call per review. The index is cached per tenant and rebuilt only when
approved knowledge changes.

**Accepted risk.** Rubric quality now bounds review quality. A vague rubric
produces a vague review that *looks* authoritative because it carries citations.
Rubric authoring is a product activity, not a content chore — the seeded corpus
in `scripts/seed_knowledge.py` documents the writing rules used.
