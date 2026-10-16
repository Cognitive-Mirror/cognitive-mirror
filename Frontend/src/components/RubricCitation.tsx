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

import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, CircleAlert, Loader2, ShieldCheck, X } from "lucide-react";
import { type CitationDetail, getKnowledgeItem, type KnowledgeItem } from "@/services/api";

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
      <span className="tag tag-does" title="Assessed against approved Capability Spine rubric clauses.">
        <ShieldCheck />
        Grounded · {citationCount} clause{citationCount === 1 ? "" : "s"}
      </span>
    );
  }

  return (
    <span
      className="tag tag-pending"
      title={
        grounded
          ? "Rubric was supplied but the reviewer cited none of it."
          : "No approved rubric was available. This is an ungrounded assessment."
      }
    >
      <CircleAlert />
      {grounded ? "No clause cited" : "Ungrounded"}
    </span>
  );
}

// Clause text never changes within a revision; fetch each slug once per page.
const clauseCache = new Map<string, Promise<KnowledgeItem>>();

function fetchClause(slug: string): Promise<KnowledgeItem> {
  let hit = clauseCache.get(slug);
  if (!hit) {
    hit = getKnowledgeItem(slug).catch((err) => {
      clauseCache.delete(slug);
      throw err;
    });
    clauseCache.set(slug, hit);
  }
  return hit;
}

function retrievalLine(detail?: CitationDetail): string | null {
  if (!detail) return null;
  if (detail.anchor) return "Grading anchor · fetched by key, never left to retrieval";
  const parts = [
    detail.score !== null ? `retrieval score ${detail.score.toFixed(3)}` : null,
    detail.via_graph ? "added by graph expansion" : "hybrid BM25 + vector match",
  ].filter(Boolean);
  return parts.join(" · ");
}

export function RubricCitation({ slug, detail }: { slug: string; detail?: CitationDetail }) {
  const [open, setOpen] = useState(false);
  const [peek, setPeek] = useState(false);
  const [up, setUp] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const [item, setItem] = useState<KnowledgeItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (item || loading) return;
    setLoading(true);
    setError(null);
    try {
      setItem(await fetchClause(slug));
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

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const showPeek = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      // Open upward when there is not room for the card below the chip.
      const rect = anchor.current?.getBoundingClientRect();
      setUp(!!rect && window.innerHeight - rect.bottom < 360);
      setPeek(true);
      void load();
    }, 140);
  };
  const hidePeek = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setPeek(false), 160);
  };
  const how = retrievalLine(detail);

  return (
    <>
      <span ref={anchor} className="relative inline-flex" onMouseEnter={showPeek} onMouseLeave={hidePeek}>
        <button
          onClick={() => {
            setPeek(false);
            setOpen(true);
            void load();
          }}
          onFocus={showPeek}
          onBlur={hidePeek}
          className="code inline-flex h-6 items-center gap-1.5 px-2 transition hover:bg-[var(--primary-tint)]"
          style={{ border: "1px solid var(--line-strong)", color: "var(--primary-text)" }}
          aria-describedby={peek ? `peek-${slug}` : undefined}
        >
          <BookOpen className="h-3 w-3" />
          {slug}
        </button>

        {peek && !open && (
          <span
            id={`peek-${slug}`}
            role="tooltip"
            className={`absolute left-0 z-40 block w-80 p-4 text-left ${up ? "bottom-full mb-2" : "top-full mt-2"}`}
            style={{ background: "var(--bg)", boxShadow: "var(--shadow-2)" }}
          >
            <span className="code block ink-primary">
              {slug} · approved{item ? ` · rev ${item.revision}` : ""}
            </span>
            <span className="display mt-1.5 block text-base leading-snug">
              {item?.title ?? describeSlug(slug)}
            </span>
            {item && (
              <span className="meta mt-1 block">
                {item.capability_name ? `Capability: ${item.capability_name}` : "Shared across capabilities"}
                {` · ${item.kind.replace(/_/g, " ")}`}
                {item.level ? ` · ${item.level}` : ""}
              </span>
            )}
            {how && (
              <span className="tag tag-does mt-2.5 h-auto whitespace-normal py-1 leading-4">
                {how}
              </span>
            )}
            {loading && <span className="mt-2 block text-xs t-muted">Loading the approved clause…</span>}
            {error && <span className="mt-2 block text-xs ink-risk">{error}</span>}
            {item && (
              <span className="mt-2.5 block whitespace-pre-line text-xs leading-5 t-muted">
                {item.body.length > 360 ? `${item.body.slice(0, 360)}…` : item.body}
              </span>
            )}
            <span className="meta mt-2.5 block">Select for the full clause</span>
          </span>
        )}
      </span>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "var(--scrim)" }}
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`Rubric clause ${slug}`}
        >
          <div
            className="dialog max-h-[82vh] w-full max-w-2xl overflow-y-auto p-7"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="code ink-primary">
                  {slug}
                </p>
                <h3 className="display display-sm mt-1.5">
                  {item?.title ?? describeSlug(slug)}
                </h3>
                {item && (
                  <p className="meta mt-1">
                    {item.capability_name ? `${item.capability_name} · ` : ""}
                    {item.kind.replace(/_/g, " ")}
                    {item.level ? ` · ${item.level}` : ""} · revision {item.revision}
                  </p>
                )}
                {how && <p className="meta mt-1 ink-does">{how}</p>}
              </div>
              <button
                onClick={() => setOpen(false)}
                className="btn btn-icon shrink-0"
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
              <p className="note note-error">{error}</p>
            )}
            {item && (
              <>
                <pre className="reading whitespace-pre-wrap">
                  {item.body}
                </pre>
                {item.related.length > 0 && (
                  <div className="mt-5 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
                    <p className="caption mb-2">Related clauses</p>
                    <div className="flex flex-wrap gap-1.5">
                      {item.related.map((r) => (
                        <span key={r} className="tag code">
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

export function CitationList({ slugs, details = [] }: { slugs: string[]; details?: CitationDetail[] }) {
  if (slugs.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="meta">Assessed against</span>
      {slugs.map((s) => (
        <RubricCitation key={s} slug={s} detail={details.find((d) => d.slug === s)} />
      ))}
    </div>
  );
}
