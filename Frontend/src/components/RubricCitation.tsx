"use client";

/**
 * Rubric citations and grounding status.
 *
 * A citation that cannot be read is decoration. These components exist so a
 * manager can see which approved clause a judgement rests on and open it
 * without leaving the validation screen — which is what makes thesis 23's
 * question ("did it use only approved sources?") answerable by a person rather
 * than only by a database query.
 */

import { useCallback, useEffect, useState } from "react";
import { BookOpen, CircleAlert, Loader2, ShieldCheck, X } from "lucide-react";
import { getKnowledgeItem, type KnowledgeItem } from "@/services/api";

/** Reads a clause slug: CAP-DS.RUBRIC.STRONG -> "Data storytelling · rubric · strong". */
function describeSlug(slug: string): string {
  const [cap, ...rest] = slug.split(".");
  const known: Record<string, string> = {
    "CAP-DS": "Data storytelling",
    "CAP-SI": "Stakeholder influence",
    "CAP-SDM": "Strategic decision making",
    KPI: "KPI",
  };
  const head = known[cap] ?? cap;
  return [head, ...rest.map((r) => r.toLowerCase())].join(" · ");
}

export function GroundingBadge({
  grounded,
  citationCount,
}: {
  grounded: boolean;
  citationCount: number;
}) {
  if (grounded && citationCount > 0) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300"
        style={{ background: "rgba(16,185,129,0.12)" }}
        title="Assessed against approved Capability Spine rubric clauses."
      >
        <ShieldCheck className="h-3 w-3" />
        Grounded · {citationCount} clause{citationCount === 1 ? "" : "s"}
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-300"
      style={{ background: "rgba(245,158,11,0.12)" }}
      title={
        grounded
          ? "Rubric was supplied but the reviewer cited none of it."
          : "No approved rubric was available. This is an ungrounded assessment."
      }
    >
      <CircleAlert className="h-3 w-3" />
      {grounded ? "No clause cited" : "Ungrounded"}
    </span>
  );
}

export function RubricCitation({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [item, setItem] = useState<KnowledgeItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (item || loading) return;
    setLoading(true);
    setError(null);
    try {
      setItem(await getKnowledgeItem(slug));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the clause.");
    } finally {
      setLoading(false);
    }
  }, [item, loading, slug]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
          void load();
        }}
        className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[11px] transition hover:opacity-75"
        style={{
          background: "rgba(99,102,241,0.1)",
          color: "var(--accent-fg)",
          border: "1px solid rgba(99,102,241,0.2)",
        }}
        title={describeSlug(slug)}
      >
        <BookOpen className="h-3 w-3" />
        {slug}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.55)" }}
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`Rubric clause ${slug}`}
        >
          <div
            className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl p-6"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[11px]" style={{ color: "var(--accent-fg)" }}>
                  {slug}
                </p>
                <h3 className="mt-1 text-lg font-semibold t-fg">
                  {item?.title ?? describeSlug(slug)}
                </h3>
                {item && (
                  <p className="mt-1 text-[11px] t-subtle-fg">
                    {item.kind.replace(/_/g, " ")}
                    {item.level ? ` · ${item.level}` : ""} · revision {item.revision}
                  </p>
                )}
              </div>
              <button
                onClick={() => setOpen(false)}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg transition hover:opacity-70"
                style={{ background: "var(--bg-subtle)" }}
                aria-label="Close"
              >
                <X className="h-4 w-4 t-muted" />
              </button>
            </div>

            {loading && (
              <p className="flex items-center gap-2 text-sm t-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading the approved clause…
              </p>
            )}
            {error && (
              <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
            )}
            {item && (
              <>
                <pre className="whitespace-pre-wrap font-sans text-sm leading-6 t-fg">
                  {item.body}
                </pre>
                {item.related.length > 0 && (
                  <div className="mt-5 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide t-subtle-fg">
                      Related clauses
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {item.related.map((r) => (
                        <span
                          key={r}
                          className="rounded-md px-2 py-0.5 font-mono text-[10px] t-muted"
                          style={{ background: "var(--bg-subtle)" }}
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export function CitationList({ slugs }: { slugs: string[] }) {
  if (slugs.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] t-subtle-fg">Assessed against:</span>
      {slugs.map((s) => (
        <RubricCitation key={s} slug={s} />
      ))}
    </div>
  );
}
