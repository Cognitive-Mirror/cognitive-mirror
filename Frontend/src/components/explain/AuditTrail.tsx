"use client";

/**
 * The append-only history behind one person's state on one capability.
 *
 * Every row is a stored CapabilityStateEvent (Update Rule 6: never edited,
 * never deleted), enriched with the evidence, AI review or manager decision
 * that caused it. The moment confidence crosses the 0.40 ceiling is called
 * out, because only a manager validation can cause it - that is the
 * governance promise, visible.
 */

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BookOpen,
  Briefcase,
  Clock,
  History,
  Loader2,
  LockOpen,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { getAuditTrail, type AuditEvent, type AuditTrail as Trail } from "@/services/api";

const KIND: Record<AuditEvent["kind"], { icon: LucideIcon; tint: string }> = {
  evidence_submitted: { icon: Briefcase, tint: "rgba(99,102,241,.16)" },
  manager_validation: { icon: ShieldCheck, tint: "rgba(16,185,129,.16)" },
  assessment: { icon: BookOpen, tint: "rgba(59,130,246,.14)" },
  decay: { icon: Clock, tint: "rgba(100,116,139,.16)" },
  other: { icon: History, tint: "rgba(100,116,139,.16)" },
};

const fmt = (n: number) => n.toFixed(2);

export function AuditTrailButton({
  capabilityId,
  learnerId,
  label = "Audit trail",
}: {
  capabilityId: string;
  learnerId?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition hover:opacity-80"
        style={{ background: "var(--bg-subtle)", color: "var(--accent-fg)" }}
      >
        <History className="h-3 w-3" /> {label}
      </button>
      <AnimatePresence>
        {open && (
          <AuditDrawer capabilityId={capabilityId} learnerId={learnerId} onClose={close} />
        )}
      </AnimatePresence>
    </>
  );
}

function AuditDrawer({
  capabilityId,
  learnerId,
  onClose,
}: {
  capabilityId: string;
  learnerId?: string;
  onClose: () => void;
}) {
  const [trail, setTrail] = useState<Trail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAuditTrail(capabilityId, learnerId)
      .then(setTrail)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load the history."));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [capabilityId, learnerId, onClose]);

  const events = trail ? [...trail.events].reverse() : [];

  return (
    <motion.div
      className="fixed inset-0 z-50 flex justify-end"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ background: "rgba(0,0,0,.45)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Audit trail"
    >
      <motion.aside
        initial={{ x: 40 }}
        animate={{ x: 0 }}
        exit={{ x: 40 }}
        transition={{ type: "spring", stiffness: 380, damping: 34 }}
        className="h-full w-full max-w-lg overflow-y-auto p-6"
        style={{ background: "var(--bg-card)", borderLeft: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.16em] t-subtle-fg">Immutable audit trail</p>
            <h2 className="mt-1 text-lg font-semibold t-fg">
              {trail ? `${trail.subject_name} · ${trail.capability_name}` : "Loading…"}
            </h2>
            <p className="mt-1 text-[11px] leading-4 t-muted">
              Append-only. Each row is a stored state transition with its cause. Confidence cannot
              pass {trail ? fmt(trail.unvalidated_ceiling) : "0.40"} without a manager validation.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
            style={{ background: "var(--bg-subtle)" }}
          >
            <X className="h-4 w-4 t-muted" />
          </button>
        </div>

        {error && <p className="text-sm text-rose-500">{error}</p>}
        {!trail && !error && (
          <p className="flex items-center gap-2 text-sm t-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading history…
          </p>
        )}
        {trail && events.length === 0 && <p className="text-sm t-muted">No state changes recorded yet.</p>}

        <ol className="relative space-y-4 pl-6" style={{ borderLeft: "1px dashed var(--border-md)" }}>
          {events.map((e) => {
            const meta = KIND[e.kind] ?? KIND.other;
            const Icon = meta.icon;
            return (
              <li key={e.id} className="relative">
                <span
                  className="absolute -left-[37px] top-1 grid h-6 w-6 place-items-center rounded-full"
                  style={{ background: meta.tint, border: "1px solid var(--border)" }}
                >
                  <Icon className="h-3 w-3 t-fg" />
                </span>
                <div
                  className="rounded-xl p-3"
                  style={{
                    border: e.confidence_unlocked ? "1px solid rgba(16,185,129,.5)" : "1px solid var(--border)",
                    background: e.confidence_unlocked ? "rgba(16,185,129,.07)" : "var(--bg-subtle)",
                  }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold t-fg">{e.label}</p>
                    <time className="text-[10px] t-subtle-fg">{new Date(e.occurred_at).toLocaleString()}</time>
                  </div>
                  {e.confidence_unlocked && (
                    <p className="mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300" style={{ background: "rgba(16,185,129,.15)" }}>
                      <LockOpen className="h-3 w-3" /> Confidence unlocked above 0.40
                    </p>
                  )}
                  {e.evidence && <p className="mt-1.5 text-xs t-fg">&ldquo;{e.evidence.title}&rdquo;</p>}
                  {e.review && (
                    <p className="mt-1 flex flex-wrap items-center gap-1 text-[11px] t-muted">
                      <Sparkles className="h-3 w-3" />
                      AI rubric review: <strong className="t-fg capitalize">{e.review.strength}</strong>
                      {" · "}
                      {e.review.citations.length} clause{e.review.citations.length === 1 ? "" : "s"} cited
                      {" · "}
                      {e.review.verified_quotes} verified quote{e.review.verified_quotes === 1 ? "" : "s"}
                      {e.review.provenance === "verified_cache" && " · verified cache"}
                      {e.review.provenance === "fallback" && " · AI offline"}
                    </p>
                  )}
                  {e.validation && (
                    <p className="mt-1 text-[11px] t-muted">
                      {e.validation.manager_name}: <strong className="t-fg capitalize">{e.validation.decision.replace(/_/g, " ")}</strong>
                      {e.validation.decision === "approved" && ` as ${e.validation.strength}`}
                      {e.validation.overrode_ai && " · overrode AI strength"}
                      {e.validation.feedback && <span className="mt-0.5 block italic">&ldquo;{e.validation.feedback}&rdquo;</span>}
                    </p>
                  )}
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                    <span className="t-subtle-fg">
                      Level{" "}
                      <strong className={e.level_changed ? "text-indigo-500" : "t-fg"}>
                        {e.previous_level} → {e.new_level}
                      </strong>
                    </span>
                    <span className="t-subtle-fg">
                      Confidence{" "}
                      <strong className={e.confidence_unlocked ? "text-emerald-500" : "t-fg"}>
                        {fmt(e.previous_confidence)} → {fmt(e.new_confidence)}
                      </strong>
                    </span>
                  </div>
                  <p className="mt-1.5 text-[10px] leading-4 t-subtle-fg">
                    {e.actor_name} · scoring model {e.scoring_model_version} · {e.reason}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </motion.aside>
    </motion.div>
  );
}
