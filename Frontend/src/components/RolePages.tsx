"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Download, FileBarChart, Flag, MessageCircle, Play, Search, Sparkles, Target } from "lucide-react";
import type { RoleId } from "@/lib/auth";
import { ProfileMenu, ThemeToggle } from "@/components/ThemeControls";

const data = [
  { name: "Strategic decision making", score: 74, required: 82, state: "Building" },
  { name: "Stakeholder influence",     score: 81, required: 78, state: "Strong"   },
  { name: "Data storytelling",         score: 59, required: 75, state: "Weak"     },
];

const nav: Record<RoleId, { label: string; href: string }[]> = {
  learner: [
    { label: "Overview",           href: "/learner" },
    { label: "Capability Map",     href: "/learner/capability-map" },
    { label: "Practice & Reflection", href: "/learner/practice" },
    { label: "Impact Signals",     href: "/learner/impact" },
    { label: "Chat",               href: "/learner" },
  ],
  manager: [
    { label: "Overview",           href: "/manager" },
    { label: "Capability Maps",    href: "/manager/capability-maps" },
    { label: "Evidence Validation",href: "/manager/evidence" },
    { label: "Impact Signals",     href: "/manager/impact" },
    { label: "Chat",               href: "/manager" },
  ],
  admin: [
    { label: "User Management",    href: "/admin/users" },
    { label: "Insight Manager",    href: "/admin/insights" },
  ],
};

/* ── Shared shell ── */
export function RolePageShell({
  role, active, children,
}: { role: RoleId; active: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen t-bg t-fg">
      <header
        className="sticky top-0 z-20"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--bg)", backdropFilter: "blur(12px)" }}
      >
        <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-5 lg:px-8">
          <Link href={`/${role}`} className="flex items-center gap-2 text-sm font-semibold t-fg">
            <ProfileMenu role={role} />
            <span>Cognitive Mirror</span>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <div className="mx-auto grid max-w-[1280px] gap-8 px-5 py-8 lg:grid-cols-[230px_1fr] lg:px-8">
        {/* sidebar */}
        <aside>
          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.18em] t-subtle-fg">
            {role === "admin" ? "Administration" : "Workspace"}
          </p>
          {nav[role].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="mb-1 flex rounded-xl px-3 py-2.5 text-sm transition"
              style={
                active === item.href
                  ? { background: "rgba(99,102,241,0.12)", color: "var(--accent-fg)" }
                  : { color: "var(--fg-muted)" }
              }
            >
              {item.label}
            </Link>
          ))}
        </aside>

        {/* content */}
        <section>
          {children}
          <Link
            href={`/${role}`}
            className="mt-8 inline-flex items-center gap-2 text-sm transition hover:opacity-80"
            style={{ color: "var(--fg-muted)" }}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to overview
          </Link>
        </section>
      </div>
    </main>
  );
}

