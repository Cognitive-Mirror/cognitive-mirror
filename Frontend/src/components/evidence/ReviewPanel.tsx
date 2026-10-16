"use client";

/**
 * The AI review, presented with its grounding rather than as a verdict.
 *
 * Provenance is always visible: a live model, the verified demo cache, or the
 * deterministic screen when no model was reachable. An ungrounded review is
 * labelled as one, so nothing can pass for a grounded model judgement
 * (thesis 23). When the submission text is supplied, the passages the review
 * relied on are highlighted where the server located them.
 */

import { Sparkles } from "lucide-react";

import { CitationList, GroundingBadge } from "@/components/RubricCitation";
import { ProvenanceBadge } from "@/components/explain/Badges";
import { HighlightedText } from "@/components/explain/HighlightedText";
import type { EvidenceReview } from "@/services/api";

export function quoteSpans(review: EvidenceReview) {
  return (review.verified_quotes ?? []).map((q) => ({
    start: q.start,
    end: q.end,
    label: q.clause || undefined,
    note: q.note,
  }));
}

export function ReviewPanel({
  review,
  title = "AI review",
  content,
}: {
  review: EvidenceReview;
  title?: string;
  /** The submission text, to highlight the verified quotes in place. */
  content?: string;
}) {
  const provenance = review.provenance ?? (review.model_name.startsWith("fallback") ? "fallback" : "live_model");
  const quotes = review.verified_quotes ?? [];
  return (
    <div
      className="rounded-xl p-4"
      style={{ border: "1px solid rgba(99,102,241,0.2)", background: "rgba(99,102,241,0.06)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--accent-fg)" }}>
          <Sparkles className="h-4 w-4" />
          {title}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <GroundingBadge grounded={review.grounded} citationCount={review.rubric_citations.length} />
          <ProvenanceBadge provenance={provenance} model={review.model_name} />
        </div>
      </div>

      <p className="mt-3 text-sm leading-6 t-fg">{review.summary}</p>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] t-subtle-fg">
        <span>
          Strength: <strong className="t-fg capitalize">{review.strength}</strong>
        </span>
        <span>Confidence: {Math.round(review.ai_confidence * 100)}%</span>
        {review.requires_human_review && (
          <span className="text-amber-600 dark:text-amber-400">Manager review required</span>
        )}
      </div>

      {review.rubric_citations.length > 0 && (
        <div className="mt-3">
          <CitationList slugs={review.rubric_citations} details={review.citation_details} />
        </div>
      )}

      {content && quotes.length > 0 && (
        <div className="mt-4 rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide t-subtle-fg">
            What the judgement rests on
          </p>
          <HighlightedText text={content} spans={quoteSpans(review)} />
        </div>
      )}

      {!content && quotes.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-[11px] leading-5">
          {quotes.map((q) => (
            <li key={q.start} className="t-muted">
              <span className="rounded px-1 t-fg" style={{ background: "rgba(16,185,129,0.15)" }}>
                &ldquo;{q.quote}&rdquo;
              </span>
              {q.clause && <span className="ml-1 font-mono text-[10px]" style={{ color: "var(--accent-fg)" }}>{q.clause}</span>}
            </li>
          ))}
        </ul>
      )}

      {review.concerns.length > 0 && (
        <ul className="mt-3 space-y-1 text-[11px] leading-5 t-muted">
          {review.concerns.map((c) => (
            <li key={c}>· {c}</li>
          ))}
        </ul>
      )}

      {review.recommendation && (
        <p className="mt-3 text-xs leading-5 t-fg">
          <strong>Next:</strong> {review.recommendation}
        </p>
      )}
    </div>
  );
}
