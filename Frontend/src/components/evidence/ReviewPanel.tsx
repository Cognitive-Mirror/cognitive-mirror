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
import { ScoreBar, StrengthMeter } from "@/components/viz/charts";
import { CountUp } from "@/components/viz/motion";
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
    <section className="panel overflow-hidden" aria-label={title}>
      <header className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 rule-b" style={{ background: "var(--surface)" }}>
        <h3 className="flex items-center gap-2 text-sm font-medium t-fg">
          <Sparkles className="h-4 w-4 ink-primary" />
          {title}
        </h3>
        <div className="flex flex-wrap items-center gap-1.5">
          <GroundingBadge grounded={review.grounded} citationCount={review.rubric_citations.length} />
          <ProvenanceBadge provenance={provenance} model={review.model_name} />
        </div>
      </header>

      <div className="space-y-4 px-5 py-5">
        <p className="display text-[1.1875rem] leading-snug">{review.summary}</p>

        <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div>
            <dt className="meta">Strength</dt>
            <dd className="mt-1"><StrengthMeter strength={review.strength} /></dd>
          </div>
          <div>
            <dt className="meta">AI confidence</dt>
            <dd className="mt-1 flex items-center gap-2.5">
              <ScoreBar value={review.ai_confidence} max={1} />
              <CountUp value={Math.round(review.ai_confidence * 100)} suffix="%" className="font-medium t-fg" />
            </dd>
          </div>
          {review.requires_human_review && (
            <div>
              <dt className="meta">Decision</dt>
              <dd className="mt-0.5 font-medium ink-pending">Manager review required</dd>
            </div>
          )}
        </dl>

        {review.rubric_citations.length > 0 && (
          <CitationList slugs={review.rubric_citations} details={review.citation_details} />
        )}

        {content && quotes.length > 0 && (
          <div className="inset px-5 py-4">
            <p className="caption mb-2">What the judgement rests on</p>
            <HighlightedText text={content} spans={quoteSpans(review)} />
          </div>
        )}

        {!content && quotes.length > 0 && (
          <ul className="space-y-2 text-sm leading-6">
            {quotes.map((q) => (
              <li key={q.start} className="t-fg">
                <mark className="quote-mark">&ldquo;{q.quote}&rdquo;</mark>
                {q.clause && <span className="code ml-2 ink-primary">{q.clause}</span>}
              </li>
            ))}
          </ul>
        )}

        {review.concerns.length > 0 && (
          <div>
            <p className="caption mb-1.5">Concerns</p>
            <ul className="list-disc space-y-1 pl-4 text-sm leading-6 t-muted marker:text-[var(--ink-3)]">
              {review.concerns.map((c) => <li key={c}>{c}</li>)}
            </ul>
          </div>
        )}

        {review.recommendation && (
          <p className="rule pt-4 text-sm leading-6 t-fg">
            <span className="font-medium">Next step. </span>
            {review.recommendation}
          </p>
        )}
      </div>
    </section>
  );
}
