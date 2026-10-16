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
import { ArrowRight, ChevronDown, ChevronUp, CircleCheck, Loader2, Plus, Trash2 } from "lucide-react";

import { AppShell, ErrorNote, Loading, PageIntro, describeError } from "@/components/AppShell";
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
        title="Show what changed in your work."
        text="Your submission is reviewed against the approved rubric for the capability, then sent to your manager. Their decision is what moves your level."
      />

      {page.error && <ErrorNote message={page.error} onRetry={page.reload} />}
      {error && <div className="mb-4"><ErrorNote message={error} /></div>}
      {page.loading && !page.data && <Loading label="Loading…" />}

      {result && (
        <div className="mb-6 space-y-4">
          <p className="note note-success" role="status">
            <CircleCheck />
            Submitted. It counts {result.data.capability_state.provisional_points.toFixed(1)} provisional
            points until your manager validates it — confidence stays capped at 0.40 until then.
          </p>
          <ReviewPanel review={result.data.review} content={result.content} />
        </div>
      )}

      {page.data && (
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <section aria-label="New evidence">
            <form onSubmit={submit} className="space-y-6">
              <Field label="Capability demonstrated" id="ev-cap">
                <select
                  id="ev-cap"
                  required
                  value={capabilityId}
                  onChange={(e) => set("capabilityId")(e.target.value)}
                  className="field"
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
                  className="field"
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
                  className="field"
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Workplace context" id="ev-ctx">
                  <input
                    id="ev-ctx"
                    value={form.context}
                    onChange={(e) => set("context")(e.target.value)}
                    placeholder="e.g. Quarterly business review"
                    className="field"
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
                    className="field"
                  />
                </Field>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[13px] font-medium t-fg">Evidence artifacts</span>
                  <button
                    type="button"
                    disabled={form.artifacts.length >= MAX_ARTIFACTS}
                    onClick={() => setForm((f) => ({ ...f, artifacts: [...f.artifacts, { url: "", label: "" }] }))}
                    className="btn btn-text btn-sm -mr-2"
                  >
                    <Plus /> Add link
                  </button>
                </div>
                {form.artifacts.length === 0 && (
                  <p className="field-hint mt-0">
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
                        className="field flex-[2]"
                      />
                      <input
                        aria-label={`Artifact ${i + 1} label`}
                        value={a.label}
                        onChange={(e) => setArtifact(i, "label", e.target.value)}
                        placeholder="Label"
                        className="field flex-1"
                      />
                      <button
                        type="button"
                        aria-label={`Remove artifact ${i + 1}`}
                        onClick={() => setForm((f) => ({ ...f, artifacts: f.artifacts.filter((_, j) => j !== i) }))}
                        className="btn btn-icon shrink-0"
                      >
                        <Trash2 />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3 rule pt-6">
                <button disabled={submitting || !capabilityId} className="btn btn-primary btn-lg">
                  {submitting ? (
                    <>
                      <Loader2 className="animate-spin" /> Reviewing against the rubric…
                    </>
                  ) : (
                    <>
                      Submit for validation <ArrowRight />
                    </>
                  )}
                </button>
                <p className="meta">Your manager sees it next.</p>
              </div>
            </form>
          </section>

          <aside className="h-fit space-y-8 lg:sticky lg:top-24">
            <section>
              <h2 className="display display-sm">What makes evidence strong</h2>
              <ol className="mt-4 space-y-4 text-sm leading-6">
                {[
                  ["Context", "What was the situation, and who was involved?"],
                  ["Action", "What did you personally do, distinct from the team?"],
                  ["Outcome", "What changed, and how do you know?"],
                ].map(([k, v], i) => (
                  <li key={k} className="grid grid-cols-[1.5rem_1fr] gap-2">
                    <span className="display text-base ink-primary">{i + 1}</span>
                    <span><strong className="font-medium t-fg">{k}.</strong> <span className="t-muted">{v}</span></span>
                  </li>
                ))}
              </ol>
            </section>
            <RetrievalHealth status={status} />
          </aside>
        </div>
      )}

      {page.data && history.length > 0 && (
        <section className="mt-16" aria-labelledby="history">
          <h2 id="history" className="display display-sm">Your evidence history</h2>
          <p className="meta mt-1">Newest first. Only validated items count toward your level.</p>
          <div className="rows mt-4 rule rule-b">
            {history.map((item) => <HistoryCard key={item.evidence_id} item={item} />)}
          </div>
        </section>
      )}
    </AppShell>
  );
}

const STATUS_TAG: Record<string, { label: string; className: string }> = {
  pending: { label: "Waiting on your manager", className: "tag tag-pending" },
  validated: { label: "Validated", className: "tag tag-does" },
  rejected: { label: "Not accepted", className: "tag tag-risk" },
  disputed: { label: "Escalated", className: "tag tag-primary" },
};

function HistoryCard({ item }: { item: MyEvidence }) {
  const [open, setOpen] = useState(false);
  const tag = STATUS_TAG[item.validation_status] ?? STATUS_TAG.pending;
  return (
    <article className="py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[0.9375rem] font-medium t-fg">{item.title}</h3>
          <p className="meta mt-1">
            {item.capability_name} · submitted {new Date(item.submitted_at).toLocaleDateString()}
            {item.context_ref && ` · ${item.context_ref}`}
          </p>
        </div>
        <span className={tag.className}>
          {tag.label}
          {item.decision && item.validation_status === "validated" && ` · ${item.decision.strength}`}
        </span>
      </div>
      {item.artifacts.length > 0 && <div className="mt-3"><ArtifactBadges artifacts={item.artifacts} /></div>}
      {item.decision?.feedback && (
        <blockquote className="mt-3 max-w-[68ch] text-sm leading-6 t-muted">
          <span className="font-medium t-fg">Your manager: </span>&ldquo;{item.decision.feedback}&rdquo;
        </blockquote>
      )}
      {item.review && (
        <button onClick={() => setOpen((v) => !v)} className="btn btn-text btn-sm -ml-3 mt-2">
          {open ? <ChevronUp /> : <ChevronDown />}
          {open ? "Hide" : "Show"} the AI review
        </button>
      )}
      {open && item.review && (
        <div className="mt-3">
          <ReviewPanel review={item.review} content={item.content} />
        </div>
      )}
    </article>
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
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}
