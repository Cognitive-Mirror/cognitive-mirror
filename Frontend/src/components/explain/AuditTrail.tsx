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
import { BookOpen, Briefcase, Clock, History, Loader2, LockOpen, ShieldCheck, Sparkles, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { LEVEL_LABEL } from "@/components/explain/Mirror";
import { ConfidenceTrack } from "@/components/viz/charts";
import { getAuditTrail, type AuditEvent, type AuditTrail as Trail } from "@/services/api";

const KIND: Record<AuditEvent["kind"], { icon: LucideIcon; color: string }> = {
  evidence_submitted: { icon: Briefcase, color: "var(--pending)" },
  manager_validation: { icon: ShieldCheck, color: "var(--does)" },
  assessment: { icon: BookOpen, color: "var(--knows)" },
  decay: { icon: Clock, color: "var(--ink-3)" },
  other: { icon: History, color: "var(--ink-3)" },
};

const fmt = (n: number) => n.toFixed(2);
const EASE = [0.16, 1, 0.3, 1] as const;

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
      <button type="button" onClick={() => setOpen(true)} className="btn btn-text btn-sm -ml-1">
        <History /> {label}
      </button>
      <AnimatePresence>
        {open && <AuditDrawer capabilityId={capabilityId} learnerId={learnerId} onClose={close} />}
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
      transition={{ duration: 0.18 }}
      style={{ background: "var(--scrim)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Audit trail"
    >
      <motion.aside
        initial={{ x: 48 }}
        animate={{ x: 0 }}
        exit={{ x: 48 }}
        transition={{ duration: 0.35, ease: EASE }}
        className="h-full w-full max-w-[34rem] overflow-y-auto"
        style={{ background: "var(--bg)", boxShadow: "var(--shadow-2)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 px-7 py-6 rule-b" style={{ background: "var(--bg)" }}>
          <div>
            <h2 className="display display-sm">{trail ? trail.capability_name : "Audit trail"}</h2>
            <p className="meta mt-1">
              {trail ? `${trail.subject_name} · ` : ""}append-only history. Confidence cannot pass{" "}
              {trail ? fmt(trail.unvalidated_ceiling) : "0.40"} without a manager validation.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="btn btn-icon shrink-0">
            <X />
          </button>
        </header>

        <div className="px-7 py-6">
          {error && <p className="note note-error">{error}</p>}
          {!trail && !error && (
            <p className="flex items-center gap-2 text-sm t-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading history…
            </p>
          )}
          {trail && events.length === 0 && <p className="text-sm t-muted">No state changes recorded yet.</p>}

          <ol className="relative">
            <span aria-hidden className="absolute bottom-3 left-[0.6875rem] top-3 w-px" style={{ background: "var(--line-strong)" }} />
            {events.map((e) => {
              const meta = KIND[e.kind] ?? KIND.other;
              const Icon = meta.icon;
              return (
                <li key={e.id} className="relative grid grid-cols-[1.5rem_1fr] gap-4 pb-7">
                  <span
                    className="relative z-10 mt-0.5 grid h-6 w-6 place-items-center"
                    style={{ background: "var(--bg)", border: `2px solid ${meta.color}` }}
                  >
                    <Icon className="h-3 w-3" style={{ color: meta.color }} />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <p className="text-sm font-medium t-fg">{e.label}</p>
                      <time className="meta num">{new Date(e.occurred_at).toLocaleString()}</time>
                    </div>

                    {e.confidence_unlocked && (
                      <p className="tag tag-does mt-2">
                        <LockOpen /> Confidence unlocked above 0.40
                      </p>
                    )}
                    {e.evidence && <p className="display mt-2 text-[0.9375rem] leading-snug">&ldquo;{e.evidence.title}&rdquo;</p>}
                    {e.review && (
                      <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[13px] t-muted">
                        <Sparkles className="h-3.5 w-3.5 ink-primary" />
                        AI rubric review: <span className="font-medium capitalize t-fg">{e.review.strength}</span>
                        · {e.review.citations.length} clause{e.review.citations.length === 1 ? "" : "s"}
                        · {e.review.verified_quotes} verified quote{e.review.verified_quotes === 1 ? "" : "s"}
                        {e.review.provenance === "verified_cache" && " · verified cache"}
                        {e.review.provenance === "fallback" && " · AI offline"}
                      </p>
                    )}
                    {e.validation && (
                      <p className="mt-1.5 text-[13px] t-muted">
                        {e.validation.manager_name}:{" "}
                        <span className="font-medium capitalize t-fg">{e.validation.decision.replace(/_/g, " ")}</span>
                        {e.validation.decision === "approved" && ` as ${e.validation.strength}`}
                        {e.validation.overrode_ai && " · overrode the AI's strength"}
                        {e.validation.feedback && <span className="mt-1 block italic">&ldquo;{e.validation.feedback}&rdquo;</span>}
                      </p>
                    )}

                    <dl className="mt-3 grid grid-cols-2 gap-3 px-3 py-2.5 text-[13px]" style={{ background: "var(--surface)" }}>
                      <div>
                        <dt className="meta">Level</dt>
                        <dd className={e.level_changed ? "font-medium ink-does" : "t-fg"}>
                          {LEVEL_LABEL[e.previous_level]} → {LEVEL_LABEL[e.new_level]}
                        </dd>
                      </div>
                      <div>
                        <dt className="meta">Confidence</dt>
                        <dd className={`num ${e.confidence_unlocked ? "font-medium ink-does" : "t-fg"}`}>
                          {fmt(e.previous_confidence)} → {fmt(e.new_confidence)}
                        </dd>
                        <dd className="mt-1">
                          <ConfidenceTrack from={e.previous_confidence} to={e.new_confidence} ceiling={trail?.unvalidated_ceiling ?? 0.4} />
                        </dd>
                      </div>
                    </dl>
                    <p className="meta mt-2 leading-4">
                      {e.actor_name} · scoring model {e.scoring_model_version} · {e.reason}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </motion.aside>
    </motion.div>
  );
}
