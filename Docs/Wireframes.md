# Cognitive Mirror Role Wireframes & User Flows

> **Superseded (2026-10-07).** This describes the July 2026 mock UI. Several screens
> here (capability map, impact signals, practice, user management, insight manager,
> chat) were removed because they displayed invented data. The shipped routes and
> navigation are defined in `Frontend/src/components/AppShell.tsx`.

This specification defines the information architecture, wireframes, conditional interactions, and role-specific data flows for the learner, manager, and admin experiences.

## Global shell

Every authenticated page uses the same shell:

```text
┌──────────────────────────────────────────────────────────────┐
│ Cognitive Mirror                         Search   Profile ▾   │
├────────────────┬─────────────────────────────────────────────┤
│ Role navigation │ Page title                                 │
│                 │ Context, filters, and primary action        │
│                 │ Main workspace                              │
└────────────────┴─────────────────────────────────────────────┘
```

The profile hover card is available on every authenticated page and contains the user's name, assigned role, programme, and signed-in state. Role permissions determine which navigation tree and data scope are available.

## Learner interface

### Navigation

```text
Learner
├── Overview
├── Capability Map
├── Practice & Reflection
└── Impact Signals
```

The learner's mental model is personal growth: where am I improving, what should I practise, and is the capability transferring into work?

### Overview

```text
┌─────────────────────────────────────────────────────────────┐
│ Your capability state                         Submit evidence │
├──────────────┬──────────────┬──────────────┬────────────────┤
│ Required     │ Demonstrated │ Evidence     │ KPI linkage    │
│ capability   │ capability   │ strength     │                │
├──────────────┴──────────────┴──────────────┴────────────────┤
│ Capability state summary                                    │
│ Strategic decision making       ███████░░░ 74               │
│ Stakeholder influence           ████████░░ 81               │
│ Data storytelling               █████░░░░░ 59  At risk       │
├───────────────────────────────┬─────────────────────────────┤
│ Confidence calibration         │ Recommended next action     │
│ Confidence vs competence       │ Complete scenario practice  │
└───────────────────────────────┴─────────────────────────────┘
```

Conditional behaviour:

- `At risk` appears when demonstrated capability is below the required role benchmark.
- A confidence-gap warning appears when confidence exceeds demonstrated competence by a configured threshold.
- Recommended next action is generated from the weakest current signal.
- `Submit evidence` remains visible because evidence is the primary path for updating capability state.

### Capability Map

```text
┌─────────────────────────────────────────────────────────────┐
│ Capability Map                                  Time range ▾ │
├─────────────────────────────┬───────────────────────────────┤
│ Radar / heat-map visual      │ Selected capability             │
│                             │ Required: 75                   │
│ Strong areas: blue           │ Demonstrated: 59               │
│ Weak areas: amber/red        │ Evidence strength: Weak         │
│                             │ Decay risk: Medium              │
├─────────────────────────────┴───────────────────────────────┤
│ Weakest topics and recommended practice                       │
│ 1. Data storytelling                                          │
│    Practice: turn analysis into a 3-minute decision brief      │
│    [Go to Practice & Reflection]                              │
└─────────────────────────────────────────────────────────────┘
```

Data flow:

1. The map reads required capability, demonstrated capability, assessments, evidence, confidence, and decay risk.
2. Selecting a capability updates the detail panel.
3. The recommendation link opens Practice & Reflection with the capability preselected.
4. If evidence is absent, the state is labelled `Insufficient evidence`, not `Low capability`.

### Practice & Reflection

```text
┌─────────────────────────────────────────────────────────────┐
│ Practice & Reflection                         Capability: Data │
├───────────────────────┬─────────────────────────────────────┤
│ Practice activity      │ Reflection workspace                 │
│ Scenario prompt        │ What did you notice?                 │
│ [Start activity]       │ [text area]                          │
│ Difficulty: Moderate   │ What would you do differently?      │
│ Estimated time: 10m    │ [text area]                          │
│                        │ [Save reflection] [Submit evidence]  │
└───────────────────────┴─────────────────────────────────────┘
```

Practice completion updates scenario judgement and application frequency. Saving a reflection updates reflection quality. Submitting workplace evidence sends the item to the manager's Evidence Validation queue. Each captured signal recalculates the Capability State Model.

### Impact Signals

```text
┌─────────────────────────────────────────────────────────────┐
│ Impact Signals                         Period ▾   Benchmark ▾ │
├─────────────────────────────┬────────────────────────────────┤
│ Progress over time           │ Learner vs benchmark            │
│ score                       │ Learner       ───────── 74      │
│ 90 ┤                   ╭──  │ Peer benchmark ─────── 68      │
│ 70 ┤             ╭─────╯    │ Organisation   ─────── 71      │
│ 50 ┤──────╭──────╯          │ Outcome signal: +12% quality   │
└─────────────────────────────┴────────────────────────────────┘
```

Benchmark choices are peer cohort, organisation, role benchmark, or previous period. The learner sees interpretation and action, but not private information about individual peers.

## Manager interface

### Navigation

Exactly four options are exposed:

```text
Manager
├── Overview
├── Capability Maps
├── Evidence Validation
└── Impact Signals
```

Practice & Reflection is intentionally absent because managers review and guide capability rather than complete learner activities.

### Overview

The overview contains cohort size, average capability, pending evidence, at-risk areas, and priority alerts. Alerts link directly to Capability Maps or Evidence Validation.

