# Capability State Model (CSM) — v0.1 (Draft)

> **Status:** Draft for team review. Not yet implemented against a database.
> **Owner:** AI team · **Reviewers needed:** Yoganarayanan (research), Shashank, Allan
> **Source of truth:** Impact AI Thesis — Internal Build Version v1.2
> **Code counterpart:** [`Backend/app/schemas/capability.py`](../../Backend/app/schemas/capability.py)
> **Last updated:** 2026-09-06

---

## 1. Why this document exists

The Impact AI Thesis names this as the **first thing to build**:

> §27 Priority 1 — "Define the Capability State Model. This is the core of the AI
> system. Before building agents or advanced AI, define what capability state
> means and how it updates."

> §12 — "The Capability State Model is the live representation of demonstrated
> capability… This becomes the heart of Impact's long-term AI moat."

Everything else in the roadmap is sequenced *after* this. The schema is the
product; the AI is a service running on top of it. If this model is wrong, no
amount of prompt engineering will fix the platform.

---

## 2. What capability state is (and is not)

| Capability state **is** | Capability state **is not** |
|---|---|
| A live, decaying estimate of demonstrated capability | A completion record |
| Multi-signal, with each signal weighted by trustworthiness | A single score |
| Anchored by human validation | An AI judgement |
| Confidence-scored | A certainty claim |
| Developmental | An employment decision input |

Four first principles from the thesis constrain the whole model:

- **§7.1 Capability ≠ knowledge.** Knowing the concept is not demonstrating it.
- **§7.2 Completion ≠ evidence.** Completion is one weak signal, nothing more.
- **§7.3 Assessment ≠ workplace performance.** Test scores do not prove transfer.
- **§7.6 Capability must remain live.** It improves, stagnates, and decays.

---

## 3. Identity — what a state row is keyed by

One `CapabilityState` exists per:

```
(tenant_id, subject_type, subject_id, capability_id)
```

`tenant_id` is mandatory on every row. Tenant isolation is a governance
requirement (§24), not a later feature.

### 3.1 Subject levels

The same model is computed at seven levels (§12). Only the subject changes:

`learner` · `team` · `cohort` · `role` · `program` · `org_unit` · `tenant`

Aggregate levels are **derived** from learner-level state, never edited directly.

---

## 4. The core comparison

Two fields carry the product's central question:

| Field | Meaning |
|---|---|
| `required_level` | What the role / KPI demands |
| `demonstrated_level` | What has actually been evidenced **and validated** |

`gap = required_level − demonstrated_level`

A positive gap is the unit of work the whole platform exists to close. Level
scale (ordered): `novice → developing → competent → proficient → expert`.

---

## 5. Signals

Signals are grouped by **trustworthiness**, which is the most important
design decision in this document. Not all signals are equal, and the model must
never treat them as if they were.

### Tier 1 — Anchoring (can raise `demonstrated_level`)

| Signal | Group | Notes |
|---|---|---|
| `validation.status` | `ValidationSignals` | Manager validation. The trust anchor (§17). |
| `validation.observed_in_work` | `ValidationSignals` | Did the manager see the behaviour? |
| `validation.applied_independently` | `ValidationSignals` | One-off vs. consistent |
| `evidence.strongest_evidence_strength` | `EvidenceSignals` | Reviewed workplace evidence (§16) |
| `evidence.application_frequency` | `EvidenceSignals` | Repeated application, not a single instance |

### Tier 2 — Supporting (inform confidence, cannot alone raise level)

| Signal | Group | Notes |
|---|---|---|
| `assessment.assessment_score` | `AssessmentSignals` | Diagnostic only (§7.3) |
| `assessment.scenario_judgement` | `AssessmentSignals` | Judgement under simulated pressure |
| `assessment.reflection_quality` | `AssessmentSignals` | Depth, not length |
| `assessment.confidence_calibration` | `AssessmentSignals` | Self-report vs. demonstrated (§12) |

### Tier 3 — Contextual (never move level; flag for follow-up)

| Signal | Group | Notes |
|---|---|---|
| `engagement.in_flow_support_events` | `EngagementSignals` | A support trigger indicates uncertainty, **not** proven weakness (§15.1) |
| `engagement.cohort_interaction_quality` | `EngagementSignals` | Supporting signal only (§15.2) |
| `engagement.peer_practice_contributions` | `EngagementSignals` | |
| `engagement.participation_risk` | `EngagementSignals` | Routes to facilitator, not to a rating |

### Derived — Trajectory and outcome

| Signal | Group | Notes |
|---|---|---|
| `trajectory.trajectory` | `TrajectorySignals` | improving / stagnant / declining / insufficient_data |
| `trajectory.decay_risk` | `TrajectorySignals` | Driven by `days_since_last_application` (§7.6) |
| `trajectory.transfer_strength` | `TrajectorySignals` | unproven → emerging → consistent → generalised |
| `outcome.linked_kpi_ids` | `OutcomeSignals` | Which KPIs this capability supports |
| `outcome.attribution_confidence` | `OutcomeSignals` | Association strength — **never causality** (§19) |
| `outcome.confounding_factors` | `OutcomeSignals` | Recorded explicitly so claims stay honest |

