"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Check,
  ChevronRight,
  CircleAlert,
  FileCheck2,
  Gauge,
  MessagesSquare,
  Plus,
  Sparkles,
  Target,
  TrendingUp,
  type LucideIcon,
  UsersRound,
  Zap,
} from "lucide-react";
import type { RoleId } from "@/lib/auth";
import { ProfileMenu, ThemeToggle } from "@/components/ThemeControls";

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

const capabilities = [
  { name: "Strategic decision making", required: 82, current: 74, change: "+8", state: "Building" },
  { name: "Stakeholder influence", required: 78, current: 81, change: "+6", state: "Ready" },
  { name: "Data storytelling", required: 75, current: 59, change: "+2", state: "At risk" },
];

function Metric({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: LucideIcon }) {
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

function ScoreRing({ score, label }: { score: number; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="relative grid h-14 w-14 place-items-center rounded-full"
        style={{ background: `conic-gradient(#818cf8 ${score * 3.6}deg, var(--border) 0deg)` }}
      >
        <div className="grid h-11 w-11 place-items-center rounded-full t-card text-sm font-bold t-fg">{score}</div>
      </div>
      <div>
        <p className="text-sm font-semibold t-fg">{label}</p>
        <p className="text-xs t-subtle-fg">Capability score</p>
      </div>
    </div>
  );
}

export function CapabilityWorkspace({ role }: { role: RoleId }) {
  const [evidence, setEvidence] = useState(6);
  const [validated] = useState(4);
  const [assessment, setAssessment] = useState(74);
  const [notice, setNotice] = useState("");
  const copy = roleCopy[role];
  const demonstrated = useMemo(() => Math.min(95, Math.round(assessment * 0.45 + validated * 5 + evidence * 2.5)), [assessment, validated, evidence]);
  const nextAction = role === "learner" ? "Complete a stakeholder scenario" : role === "manager" ? "Validate Priya’s evidence" : "Review capability risk report";

  function captureEvidence() {
    setEvidence((value) => value + 1);
    setAssessment((value) => Math.min(100, value + 2));
    setNotice("New workplace evidence captured. Capability State Model updated.");
  }

  return (
    <main className="min-h-screen t-bg t-fg">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_12%_0%,rgba(99,102,241,0.1),transparent_28%)]" />
      <header
        className="sticky top-0 z-20 backdrop-blur-xl"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--bg)" }}
      >
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-5 lg:px-8">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold t-fg">
            <ProfileMenu role={role} />
            <span>Cognitive Mirror</span>
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <span
              className="hidden rounded-full px-3 py-1 text-xs capitalize sm:block"
              style={{ border: "1px solid var(--border)", background: "var(--bg-subtle)", color: "var(--fg-muted)" }}
            >
              {role} workspace
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1440px] gap-7 px-5 py-7 lg:grid-cols-[230px_1fr] lg:px-8">
        <aside className="hidden lg:block">
          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.18em] t-subtle-fg">Workspace</p>
          {(role === "learner"
            ? [[Gauge, "Overview", "/learner"], [Target, "Capability Map", "/learner/capability-map"], [MessagesSquare, "Practice & Reflection", "/learner/practice"], [BarChart3, "Impact Signals", "/learner/impact"]]
            : role === "manager"
              ? [[Gauge, "Overview", "/manager"], [Target, "Capability Maps", "/manager/capability-maps"], [FileCheck2, "Evidence Validation", "/manager/evidence"], [BarChart3, "Impact Signals", "/manager/impact"]]
              : [[UsersRound, "User Management", "/admin/users"], [Sparkles, "Insight Manager", "/admin/insights"]]
          ).map(([Icon, label, href]) => {
            const NavIcon = Icon as LucideIcon;
            return (
              <Link
                href={href as string}
                key={label as string}
                className="mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition hover:opacity-85"
                style={label === "Overview" ? { background: "rgba(99,102,241,0.12)", color: "var(--accent-fg)" } : { color: "var(--fg-muted)" }}
              >
                <NavIcon className="h-4 w-4" />
                {label as string}
              </Link>
            );
          })}
          <div
            className="mt-8 rounded-2xl p-4"
            style={{ border: "1px solid rgba(99,102,241,0.2)", background: "rgba(99,102,241,0.06)" }}
          >
            <Sparkles className="h-4 w-4" style={{ color: "var(--accent-fg)" }} />
            <p className="mt-3 text-sm font-medium t-fg">AI signal watch</p>
            <p className="mt-1 text-xs leading-5 t-muted">2 capabilities need a fresh workplace signal.</p>
          </div>
        </aside>

        <section className="min-w-0">
          <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.18em]" style={{ color: "var(--accent-fg)" }}>{copy.eyebrow}</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-.04em] t-fg sm:text-4xl">{copy.title}</h1>
              <p className="mt-2 text-sm t-muted">{copy.description}</p>
            </div>
            <Link href={role === "learner" ? "/learner/evidence" : role === "manager" ? "/manager/evidence" : "/admin/insights"} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400">
              <Plus className="h-4 w-4" />
              {role === "learner" ? "Submit evidence" : role === "manager" ? "Explore evidence" : "Create insight"}
            </Link>
          </div>
          {notice && (
            <div className="mb-5 flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-300">
              <Check className="h-4 w-4" />
              {notice}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Required capability" value="78" detail="role benchmark" icon={Target} />
            <Metric label="Demonstrated" value={String(demonstrated)} detail="live state score" icon={TrendingUp} />
            <Metric label="Evidence strength" value={`${evidence}/8`} detail="workplace signals" icon={FileCheck2} />
            <Metric label="KPI linkage" value="Strong" detail="+12% delivery signal" icon={Zap} />
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_.85fr]">
            <div className="rounded-2xl border t-border t-card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-semibold t-fg">Capability state model</h2>
                  <p className="mt-1 text-xs t-subtle-fg">Recalibrated from evidence, assessment, reflection and validation.</p>
                </div>
                <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-300">Live</span>
              </div>
              <div className="mt-6 space-y-5">
                {capabilities.map((item) => (
                  <div key={item.name}>
                    <div className="mb-2 flex items-center justify-between gap-4 text-sm">
                      <span className="font-medium t-fg">{item.name}</span>
                      <span className={item.state === "At risk" ? "text-amber-500" : "text-emerald-500"}>{item.state} · {item.change}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--bg-subtle)" }}>
                      <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-400" style={{ width: `${item.current}%` }} />
                    </div>
                    <div className="mt-2 flex justify-between text-[11px] t-subtle-fg">
                      <span>Demonstrated {item.current}</span>
                      <span>Required {item.required}</span>
                    </div>
                  </div>
                ))}
              </div>
              <button className="mt-6 inline-flex items-center gap-1 text-sm font-medium" style={{ color: "var(--accent-fg)" }}>
                Open capability map <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="rounded-2xl border t-border t-card p-5">
              <h2 className="font-semibold t-fg">Confidence calibration</h2>
              <p className="mt-1 text-xs t-subtle-fg">Self-belief compared with demonstrated competence.</p>
              <div className="mt-6">
                <ScoreRing score={82} label="Self-reported confidence" />
                <div className="my-4 h-px" style={{ background: "var(--border)" }} />
                <ScoreRing score={demonstrated} label="Demonstrated competence" />
              </div>
              <div className="mt-5 rounded-xl p-3 text-xs leading-5" style={{ border: "1px solid rgba(251,191,36,0.2)", background: "rgba(251,191,36,0.06)", color: "var(--fg)" }}>
                <CircleAlert className="mr-1 inline h-3.5 w-3.5 text-amber-500" />
                Confidence is ahead of evidence in data storytelling. Practice in context is recommended.
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <div className="rounded-2xl border t-border t-card p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold t-fg">Evidence & transfer</h2>
                  <p className="mt-1 text-xs t-subtle-fg">Signals that show capability holds up at work.</p>
                </div>
                <BadgeCheck className="h-5 w-5 text-emerald-500" />
              </div>
              <div className="mt-5 grid grid-cols-2 gap-y-5 text-sm">
                <div>
                  <p className="t-subtle-fg">Assessment performance</p>
                  <p className="mt-1 font-semibold t-fg">{assessment}%</p>
                </div>
                <div>
                  <p className="t-subtle-fg">Scenario judgement</p>
                  <p className="mt-1 font-semibold t-fg">Proficient</p>
                </div>
                <div>
                  <p className="t-subtle-fg">Manager validation</p>
                  <p className="mt-1 font-semibold t-fg">{validated} confirmed</p>
                </div>
                <div>
                  <p className="t-subtle-fg">Application frequency</p>
                  <p className="mt-1 font-semibold t-fg">3× this month</p>
                </div>
                <div>
                  <p className="t-subtle-fg">Reflection quality</p>
                  <p className="mt-1 font-semibold t-fg">Strong</p>
                </div>
                <div>
                  <p className="t-subtle-fg">Transfer to workplace</p>
                  <p className="mt-1 font-semibold text-emerald-500">Evidenced</p>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2 pt-4 text-xs" style={{ borderTop: "1px solid var(--border)" }}>
                <div>
                  <p className="t-subtle-fg">Improvement</p>
                  <p className="mt-1 font-semibold text-emerald-500">+8 points</p>
                </div>
                <div>
                  <p className="t-subtle-fg">Stagnation</p>
                  <p className="mt-1 font-semibold t-fg">None</p>
                </div>
                <div>
                  <p className="t-subtle-fg">Decay risk</p>
                  <p className="mt-1 font-semibold text-amber-500">Medium</p>
                </div>
              </div>
            </div>
            <div
              className="rounded-2xl border p-5 flex flex-col justify-between"
              style={{
                borderColor: "var(--border)",
                background: "linear-gradient(135deg, rgba(99,102,241,0.08) 0%, var(--bg-card) 100%)",
              }}
            >
              <div>
                <div className="flex items-center gap-2" style={{ color: "var(--accent-fg)" }}>
                  <Sparkles className="h-5 w-5" />
                  <h2 className="font-semibold">Recommended next action</h2>
                </div>
                <p className="mt-4 text-lg font-medium leading-7 t-fg">{nextAction}</p>
                <p className="mt-2 text-sm leading-6 t-muted">This will strengthen the weakest signal in the state model and reduce capability decay risk.</p>
              </div>
              <div>
                <button onClick={captureEvidence} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold hover:opacity-80" style={{ color: "var(--accent-fg)" }}>
                  Start now <ArrowRight className="h-4 w-4" />
                </button>
                <div className="mt-5 pt-4 text-xs t-subtle-fg" style={{ borderTop: "1px solid var(--border)" }}>
                  Outcome signal: +12% delivery quality · Cohort interaction: high · Peer-practice contribution: 4 helpful reviews · In-flow support: 3 assists used
                </div>
              </div>
            </div>
          </div>
          <Link
            href="/"
            className="mt-7 inline-flex items-center gap-2 text-sm transition hover:opacity-85"
            style={{ color: "var(--fg-muted)" }}
          >
            <ArrowLeft className="h-4 w-4" />
            Switch role / return to login
          </Link>
        </section>
      </div>
    </main>
  );
}
