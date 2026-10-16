"use client";

/**
 * Small, square infographics. Each encodes one fact the backend computed and
 * animates once, as it is first seen (see ./motion).
 *
 *   LevelUnits        one square per person, stacked in their level's column;
 *                     the at-or-above-required zone is shaded. A distribution,
 *                     never an average: levels are ordinal.
 *   Waffle            a 10 x 10 grid for an assessment score.
 *   StrengthMeter     the four evidence strengths, filled to the AI's reading.
 *   ConfidenceTrack   confidence before -> after on 0..1, with the ceiling that
 *                     only a manager validation can lift.
 *   ScoreBar          an inline bar for a retrieval score.
 */

import { motion } from "framer-motion";

import { EASE_OUT, useReveal } from "@/components/viz/motion";

const LEVEL_SHORT = ["Novice", "Dev.", "Comp.", "Prof.", "Expert"];
const LEVEL_FULL = ["Novice", "Developing", "Competent", "Proficient", "Expert"];

export type Unit = {
  key: string;
  label: string;
  level: number;
  /** met: at or above required and current. below: under required. aged: needs revalidation. */
  tone: "met" | "below" | "aged" | "neutral";
};

const UNIT_STYLE: Record<Unit["tone"], React.CSSProperties> = {
  met: { background: "var(--does)" },
  below: { background: "var(--ink-3)" },
  aged: { background: "var(--bg)", border: "1.5px dashed var(--risk)" },
  neutral: { background: "var(--lvl-3)" },
};

