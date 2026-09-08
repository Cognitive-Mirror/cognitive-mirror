# Capability State Model (CSM) — v0.2 (Draft)

> **Status:** Draft for team review. Six open questions settled in §9; implemented in `Backend/app/scoring/` and persisted via `Backend/app/models/`.
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

Three fields carry the product's central question:

| Field | Meaning |
|---|---|
| `required_level` | What the role / KPI demands (resolved via D6) |
| `attained_level` | Highest level ever evidenced **and manager-validated**. A historical fact. |
| `current_support_level` | What present-day, decayed evidence supports right now (D1) |

`gap = required_level − attained_level`

When `current_support_level < attained_level` the state is **not** downgraded;
confidence falls and revalidation is flagged. See D1 in §9.

A positive gap is the unit of work the whole platform exists to close. Level
scale (ordered): `novice → developing → competent → proficient → expert`.

---

## 5. Signals

Signals are grouped by **trustworthiness**, which is the most important
design decision in this document. Not all signals are equal, and the model must
never treat them as if they were.

### Tier 1 — Anchoring (can raise `attained_level`)

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
| 1 | `attained_level` may increase **only** with manager validation. |
| 2 | Level may not skip more than one step at a time. |
| 3 | A decrease requires strong regression evidence and must be flagged, never silent. |
| 4 | Tier 2 and Tier 3 signals may change `state_confidence` and `status`, never `attained_level`. |
| 5 | Every update records `triggered_by` (`SignalSource`) and `reason`. No anonymous mutations. |
| 6 | Every update is appended to an audit log. State history is never overwritten. |
| 7 | Decay is time-driven and applies to **confidence and evidence weight**, never silently to `attained_level` (D1). |
| 8 | If evidence is insufficient, the correct output is *no change* plus a reason. |

### 6.1 The loop this model sits inside (§6)

```
Business goal → KPI → required capability → gap diagnosed → capability path
   → workplace application → evidence → AI review → MANAGER VALIDATION
   → capability state update → KPI movement review → ROI signal
```

Only the capitalised step may move `attained_level`.

---

## 7. Confidence and attribution

`state_confidence` answers: *how much do we trust that `attained_level`
reflects reality today?* Quantified in D5 (§9). It is driven by evidence strength, validation recency,
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

## 9. Settled decisions

The six questions left open in v0.1 are resolved below. They are answered as
**one system**, not six independent choices: a single currency (evidence points)
drives level, confidence, decay and recency, so the parts cannot drift apart.

Constants are marked either **[structural]** — a design commitment that should
not change without re-reading the thesis — or **[seeded]** — a starting value
that must be replaced by observed data (see §11).

---

### D1 — Decay applies to *confidence*, not to level

> Q: Linear, or exponential with a per-capability half-life?

**Decision: exponential decay, applied to confidence and evidence weight — never
silently to the demonstrated level.** **[structural]**

The v0.1 question contained a hidden error. Decaying someone's *level* because
time passed asserts that they got worse. We have no evidence of that. We have
*absence of recent evidence*, which is a different claim. Conflating the two
would:

