"use client";

/**
 * The Mirror: what a learner knows, reflected against what they have shown at
 * work, across one shared axis.
 *
 * The two halves use deliberately different encodings, because they are
 * different kinds of fact and merging them is the illusion the product exists
 * to remove:
 *
 *   knows  a continuous bar, 0-100%, from assessments and e-learn checks,
 *          ruled at each quarter
 *   does   a five-rung level meter, filled only to the manager-validated
 *          level; rungs that aged evidence no longer supports are hatched
 *
 * The required rung is underscored in ink. When the figure is first seen, the
 * knows bar draws to its value and then the rungs fill one by one: reading
 * the figure is the animation. Every value is the backend's.
 */

import { CountUp, useReveal } from "@/components/viz/motion";
import type { CapabilityState } from "@/services/api";

const LEVELS = ["novice", "developing", "competent", "proficient", "expert"] as const;
const LEVEL_LABEL: Record<string, string> = {
  novice: "Novice",
  developing: "Developing",
  competent: "Competent",
  proficient: "Proficient",
  expert: "Expert",
};

const SOURCE_LABEL: Record<string, string> = {
  post_assessment: "post-assessment",
  knowledge_checks: "e-learn checks",
  pre_assessment: "starting point",
  none: "",
};

/** Aged evidence: jade hatching on its soft tint. */
const HATCH = "repeating-linear-gradient(135deg, var(--does) 0 1.5px, var(--does-soft) 1.5px 4.5px)";

function levelIndex(level: string) {
  return Math.max(0, LEVELS.indexOf(level as (typeof LEVELS)[number]));
}

export function Mirror({
  state,
  compact = false,
  animate = true,
}: {
  state: Pick<
    CapabilityState,
    | "knowledge_mastery"
    | "knowledge_source"
    | "attained_level"
    | "current_support_level"
    | "required_level"
    | "state_confidence"
  >;
  compact?: boolean;
  animate?: boolean;
}) {
  const { ref, shown: revealed, reduce } = useReveal<HTMLElement>();
  const shown = revealed || !animate;
  const still = reduce || !animate;
  const knows = state.knowledge_mastery;
  const attained = levelIndex(state.attained_level);
  const support = levelIndex(state.current_support_level);
  const required = levelIndex(state.required_level);
  const knowsPct = knows === null ? 0 : Math.round(knows * 100);
  const source = SOURCE_LABEL[state.knowledge_source] ?? "";
  const cols = compact ? "grid-cols-[3.25rem_1fr_3rem]" : "grid-cols-[4.5rem_1fr_7.5rem]";

  return (
    <figure
      ref={ref}
      className="w-full"
      aria-label={`Knows ${knows === null ? "not measured" : `${knowsPct}%`}; validated at work: ${LEVEL_LABEL[state.attained_level]}; required ${LEVEL_LABEL[state.required_level]}.`}
    >
      {/* Knows */}
      <div className={`grid items-center gap-x-4 ${cols}`}>
        <span className="caption">Knows</span>
        <div className={`relative overflow-hidden ${compact ? "h-2.5" : "h-3"}`} style={{ background: "var(--surface-2)" }}>
          {knows !== null && (
            <div
              className="absolute inset-y-0 left-0"
              style={{
                width: `${knowsPct}%`,
                background: "var(--knows)",
                transformOrigin: "left",
                transform: shown ? "scaleX(1)" : "scaleX(0)",
                transition: still ? "none" : "transform 0.9s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            />
          )}
        </div>
        <span className="text-right leading-4">
          {knows === null ? (
            <span className="ink-knows text-sm font-semibold">—</span>
          ) : (
            <CountUp value={knowsPct} suffix="%" className="ink-knows text-sm font-semibold" />
          )}
          {!compact && source && <span className="meta block">{source}</span>}
        </span>
      </div>

      {/* The mirror line */}
      <div className={`grid gap-x-4 ${cols} ${compact ? "py-1.5" : "py-2.5"}`}>
        <span />
        {/* The mirror line doubles as the knows axis: ticks at each quarter. */}
        <div className="relative h-px" style={{ background: "var(--ink-3)" }}>
          {!compact &&
            [25, 50, 75].map((q) => (
              <span key={q} aria-hidden className="absolute -top-[3px] h-[7px] w-px" style={{ left: `${q}%`, background: "var(--ink-3)" }} />
            ))}
        </div>
        <span />
      </div>

      {/* Does */}
      <div className={`grid items-start gap-x-4 ${cols}`}>
        <span className="caption pt-px">Does</span>
        <div>
          <div className="grid grid-cols-5 gap-[3px]">
            {LEVELS.map((level, i) => {
              const validated = attained > 0 && i <= attained;
              const aged = validated && i > support;
              const fill = validated ? (aged ? HATCH : "var(--does)") : "var(--surface-2)";
              return (
                <span key={level} className="relative block">
                  <span
                    title={`${LEVEL_LABEL[level]}${i === required ? " · required" : ""}${aged ? " · evidence has aged" : ""}`}
                    className={`block ${compact ? "h-2.5" : "h-3"}`}
                    style={{
                      background: shown ? fill : "var(--surface-2)",
                      transition: still ? "none" : "background 0.35s ease",
                      transitionDelay: still ? "0s" : `${0.55 + i * 0.13}s`,
                    }}
                  />
                  {i === required && (
                    <span aria-hidden className="absolute inset-x-0 -bottom-[5px] h-[2px]" style={{ background: "var(--ink)" }} />
                  )}
                </span>
              );
            })}
          </div>
          {!compact && <LevelAxis required={required} />}
        </div>
        <span className="text-right leading-4">
          <span className="ink-does text-sm font-semibold">{LEVEL_LABEL[state.attained_level]}</span>
          {!compact && (
            <span className="meta block">
              confidence <CountUp value={state.state_confidence} decimals={2} />
            </span>
          )}
        </span>
      </div>
    </figure>
  );
}

/**
 * Axis labels for the level meter. Five names cannot fit under five rungs at
 * every width, so the axis reads like a chart's: its two ends, plus the
 * required rung called out under its underscore. An end label that would
 * collide with the callout is dropped; every rung still names itself on hover.
 */
export function LevelAxis({ required }: { required: number }) {
  return (
    <div className="relative mt-2.5 h-4 meta leading-4">
      {required > 1 && <span className="absolute left-0">Novice</span>}
      {required < 3 && <span className="absolute right-0">Expert</span>}
      <span
        className="absolute whitespace-nowrap font-semibold t-fg"
        style={
          required === 0
            ? { left: 0 }
            : required === 4
              ? { right: 0 }
              : { left: `${((required + 0.5) / 5) * 100}%`, transform: "translateX(-50%)" }
        }
      >
        required
      </span>
    </div>
  );
}

/** The product mark: two bars reflected across a line. */
export function MirrorMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="5" width="18" height="4.5" fill="var(--knows)" />
      <rect x="2" y="11.4" width="20" height="1.2" fill="var(--ink)" />
      <rect x="3" y="14.5" width="9" height="4.5" fill="var(--does)" />
    </svg>
  );
}

