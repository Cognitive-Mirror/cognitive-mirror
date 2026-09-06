# Cognitive Mirror — AI Backend Workflow

> Master workflow document for the AI intelligence layer.
> Every engineering task must reference this file.
> **Product charter: Impact AI Thesis — Internal Build Version v1.2.**
> Last updated: 2026-09-06

---

## 0. Scope decision (2026-09-06)

The project follows **one** thesis: *Impact AI Thesis — Internal Build Version
v1.2* (the enterprise capability execution intelligence layer).

Two earlier directions are **out of scope** and must not drive build decisions:

| Document | Status |
|---|---|
| `Impact - AI Thesis - Internal.docx` (v1.2) | ✅ **The charter.** All work traces to this. |
| `The Cognitive Mirror.pdf` (B2C cognitive-modelling EdTech) | ⛔ Superseded. Name retained; product direction dropped. |
| `Master Build Prompt — Query-Adaptive Evidence GraphRAG.md` | 🔵 Deferred. Possible future component for Phase 7 RAG — not a separate product. |

---

## 1. Current Status

Assessed 2026-09-06 against the actual contents of the repository.

| Layer | Status | Detail |
|-------|--------|--------|
| Frontend UI | ✅ Functional | Next.js 16, role routing, dashboards, theming. Production build passes. |
| Frontend data | ❌ Mock | Every capability/evidence figure is hardcoded in components. Nothing reads the backend. |
| Auth | ✅ Functional | Firebase Auth + Google sign-in; FastAPI verifies the ID token at `/auth/me`. |
| Backend API | 🟡 Foundation | `main.py`, config, auth, schemas. No domain routers yet. |
| Messaging | ✅ Functional | Firestore person-to-person chat. **Not AI** — see §9. |
| Database | ❌ Missing | No ORM, no models, no migrations. All state is ephemeral. |
| AI Layer | 🟡 Scaffold only | Prompts, output schemas and registry exist. **No LLM call is wired to any endpoint.** No graphs, no services. |
| Capability State Model | 🟡 Draft | Schema in code + spec in `Docs/Architecture/Capability_State_Model.md`. Not persisted. |
| Evaluation | ❌ Missing | No eval harness. AI output quality is unmeasured. |
| DevOps | ❌ Missing | No Docker, no CI. |
| Documentation | 🟡 Partial | This file + CSM spec + Wireframes. `AI_context.md`, `API_contract.md`, `System_architecture.md`, `Task.md`, `Project_memory.md` are still empty. |

### 1.1 Incident: Phase 1 was deleted and recovered

Commit `4145922` added the full Phase 1 backend. Commit `f30ff64`
("Fixed the light theme bugs and overlapping") then **deleted all 22 backend
files** while making unrelated CSS changes — almost certainly a bad merge. Every
file survived on disk as 0 bytes, so the loss was invisible in the file tree.

Recovered on 2026-09-06 from `f30ff64^`. This is why `node_modules/` was also
untracked in the same change: dependency churn in git was a contributing factor
to the merge conflicts.

**Prevention:** run `git diff --stat` before committing, and never commit a
frontend fix that touches `Backend/`.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   FRONTEND (Next.js)                │
│          Login · Dashboards · Evidence UI           │
└──────────────────────┬──────────────────────────────┘
                       │ REST API
┌──────────────────────▼──────────────────────────────┐
│                 BACKEND (FastAPI)                    │
│   Routers · Services · Middleware · Auth · CORS     │
└──────┬───────────────┬──────────────┬───────────────┘
       │               │              │
┌──────▼──────┐ ┌──────▼──────┐ ┌─────▼──────┐
│  Database   │ │  AI Layer   │ │  Storage   │
│ PostgreSQL  │ │  LangGraph  │ │  Files/S3  │
│ SQLAlchemy  │ │  LangChain  │ │            │
│ Alembic     │ │  Prompts    │ │            │
└─────────────┘ └──────┬──────┘ └────────────┘
                       │
              ┌────────▼────────┐
              │  LLM Provider   │
              │ build.nvidia.com│
              │ (Model Agnostic)│
              └─────────────────┘
```

---

## 3. Core Product Loop

```
Business Goal
    ↓
Business KPI
    ↓
Required Capability
    ↓
Capability Gap Analysis
    ↓
Capability Path
    ↓
Learning + Scenario Practice
    ↓
Workplace Application
    ↓
Evidence Upload
    ↓
AI Evidence Review          ← Graph 1
    ↓
Manager Validation          ← Graph 3
    ↓
Capability State Update     ← Graph 2
    ↓
Intervention Recommendation ← Graph 4
    ↓
Business KPI Review
    ↓
