"use client";

/**
 * The two dimensions side by side: what the learner KNOWS, and what they have
 * shown at WORK. Kept as two separate readouts on purpose. Merging them into
 * one score would recreate exactly the illusion the platform exists to remove:
 * a high quiz mark that looks like capability.
 */

import { BookOpen, Briefcase } from "lucide-react";
import {
  type CapabilityState,
  formatLevel,
  KNOWING_DOING_LABEL,
  type KnowingDoing,
  percent as pct,
} from "@/services/api";

const KD_TONE: Record<KnowingDoing, string> = {
  insufficient_data: "t-muted",
  knows_not_applied: "text-amber-700 dark:text-amber-300",
  aligned: "text-emerald-700 dark:text-emerald-300",
  applied_without_knowledge: "text-rose-700 dark:text-rose-300",
  developing: "text-indigo-700 dark:text-indigo-300",
};

export function KnowsDoes({ state, compact = false }: { state: CapabilityState; compact?: boolean }) {
  const source = state.knowledge_source.replace(/_/g, " ");
  return (
    <div className={compact ? "" : "rounded-xl p-4"} style={compact ? {} : { background: "var(--bg-subtle)" }}>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide t-subtle-fg">
            <BookOpen className="h-3.5 w-3.5" /> Knows
          </p>
          <p className="mt-1 text-lg font-semibold t-fg">{pct(state.knowledge_mastery)}</p>
          <p className="text-[11px] t-subtle-fg">
            {state.knowledge_mastery === null ? "No checks taken yet" : `from ${source}`}
          </p>
        </div>
        <div>
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide t-subtle-fg">
            <Briefcase className="h-3.5 w-3.5" /> Shown at work
          </p>
          <p className="mt-1 text-lg font-semibold t-fg">{formatLevel(state.attained_level)}</p>
          <p className="text-[11px] t-subtle-fg">manager-validated level</p>
        </div>
      </div>

      {state.knowledge_pre !== null && state.knowledge_post !== null && (
        <p className="mt-3 text-[11px] t-muted">
          Assessment {pct(state.knowledge_pre)} → {pct(state.knowledge_post)}
          {state.knowledge_gain !== null && (
            <> · learning gain {Math.round(state.knowledge_gain * 100)}% of what was left to learn</>
          )}
        </p>
      )}

      <p className={`mt-3 text-xs font-medium ${KD_TONE[state.knowing_doing]}`}>
        {KNOWING_DOING_LABEL[state.knowing_doing]}
      </p>
    </div>
  );
}
