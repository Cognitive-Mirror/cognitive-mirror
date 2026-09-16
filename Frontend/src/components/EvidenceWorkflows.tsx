"use client";

/**
 * Evidence submission, manager validation, and retrieval health.
 *
 * Design rules this screen follows, all of them thesis commitments:
 *
 *  - An AI review is shown with its grounding status and the clauses it cited.
 *    An ungrounded review is labelled as one rather than styled identically to
 *    a grounded one (thesis 23).
 *  - The manager's strength judgement is entered independently and is what
 *    counts. The AI rating is context, never a default (thesis 17).
 *  - A degraded retrieval path is visible in the product, not only in a log.
 *  - Nothing is displayed that the backend does not compute.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  FileCheck2,
  Loader2,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { ProfileMenu, ThemeToggle } from "@/components/ThemeControls";
import { CitationList, GroundingBadge, RubricCitation } from "@/components/RubricCitation";
import {
  type CapabilityState,
  type EvidenceReviewResult,
  getIndexStatus,
  getMyCapabilityStates,
  getPendingEvidence,
  type IndexStatus,
  type PendingEvidence,
  searchKnowledge,
  type SearchHit,
  submitEvidence,
  validateEvidence,
} from "@/services/api";

const shell = "min-h-screen t-bg t-fg";

const STRENGTHS = ["weak", "moderate", "strong", "exceptional"] as const;
type Strength = (typeof STRENGTHS)[number];

function Header({ role }: { role: string }) {
  return (
    <header
      className="sticky top-0 z-20 backdrop-blur-xl"
      style={{ borderBottom: "1px solid var(--border)", background: "var(--bg)" }}
    >
      <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between px-5 lg:px-8">
        {/* ProfileMenu renders its own link; nesting anchors breaks hydration. */}
        <div className="flex items-center gap-2">
          <ProfileMenu role={role} />
          <Link href={`/${role}`} className="text-sm font-semibold t-fg">
            Cognitive Mirror
          </Link>
        </div>
        <ThemeToggle />
      </div>
    </header>
  );
}

function Back({ role }: { role: string }) {
  return (
    <Link
      href={`/${role}`}
      className="mt-7 inline-flex items-center gap-2 text-sm transition hover:opacity-85"
      style={{ color: "var(--fg-muted)" }}
    >
      <ArrowLeft className="h-4 w-4" />
      Back to dashboard
    </Link>
  );
}

function Card({
  children,
  className = "",
  style = {},
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <section
      className={`rounded-2xl p-6 ${className}`}
      style={{ border: "1px solid var(--border)", background: "var(--bg-card)", ...style }}
    >
      {children}
    </section>
  );
}

