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
