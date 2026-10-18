# AI pipeline report

What the AI in Cognitive Mirror does, which models it uses, and what happens
when no model is reachable. Paths are relative to `Backend/`.

## Status: integrated, but no live model is connected yet

The pipeline is fully built and wired into the product. **No model API key is
configured** in this environment: there is no `Backend/.env`, and
`GET /api/demo/ai-status?probe=true` reports `key_configured: false`.

So today:

- **Demo tenant, on the canonical demo inputs:** results come from a verified
  cache of 17 pre-computed AI outputs (13 evidence reviews, 4 open answers).
  They run through the same guardrails and are labelled
  "Verified AI Evaluation · pre-computed".
- **Anything else** (new text, real tenants): evidence gets a deterministic,
  rule-based fallback review, labelled "AI offline · manager review". Open
  answers wait for a human marker.

To go live, add one key to `Backend/.env`, for example `NVIDIA_API_KEY=…` or
`GROQ_API_KEY=…`. The UI then labels results "Live AI evaluation".

## Models

| Setting | Default | Where |
|---|---|---|
| Main model (evidence review, open-answer marking) | `z-ai/glm-5.3` | `app/config.py:44` |
| Fast model (query routing, LLM reranking) | `z-ai/glm-5.3-flash` | `app/config.py:52` |
| Temperature | 0.1 | `app/config.py:165` |
| Request timeout | 120 s; 8 s on demo inputs | `app/config.py:58, 89` |

**Provider resolution** (`ai/config.py:80-124`):

1. If `LLM_API_KEY` is set, it is used as configured.
2. Otherwise the first key found wins, in this order:

| Key | Endpoint | Main model | Fast model |
|---|---|---|---|
| `NVIDIA_API_KEY` | NVIDIA NIM | GLM-5.3 | GLM-5.3-flash |
| `GROQ_API_KEY` | Groq | `llama-3.3-70b-versatile` | `llama-3.1-8b-instant` |
| `GEMINI_API_KEY` | Gemini | `gemini-2.5-flash` | `gemini-2.5-flash` |
| `OPENAI_API_KEY` | OpenAI | `gpt-4.1-mini` | `gpt-4.1-mini` |

Calls are made through LangChain chat models. The evidence pipeline is a
LangGraph graph (`ai/utils/llm_factory.py`, `ai/graphs/evidence_review.py`).

**Watch out:** `.env.example` pins `LLM_MODEL_NAME`/`LLM_MODEL_NAME_FAST` to
GLM names. Copying it unchanged with a Groq or Gemini key overrides that
provider's preset models.

## Pipeline 1: workplace evidence review (`POST /evidence`)

```
submission
  → retrieve the approved rubric (hybrid RAG, below)
  → triage   (rules: < 120 chars → canned WEAK result, no model call)
  → review   (LLM, structured output, rubric-only prompt v2.2.0)
  → guardrails (code, always)
  → saved with provenance → capability state recomputed (math)
```

**What the model returns:** summary, strength (weak, moderate, strong or
exceptional), confidence, concerns, recommendation, cited rubric clauses, and
1–4 verbatim quotes.

**Guardrails, enforced in code whatever the model says**
(`ai/graphs/evidence_review.py:236-348`):

- Citations to clauses that were not retrieved are deleted, and human review
  is forced.
- Each quote must exist **verbatim** in the submission. Quotes that don't are
  dropped. The server then finds the exact characters to highlight.
- Causal or ROI language ("increased revenue by…") forces human review.
- Confidence caps:
  - 0.3 if no rubric was found
  - 0.4 if the review cites nothing
  - 0.5 at most for WEAK evidence
  - 0.0 for the fallback
- Human review can be waived only at confidence ≥ 0.85 with no concerns.

**The AI never sets a level.** Only a manager validation can move a level
(`ai/services/evidence_intelligence.py:14, 455`; `POST /evidence/{id}/validate`).
The AI's strength does feed two numbers indirectly:

- **Provisional points**, shown as "awaiting validation".
- **Confidence:** each AI-raised concern lowers the state confidence by 0.15,
  with total penalties capped at 0.40.

## Pipeline 2: open-answer marking (`POST /learning/activities/{id}/attempts`)

Runs in a background task after the response is sent; the UI polls for the
result.

1. The model checks each **key point** and must back each "met" verdict with
   a verbatim quote from the answer. It never outputs a score
   (`ai/prompts/free_response.py`).
2. Code verifies every quote. **Credit = verified key points ÷ total key
   points.** That is arithmetic, not model output
   (`ai/services/free_response_scoring.py:68-92`).
3. If the key points don't fit the answer, or no model is reachable, the item
   stays pending and goes to the manager's review queue.
4. The mark only ever affects the **knows** reading, never the level.

## Retrieval: hybrid RAG over the approved rubric

**Corpus.** Only approved `KnowledgeDocument` rows for the tenant: the 27
clauses of definitions, indicators, rubrics, guidance and KPIs. Unapproved
text is invisible to the AI (`rag/knowledge_index.py:164`). The index lives in
memory and rebuilds when approved documents change.

**Anchors.** The capability's rubric and definition are always included,
fetched by key rather than searched (`rag/retrieval.py:95-138`).

**Search** (vendored ARC pipeline, `hybrid_rag/`). Up to 7 passages in total:

1. **Route** the query: lexical, semantic, multi-hop or global. This uses the
   fast LLM if one is configured, otherwise regex rules.
2. **BM25 and vector search** run in parallel, top 50 each.
3. **Weighted rank fusion** (RRF, k=60). The weights depend on the route, e.g.
   semantic is 0.25 BM25 / 0.75 vector.
4. **Rerank.** The chain is Jina, then Cohere, then a listwise LLM reranker.
   This step is skipped when both searches agree on a clear winner.
5. **Graph expansion**, one hop over explicit links (same capability, same
   KPI). This is used only for multi-hop and global queries.
6. **Corrective retry** with a broader query if the best score is weak.

**Embeddings.** The default is Jina `jina-embeddings-v4`, which needs
`JINA_API_KEY`. **With no key** it falls back to LSA (TF-IDF + SVD), computed
locally. That is the current state, so the index is marked "degraded" in
Admin.

## What is math, not AI

`app/scoring/` is pure functions with no model involved:

- levels and points
- evidence decay (half-life by capability type)
- confidence and its 0.40 ceiling before manager validation
- revalidation flags
- team coverage, as medians and distributions (never averages)
- all deterministic quiz scoring

## Provenance shown in the UI

| Label | Meaning |
|---|---|
| Live AI evaluation | A real model call succeeded |
| Verified AI Evaluation · pre-computed | Golden demo cache, used only in the demo tenant after a live call fails |
| AI offline · manager review | Deterministic fallback; a human decides |

## Known gap

`rag/retrieval.py:175` builds the index outside the error handler. If a hosted
embedding provider fails *during an index rebuild*, `POST /evidence` returns a
500 instead of falling back to anchors. This is filed as a separate fix.
