# Cognitive Mirror — design system

**Clean, square, lively.** A calm place to learn, where every colour means
one thing and every mark is a measurement. Tokens live in
`src/app/globals.css`; fonts load in `src/app/layout.tsx`.

## Principles

1. **No rounded corners.** Every surface, control, tag, dialog, avatar and
   data mark is a true rectangle. Level stops read as rungs; bars read as
   measurements, not pills.
2. **Colour is data, never decoration.** Four tuned hues, one meaning each.
   Everything else is ink on warm paper, ruled with hairlines.
3. **Headlines narrate state.** `narrate()` turns a capability state into a
   plain sentence ("The evidence is with the manager."). It never adds a claim
   the backend did not compute.
4. **No kickers, no hero-metric tiles, no gradients, no glow.** Stats sit in a
   ruled line (`StatLine`), not in cards.

## Type

| Role | Face | Use |
|---|---|---|
| Display | Funnel Display 500, −0.025em | `.display`, `.display-xl/lg/md/sm` |
| UI and reading | Funnel Sans, 15px base | body, `.title`, `.lede`, `.meta`, `.caption`, `.reading` |
| Code | Martian Mono, 85% width | `.code`: rubric clause slugs only |

Display and UI are one superfamily, so headlines and interface share their
proportions. Emphasis inside a headline is colour, not slant: `<em>` is
knows blue, `<em className="does">` is does jade.

## Colour

| Token | Light | Dark | Meaning |
|---|---|---|---|
| `--knows` | #3b6cf0 | #86a5ff | What a learner has shown on assessments and e-learns |
| `--does` | #13936b | #5fd0a3 | What a manager has validated at work |
| `--pending` | #eea21b | #f7c65a | Waiting on a human decision |
| `--risk` | #e04f3c | #f4877a | Decayed evidence, contradictions, refusals |
| `--primary` | #2456e3 | #9db6ff | The one action that matters on a screen |
| `--bg` / `--surface` | #fbfaf7 / #f4f2ec | #141412 / #1c1b18 | Warm paper |
| `--field` | #e8edfb | #171d30 | The sign-in colour field |

Each hue has `-soft` (fills) and `-ink` (text on paper, AA contrast).
`--lvl-0…4` is a single-hue ramp for level distributions: ordinal, so it
never averages.

Theme follows the system until the viewer picks one. A pre-paint script sets
`html[data-theme]`, so there is no flash.

## Components

- **Buttons** `.btn` + `-primary` / `-secondary` / `-neutral` / `-text` /
  `-danger` / `-confirm`, sizes `-sm` / `-lg` / `-icon`. Square-cornered.
- **Segmented** `.segmented`: radio groups (strength, yes/no/can't say).
- **Tags** `.tag-knows/does/pending/risk/primary/outline`: status, never
  decoration.
- **Rows** `.rows`: hairline-separated lists in place of card grids.
- **Tabs** `.tabs`: underline tabs.
- **Feedback** `.note-*`: inline results. `.snackbar`: toasts.
- **Dialog / side sheet** `.dialog` over `--scrim`. The audit trail is a side
  sheet.
- CSS is layered (`@layer base`, `@layer components`), so Tailwind utilities
  always win.

## The Mirror (signature graphic)

`components/explain/Mirror.tsx`. The two readings sit across one hairline,
with deliberately different encodings:

- **Knows:** a continuous bar, 0–100%. The mirror line beneath it doubles as
  its axis, ticked at each quarter.
- **Does:** a five-rung level meter (Novice → Expert).
  - Filled jade up to the validated level.
  - Hatched where the evidence has aged.
  - The required rung is underscored in ink.

`LevelAxis` labels the ends and the required rung only. Every rung still
names itself on hover. `MirrorMark` is the product mark.

## Infographics (`components/viz/charts.tsx`)

- **LevelUnits:** a unit chart, one square per person in their level's
  column. Jade = at required, grey = below, dashed coral = revalidation due.
  The meets-required zone is shaded. Used for team and tenant coverage
  instead of a stacked bar, because levels are ordinal and every person
  counts.
- **Waffle:** a 10 × 10 grid for an assessment score. It fills bottom-up,
  column by column.
- **StrengthMeter:** the four evidence strengths, filled to the AI's reading.
  Neutral ink, because the reading is not validated.
- **ConfidenceTrack:** confidence before → after on 0–1, with the 0.40
  ceiling marked. Jade going up, coral going down.
- **ScoreBar:** inline bars for retrieval and AI confidence scores.
- **StatLine:** figures count up. "X of N" stats draw N unit squares.

## Motion (`components/viz/motion.tsx`)

- **The idea:** reading the figure is the animation. Each chart plays once,
  when it first scrolls into view (`useReveal`, IntersectionObserver).
  - A bar draws to its value.
  - The rungs fill one by one.
  - A number counts to itself (`CountUp`).
  - The squares drop into their columns.
- **The page headline** is the page's one entrance. It rises out of a mask
  (`.rise`), and the lede fades in after it.
- **Easing** is `cubic-bezier(0.16, 1, 0.3, 1)`, with routine changes at
  150–400 ms. Nothing loops and nothing bounces.
- **With `prefers-reduced-motion`,** final states render immediately.
