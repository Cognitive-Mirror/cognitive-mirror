"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronRight, CircleAlert, FileCheck2, FileText, Flag, Search, ShieldCheck, Sparkles, Upload, UsersRound } from "lucide-react";
import { ProfileMenu, ThemeToggle } from "@/components/ThemeControls";

const shell = "min-h-screen t-bg t-fg";

function Header({ role }: { role: string }) {
  return (
    <header
      className="sticky top-0 z-20 backdrop-blur-xl"
      style={{ borderBottom: "1px solid var(--border)", background: "var(--bg)" }}
    >
      <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between px-5 lg:px-8">
        <Link href={`/${role}`} className="flex items-center gap-2 text-sm font-semibold t-fg">
          <ProfileMenu role={role} />
          <span>Cognitive Mirror</span>
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}

function Back({ role }: { role: string }) {
  return (
    <Link
      href={`/${role}`}
      className="mt-7 inline-flex items-center gap-2 text-sm transition hover:opacity-85"
      style={{ color: "var(--fg-muted)" }}
    >
      <ArrowLeft className="h-4 w-4" />
      Back to dashboard
    </Link>
  );
}

function Card({ children, className = "", style = {} }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <section
      className={`rounded-2xl p-6 ${className}`}
      style={{ border: "1px solid var(--border)", background: "var(--bg-card)", ...style }}
    >
      {children}
    </section>
  );
}

export function LearnerEvidencePage() {
  const [submitted, setSubmitted] = useState(false);
  return (
    <main className={shell}>
      <Header role="learner" />
      <div className="mx-auto max-w-[980px] px-5 py-10 lg:px-8">
        <p className="text-xs font-bold uppercase tracking-[.18em]" style={{ color: "var(--accent-fg)" }}>Learner workspace / Evidence</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-.04em] t-fg">Submit capability evidence.</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 t-muted">Show what changed in your work, add context, and give your manager a clear validation path.</p>
        {submitted && (
          <div className="mt-6 flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-300">
            <Check className="h-4 w-4" />
            Evidence submitted for manager validation. Your Capability State Model has been updated.
          </div>
        )}
        <div className="mt-8 grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
          <form
            onSubmit={(event) => { event.preventDefault(); setSubmitted(true); }}
            className="rounded-2xl p-6 space-y-5"
            style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}
          >
            <div>
              <label className="text-sm font-medium t-fg">Evidence title</label>
              <input
                required
                placeholder="e.g. Led the Q2 stakeholder review"
                className="mt-2 h-12 w-full rounded-xl px-4 text-sm outline-none transition focus:ring-2 focus:ring-indigo-400/30"
                style={{ border: "1px solid var(--border)", background: "var(--bg-input)", color: "var(--fg)" }}
              />
            </div>
            <div>
              <label className="text-sm font-medium t-fg">Capability demonstrated</label>
              <select
                className="mt-2 h-12 w-full rounded-xl px-4 text-sm outline-none"
                style={{ border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--fg)" }}
              >
                <option>Stakeholder influence</option>
                <option>Strategic decision making</option>
                <option>Data storytelling</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium t-fg">What happened?</label>
              <textarea
                required
                rows={5}
                placeholder="Describe the situation, your actions, and the observable result..."
                className="mt-2 w-full rounded-xl px-4 py-3 text-sm outline-none transition focus:ring-2 focus:ring-indigo-400/30"
                style={{ border: "1px solid var(--border)", background: "var(--bg-input)", color: "var(--fg)" }}
              />
            </div>
            <div>
              <label className="text-sm font-medium t-fg">Attach workplace evidence</label>
              <div className="mt-2 rounded-xl border border-dashed p-5 text-center t-border" style={{ background: "var(--bg-subtle)" }}>
                <Upload className="mx-auto h-5 w-5 text-indigo-400" />
                <p className="mt-2 text-sm t-fg">Drop a file or paste a link</p>
                <p className="mt-1 text-xs t-subtle-fg">PDF, document, screenshot, or project link</p>
              </div>
            </div>
            <button className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-400">
              Submit for validation <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <aside className="rounded-2xl p-6 h-fit" style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}>
            <Sparkles className="h-5 w-5 text-indigo-400" />
            <h2 className="mt-4 font-semibold t-fg">Make evidence stronger</h2>
            <ul className="mt-4 space-y-4 text-sm leading-5 t-muted">
              <li><strong className="t-fg">Context:</strong> what was the challenge?</li>
              <li><strong className="t-fg">Action:</strong> what did you personally do?</li>
              <li><strong className="t-fg">Outcome:</strong> what changed, and how do you know?</li>
              <li><strong className="t-fg">Reflection:</strong> what would you repeat or improve?</li>
            </ul>
            <div className="mt-6 rounded-xl p-3 text-xs leading-5" style={{ border: "1px solid rgba(99,102,241,0.2)", background: "rgba(99,102,241,0.06)", color: "var(--fg)" }}>
              Your manager will receive AI-generated validation prompts with this submission.
            </div>
          </aside>
        </div>
        <Back role="learner" />
      </div>
    </main>
  );
}

