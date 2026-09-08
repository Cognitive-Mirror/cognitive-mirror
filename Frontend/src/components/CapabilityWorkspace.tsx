"use client";

/**
 * Role workspace, backed by live capability state from the API.
 *
 * Display rule that matters: `attained_level`, `current_support_level` and the
 * confidence band are shown as three separate things. Collapsing them into one
 * score throws away the whole D1 argument — that decayed evidence means "we are
 * less sure", not "this person got worse".
 *
 * Nothing on this screen is invented. If the backend does not compute a signal,
 * it is not displayed.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  ChevronRight,
  CircleAlert,
  FileCheck2,
  Gauge,
  Info,
  MessagesSquare,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
  type LucideIcon,
  UsersRound,
} from "lucide-react";
import type { RoleId } from "@/lib/auth";
import { ProfileMenu, ThemeToggle } from "@/components/ThemeControls";
import DashboardChatPanel from "@/components/DashboardChatPanel";
import {
  type CapabilityState,
  CONFIDENCE_BAND_LABEL,
  formatLevel,
  getMyCapabilityStates,
  getTeamAggregate,
  levelPercent,
  type TeamAggregate,
} from "@/services/api";

type RoleCopy = { eyebrow: string; title: string; description: string };

const roleCopy: Record<RoleId, RoleCopy> = {
  learner: {
    eyebrow: "Your capability state",
    title: "Build confidence that is earned.",
    description: "Turn daily work into validated capability evidence.",
  },
  manager: {
    eyebrow: "Team capability view",
    title: "Guide growth where it matters most.",
    description: "Spot signal gaps, validate evidence, and remove barriers to transfer.",
  },
  admin: {
    eyebrow: "Capability intelligence",
    title: "See the health of capability at scale.",
    description: "Connect growth signals to the outcomes your organisation cares about.",
  },
};

const BAND_COLOR: Record<string, string> = {
  high: "text-emerald-600 dark:text-emerald-400",
  moderate: "text-indigo-600 dark:text-indigo-400",
  low: "text-amber-600 dark:text-amber-400",
  revalidation_due: "text-rose-600 dark:text-rose-400",
};

function Metric({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
}) {
  return (
    <div className="rounded-2xl border t-border t-subtle p-4">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs t-muted">{label}</span>
        <Icon className="h-4 w-4 text-indigo-400" />
      </div>
      <p className="text-2xl font-semibold tracking-tight t-fg">{value}</p>
      <p className="mt-1 text-xs t-subtle-fg">{detail}</p>
    </div>
  );
}

/**
 * One capability row. The required marker, the attained bar and the current
 * support bar are drawn separately and on purpose.
 */
function CapabilityRow({ state }: { state: CapabilityState }) {
  const attainedPct = levelPercent(state.attained_level);
  const supportPct = levelPercent(state.current_support_level);
  const requiredPct = levelPercent(state.required_level);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-medium t-fg">{state.capability_name}</span>
        <span className={`text-xs ${BAND_COLOR[state.confidence_band] ?? "t-muted"}`}>
          {CONFIDENCE_BAND_LABEL[state.confidence_band]} ·{" "}
          {(state.state_confidence * 100).toFixed(0)}%
        </span>
      </div>

      <div
        className="relative h-2 overflow-hidden rounded-full"
        style={{ background: "var(--bg-subtle)" }}
      >
        {/* Attained: the historical fact. */}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-indigo-500 to-violet-400"
          style={{ width: `${attainedPct}%` }}
        />
        {/* Current support: what today's decayed evidence backs. */}
        {supportPct < attainedPct && (
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-indigo-300/70"
            style={{ width: `${supportPct}%` }}
          />
        )}
        {/* Required marker. */}
        <div
          className="absolute inset-y-0 w-0.5 bg-amber-500"
          style={{ left: `${requiredPct}%` }}
          title={`Required: ${formatLevel(state.required_level)}`}
        />
      </div>

      <div className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-[11px] t-subtle-fg">
        <span>
          Validated <strong className="t-fg">{formatLevel(state.attained_level)}</strong>
          {state.needs_revalidation && (
            <>
              {" · evidence now supports "}
              <strong className="t-fg">
                {formatLevel(state.current_support_level)}
              </strong>
            </>
          )}
        </span>
        <span title={state.required_level_provenance}>
          Required {formatLevel(state.required_level)} ·{" "}
          {state.required_level_source.replace(/_/g, " ")}
        </span>
      </div>

      {state.needs_revalidation && (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] leading-4 text-rose-700 dark:text-rose-300"
           style={{ background: "rgba(244,63,94,0.08)" }}>
          <RefreshCw className="mt-px h-3 w-3 shrink-0" />
          Revalidation due. This is not a downgrade — the validated level stands,
          but recent supporting evidence has aged.
        </p>
      )}

      {state.provisional_points > 0 && (
        <p className="mt-2 text-[11px] t-subtle-fg">
          {state.provisional_points.toFixed(1)} points awaiting manager validation
          (not counted).
        </p>
      )}
    </div>
  );
}

