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
import { AuditTrailButton } from "@/components/explain/AuditTrail";
import { useResource } from "@/lib/useResource";
import {
  type CapabilityState,
  formatLevel,
  getTeamAggregate,
  getTeamMembers,
  KNOWING_DOING_LABEL,
  type TeamAggregate,
  type TeamMember,
} from "@/services/api";

const loadTeam = () => Promise.all([getTeamAggregate(), getTeamMembers()]);

export function TeamOverview() {
  const { data, error, loading, reload } = useResource(loadTeam);
  const [team, members] = data ?? [[], []];
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

          {members.length > 0 && (
            <Card className="mt-5">
              <h2 className="font-semibold t-fg">People</h2>
              <p className="mt-1 text-xs t-subtle-fg">
                What each person knows and what you have validated at work, side by side. Open the
                audit trail to see every state change and what caused it.
              </p>
              <div className="mt-5 space-y-4">
                {members.map((m) => <MemberRow key={m.id} member={m} />)}
              </div>
            </Card>
          )}
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

const BAND_TONE: Record<string, string> = {
  high: "text-emerald-600 dark:text-emerald-400",
  moderate: "text-indigo-600 dark:text-indigo-400",
  low: "text-amber-600 dark:text-amber-400",
  revalidation_due: "text-rose-600 dark:text-rose-400",
};

function MemberRow({ member }: { member: TeamMember }) {
  const active = member.states.filter(
    (s: CapabilityState) => s.status !== "not_started" || s.knowledge_mastery !== null,
  );
  return (
    <div className="rounded-xl p-4" style={{ border: "1px solid var(--border)", background: "var(--bg-subtle)" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium t-fg">{member.display_name}</p>
        <p className="text-[11px] t-subtle-fg">
          {member.role_ref ?? "no role"}
          {member.program_ref && ` · ${member.program_ref}`}
        </p>
      </div>
      {active.length === 0 && <p className="mt-2 text-xs t-muted">No activity yet.</p>}
      <div className="mt-3 space-y-2">
        {active.map((s) => (
          <div key={s.capability_id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="min-w-0 t-fg">
              <strong>{s.capability_name}</strong>{" "}
              <span className="t-muted">
                · {formatLevel(s.attained_level)}
                {s.needs_revalidation && ` (evidence supports ${formatLevel(s.current_support_level)})`}
                {" · required "}
                {formatLevel(s.required_level)}
              </span>
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <span className={BAND_TONE[s.confidence_band] ?? "t-muted"}>
                conf {s.state_confidence.toFixed(2)}
              </span>
              {s.knowledge_mastery !== null && (
                <span className="t-muted">knows {Math.round(s.knowledge_mastery * 100)}%</span>
              )}
              {s.provisional_points > 0 && (
                <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300" style={{ background: "rgba(245,158,11,.14)" }}>
                  awaiting you
                </span>
              )}
              <span className="hidden text-[10px] t-subtle-fg sm:inline">{KNOWING_DOING_LABEL[s.knowing_doing]}</span>
              <AuditTrailButton capabilityId={s.capability_id} learnerId={member.id} label="Audit" />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