- violate Update Rule 3 ("a decrease requires strong regression evidence and must
  be flagged, never silent");
- be indefensible to a manager ("why was my report downgraded? she did nothing");
- read as punitive surveillance (Risk 5).

So the model separates two fields:

| Field | Meaning | Moves down? |
|---|---|---|
| `attained_level` | Highest level ever validated. A historical fact. | Only by explicit manager action with recorded regression evidence |
| `current_support_level` | What present-day, decayed evidence supports right now | Freely, as evidence ages |

When `current_support_level < attained_level`, the product does not say
"declined". It says:

> *Validated at **proficient** 14 months ago. Current evidence supports
> **competent**. Revalidation due.*

That is the §19 confidence posture — "associated with, at this confidence" —
applied to the individual instead of to a KPI. It is honest, actionable, and
survives a hostile question from a CFO.

**Curve.** Exponential, because decay is proportional to what remains:

```
weight(age) = max(FLOOR, 2 ** (-age_days / half_life))
FLOOR = 0.10   [structural]
```

The floor is deliberate: a validated past demonstration never becomes worth
*nothing*. It is weaker present-tense proof, but it remains part of the
longitudinal record that is the actual data moat (§25).

**Half-life is derived, not hand-set per capability.** Hand-setting a half-life
for each of hundreds of client capabilities is unmaintainable. Instead it is a
function of two observable things: what *kind* of capability it is, and how much
it has been reinforced.

```
half_life = BASE[capability_class] * (1 + K * ln(1 + validated_applications))
K = 0.5   [seeded]
```

| Capability class | Base half-life (days) | Rationale |
|---|---|---|
| `procedural` | 270 **[seeded]** | Closed-loop, well-structured tasks ("run a variance analysis") |
| `analytical` | 180 **[seeded]** | Cognitive, judgement-bearing ("data storytelling") |
| `interpersonal` | 120 **[seeded]** | Highly context-dependent ("stakeholder influence") |

The ordering (procedural > analytical > interpersonal) follows the general
direction of the skill-decay literature, which finds closed-loop and procedural
skills retain better over comparable non-use intervals than open-loop cognitive
ones, and that overlearning slows decay. **The ordering is the claim; the exact
numbers are placeholders.**

The logarithm on reinforcement encodes diminishing returns — the 2nd validated
application matters far more than the 10th — consistent with the power law of
practice.

---

### D2 — Aggregates report coverage and distribution, never an average level

> Q: mean, median, or share-above-required?

**Decision: never a mean. The headline aggregate is *validated coverage*; the
full distribution is always carried alongside it.** **[structural]**

Averaging capability levels is a statistics error and a product error.

- **Statistically:** levels are an *ordinal* scale. The distance
  `novice → developing` is not the same quantity as `proficient → expert`, so
  their mean is undefined. Median is legitimate for ordinal data; mean is not.
- **Product-wise:** a team where everyone sits at `competent`, and a team split
  half `novice` / half `expert`, produce the same mean and require completely
  different interventions. A mean is exactly the "dashboard of completion
  metrics" the thesis rejects (§5).

Aggregate state therefore reports:

| Metric | Definition | Use |
|---|---|---|
| **`validated_coverage`** | share at-or-above required **and** manager-validated **and** `confidence ≥ 0.60` | **The headline.** The number that goes in front of a CFO. |
| `nominal_coverage` | share at-or-above required, any confidence | Internal / optimistic view |
| `median_level` | median (valid for ordinal) | Central tendency |
| `distribution` | full histogram across the five levels | Never collapsed |
| `critical_gap_count` | subjects with `gap ≥ 2` | Intervention targets |
| `revalidation_due_count` | subjects whose confidence decayed below threshold | Pipeline of work |

`validated_coverage` answers the thesis's accountability question directly, and
is deliberately the *most conservative* of the coverage figures. Reporting the
strictest number by default is what buys credibility (§19: "credibility is more
valuable than inflated attribution").

**Constraint:** aggregates must never be drilled into for individual ranking or
comparison. They exist to target interventions, not to rate people (§24).

---

### D3 — Evidence does not expire; its weight decays on the same curve

> Q: How old can evidence be before it stops supporting the current state?

**Decision: no cutoff. Evidence weight uses the same decay function as D1.**
**[structural]**

A hard cutoff creates a cliff — evidence fully valid on day 364 and worthless on
day 366 — which is both indefensible and gameable (submit a refresher the week
before the deadline). Continuous decay removes the cliff and the incentive.

Reusing the *same* curve as D1 is the point: recency, decay and confidence are
one mechanism, not three tunables that can drift out of agreement.

An evidence item's contribution is:

```
points(item) = BASE_POINTS[strength] * validation_multiplier * weight(age)
```

| `strength` | `BASE_POINTS` | Note |
|---|---|---|
| `weak` | **0** | Triggers developmental guidance, never progression (§16.4) |
| `moderate` | 1 | |
| `strong` | 2 | |
| `exceptional` | 3 | |

| validation status | multiplier |
|---|---|
| `validated` | 1.0 |
| `pending` / `disputed` / `rejected` / `not_requested` | **0.0** |

Weak evidence scoring exactly zero is deliberate. It is the schema-level
expression of §16.2: submissions that cannot be observed or validated are not
evidence, however many of them arrive.

Unvalidated evidence scoring zero is the trust anchor expressed as arithmetic
(§17). The UI still needs to show pending work, so the engine returns
`provisional_points` separately — displayed as "awaiting validation", never fed
into `attained_level`.

---

### D4 — Progression requires accumulated points *and* independent contexts

> Q: How many validated applications move `competent → proficient`?

**Decision: not a count of applications. A points threshold, gated on
demonstrated transfer across independent contexts.** **[structural]**

Counting applications treats three items from the same project week as three
demonstrations. They are one demonstration observed three times, and they prove
nothing about transfer — which is the whole question (§7.1, §7.4).

**Two evidence items are independent when they differ in `context_ref` *and* are
at least `INDEPENDENCE_WINDOW_DAYS = 14` apart. [seeded]**

| Target level | Validated points | Independent contexts | Extra |
|---|---|---|---|
| `developing` | 2 **[seeded]** | 1 | — |
| `competent` | 5 **[seeded]** | 2 | — |
| `proficient` | 10 **[seeded]** | 3 | — |
| `expert` | 18 **[seeded]** | 4 | ≥1 `exceptional` item |

Thresholds grow superlinearly (roughly `points ∝ level^1.8`) because each level
demands demonstrated *consistency*, not one better performance — again the power
law of practice.

All three constraints must hold, plus Update Rule 1 (manager validation) and
Rule 2 (no skipping more than one level).

---

### D5 — Confidence formula, with validation as a hard ceiling

> Q: Quantify the tier weighting from §5.

**Decision:**

```
sufficiency          = min(1, validated_points / threshold(attained_level))
validation_freshness = weight(days_since_last_validation)
diversity            = min(1, independent_contexts / required_contexts(attained_level))

raw        = 0.40*sufficiency + 0.40*validation_freshness + 0.20*diversity   [seeded]
penalty    = min(0.40, 0.15*authenticity_concerns + 0.10*calibration_mismatch)
confidence = raw * (1 - penalty)

if not manager_validated:
    confidence = min(confidence, 0.40)        # HARD CEILING  [structural]
```

The hard ceiling is the most important line in this document. It makes the
platform's central governance commitment a mathematical property rather than a
policy note:

> **Capability state cannot become confident without a human.**

No accumulation of AI review, assessment scores, reflections or cohort activity
can push confidence past 0.40 on its own. Reaching the 0.60 bar used by
`validated_coverage` (D2) is *impossible* without manager validation.

`calibration_mismatch` (self-reported confidence far above demonstrated level)
lowers confidence rather than the level — overconfidence means our *estimate* is
shakier, and is a developmental prompt. It is never a rating (§24).

Confidence bands, for UI and for `revalidation_due`:

| Band | Range | Meaning |
|---|---|---|
| High | ≥ 0.75 | Defensible in external reporting |
| Moderate | 0.50 – 0.75 | Usable internally |
| Low | 0.35 – 0.50 | Directional only |
| **Revalidation due** | < 0.35 **[seeded]** | Triggers a manager check-in |

---

### D6 — `required_level` resolves through three layers, each with provenance

> Q: Spine, role definition, or both — and who owns it?

**Decision: both, with explicit precedence and mandatory provenance.**
**[structural]**

| Precedence | Layer | Owner | Editable by AI? |
|---|---|---|---|
| 1 (lowest) | **Capability Spine** default per capability × role archetype | Impact | No — AI may *propose*, a human ratifies |
| 2 | **Tenant role definition** override | Client (CHRO / L&D) | No |
| 3 (highest) | **Program / cohort target** | Program owner | No |

The Spine is Impact's proprietary asset (§10), so it must ship a defensible
default; the client must be able to override it, because required capability is
genuinely organisation-specific.

Every resolved `required_level` carries `source`, `set_by`, `effective_from` and
`rationale`. A bare number is not acceptable: when a CFO asks *"who decided this
person needs to be proficient?"*, there must be an answer. This is also what
keeps the developmental/employment boundary defensible (§24).

---

## 10. What is actually differentiated here

Stated plainly, so the team can judge it rather than take it on faith. Several of
these are uncommon in this market; none is magic.

1. **Decaying confidence rather than level.** Most competency systems either
   expire a certification on a cliff or do nothing at all. Separating *"we are
   less sure"* from *"they got worse"* is the difference between a system a
   manager trusts and one they resent.
2. **One currency for everything.** Level, confidence, decay and recency all
   derive from recency-weighted, validation-gated evidence points. Systems that
   tune these separately drift into incoherence.
3. **Validation as an arithmetic ceiling, not a policy.** A governance promise
   enforced by the formula cannot be quietly dropped under deadline pressure.
4. **Transfer required for progression.** Independent-context gating
   operationalises §7.1 instead of asserting it in prose.
5. **Coverage distribution instead of a team average.** Refusing to produce the
   single team score every buyer will ask for is a real product bet, and the
   defensible one.

What this is **not**: a validated psychometric instrument. The structure is
defensible; the constants are not yet earned. See §11.

---

## 11. Calibration — what must be learned from data

Every **[seeded]** constant above is a placeholder chosen for plausibility. They
are the honest weak point of v0.2 and must be replaced as real data accumulates.

| Constant | How it gets earned |
|---|---|
| `BASE[capability_class]` half-lives | Survival analysis on revalidation outcomes: given a validated capability, how does P(still validated) fall with time since last application, split by class? |
| `K` (reinforcement) | Fit on the same data; test whether log-reinforcement beats a constant. |
| Level point thresholds | Compare against manager overrides. If managers routinely promote before the threshold, it is too high. **Manager override rate is the primary calibration signal** and must be logged from day one. |
| Confidence weights (0.40/0.40/0.20) | Regress predicted confidence against whether the manager subsequently confirmed the level. |
| `INDEPENDENCE_WINDOW_DAYS` | Sensitivity analysis once enough multi-context evidence exists. |
| Revalidation threshold 0.35 | Tune against manager check-in acceptance rate. |

**Until calibration data exists, every externally reported figure must carry its
confidence band.** This is precisely the §19 discipline, and the reason the
engine returns a band with every number rather than a bare score.

Two guards against the obvious failure mode (Risk 7, poor data quality):

- **All constants live in one module** (`app/scoring/constants.py`), versioned
  with `SCORING_MODEL_VERSION`. Every stored state record stamps the version that
  produced it, so recalibration never silently rewrites history.
- **Recomputation is pure.** The scoring engine is a set of pure functions over
  evidence records, so any change can be replayed against historical data before
  it ships.

---

## 12. Next steps

1. ~~Settle the open questions~~ — done in §9. **Still needs Yoganarayanan's
   review of the [seeded] constants and of the D1 attained/current split.**
2. ~~Audit-log object~~ — `CapabilityStateEvent` now exists (Rule 6).
3. ~~Map to SQLAlchemy + first migration~~ — done.
4. Wire the evidence review graph to write proposals — Phase 2.
5. Begin logging manager override rate immediately; it is the calibration signal
   everything in §11 depends on.