function TeamRow({ item }: { item: TeamAggregate }) {
  const total = item.subject_count || 1;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-medium t-fg">{item.capability_name}</span>
        <span className="text-xs t-muted">
          <strong className="t-fg">
            {(item.validated_coverage * 100).toFixed(0)}%
          </strong>{" "}
          validated coverage
        </span>
      </div>

      {/* Full distribution, never an average (D2). */}
      <div className="flex h-2 overflow-hidden rounded-full" style={{ background: "var(--bg-subtle)" }}>
        {Object.entries(item.distribution).map(([level, count], index) => (
          count > 0 && (
            <div
              key={level}
              title={`${formatLevel(level as never)}: ${count}`}
              style={{
                width: `${(count / total) * 100}%`,
                background: `hsl(${245 - index * 22} 70% ${45 + index * 8}%)`,
              }}
            />
          )
        ))}
      </div>

      <div className="mt-2 flex flex-wrap justify-between gap-x-4 text-[11px] t-subtle-fg">
        <span>
          {item.subject_count} {item.subject_count === 1 ? "person" : "people"} ·
          median {item.median_level ? formatLevel(item.median_level) : "n/a"}
        </span>
        <span>
          {item.critical_gap_count > 0 && (
            <span className="text-amber-600 dark:text-amber-400">
              {item.critical_gap_count} critical gap
              {item.critical_gap_count === 1 ? "" : "s"}
            </span>
          )}
          {item.revalidation_due_count > 0 && (
            <span className="ml-3 text-rose-600 dark:text-rose-400">
              {item.revalidation_due_count} revalidation due
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

export function CapabilityWorkspace({ role }: { role: RoleId }) {
  const copy = roleCopy[role];
  const [states, setStates] = useState<CapabilityState[]>([]);
  const [team, setTeam] = useState<TeamAggregate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (role === "manager") {
        setTeam(await getTeamAggregate());
      } else {
        setStates(await getMyCapabilityStates());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load capability state.");
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    void load();
  }, [load]);

  const atOrAbove = states.filter((s) => s.gap <= 0).length;
  const needingRevalidation = states.filter((s) => s.needs_revalidation).length;
  const pendingPoints = states.reduce((sum, s) => sum + s.provisional_points, 0);
  const modelVersion =
    states.find((s) => s.scoring_model_version)?.scoring_model_version ?? "";

  return (
    <main className="min-h-screen t-bg t-fg">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_12%_0%,rgba(99,102,241,0.1),transparent_28%)]" />
      <header
        className="sticky top-0 z-20 backdrop-blur-xl"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--bg)" }}
      >
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-5 lg:px-8">
          {/* ProfileMenu renders its own link, so it must sit outside this one.
              Nesting anchors is invalid HTML and breaks hydration. */}
          <div className="flex items-center gap-2">
            <ProfileMenu role={role} />
            <Link href="/" className="text-sm font-semibold t-fg">
              Cognitive Mirror
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <span
              className="hidden rounded-full px-3 py-1 text-xs capitalize sm:block"
              style={{
                border: "1px solid var(--border)",
                background: "var(--bg-subtle)",
                color: "var(--fg-muted)",
              }}
            >
              {role} workspace
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1440px] gap-7 px-5 py-7 lg:grid-cols-[230px_1fr] lg:px-8">
        <aside className="hidden lg:block">
          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.18em] t-subtle-fg">
            Workspace
          </p>
          {(role === "learner"
            ? [
                [Gauge, "Overview", "/learner"],
                [Target, "Capability Map", "/learner/capability-map"],
                [MessagesSquare, "Practice & Reflection", "/learner/practice"],
                [BarChart3, "Impact Signals", "/learner/impact"],
              ]
            : role === "manager"
              ? [
                  [Gauge, "Overview", "/manager"],
                  [Target, "Capability Maps", "/manager/capability-maps"],
                  [FileCheck2, "Evidence Validation", "/manager/evidence"],
                  [BarChart3, "Impact Signals", "/manager/impact"],
                ]
              : [
                  [UsersRound, "User Management", "/admin/users"],
                  [Sparkles, "Insight Manager", "/admin/insights"],
                ]
          ).map(([Icon, label, href]) => {
            const NavIcon = Icon as LucideIcon;
            return (
              <Link
                href={href as string}
                key={label as string}
                className="mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition hover:opacity-85"
                style={
                  label === "Overview"
                    ? { background: "rgba(99,102,241,0.12)", color: "var(--accent-fg)" }
                    : { color: "var(--fg-muted)" }
                }
              >
                <NavIcon className="h-4 w-4" />
                {label as string}
              </Link>
            );
          })}

          {needingRevalidation > 0 && (
            <div
              className="mt-8 rounded-2xl p-4"
              style={{
                border: "1px solid rgba(244,63,94,0.2)",
                background: "rgba(244,63,94,0.06)",
              }}
            >
              <RefreshCw className="h-4 w-4 text-rose-500" />
              <p className="mt-3 text-sm font-medium t-fg">Revalidation</p>
              <p className="mt-1 text-xs leading-5 t-muted">
                {needingRevalidation} capabilit
                {needingRevalidation === 1 ? "y needs" : "ies need"} a fresh
                workplace signal.
              </p>
            </div>
          )}
        </aside>

        <section className="min-w-0">
          <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p
                className="text-xs font-bold uppercase tracking-[.18em]"
                style={{ color: "var(--accent-fg)" }}
              >
                {copy.eyebrow}
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-.04em] t-fg sm:text-4xl">
                {copy.title}
              </h1>
              <p className="mt-2 text-sm t-muted">{copy.description}</p>
            </div>
            <Link
              href={
                role === "learner"
                  ? "/learner/evidence"
                  : role === "manager"
                    ? "/manager/evidence"
                    : "/admin/insights"
              }
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400"
            >
              <Plus className="h-4 w-4" />
              {role === "learner"
                ? "Submit evidence"
                : role === "manager"
                  ? "Review evidence"
                  : "Create insight"}
            </Link>
          </div>

          {error && (
            <div className="mb-5 flex items-start gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p>{error}</p>
                <button
                  onClick={() => void load()}
                  className="mt-1 font-semibold underline underline-offset-2"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {loading && (
            <div className="rounded-2xl border t-border t-card p-8 text-center text-sm t-muted">
              Loading capability state…
            </div>
          )}

          {!loading && !error && role !== "manager" && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Metric
                  label="Capabilities tracked"
                  value={String(states.length)}
                  detail="in the capability spine"
                  icon={Target}
                />
                <Metric
                  label="At or above required"
                  value={`${atOrAbove}/${states.length}`}
                  detail="validated level vs requirement"
                  icon={TrendingUp}
                />
                <Metric
                  label="Awaiting validation"
                  value={pendingPoints.toFixed(1)}
                  detail="points not yet counted"
                  icon={FileCheck2}
                />
                <Metric
                  label="Revalidation due"
                  value={String(needingRevalidation)}
                  detail="supporting evidence has aged"
                  icon={RefreshCw}
                />
              </div>

              <div className="mt-5 rounded-2xl border t-border t-card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-semibold t-fg">Capability state model</h2>
                    <p className="mt-1 text-xs t-subtle-fg">
                      Validated level, what current evidence supports, and how
                      confident we are in that — as three separate readings.
                    </p>
                  </div>
                  <button
                    onClick={() => void load()}
                    className="rounded-lg px-2 py-1 text-xs t-muted transition hover:opacity-70"
                    style={{ background: "var(--bg-subtle)" }}
                  >
                    Refresh
                  </button>
                </div>

                {states.length === 0 ? (
                  <p className="mt-6 text-sm t-muted">
                    No capabilities configured for this tenant yet.
                  </p>
                ) : (
                  <div className="mt-6 space-y-6">
                    {states.map((state) => (
                      <CapabilityRow key={state.capability_id} state={state} />
                    ))}
                  </div>
                )}

                <Link
                  href="/learner/capability-map"
                  className="mt-6 inline-flex items-center gap-1 text-sm font-medium"
                  style={{ color: "var(--accent-fg)" }}
                >
                  Open capability map <ChevronRight className="h-4 w-4" />
                </Link>
              </div>

              {states.length > 0 && (
                <div className="mt-5 rounded-2xl border t-border t-card p-5">
                  <div className="flex items-center gap-2" style={{ color: "var(--accent-fg)" }}>
                    <Sparkles className="h-5 w-5" />
                    <h2 className="font-semibold">Recommended next action</h2>
                  </div>
                  <ul className="mt-4 space-y-3">
                    {states
                      .filter((s) => s.gap > 0 || s.needs_revalidation)
                      .slice(0, 3)
                      .map((s) => (
                        <li key={s.capability_id} className="text-sm leading-6">
                          <span className="font-medium t-fg">
                            {s.capability_name}:
                          </span>{" "}
                          <span className="t-muted">{s.recommended_next_action}</span>
                        </li>
                      ))}
                    {states.every((s) => s.gap <= 0 && !s.needs_revalidation) && (
                      <li className="text-sm t-muted">
                        All tracked capabilities are at or above their required
                        level with current evidence.
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </>
          )}

          {!loading && !error && role === "manager" && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Metric
                  label="Capabilities tracked"
                  value={String(team.length)}
                  detail="in the capability spine"
                  icon={Target}
                />
                <Metric
                  label="Direct reports"
                  value={String(team[0]?.subject_count ?? 0)}
                  detail="in this view"
                  icon={UsersRound}
                />
                <Metric
                  label="Critical gaps"
                  value={String(team.reduce((n, t) => n + t.critical_gap_count, 0))}
                  detail="two or more levels short"
                  icon={CircleAlert}
                />
                <Metric
                  label="Revalidation due"
                  value={String(team.reduce((n, t) => n + t.revalidation_due_count, 0))}
                  detail="across the team"
                  icon={RefreshCw}
                />
              </div>

              <div className="mt-5 rounded-2xl border t-border t-card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-semibold t-fg">Team capability coverage</h2>
                    <p className="mt-1 text-xs t-subtle-fg">
                      Share at or above required, manager-validated and above the
                      confidence floor.
                    </p>
                  </div>
                  <button
                    onClick={() => void load()}
                    className="rounded-lg px-2 py-1 text-xs t-muted transition hover:opacity-70"
                    style={{ background: "var(--bg-subtle)" }}
                  >
                    Refresh
                  </button>
                </div>

                {team.length === 0 || team[0]?.subject_count === 0 ? (
                  <p className="mt-6 text-sm t-muted">
                    No direct reports are assigned to you yet.
                  </p>
                ) : (
                  <div className="mt-6 space-y-6">
                    {team.map((item) => (
                      <TeamRow key={item.capability_id} item={item} />
                    ))}
                  </div>
                )}

                <p className="mt-6 flex items-start gap-1.5 text-[11px] leading-4 t-subtle-fg">
                  <Info className="mt-px h-3 w-3 shrink-0" />
                  No team average is shown. Capability levels are an ordinal
                  scale, so a mean is undefined — and it would hide the
                  distribution that decides the intervention.
                </p>
              </div>
            </>
          )}

          {!loading && !error && modelVersion && (
            <p className="mt-6 text-[11px] t-subtle-fg">
              Scoring model {modelVersion}. Constants are seeded and not yet
              calibrated against outcome data.
            </p>
          )}
        </section>
      </div>

      <DashboardChatPanel role={role} />
    </main>
  );
}
