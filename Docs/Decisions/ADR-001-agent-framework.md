# ADR-001 — What to build agents with

> **Status:** Accepted · **Date:** 2026-09-06
> **Context owner:** AI team
> **Supersedes:** nothing · **Related:** `Docs/Architecture/Capability_State_Model.md`

---

## The short answer

**Use LangGraph. Do not adopt a second agent framework. And do not build agents
yet.**

LangGraph is already a dependency and Phase 2 is built on it. The evidence
review pipeline shipped in `Backend/ai/graphs/evidence_review.py` is a
LangGraph state machine with no autonomy — which is exactly what Stage 1 calls
for.

---

## Why "not yet" is part of the answer

The thesis is explicit (§21, Stage 3):

> "Agentic AI should come only after the platform has enough structured data,
> workflows, validation rules, and guardrails."

Today the platform has: one workflow, zero production evidence records, a
scoring model whose constants are admittedly unvalidated (`CSM §11`), and no
evaluation harness. Adding an agent now would mean an autonomous component
making decisions on top of numbers we have not yet earned. That is Risk 1
("it becomes a chatbot") arriving through the back door.

The correct sequence is: get real evidence flowing → calibrate the constants →
build the eval harness → *then* widen decision boundaries.

---

## Why LangGraph over the alternatives

The thesis makes governance the selection criterion, not developer ergonomics.
§21 Stage 3 requires every agent to have a defined purpose, defined inputs and
outputs, a **decision boundary**, an **escalation rule**, a **human approval
rule**, an **audit trail**, a tenant boundary and a role access rule.

That list is a specification for a state machine with checkpoints, not for a
conversational agent loop.

| Option | Verdict | Reasoning |
|---|---|---|
| **LangGraph** | **Chosen** | Explicit graph of nodes and edges, so the decision boundary is the graph topology — reviewable in code review. Native `interrupt_before` maps directly onto manager validation. Checkpointers give a durable execution trace, which is the audit trail. Model-agnostic through LangChain, satisfying §26. |
| CrewAI | Rejected | Its abstraction is roles and tasks delegating to each other. Control flow emerges from agent conversation, so the decision boundary cannot be stated up front — which is precisely what §21 requires. |
| AutoGen / AG2 | Rejected | Conversation-centric multi-agent chat. Powerful for open-ended research, poor for a bounded, auditable enterprise workflow. Hard to answer "what could this agent have done?" |
| OpenAI Agents SDK | Rejected | Couples the orchestration layer to one vendor. §26 is explicit: "Impact should not become dependent on one AI vendor." |
| Bare LangChain (LCEL) | Insufficient alone | Fine for a single chain — and the evidence review chain does use it — but has no checkpointing, no interrupt, no durable state for multi-step human-in-the-loop flows. |
| No framework | Rejected | Writing our own graph runner, checkpointer and interrupt machinery is real work with no differentiation. The moat is the Capability State Model, not an orchestrator. |

---

## What we are actually building right now

Not agents. **Deterministic pipelines that call a model at one step.**

```
triage  ->  review (LLM, structured output)  ->  guardrails  ->  human
```

Properties worth keeping as the system grows:

- **Linear.** No loops, no tool selection, no agent choosing its next step.
- **Structured output only.** Pydantic-typed, never free text.
- **Guardrails outside the model.** The prompt asks for the right behaviour;
  `guardrails()` enforces it. Instruction is not enforcement.
- **Degrades without a provider.** With no key the graph takes a deterministic
  fallback that is capped at moderate strength and always routed to a human, so
  the workflow is testable before a key exists.
- **Cheapest token is the one never sent.** `triage` screens out unreviewable
  submissions before any model call (Risk 6).

---

## The migration path to Stage 3

The graphs written now become agents later without a rewrite, by widening one
thing at a time:

| Step | Change | Gate before starting |
|---|---|---|
| 1 | Add a checkpointer (`AsyncSqliteSaver`, then Postgres) | none — do this when the first multi-step flow lands |
| 2 | Add `interrupt_before=["apply_state_change"]` so manager validation is a graph interrupt rather than a separate API call | manager validation flow is stable |
| 3 | Give a node read-only tools (retrieve Spine entries, fetch cohort stats) | RAG layer exists (Phase 7) |
| 4 | Allow a node to choose between bounded actions | evaluation harness exists and passes |
| 5 | Multiple coordinated agents from the §21 list | calibrated constants + audit review |

Each step widens the decision boundary by one notch, and each one should be
recorded as its own ADR with what it is now allowed to decide.

---

## Two constraints that outlive this decision

1. **An agent may never write capability state.** `attained_level` moves only
   through `ManagerValidation` (Update Rule 1). Whatever orchestration we adopt,
   the write path stays behind a human.
2. **Every model output is stored with its prompt version and model name.**
   `EvidenceReview` already does this. Without it, an agent's output cannot be
   audited or replayed, and §23 evaluation becomes impossible.

---

## Practical notes

- LangGraph is already in `Backend/pyproject.toml`; no new dependency needed.
- Checkpointing needs `langgraph-checkpoint-sqlite` (dev) or
  `langgraph-checkpoint-postgres` (prod). Not installed yet — add at step 1.
- Keep graphs one-per-workflow. §21 lists twelve candidate agents; that is
  twelve small graphs, not one large one.
