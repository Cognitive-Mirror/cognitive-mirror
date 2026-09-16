13-07-2026
Shashank - created new basic and generic files
Allan - created ai_context, api_contract, project_memory, system_architecture, task .mds
Allan - installed and created requirements.txt
Allan - created git_commands
Shashank - installed libraries from requirements.txt
Shashank - created updates.md
Shashank - updated git_commands.md\
---------------------------------------------------------------------------------------------
14-07-2026
Shashank - started backend with FastAPI
Mihir - created login page
Shashank - connected fastapi to login page to validate passwords

---------------------------------------------------------------------------------------------
15-07-2026
A - added role-aware learner, manager, and admin workspace dashboards
A - added learner Capability Map, Practice & Reflection, Impact Signals, and evidence submission routes
A - added manager Capability Maps, Evidence Validation, and Impact Signals routes with cohort alerts
A - added admin User Management, Insight Manager, and programme health workflows
A - added automatic frontend AI evidence briefs, validation questions, evidence quality flags, and team pattern recommendations
A - added role-specific navigation so manager navigation excludes Practice & Reflection and admin navigation contains only User Management and Insight Manager
A - added wireframe and information architecture specification in Docs/Wireframes.md
A - added persisted light/dark mode slider with localStorage preference and responsive theme styling
A - added reusable profile image dropdown with Switch Accounts, Log Out, and outside-click dismissal
A - added avatar.svg profile asset and shared ThemeControls component
A - added Capability State Model UI signals for evidence, assessment, reflection, validation, confidence, transfer, KPI linkage, outcome, improvement, stagnation, and decay risk
A - added google authorization, removing the mock auth and fixed some bugs with the chat
M-Created Docs/AI_BACKEND_WORKFLOW.md 
M-Created Backend/pyproject.toml and Backend/.env.example 
M-Created Backend/app/ folder with config.py and schemas (auth.py, evidence.py, capability.py, review.py) 
M-Created Backend/ai/ folder with config.py, schemas, prompts, prompt_registry, and utils (llm_factory.py)
M-Modified Backend/main.py to import LoginRequest schema instead of defining it inline

---------------------------------------------------------------------------------------------
06-09-2026
SCOPE - confirmed Impact AI Thesis (Internal Build Version v1.2) as the single product charter.
        The Cognitive Mirror B2C thesis is superseded; the Query-Adaptive GraphRAG build prompt
        is deferred to a possible Phase 7 component. Recorded in Docs/AI_BACKEND_WORKFLOW.md section 0.

RECOVERY - restored the Phase 1 backend (22 files, ~800 lines) that commit f30ff64
        ("Fixed the light theme bugs and overlapping") deleted during an unrelated CSS change.
        Files had been sitting at 0 bytes since then. Recovered from f30ff64^.
        Nothing that previously worked was removed - see AI_BACKEND_WORKFLOW.md section 1.1.

SECURITY - deleted Frontend/src/apis/deepseek which held a live NVIDIA API key in client-side
        code (untracked, never committed - key still needs rotating).
SECURITY - fixed an authentication bypass in Backend/app/auth.py. The old fallback decoded ID
        tokens WITHOUT verifying the signature whenever an error message contained the word
        "credentials", which the normal Firebase failure message does. A forged token was
        accepted. Now gated behind ALLOW_INSECURE_TOKEN_FALLBACK, which Settings refuses to
        honour unless ENVIRONMENT=development. Verified: forged token now returns 401.
SECURITY - removed the /login endpoint (plaintext password comparison) and the frontend
        mockAuthenticate helper. Both were dead code after Firebase sign-in landed.
SECURITY - /auth/me no longer returns the full raw token claims to the client.
SECURITY - removed 22 console.log statements that leaked user emails, uids and Firebase internals.

REPO - added node_modules/ and secret patterns to .gitignore; untracked 1851 committed
        node_modules files (tracked files 1949 -> 98). Run `npm install` after pulling.
        Files were left untouched on disk.

DOCS - Docs/AI_BACKEND_WORKFLOW.md rewritten with honest status. Phase 1 = recovered;
        Phases 2-7 = not started; no LLM call runs anywhere yet.
DOCS - Docs/Architecture/Capability_State_Model.md created (Thesis Priority 1 draft),
        with 6 open questions needing Yoganarayanan's review.

CODE - Backend/app/schemas/capability.py extended to cover all 21 Capability State Model
        signals from Thesis section 12, across 7 subject levels, with tenant isolation.
