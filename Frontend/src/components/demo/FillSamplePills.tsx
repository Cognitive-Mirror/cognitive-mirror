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
    <div
      className="flex flex-wrap items-center gap-2 px-3 py-2"
      style={{ border: "1px dashed var(--line-strong)" }}
      aria-label="Presenter samples"
    >
      <span className="meta mr-1 flex items-center gap-1.5">
        <Wand2 className="h-3.5 w-3.5" /> Demo sample
      </span>
      {available.includes("strong") && (
        <button type="button" disabled={disabled} onClick={() => onFill("strong")} className="btn btn-neutral btn-sm">
          <span className="h-2 w-2" style={{ background: "var(--does)" }} />
          Fill realistic sample (strong)
        </button>
      )}
      {available.includes("weak") && (
        <button type="button" disabled={disabled} onClick={() => onFill("weak")} className="btn btn-neutral btn-sm">
          <span className="h-2 w-2" style={{ background: "var(--pending)" }} />
          Fill realistic sample (weak / contradictory)
        </button>
      )}
    </div>
  );
}
