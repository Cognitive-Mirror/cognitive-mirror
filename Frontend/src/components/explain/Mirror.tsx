"use client";

/**
 * The Mirror: what a learner knows, reflected against what they have shown at
 * work, across one shared axis.
 *
 * The two halves use deliberately different encodings, because they are
 * different kinds of fact and merging them is the illusion the product exists
 * to remove:
 *
 *   knows  a continuous bar, 0-100%, from assessments and e-learn checks
 *   does   five discrete level stops, filled only to the manager-validated
 *          level; stops that decayed evidence no longer supports are hollow
 *
 * The required level is ringed on the level track. Nothing here is computed on
 * the client beyond layout: every value is the backend's.
 */

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
  const knows = state.knowledge_mastery;
  const attained = levelIndex(state.attained_level);
  const support = levelIndex(state.current_support_level);
  const required = levelIndex(state.required_level);
  const knowsPct = knows === null ? 0 : Math.round(knows * 100);
  const source = SOURCE_LABEL[state.knowledge_source] ?? "";

  return (
    <figure
      className="w-full"
      aria-label={`Knows ${knows === null ? "not measured" : `${knowsPct}%`}; validated at work: ${LEVEL_LABEL[state.attained_level]}; required ${LEVEL_LABEL[state.required_level]}.`}
    >
      {/* Knows */}
      <div className={`grid items-end gap-x-4 ${compact ? "grid-cols-[3.25rem_1fr_3rem]" : "grid-cols-[4.5rem_1fr_7.5rem]"}`}>
        <span className="caption pb-1">Knows</span>
        <div className="relative h-2.5 overflow-hidden" style={{ background: "var(--surface-2)" }}>
          {knows !== null && (
            <div
              className={`absolute inset-y-0 left-0 ${animate ? "grow-x" : ""}`}
              style={{ width: `${knowsPct}%`, background: "var(--knows)" }}
            />
          )}
        </div>
        <span className="num pb-0.5 text-right">
          <span className="ink-knows text-sm font-semibold">{knows === null ? "—" : `${knowsPct}%`}</span>
          {!compact && source && <span className="meta block leading-3">{source}</span>}
        </span>
      </div>

      {/* The mirror line */}
      <div className={`grid gap-x-4 ${compact ? "grid-cols-[3.25rem_1fr_3rem] py-1.5" : "grid-cols-[4.5rem_1fr_7.5rem] py-2.5"}`}>
        <span />
        <div className="h-px" style={{ background: "var(--ink-3)", opacity: 0.6 }} />
        <span />
      </div>

      {/* Does */}
      <div className={`grid items-start gap-x-4 ${compact ? "grid-cols-[3.25rem_1fr_3rem]" : "grid-cols-[4.5rem_1fr_7.5rem]"}`}>
        <span className="caption pt-0.5">Does</span>
        <div>
          <div className="relative flex h-3.5 items-center justify-between">
            {/* track joining validated stops */}
            <div className="absolute left-[7px] right-[7px] top-1/2 h-px -translate-y-1/2" style={{ background: "var(--line-strong)" }} />
            {attained > 0 && (
              <div
                className={`absolute left-[7px] top-1/2 h-[3px] -translate-y-1/2 ${animate ? "grow-x" : ""}`}
                style={{
                  width: `calc(${(attained / 4) * 100}% - ${(attained / 4) * 14}px)`,
                  background: "var(--does)",
                  animationDelay: "0.25s",
                }}
              />
            )}
            {LEVELS.map((level, i) => {
              const validated = i <= attained && attained > 0;
              const decayed = validated && i > support;
              const isRequired = i === required;
              return (
                <span
                  key={level}
                  title={`${LEVEL_LABEL[level]}${isRequired ? " · required" : ""}${decayed ? " · evidence has aged" : ""}`}
                  className="relative z-10 block h-3.5 w-3.5"
                  style={{
                    background: validated && !decayed ? "var(--does)" : "var(--bg)",
                    border: validated
                      ? `2px ${decayed ? "dashed" : "solid"} var(--does)`
                      : "2px solid var(--line-strong)",
                    boxShadow: isRequired ? "0 0 0 3px var(--bg), 0 0 0 4.5px var(--ink)" : undefined,
                  }}
                />
              );
            })}
          </div>
          {!compact && <LevelAxis required={required} />}
        </div>
        <span className="num text-right">
          <span className="ink-does text-sm font-semibold">{LEVEL_LABEL[state.attained_level]}</span>
          {!compact && <span className="meta block leading-3">confidence {state.state_confidence.toFixed(2)}</span>}
        </span>
      </div>
    </figure>
  );
}

/**
 * Axis labels for the level track. Five names cannot fit under five stops at
 * every width, so the axis reads like a chart's: its two ends, plus the
 * required stop called out under its ring. An end label that would collide
 * with the callout is dropped; every stop still names itself on hover.
 */
export function LevelAxis({ required }: { required: number }) {
  const at = (i: number) => `calc(7px + (100% - 14px) * ${i / 4})`;
  return (
    <div className="relative mt-2 h-4 meta leading-4">
      {required > 1 && <span className="absolute left-0">Novice</span>}
      {required < 3 && <span className="absolute right-0">Expert</span>}
      <span
        className="absolute whitespace-nowrap font-semibold t-fg"
        style={
          required === 0
            ? { left: 0 }
            : required === 4
              ? { right: 0 }
              : { left: at(required), transform: "translateX(-50%)" }
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
