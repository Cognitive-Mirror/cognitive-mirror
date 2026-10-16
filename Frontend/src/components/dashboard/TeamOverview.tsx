"use client";

/**
 * Manager overview: coverage across direct reports, then each person.
 *
 * Coverage and the full distribution, never an average (D2): levels are an
 * ordinal scale, so a mean is undefined, and it would hide the distribution
 * that decides which intervention is needed.
 */

import Link from "next/link";
import { Info, ShieldCheck } from "lucide-react";

import { AppShell, ErrorNote, Loading, PageIntro } from "@/components/AppShell";
import { StatLine } from "@/components/dashboard/Metric";
import { AuditTrailButton } from "@/components/explain/AuditTrail";
import { LEVEL_LABEL, LEVELS, Mirror } from "@/components/explain/Mirror";
import { type Unit, LevelUnits } from "@/components/viz/charts";
import { CountUp } from "@/components/viz/motion";
import { useResource } from "@/lib/useResource";
import {
  type CapabilityState,
  getTeamAggregate,
  getTeamMembers,
  type TeamAggregate,
  type TeamMember,
} from "@/services/api";

const loadTeam = () => Promise.all([getTeamAggregate(), getTeamMembers()]);

export function TeamOverview() {
  const { data, error, loading, reload } = useResource(loadTeam);
  const [team, members] = data ?? [[], []];
  const reports = team[0]?.subject_count ?? 0;
  const sum = (pick: (t: TeamAggregate) => number) => team.reduce((n, t) => n + pick(t), 0);
  const awaiting = members.filter((m) => m.states.some((s) => s.provisional_points > 0)).length;

  return (
    <AppShell role="manager" active="/manager">
      <PageIntro
        title="Your team, both readings."
        text="What each person knows, against what you have validated at work. Your judgement is the only thing that moves a level."
        actions={
          <Link href="/manager/evidence" className="btn btn-primary">
            <ShieldCheck /> Review evidence
          </Link>
        }
      />

      {error && <ErrorNote message={error} onRetry={reload} />}
      {loading && !data && <Loading label="Loading team state…" />}

      {data && (
        <>
          <StatLine
            items={[
              { label: "Direct reports", value: reports },
              { label: "Waiting on you", value: awaiting, of: reports, tone: awaiting > 0 ? "pending" : undefined },
              { label: "Critical gaps", value: sum((t) => t.critical_gap_count), tone: sum((t) => t.critical_gap_count) > 0 ? "risk" : undefined },
              { label: "Revalidation due", value: sum((t) => t.revalidation_due_count), tone: sum((t) => t.revalidation_due_count) > 0 ? "risk" : undefined },
            ]}
          />

          <section className="mt-14" aria-labelledby="coverage">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="coverage" className="display display-sm">Coverage by capability</h2>
                <p className="meta mt-1">Validated coverage: at or above required, manager-validated, and above the confidence floor.</p>
              </div>
              <UnitLegend />
            </div>
            {reports === 0 ? (
              <p className="mt-6 text-sm t-muted">No direct reports are assigned to you yet.</p>
            ) : (
              <div className="mt-6 overflow-x-auto">
                <table className="table min-w-[640px]">
                  <thead>
                    <tr>
                      <th>Capability</th>
                      <th className="w-[45%]">One square per person, by validated level</th>
                      <th className="text-right">Validated coverage</th>
                      <th>Median</th>
                      <th>Flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {team.map((item) => <CoverageRow key={item.capability_id} item={item} members={members} />)}
                  </tbody>
                </table>
              </div>
            )}
            <p className="meta mt-3 flex items-start gap-1.5">
              <Info className="mt-px h-3.5 w-3.5 shrink-0" />
              No team average is shown. Levels are ordinal, so a mean is undefined, and it would hide the distribution that decides the intervention.
            </p>
          </section>

          {members.length > 0 && (
            <section className="mt-14" aria-labelledby="people">
              <h2 id="people" className="display display-sm">People</h2>
              <p className="meta mt-1">Open an audit trail to see every state change and what caused it.</p>
              <div className="rows mt-6 rule">
                {members.map((m) => <MemberRow key={m.id} member={m} />)}
              </div>
            </section>
          )}
        </>
      )}
    </AppShell>
  );
}

