"use client";

/**
 * Manager: read the evidence, then decide.
 *
 * The manager's own strength rating is what counts (thesis 17). It starts
 * empty - neither the AI's rating nor a default pre-fills it - and validation
 * is disabled until one is chosen.
 */

import { useState } from "react";
import { CircleCheck, Loader2, ShieldCheck } from "lucide-react";

import { AppShell, ErrorNote, Loading, PageIntro, describeError } from "@/components/AppShell";
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
        title="Read the evidence, then decide."
        text="Your judgement is what makes capability state real. The AI review is context: it does not set the rating."
      />

      {notice && (
        <p className="note note-success mb-6" role="status">
          <CircleCheck /> {notice}
        </p>
      )}
      {queue.error && <ErrorNote message={queue.error} onRetry={queue.reload} />}
      {queue.loading && !queue.data && <Loading label="Loading the queue…" />}

      {queue.data && items.length === 0 && (
        <p className="inset px-5 py-6 text-sm t-muted">Nothing from your team is waiting for validation.</p>
      )}

      {item && (
        <div className="grid gap-8 lg:grid-cols-[18rem_1fr]">
          <section aria-label="Waiting for validation">
            <p className="caption mb-2">{items.length} waiting</p>
            <div className="rows rule rule-b">
              {items.map((entry) => {
                const on = entry === item;
                return (
                  <button
                    key={entry.evidence_id}
                    onClick={() => setSelectedId(entry.evidence_id)}
                    aria-current={on ? "true" : undefined}
                    className="block w-full px-3 py-4 text-left transition"
                    style={on ? { background: "var(--primary-tint)", boxShadow: "inset 3px 0 0 var(--primary)" } : undefined}
                  >
                    <p className="text-sm font-medium leading-5 t-fg">{entry.title}</p>
                    <p className="meta mt-1">
                      {entry.learner_name} · {entry.capability_name}
                    </p>
                    <p className="meta">
                      Worked {new Date(entry.occurred_at).toLocaleDateString()}
                    </p>
                    {entry.review && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        <GroundingBadge grounded={entry.review.grounded} citationCount={entry.review.rubric_citations.length} />
                        <ProvenanceBadge provenance={entry.review.provenance} model={entry.review.model_name} />
                      </div>
                    )}
                    {entry.artifacts.length > 0 && (
                      <div className="mt-2">
                        <ArtifactBadges artifacts={entry.artifacts} compact />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

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
          (unlocked ? ", above the 0.40 ceiling that only manager validation can lift." : "."),
      );
    } catch (err) {
      setError(describeError(err, "Could not record the decision."));
      setSaving(false);
    }
  }

  return (
    <article className="min-w-0">
      <p className="meta">
        {item.learner_name} · {item.capability_name}
        {item.context_ref && ` · ${item.context_ref}`}
      </p>
      <h2 className="display display-md mt-2">{item.title}</h2>

      <div className="mt-6 max-w-[68ch]">
        {item.review ? (
          <HighlightedText text={item.content} spans={quoteSpans(item.review)} />
        ) : (
          <p className="reading whitespace-pre-line">{item.content}</p>
        )}
      </div>
      {item.context && <p className="meta mt-3">Context: {item.context}</p>}
      {item.artifacts.length > 0 && (
        <div className="mt-5">
          <p className="caption mb-2">Evidence artifacts</p>
          <ArtifactBadges artifacts={item.artifacts} />
        </div>
      )}

      {item.review && (
        <div className="mt-8">
          <ReviewPanel review={item.review} title="AI review · context only" />
        </div>
      )}

      <section className="mt-10 rule pt-8" aria-labelledby="judgement">
        <h3 id="judgement" className="display display-sm">Your judgement</h3>
        <p className="meta mt-1">Choose a strength to validate. Weak evidence counts for zero points by design.</p>

        <div className="mt-5 space-y-5">
          <div>
            <p className="field-label">Strength</p>
            <div className="segmented" role="radiogroup" aria-label="Evidence strength">
              {STRENGTHS.map((s) => (
                <button key={s} role="radio" aria-checked={strength === s} onClick={() => setStrength(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <TriState label="Did you observe it in the work?" value={observed} onChange={setObserved} />
            <TriState label="Was it applied independently?" value={independent} onChange={setIndependent} />
          </div>
          <div>
            <label htmlFor="feedback" className="field-label">Feedback for the learner</label>
            <textarea
              id="feedback"
              rows={3}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Optional. What you saw, and what would make it stronger."
              className="field"
            />
          </div>
        </div>

        {error && <div className="mt-4"><ErrorNote message={error} /></div>}

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <button
            disabled={saving || !strength}
            onClick={() => void decide("approved")}
            title={strength ? undefined : "Choose a strength first"}
            className="btn btn-confirm"
          >
            <ShieldCheck /> Validate
          </button>
          <button disabled={saving} onClick={() => void decide("needs_revision")} className="btn btn-neutral">
            Request revision
          </button>
          <button disabled={saving} onClick={() => void decide("rejected")} className="btn btn-danger">
            Reject
          </button>
          {saving && <Loader2 className="h-5 w-5 animate-spin t-muted" />}
        </div>
      </section>
    </article>
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
      <p className="field-label">{label}</p>
      <div className="segmented">
        {options.map((opt) => (
          <button key={opt.l} onClick={() => onChange(opt.v)} aria-pressed={value === opt.v}>
            {opt.l}
          </button>
        ))}
      </div>
    </div>
  );
}
