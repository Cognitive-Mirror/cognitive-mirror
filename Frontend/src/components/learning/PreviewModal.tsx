"use client";

/**
 * "Day-2 module" previews for journey stages that are not live yet.
 *
 * Peer practice and AI roleplay open on a later date. Rather than a dead
 * locked card, the learner (and a client watching a demo) can see what the
 * stage will be. Both previews are labelled as previews:
 *
 *   peer   a scorecard whose criteria are the capability's APPROVED strong-
 *          evidence rubric clause, read from the knowledge API - the same
 *          standard the AI review and the manager use.
 *   ai     a scripted example exchange. It is illustrative content, not a
 *          model call, and says so.
 */

import { useEffect, useState } from "react";
import { Bot, Lock, Sparkles, UserRound, Users, X } from "lucide-react";

import { RubricCitation } from "@/components/RubricCitation";
import { type ActivitySummary, getKnowledgeItem, listKnowledge } from "@/services/api";

type Script = {
  scenario: string;
  persona: string;
  turns: { who: "ai" | "you"; text: string }[];
  coach: string;
};

const SCRIPTS: Record<string, Script> = {
  "Stakeholder influence": {
    scenario:
      "You are proposing to consolidate two vendor contracts. The AI plays Ravi, the regional ops lead whose team runs the vendor day to day. He has no formal say, and he is not convinced.",
    persona: "Ravi · Regional ops lead",
    turns: [
      { who: "ai", text: "Honestly, I don't see why we're touching this. My team knows this vendor. A switch mid-quarter is how incidents happen." },
      { who: "you", text: "That's fair, and it's why I wanted to talk before Thursday. What would a switch actually cost your team?" },
      { who: "ai", text: "Two weeks of double alerting, minimum. And if the cut-over lands on our peak week, I'm the one paged at 3am." },
      { who: "you", text: "What if your team picks the cut-over week, and I lend you two engineers to run parallel alerting for a fortnight?" },
      { who: "ai", text: "…If we pick the week, I could live with that. I'd want it in writing before the meeting." },
    ],
    coach:
      "You asked about his interest before arguing your position, and traded a concrete concession for a commitment. Next round: confirm what he will say in the meeting.",
  },
  "Strategic decision making": {
    scenario:
      "A board member wants to replace your in-house pipeline with a vendor platform. The AI plays the board member, impatient and well-briefed on a competitor's move.",
    persona: "Board member",
    turns: [
      { who: "ai", text: "Our competitor just bought this platform. Why are we still building our own?" },
      { who: "you", text: "Because the vendor can't meet our export-control constraints today. Switching now would stall two programmes." },
      { who: "ai", text: "So we just fall behind?" },
      { who: "you", text: "Here's what would change my mind: if they get ITAR certification, the cost case flips. I'd like a review in six months." },
    ],
    coach: "You named the trade-off and the condition that would reverse the decision. That is the competent marker in the rubric.",
  },
  "Data storytelling": {
    scenario:
      "You are briefing a sceptical CFO on a reliability finding they did not want to hear. The AI plays the CFO.",
    persona: "CFO",
    turns: [
      { who: "ai", text: "Before you start - I don't need the regression. What do you want me to decide?" },
      { who: "you", text: "Ground batch B for motor replacement this month; keep batch A flying." },
      { who: "ai", text: "And if you're wrong?" },
      { who: "you", text: "It holds unless summer temperatures pass 35 degrees, where our data is thin. I'd check that monthly." },
    ],
    coach: "Decision first, uncertainty as a condition. Next round: hold the number when the CFO challenges it.",
  },
};

function criteria(body: string): string[] {
  // The STRONG rubric numbers its criteria "1. ...", with continuation lines indented.
  const out: string[] = [];
  for (const line of body.split("\n")) {
    const m = line.match(/^\s*(\d+)\.\s+(.*)$/);
    if (m) out.push(m[2].trim());
    else if (out.length && /^\s{2,}\S/.test(line)) out[out.length - 1] += ` ${line.trim()}`;
    else if (out.length && !line.trim()) break;
  }
  return out.map((c) => c.split(". ")[0].replace(/\.$/, ""));
}

const SAMPLE_SCORES = [3, 4, 2, 3, 3];

