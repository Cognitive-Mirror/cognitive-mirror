"use client";

/**
 * Admin command centre.
 *
 *   Knowledge & retrieval   the approved corpus, index health, and the hybrid
 *                           retrieval path opened arm by arm (BM25, vector,
 *                           graph) - the same path evidence review grounds in.
 *   Rubric & capability     the approved rubric by capability, the D6
 *   matrix                  required-level layers, and coverage distribution.
 */

import { useState } from "react";
import { Network, Search, Table2 } from "lucide-react";

import { AppShell, Card, ErrorNote, PageIntro, describeError } from "@/components/AppShell";
import { RetrievalHealth } from "@/components/RetrievalHealth";
import { RubricCitation } from "@/components/RubricCitation";
import { RubricMatrix } from "@/components/admin/RubricMatrix";
import { useResource } from "@/lib/useResource";
import { debugSearch, type DebugSearch, getIndexStatus } from "@/services/api";

type Tab = "retrieval" | "matrix";

const SUGGESTIONS = [
  "what counts as weak evidence",
  "influence without escalation",
  "stating uncertainty as a condition",
];

export function KnowledgePage() {
  const [tab, setTab] = useState<Tab>("retrieval");

  return (
    <AppShell role="admin" active="/admin">
      <PageIntro
        eyebrow="Admin / Governance"
        title="Approved knowledge, retrieval and the capability matrix."
        text="This is the only corpus the AI may retrieve from, and the standard every review and validation is held to. Anything not approved here is invisible to evidence review."
      />

      <div className="mb-5 inline-flex rounded-xl p-1" role="tablist" style={{ background: "var(--bg-subtle)" }}>
        {([
          ["retrieval", "Knowledge & hybrid retrieval", Network],
          ["matrix", "Approved rubric & capability matrix", Table2],
        ] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition"
            style={tab === id ? { background: "var(--bg-card)", color: "var(--fg)", boxShadow: "0 1px 3px rgba(0,0,0,.15)" } : { color: "var(--fg-muted)" }}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {tab === "retrieval" ? <RetrievalDebugger /> : <RubricMatrix />}
    </AppShell>
  );
}

function RetrievalDebugger() {
  const status = useResource(getIndexStatus);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<DebugSearch | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(text: string) {
    if (text.trim().length < 2) return;
    setSearching(true);
    setError(null);
    try {
      setResult(await debugSearch(text));
    } catch (err) {
      setError(describeError(err, "Search failed."));
    } finally {
      setSearching(false);
    }
  }

  return (
    <>
      {status.error && <ErrorNote message={status.error} onRetry={status.reload} />}
      <div className="grid gap-5 lg:grid-cols-[1fr_1.6fr]">
        <div className="space-y-4">
          <RetrievalHealth status={status.data} />
          {result && (
            <Card className="!p-4">
              <p className="text-xs font-semibold t-fg">How this query was routed</p>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                <dt className="t-subtle-fg">Query class</dt><dd className="t-fg">{result.query_class} ({Math.round(result.route_confidence * 100)}%)</dd>
                <dt className="t-subtle-fg">Fusion weights</dt><dd className="t-fg">BM25 {result.weights.bm25.toFixed(2)} · vector {result.weights.dense.toFixed(2)}</dd>
                <dt className="t-subtle-fg">Candidates</dt><dd className="t-fg">{result.n_sparse} BM25 · {result.n_dense} vector</dd>
                <dt className="t-subtle-fg">Embedder</dt><dd className="t-fg">{result.embedder}</dd>
                <dt className="t-subtle-fg">Reranker</dt><dd className="t-fg">{result.reranked ? result.reranker : `${result.reranker} (not applied)`}</dd>
                <dt className="t-subtle-fg">Graph added</dt><dd className="t-fg">{result.graph_added.length || "none"}</dd>
                <dt className="t-subtle-fg">Latency</dt>
                <dd className="t-fg">{Object.entries(result.stage_ms).map(([k, v]) => `${k} ${v.toFixed(1)}ms`).join(" · ")}</dd>
              </dl>
            </Card>
          )}
        </div>

        <Card>
          <h2 className="font-semibold t-fg">Hybrid retrieval debugger</h2>
          <p className="mt-1 text-xs t-subtle-fg">The path evidence review uses: BM25 and vector search fused, then graph expansion over the Spine&apos;s explicit edges.</p>
          <form onSubmit={(e) => { e.preventDefault(); void run(query); }} className="mt-4 flex gap-2">
            <label className="flex flex-1 items-center gap-2 rounded-xl px-3 py-2" style={{ background: "var(--bg-subtle)" }}>
              <Search className="h-4 w-4 t-subtle-fg" />
              <input
                aria-label="Search approved knowledge"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. what counts as weak evidence"
                className="w-full bg-transparent text-sm outline-none t-fg"
              />
            </label>
            <button disabled={searching} className="rounded-xl bg-indigo-500 px-4 text-sm font-semibold text-white disabled:opacity-50">
              {searching ? "…" : "Search"}
            </button>
          </form>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => { setQuery(s); void run(s); }} className="rounded-full px-2.5 py-1 text-[11px] t-muted" style={{ background: "var(--bg-subtle)" }}>
                {s}
              </button>
            ))}
          </div>

          {error && <div className="mt-4"><ErrorNote message={error} /></div>}

          {result && (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-xs">
                <thead>
                  <tr className="t-subtle-fg">
                    <th className="pb-2 font-medium">#</th>
                    <th className="pb-2 font-medium">Clause</th>
                    <th className="pb-2 font-medium">BM25</th>
                    <th className="pb-2 font-medium">Vector</th>
                    <th className="pb-2 font-medium">Graph</th>
                    <th className="pb-2 text-right font-medium">Fused</th>
                  </tr>
                </thead>
                <tbody>
                  {result.hits.map((h) => (
                    <tr key={h.slug} className="align-top" style={{ borderTop: "1px solid var(--border)" }}>
                      <td className="py-2.5 pr-2 t-muted">{h.fused_rank}</td>
                      <td className="py-2.5 pr-3">
                        <RubricCitation slug={h.slug} detail={{ slug: h.slug, score: h.fused_score, anchor: false, via_graph: h.via_graph, kind: h.kind, level: h.level }} />
                        <p className="mt-1 text-[11px] t-subtle-fg">{h.kind.replace(/_/g, " ")}{h.level ? ` · ${h.level}` : ""}</p>
                      </td>
                      <td className="py-2.5 pr-3 t-fg">{h.bm25 ? `#${h.bm25.rank} · ${h.bm25.score.toFixed(2)}` : <span className="t-subtle-fg">—</span>}</td>
                      <td className="py-2.5 pr-3 t-fg">{h.dense ? `#${h.dense.rank} · ${h.dense.score.toFixed(3)}` : <span className="t-subtle-fg">—</span>}</td>
                      <td className="py-2.5 pr-3">{h.via_graph ? <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-violet-600 dark:text-violet-300" style={{ background: "rgba(139,92,246,.14)" }}>added</span> : <span className="t-subtle-fg">—</span>}</td>
                      <td className="py-2.5 text-right font-semibold t-fg">{h.fused_score.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