function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p>{message}</p>
        {onRetry && (
          <button onClick={onRetry} className="mt-1 font-semibold underline underline-offset-2">
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

/** Retrieval health, surfaced rather than buried in a server log. */
function RetrievalHealth({ status }: { status: IndexStatus | null }) {
  if (!status) return null;

  const tone = status.available && !status.degraded ? "emerald" : "amber";
  return (
    <div
      className="rounded-xl p-3 text-[11px] leading-5"
      style={{
        border: `1px solid ${tone === "emerald" ? "rgba(16,185,129,0.2)" : "rgba(245,158,11,0.25)"}`,
        background: tone === "emerald" ? "rgba(16,185,129,0.06)" : "rgba(245,158,11,0.06)",
      }}
    >
      <p className="font-medium t-fg">
        Knowledge index: {status.doc_count} approved clauses · {status.edge_count} structural
        edges
      </p>
      <p className="mt-1 t-muted">
        embedder {status.embedder} · reranker {status.reranker} · fusion weights{" "}
        {status.weights_calibrated ? "calibrated" : "inherited defaults"}
      </p>
      {status.notes.map((n) => (
        <p key={n} className="mt-1.5 t-muted">
          · {n}
        </p>
      ))}
    </div>
  );
}

/** The AI review, presented with its grounding rather than as a verdict. */
function ReviewPanel({ review }: { review: EvidenceReviewResult }) {
  const fromModel = !review.model_name.startsWith("fallback");
  return (
    <div
      className="rounded-xl p-4"
      style={{ border: "1px solid rgba(99,102,241,0.2)", background: "rgba(99,102,241,0.06)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--accent-fg)" }}>
          <Sparkles className="h-4 w-4" />
          Evidence review
        </div>
        <div className="flex items-center gap-2">
          <GroundingBadge
            grounded={review.grounded}
            citationCount={review.rubric_citations.length}
          />
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
        <span>Confidence: {(review.ai_confidence * 100).toFixed(0)}%</span>
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

// ===========================================================================
// Learner: submit evidence
// ===========================================================================

export function LearnerEvidencePage() {
  const [capabilities, setCapabilities] = useState<CapabilityState[]>([]);
  const [status, setStatus] = useState<IndexStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [capabilityId, setCapabilityId] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [context, setContext] = useState("");
  const [contextRef, setContextRef] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [review, setReview] = useState<EvidenceReviewResult | null>(null);
  const [resultState, setResultState] = useState<CapabilityState | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [caps, st] = await Promise.all([
        getMyCapabilityStates(),
        getIndexStatus().catch(() => null),
      ]);
      setCapabilities(caps);
      setStatus(st);
      if (caps.length > 0) setCapabilityId((prev) => prev || caps[0].capability_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load capabilities.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setReview(null);
    try {
      const result = await submitEvidence({
        capability_id: capabilityId,
        evidence_type: "workplace_application",
        title,
        content,
        context,
        context_ref: contextRef,
      });
      setReview(result.review);
      setResultState(result.capability_state);
      setTitle("");
      setContent("");
      setContext("");
      setContextRef("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={shell}>
      <Header role="learner" />
      <div className="mx-auto max-w-[980px] px-5 py-10 lg:px-8">
        <p className="text-xs font-bold uppercase tracking-[.18em]" style={{ color: "var(--accent-fg)" }}>
          Learner workspace / Evidence
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-.04em] t-fg">
          Submit capability evidence.
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 t-muted">
          Show what changed in your work. Your submission is reviewed against the approved
          rubric for the capability, then sent to your manager — whose decision is what
          actually moves your capability state.
        </p>

        {error && (
          <div className="mt-6">
            <ErrorBox message={error} onRetry={() => void load()} />
          </div>
        )}

        {loading && (
          <p className="mt-8 flex items-center gap-2 text-sm t-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        )}

        {review && resultState && (
          <div className="mt-6 space-y-4">
            <div className="flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
              <Check className="h-4 w-4" />
              Submitted and awaiting manager validation. It contributes{" "}
              {resultState.provisional_points.toFixed(1)} provisional points — nothing counts
              toward your level until a manager validates it.
            </div>
            <ReviewPanel review={review} />
          </div>
        )}

        {!loading && (
          <div className="mt-8 grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
            <form
              onSubmit={handleSubmit}
              className="space-y-5 rounded-2xl p-6"
              style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}
            >
              <div>
                <label className="text-sm font-medium t-fg" htmlFor="ev-cap">
                  Capability demonstrated
                </label>
                <select
                  id="ev-cap"
                  required
                  value={capabilityId}
                  onChange={(e) => setCapabilityId(e.target.value)}
                  className="mt-2 h-12 w-full rounded-xl px-4 text-sm outline-none"
                  style={{
                    border: "1px solid var(--border)",
                    background: "var(--bg-card)",
                    color: "var(--fg)",
                  }}
                >
                  {capabilities.map((c) => (
                    <option key={c.capability_id} value={c.capability_id}>
                      {c.capability_name} (required: {c.required_level})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium t-fg" htmlFor="ev-title">
                  Evidence title
                </label>
                <input
                  id="ev-title"
                  required
                  minLength={3}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Reframed the Q2 launch decision"
                  className="mt-2 h-12 w-full rounded-xl px-4 text-sm outline-none transition focus:ring-2 focus:ring-indigo-400/30"
                  style={{
                    border: "1px solid var(--border)",
                    background: "var(--bg-input)",
                    color: "var(--fg)",
                  }}
                />
              </div>

              <div>
                <label className="text-sm font-medium t-fg" htmlFor="ev-body">
                  What happened?
                </label>
                <textarea
                  id="ev-body"
                  required
                  minLength={120}
                  rows={7}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="The situation, what you personally did, and the observable result…"
                  className="mt-2 w-full rounded-xl px-4 py-3 text-sm outline-none transition focus:ring-2 focus:ring-indigo-400/30"
                  style={{
                    border: "1px solid var(--border)",
                    background: "var(--bg-input)",
                    color: "var(--fg)",
                  }}
                />
                <p className="mt-1 text-[11px] t-subtle-fg">
                  {content.length} characters. Submissions under 120 are screened out before
                  review — they cannot carry enough specifics to be evidence.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium t-fg" htmlFor="ev-ctx">
                    Workplace context
                  </label>
                  <input
                    id="ev-ctx"
                    value={context}
                    onChange={(e) => setContext(e.target.value)}
                    placeholder="e.g. Quarterly business review"
                    className="mt-2 h-12 w-full rounded-xl px-4 text-sm outline-none"
                    style={{
                      border: "1px solid var(--border)",
                      background: "var(--bg-input)",
                      color: "var(--fg)",
                    }}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium t-fg" htmlFor="ev-ref">
                    Project or situation
                  </label>
                  <input
                    id="ev-ref"
                    value={contextRef}
                    onChange={(e) => setContextRef(e.target.value)}
                    placeholder="e.g. project-atlas"
                    className="mt-2 h-12 w-full rounded-xl px-4 text-sm outline-none"
                    style={{
                      border: "1px solid var(--border)",
                      background: "var(--bg-input)",
                      color: "var(--fg)",
                    }}
                  />
                  <p className="mt-1 text-[11px] t-subtle-fg">
                    Used to judge transfer. Evidence from different situations counts for more
                    than repeats of the same one.
                  </p>
                </div>
              </div>

              <button
                disabled={submitting || !capabilityId}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Reviewing against rubric…
                  </>
                ) : (
                  <>
                    Submit for validation <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            <aside className="h-fit space-y-4">
              <Card>
                <Sparkles className="h-5 w-5 text-indigo-400" />
                <h2 className="mt-4 font-semibold t-fg">Make evidence stronger</h2>
                <ul className="mt-4 space-y-4 text-sm leading-5 t-muted">
                  <li>
                    <strong className="t-fg">Context:</strong> what was the challenge?
                  </li>
                  <li>
                    <strong className="t-fg">Action:</strong> what did you personally do?
                  </li>
                  <li>
                    <strong className="t-fg">Outcome:</strong> what changed, and how do you know?
                  </li>
                  <li>
                    <strong className="t-fg">Reflection:</strong> what would you repeat?
                  </li>
                </ul>
                <div
                  className="mt-6 rounded-xl p-3 text-xs leading-5"
                  style={{
                    border: "1px solid rgba(99,102,241,0.2)",
                    background: "rgba(99,102,241,0.06)",
                    color: "var(--fg)",
                  }}
                >
                  Your manager reviews this and decides whether the capability was
                  demonstrated. Manager validation is always required.
                </div>
              </Card>
              <RetrievalHealth status={status} />
            </aside>
          </div>
        )}

        <Back role="learner" />
      </div>
    </main>
  );
}

// ===========================================================================
// Manager: validate evidence
// ===========================================================================

export function ManagerEvidencePage() {
  const [items, setItems] = useState<PendingEvidence[]>([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const [strength, setStrength] = useState<Strength>("moderate");
  const [observed, setObserved] = useState<boolean | null>(null);
  const [independent, setIndependent] = useState<boolean | null>(null);
  const [feedback, setFeedback] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const pending = await getPendingEvidence();
      setItems(pending);
      setSelected(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the queue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const item = items[selected];

  async function decide(decision: "approved" | "needs_revision" | "rejected") {
    if (!item) return;
    setSaving(true);
    setError(null);
    try {
      const state = await validateEvidence(item.evidence_id, {
        decision,
        strength,
        observed_in_work: observed ?? undefined,
        applied_independently: independent ?? undefined,
        feedback,
      });
      setNotice(
        `Recorded. ${state.capability_name || "Capability"} is now ${state.attained_level} ` +
          `(${(state.state_confidence * 100).toFixed(0)}% confidence).`,
      );
      setFeedback("");
      setObserved(null);
      setIndependent(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record the decision.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className={shell}>
      <Header role="manager" />
      <div className="mx-auto max-w-[1180px] px-5 py-10 lg:px-8">
        <p className="text-xs font-bold uppercase tracking-[.18em]" style={{ color: "var(--accent-fg)" }}>
          Manager workspace / Evidence validation
        </p>
        <div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-4xl font-semibold tracking-[-.04em] t-fg">
              Read the evidence, then decide.
            </h1>
            <p className="mt-2 text-sm t-muted">
              Your judgement is what makes the capability state real. The review below is
              context — it does not set the rating.
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-300">
            <CircleAlert className="h-4 w-4" />
            {items.length} awaiting validation
          </span>
        </div>

        {notice && (
          <div className="mt-6 flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
            <Check className="h-4 w-4" />
            {notice}
          </div>
        )}
        {error && (
          <div className="mt-6">
            <ErrorBox message={error} onRetry={() => void load()} />
          </div>
        )}

        {loading && (
          <p className="mt-8 flex items-center gap-2 text-sm t-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading queue…
          </p>
        )}

        {!loading && items.length === 0 && !error && (
          <Card className="mt-8">
            <p className="text-sm t-muted">
              Nothing is awaiting validation. Submitted evidence appears here once a learner
              sends it.
            </p>
          </Card>
        )}

        {!loading && item && (
          <div className="mt-8 grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
            <div className="rounded-2xl p-3" style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}>
              {items.map((entry, index) => (
                <button
                  key={entry.evidence_id}
                  onClick={() => setSelected(index)}
                  className="w-full rounded-xl p-4 text-left transition"
                  style={
                    selected === index
                      ? { background: "rgba(99,102,241,0.12)", border: "1px solid var(--border)" }
                      : {}
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold t-fg">{entry.title}</p>
                      <p className="mt-1 text-xs t-subtle-fg">
                        {entry.context_ref || "no project ref"} ·{" "}
                        {new Date(entry.occurred_at).toLocaleDateString()}
                      </p>
                    </div>
                    {entry.ai_strength && (
                      <span
                        className="rounded-full px-2 py-1 text-[10px]"
                        style={{ background: "var(--bg-subtle)", color: "var(--fg-muted)" }}
                      >
                        {entry.ai_strength}
                      </span>
                    )}
                  </div>
                  <div className="mt-2">
                    <GroundingBadge
                      grounded={entry.grounded}
                      citationCount={entry.rubric_citations.length}
                    />
                  </div>
                </button>
              ))}
            </div>

            <div className="rounded-2xl p-6" style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs t-subtle-fg">Learner {item.learner_id}</p>
                  <h2 className="mt-1 text-2xl font-semibold t-fg">{item.title}</h2>
                </div>
                <FileCheck2 className="h-6 w-6 shrink-0 text-indigo-400" />
              </div>

              <div
                className="mt-5 rounded-xl p-4"
                style={{ border: "1px solid rgba(99,102,241,0.2)", background: "rgba(99,102,241,0.06)" }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--accent-fg)" }}>
                    <Sparkles className="h-4 w-4" />
                    Evidence brief
                  </div>
                  <div className="flex items-center gap-2">
                    <GroundingBadge
                      grounded={item.grounded}
                      citationCount={item.rubric_citations.length}
                    />
                    {!item.ai_generated && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] t-muted"
                        style={{ background: "var(--bg-subtle)" }}
                      >
                        No model
                      </span>
                    )}
                  </div>
                </div>
                <p className="mt-3 text-sm leading-6 t-fg">{item.ai_summary}</p>
                {item.rubric_citations.length > 0 && (
                  <div className="mt-3">
                    <CitationList slugs={item.rubric_citations} />
                  </div>
                )}
                {item.concerns.length > 0 && (
                  <ul className="mt-3 space-y-1 text-[11px] leading-5 t-muted">
                    {item.concerns.map((c) => (
                      <li key={c}>· {c}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="mt-6">
                <h3 className="text-sm font-semibold t-fg">Your judgement</h3>
                <p className="mt-1 text-[11px] t-subtle-fg">
                  Rate the evidence yourself. The review above does not pre-fill this.
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  {STRENGTHS.map((s) => (
                    <button
                      key={s}
                      onClick={() => setStrength(s)}
                      className="rounded-lg px-3 py-2 text-xs font-medium capitalize transition"
                      style={
                        strength === s
                          ? { background: "var(--accent-fg)", color: "white" }
                          : { background: "var(--bg-subtle)", color: "var(--fg-muted)" }
                      }
                    >
                      {s}
                    </button>
                  ))}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Toggle
                    label="Observed in work?"
                    value={observed}
                    onChange={setObserved}
                  />
                  <Toggle
                    label="Applied independently?"
                    value={independent}
                    onChange={setIndependent}
                  />
                </div>

                <textarea
                  rows={3}
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Feedback for the learner (optional)"
                  className="mt-4 w-full rounded-xl px-4 py-3 text-sm outline-none"
                  style={{
                    border: "1px solid var(--border)",
                    background: "var(--bg-input)",
                    color: "var(--fg)",
                  }}
                />

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    disabled={saving}
                    onClick={() => void decide("approved")}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                  >
                    <ShieldCheck className="h-4 w-4" /> Validate
                  </button>
                  <button
                    disabled={saving}
                    onClick={() => void decide("needs_revision")}
                    className="rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50"
                    style={{ background: "var(--bg-subtle)", color: "var(--fg)" }}
                  >
                    Request revision
                  </button>
                  <button
                    disabled={saving}
                    onClick={() => void decide("rejected")}
                    className="rounded-xl px-4 py-2.5 text-sm font-semibold text-rose-600 transition disabled:opacity-50 dark:text-rose-400"
                    style={{ background: "rgba(244,63,94,0.08)" }}
                  >
                    Reject
                  </button>
                  {saving && <Loader2 className="h-5 w-5 animate-spin self-center t-muted" />}
                </div>
              </div>
            </div>
          </div>
        )}

        <Back role="manager" />
      </div>
    </main>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean | null) => void;
}) {
  return (
    <div>
      <p className="text-xs t-muted">{label}</p>
      <div className="mt-1.5 flex gap-1.5">
        {[
          { v: true, l: "Yes" },
          { v: false, l: "No" },
          { v: null, l: "Not observed" },
        ].map((opt) => (
          <button
            key={opt.l}
            onClick={() => onChange(opt.v)}
            className="rounded-lg px-2.5 py-1.5 text-[11px] transition"
            style={
              value === opt.v
                ? { background: "var(--accent-fg)", color: "white" }
                : { background: "var(--bg-subtle)", color: "var(--fg-muted)" }
            }
          >
            {opt.l}
          </button>
        ))}
      </div>
    </div>
  );
}

// ===========================================================================
// Admin: knowledge explorer
// ===========================================================================

export function AdminHealthPage() {
  const [status, setStatus] = useState<IndexStatus | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getIndexStatus()
      .then(setStatus)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load status."));
  }, []);

  async function runSearch(event: React.FormEvent) {
    event.preventDefault();
    if (query.trim().length < 2) return;
    setSearching(true);
    setError(null);
    try {
      setHits(await searchKnowledge(query));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <main className={shell}>
      <Header role="admin" />
      <div className="mx-auto max-w-[1180px] px-5 py-10 lg:px-8">
        <p className="text-xs font-bold uppercase tracking-[.18em]" style={{ color: "var(--accent-fg)" }}>
          Admin workspace / Knowledge
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-.04em] t-fg">
          Approved knowledge and retrieval health.
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 t-muted">
          This is the only corpus the AI may retrieve from. Anything not approved here is
          invisible to evidence review.
        </p>

        {error && (
          <div className="mt-6">
            <ErrorBox message={error} />
          </div>
        )}

        <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_1.4fr]">
          <div className="space-y-4">
            <RetrievalHealth status={status} />
          </div>

          <Card>
            <h2 className="font-semibold t-fg">Search approved knowledge</h2>
            <p className="mt-1 text-xs t-subtle-fg">
              The same retrieval path evidence review uses.
            </p>
            <form onSubmit={runSearch} className="mt-4 flex gap-2">
              <div
                className="flex flex-1 items-center gap-2 rounded-xl px-3 py-2"
                style={{ background: "var(--bg-subtle)" }}
              >
                <Search className="h-4 w-4 t-subtle-fg" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="e.g. what counts as weak evidence"
                  className="w-full bg-transparent text-sm outline-none t-fg"
                />
              </div>
              <button
                disabled={searching}
                className="rounded-xl bg-indigo-500 px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                {searching ? "…" : "Search"}
              </button>
            </form>

            <div className="mt-5 space-y-3">
              {hits.map((h) => (
                <div key={h.slug} className="rounded-xl p-3" style={{ background: "var(--bg-subtle)" }}>
                  <div className="flex flex-wrap items-center gap-2">
                    <RubricCitation slug={h.slug} />
                    <span className="text-[11px] t-subtle-fg">
                      {h.kind.replace(/_/g, " ")}
                      {h.level ? ` · ${h.level}` : ""}
                      {h.via_graph ? " · via graph" : ""}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 t-muted">{h.excerpt.slice(0, 220)}…</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Back role="admin" />
      </div>
    </main>
  );
}