/* ── Shared sub-components ── */
function PageIntro({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <div className="mb-8">
      <p className="text-xs font-bold uppercase tracking-[.18em]" style={{ color: "var(--accent-fg)" }}>{eyebrow}</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-[-.04em] t-fg">{title}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 t-muted">{text}</p>
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-2xl p-6 ${className}`}
      style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}
    >
      {children}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--bg-subtle)" }}>
      <p className="text-xs t-subtle-fg">{label}</p>
      <p className="mt-2 text-xl font-semibold t-fg">{value}</p>
    </div>
  );
}

/* ── Learner pages ── */
export function LearnerCapabilityMap() {
  return (
    <RolePageShell role="learner" active="/learner/capability-map">
      <PageIntro eyebrow="Learner / Capability Map" title="See where capability is growing." text="Compare demonstrated capability with the role benchmark and act on the weakest signals." />
      <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
        <Card>
          <h2 className="font-semibold t-fg">Capability heat map</h2>
          <div className="mt-6 space-y-5">
            {data.map((item) => (
              <div key={item.name}>
                <div className="flex justify-between text-sm">
                  <span className="t-fg">{item.name}</span>
                  <span className={item.state === "Weak" ? "text-amber-500" : "text-emerald-500"}>
                    {item.score} · {item.state}
                  </span>
                </div>
                <div className="mt-2 h-3 rounded-full" style={{ background: "var(--bg-subtle)" }}>
                  <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-400" style={{ width: `${item.score}%` }} />
                </div>
                <p className="mt-1 text-xs t-subtle-fg">Required benchmark: {item.required}</p>
              </div>
            ))}
          </div>
        </Card>
        <section className="rounded-2xl p-6" style={{ border: "1px solid rgba(251,191,36,0.2)", background: "rgba(251,191,36,0.06)" }}>
          <Target className="h-5 w-5 text-amber-500" />
          <h2 className="mt-4 font-semibold t-fg">Weakest topics</h2>
          <p className="mt-2 text-sm leading-6 t-muted">Data storytelling is 16 points below the role benchmark.</p>
          <Link href="/learner/practice?capability=data-storytelling" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white">
            Practice this topic <Play className="h-4 w-4" />
          </Link>
        </section>
      </div>
    </RolePageShell>
  );
}

export function LearnerPractice() {
  const [saved, setSaved] = useState(false);
  return (
    <RolePageShell role="learner" active="/learner/practice">
      <PageIntro eyebrow="Learner / Practice & Reflection" title="Practise the moment that matters." text="Build scenario judgement, then reflect on how you would transfer it to work." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <Sparkles className="h-5 w-5" style={{ color: "var(--accent-fg)" }} />
          <h2 className="mt-4 text-xl font-semibold t-fg">Scenario: data storytelling</h2>
          <p className="mt-3 text-sm leading-6 t-muted">A senior stakeholder challenges your forecast. Choose the response that creates clarity without hiding uncertainty.</p>
          <div className="mt-5 space-y-3">
            {["Lead with the variance and proposed decision.", "Share every data point before recommending action."].map((opt) => (
              <button key={opt} className="w-full rounded-xl p-4 text-left text-sm transition" style={{ border: "1px solid var(--border)", background: "var(--bg-subtle)", color: "var(--fg)" }}>
                {opt}
              </button>
            ))}
          </div>
        </Card>
        <Card>
          <h2 className="font-semibold t-fg">Reflection</h2>
          <textarea
            rows={7}
            placeholder="What would you repeat, improve, or apply at work?"
            className="mt-4 w-full rounded-xl p-4 text-sm outline-none focus:ring-2 focus:ring-indigo-400/30"
            style={{ border: "1px solid var(--border)", background: "var(--bg-input)", color: "var(--fg)" }}
          />
          <button onClick={() => setSaved(true)} className="mt-4 rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white">
            {saved ? "Reflection saved" : "Save reflection"}
          </button>
        </Card>
      </div>
    </RolePageShell>
  );
}

export function LearnerImpact() {
  return (
    <RolePageShell role="learner" active="/learner/impact">
      <PageIntro eyebrow="Learner / Impact Signals" title="Track progress and context." text="See your progress over time beside the selected peer or organisation benchmark." />
      <Card>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold t-fg">Performance over time</h2>
          <select className="rounded-lg p-2 text-xs" style={{ border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--fg)" }}>
            <option>Organisation benchmark</option>
            <option>Peer benchmark</option>
          </select>
        </div>
        <div className="mt-8 grid h-56 grid-cols-8 items-end gap-3 px-4" style={{ borderBottom: "1px solid var(--border)", borderLeft: "1px solid var(--border)" }}>
          {[42,48,51,57,61,65,70,74].map((v) => (
            <div key={v} className="rounded-t bg-gradient-to-t from-indigo-600 to-violet-400" style={{ height: `${v}%` }} />
          ))}
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Metric label="Your performance" value="74" />
          <Metric label="Organisation benchmark" value="71" />
          <Metric label="Outcome signal" value="+12%" />
        </div>
      </Card>
    </RolePageShell>
  );
}

/* ── Manager pages ── */
export function ManagerMaps() {
  return (
    <RolePageShell role="manager" active="/manager/capability-maps">
      <PageIntro eyebrow="Manager / Capability Maps" title="Find the team's weak signals." text="Review capability maps for every learner and act on cohort-level patterns." />
      <Card>
        <div className="flex items-center gap-2 text-amber-500"><Flag className="h-4 w-4" />Weakness notification</div>
        <p className="mt-2 text-sm t-muted">Data storytelling is below benchmark for 38% of your cohort.</p>
        <div className="mt-6 space-y-3">
          {[["Priya Shah","On track · 76",false],["Jordan Lee","Needs support · 58",true],["Sam Rivera","On track · 76",false]].map(([name, status, risk]) => (
            <div key={name as string} className="flex items-center justify-between rounded-xl p-4" style={{ background: "var(--bg-subtle)" }}>
              <span className="text-sm t-fg">{name}</span>
              <span className={risk ? "text-amber-500 text-sm" : "text-emerald-500 text-sm"}>{status}</span>
            </div>
          ))}
        </div>
      </Card>
    </RolePageShell>
  );
}

export function ManagerEvidence() {
  return (
    <RolePageShell role="manager" active="/manager/evidence">
      <PageIntro eyebrow="Manager / Evidence Validation" title="Review submitted evidence." text="Validate learner evidence and approve or request revision before capability updates." />
      <Card>
        <p className="text-sm t-muted">No evidence pending review.</p>
      </Card>
    </RolePageShell>
  );
}

export function ManagerImpact() {
  return (
    <RolePageShell role="manager" active="/manager/impact">
      <PageIntro eyebrow="Manager / Impact Signals" title="Compare every learner to the benchmark." text="Cohort alerts surface where intervention will have the highest impact." />
      <Card>
        <div className="mb-5 flex items-center gap-2 text-amber-500"><Flag className="h-4 w-4" />3 cohort weakness alerts</div>
        {[["Priya Shah","81","75","Above"],["Jordan Lee","58","72","At risk"],["Sam Rivera","76","74","On track"]].map(([name, score, benchmark, status]) => (
          <div key={name} className="grid grid-cols-4 py-4 text-sm" style={{ borderTop: "1px solid var(--border)" }}>
            <span className="t-fg">{name}</span>
            <span className="t-fg">{score}</span>
            <span className="t-muted">{benchmark}</span>
            <span className={status === "At risk" ? "text-amber-500" : "text-emerald-500"}>{status}</span>
          </div>
        ))}
      </Card>
    </RolePageShell>
  );
}

/* ── Admin pages ── */
export function AdminUsers() {
  return (
    <RolePageShell role="admin" active="/admin/users">
      <PageIntro eyebrow="Admin / User Management" title="Manage programme access." text="One directory for all learners and managers, with role-aware access controls." />
      <Card>
        <div className="mb-5 flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "var(--bg-subtle)" }}>
          <Search className="h-4 w-4 t-subtle-fg" />
          <input placeholder="Search users" className="w-full bg-transparent text-sm outline-none" style={{ color: "var(--fg)" }} />
        </div>
        {[["Alex Morgan","Learner","Active"],["Priya Shah","Manager","Active"],["Jordan Lee","Learner","Invited"]].map(([name, role, status]) => (
          <div key={name} className="grid grid-cols-3 py-4 text-sm" style={{ borderTop: "1px solid var(--border)" }}>
            <span className="t-fg">{name}</span>
            <span style={{ color: "var(--accent-fg)" }}>{role}</span>
            <span className="text-emerald-500">{status}</span>
          </div>
        ))}
      </Card>
    </RolePageShell>
  );
}

export function AdminInsights() {
  const [generated, setGenerated] = useState(false);
  return (
    <RolePageShell role="admin" active="/admin/insights">
      <PageIntro eyebrow="Admin / Insight Manager" title="Turn programme data into insight." text="Export decipherable data and retain a history of generated reports." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <FileBarChart className="h-5 w-5" style={{ color: "var(--accent-fg)" }} />
          <h2 className="mt-4 font-semibold t-fg">Create export</h2>
          <select className="mt-5 h-11 w-full rounded-xl px-3 text-sm" style={{ border: "1px solid var(--border)", background: "var(--bg-input)", color: "var(--fg)" }}>
            <option>Programme health</option>
            <option>Capability outcomes</option>
            <option>Manager validation</option>
          </select>
          <div className="mt-3 flex gap-2">
            <button onClick={() => setGenerated(true)} className="rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white">Generate CSV</button>
            <button className="rounded-xl px-4 py-3 text-sm" style={{ border: "1px solid var(--border)", background: "var(--bg-subtle)", color: "var(--fg)" }}>JSON</button>
          </div>
          {generated && <p className="mt-4 text-xs text-emerald-500">Export generated and added to report history.</p>}
        </Card>
        <Card>
          <h2 className="font-semibold t-fg">Report history</h2>
          {["Q2 Capability Health · CSV","Manager Validation Review · XLSX","Cohort Transfer Summary · JSON"].map((report) => (
            <div key={report} className="flex items-center justify-between py-4 text-sm" style={{ borderTop: "1px solid var(--border)" }}>
              <span className="t-fg">{report}</span>
              <Download className="h-4 w-4 t-subtle-fg" />
            </div>
          ))}
        </Card>
      </div>
    </RolePageShell>
  );
}