type Narration = { headline: string; detail: string; tone: "knows" | "does" | "pending" | "risk" | "neutral" };

/**
 * One sentence that says what the state means, in plain words. Derived only
 * from fields the backend computed; it never adds a claim.
 */
export function narrate(
  s: Pick<
    CapabilityState,
    | "capability_name"
    | "knowing_doing"
    | "provisional_points"
    | "needs_revalidation"
    | "attained_level"
    | "required_level"
    | "knowledge_mastery"
    | "gap"
  >,
  subject: "you" | string = "you",
): Narration {
  const you = subject === "you";
  const knows = s.knowledge_mastery === null ? null : Math.round(s.knowledge_mastery * 100);
  const they = you ? "you" : subject;
  const have = you ? "have" : "has";
  const level = LEVEL_LABEL[s.attained_level].toLowerCase();

  if (s.needs_revalidation) {
    return {
      headline: `Validated at ${level}. The evidence has aged.`,
      detail: `${you ? "Your" : `${subject}'s`} level stands, but the work behind it is old enough that it needs a fresh look from a manager.`,
      tone: "risk",
    };
  }
  if (s.knowing_doing === "applied_without_knowledge") {
    return {
      headline: `Shown at work, but the latest assessment disagrees.`,
      detail: `Validated at ${level} with knowledge measured at ${knows}%. Neither number is changed automatically; a manager decides.`,
      tone: "risk",
    };
  }
  if (s.provisional_points > 0) {
    return {
      headline: `The evidence is with the manager.`,
      detail: `Submitted evidence counts for nothing until a manager validates it, and everything once they do.`,
      tone: "pending",
    };
  }
  if (s.knowing_doing === "knows_not_applied") {
    return {
      headline: you ? `You know it. You haven't shown it at work yet.` : `${subject} knows it, and hasn't shown it at work yet.`,
      detail: `${knows}% on the assessments, but no validated workplace evidence, so the level stays at novice.`,
      tone: "knows",
    };
  }
  if (s.knowing_doing === "aligned") {
    return {
      headline: s.gap <= 0 ? `Knowledge and work agree, at the required level.` : `Knowledge and work agree.`,
      detail:
        s.gap <= 0
          ? `Validated at ${level}. Keep applying it so the evidence stays current.`
          : `Validated at ${level}; ${LEVEL_LABEL[s.required_level].toLowerCase()} is required. The next step is evidence from a new context.`,
      tone: "does",
    };
  }
  if (s.knowing_doing === "developing") {
    return {
      headline: `Still building the knowledge.`,
      detail: `${knows}% so far. Close the gaps in the e-learn, then apply it at work.`,
      tone: "neutral",
    };
  }
  return {
    headline: s.attained_level !== "novice" ? `Validated at ${level}.` : `Nothing measured yet.`,
    detail:
      s.attained_level !== "novice"
        ? `No knowledge assessment has been taken alongside it.`
        : `${you ? "Start" : `${they} ${have} not started`} the learning journey${you ? ", then apply it at work" : ""}.`,
    tone: "neutral",
  };
}

export { LEVEL_LABEL, LEVELS };
