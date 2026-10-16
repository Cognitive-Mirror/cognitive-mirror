"use client";

/**
 * Manager: read the evidence, then decide.
 *
 * The manager's own strength rating is what counts (thesis 17). It starts
 * empty - neither the AI's rating nor a default pre-fills it - and validation
 * is disabled until one is chosen.
 */

import { useState } from "react";
import { Check, Loader2, ShieldCheck } from "lucide-react";

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
import { GroundingBadge } from "@/components/RubricCitation";
import { ReviewPanel, quoteSpans } from "@/components/evidence/ReviewPanel";
import { ArtifactBadges, ProvenanceBadge } from "@/components/explain/Badges";
import { HighlightedText } from "@/components/explain/HighlightedText";
import { useResource } from "@/lib/useResource";
import {
  type EvidenceStrength,
  getPendingEvidence,
  type PendingEvidence,
  type ValidationDecision,
  validateEvidence,
} from "@/services/api";

const STRENGTHS: EvidenceStrength[] = ["weak", "moderate", "strong", "exceptional"];

export function ManagerEvidencePage() {
  const queue = useResource(getPendingEvidence);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const items = queue.data ?? [];
  const item = items.find((i) => i.evidence_id === selectedId) ?? items[0];

  return (
    <AppShell role="manager" active="/manager/evidence">
      <PageIntro
        eyebrow="Manager / Evidence validation"
        title="Read the evidence, then decide."
        text="Your judgement is what makes capability state real. The AI review is context; it does not set the rating."
      />

      {notice && (
        <p className="mb-5 flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          <Check className="h-4 w-4" /> {notice}
        </p>
      )}
      {queue.error && <ErrorNote message={queue.error} onRetry={queue.reload} />}
      {queue.loading && <Loading label="Loading queue…" />}

      {!queue.loading && !queue.error && items.length === 0 && (
        <Card>
          <p className="text-sm t-muted">Nothing from your team is awaiting validation.</p>
        </Card>
      )}

      {item && (
        <div className="grid gap-5 lg:grid-cols-[.75fr_1.25fr]">
          <Card className="!p-3">
            {items.map((entry) => (
              <button
                key={entry.evidence_id}
                onClick={() => setSelectedId(entry.evidence_id)}
                className="w-full rounded-xl p-4 text-left transition"
                style={entry === item ? { background: "rgba(99,102,241,0.12)" } : {}}
              >
                <p className="text-sm font-semibold t-fg">{entry.title}</p>
                <p className="mt-1 text-xs t-subtle-fg">
                  {entry.learner_name} · {entry.capability_name} ·{" "}
                  {new Date(entry.occurred_at).toLocaleDateString()}
                </p>
                {entry.review && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <GroundingBadge
                      grounded={entry.review.grounded}
                      citationCount={entry.review.rubric_citations.length}
                    />
                    <ProvenanceBadge provenance={entry.review.provenance} model={entry.review.model_name} />
                  </div>
                )}
                {entry.artifacts.length > 0 && (
                  <div className="mt-2">
                    <ArtifactBadges artifacts={entry.artifacts} compact />
                  </div>
                )}
              </button>
            ))}
          </Card>

          <Decision
            key={item.evidence_id}
            item={item}
            onDone={(message) => {
              setNotice(message);
              setSelectedId(null);
              queue.reload();
            }}
          />
        </div>
      )}
    </AppShell>
  );
}

function Decision({ item, onDone }: { item: PendingEvidence; onDone: (message: string) => void }) {
  const [strength, setStrength] = useState<EvidenceStrength | null>(null);
  const [observed, setObserved] = useState<boolean | null>(null);
  const [independent, setIndependent] = useState<boolean | null>(null);
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: ValidationDecision["decision"]) {
    setSaving(true);
    setError(null);
    try {
      const state = await validateEvidence(item.evidence_id, {
        decision,
        // Rejection and revision need no rating; validation requires one.
        strength: strength ?? "weak",
        observed_in_work: observed ?? undefined,
        applied_independently: independent ?? undefined,
        feedback,
      });
      const unlocked = decision === "approved" && state.state_confidence > 0.4;
      onDone(
        `Recorded. ${state.capability_name} for ${item.learner_name} is now ` +
          `${state.attained_level} at ${state.state_confidence.toFixed(2)} confidence` +
          (unlocked ? " — above the 0.40 ceiling that only manager validation can lift." : "."),
      );
    } catch (err) {
      setError(describeError(err, "Could not record the decision."));
      setSaving(false);
    }
  }

  return (
    <Card>
      <p className="text-xs t-subtle-fg">
        {item.learner_name}
        {item.context_ref && ` · ${item.context_ref}`}
      </p>
      <h2 className="mt-1 text-2xl font-semibold t-fg">{item.title}</h2>

      <p className="mt-1 text-xs t-muted">{item.capability_name}</p>

      <div className="mt-4 rounded-xl p-4" style={{ background: "var(--bg-subtle)" }}>
        {item.review ? (
          <HighlightedText text={item.content} spans={quoteSpans(item.review)} />
        ) : (
          <p className="whitespace-pre-line text-sm leading-6 t-fg">{item.content}</p>
        )}
      </div>
      {item.context && <p className="mt-2 text-xs t-muted">Context: {item.context}</p>}
      {item.artifacts.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide t-subtle-fg">Evidence artifacts</p>
          <ArtifactBadges artifacts={item.artifacts} />
        </div>
      )}

      {item.review && (
        <div className="mt-5">
          <ReviewPanel review={item.review} title="AI review (context only)" />
        </div>
      )}

      <h3 className="mt-6 text-sm font-semibold t-fg">Your judgement</h3>
      <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Evidence strength">
        {STRENGTHS.map((s) => (
          <button
            key={s}
            role="radio"
            aria-checked={strength === s}
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
        <TriState label="Observed in work?" value={observed} onChange={setObserved} />
        <TriState label="Applied independently?" value={independent} onChange={setIndependent} />
      </div>

      <textarea
        rows={3}
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        placeholder="Feedback for the learner (optional)"
        className={`mt-4 ${fieldClass}`}
        style={fieldStyle}
      />

      {error && <div className="mt-4"><ErrorNote message={error} /></div>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          disabled={saving || !strength}
          onClick={() => void decide("approved")}
          title={strength ? undefined : "Choose a strength first"}
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
        {saving && <Loader2 className="h-5 w-5 animate-spin t-muted" />}
      </div>
    </Card>
  );
}

function TriState({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean | null) => void;
}) {
  const options: { v: boolean | null; l: string }[] = [
    { v: true, l: "Yes" },
    { v: false, l: "No" },
    { v: null, l: "Can't say" },
  ];
  return (
    <div>
      <p className="text-xs t-muted">{label}</p>
      <div className="mt-1.5 flex gap-1.5">
        {options.map((opt) => (
          <button
            key={opt.l}
            onClick={() => onChange(opt.v)}
            aria-pressed={value === opt.v}
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