ROI Signal
```

---

## 4. Target Folder Structure

```
Backend/
├── main.py                      # FastAPI entry point (EXISTS)
├── pyproject.toml               # Dependencies
├── alembic.ini                  # Migrations config
├── .env.example                 # Environment template
│
├── app/
│   ├── __init__.py
│   ├── config.py                # Settings (Pydantic BaseSettings)
│   ├── database.py              # SQLAlchemy engine + session
│   │
│   ├── models/                  # SQLAlchemy ORM models
│   │   ├── __init__.py
│   │   ├── user.py
│   │   ├── capability.py
│   │   ├── evidence.py
│   │   └── review.py
│   │
│   ├── schemas/                 # Pydantic request/response schemas
│   │   ├── __init__.py
│   │   ├── auth.py
│   │   ├── capability.py
│   │   ├── evidence.py
│   │   └── review.py
│   │
│   ├── routers/                 # FastAPI route handlers
│   │   ├── __init__.py
│   │   ├── auth.py
│   │   ├── capabilities.py
│   │   ├── evidence.py
│   │   └── reviews.py
│   │
│   ├── services/                # Business logic layer
│   │   ├── __init__.py
│   │   ├── auth_service.py
│   │   ├── capability_service.py
│   │   ├── evidence_service.py
│   │   └── review_service.py
│   │
│   └── middleware/
│       └── __init__.py
│
├── ai/
│   ├── __init__.py
│   ├── config.py                # AI-specific settings
│   │
│   ├── prompts/                 # Prompt templates (Jinja2/str)
│   │   ├── __init__.py
│   │   ├── evidence_review.py
│   │   ├── capability_update.py
│   │   ├── manager_summary.py
│   │   └── recommendation.py
│   │
│   ├── prompt_registry/         # Prompt metadata + versioning
│   │   ├── __init__.py
│   │   └── registry.py
│   │
│   ├── schemas/                 # AI-specific Pydantic outputs
│   │   ├── __init__.py
│   │   ├── evidence_review.py
│   │   ├── capability_update.py
│   │   ├── manager_summary.py
│   │   └── recommendation.py
│   │
│   ├── graphs/                  # LangGraph state machines
│   │   ├── __init__.py
│   │   ├── evidence_review.py
│   │   └── capability_update.py
│   │
│   ├── state/                   # LangGraph state definitions
│   │   ├── __init__.py
│   │   └── evidence_state.py
│   │
│   ├── chains/                  # LangChain reusable chains
│   │   └── __init__.py
│   │
│   ├── services/                # AI orchestration services
│   │   ├── __init__.py
│   │   ├── evidence_intelligence.py
│   │   └── capability_engine.py
│   │
│   ├── evaluation/              # AI testing + eval
│   │   ├── __init__.py
│   │   └── test_evidence_review.py
│   │
│   └── utils/                   # AI helper utilities
│       ├── __init__.py
│       ├── llm_factory.py       # Model-agnostic LLM instantiation
│       └── output_parser.py
│
├── migrations/                  # Alembic migrations
│   └── versions/
│
└── tests/
    ├── __init__.py
    └── test_auth.py
