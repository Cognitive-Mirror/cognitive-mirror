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
