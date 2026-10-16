"use client";

/**
 * A learner's own text with the passages the AI relied on highlighted.
 *
 * Spans come from the server, which located each quote verbatim in this exact
 * text before storing it. Nothing is searched for on the client, so a
 * highlight can only ever mark words the learner actually wrote, and only the
 * ones the server checked.
 */

import { useState } from "react";
import { ShieldCheck } from "lucide-react";

export type Span = {
  start: number;
  end: number;
  /** Short label shown on hover: the clause or key point this supports. */
  label?: string;
  note?: string;
};

type Segment = { text: string; span?: Span; index?: number };

function segments(text: string, spans: Span[]): Segment[] {
  const valid = spans
    .filter((s) => s.start >= 0 && s.end <= text.length && s.end > s.start)
    .sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  let at = 0;
  valid.forEach((span, index) => {
    if (span.start < at) return; // overlapping: keep the earlier highlight
    if (span.start > at) out.push({ text: text.slice(at, span.start) });
    out.push({ text: text.slice(span.start, span.end), span, index });
    at = span.end;
  });
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}

export function VerifiedQuoteBadge({ count }: { count: number }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300"
      style={{ background: "rgba(16,185,129,0.12)" }}
      title="Every highlighted passage was located word-for-word in this text by the server before the AI judgement was accepted. Quotes it could not find were discarded."
    >
      <ShieldCheck className="h-3 w-3" />
      Server-Verified Verbatim Quote{count === 1 ? "" : "s"} · {count}
    </span>
  );
}

export function HighlightedText({
  text,
  spans,
  className = "",
  showBadge = true,
}: {
  text: string;
  spans: Span[];
  className?: string;
  showBadge?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const parts = segments(text, spans);
  const marked = parts.filter((p) => p.span).length;

  return (
    <div className={className}>
      {showBadge && marked > 0 && (
        <div className="mb-2">
          <VerifiedQuoteBadge count={marked} />
        </div>
      )}
      <p className="whitespace-pre-line text-sm leading-7 t-fg">
        {parts.map((p, i) =>
          p.span ? (
            <mark
              key={i}
              tabIndex={0}
              onMouseEnter={() => setHover(p.index!)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(p.index!)}
              onBlur={() => setHover(null)}
              className="relative rounded px-0.5 text-inherit outline-none transition"
              style={{
                background: hover === p.index ? "rgba(16,185,129,0.32)" : "rgba(16,185,129,0.18)",
                boxShadow: "inset 0 -2px 0 rgba(16,185,129,0.65)",
              }}
            >
              {p.text}
              {hover === p.index && (p.span.label || p.span.note) && (
                <span
                  role="tooltip"
                  className="absolute bottom-full left-0 z-30 mb-2 block w-72 rounded-xl p-3 text-[11px] font-normal leading-5 shadow-xl"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)", color: "var(--fg)" }}
                >
                  {p.span.label && (
                    <span className="block font-mono text-[10px]" style={{ color: "var(--accent-fg)" }}>
                      {p.span.label}
                    </span>
                  )}
                  {p.span.note && <span className="mt-1 block t-muted">{p.span.note}</span>}
                  <span className="mt-1.5 block text-[10px] text-emerald-600 dark:text-emerald-400">
                    Located verbatim at characters {p.span.start}–{p.span.end}
                  </span>
                </span>
              )}
            </mark>
          ) : (
            <span key={i}>{p.text}</span>
          ),
        )}
      </p>
    </div>
  );
}
