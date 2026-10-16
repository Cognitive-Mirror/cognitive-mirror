"use client";

/**
 * Learner: submit workplace evidence, and see where earlier submissions stand.
 *
 * The submission is reviewed against the approved rubric, then waits for the
 * manager - whose decision, not the AI's, moves capability state. Artifact
 * links (a PR, a design doc, a ticket, a recording) let the manager check the
 * work itself rather than only the account of it.
 */

import { useState } from "react";
import { ArrowRight, Check, ChevronDown, ChevronUp, Loader2, Plus, Trash2 } from "lucide-react";

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
import { FillSamplePills, useDemoSamples } from "@/components/demo/FillSamplePills";
import { ReviewPanel } from "@/components/evidence/ReviewPanel";
import { ArtifactBadges } from "@/components/explain/Badges";
import { useResource } from "@/lib/useResource";
import {
  type EvidenceSubmitResult,
  getIndexStatus,
  getMyCapabilityStates,
  getMyEvidence,
  type MyEvidence,
  submitEvidence,
} from "@/services/api";

const MIN_CHARS = 120; // mirrors the backend triage floor
const MAX_ARTIFACTS = 6; // mirrors the backend limit

type ArtifactRow = { url: string; label: string };
const EMPTY = {
  capabilityId: "",
  title: "",
  content: "",
  context: "",
  contextRef: "",
  artifacts: [] as ArtifactRow[],
};

const loadPage = () =>
  Promise.all([getMyCapabilityStates(), getIndexStatus().catch(() => null), getMyEvidence()]);

