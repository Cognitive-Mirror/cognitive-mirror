# ADR-003 — Learning signals: e-learns, assessments, and the knowledge dimension

> **Status:** Accepted · **Date:** 2026-10-07
> **Related:** [Capability State Model](../Architecture/Capability_State_Model.md) §5, D5 · [ADR-002](ADR-002-retrieval-grounding.md)
> **Trigger:** client description of the learning process (below)

---

## Context

The client described how a learner actually learns on the programme:

> The learning process involves assessments, e-learns, peer engagement, AI
> engagement, and implementing at work — some of these won't be available from
> day 1. E-learns have their own minor quizzes and checks to ascertain knowledge.
> Other assessments, before and after e-learns and implementing at work, assess
> other aspects. The e-learns are interactive: drag and drop, match the options,
> rank options, enter responses.

They also said the Impact thesis is **a reference, not a specification**. This
ADR follows the client where the two differ.

Until now the platform only modelled the last component — workplace evidence —
so most of what a learner does produced no signal at all.

---

## Decision

### 1. Two dimensions, never merged

Each (learner, capability) carries two separate readouts:

| Dimension | Measures | Comes from | Can move `attained_level`? |
|---|---|---|---|
| **Knows** | knowledge of the capability | e-learn checks, pre/post assessments | **No — structurally** |
| **Does** | demonstrated workplace capability | evidence + manager validation | Yes — the only thing that can |

They are shown side by side and never combined into one score. A combined score
would recreate exactly the illusion the product exists to remove: a high quiz
mark that looks like capability.

### 2. Knowledge is asymmetric: it can cast doubt, never prove

- Knowledge **never raises** level or confidence. A learner who aces every check
  is still `novice` with zero confidence until work is validated.
  (`KNOWLEDGE_CAN_RAISE_LEVEL = False`, a structural constant.)
- Knowledge **can lower confidence** when it contradicts validated work: mastery
  below 0.50 while validated at `competent` or above applies a 0.10 penalty
  inside the existing D5 penalty cap, and asks a human to look. It never changes
  the level.

Why asymmetric: if quiz scores could raise confidence, a cohort that crams would
look capable on the dashboard. If they could not lower it, a generous validation
would go unchallenged.

### 3. The knowing–doing diagnostic

| State | Meaning | Next action |
|---|---|---|
| `knows_not_applied` | mastery ≥ 0.70, nothing validated at work | Apply it at work — the classic transfer gap |
| `aligned` | validated at work, knowledge consistent | Continue progression |
| `applied_without_knowledge` | validated ≥ competent, mastery < 0.50 | Manager review: is the assessment or the validation off? |
| `developing` | neither yet | Close knowledge gaps, then apply |
| `insufficient_data` | no knowledge signal | — |

`knows_not_applied` is the most commercially important state in the product.
Training platforms can show the first column. Only this one can show the gap
between it and the second.

### 4. Which attempt counts

- **Mastery uses first attempts.** A retake partly measures memory of the
  previous attempt's feedback. Retakes are recorded and shown, never hidden.
- **Pre-assessments are single-attempt** (`max_attempts = 1`) so a baseline stays
  a baseline.
- **Learning gain is Hake's normalised gain** per instrument:
  `g = (post − pre) / (1 − pre)`. Raw difference punishes people who start high.
  Pre and post are paired by `instrument_ref` and should be parallel forms.
- Mastery precedence: post-assessment → e-learn checks → pre-assessment.

### 5. Exercise types and partial credit

All seven interaction types the client uses are scored deterministically, except
open answers:

| Type | Rule | Anti-gaming property |
|---|---|---|
| single choice | all or nothing | — |
| multi choice | (right − wrong) / correct, floor 0 | ticking every box scores 0 |
| match | share of pairs | — |
| categorize (drag & drop) | share placed correctly | — |
| rank | 1 − discordant pairs / all pairs | one early slip isn't catastrophic |
| short answer | normalised exact match against accepted forms | — |
| free response | AI, against item key points (below) | quote-verified |

Answer keys never leave the server before submission. After submission they are
revealed **for e-learn checks only** — revealing assessment answers would
contaminate the post-test.

### 6. Free-response scoring — the answer to "vague rubric, authoritative review"

ADR-002 accepted that rubric quality bounds review quality. For open answers we
can do better, because each question has its own specific key points:

1. The model **never emits a score**. It judges each key point met / not met.
2. Every "met" must carry a **verbatim quote** from the learner's answer.
3. The service **verifies every quote** against the answer (normalised, ≥ 3
   words). Unverifiable claims are discarded and lower the reported confidence.
4. Credit = verified key points / total — arithmetic, not judgement.
5. The model may say **"the key points don't settle this"**. That routes the
   answer to a facilitator queue rather than forcing a mark. This is a
   first-class outcome, not an error.

A reviewer cannot reach a high mark by sounding confident, and a fabricated
justification costs marks rather than earning them.

When no model is available the answer is queued for a human, never zeroed:
pending items are **excluded** from the score, so a learner never sees a wrong,
low mark while marking is in progress.

### 7. Components that are not live yet

Peer practice and AI practice are seeded as **visible, locked stages** with an
availability date. The learner sees the whole path rather than a journey that
silently grows, and absent components contribute nothing — absence is never
scored as a negative.

---

## Consequences

- `SCORING_MODEL_VERSION` → **0.3.0**. Every state row stamps the version.
- New tables: `learning_activities`, `assessment_items`, `activity_attempts`,
  `item_responses`. New columns on `capability_states` for the knowledge
  dimension. Migration `db662200d14a`.
- New API: `/learning/*` (6 routes). `/capabilities/*` responses gain the
  knowledge fields.
- Open-answer scoring runs after the HTTP response. The free model endpoint is
  slow enough that a learner must not wait on it.

## Open questions

1. **Who marks the open-answer queue** — line managers or trained facilitators?
   The queue is built; the role gate is not (see remaining work).
2. **Is mastery 0.70 the right transfer-gap threshold?** Seeded, not calibrated.
3. **Are pre and post genuinely parallel forms?** Gain is only meaningful if so;
   item-level difficulty statistics would tell us after the first cohort.
4. **E-learn authoring.** These are authored in-platform today. If the client's
   e-learns come from an authoring tool (Articulate, Rise) or an LMS, an xAPI
   ingestion endpoint is the natural seam: an external result maps onto an
   `ActivityAttempt` with a provided score.
