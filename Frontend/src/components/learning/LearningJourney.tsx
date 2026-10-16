"use client";

/**
 * The learner journey, the activity player, and the facilitator's queue of
 * open answers the AI could not settle.
 *
 * The journey always ends at "Apply it at work". Every learning step before it
 * moves what the learner knows; only that last step, validated by a manager,
 * moves capability. The page says so, because a learner who aces the e-learn
 * and sees no level change deserves to know why.
 */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, Loader2, Lock } from "lucide-react";

import { AppShell, ErrorNote, Loading, PageIntro, describeError } from "@/components/AppShell";
import { Mirror, narrate } from "@/components/explain/Mirror";
import { ExerciseInput, ResultLine } from "@/components/learning/Exercises";
import { PreviewModal } from "@/components/learning/PreviewModal";
import { useResource } from "@/lib/useResource";
import {
  type ActivityDetail,
  type ActivitySummary,
  type AttemptResult,
  type CapabilityState,
  getActivity,
  getAttempt,
  getMyCapabilityStates,
  getOpenAnswers,
  type ItemAnswer,
  listActivities,
  markOpenAnswer,
  type OpenAnswer,
  percent as pct,
  submitAttempt,
} from "@/services/api";

// --- Journey -----------------------------------------------------------------

const KIND_LABEL: Record<ActivitySummary["kind"], string> = {
  elearn: "E-learn",
  assessment: "Assessment",
  peer_activity: "Peer practice",
  ai_practice: "AI practice",
};

function stageLabel(a: ActivitySummary) {
  if (a.kind === "assessment" && a.phase === "pre") return "Starting point";
  if (a.kind === "assessment" && a.phase === "post") return "After learning";
  return KIND_LABEL[a.kind];
}

function StepDot({ n, state }: { n: number; state: "done" | "open" | "locked" | "work" }) {
  const styles: Record<typeof state, React.CSSProperties> = {
    done: { background: "var(--knows)", color: "#fff", borderColor: "var(--knows)" },
    open: { background: "var(--bg)", color: "var(--knows-ink)", borderColor: "var(--knows)" },
    locked: { background: "var(--bg)", color: "var(--ink-3)", borderColor: "var(--line-strong)" },
    work: { background: "var(--does)", color: "#fff", borderColor: "var(--does)" },
  };
  return (
    <span
      className="num relative z-10 grid h-8 w-8 shrink-0 place-items-center text-[13px] font-semibold"
      style={{ border: "2px solid", ...styles[state] }}
    >
      {state === "done" ? <Check className="h-4 w-4" /> : state === "locked" ? <Lock className="h-3.5 w-3.5" /> : n}
    </span>
  );
}

function Stage({ a, n }: { a: ActivitySummary; n: number }) {
  const [preview, setPreview] = useState(false);
  const done = a.attempts_used > 0;
  const exhausted = a.max_attempts > 0 && a.attempts_used >= a.max_attempts;
  const previewable = !a.available && (a.kind === "peer_activity" || a.kind === "ai_practice");
  const state = !a.available ? "locked" : done ? "done" : "open";

  const status = !a.available
    ? `Opens ${a.available_from ? new Date(a.available_from).toLocaleDateString() : "later"}`
    : done
      ? `First attempt ${pct(a.first_score)}${a.attempts_used > 1 ? ` · latest ${pct(a.latest_score)}` : ""}${a.latest_status === "scoring" ? " · open answers being marked" : ""}${exhausted ? " · complete" : ""}`
      : `${a.item_count} exercises · about ${a.estimated_minutes} min`;

  const body = (
    <div className="flex gap-4 py-4">
      <StepDot n={n} state={state} />
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="meta">{stageLabel(a)}</p>
        <p className="mt-0.5 text-[0.9375rem] font-medium t-fg">{a.title}</p>
        <p className="mt-1 text-sm leading-6 t-muted">{a.summary}</p>
        <p className="meta mt-1.5 num">
          {status}
          {previewable && <span className="ink-primary"> · preview it now</span>}
        </p>
      </div>
      {(previewable || (a.available && !exhausted)) && <ArrowRight className="mt-2 h-4 w-4 shrink-0 ink-primary" />}
    </div>
  );

  const rowClass = "block w-full  px-3 text-left transition hover:bg-[var(--surface)]";
  if (previewable) {
    return (
      <>
        <button type="button" onClick={() => setPreview(true)} className={rowClass}>
          {body}
        </button>
        {preview && <PreviewModal activity={a} onClose={() => setPreview(false)} />}
      </>
    );
  }
  return a.available && !exhausted ? (
    <Link href={`/learner/learn/${a.id}`} className={rowClass}>{body}</Link>
  ) : (
    <div className="px-3">{body}</div>
  );
}

