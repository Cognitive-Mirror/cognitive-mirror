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
import {
  ArrowRight,
  BookOpen,
  Bot,
  Briefcase,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  Lock,
  Users,
} from "lucide-react";

import {
  AppShell,
  Card,
  ErrorNote,
  Loading,
  PageIntro,
  describeError,
  fieldClass,
  fieldStyle,
} from "@/components/AppShell";
import { ExerciseInput, ResultLine } from "@/components/learning/Exercises";
import { KnowsDoes } from "@/components/learning/KnowsDoes";
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

const KIND_META: Record<ActivitySummary["kind"], { icon: typeof BookOpen; label: string }> = {
  elearn: { icon: BookOpen, label: "E-learn" },
  assessment: { icon: ClipboardCheck, label: "Assessment" },
  peer_activity: { icon: Users, label: "Peer practice" },
  ai_practice: { icon: Bot, label: "AI practice" },
};

function stageLabel(a: ActivitySummary) {
  if (a.kind === "assessment" && a.phase === "pre") return "Starting point";
  if (a.kind === "assessment" && a.phase === "post") return "After learning";
  return KIND_META[a.kind].label;
}

function Stage({ a }: { a: ActivitySummary }) {
  const [preview, setPreview] = useState(false);
  const { icon: Icon } = KIND_META[a.kind];
  const previewable = !a.available && (a.kind === "peer_activity" || a.kind === "ai_practice");
  const done = a.attempts_used > 0;
  const exhausted = a.max_attempts > 0 && a.attempts_used >= a.max_attempts;
  const body = (
    <div
      className="flex items-start gap-4 rounded-2xl p-4 transition"
      style={{
        border: "1px solid var(--border)",
        background: a.available ? "var(--bg-card)" : "var(--bg-subtle)",
        opacity: a.available ? 1 : 0.7,
      }}
    >
      <span
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
        style={{ background: done ? "rgba(16,185,129,.12)" : "rgba(99,102,241,.12)" }}
      >
        {done ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : a.available ? <Icon className="h-5 w-5 text-indigo-500" /> : <Lock className="h-4 w-4 t-subtle-fg" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-[.16em] t-subtle-fg">{stageLabel(a)}</p>
        <p className="mt-0.5 font-medium t-fg">{a.title}</p>
        <p className="mt-1 text-xs leading-5 t-muted">{a.summary}</p>
        <p className="mt-2 text-[11px] t-subtle-fg">
          {!a.available
            ? `Available from ${a.available_from ? new Date(a.available_from).toLocaleDateString() : "a later date"}${previewable ? " · preview it now" : ""}`
            : done
              ? `First attempt ${pct(a.first_score)}${a.attempts_used > 1 ? ` · latest ${pct(a.latest_score)}` : ""}${a.latest_status === "scoring" ? " · open answers being marked" : ""}`
              : `${a.item_count} exercises · ~${a.estimated_minutes} min`}
          {exhausted && " · completed"}
        </p>
      </div>
      {a.available && !exhausted && <ArrowRight className="mt-3 h-4 w-4 shrink-0 t-subtle-fg" />}
    </div>
  );
  if (previewable) {
    return (
      <>
        <button type="button" onClick={() => setPreview(true)} className="block w-full text-left hover:opacity-90">
          {body}
        </button>
        {preview && <PreviewModal activity={a} onClose={() => setPreview(false)} />}
      </>
    );
  }
  return a.available && !exhausted ? (
    <Link href={`/learner/learn/${a.id}`} className="block hover:opacity-90">{body}</Link>
  ) : (
    body
  );
}

function ApplyAtWork({ state }: { state?: CapabilityState }) {
  return (
    <Link href="/learner/evidence" className="block hover:opacity-90">
      <div
        className="flex items-start gap-4 rounded-2xl p-4"
        style={{ border: "1px solid rgba(99,102,241,.35)", background: "rgba(99,102,241,.06)" }}
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-500 text-white">
          <Briefcase className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[.16em]" style={{ color: "var(--accent-fg)" }}>
            Implement at work
          </p>
          <p className="mt-0.5 font-medium t-fg">Apply it, then submit the evidence</p>
          <p className="mt-1 text-xs leading-5 t-muted">
            The only step that moves your capability level. Your manager validates what you did.
          </p>
          {state && <p className="mt-2 text-xs t-fg">{state.recommended_next_action}</p>}
        </div>
        <ArrowRight className="mt-3 h-4 w-4 shrink-0" style={{ color: "var(--accent-fg)" }} />
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
        eyebrow="Learner / Learning Journey"
        title="Learn it. Check it. Do it."
        text="E-learns and assessments build and measure what you know. Capability moves when you apply it at work and your manager validates it — the journey always ends there."
      />
      {journey.loading && <Loading label="Loading your journey…" />}
      {journey.error && <ErrorNote message={journey.error} onRetry={journey.reload} />}
      {!journey.loading && !journey.error && byCapability.length === 0 && (
        <Card><p className="text-sm t-muted">No learning activities have been assigned yet.</p></Card>
      )}
      <div className="space-y-8">
        {byCapability.map(([capabilityId, acts]) => {
          const state = states.find((s) => s.capability_id === capabilityId);
          return (
            <section key={capabilityId} className="grid gap-5 lg:grid-cols-[1fr_300px]">
              <div>
                <h2 className="mb-3 text-xl font-semibold t-fg">{acts[0].capability_name}</h2>
                <div className="space-y-3">
                  {acts.map((a) => <Stage key={a.id} a={a} />)}
                  <ApplyAtWork state={state} />
                </div>
              </div>
              {state && (
                <div className="lg:pt-10">
                  <KnowsDoes state={state} />
                </div>
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
    }, POLL_MS);
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
    <Card key={item.id} className="!p-5">
      <p className="text-[10px] font-bold uppercase tracking-[.16em] t-subtle-fg">
        Exercise {n} · {item.dimension}
        {item.points !== 1 && ` · ${item.points} points`}
      </p>
      <p className="mb-4 mt-2 text-sm font-medium leading-6 t-fg">{item.prompt}</p>
      <ExerciseInput
        item={item}
        value={answers[item.id] ?? {}}
        onChange={(v) => setAnswers((prev) => ({ ...prev, [item.id]: v }))}
        result={resultFor(item.id)}
      />
      {resultFor(item.id) && <ResultLine result={resultFor(item.id)!} />}
    </Card>
  );

  let counter = 0;
  return (
    <AppShell role="learner" active="/learner/learn">
      <PageIntro
        eyebrow={`${activity.capability_name} / ${isAssessment ? (activity.phase === "pre" ? "Starting point" : "After learning") : "E-learn"}`}
        title={activity.title}
        text={activity.summary}
      />

      {isAssessment && !result && (
        <p className="mb-5 rounded-xl px-4 py-3 text-xs leading-5 t-muted" style={{ background: "var(--bg-subtle)" }}>
          {activity.phase === "pre"
            ? "This is a baseline, taken once. Answer from what you know now — a low score here is expected and is what makes your progress measurable."
            : "This measures what moved since your starting point. Answers are not revealed, so the measurement stays honest."}
        </p>
      )}

      {result && <AttemptSummaryCard result={result} activity={activity} />}

      <div className="space-y-5">
        {activity.sections.map((section, idx) => (
          <div key={section.heading} className="space-y-5">
            <Card>
              <h2 className="text-lg font-semibold t-fg">{section.heading}</h2>
              <div className="mt-3 space-y-3 text-sm leading-7 t-muted">
                {section.body.split("\n\n").map((para) => (
                  <p key={para.slice(0, 40)} className="whitespace-pre-line">{para}</p>
                ))}
              </div>
            </Card>
            {itemsAfter(idx).map((item) => renderItem(item, ++counter))}
          </div>
        ))}
        {trailing.map((item) => renderItem(item, ++counter))}
      </div>

      {error && <div className="mt-5"><ErrorNote message={error} /></div>}

      {!result && (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            onClick={submit}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Submit answers
          </button>
          {unanswered > 0 && (
            <span className="text-xs t-subtle-fg">
              {unanswered} unanswered — they will score zero.
            </span>
          )}
        </div>
      )}
    </AppShell>
  );
}

function AttemptSummaryCard({ result, activity }: { result: AttemptResult; activity: ActivityDetail }) {
  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs t-subtle-fg">Attempt {result.attempt_number}</p>
          <p className="mt-1 text-4xl font-semibold tracking-tight t-fg">{pct(result.score)}</p>
          <p className="mt-1 text-xs t-muted">
            {result.points_earned.toFixed(1)} of {result.points_scored.toFixed(1)} marked points
            {result.pending_items > 0 && ` · ${result.pending_items} open answer${result.pending_items > 1 ? "s" : ""} still being marked`}
          </p>
        </div>
        {result.pending_items > 0 && <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />}
      </div>
      <p className="mt-4 text-xs leading-5 t-muted">
        This measures what you <strong className="t-fg">know</strong>. Your capability level moves when you apply
        it at work and your manager validates it.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link href="/learner/learn" className="rounded-xl px-4 py-2.5 text-sm font-semibold t-fg" style={{ border: "1px solid var(--border)" }}>
          Back to journey
        </Link>
        <Link href="/learner/evidence" className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white">
          Apply it at work <ArrowRight className="h-4 w-4" />
        </Link>
        {activity.kind === "elearn" && (
          <button onClick={() => window.location.reload()} className="rounded-xl px-4 py-2.5 text-sm t-muted">
            Try again (first attempt is what counts)
          </button>
        )}
      </div>
    </Card>
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
        eyebrow="Manager / Open Answers"
        title="Answers the AI would not mark alone."
        text="Each one either had no model available or the marking guide did not anticipate it. Tick the key points the answer meets; the mark is the share ticked."
      />
      {answers.loading && <Loading label="Loading…" />}
      {answers.error && <ErrorNote message={answers.error} onRetry={answers.reload} />}
      {error && <ErrorNote message={error} />}
      {!answers.loading && !answers.error && queue.length === 0 && (
        <Card><p className="text-sm t-muted">Nothing waiting. Every open answer has been marked.</p></Card>
      )}
      <div className="space-y-5">
        {queue.map((entry) => {
          const met = marks[entry.response_id] ?? entry.key_points.map(() => false);
          return (
            <Card key={entry.response_id}>
              <p className="text-xs t-subtle-fg">{entry.activity_title} · {entry.learner_name}</p>
              <p className="mt-2 text-sm font-medium leading-6 t-fg">{entry.question}</p>
              <blockquote className="mt-3 rounded-xl p-4 text-sm leading-6 t-fg" style={{ background: "var(--bg-subtle)" }}>
                {entry.answer}
              </blockquote>
              {entry.ai_note && <p className="mt-2 text-[11px] t-subtle-fg">AI note: {entry.ai_note}</p>}
              <fieldset className="mt-4 space-y-2">
                <legend className="mb-1 text-xs font-semibold t-fg">Key points met</legend>
                {entry.key_points.map((kp, i) => (
                  <label key={kp} className="flex items-start gap-2 text-sm t-muted">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-indigo-500"
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
                className={`mt-4 ${fieldClass}`}
                style={fieldStyle}
              />
              <button
                onClick={() => save(entry)}
                disabled={saving === entry.response_id}
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving === entry.response_id && <Loader2 className="h-4 w-4 animate-spin" />}
                Save mark ({met.filter(Boolean).length}/{entry.key_points.length})
              </button>
            </Card>
          );
        })}
      </div>
    </AppShell>
  );
}
