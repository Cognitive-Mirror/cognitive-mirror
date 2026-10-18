"use client";

/**
 * A ruled line of figures. Replaces a grid of metric tiles: the numbers read
 * as one sentence about the state, not as four separate trophies.
 *
 * A numeric value counts up the first time it is seen. A value with `of`
 * also draws one square per unit, filled to the value, so "1 of 3" is seen
 * as well as read.
 */

import { CountUp, useReveal } from "@/components/viz/motion";

type Tone = "knows" | "does" | "pending" | "risk";

export type Stat = {
  label: string;
  value: number | string;
  tone?: Tone;
  decimals?: number;
  suffix?: string;
  /** Draw `of` unit squares, `value` of them filled. */
  of?: number;
};

export function StatLine({ items, className = "" }: { items: Stat[]; className?: string }) {
  return (
    <dl className={`grid grid-cols-2 rule rule-b sm:grid-cols-4 ${className}`}>
      {items.map((item, i) => (
        <div
          key={item.label}
          className={[
            "border-[color:var(--line)] py-5 pr-4",
            i > 0 ? "sm:border-l sm:pl-6" : "",
            i % 2 === 1 ? "border-l pl-4" : "max-sm:pl-0",
            i > 1 ? "max-sm:border-t" : "",
          ].join(" ")}
        >
          <dt className="meta">{item.label}</dt>
          <dd className={`mt-1.5 flex items-baseline gap-1.5 ${item.tone ? `ink-${item.tone}` : "t-fg"}`}>
            {typeof item.value === "number" ? (
              <CountUp value={item.value} decimals={item.decimals ?? 0} className="text-[1.75rem] font-medium leading-none tracking-[-0.02em]" />
            ) : (
              <span className="num text-[1.75rem] font-medium leading-none tracking-[-0.02em]">{item.value}</span>
            )}
            {item.of !== undefined && <span className="meta num">of {item.of}</span>}
            {item.suffix && <span className="meta">{item.suffix}</span>}
          </dd>
          {item.of !== undefined && item.of > 0 && typeof item.value === "number" && (
            <Units value={item.value} of={item.of} tone={item.tone} />
          )}
        </div>
      ))}
    </dl>
  );
}

function Units({ value, of, tone }: { value: number; of: number; tone?: Tone }) {
  const { ref, shown, reduce } = useReveal<HTMLDivElement>();
  const color = tone ? `var(--${tone})` : "var(--does)";
  return (
    <div ref={ref} aria-hidden className="mt-2.5 flex flex-wrap gap-[3px]">
      {Array.from({ length: Math.min(of, 24) }, (_, i) => (
        <span
          key={i}
          className="block h-2 w-2"
          style={{
            background: i < value && shown ? color : "var(--surface-3)",
            transition: reduce ? "none" : "background-color 0.3s ease",
            transitionDelay: reduce ? "0s" : `${0.2 + i * 0.08}s`,
          }}
        />
      ))}
    </div>
  );
}