function ApplyAtWork({ state, n }: { state?: CapabilityState; n: number }) {
  return (
    <Link href="/learner/evidence" className="block px-3 transition hover:bg-[var(--surface)]">
      <div className="flex gap-4 py-4">
        <StepDot n={n} state="work" />
        <div className="flex-1 pt-0.5">
          <p className="meta ink-does">Implement at work</p>
          <p className="mt-0.5 text-[0.9375rem] font-medium t-fg">Apply it, then submit the evidence</p>
          <p className="mt-1 text-sm leading-6 t-muted">
            The only step that moves your level. Your manager validates what you did.
          </p>
          {state && <p className="mt-1.5 text-sm t-fg">{state.recommended_next_action}</p>}
        </div>
        <ArrowRight className="mt-2 h-4 w-4 shrink-0 ink-does" />
      </div>
    </Link>
  );
}

const loadJourney = () => Promise.all([listActivities(), getMyCapabilityStates()]);

export function LearningJourneyPage() {
  const journey = useResource(loadJourney);
  const [activities, states] = journey.data ?? [[], []];

  const byCapability = useMemo(() => {
    const groups = new Map<string, ActivitySummary[]>();
    for (const a of activities) {
      groups.set(a.capability_id, [...(groups.get(a.capability_id) ?? []), a]);
    }
    return [...groups.entries()];
  }, [activities]);

  return (
    <AppShell role="learner" active="/learner/learn">
      <PageIntro
        title={<><em>Learn it.</em> Check it. <em className="does">Do it.</em></>}
        text="E-learns and assessments build and measure what you know. Your level moves when you apply it at work and your manager validates it, so the journey always ends there."
      />
      {journey.loading && !journey.data && <Loading label="Loading your journey…" />}
      {journey.error && <ErrorNote message={journey.error} onRetry={journey.reload} />}
      {journey.data && byCapability.length === 0 && (
        <p className="inset px-5 py-6 text-sm t-muted">No learning activities have been assigned yet.</p>
      )}
      <div className="space-y-16">
        {byCapability.map(([capabilityId, acts]) => {
          const state = states.find((s) => s.capability_id === capabilityId);
          return (
            <section key={capabilityId} className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-14">
              <div>
                <h2 className="display display-md">{acts[0].capability_name}</h2>
                <ol className="relative mt-4">
                  {/* the path */}
                  <span aria-hidden className="absolute bottom-10 left-[1.69rem] top-10 w-px" style={{ background: "var(--line-strong)" }} />
                  {acts.map((a, i) => (
                    <li key={a.id}><Stage a={a} n={i + 1} /></li>
                  ))}
                  <li><ApplyAtWork state={state} n={acts.length + 1} /></li>
                </ol>
              </div>
              {state && (
                <aside className="lg:pt-14">
                  <p className="display text-[1.125rem] leading-snug">{narrate(state).headline}</p>
                  <div className="mt-5">
                    <Mirror state={state} />
                  </div>
                  {state.knowledge_pre !== null && state.knowledge_post !== null && (
                    <p className="meta mt-5 num">
                      Assessment {pct(state.knowledge_pre)} → {pct(state.knowledge_post)}
                      {state.knowledge_gain !== null && <> · learning gain {Math.round(state.knowledge_gain * 100)}% of what was left to learn</>}
                    </p>
                  )}
                </aside>
              )}
            </section>
          );
        })}
      </div>
    </AppShell>
  );
}

// --- Activity player -----------------------------------------------------------

const POLL_MS = 4000;
const FIRST_POLL_MS = 1500; // a cached or fast evaluation lands well inside this
const POLL_LIMIT = 30; // two minutes; the free model endpoint can be slow