export function PreviewModal({ activity, onClose }: { activity: ActivitySummary; onClose: () => void }) {
  const peer = activity.kind === "peer_activity";
  const [rubric, setRubric] = useState<{ slug: string; items: string[] } | null>(null);
  const script = SCRIPTS[activity.capability_name];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!peer) return;
    let live = true;
    listKnowledge(activity.capability_id)
      .then((docs) => docs.find((d) => d.kind === "evidence_rubric" && d.level === "strong"))
      .then((doc) => (doc ? getKnowledgeItem(doc.slug) : null))
      .then((item) => {
        if (live && item) setRubric({ slug: item.slug, items: criteria(item.body) });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [peer, activity.capability_id]);

  const opens = activity.available_from ? new Date(activity.available_from).toLocaleDateString() : "a later date";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${activity.title} preview`}
    >
      <div
        className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl p-6"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.14em]" style={{ background: "rgba(99,102,241,.14)", color: "var(--accent-fg)" }}>
              <Lock className="h-3 w-3" /> Day-2 module preview · opens {opens}
            </p>
            <h2 className="mt-2 text-xl font-semibold t-fg">{activity.title}</h2>
            <p className="mt-1 text-sm t-muted">{activity.summary}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: "var(--bg-subtle)" }}>
            <X className="h-4 w-4 t-muted" />
          </button>
        </div>

        {peer ? (
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                ["Practitioner", "Runs a real influence conversation from their own work."],
                ["Stakeholder", "Plays the other side, briefed on their interests."],
                ["Observer", "Scores against the approved rubric, with quotes."],
              ].map(([role, text]) => (
                <div key={role} className="rounded-xl p-3 text-xs" style={{ background: "var(--bg-subtle)" }}>
                  <p className="flex items-center gap-1.5 font-semibold t-fg"><Users className="h-3.5 w-3.5" /> {role}</p>
                  <p className="mt-1 leading-5 t-muted">{text}</p>
                </div>
              ))}
            </div>

            <div className="rounded-xl p-4" style={{ border: "1px solid var(--border)" }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold t-fg">Peer rubric scorecard</p>
                {rubric && <RubricCitation slug={rubric.slug} />}
              </div>
              <p className="mt-1 text-[11px] t-subtle-fg">
                Criteria are the approved strong-evidence clause for {activity.capability_name}. Scores
                below are an illustrative practice round.
              </p>
              {!rubric && <p className="mt-3 text-xs t-muted">Loading the approved rubric…</p>}
              <ul className="mt-3 space-y-2.5">
                {rubric?.items.map((c, i) => (
                  <li key={c} className="text-xs">
                    <div className="flex items-start justify-between gap-3">
                      <span className="t-fg">{i + 1}. {c}</span>
                      <span className="shrink-0 font-semibold t-fg">{SAMPLE_SCORES[i % SAMPLE_SCORES.length]}/4</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--bg-subtle)" }}>
                      <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-400" style={{ width: `${(SAMPLE_SCORES[i % SAMPLE_SCORES.length] / 4) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-[11px] leading-5 t-subtle-fg">
              Peer practice is a knowledge-and-rehearsal signal. Like every learning step, it never moves
              capability level: only workplace evidence validated by a manager does.
            </p>
          </div>
        ) : script ? (
          <div className="space-y-4">
            <div className="rounded-xl p-3 text-xs leading-5 t-muted" style={{ background: "var(--bg-subtle)" }}>
              <strong className="t-fg">Scenario.</strong> {script.scenario}
            </div>
            <div className="space-y-2.5">
              {script.turns.map((t, i) => (
                <div key={i} className={`flex gap-2 ${t.who === "you" ? "flex-row-reverse" : ""}`}>
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full" style={{ background: t.who === "ai" ? "rgba(99,102,241,.16)" : "rgba(16,185,129,.16)" }}>
                    {t.who === "ai" ? <Bot className="h-3.5 w-3.5 t-fg" /> : <UserRound className="h-3.5 w-3.5 t-fg" />}
                  </span>
                  <div className="max-w-[80%] rounded-2xl px-3.5 py-2 text-xs leading-5 t-fg" style={{ background: t.who === "ai" ? "var(--bg-subtle)" : "rgba(16,185,129,.10)" }}>
                    <p className="mb-0.5 text-[10px] font-semibold t-subtle-fg">{t.who === "ai" ? script.persona : "You"}</p>
                    {t.text}
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-xl p-3 text-xs leading-5" style={{ border: "1px solid rgba(99,102,241,.25)", background: "rgba(99,102,241,.06)" }}>
              <p className="flex items-center gap-1.5 font-semibold" style={{ color: "var(--accent-fg)" }}>
                <Sparkles className="h-3.5 w-3.5" /> Coach feedback
              </p>
              <p className="mt-1 t-fg">{script.coach}</p>
            </div>
            <p className="text-[11px] t-subtle-fg">
              Scripted example of the module. When it opens, the stakeholder is played live and the coach
              cites the approved rubric.
            </p>
          </div>
        ) : (
          <p className="text-sm t-muted">A preview for this capability is not available yet.</p>
        )}
      </div>
    </div>
  );
}
