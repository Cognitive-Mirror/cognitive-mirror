"use client";

/**
 * Manager overview: capability coverage across direct reports.
 *
 * Coverage and the full distribution, never an average (D2): levels are an
 * ordinal scale, so a mean is undefined, and it would hide the distribution
 * that decides which intervention is needed.
 */

import Link from "next/link";
import { CircleAlert, Info, RefreshCw, ShieldCheck, Target, UsersRound } from "lucide-react";

import { AppShell, Card, ErrorNote, Loading, PageIntro } from "@/components/AppShell";
import { Metric } from "@/components/dashboard/Metric";
import { useResource } from "@/lib/useResource";
import { formatLevel, getTeamAggregate, type TeamAggregate } from "@/services/api";

export function TeamOverview() {
  const { data, error, loading, reload } = useResource(getTeamAggregate);
  const team = data ?? [];
  const reports = team[0]?.subject_count ?? 0;
  const sum = (pick: (t: TeamAggregate) => number) => team.reduce((n, t) => n + pick(t), 0);

  return (
    <AppShell role="manager" active="/manager">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <PageIntro
          eyebrow="Team capability"
          title="Guide growth where it matters most."
          text="Coverage across your direct reports, validated by you."
        />
        <Link
          href="/manager/evidence"
          className="mb-8 inline-flex shrink-0 items-center gap-2 rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400"
        >
          <ShieldCheck className="h-4 w-4" /> Review evidence
        </Link>
      </div>

      {error && <ErrorNote message={error} onRetry={reload} />}
      {loading && <Loading label="Loading team state…" />}

      {!loading && !error && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Capabilities tracked" value={String(team.length)} detail="in the capability spine" icon={Target} />
            <Metric label="Direct reports" value={String(reports)} detail="in this view" icon={UsersRound} />
            <Metric label="Critical gaps" value={String(sum((t) => t.critical_gap_count))} detail="two or more levels short" icon={CircleAlert} />
            <Metric label="Revalidation due" value={String(sum((t) => t.revalidation_due_count))} detail="across the team" icon={RefreshCw} />
          </div>

          <Card className="mt-5">
            <h2 className="font-semibold t-fg">Team capability coverage</h2>
            <p className="mt-1 text-xs t-subtle-fg">
              Share at or above required, manager-validated, and above the confidence floor.
            </p>
            {reports === 0 ? (
              <p className="mt-6 text-sm t-muted">No direct reports are assigned to you yet.</p>
            ) : (
              <div className="mt-6 space-y-6">
                {team.map((item) => <TeamRow key={item.capability_id} item={item} />)}
              </div>
            )}
            <p className="mt-6 flex items-start gap-1.5 text-[11px] leading-4 t-subtle-fg">
              <Info className="mt-px h-3 w-3 shrink-0" />
              No team average is shown. Levels are ordinal, so a mean is undefined, and it would
              hide the distribution that decides the intervention.
            </p>
          </Card>
        </>
      )}
    </AppShell>
  );
}

function TeamRow({ item }: { item: TeamAggregate }) {
  const total = item.subject_count || 1;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-medium t-fg">{item.capability_name}</span>
        <span className="text-xs t-muted">
          <strong className="t-fg">{Math.round(item.validated_coverage * 100)}%</strong> validated
          coverage
        </span>
      </div>

      <div className="flex h-2 overflow-hidden rounded-full" style={{ background: "var(--bg-subtle)" }}>
        {Object.entries(item.distribution).map(([level, count], index) =>
          count > 0 ? (
            <div
              key={level}
              title={`${formatLevel(level)}: ${count}`}
              style={{
                width: `${(count / total) * 100}%`,
                background: `hsl(${245 - index * 22} 70% ${45 + index * 8}%)`,
              }}
            />
          ) : null,
        )}
      </div>

      <div className="mt-2 flex flex-wrap justify-between gap-x-4 text-[11px] t-subtle-fg">
        <span>
          {item.subject_count} {item.subject_count === 1 ? "person" : "people"} · median{" "}
          {item.median_level ? formatLevel(item.median_level) : "n/a"}
        </span>
        <span className="flex gap-3">
          {item.critical_gap_count > 0 && (
            <span className="text-amber-600 dark:text-amber-400">
              {item.critical_gap_count} critical gap{item.critical_gap_count === 1 ? "" : "s"}
            </span>
          )}
          {item.revalidation_due_count > 0 && (
            <span className="text-rose-600 dark:text-rose-400">
              {item.revalidation_due_count} revalidation due
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