function UnitLegend() {
  return (
    <div className="meta flex flex-wrap items-center gap-x-4 gap-y-1" aria-hidden>
      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5" style={{ background: "var(--does)" }} /> At required</span>
      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5" style={{ background: "var(--ink-3)" }} /> Below required</span>
      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5" style={{ border: "1.5px dashed var(--risk)" }} /> Revalidation due</span>
      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5" style={{ background: "color-mix(in srgb, var(--does) 7%, transparent)", border: "1px dashed var(--does)" }} /> Required zone</span>
    </div>
  );
}

function coverageUnits(item: TeamAggregate, members: TeamMember[]): { units: Unit[]; required: number | null } {
  const states = members
    .map((m) => ({ m, s: m.states.find((x) => x.capability_id === item.capability_id) }))
    .filter((x): x is { m: TeamMember; s: CapabilityState } => !!x.s);
  if (states.length === 0) {
    // No per-person states: draw the aggregate distribution, one square per person.
    const units = LEVELS.flatMap((level, i) =>
      Array.from({ length: item.distribution[level] ?? 0 }, (_, k) => ({ key: `${level}-${k}`, label: "Learner", level: i, tone: "neutral" as const })),
    );
    return { units, required: null };
  }
  const counts = new Map<number, number>();
  for (const { s } of states) {
    const r = LEVELS.indexOf(s.required_level as (typeof LEVELS)[number]);
    counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  const required = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const units = states.map(({ m, s }) => ({
    key: m.id,
    label: m.display_name,
    level: Math.max(0, LEVELS.indexOf(s.attained_level as (typeof LEVELS)[number])),
    tone: s.needs_revalidation ? ("aged" as const) : s.gap <= 0 ? ("met" as const) : ("below" as const),
  }));
  return { units, required };
}

function CoverageRow({ item, members }: { item: TeamAggregate; members: TeamMember[] }) {
  const { units, required } = coverageUnits(item, members);
  return (
    <tr>
      <td className="font-medium">{item.capability_name}</td>
      <td>
        <LevelUnits units={units} required={required} legend={false} />
      </td>
      <td className="text-right">
        <CountUp value={Math.round(item.validated_coverage * 100)} suffix="%" className="text-[1.125rem] font-medium" />
      </td>
      <td>{item.median_level ? LEVEL_LABEL[item.median_level] : "n/a"}</td>
      <td>
        <div className="flex flex-wrap gap-1">
          {item.critical_gap_count > 0 && <span className="tag tag-risk">{item.critical_gap_count} critical gap{item.critical_gap_count === 1 ? "" : "s"}</span>}
          {item.revalidation_due_count > 0 && <span className="tag tag-risk">{item.revalidation_due_count} revalidation</span>}
          {item.critical_gap_count === 0 && item.revalidation_due_count === 0 && <span className="meta">—</span>}
        </div>
      </td>
    </tr>
  );
}

function stateTag(s: CapabilityState) {
  if (s.provisional_points > 0) return <span className="tag tag-pending">Waiting on you</span>;
  if (s.needs_revalidation) return <span className="tag tag-risk">Revalidation due</span>;
  if (s.knowing_doing === "applied_without_knowledge") return <span className="tag tag-risk">Knowledge disagrees</span>;
  if (s.knowing_doing === "knows_not_applied") return <span className="tag tag-knows">Knows, not yet shown</span>;
  if (s.knowing_doing === "aligned") return <span className="tag tag-does">Aligned</span>;
  return null;
}

function MemberRow({ member }: { member: TeamMember }) {
  const active = member.states.filter((s) => s.status !== "not_started" || s.knowledge_mastery !== null);
  return (
    <article className="grid gap-4 py-6 lg:grid-cols-[13rem_1fr] lg:gap-10">
      <div>
        <h3 className="title">{member.display_name}</h3>
        <p className="meta mt-0.5">
          {member.role_ref ?? "No role"}
          {member.program_ref && ` · ${member.program_ref}`}
        </p>
      </div>
      <div className="space-y-6">
        {active.length === 0 && <p className="text-sm t-muted">No activity yet.</p>}
        {active.map((s) => (
          <div key={s.capability_id} className="grid gap-3 md:grid-cols-[12rem_1fr] md:gap-8">
            <div>
              <p className="text-sm font-medium t-fg">{s.capability_name}</p>
              <p className="meta">Required {LEVEL_LABEL[s.required_level]}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {stateTag(s)}
                <AuditTrailButton capabilityId={s.capability_id} learnerId={member.id} label="Audit" />
              </div>
            </div>
            <Mirror state={s} />
          </div>
        ))}
      </div>
    </article>
  );
}
