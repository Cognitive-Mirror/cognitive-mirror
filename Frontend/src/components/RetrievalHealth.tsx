"use client";

/** Retrieval health, surfaced in the product rather than buried in a server log. */

import { CircleAlert, CircleCheck } from "lucide-react";

import type { IndexStatus } from "@/services/api";

export function RetrievalHealth({ status }: { status: IndexStatus | null }) {
  if (!status) return null;

  const healthy = status.available && !status.degraded;
  return (
    <section className="text-sm" aria-label="Knowledge index">
      <p className={`flex items-center gap-2 font-medium ${healthy ? "ink-does" : "ink-pending"}`}>
        {healthy ? <CircleCheck className="h-4 w-4" /> : <CircleAlert className="h-4 w-4" />}
        Knowledge index {healthy ? "healthy" : "degraded"}
      </p>
      <p className="mt-1.5 t-fg">
        <span className="num">{status.doc_count}</span> approved clauses ·{" "}
        <span className="num">{status.edge_count}</span> structural edges
      </p>
      <p className="meta mt-1">
        Embedder {status.embedder} · reranker {status.reranker} · fusion weights{" "}
        {status.weights_calibrated ? "calibrated" : "inherited defaults"}
      </p>
      {status.notes.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-l pl-3 text-xs leading-5 t-muted" style={{ borderColor: "var(--line-strong)" }}>
          {status.notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      )}
    </section>
  );
}
