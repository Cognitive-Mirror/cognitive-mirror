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

import { AppShell, ErrorNote, PageIntro, describeError } from "@/components/AppShell";
import { RetrievalHealth } from "@/components/RetrievalHealth";
import { RubricCitation } from "@/components/RubricCitation";
import { RubricMatrix } from "@/components/admin/RubricMatrix";
import { ScoreBar } from "@/components/viz/charts";
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
        title="The standard every judgement is held to."
        text="The approved corpus is the only thing the AI may retrieve from. Anything not approved here is invisible to evidence review."
      />

      <div className="tabs mb-8" role="tablist">
        {([
          ["retrieval", "Knowledge & hybrid retrieval", Network],
          ["matrix", "Approved rubric & capability matrix", Table2],
        ] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            <Icon /> {label}
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
      <div className="grid gap-10 lg:grid-cols-[17rem_1fr]">
        <aside className="space-y-8">
          <RetrievalHealth status={status.data} />
          {result && (
            <section className="rule pt-6">
              <h2 className="title">How this query was routed</h2>
              <dl className="mt-3 grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-2 text-[13px]">
                <dt className="t-muted">Query class</dt><dd className="t-fg">{result.query_class} ({Math.round(result.route_confidence * 100)}%)</dd>
                <dt className="t-muted">Fusion weights</dt><dd className="t-fg">BM25 {result.weights.bm25.toFixed(2)} · vector {result.weights.dense.toFixed(2)}</dd>
                <dt className="t-muted">Candidates</dt><dd className="t-fg">{result.n_sparse} BM25 · {result.n_dense} vector</dd>
                <dt className="t-muted">Embedder</dt><dd className="t-fg">{result.embedder}</dd>
                <dt className="t-muted">Reranker</dt><dd className="t-fg">{result.reranked ? result.reranker : `${result.reranker} (not applied)`}</dd>
                <dt className="t-muted">Graph added</dt><dd className="t-fg">{result.graph_added.length || "none"}</dd>
                <dt className="t-muted">Latency</dt>
                <dd className="t-fg">{Object.entries(result.stage_ms).map(([k, v]) => `${k} ${v.toFixed(1)}ms`).join(" · ")}</dd>
              </dl>
            </section>
          )}
        </aside>

        <section className="min-w-0">
          <h2 className="display display-sm">Hybrid retrieval debugger</h2>
          <p className="meta mt-1">The path evidence review uses: BM25 and vector search fused, then graph expansion over the Spine&apos;s explicit edges.</p>
          <form onSubmit={(e) => { e.preventDefault(); void run(query); }} className="mt-5 flex gap-2">
            <label className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 t-subtle-fg" />
              <input
                aria-label="Search approved knowledge"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search the approved corpus"
                className="field h-11 pl-10"
              />
            </label>
            <button disabled={searching} className="btn btn-primary h-11">
              {searching ? "Searching…" : "Search"}
            </button>
          </form>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="meta">Try</span>
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => { setQuery(s); void run(s); }} className="btn btn-neutral btn-sm font-normal">
                {s}
              </button>
            ))}
          </div>

          {error && <div className="mt-4"><ErrorNote message={error} /></div>}

          {result && (
            <div className="mt-5 overflow-x-auto">
              <table className="table min-w-[560px]">
                <thead>
                  <tr>
                    <th className="w-10">Rank</th>
                    <th>Clause</th>
                    <th className="text-right">BM25</th>
                    <th className="text-right">Vector</th>
                    <th>Graph</th>
                    <th className="text-right">Fused</th>
                  </tr>
                </thead>
                <tbody>
                  {result.hits.map((h) => (
                    <tr key={h.slug}>
                      <td className="num t-muted">{h.fused_rank}</td>
                      <td>
                        <RubricCitation slug={h.slug} detail={{ slug: h.slug, score: h.fused_score, anchor: false, via_graph: h.via_graph, kind: h.kind, level: h.level }} />
                        <p className="meta mt-1">{h.kind.replace(/_/g, " ")}{h.level ? ` · ${h.level}` : ""}</p>
                      </td>
                      <td className="num whitespace-nowrap text-right">{h.bm25 ? <>{h.bm25.score.toFixed(2)} <span className="meta">#{h.bm25.rank}</span><ScoreBar value={h.bm25.score} max={Math.max(...result.hits.map((x) => x.bm25?.score ?? 0))} /></> : <span className="t-subtle-fg">—</span>}</td>
                      <td className="num whitespace-nowrap text-right">{h.dense ? <>{h.dense.score.toFixed(3)} <span className="meta">#{h.dense.rank}</span><ScoreBar value={h.dense.score} max={Math.max(...result.hits.map((x) => x.dense?.score ?? 0))} /></> : <span className="t-subtle-fg">—</span>}</td>
                      <td>{h.via_graph ? <span className="tag tag-primary">Added</span> : <span className="t-subtle-fg">—</span>}</td>
                      <td className="num whitespace-nowrap text-right font-medium">{h.fused_score.toFixed(3)}<ScoreBar value={h.fused_score} max={result.hits[0]?.fused_score ?? 1} strong /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
