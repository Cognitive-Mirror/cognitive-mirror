"use client";

/**
 * Learner: submit workplace evidence.
 *
 * The submission is reviewed against the approved rubric, then waits for the
 * manager - whose decision, not the AI's, moves capability state.
 */

import { useState } from "react";
import { ArrowRight, Check, Loader2 } from "lucide-react";

import {
  AppShell,
  Card,
  ErrorNote,
  Loading,
  PageIntro,
  describeError,
  fieldClass,
  fieldStyle,
} from "@/components/AppShell";
import { RetrievalHealth } from "@/components/RetrievalHealth";
import { ReviewPanel } from "@/components/evidence/ReviewPanel";
import { useResource } from "@/lib/useResource";
import {
  type EvidenceSubmitResult,
  getIndexStatus,
  getMyCapabilityStates,
  submitEvidence,
} from "@/services/api";

const MIN_CHARS = 120; // mirrors the backend triage floor

const EMPTY = { capabilityId: "", title: "", content: "", context: "", contextRef: "" };

const loadPage = () =>
  Promise.all([getMyCapabilityStates(), getIndexStatus().catch(() => null)]);

export function LearnerEvidencePage() {
  const page = useResource(loadPage);
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EvidenceSubmitResult | null>(null);

  const [capabilities, status] = page.data ?? [[], null];
  const capabilityId = form.capabilityId || capabilities[0]?.capability_id || "";
  const set = (field: keyof typeof EMPTY) => (value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      setResult(
        await submitEvidence({
          capability_id: capabilityId,
          evidence_type: "workplace_application",
          title: form.title,
          content: form.content,
          context: form.context,
          context_ref: form.contextRef,
        }),
      );
      setForm({ ...EMPTY, capabilityId });
    } catch (err) {
      setError(describeError(err, "Submission failed."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell role="learner" active="/learner/evidence">
      <PageIntro
        eyebrow="Learner / Evidence"
        title="Show what changed in your work."
        text="Your submission is reviewed against the approved rubric for the capability, then sent to your manager. Their decision is what moves your capability level."
      />

      {page.error && <ErrorNote message={page.error} onRetry={page.reload} />}
      {error && <ErrorNote message={error} />}
      {page.loading && <Loading label="Loading…" />}

      {result && (
        <div className="mb-6 space-y-4">
          <p className="flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
            <Check className="h-4 w-4" />
            Submitted. It counts {result.capability_state.provisional_points.toFixed(1)} provisional
            points until your manager validates it.
          </p>
          <ReviewPanel review={result.review} />
        </div>
      )}

      {!page.loading && (
        <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
          <Card>
            <form onSubmit={submit} className="space-y-5">
              <Field label="Capability demonstrated" id="ev-cap">
                <select
                  id="ev-cap"
                  required
                  value={capabilityId}
                  onChange={(e) => set("capabilityId")(e.target.value)}
                  className={fieldClass}
                  style={fieldStyle}
                >
                  {capabilities.map((c) => (
                    <option key={c.capability_id} value={c.capability_id}>
                      {c.capability_name} (required: {c.required_level})
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Evidence title" id="ev-title">
                <input
                  id="ev-title"
                  required
                  minLength={3}
                  value={form.title}
                  onChange={(e) => set("title")(e.target.value)}
                  placeholder="e.g. Reframed the Q2 launch decision"
                  className={fieldClass}
                  style={fieldStyle}
                />
              </Field>

              <Field
                label="What happened?"
                id="ev-body"
                hint={`${form.content.length} characters. Under ${MIN_CHARS} is screened out: too short to carry the specifics evidence needs.`}
              >
                <textarea
                  id="ev-body"
                  required
                  minLength={MIN_CHARS}
                  rows={7}
                  value={form.content}
                  onChange={(e) => set("content")(e.target.value)}
                  placeholder="The situation, what you personally did, and the observable result…"
                  className={fieldClass}
                  style={fieldStyle}
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Workplace context" id="ev-ctx">
                  <input
                    id="ev-ctx"
                    value={form.context}
                    onChange={(e) => set("context")(e.target.value)}
                    placeholder="e.g. Quarterly business review"
                    className={fieldClass}
                    style={fieldStyle}
                  />
                </Field>
                <Field
                  label="Project or situation"
                  id="ev-ref"
                  hint="Evidence from different situations counts for more than repeats of one."
                >
                  <input
                    id="ev-ref"
                    value={form.contextRef}
                    onChange={(e) => set("contextRef")(e.target.value)}
                    placeholder="e.g. project-atlas"
                    className={fieldClass}
                    style={fieldStyle}
                  />
                </Field>
              </div>

              <button
                disabled={submitting || !capabilityId}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Reviewing against the rubric…
                  </>
                ) : (
                  <>
                    Submit for validation <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          </Card>

          <aside className="h-fit space-y-4">
            <Card>
              <h2 className="font-semibold t-fg">What makes evidence strong</h2>
              <ul className="mt-4 space-y-3 text-sm leading-5 t-muted">
                <li><strong className="t-fg">Context:</strong> what was the challenge?</li>
                <li><strong className="t-fg">Action:</strong> what did you personally do?</li>
                <li><strong className="t-fg">Outcome:</strong> what changed, and how do you know?</li>
              </ul>
            </Card>
            <RetrievalHealth status={status} />
          </aside>
        </div>
      )}
    </AppShell>
  );
}

function Field({
  label,
  id,
  hint,
  children,
}: {
  label: string;
  id: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium t-fg" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] t-subtle-fg">{hint}</p>}
    </div>
  );
}
