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

Working: authentication (Firebase + FastAPI token verification), role-based UI,
workspace messaging, AI scaffolding (prompt registry, output schemas, LLM factory).

Not yet built: database persistence, any live LLM call, evidence review,
capability state updates, evaluation harness. Dashboard figures are sample data.
See [`Docs/AI_BACKEND_WORKFLOW.md`](Docs/AI_BACKEND_WORKFLOW.md) §11 for the honest status.