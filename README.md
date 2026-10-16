# Cognitive Mirror

Capability intelligence platform. It answers one question:

> Did investment in capability-building create measurable, validated, workplace
> capability movement linked to business outcomes?

The learner journey it supports:

```
pre-assessment → interactive e-learn → post-assessment → apply at work
   (knows)          (knows)              (knows)          (does: evidence → manager validation)
```

What a learner **knows** and what they have **shown at work** are tracked as two
separate readings. Only manager-validated workplace evidence moves a capability
level ([ADR-003](Docs/Decisions/ADR-003-learning-signals.md)).

## Getting started

```bash
npm install                          # root dev runner
npm --prefix Frontend install        # frontend
pip install -r requirements.txt      # backend

cp Backend/.env.example Backend/.env           # then fill in
cp Frontend/.env.example Frontend/.env.local   # then fill in

cd Backend
python -m alembic upgrade head       # create the database
python -m scripts.seed_demo          # capabilities, users, requirements
python -m scripts.seed_knowledge     # approved rubric corpus for retrieval
python -m scripts.seed_learning      # e-learns and pre/post assessments
cd ..

npm run dev                          # backend :8100 + frontend :3000
```

Both `.env` files are gitignored. **Never put an LLM key under `Frontend/`** —
`NEXT_PUBLIC_*` values ship to the browser. Model calls are server-side only.

Demo sign-in accounts (learner, manager, admin) are listed on the sign-in screen.
They must exist in Firebase Auth; on first sign-in each is linked by email to its
seeded `users` row, which is where its role comes from.

## Client demo

With `ENVIRONMENT=development` (the default), demo mode is on. On boot the
backend seeds a separate tenant, **Apex Systems Engineering** (`apex-demo`), so
nothing here touches real data:

```bash
cd Backend && python -m alembic upgrade head && cd ..
npm run dev                          # backend :8100 + frontend :3000, no Firebase needed
```

A floating toolbar (bottom right, every page) switches persona in one click and
resets the demo tenant (~0.4 s). Personas and what each shows:

| Persona | Shows |
|---|---|
| **Priya Nair** (learner) | Evidence pending with Dev. Validate it: novice → developing, confidence 0.00 → ~0.85 |
| **Arjun Mehta** (learner) | 100% on every assessment, no workplace evidence: novice, confidence 0.00. Knowing is not doing |
| **Elena Rostova** (learner) | Three validated items in three independent contexts: competent, confidence 0.88 (high) |
| **Marcus Vance** (learner) | Validated competent 14 months ago, 25% on last week's post-assessment: level stands, revalidation due |
| **Dev Malhotra** (manager) | Validation queue, team coverage, per-person audit trails |
| **Sarah Chen** (admin) | Retrieval debugger and the approved rubric & capability matrix |

Every number is the Capability State Model's own output: the seed replays each
person's history through the production services at historical timestamps
(`Backend/app/demo_seed.py`).

**AI during a demo.** The live model is always tried first. For the canonical
"Fill realistic sample" texts and seeded evidence only, a failed or slow (8 s)
call falls back to a pre-computed evaluation in `Backend/ai/demo_cache.py`,
which passes through the same quote and citation verifiers as live output. It is
labelled *Verified AI Evaluation · pre-computed*, and stored with
`model_name=demo-cache:golden-v1`, so the audit trail can always tell it from a
live call. Anything typed live goes to the model or the honest fallback.
Before a call, run the toolbar's AI check (or `GET /api/demo/ai-status?probe=true`).

Endpoints: `POST /api/demo/reset`, `GET /api/demo/personas`,
`GET /api/demo/samples`, `GET /api/demo/ai-status`. All return 404 when demo mode
is off. `python -m app.demo_seed` (from `Backend/`) resets from the command line.

## Repository layout

```
Backend/
  main.py                 FastAPI app, /health, /auth/me
  app/
    auth.py               token verification, current_user, role checks
    config.py             settings (the only reader of the environment)
    models/               SQLAlchemy tables
    routers/              evidence, capabilities, knowledge, learning
    schemas/              shared enumerations
    scoring/              Capability State Model: pure scoring functions
    services/             requirement resolution, learning journey
  ai/                     LLM factory, prompts, prompt registry, evidence-review graph
  rag/                    retrieval over approved knowledge (wraps hybrid_rag/)
  hybrid_rag/             ARC retrieval pipeline, vendored unmodified
  migrations/             Alembic
  scripts/                seed data
  tests/                  pytest suite
Frontend/src/
  app/                    routes: /, /learner/*, /manager/*, /admin
  components/             AppShell (navigation), dashboards, evidence, learning
  services/               API client, Firebase sign-in, session
Docs/
  Architecture/           Capability State Model specification
  Decisions/              ADRs
  Research/               ARC retrieval research
```

## Development

```bash
cd Backend && python -m pytest       # backend tests (hermetic: no network)
cd Backend && python -m ruff check . # backend lint
npm --prefix Frontend run lint       # frontend lint
npm --prefix Frontend run build      # frontend production build
```

## Reference

*Impact AI Thesis — Internal Build Version v1.2* is a reference rather than a
specification. Where client direction differs, client direction wins and the
decision is recorded in `Docs/Decisions/`. Honest build status lives in
[`Docs/AI_BACKEND_WORKFLOW.md`](Docs/AI_BACKEND_WORKFLOW.md) §1.

## Team

Developers: Shashank, Allan, Mihir · Research lead: Yoganarayanan · Documentation lead: Nainika
