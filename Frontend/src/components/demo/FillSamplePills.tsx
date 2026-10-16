"use client";

/**
 * Presenter accelerators: fill a field with a canonical, realistic sample.
 *
 * Shown only in demo mode (the samples endpoint 404s otherwise). The texts are
 * served by the backend, which also holds their verified evaluations, so the
 * pill and the cache can never drift apart.
 */

import { useEffect, useState } from "react";
import { Wand2 } from "lucide-react";

import { activePersona, loadSamples, type Samples } from "@/services/demo";

/**
 * Presenter samples, only while acting as a demo persona. A real signed-in
 * user never sees them: the verified cache serves the demo tenant alone, so a
 * sample submitted anywhere else would get no cached evaluation.
 */
export function useDemoSamples(): Samples | null {
  const [samples, setSamples] = useState<Samples | null>(null);
  useEffect(() => {
    let live = true;
    if (!activePersona()) return;
    void loadSamples().then((s) => {
      if (live) setSamples(s);
    });
    return () => {
      live = false;
    };
  }, []);
  return samples;
}

export function FillSamplePills({
  available,
  onFill,
  disabled = false,
}: {
  available: ("strong" | "weak")[];
  onFill: (strength: "strong" | "weak") => void;
  disabled?: boolean;
}) {
  if (available.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Presenter samples">
      <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[.14em] t-subtle-fg">
        <Wand2 className="h-3 w-3" /> Demo
      </span>
      {available.includes("strong") && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onFill("strong")}
          className="rounded-full px-2.5 py-1 text-[11px] font-medium text-emerald-700 transition hover:opacity-80 disabled:opacity-50 dark:text-emerald-300"
          style={{ background: "rgba(16,185,129,.10)", border: "1px solid rgba(16,185,129,.25)" }}
        >
          Fill realistic sample (strong)
        </button>
      )}
      {available.includes("weak") && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onFill("weak")}
          className="rounded-full px-2.5 py-1 text-[11px] font-medium text-amber-700 transition hover:opacity-80 disabled:opacity-50 dark:text-amber-300"
          style={{ background: "rgba(245,158,11,.10)", border: "1px solid rgba(245,158,11,.25)" }}
        >
          Fill realistic sample (weak / contradictory)
        </button>
      )}
    </div>
  );
}