const evidenceItems = [
  { name: "Priya Shah", title: "Reframed Q2 launch decision", capability: "Strategic decision making", quality: "Strong", date: "Today", summary: "Priya brought three competing signals into a clear decision brief, aligned product and sales, and documented the trade-off accepted by the team." },
  { name: "Jordan Lee", title: "Customer escalation reset", capability: "Stakeholder influence", quality: "Needs more detail", date: "Yesterday", summary: "Jordan describes a successful customer conversation, but the evidence does not yet show their specific actions or an observable outcome." },
  { name: "Sam Rivera", title: "Forecast narrative for leadership", capability: "Data storytelling", quality: "Strong", date: "Mon", summary: "Sam translated a variance analysis into a concise narrative that helped leadership choose a revised forecast." }
];

export function ManagerEvidencePage() {
  const [selected, setSelected] = useState(0);
  const [validated, setValidated] = useState<number[]>([]);
  const item = evidenceItems[selected];
  const isValidated = validated.includes(selected);
  const pattern = useMemo(() => "The team is strongest at describing activity; two submissions need clearer outcome measures.", []);

  return (
    <main className={shell}>
      <Header role="manager" />
      <div className="mx-auto max-w-[1180px] px-5 py-10 lg:px-8">
        <p className="text-xs font-bold uppercase tracking-[.18em]" style={{ color: "var(--accent-fg)" }}>Manager workspace / Evidence explorer</p>
        <div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-4xl font-semibold tracking-[-.04em] t-fg">Review evidence with less effort.</h1>
            <p className="mt-2 text-sm t-muted">AI pre-reads every submission and gives you the questions that matter.</p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-300">
            <CircleAlert className="h-4 w-4" />
            2 awaiting validation
          </span>
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
          <div className="rounded-2xl p-3" style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}>
            <div className="mb-3 flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "var(--bg-subtle)" }}>
              <Search className="h-4 w-4 t-subtle-fg" />
              <input placeholder="Search team evidence" className="w-full bg-transparent text-sm outline-none t-fg" />
            </div>
            {evidenceItems.map((entry, index) => (
              <button
                key={entry.title}
                onClick={() => setSelected(index)}
                className="w-full rounded-xl p-4 text-left transition"
                style={selected === index ? { background: "rgba(99,102,241,0.12)", border: "1px solid var(--border)" } : {}}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold t-fg">{entry.title}</p>
                    <p className="mt-1 text-xs t-subtle-fg">{entry.name} · {entry.date}</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[10px] ${entry.quality === "Strong" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" : "bg-amber-500/10 text-amber-600 dark:text-amber-300"}`}>
                    {entry.quality}
                  </span>
                </div>
                <p className="mt-3 text-xs t-muted">{entry.capability}</p>
              </button>
            ))}
          </div>

          <div className="rounded-2xl p-6" style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs t-subtle-fg">Submitted by {item.name}</p>
                <h2 className="mt-1 text-2xl font-semibold t-fg">{item.title}</h2>
                <p className="mt-2 text-sm" style={{ color: "var(--accent-fg)" }}>{item.capability}</p>
              </div>
              <FileCheck2 className="h-6 w-6 text-indigo-400" />
            </div>

            <div className="mt-6 rounded-xl p-4" style={{ border: "1px solid rgba(99,102,241,0.2)", background: "rgba(99,102,241,0.06)" }}>
              <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--accent-fg)" }}>
                <Sparkles className="h-4 w-4" />
                AI evidence brief
              </div>
              <p className="mt-3 text-sm leading-6 t-fg">{item.summary}</p>
              <p className="mt-3 text-xs" style={{ color: "var(--accent-fg)" }}>Demonstrates: {item.capability} · Evidence strength: {item.quality}</p>
            </div>

            <div className="mt-5">
              <h3 className="text-sm font-semibold t-fg">Suggested validation questions</h3>
              <ul className="mt-3 space-y-2 text-sm t-muted">
                {["What observable result changed because of your intervention?", "Which part of the decision was yours to own?", "What would your stakeholder say you did differently?"].map((q) => (
                  <li key={q} className="rounded-lg p-3" style={{ background: "var(--bg-subtle)" }}>{q}</li>
                ))}
              </ul>
            </div>

            {item.quality !== "Strong" && (
              <div className="mt-5 flex gap-2 rounded-xl p-3 text-xs leading-5" style={{ border: "1px solid rgba(251,191,36,0.2)", background: "rgba(251,191,36,0.06)", color: "var(--fg)" }}>
                <Flag className="h-4 w-4 shrink-0 text-amber-500" />
                Evidence appears incomplete. Ask for a measurable outcome before validating.
              </div>
            )}
            <button
              onClick={() => setValidated((values) => values.includes(selected) ? values : [...values, selected])}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-400"
            >
              {isValidated ? "Validated" : "Validate evidence"}
              <Check className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-5 flex gap-3 p-5 rounded-2xl" style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}>
          <UsersRound className="h-5 w-5 text-indigo-400" />
          <div>
            <h2 className="text-sm font-semibold t-fg">Team pattern detected</h2>
            <p className="mt-1 text-sm t-muted">{pattern}</p>
            <p className="mt-2 text-xs" style={{ color: "var(--accent-fg)" }}>Recommended follow-up: run a 15-minute outcome-mapping practice in the next cohort session.</p>
          </div>
        </div>
        <Back role="manager" />
      </div>
    </main>
  );
}