CODE - Backend/app/config.py now provider-neutral (LLM_API_KEY, not NVIDIA_API_KEY) and
        supports fast-model routing for cost control.
CODE - added firebase-admin and pyjwt to pyproject.toml (imported but undeclared);
        populated the empty requirements.txt.
CODE - added Frontend/.env.example and updated Backend/.env.example.

UI - relabelled the chat panel from "Private AI Assistant" to "Workspace messages".
        It is Firestore person-to-person chat with no AI in it. Also corrected two other
        copy strings that claimed AI review was happening, and marked the manager
        evidence brief as "Sample data".

---------------------------------------------------------------------------------------------
08-09-2026
CSM - settled all six open questions in Docs/Architecture/Capability_State_Model.md (now v0.2).
        They are answered as one system: a single currency (recency-weighted, validation-gated
        evidence points) drives level, confidence, decay and recency together.
        D1 Decay applies to CONFIDENCE, not level. attained_level is a historical fact that
           never falls on its own; current_support_level is what decayed evidence supports now.
           Divergence flags revalidation instead of downgrading someone.
        D2 Aggregates never average an ordinal scale. Headline metric is validated_coverage;
           the full distribution is always carried alongside it.
        D3 Evidence never expires; its weight decays on the same curve. Weak evidence and
           unvalidated evidence are both worth exactly zero points.
        D4 Progression needs points AND independent contexts (different context_ref, 14+ days
           apart). Three submissions from one project week are one demonstration.
        D5 Confidence formula quantified, with a HARD CEILING of 0.40 without manager
           validation. Capability state cannot become confident without a human.
        D6 required_level resolves through three layers (spine default < tenant role <
           program target), each carrying source, set_by, effective_from and rationale.
        Every constant is marked [structural] or [seeded]; section 11 says how each seeded
        value gets earned from data. These still need Yoganarayanan's review.

PHASE 3 - built the scoring engine in Backend/app/scoring/ as PURE functions (no I/O, no LLM)
        so any recalibration can be replayed against historical data before it ships.
        All tunable numbers live in constants.py under one SCORING_MODEL_VERSION.

PHASE 5 - database layer: SQLAlchemy async ORM, 8 tenant-scoped tables, Alembic baseline
        migration with a verified downgrade/upgrade round-trip. SQLite for local development
        (no infrastructure needed), PostgreSQL for production - a DATABASE_URL change only.
        Added StrEnumType and UTCDateTime column types; plain String/DateTime columns were
        returning raw strings and naive datetimes and silently breaking level arithmetic.

PHASE 2 - evidence intelligence: LangGraph pipeline triage -> review -> guardrails.
        triage screens out unreviewable submissions before any model call (cost control).
        guardrails enforces governance the model is asked for but must not be trusted on:
        causal/ROI language is detected and flagged, human review is the default, weak
        evidence cannot be high confidence.
        The graph runs WITHOUT an API key via a deterministic fallback that is capped at
        moderate strength and always routed to a human, so the workflow is testable now.

PHASE 4 - manager validation endpoint. The only path that can move attained_level.
        Learners are blocked from validating their own evidence. Manager override of the AI
        strength is recorded on every row - it is the primary calibration signal.

API - POST /evidence, GET /evidence/pending, POST /evidence/{id}/validate. tenant_id is taken
        from the verified token and never from the request body.

TESTS - 44 passing. Each one pins a decision from CSM section 9 so a constant change cannot
        silently break a governance commitment. Includes an end-to-end test of
        submit -> AI review -> manager validation -> capability state -> audit event.

ADR - Docs/Decisions/ADR-001-agent-framework.md. Use LangGraph; do not adopt a second agent
        framework; do not build agents yet. Includes the rejection reasoning for CrewAI,
        AutoGen and the OpenAI Agents SDK, and the staged migration path to Stage 3.

STILL NOT DONE - no LLM call has ever run against a live provider (no API key), every scoring
        constant is an unvalidated placeholder, and the frontend still shows hardcoded data.

---------------------------------------------------------------------------------------------
08-09-2026 (second pass)
D6 - built the three-layer requirement resolver in Backend/app/services/. required_level is
        now actually resolved (spine_default < tenant_role < program_target) instead of being
        hardcoded to competent, and every resolution carries source, set_by and rationale.
        Added User.program_ref (with migration) - layer 3 could not resolve without it.
        12 tests cover precedence, scoping, supersession, future-dating and tenant isolation.

SPINE - Backend/scripts/seed_demo.py seeds a demo tenant: 3 capabilities with decay classes
        and KPI links, 3 users, and 5 requirements spanning all three D6 layers so the
        precedence is demonstrable. Idempotent. Run with: python -m scripts.seed_demo

