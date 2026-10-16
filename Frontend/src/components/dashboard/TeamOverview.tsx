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
              { label: "Direct reports", value: String(reports) },
              { label: "Waiting on you", value: String(awaiting), tone: awaiting > 0 ? "pending" : undefined },
              { label: "Critical gaps", value: String(sum((t) => t.critical_gap_count)), tone: sum((t) => t.critical_gap_count) > 0 ? "risk" : undefined },
              { label: "Revalidation due", value: String(sum((t) => t.revalidation_due_count)), tone: sum((t) => t.revalidation_due_count) > 0 ? "risk" : undefined },
            ]}
          />

          <section className="mt-12" aria-labelledby="coverage">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="coverage" className="display display-sm">Coverage by capability</h2>
                <p className="meta mt-1">Validated coverage: at or above required, manager-validated, and above the confidence floor.</p>
              </div>
              <LevelLegend />
            </div>
            {reports === 0 ? (
              <p className="mt-6 text-sm t-muted">No direct reports are assigned to you yet.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="table min-w-[640px]">
                  <thead>
                    <tr>
                      <th>Capability</th>
                      <th className="w-[45%]">Distribution of validated level</th>
                      <th className="text-right">Validated coverage</th>
                      <th>Median</th>
                      <th>Flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {team.map((item) => <CoverageRow key={item.capability_id} item={item} />)}
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
              <div className="rows mt-4 rule">
                {members.map((m) => <MemberRow key={m.id} member={m} />)}
              </div>
            </section>
          )}
        </>
      )}
    </AppShell>
  );
}

function LevelLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3" aria-hidden>
      {LEVELS.map((l, i) => (
        <span key={l} className="meta flex items-center gap-1.5">
          <span className="h-2.5 w-2.5" style={{ background: `var(--lvl-${i})` }} />
          {LEVEL_LABEL[l]}
        </span>
      ))}
    </div>
  );
}

function CoverageRow({ item }: { item: TeamAggregate }) {
  const total = item.subject_count || 1;
  return (
    <tr>
      <td className="font-medium">{item.capability_name}</td>
      <td>
        <div className="flex h-3 overflow-hidden" style={{ background: "var(--surface-2)" }}>
          {LEVELS.map((level, i) => {
            const count = item.distribution[level] ?? 0;
            return count > 0 ? (
              <div
                key={level}
                title={`${LEVEL_LABEL[level]}: ${count}`}
                style={{ width: `${(count / total) * 100}%`, background: `var(--lvl-${i})`, borderRight: "1px solid var(--bg)" }}
              />
            ) : null;
          })}
        </div>
        <p className="meta mt-1.5">
          {LEVELS.filter((l) => (item.distribution[l] ?? 0) > 0)
            .map((l) => `${item.distribution[l]} ${LEVEL_LABEL[l].toLowerCase()}`)
            .join(" · ")}
        </p>
      </td>
      <td className="num text-right text-[0.9375rem] font-medium">{Math.round(item.validated_coverage * 100)}%</td>
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