export function LevelUnits({
  units,
  required,
  legend = true,
  max = 24,
}: {
  units: Unit[];
  required?: number | null;
  legend?: boolean;
  max?: number;
}) {
  const { ref, shown, reduce } = useReveal<HTMLDivElement>();
  const columns = LEVEL_FULL.map((_, i) => units.filter((u) => u.level === i));
  let order = 0;

  return (
    <figure className="w-full" ref={ref}>
      <div className="relative grid grid-cols-5" style={{ minHeight: "1.75rem" }}>
        {required != null && (
          <span
            aria-hidden
            className="absolute inset-y-0 right-0"
            style={{
              left: `${(required / 5) * 100}%`,
              background: "color-mix(in srgb, var(--does) 7%, transparent)",
              borderLeft: "1.5px dashed var(--does)",
            }}
          />
        )}
        {columns.map((col, i) => (
          <div key={i} className="relative flex flex-wrap content-end gap-[3px] px-1.5 pb-1.5 pt-2" style={{ borderBottom: "1px solid var(--line-strong)" }}>
            {col.slice(0, max).map((u) => {
              const delay = Math.min(order++ * 0.045, 0.6);
              return (
                <motion.span
                  key={u.key}
                  title={`${u.label} · ${LEVEL_FULL[u.level]}${u.tone === "aged" ? " · revalidation due" : u.tone === "below" ? " · below required" : ""}`}
                  className="block h-3 w-3"
                  style={UNIT_STYLE[u.tone]}
                  initial={reduce ? false : { opacity: 0, y: -8 }}
                  animate={shown ? { opacity: 1, y: 0 } : undefined}
                  transition={{ duration: 0.4, ease: EASE_OUT, delay }}
                />
              );
            })}
            {col.length > max && <span className="meta num leading-3">+{col.length - max}</span>}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-5 pt-1">
        {LEVEL_SHORT.map((l, i) => (
          <span key={l} className={`meta px-1.5 ${required === i ? "font-semibold t-fg" : ""}`}>
            {l}
            <span className="num t-subtle-fg"> {columns[i].length || ""}</span>
          </span>
        ))}
      </div>
      {legend && (
        <figcaption className="meta mt-2 flex flex-wrap gap-x-4 gap-y-1">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5" style={UNIT_STYLE.met} /> At required</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5" style={UNIT_STYLE.below} /> Below required</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5" style={UNIT_STYLE.aged} /> Revalidation due</span>
          {required != null && (
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5" style={{ background: "color-mix(in srgb, var(--does) 7%, transparent)", border: "1px dashed var(--does)" }} /> Meets the required level</span>
          )}
        </figcaption>
      )}
    </figure>
  );
}

/** A 10 x 10 grid: one square per percentage point. */
export function Waffle({ value, tone = "knows", label }: { value: number; tone?: "knows" | "does"; label: string }) {
  const { ref, shown, reduce } = useReveal<HTMLDivElement>();
  const filled = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div
      ref={ref}
      role="img"
      aria-label={`${label}: ${filled} of 100`}
      className="grid w-[6.5rem] grid-cols-10 gap-[2px]"
    >
      {Array.from({ length: 100 }, (_, i) => {
        // Fill bottom-left first, column by column, like a level rising.
        const col = i % 10;
        const row = 9 - Math.floor(i / 10);
        const rank = col * 10 + row;
        const on = rank < filled;
        return (
          <span
            key={i}
            className="block aspect-square"
            style={{
              background: on && shown ? `var(--${tone})` : "var(--surface-2)",
              transition: reduce ? "none" : "background-color 0.25s ease",
              transitionDelay: reduce ? "0s" : `${Math.min(rank * 9, 900)}ms`,
            }}
          />
        );
      })}
    </div>
  );
}

const STRENGTHS = ["weak", "moderate", "strong", "exceptional"];

/** The AI's strength reading on the four-step evidence scale. */
export function StrengthMeter({ strength }: { strength: string }) {
  const { ref, shown, reduce } = useReveal<HTMLDivElement>();
  const at = STRENGTHS.indexOf(strength);
  return (
    <div ref={ref} className="flex items-center gap-2.5" aria-label={`Strength: ${strength}, ${at + 1} of 4`}>
      <div className="grid w-24 grid-cols-4 gap-[3px]">
        {STRENGTHS.map((s, i) => (
          <span
            key={s}
            title={s}
            className="block h-2.5"
            style={{
              background: i <= at && shown ? "var(--ink-2)" : "var(--surface-3)",
              transition: reduce ? "none" : "background-color 0.3s ease",
              transitionDelay: reduce ? "0s" : `${i * 110}ms`,
            }}
          />
        ))}
      </div>
      <span className="font-medium capitalize t-fg">{strength}</span>
    </div>
  );
}

/** Confidence moving along 0..1, with the unvalidated ceiling marked. */
export function ConfidenceTrack({
  from,
  to,
  ceiling = 0.4,
}: {
  from: number;
  to: number;
  ceiling?: number;
}) {
  const { ref, shown, reduce } = useReveal<HTMLDivElement>();
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const up = to > from;
  const color = to === from ? "var(--ink-3)" : up ? "var(--does)" : "var(--risk)";
  return (
    <div ref={ref} className="pt-4" aria-label={`Confidence ${from.toFixed(2)} to ${to.toFixed(2)}; ceiling ${ceiling.toFixed(2)} without validation`}>
      <div className="relative h-1.5" style={{ background: "var(--surface-3)" }}>
        <span className="absolute -top-4 meta leading-3" style={{ left: `${ceiling * 100}%`, transform: "translateX(-50%)" }}>
          {ceiling.toFixed(2)}
        </span>
        <span className="absolute -top-1 bottom-[-4px] w-px" style={{ left: `${ceiling * 100}%`, background: "var(--ink-2)" }} />
        <motion.span
          className="absolute inset-y-0"
          style={{ left: `${lo * 100}%`, width: `${(hi - lo) * 100}%`, background: color, transformOrigin: up ? "left" : "right" }}
          initial={reduce ? false : { scaleX: 0 }}
          animate={shown ? { scaleX: 1 } : undefined}
          transition={{ duration: 0.7, ease: EASE_OUT, delay: 0.15 }}
        />
        <span className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2" style={{ left: `${from * 100}%`, background: "var(--bg)", border: "1.5px solid var(--ink-3)" }} />
        <motion.span
          className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2"
          style={{ background: color, marginLeft: "-5px" }}
          initial={reduce ? false : { left: `${from * 100}%` }}
          animate={shown ? { left: `${to * 100}%` } : undefined}
          transition={{ duration: 0.7, ease: EASE_OUT, delay: 0.15 }}
        />
      </div>
    </div>
  );
}

/** An inline bar for one score against the column's best. */
export function ScoreBar({ value, max, strong = false }: { value: number; max: number; strong?: boolean }) {
  const { ref, shown, reduce } = useReveal<HTMLSpanElement>();
  const w = max > 0 ? Math.max(0.04, value / max) : 0;
  return (
    <span ref={ref} aria-hidden className="ml-2 inline-block h-1.5 w-14 align-middle" style={{ background: "var(--surface-2)" }}>
      <motion.span
        className="block h-full"
        style={{ width: `${w * 100}%`, background: strong ? "var(--primary)" : "var(--ink-3)", transformOrigin: "left" }}
        initial={reduce ? false : { scaleX: 0 }}
        animate={shown ? { scaleX: 1 } : undefined}
        transition={{ duration: 0.6, ease: EASE_OUT }}
      />
    </span>
  );
}