API - added the capabilities router: GET /capabilities, /capabilities/me,
        /capabilities/learner/{id} (manager or self only), /capabilities/team.
        The team endpoint returns coverage and the full distribution and deliberately has no
        average level field - there is a test asserting it never appears.

UI - CapabilityWorkspace now reads live state instead of hardcoded numbers. attained_level,
        current_support_level and the confidence band are rendered as three separate readings;
        a capability whose evidence has aged shows "revalidation due" with an explicit note
        that this is not a downgrade. Removed the invented panels (assessment performance,
        scenario judgement, reflection quality, improvement/stagnation) - nothing on the
        screen is displayed unless the backend actually computes it.

BUGFIX - fixed a hydration error present in all three page headers: ProfileMenu renders its own
        Link and was nested inside another Link, producing invalid nested anchors. Verified in
        the browser: document.querySelectorAll('a a').length is now 0.

TESTS - 67 passing (was 44).

NOT VERIFIED - the signed-in UI has never been seen with real data. There are no Firebase
        credentials in this environment, so only the unauthenticated path was checked in the
        browser. The seeded users also use placeholder Firebase uids and will not match a real
        sign-in yet.

---------------------------------------------------------------------------------------------
16-09-2026
RAG - integrated the ARC hybrid-retrieval prototype per thesis section 27 Priority 3. Vendored
        unmodified at Backend/hybrid_rag/ so the benchmark in Docs/Research/ stays valid; all
        Impact-specific adaptation lives in Backend/rag/. Research docs copied to Docs/Research/.

GROUNDING - evidence review no longer judges evidence from the model's own knowledge. It now
        assesses against approved Capability Spine rubric clauses and cites them. That is the
        difference between an opinion and an auditable assessment (thesis 2.9, 23).

KNOWLEDGE - new knowledge_documents table, tenant-scoped with an is_approved gate: unapproved
        text is invisible to AI by construction, not by convention. Seeded 27 authored clauses
        across 3 capabilities (definitions, 12 behavioural indicators, 6 evidence rubrics,
        3 validation guides, 3 KPI definitions). 87 explicit graph edges derived from real
        Spine structure - no LLM graph build needed.

DESIGN - grading criteria are fetched by key, not retrieved. Testing showed that with the
        fallback embedder CAP-DS.RUBRIC.STRONG dropped out of the top 5, and the reviewer would
        have graded the submission against the insufficient-evidence rubric plus an unrelated
        capability. A capability rubric is enumerable; making it contingent on retrieval
        quality was a category error. Anchors are now guaranteed present.

NVIDIA - built the JSON-repair chain for structured output: native -> brace-matched JSON
        extraction with Pydantic validation -> deterministic fallback. Brace matching rather
        than regex, because capability_signals is nested and a greedy regex truncates it.
        The path taken is persisted per review as structured_method.

GUARDRAILS - fabricated citations are stripped and flagged; ungrounded reviews are capped at
        0.3 confidence and forced to human review; a grounded review citing nothing is capped
        at 0.4 and flagged.

BUGFIX - Alembic autogenerate was emitting app.models.base.StrEnumType into migration files
        without importing it, which would have broken any fresh deployment. Added a render_item
        hook mapping the custom TypeDecorators to their underlying SQL types. The full chain
        now builds from scratch and round-trips.

API - added the knowledge router: GET /knowledge, /knowledge/status, /knowledge/search,
        /knowledge/{slug}. 14 endpoints total.

UI - learner evidence submission and manager validation are now live against the API.
        Citations are clickable through to the approved clause in a modal. Grounding status is
        a badge, so an ungrounded review is never styled like a grounded one. Retrieval health,
        including the uncalibrated-weights caveat, is visible in the product rather than only
        in a log. Manager strength is entered independently - the AI rating never pre-fills it.
        Admin health page became a knowledge explorer using the same retrieval path.

TESTS - 87 passing (was 67). New coverage: approval gate, tenant isolation of knowledge,
        anchor guarantee, fabricated-citation stripping, ungrounded capping, JSON extraction
        across fencing/prose/nesting/escaped quotes.

NOT DONE - no key is configured yet, so no LLM call has run and the NVIDIA structured-output
        path is untested against a real model. Fusion weights are inherited defaults, not
        fitted to this corpus; calibration needs a labelled evaluation set that does not exist
        yet. The signed-in UI is still unverified without Firebase credentials.