export function AdminHealthPage() {
  return (
    <main className={shell}>
      <Header role="admin" />
      <div className="mx-auto max-w-[1180px] px-5 py-10 lg:px-8">
        <p className="text-xs font-bold uppercase tracking-[.18em]" style={{ color: "var(--accent-fg)" }}>Admin workspace / Program health</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-.04em] t-fg">Monitor rollout health.</h1>
        <p className="mt-2 text-sm t-muted">Find workflow gaps before they become blind spots in your impact story.</p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Active learners", "248", "+18% this month", "emerald"],
            ["Workflow completion", "82%", "18 incomplete flows", "amber"],
            ["Awaiting validation", "27", "Across 9 managers", "amber"],
            ["Capability signals", "1,406", "Healthy data coverage", "emerald"]
          ].map(([label, val, detail, tone]) => (
            <div key={label} className="rounded-2xl p-5" style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}>
              <p className="text-xs t-subtle-fg">{label}</p>
              <p className="mt-2 text-3xl font-semibold t-fg">{val}</p>
              <p className={`mt-2 text-xs ${tone === "emerald" ? "text-emerald-500" : "text-amber-500"}`}>{detail}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Card>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-indigo-400" />
              <h2 className="font-semibold t-fg">Workflow exceptions</h2>
            </div>
            <div className="mt-5 space-y-3">
              {[["Missing manager validation", "27 submissions", "amber"], ["Learner evidence drafts", "18 incomplete", "amber"], ["KPI link not configured", "3 programmes", "red"], ["Cohort reflection cycle", "On track", "green"]].map(([label, value, tone]) => (
                <div key={label} className="flex items-center justify-between rounded-xl p-3" style={{ background: "var(--bg-subtle)" }}>
                  <div>
                    <p className="text-sm t-fg">{label}</p>
                    <p className="mt-1 text-xs t-subtle-fg">{value}</p>
                  </div>
                  <span className={`h-2.5 w-2.5 rounded-full ${tone === "green" ? "bg-emerald-500" : tone === "red" ? "bg-red-500" : "bg-amber-500"}`} />
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-indigo-400" />
              <h2 className="font-semibold t-fg">Rollout visibility</h2>
            </div>
            <div className="mt-6 space-y-5">
              {[["Evidence submitted", 76, "bg-indigo-500"], ["Manager validation", 64, "bg-amber-500"], ["KPI-linked outcomes", 58, "bg-fuchsia-500"]].map(([label, val, barColor]) => (
                <div key={label as string}>
                  <div className="flex justify-between text-sm"><span className="t-fg">{label as string}</span><span className="t-muted">{val as number}%</span></div>
                  <div className="mt-2 h-2 rounded-full" style={{ background: "var(--bg-subtle)" }}>
                    <div className={`h-full rounded-full ${barColor}`} style={{ width: `${val}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <button className="mt-7 inline-flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--accent-fg)" }}>
              Export health report <ChevronRight className="h-4 w-4" />
            </button>
          </Card>
        </div>
        <Back role="admin" />
      </div>
    </main>
  );
}
