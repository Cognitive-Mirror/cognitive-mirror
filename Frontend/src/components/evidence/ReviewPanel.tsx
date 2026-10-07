"use client";

/**
 * The AI review, presented with its grounding rather than as a verdict.
 *
 * An ungrounded review is labelled as one, and a fallback review is labelled
 * "No model", so neither can pass for a grounded model judgement (thesis 23).
 */

import { Sparkles } from "lucide-react";

import { CitationList, GroundingBadge } from "@/components/RubricCitation";
import type { EvidenceReview } from "@/services/api";

export function ReviewPanel({
  review,
  title = "AI review",
}: {
  review: EvidenceReview;
  title?: string;
}) {
  const fromModel = !review.model_name.startsWith("fallback");
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
        <div className="flex items-center gap-2">
          <GroundingBadge grounded={review.grounded} citationCount={review.rubric_citations.length} />
          {!fromModel && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] t-muted"
              style={{ background: "var(--bg-subtle)" }}
              title="No model was available; this is the deterministic placeholder."
            >
              No model
            </span>
          )}
        </div>
      </div>

      <p className="mt-3 text-sm leading-6 t-fg">{review.summary}</p>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] t-subtle-fg">
        <span>
          Strength: <strong className="t-fg">{review.strength}</strong>
        </span>
        <span>Confidence: {Math.round(review.ai_confidence * 100)}%</span>
        {review.requires_human_review && (
          <span className="text-amber-600 dark:text-amber-400">Manager review required</span>
        )}
      </div>

      {review.rubric_citations.length > 0 && (
        <div className="mt-3">
          <CitationList slugs={review.rubric_citations} />
        </div>
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