```text
┌─────────────────────────────────────────────────────────────┐
│ Team Overview                                  Export report  │
├──────────────┬──────────────┬──────────────┬────────────────┤
│ Team size    │ Avg capability│ Pending      │ At-risk areas  │
│ 24 learners  │ 72            │ 27 evidence  │ 6 capabilities │
├─────────────────────────────────────────────────────────────┤
│ Priority alerts                                               │
│ • 8 submissions missing measurable outcomes                    │
│ • Data storytelling below benchmark for 9 learners             │
│ • 4 validations overdue                                        │
└─────────────────────────────────────────────────────────────┘
```

### Capability Maps

```text
┌─────────────────────────────────────────────────────────────┐
│ Team Capability Maps                         Filter ▾          │
├────────────────────┬────────────────────────────────────────┤
│ Learner list       │ Selected learner                        │
│ ● Priya Shah       │ Capability heat map                       │
│ ! Jordan Lee       │ Strategic decision making   74           │
│ ● Sam Rivera       │ Stakeholder influence       81           │
│ ! Casey Wong       │ Data storytelling           52  At risk  │
├────────────────────┴────────────────────────────────────────┤
│ Cohort weakness notification                                  │
│ Data storytelling is below benchmark for 38% of the cohort.    │
│ [Open Impact Signals] [Review related evidence]               │
└─────────────────────────────────────────────────────────────┘
```

Weakness notifications are generated by Impact Signals calculations and surfaced here as cohort-level warnings. Selecting a learner opens their capability state. Review-related-evidence filters the Evidence Validation queue by learner and capability.

### Evidence Validation

```text
┌─────────────────────────────────────────────────────────────┐
│ Evidence Validation                         27 awaiting review │
├──────────────────┬──────────────────────────────────────────┤
│ Submission queue │ AI-assisted evidence review                │
│ Priya — Strong   │ Evidence summary                           │
│ Jordan — Weak    │ Demonstrated capability                     │
│ Sam — Strong     │ Evidence quality: Strong / Weak             │
│                  │ Suggested validation questions               │
│                  │ • What measurable result changed?            │
│                  │ • Which action did you personally own?       │
│                  │ [Validate] [Request clarification]             │
└──────────────────┴──────────────────────────────────────────┘
```

AI review runs automatically when a manager opens an evidence item. It produces a concise summary, capability mapping, quality assessment, missing elements, validation questions, and a recommended follow-up. AI never validates or rejects evidence without a manager decision.

The page also contains a team-pattern panel such as: `Most learners describe activity but do not quantify outcomes.` The panel recommends a targeted cohort intervention.

### Impact Signals

The manager sees cohort alerts and individual-to-benchmark comparisons:

```text
Learner       Capability        Learner score   Benchmark   Status
Priya Shah    Influence              81             75       Above
Jordan Lee    Storytelling            58             72       At risk
Sam Rivera    Decision making         76             74       On track
```

The manager can open Capability Maps or Evidence Validation directly from each alert. Unlike the learner, the manager sees weakness notifications across the cohort because their mental model is intervention and prioritisation.

## Admin interface

Exactly two sections are exposed:

```text
Admin
├── User Management
└── Insight Manager
```

### User Management

```text
┌─────────────────────────────────────────────────────────────┐
│ User Management                              Add user          │
├────────────────────┬────────────────────────────────────────┤
│ Role filters       │ Unified directory                       │
│ All                │ Name          Email       Role  Status   │
│ Learners           │ Alex Morgan   …           Learner Active │
│ Managers           │ Priya Shah   …           Manager Active │
│                    │ Jordan Lee   …           Learner Invited│
├────────────────────┴────────────────────────────────────────┤
│ Selected user detail: role, programme, manager, access status │
│ [Edit role] [Deactivate] [Reset access]                      │
└─────────────────────────────────────────────────────────────┘
```

The unified directory is preferred over separate learner and manager pages because it gives admins one source of truth for access management. Capability detail remains outside this section.

### Insight Manager

```text
┌─────────────────────────────────────────────────────────────┐
│ Insight Manager                              Create insight    │
├──────────────────────┬──────────────────────────────────────┤
│ Export programme data│ Historical reports                    │
│ Dataset              │ Q2 Capability Health · CSV             │
│ Date range           │ Manager Validation Review · XLSX       │
│ Role / cohort        │ Cohort Transfer Summary · JSON         │
│ Format: CSV/XLSX/JSON│ [Open] [Download]                     │
│ [Generate export]    │                                        │
└──────────────────────┴──────────────────────────────────────┘
```

Generation flow:

```text
Select dataset → Select date range and cohort → Select format
→ Generate export → Preview validation → Download and archive
```

Admin health monitoring should identify incomplete workflows, evidence missing manager validation, low evidence coverage, unconfigured KPI links, and rollout progress by cohort and manager.

Admins should not see manager coaching prompts or learner reflection content unless an explicit audit permission is granted.

## Cross-role data flow

```text
Learner practice/reflection
          ↓
Learner evidence submission
          ↓
Manager automatic AI evidence review
          ├── Validate
          ├── Request clarification
          └── Flag weak evidence
          ↓
Capability State Model
          ├── Learner Capability Map
          ├── Learner Impact Signals
          ├── Manager Capability Maps
          ├── Manager cohort alerts
          └── Admin programme health
```

The state model updates when assessment data, evidence, reflection, manager validation, KPI movement, application frequency, or evidence freshness changes.

## Design decisions and trade-offs

- A radar chart communicates breadth quickly; a heat map scales better when the capability library grows. The recommended implementation is a heat map with an optional radar summary.
- A unified admin directory is easier to govern; separate directories would provide more role-specific detail but duplicate management flows.
- AI suggestions should be automatic and visible on evidence open, but the manager must remain the final validator.
- CSV/XLSX/JSON exports support analysis and system integration. A human-readable PDF or HTML report should be added later for programme review meetings.
