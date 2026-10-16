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
| UI and reading | Funnel Sans | body, `.title`, `.lede`, `.meta`, `.caption`, `.reading` |
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

- **Knows:** a continuous bar, 0–100%.
- **Does:** five discrete square stops (Novice → Expert).
  - Filled jade up to the validated level.
  - Dashed where the evidence has aged.
  - The required stop is framed.

`LevelAxis` labels the ends and the required stop only. Five names cannot fit
at every width, and every stop still names itself on hover. `MirrorMark` is
the product mark: a blue bar reflected over a short jade one.

## Motion

- Bars grow in once (`.grow-x`, 0.9s ease-out).
- The sign-in Mirror plays the mechanism once: knowing fills, then a
  validation fills the level.
- Everything respects `prefers-reduced-motion`.
