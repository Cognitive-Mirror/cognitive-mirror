# Cognitive Mirror

> AI-powered Capability Intelligence Platform

## Vision

Cognitive Mirror is an AI-assisted capability intelligence platform designed to validate real-world learning through evidence, reflection, and human-in-the-loop evaluation.

The single question the product answers:

> Did investment in capability-building create measurable, validated, workplace
> capability movement linked to business outcomes?

**Product charter:** *Impact AI Thesis — Internal Build Version v1.2*.
All build decisions trace to it. See [`Docs/AI_BACKEND_WORKFLOW.md`](Docs/AI_BACKEND_WORKFLOW.md) §0
for what is explicitly out of scope, and
[`Docs/Architecture/Capability_State_Model.md`](Docs/Architecture/Capability_State_Model.md)
for the core data model.

## Getting started

```bash
npm install                          # root tooling
npm --prefix Frontend install        # frontend deps
pip install -r requirements.txt      # backend deps

cp Backend/.env.example Backend/.env         # then fill in
cp Frontend/.env.example Frontend/.env.local # then fill in

cd Backend && python -m alembic upgrade head   # create the database
python -m scripts.seed_demo                    # capabilities, users, requirements
python -m scripts.seed_knowledge               # approved rubric corpus for RAG
cd ..

npm run dev                          # backend :8000 + frontend :3000
```

Both `.env` files are gitignored. **Never put an LLM API key in `Frontend/`** —
`NEXT_PUBLIC_*` variables ship to the browser. Model calls are server-side only.

## Tech Stack

- Frontend: Next.js + React + TypeScript + Tailwind CSS
- Backend: FastAPI (Python)
- AI Workflow: LangGraph + LangChain
- LLM Provider: build.nvidia.com
- Database: PostgreSQL
- Vector Database: Qdrant
- Graph Database: Neo4j

## Team

Developers:
Shashank 
Allan
Mihir

Research Lead:
Yoganarayanan

Documentation Lead:
Nainika

## Status

🚧 In Development — foundation stage.

Working: authentication, role-based UI reading live capability state, the full
evidence loop (submit -> AI review -> manager validation -> capability state ->
audit event), the Capability State Model scoring engine, D6 requirement
resolution, database + migrations, workspace messaging.

Working also: retrieval grounding — evidence review is assessed against approved
Capability Spine rubric clauses and cites them (ARC, vendored at
`Backend/hybrid_rag/`; see [ADR-002](Docs/Decisions/ADR-002-retrieval-grounding.md)).

Not yet built: any live LLM call (no API key, so review uses a deterministic
fallback), evaluation harness for model output. Scoring constants and retrieval
fusion weights are seeded placeholders, not calibrated against data.
See [`Docs/AI_BACKEND_WORKFLOW.md`](Docs/AI_BACKEND_WORKFLOW.md) §11 for the honest status.