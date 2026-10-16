"use client";

/**
 * Learner overview: live capability state across the Spine.
 *
 * Validated level, what current evidence supports, and confidence are shown as
 * three separate readings. Collapsing them into one score would throw away the
 * D1 argument - decayed evidence means "we are less sure", not "this person got
 * worse". Nothing here is invented: if the backend does not compute it, it is
 * not shown.
 */

import Link from "next/link";
import { FileCheck2, Plus, RefreshCw, Sparkles, Target, TrendingUp } from "lucide-react";

import { AppShell, Card, ErrorNote, Loading, PageIntro } from "@/components/AppShell";
import { Metric } from "@/components/dashboard/Metric";
import { AuditTrailButton } from "@/components/explain/AuditTrail";
import { useResource } from "@/lib/useResource";
import {
  type CapabilityState,
  CONFIDENCE_BAND_LABEL,
  formatLevel,
  getMyCapabilityStates,
  KNOWING_DOING_LABEL,
  levelPercent,
} from "@/services/api";

const BAND_COLOR: Record<string, string> = {
  high: "text-emerald-600 dark:text-emerald-400",
  moderate: "text-indigo-600 dark:text-indigo-400",
  low: "text-amber-600 dark:text-amber-400",
  revalidation_due: "text-rose-600 dark:text-rose-400",
};

export function LearnerOverview() {
  const { data, error, loading, reload } = useResource(getMyCapabilityStates);
  const states = data ?? [];

  const atOrAbove = states.filter((s) => s.gap <= 0).length;
  const revalidation = states.filter((s) => s.needs_revalidation).length;
  const pending = states.reduce((sum, s) => sum + s.provisional_points, 0);
  const nextActions = states.filter((s) => s.gap > 0 || s.needs_revalidation).slice(0, 3);
  const modelVersion = states.find((s) => s.scoring_model_version)?.scoring_model_version;

  return (
    <AppShell role="learner" active="/learner">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <PageIntro
          eyebrow="Your capability state"
          title="Build confidence that is earned."
          text="Learning builds what you know. Validated work is what moves your level."
        />
        <Link
          href="/learner/evidence"
          className="mb-8 inline-flex shrink-0 items-center gap-2 rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400"
        >
          <Plus className="h-4 w-4" /> Submit evidence
        </Link>
      </div>

      {error && <ErrorNote message={error} onRetry={reload} />}
      {loading && <Loading label="Loading capability state…" />}

      {!loading && !error && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Capabilities tracked" value={String(states.length)} detail="in the capability spine" icon={Target} />
            <Metric label="At or above required" value={`${atOrAbove}/${states.length}`} detail="validated level vs requirement" icon={TrendingUp} />
            <Metric label="Awaiting validation" value={pending.toFixed(1)} detail="points not yet counted" icon={FileCheck2} />
            <Metric label="Revalidation due" value={String(revalidation)} detail="supporting evidence has aged" icon={RefreshCw} />
          </div>

          <Card className="mt-5">
            <h2 className="font-semibold t-fg">Capability state</h2>
            <p className="mt-1 text-xs t-subtle-fg">
              Validated level, what current evidence supports, and how confident we are — as
              separate readings.
            </p>
            {states.length === 0 ? (
              <p className="mt-6 text-sm t-muted">No capabilities are configured yet.</p>
            ) : (
              <div className="mt-6 space-y-6">
                {states.map((s) => <CapabilityRow key={s.capability_id} state={s} />)}
              </div>
            )}
          </Card>

          {states.length > 0 && (
            <Card className="mt-5">
              <h2 className="flex items-center gap-2 font-semibold" style={{ color: "var(--accent-fg)" }}>
                <Sparkles className="h-5 w-5" /> Next actions
              </h2>
              <ul className="mt-4 space-y-3 text-sm leading-6">
                {nextActions.map((s) => (
                  <li key={s.capability_id}>
                    <span className="font-medium t-fg">{s.capability_name}:</span>{" "}
                    <span className="t-muted">{s.recommended_next_action}</span>
                  </li>
                ))}
                {nextActions.length === 0 && (
                  <li className="t-muted">
                    Every capability is at or above its required level with current evidence.
                  </li>
                )}
              </ul>
            </Card>
          )}

          {modelVersion && (
            <p className="mt-6 text-[11px] t-subtle-fg">
              Scoring model {modelVersion}. Constants are seeded, not yet calibrated against
              outcome data.
            </p>
          )}
        </>
      )}
    </AppShell>
  );
}

/** One capability: attained bar, current-support bar and required marker, drawn separately. */
function CapabilityRow({ state }: { state: CapabilityState }) {
  const attainedPct = levelPercent(state.attained_level);
  const supportPct = levelPercent(state.current_support_level);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-medium t-fg">{state.capability_name}</span>
        <span className={`text-xs ${BAND_COLOR[state.confidence_band] ?? "t-muted"}`}>
          {CONFIDENCE_BAND_LABEL[state.confidence_band]} · {Math.round(state.state_confidence * 100)}%
        </span>
      </div>

      <div className="relative h-2 overflow-hidden rounded-full" style={{ background: "var(--bg-subtle)" }}>
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-indigo-500 to-violet-400"
          style={{ width: `${attainedPct}%` }}
        />
        {supportPct < attainedPct && (
          <div className="absolute inset-y-0 left-0 rounded-full bg-indigo-300/70" style={{ width: `${supportPct}%` }} />
        )}
        <div
          className="absolute inset-y-0 w-0.5 bg-amber-500"
          style={{ left: `${levelPercent(state.required_level)}%` }}
          title={`Required: ${formatLevel(state.required_level)}`}
        />
      </div>

      <div className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-[11px] t-subtle-fg">
        <span>
          Validated <strong className="t-fg">{formatLevel(state.attained_level)}</strong>
          {state.needs_revalidation && (
            <>
              {" · evidence now supports "}
              <strong className="t-fg">{formatLevel(state.current_support_level)}</strong>
            </>
          )}
        </span>
        <span title={state.required_level_provenance}>
          Required {formatLevel(state.required_level)} · {state.required_level_source.replace(/_/g, " ")}
        </span>
      </div>

      {state.needs_revalidation && (
        <p
          className="mt-2 flex items-start gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] leading-4 text-rose-700 dark:text-rose-300"
          style={{ background: "rgba(244,63,94,0.08)" }}
        >
          <RefreshCw className="mt-px h-3 w-3 shrink-0" />
          Revalidation due. Not a downgrade: the validated level stands, but its supporting
          evidence has aged.
        </p>
      )}
      {state.provisional_points > 0 && (
        <p className="mt-2 text-[11px] t-subtle-fg">
          {state.provisional_points.toFixed(1)} points awaiting manager validation (not counted).
        </p>
      )}
      {state.knowledge_mastery !== null && (
        <p className="mt-2 text-[11px] t-subtle-fg">
          Knows <strong className="t-fg">{Math.round(state.knowledge_mastery * 100)}%</strong> ·{" "}
          {KNOWING_DOING_LABEL[state.knowing_doing]}
        </p>
      )}
      {state.validated_points === 0 && state.knowledge_mastery !== null && (
        <p className="mt-1 text-[11px] t-subtle-fg">
          Confidence is capped at 0.40 until a manager validates workplace evidence — no volume of
          assessment can lift it.
        </p>
      )}
      {(state.status !== "not_started" || state.knowledge_mastery !== null) && (
        <div className="mt-2">
          <AuditTrailButton capabilityId={state.capability_id} />
        </div>
      )}
    </div>
  );
}
