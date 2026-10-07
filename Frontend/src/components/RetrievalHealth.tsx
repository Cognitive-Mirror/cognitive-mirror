"use client";

/** Retrieval health, surfaced in the product rather than buried in a server log. */

import type { IndexStatus } from "@/services/api";

export function RetrievalHealth({ status }: { status: IndexStatus | null }) {
  if (!status) return null;

  const healthy = status.available && !status.degraded;
  return (
    <div
      className="rounded-xl p-3 text-[11px] leading-5"
      style={{
        border: `1px solid ${healthy ? "rgba(16,185,129,0.2)" : "rgba(245,158,11,0.25)"}`,
        background: healthy ? "rgba(16,185,129,0.06)" : "rgba(245,158,11,0.06)",
      }}
    >
      <p className="font-medium t-fg">
        Knowledge index: {status.doc_count} approved clauses · {status.edge_count} structural edges
      </p>
      <p className="mt-1 t-muted">
        embedder {status.embedder} · reranker {status.reranker} · fusion weights{" "}
        {status.weights_calibrated ? "calibrated" : "inherited defaults"}
      </p>
      {status.notes.map((n) => (
        <p key={n} className="mt-1.5 t-muted">
          · {n}
        </p>
      ))}
    </div>
  );
}
