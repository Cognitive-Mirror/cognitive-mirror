# Cognitive Mirror Features

## Authentication and role routing

- Login validates learner, manager, and admin demo accounts through the FastAPI login endpoint.
- Successful authentication routes users to their assigned role workspace.
- Role-specific navigation prevents learners, managers, and admins from seeing unrelated workspace options.

## Learner workspace

- Overview dashboard with capability state, required capability, demonstrated capability, evidence strength, confidence calibration, KPI linkage, and recommended next action.
- Capability Map page with capability heat-map bars, benchmark comparison, weak-topic detection, and direct links to targeted practice.
- Practice & Reflection page with scenario activities, reflection prompts, and saved reflection feedback.
- Impact Signals page with progress-over-time visualization, organisation or peer benchmark comparison, and outcome signals.
- Evidence submission page for capability, context, actions, workplace evidence, outcome, and reflection details.

## Manager workspace

- Exactly four navigation options: Overview, Capability Maps, Evidence Validation, and Impact Signals.
- Cohort overview with team capability summaries, pending validation, and priority alerts.
- Capability Maps page showing learner-level capability states and cohort weakness notifications.
- Evidence Validation page with automatic AI-style evidence summaries, demonstrated capability mapping, evidence quality flags, validation questions, team patterns, and follow-up recommendations.
- Impact Signals page with learner-to-benchmark comparisons and cohort weakness alerts.

## Admin workspace

- Exactly two navigation options: User Management and Insight Manager.
- User Management directory combining learner and manager records with role and status information.
- Insight Manager export workflow for programme health, capability outcomes, and manager validation datasets.
- CSV, XLSX, and JSON export choices with historical report records.
- Programme health monitoring for incomplete workflows, missing manager validation, KPI coverage, and rollout visibility.

## Shared interaction features

- Profile image dropdown available across authenticated pages.
- Profile menu actions: Switch Accounts and Log Out.
- Profile menu closes when the user clicks outside it.
- Responsive role shells with consistent header, left navigation, active route state, and back-to-overview links.
- Light/dark mode slider available on login, dashboard, and workflow pages.
- Theme preference persists in `localStorage` and is applied to the page shell, surfaces, text, borders, forms, and menus.
- Accessible controls with labels, switch semantics, focus states, keyboard-compatible buttons, and responsive layouts.

## Capability State Model signals

- Required capability
- Current demonstrated capability
- Assessment performance
- Scenario judgement
- Confidence level and confidence versus demonstrated competence
- Reflection quality
- Workplace evidence and evidence strength
- Manager validation
- Application frequency
- Capability improvement, stagnation, and decay risk
- Transfer to workplace context
- In-flow support history
- Cohort interaction quality
- Peer-practice contribution
- Recommended next action
- KPI linkage and outcome signal

