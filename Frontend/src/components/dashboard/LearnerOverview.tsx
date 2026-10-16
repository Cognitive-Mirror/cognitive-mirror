"use client";

/**
 * Learner overview: the state of every capability, read as a short story.
 *
 * The headline narrates the capability that most needs attention, in words
 * derived only from what the backend computed. Below it, each capability is a
 * Mirror: what the learner knows against what has been validated at work, as
 * two separate readings. Nothing here is invented: if the backend does not
 * compute it, it is not shown.
 */

import Link from "next/link";
import { ArrowRight, BookOpenText, FileCheck2 } from "lucide-react";

import { AppShell, ErrorNote, Loading } from "@/components/AppShell";
import { StatLine } from "@/components/dashboard/Metric";
import { AuditTrailButton } from "@/components/explain/AuditTrail";
import { LEVEL_LABEL, Mirror, narrate } from "@/components/explain/Mirror";
import { useResource } from "@/lib/useResource";
import { type CapabilityState, getMyCapabilityStates } from "@/services/api";

/** The capability whose story matters most right now. */
function focusOf(states: CapabilityState[]): CapabilityState | undefined {
  const rank = (s: CapabilityState) =>
    s.provisional_points > 0 ? 0
    : s.needs_revalidation ? 1
    : s.knowing_doing === "applied_without_knowledge" ? 2
    : s.knowing_doing === "knows_not_applied" ? 3
    : s.status !== "not_started" || s.knowledge_mastery !== null ? 4
    : 5;
  return [...states].sort((a, b) => rank(a) - rank(b))[0];
}

export function LearnerOverview() {
  const { data, error, loading, reload } = useResource(getMyCapabilityStates);
  const states = data ?? [];
  const focus = focusOf(states);
  const story = focus ? narrate(focus) : null;

  const atOrAbove = states.filter((s) => s.gap <= 0).length;
  const revalidation = states.filter((s) => s.needs_revalidation).length;
  const pending = states.reduce((sum, s) => sum + s.provisional_points, 0);
  const modelVersion = states.find((s) => s.scoring_model_version)?.scoring_model_version;

  return (
    <AppShell role="learner" active="/learner">
      {error && <ErrorNote message={error} onRetry={reload} />}
      {loading && !data && <Loading label="Loading your capability state…" />}

      {data && (
        <>
          <header className="max-w-[46rem]">
            <h1 className="display display-lg rise">{story?.headline ?? "Nothing measured yet."}</h1>
            <p className="lede mt-4">
              {focus && <strong className="font-medium t-fg">{focus.capability_name}. </strong>}
              {story?.detail ?? "Start the learning journey, then apply it at work."}
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href="/learner/evidence" className="btn btn-primary">
                <FileCheck2 /> Submit workplace evidence
              </Link>
              <Link href="/learner/learn" className="btn btn-secondary">
                <BookOpenText /> Learning journey
              </Link>
            </div>
          </header>

          <StatLine
            className="mt-10"
            items={[
              { label: "Capabilities", value: states.length },
              { label: "At required level", value: atOrAbove, of: states.length, tone: "does" },
              { label: "Awaiting your manager", value: pending, decimals: 1, suffix: "pts", tone: pending > 0 ? "pending" : undefined },
              { label: "Revalidation due", value: revalidation, tone: revalidation > 0 ? "risk" : undefined },
            ]}
          />

          <section className="mt-14" aria-labelledby="caps">
            <h2 id="caps" className="display display-sm">Every capability, both readings</h2>
            <p className="meta mt-1">
              Blue is what you know. Green is what your manager has validated at work. Only green moves your level.
            </p>
            {states.length === 0 ? (
              <p className="mt-6 text-sm t-muted">No capabilities are configured yet.</p>
            ) : (
              <div className="rows mt-6 rule">
                {states.map((s) => <CapabilityRow key={s.capability_id} state={s} />)}
              </div>
            )}
          </section>

          {modelVersion && (
            <p className="meta mt-10">
              Scoring model {modelVersion}. Constants are seeded, not yet calibrated against outcome data.
            </p>
          )}
        </>
      )}
    </AppShell>
  );
}

function CapabilityRow({ state: s }: { state: CapabilityState }) {
  const story = narrate(s);
  const active = s.status !== "not_started" || s.knowledge_mastery !== null;
  return (
    <article className="grid gap-6 py-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] lg:gap-14">
      <div>
        <h3 className="display display-sm">{s.capability_name}</h3>
        <p className="meta mt-1.5" title={s.required_level_provenance}>
          Required: {LEVEL_LABEL[s.required_level]} · set by {s.required_level_source.replace(/_/g, " ")}
        </p>
        <p className="mt-4 font-medium leading-6 t-fg">{story.headline}</p>
        <p className="mt-1 leading-6 t-muted">{s.recommended_next_action}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {s.provisional_points > 0 && (
            <span className="tag tag-pending">{s.provisional_points.toFixed(1)} pts awaiting validation</span>
          )}
          {s.needs_revalidation && <span className="tag tag-risk">Revalidation due</span>}
          {s.validated_points === 0 && s.knowledge_mastery !== null && (
            <span className="tag" title="No volume of assessment can lift confidence past 0.40 without a manager.">
              Confidence capped at 0.40 until validated
            </span>
          )}
          {active && <AuditTrailButton capabilityId={s.capability_id} />}
        </div>
      </div>
      <div className="lg:pt-1">
        <Mirror state={s} />
        {!active && (
          <Link href="/learner/learn" className="btn btn-text -ml-3 mt-3">
            Start the journey <ArrowRight />
          </Link>
        )}
      </div>
    </article>
  );
}