export function LearnerEvidencePage() {
  const page = useResource(loadPage);
  const samples = useDemoSamples();
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ data: EvidenceSubmitResult; content: string } | null>(null);

  const [capabilities, status, history] = page.data ?? [[], null, []];
  const capabilityId = form.capabilityId || capabilities[0]?.capability_id || "";
  const capabilityName = capabilities.find((c) => c.capability_id === capabilityId)?.capability_name;
  const set = (field: "title" | "content" | "context" | "contextRef" | "capabilityId") => (value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const slug = samples
    ? Object.entries(samples.capability_names).find(([, name]) => name === capabilityName)?.[0]
    : undefined;
  const capabilitySamples = samples?.evidence.filter((s) => s.capability_slug === slug) ?? [];

  function fill(strength: "strong" | "weak") {
    const s = capabilitySamples.find((x) => x.strength === strength);
    if (!s) return;
    setForm({
      capabilityId,
      title: s.title,
      content: s.content,
      context: s.context,
      contextRef: s.context_ref,
      artifacts: s.artifacts.map((a) => ({ url: a.url, label: a.label })),
    });
  }

  function setArtifact(i: number, field: keyof ArtifactRow, value: string) {
    setForm((f) => ({
      ...f,
      artifacts: f.artifacts.map((a, j) => (j === i ? { ...a, [field]: value } : a)),
    }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const content = form.content;
      const data = await submitEvidence({
        capability_id: capabilityId,
        evidence_type: "workplace_application",
        title: form.title,
        content,
        context: form.context,
        context_ref: form.contextRef,
        artifacts: form.artifacts.filter((a) => a.url.trim()),
      });
      setResult({ data, content });
      setForm({ ...EMPTY, capabilityId });
      page.reload();
      window.scrollTo({ top: 0, behavior: "smooth" });
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
      {error && <div className="mb-4"><ErrorNote message={error} /></div>}
      {page.loading && !page.data && <Loading label="Loading…" />}

      {result && (
        <div className="mb-6 space-y-4">
          <p className="flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
            <Check className="h-4 w-4" />
            Submitted. It counts {result.data.capability_state.provisional_points.toFixed(1)} provisional
            points until your manager validates it — confidence stays capped at 0.40 until then.
          </p>
          <ReviewPanel review={result.data.review} content={result.content} />
        </div>
      )}

      {page.data && (
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

              <FillSamplePills
                available={capabilitySamples.map((s) => s.strength)}
                onFill={fill}
                disabled={submitting}
              />

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
                  rows={8}
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

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium t-fg">Evidence artifacts</span>
                  <button
                    type="button"
                    disabled={form.artifacts.length >= MAX_ARTIFACTS}
                    onClick={() => setForm((f) => ({ ...f, artifacts: [...f.artifacts, { url: "", label: "" }] }))}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition disabled:opacity-40"
                    style={{ background: "var(--bg-subtle)", color: "var(--fg-muted)" }}
                  >
                    <Plus className="h-3 w-3" /> Add link
                  </button>
                </div>
                {form.artifacts.length === 0 && (
                  <p className="text-[11px] t-subtle-fg">
                    Optional. A pull request, design doc, ticket, postmortem or recording lets your manager check the work itself.
                  </p>
                )}
                <div className="space-y-2">
                  {form.artifacts.map((a, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        aria-label={`Artifact ${i + 1} URL`}
                        type="url"
                        required
                        value={a.url}
                        onChange={(e) => setArtifact(i, "url", e.target.value)}
                        placeholder="https://github.com/org/repo/pull/123"
                        className={`${fieldClass} flex-[2]`}
                        style={fieldStyle}
                      />
                      <input
                        aria-label={`Artifact ${i + 1} label`}
                        value={a.label}
                        onChange={(e) => setArtifact(i, "label", e.target.value)}
                        placeholder="Label"
                        className={`${fieldClass} flex-1`}
                        style={fieldStyle}
                      />
                      <button
                        type="button"
                        aria-label={`Remove artifact ${i + 1}`}
                        onClick={() => setForm((f) => ({ ...f, artifacts: f.artifacts.filter((_, j) => j !== i) }))}
                        className="grid w-10 shrink-0 place-items-center rounded-xl transition hover:opacity-70"
                        style={{ background: "var(--bg-subtle)" }}
                      >
                        <Trash2 className="h-4 w-4 t-muted" />
                      </button>
                    </div>
                  ))}
                </div>
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

      {page.data && history.length > 0 && (
        <Card className="mt-5">
          <h2 className="font-semibold t-fg">Your evidence history</h2>
          <p className="mt-1 text-xs t-subtle-fg">Newest first. Only validated items count toward your level.</p>
          <div className="mt-4 space-y-3">
            {history.map((item) => <HistoryCard key={item.evidence_id} item={item} />)}
          </div>
        </Card>
      )}
    </AppShell>
  );
}

const STATUS_TONE: Record<string, { label: string; style: React.CSSProperties }> = {
  pending: { label: "Awaiting manager", style: { background: "rgba(245,158,11,.14)", color: "rgb(217,119,6)" } },
  validated: { label: "Validated", style: { background: "rgba(16,185,129,.14)", color: "rgb(5,150,105)" } },
  rejected: { label: "Not accepted", style: { background: "rgba(244,63,94,.12)", color: "rgb(225,29,72)" } },
  disputed: { label: "Escalated", style: { background: "rgba(99,102,241,.14)", color: "var(--accent-fg)" } },
};

function HistoryCard({ item }: { item: MyEvidence }) {
  const [open, setOpen] = useState(false);
  const tone = STATUS_TONE[item.validation_status] ?? STATUS_TONE.pending;
  return (
    <div className="rounded-xl p-4" style={{ border: "1px solid var(--border)", background: "var(--bg-subtle)" }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium t-fg">{item.title}</p>
          <p className="mt-0.5 text-[11px] t-subtle-fg">
            {item.capability_name} · {new Date(item.submitted_at).toLocaleDateString()}
            {item.context_ref && ` · ${item.context_ref}`}
          </p>
        </div>
        <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={tone.style}>
          {tone.label}
          {item.decision && item.validation_status === "validated" && ` · ${item.decision.strength}`}
        </span>
      </div>
      {item.artifacts.length > 0 && <div className="mt-2"><ArtifactBadges artifacts={item.artifacts} /></div>}
      {item.decision?.feedback && (
        <p className="mt-2 text-xs leading-5 t-muted">
          <strong className="t-fg">Manager:</strong> {item.decision.feedback}
        </p>
      )}
      {item.review && (
        <button
          onClick={() => setOpen((v) => !v)}
          className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium"
          style={{ color: "var(--accent-fg)" }}
        >
          {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {open ? "Hide" : "Show"} AI review
        </button>
      )}
      {open && item.review && (
        <div className="mt-3">
          <ReviewPanel review={item.review} content={item.content} />
        </div>
      )}
    </div>
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
