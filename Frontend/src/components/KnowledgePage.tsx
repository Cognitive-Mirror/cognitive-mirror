"use client";

/**
 * Admin: the approved knowledge corpus and the health of retrieval over it.
 * This corpus is the only thing evidence review may ground in.
 */

import { useState } from "react";
import { Search } from "lucide-react";

import { AppShell, Card, ErrorNote, PageIntro, describeError } from "@/components/AppShell";
import { RetrievalHealth } from "@/components/RetrievalHealth";
import { RubricCitation } from "@/components/RubricCitation";
import { useResource } from "@/lib/useResource";
import { getIndexStatus, type SearchHit, searchKnowledge } from "@/services/api";

export function KnowledgePage() {
  const status = useResource(getIndexStatus);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runSearch(event: React.FormEvent) {
    event.preventDefault();
    if (query.trim().length < 2) return;
    setSearching(true);
    setError(null);
    try {
      setHits(await searchKnowledge(query));
    } catch (err) {
      setError(describeError(err, "Search failed."));
    } finally {
      setSearching(false);
    }
  }

  return (
    <AppShell role="admin" active="/admin">
      <PageIntro
        eyebrow="Admin / Knowledge"
        title="Approved knowledge and retrieval health."
        text="This is the only corpus the AI may retrieve from. Anything not approved here is invisible to evidence review."
      />
      {status.error && <ErrorNote message={status.error} onRetry={status.reload} />}

      <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <RetrievalHealth status={status.data} />

        <Card>
          <h2 className="font-semibold t-fg">Search approved knowledge</h2>
          <p className="mt-1 text-xs t-subtle-fg">The same retrieval path evidence review uses.</p>
          <form onSubmit={runSearch} className="mt-4 flex gap-2">
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
            <button
              disabled={searching}
              className="rounded-xl bg-indigo-500 px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              {searching ? "…" : "Search"}
            </button>
          </form>

          {error && <div className="mt-4"><ErrorNote message={error} /></div>}

          <div className="mt-5 space-y-3">
            {hits.map((h) => (
              <div key={h.slug} className="rounded-xl p-3" style={{ background: "var(--bg-subtle)" }}>
                <div className="flex flex-wrap items-center gap-2">
                  <RubricCitation slug={h.slug} />
                  <span className="text-[11px] t-subtle-fg">
                    {h.kind.replace(/_/g, " ")}
                    {h.level ? ` · ${h.level}` : ""}
                    {h.via_graph ? " · via graph" : ""}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 t-muted">{h.excerpt.slice(0, 220)}…</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