export function ActivityPlayerPage({ activityId }: { activityId: string }) {
  const [activity, setActivity] = useState<ActivityDetail | null>(null);
  const [answers, setAnswers] = useState<Record<string, ItemAnswer>>({});
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const polls = useRef(0);

  useEffect(() => {
    getActivity(activityId)
      .then(setActivity)
      .catch((err) => setError(describeError(err, "Could not load this activity.")));
  }, [activityId]);

  // While open answers are being marked, poll until they settle.
  useEffect(() => {
    if (!result || result.pending_items === 0 || polls.current >= POLL_LIMIT) return;
    const t = setTimeout(async () => {
      polls.current += 1;
      try {
        setResult(await getAttempt(result.attempt_id));
      } catch {
        /* keep the last good result; the next poll may succeed */
      }
    }, polls.current === 0 ? FIRST_POLL_MS : POLL_MS);
    return () => clearTimeout(t);
  }, [result]);

  async function submit() {
    if (!activity) return;
    setSubmitting(true);
    setError(null);
    try {
      polls.current = 0;
      setResult(await submitAttempt(activity.id, answers));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(describeError(err, "Could not submit."));
    } finally {
      setSubmitting(false);
    }
  }

  if (error && !activity) {
    return (
      <AppShell role="learner" active="/learner/learn">
        <ErrorNote message={error} />
      </AppShell>
    );
  }
  if (!activity) {
    return (
      <AppShell role="learner" active="/learner/learn">
        <Loading label="Loading…" />
      </AppShell>
    );
  }

  const resultFor = (id: string) => result?.items.find((r) => r.item_id === id);
  const itemsAfter = (section: number) => activity.items.filter((i) => i.section === section);
  const trailing = activity.items.filter(
    (i) => i.section < 0 || i.section >= activity.sections.length,
  );
  const unanswered = activity.items.filter((i) => !answers[i.id] && i.item_type !== "rank").length;
  const isAssessment = activity.kind === "assessment";

  const renderItem = (item: ActivityDetail["items"][number], n: number) => (
    <section key={item.id} className="rule py-8" aria-labelledby={`q-${item.id}`}>
      <div className="grid gap-4 sm:grid-cols-[2.5rem_1fr]">
        <span className="display text-2xl leading-none ink-primary num">{n}</span>
        <div className="min-w-0">
          <p className="meta capitalize">
            {item.dimension}
            {item.points !== 1 && ` · ${item.points} points`}
          </p>
          <p id={`q-${item.id}`} className="mb-5 mt-1 text-[0.9375rem] font-medium leading-6 t-fg">{item.prompt}</p>
          <ExerciseInput
            item={item}
            value={answers[item.id] ?? {}}
            onChange={(v) => setAnswers((prev) => ({ ...prev, [item.id]: v }))}
            result={resultFor(item.id)}
          />
          {resultFor(item.id) && <ResultLine result={resultFor(item.id)!} />}
        </div>
      </div>
    </section>
  );

  let counter = 0;
  return (
    <AppShell role="learner" active="/learner/learn">
      <div className="max-w-[52rem]">
        <p className="meta">
          {activity.capability_name} · {isAssessment ? (activity.phase === "pre" ? "Starting point" : "After learning") : "E-learn"}
        </p>
        <h1 className="display display-lg mt-2">{activity.title}</h1>
        <p className="lede mt-3">{activity.summary}</p>

        {isAssessment && !result && (
          <p className="note note-info mt-6">
            {activity.phase === "pre"
              ? "This is a baseline, taken once. Answer from what you know now: a low score here is expected, and it is what makes your progress measurable."
              : "This measures what moved since your starting point. Answers are not revealed, so the measurement stays honest."}
          </p>
        )}

        {result && <AttemptSummary result={result} activity={activity} />}

        <div className="mt-8">
          {activity.sections.map((section, idx) => (
            <div key={section.heading}>
              <section className="rule py-8">
                <h2 className="display display-sm">{section.heading}</h2>
                <div className="mt-4 space-y-4">
                  {section.body.split("\n\n").map((para) => (
                    <p key={para.slice(0, 40)} className="reading whitespace-pre-line">{para}</p>
                  ))}
                </div>
              </section>
              {itemsAfter(idx).map((item) => renderItem(item, ++counter))}
            </div>
          ))}
          {trailing.map((item) => renderItem(item, ++counter))}
        </div>

        {error && <div className="mt-5"><ErrorNote message={error} /></div>}

        {!result && (
          <div className="rule flex flex-wrap items-center gap-4 pt-6">
            <button onClick={submit} disabled={submitting} className="btn btn-primary btn-lg">
              {submitting && <Loader2 className="animate-spin" />}
              Submit answers
            </button>
            {unanswered > 0 && (
              <span className="meta">{unanswered} unanswered: they will score zero.</span>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function AttemptSummary({ result, activity }: { result: AttemptResult; activity: ActivityDetail }) {
  return (
    <section className="mt-8 rule rule-b py-6" aria-label="Your result">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="meta">Attempt {result.attempt_number}</p>
          <p className="display num mt-1 text-5xl ink-knows">{pct(result.score)}</p>
          <p className="meta mt-2 num">
            {result.points_earned.toFixed(1)} of {result.points_scored.toFixed(1)} marked points
            {result.pending_items > 0 && ` · ${result.pending_items} open answer${result.pending_items > 1 ? "s" : ""} still being marked`}
          </p>
        </div>
        {result.pending_items > 0 && <Loader2 className="h-5 w-5 animate-spin ink-primary" />}
      </div>
      <p className="mt-4 max-w-[60ch] text-sm leading-6 t-muted">
        This measures what you <strong className="font-medium ink-knows">know</strong>. Your level moves when you apply
        it at work and your manager validates it.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Link href="/learner/evidence" className="btn btn-primary">
          Apply it at work <ArrowRight />
        </Link>
        <Link href="/learner/learn" className="btn btn-secondary">
          Back to the journey
        </Link>
        {activity.kind === "elearn" && (
          <button onClick={() => window.location.reload()} className="btn btn-text">
            Try again (the first attempt is what counts)
          </button>
        )}
      </div>
    </section>
  );
}

// --- Facilitator queue -----------------------------------------------------------

export function OpenAnswerQueuePage() {
  const answers = useResource(getOpenAnswers);
  const queue = answers.data ?? [];
  const [error, setError] = useState<string | null>(null);
  const [marks, setMarks] = useState<Record<string, boolean[]>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  async function save(entry: OpenAnswer) {
    const met = marks[entry.response_id] ?? [];
    const credit = entry.key_points.length ? met.filter(Boolean).length / entry.key_points.length : 0;
    setSaving(entry.response_id);
    try {
      await markOpenAnswer(entry.response_id, credit, notes[entry.response_id] ?? "");
      answers.reload();
    } catch (err) {
      setError(describeError(err, "Could not save the mark."));
    } finally {
      setSaving(null);
    }
  }

  return (
    <AppShell role="manager" active="/manager/answers">
      <PageIntro
        title="Answers the AI would not mark alone."
        text="Each one either had no model available, or the marking guide did not anticipate it. Tick the key points the answer meets; the mark is the share ticked."
      />
      {answers.loading && !answers.data && <Loading label="Loading…" />}
      {answers.error && <ErrorNote message={answers.error} onRetry={answers.reload} />}
      {error && <ErrorNote message={error} />}
      {answers.data && queue.length === 0 && (
        <p className="inset px-5 py-6 text-sm t-muted">Nothing waiting. Every open answer has been marked.</p>
      )}
      <div className="rows rule">
        {queue.map((entry) => {
          const met = marks[entry.response_id] ?? entry.key_points.map(() => false);
          return (
            <article key={entry.response_id} className="max-w-[52rem] py-8">
              <p className="meta">{entry.activity_title} · {entry.learner_name}</p>
              <p className="mt-2 text-[0.9375rem] font-medium leading-6 t-fg">{entry.question}</p>
              <blockquote className="reading mt-4 border-l-2 pl-4" style={{ borderColor: "var(--line-strong)" }}>
                {entry.answer}
              </blockquote>
              {entry.ai_note && <p className="meta mt-3">AI note: {entry.ai_note}</p>}
              <fieldset className="mt-5 space-y-2.5">
                <legend className="field-label">Key points met</legend>
                {entry.key_points.map((kp, i) => (
                  <label key={kp} className="flex items-start gap-3 text-sm leading-6 t-fg">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4"
                      checked={met[i]}
                      onChange={() => {
                        const next = [...met];
                        next[i] = !next[i];
                        setMarks((m) => ({ ...m, [entry.response_id]: next }));
                      }}
                    />
                    {kp}
                  </label>
                ))}
              </fieldset>
              <textarea
                rows={2}
                placeholder="Feedback for the learner (optional)"
                value={notes[entry.response_id] ?? ""}
                onChange={(e) => setNotes((n) => ({ ...n, [entry.response_id]: e.target.value }))}
                className="field mt-5"
              />
              <button
                onClick={() => save(entry)}
                disabled={saving === entry.response_id}
                className="btn btn-primary mt-4"
              >
                {saving === entry.response_id && <Loader2 className="animate-spin" />}
                Save mark · {met.filter(Boolean).length} of {entry.key_points.length}
              </button>
            </article>
          );
        })}
      </div>
    </AppShell>
  );
}