---

## 6. Update rules

> **Rule 0 — AI never writes state.** AI produces a `CapabilityUpdate`
> *proposal*. A human applies it. (§7.7, §16.3, §24)

| # | Rule |
|---|---|
| 1 | `demonstrated_level` may increase **only** with manager validation. |
| 2 | Level may not skip more than one step at a time. |
| 3 | A decrease requires strong regression evidence and must be flagged, never silent. |
| 4 | Tier 2 and Tier 3 signals may change `state_confidence` and `status`, never `demonstrated_level`. |
| 5 | Every update records `triggered_by` (`SignalSource`) and `reason`. No anonymous mutations. |
| 6 | Every update is appended to an audit log. State history is never overwritten. |
| 7 | Decay is time-driven and applies without new input — absence of application is itself a signal. |
| 8 | If evidence is insufficient, the correct output is *no change* plus a reason. |

### 6.1 The loop this model sits inside (§6)

```
Business goal → KPI → required capability → gap diagnosed → capability path
   → workplace application → evidence → AI review → MANAGER VALIDATION
   → capability state update → KPI movement review → ROI signal
```

Only the capitalised step may move `demonstrated_level`.

---

## 7. Confidence and attribution

`state_confidence` answers: *how much do we trust that `demonstrated_level`
reflects reality?* It is driven by evidence strength, validation recency,
application frequency, and calibration — not by model certainty.

Outcome language is fixed by §19. The system says:

> "This capability movement is **associated with** these observed KPI signals,
> with this level of confidence, based on this evidence and validation."

It must never say "training caused this result." `confounding_factors` exists so
that this restraint is visible in the data, not just in the copy.

---

## 8. What this model must not do

Drawn from §5, §24 and the Risk register (§29):

- Must not become a completion or engagement metric store.
- Must not produce hidden employee scoring, or feel like surveillance (Risk 5).
- Must not be used as a direct input to employment decisions. Developmental
  insight and employment decision are separated by design (§24).
- Must not overclaim ROI (Risk 3).
- Must not accept self-reported claims as validated capability (§17).

---

## 9. Open questions for review

These are genuinely undecided and need the team's input before implementation:

1. **Decay function.** Linear, or exponential with a per-capability half-life?
   The thesis says capability decays but does not specify a curve.
2. **Aggregate roll-up.** How is a team's `demonstrated_level` computed —
   mean, median, or share-above-required? Different choices tell different
   stories to a CHRO.
3. **Evidence recency window.** How old can evidence be before it stops
   supporting the current state?
4. **Level thresholds.** How many independent validated applications move
   `competent → proficient`? Currently unspecified.
5. **Confidence formula.** The weighting of the tiers in §5 is asserted here but
   not yet quantified.
6. **Required-level source.** Does `required_level` come from the client's
   Capability Spine, from the role definition, or both — and who owns it?

---

## 10. Next steps

1. Review and settle §9 with Yoganarayanan.
2. Add the audit-log object (Rule 6 has no schema yet).
3. Map these schemas to SQLAlchemy models + the first Alembic migration
   (`AI_BACKEND_WORKFLOW.md` Phase 5).
4. Only then wire the evidence review graph (Phase 2) to write proposals.

---

## Appendix — Thesis §12 coverage check

Every signal §12 requires, and where it lives in the schema:

| §12 requirement | Field |
|---|---|
| Required capability | `required_level` |
| Current demonstrated capability | `demonstrated_level` |
| Assessment performance | `assessment.assessment_score` |
| Scenario judgement | `assessment.scenario_judgement` |
| Confidence level | `assessment.self_reported_confidence` |
| Confidence vs. demonstrated competence | `assessment.confidence_calibration` |
| Reflection quality | `assessment.reflection_quality` |
| Workplace evidence | `evidence.evidence_count` |
| Evidence strength | `evidence.strongest_evidence_strength` |
| Manager validation | `validation.status` |
| Application frequency | `evidence.application_frequency` |
| Capability improvement | `trajectory.trajectory = improving` |
| Capability stagnation | `trajectory.trajectory = stagnant` |
| Capability decay risk | `trajectory.decay_risk` |
| Transfer to workplace context | `trajectory.transfer_strength` |
| In-flow support history | `engagement.in_flow_support_events` |
| Cohort interaction quality | `engagement.cohort_interaction_quality` |
| Peer-practice contribution | `engagement.peer_practice_contributions` |
| Recommended next action | `recommended_next_action` |
| KPI linkage | `outcome.linked_kpi_ids` |
| Outcome signal | `outcome.observed_kpi_movement` |

All 21 signals are represented.