```

> **Rule**: Add folders only when justified by implementation need.
> Phase 1 creates only the foundation subset.

---

## 5. Completed Modules

| Module | File | Status |
|--------|------|--------|
| FastAPI app init + CORS from config | `Backend/main.py` | ✅ |
| Health endpoint | `Backend/main.py` | ✅ |
| Settings (Pydantic) | `Backend/app/config.py` | ✅ |
| Firebase token verification | `Backend/app/auth.py` | ✅ |
| Capability State Model schemas | `Backend/app/schemas/capability.py` | ✅ draft |
| Evidence / review schemas | `Backend/app/schemas/{evidence,review}.py` | ✅ |
| AI output schemas | `Backend/ai/schemas/*.py` | ✅ |
| Prompt templates | `Backend/ai/prompts/*.py` | ✅ |
| Prompt registry + metadata | `Backend/ai/prompt_registry/registry.py` | ✅ |
| Model-agnostic LLM factory | `Backend/ai/utils/llm_factory.py` | ✅ untested against a live provider |
| Frontend login UI | `Frontend/src/components/LoginExperience.tsx` | ✅ |
| Role-based routing | `Frontend/src/app/[role]/page.tsx` | ✅ |
| Workspace messaging | `Frontend/src/services/chatService.ts` | ✅ |

**Removed 2026-09-06:** the `/login` endpoint and `mockAuthenticate` helper.
They compared plaintext passwords server-side and were unreachable once Firebase
sign-in landed.

---

## 6. Pending Modules

### Phase 1 — AI Foundation
| # | Module | Priority | Depends On |
|---|--------|----------|------------|
| 1.1 | `pyproject.toml` + dependency lock | 🔴 Critical | — |
| 1.2 | `.env.example` + `app/config.py` | 🔴 Critical | — |
| 1.3 | Backend package structure (`app/`) | 🔴 Critical | — |
| 1.4 | Pydantic schemas (`app/schemas/`) | 🔴 Critical | 1.3 |
| 1.5 | AI config (`ai/config.py`) | 🔴 Critical | 1.2 |
| 1.6 | LLM factory (`ai/utils/llm_factory.py`) | 🔴 Critical | 1.5 |
| 1.7 | Prompt registry (`ai/prompt_registry/`) | 🟡 High | 1.3 |
| 1.8 | Prompt templates (`ai/prompts/`) | 🟡 High | 1.7 |
| 1.9 | AI output schemas (`ai/schemas/`) | 🟡 High | 1.4 |

### Phase 2 — Evidence Intelligence
| # | Module | Priority | Depends On |
|---|--------|----------|------------|
| 2.1 | Evidence review AI schema | 🔴 Critical | 1.9 |
| 2.2 | Evidence review prompt | 🔴 Critical | 1.8 |
| 2.3 | Evidence review LangGraph state | 🟡 High | 2.1 |
| 2.4 | Evidence review graph | 🟡 High | 2.2, 2.3 |
| 2.5 | Evidence intelligence service | 🟡 High | 2.4 |
| 2.6 | Evidence API router | 🟢 Medium | 2.5 |

### Phase 3 — Capability Engine
| # | Module | Priority | Depends On |
|---|--------|----------|------------|
| 3.1 | Capability Pydantic models | 🔴 Critical | 1.9 |
| 3.2 | Capability state machine | 🟡 High | 3.1 |
| 3.3 | Capability update prompt | 🟡 High | 1.8 |
| 3.4 | Capability update graph | 🟢 Medium | 3.2, 3.3 |
| 3.5 | Capability service | 🟢 Medium | 3.4 |
| 3.6 | Capability API router | 🟢 Medium | 3.5 |

### Phase 4 — Manager Validation
| # | Module | Priority | Depends On |
|---|--------|----------|------------|
| 4.1 | Manager summary AI schema | 🟡 High | 1.9 |
| 4.2 | Manager validation graph | 🟢 Medium | 4.1 |
| 4.3 | Validation API router | 🟢 Medium | 4.2 |

### Phase 5 — Database
| # | Module | Priority | Depends On |
|---|--------|----------|------------|
| 5.1 | SQLAlchemy setup (`app/database.py`) | 🔴 Critical | 1.2 |
| 5.2 | User model | 🔴 Critical | 5.1 |
| 5.3 | Evidence model | 🟡 High | 5.1 |
| 5.4 | Capability model | 🟡 High | 5.1 |
| 5.5 | Review model | 🟢 Medium | 5.1 |
| 5.6 | Alembic init + first migration | 🟢 Medium | 5.2–5.5 |

### Phase 6 — Evaluation & Testing
| # | Module | Priority | Depends On |
|---|--------|----------|------------|
| 6.1 | Evidence review eval tests | 🟢 Medium | 2.4 |
| 6.2 | Capability update eval tests | 🟢 Medium | 3.4 |
| 6.3 | Hallucination test suite | 🟢 Medium | 6.1 |

### Phase 7 — RAG & Knowledge Graph (Future)
| # | Module | Priority | Depends On |
|---|--------|----------|------------|
| 7.1 | Qdrant integration | 🔵 Future | Phase 2 |
| 7.2 | Neo4j capability graph | 🔵 Future | Phase 3 |
| 7.3 | Hybrid search | 🔵 Future | 7.1 |

---

## 7. Dependency Graph

```
pyproject.toml ──→ .env + config ──→ app/ package structure
                                          │
                        ┌─────────────────┼─────────────────┐
                        ▼                 ▼                 ▼
                   app/schemas/      ai/config.py      app/database.py
                        │                 │                 │
                        ▼                 ▼                 ▼
                   ai/schemas/      ai/utils/          ORM models
                        │          llm_factory.py          │
                        ▼                 │                 ▼
                  ai/prompts/ ◄───────────┘            Alembic
                  ai/prompt_registry/
                        │
                        ▼
                  ai/graphs/
                  (evidence_review → capability_update → manager_validation)
                        │
                        ▼
                  ai/services/
                        │
                        ▼
                  app/routers/
```

---

## 8. Risk List

| Risk | Impact | Mitigation |
|------|--------|------------|
| No `pyproject.toml` — dependency chaos | 🔴 High | Create in Phase 1.1 before any code |
| No database — all data is ephemeral | 🔴 High | PostgreSQL + SQLAlchemy in Phase 5 |
| Hardcoded auth — security liability | 🟡 Medium | Replace with proper auth service |
| No `.env` — secrets in code risk | 🔴 High | `.env.example` + Pydantic Settings |
| LLM provider lock-in | 🟡 Medium | Model-agnostic factory pattern |
| No eval framework — AI quality unknown | 🟡 Medium | Eval tests in Phase 6 |
| Empty docs — onboarding friction | 🟢 Low | Populate as modules are built |

---

## 9. AI Constraints (from Charter)

- AI **never** makes decisions — it supports human judgment
- Managers remain the **final validators**
- Every AI output must be **structured JSON** (Pydantic)
- Every AI output must carry **confidence scores**
- Every AI output must be **auditable**
- AI must be **model-agnostic** (swap providers without code changes)
- Prompts are **never hardcoded** in business logic
- Capability ≠ Knowledge; Completion ≠ Capability
- Human-in-the-loop is **mandatory** for state changes
- **No feature may be labelled "AI" in the UI unless a model actually runs.**
  Thesis Risk 1 is "it becomes a chatbot"; overclaiming in the interface is the
  first step toward that. The Firestore chat panel is *workspace messaging*, not
  an assistant. Mock screens must carry a "Sample data" marker.
- **API keys are server-side only.** No LLM key may appear anywhere under
  `Frontend/`. `NEXT_PUBLIC_*` values ship to the browser and are public.

---

## 10. Implementation Principles

1. **Extend, never rewrite** — existing `main.py` stays; we add routers to it
2. **Folder on demand** — create directories only when implementing a module
3. **Schema first** — define Pydantic models before writing any service
4. **Prompt registry** — every prompt is registered with metadata before use
5. **Graph per workflow** — one LangGraph per business workflow, no mega-graphs
6. **Test per graph** — every graph gets at least one evaluation test
7. **Config over code** — all tunable values in config, never hardcoded

---

## 11. Progress Checklist

- [x] Repository analysis
- [x] Charter analysis — Impact AI Thesis v1.2 confirmed as the single charter
- [x] Architecture design
- [x] Workflow document (this file)
- [x] Implementation plan approval
- [x] Phase 1 — AI Foundation *(built, wiped by `f30ff64`, recovered 2026-09-06)*
- [x] Capability State Model schema — **draft** (`Docs/Architecture/Capability_State_Model.md`)
- [ ] Phase 2 — Evidence Intelligence · **not started**
- [ ] Phase 3 — Capability Engine · **not started**
- [ ] Phase 4 — Manager Validation · **not started**
- [ ] Phase 5 — Database Layer · **not started** — blocks everything above
- [ ] Phase 6 — Evaluation · **not started**
- [ ] Phase 7 — RAG & Knowledge Graph · **not started**

### 11.1 Honest summary

Against the Impact thesis, roughly **10–15%** is built: authentication, a UI
prototype, and the AI *scaffolding* (schemas, prompts, registry, factory).

The thesis's stated critical path — Capability State Model → structured data
layer → one grounded AI workflow → evaluation (§27 Priorities 1, 2, 4, 5) — is
**one of four** done, and that one is a draft with no persistence.

**No LLM call runs anywhere in this codebase today.** The `llm_factory` has
never been exercised against a live provider.

### 11.2 The next slice (do this before anything else)

One vertical slice, one tenant, real persistence:

1. Settle the open questions in `Docs/Architecture/Capability_State_Model.md` §9.
2. Phase 5 first — SQLAlchemy models + Alembic migration for the CSM. Without a
   database, nothing else can be real.
3. Make learner evidence submission write to that database.
4. Wire **one** LLM call: `evidence_review` (prompt and output schema already exist).
5. Manager validation screen consumes that structured output and records a decision.
6. Capability state updates from the validated decision; dashboards read real values.
7. 5–10 evaluation cases for step 4: hallucination, weak-evidence over-rating,
   ROI overclaiming.

Everything else in Phases 2–7 waits.

---

## 12. Future Improvements

- WebSocket real-time review status
- Multi-tenant isolation (tenant_id on all models)
- Role-based AI prompt variations
- OCR pipeline (PaddleOCR) for evidence documents
- Streaming LLM responses to frontend
- Neo4j capability relationship graph
- Qdrant vector search for evidence similarity
- CI/CD pipeline with AI eval gates
- LangSmith observability integration

---

> **This document is the single source of truth for AI backend engineering.**
> Update it as modules are implemented.
> Every PR should reference the relevant section.
