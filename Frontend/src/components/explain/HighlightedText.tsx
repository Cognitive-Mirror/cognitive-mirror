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
      className="tag tag-does"
      title="Every highlighted passage was located word-for-word in this text by the server before the AI judgement was accepted. Quotes it could not find were discarded."
    >
      <ShieldCheck />
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
      <p className="reading whitespace-pre-line">
        {parts.map((p, i) =>
          p.span ? (
            <mark
              key={i}
              tabIndex={0}
              onMouseEnter={() => setHover(p.index!)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(p.index!)}
              onBlur={() => setHover(null)}
              className="quote-mark relative"
            >
              {p.text}
              {hover === p.index && (p.span.label || p.span.note) && (
                <span
                  role="tooltip"
                  className="absolute bottom-full left-0 z-30 mb-2 block w-72 p-3 font-sans text-xs font-normal leading-5"
                  style={{ background: "var(--inverse)", color: "var(--on-inverse)", boxShadow: "var(--shadow-2)" }}
                >
                  {p.span.label && (
                    <span className="code block opacity-80">
                      {p.span.label}
                    </span>
                  )}
                  {p.span.note && <span className="mt-1 block">{p.span.note}</span>}
                  <span className="mt-1.5 block opacity-70">
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
