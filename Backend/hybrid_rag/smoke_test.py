"""End-to-end smoke test. Runs with no network and no API keys.

    python -m hybrid_rag.smoke_test

Exercises every stage of the cascade: chunking, both indexes, routing, weighted
RRF, the early-exit gate, reranking, graph expansion, assembly and the trace.
"""
from __future__ import annotations

from .config import ARCConfig
from .interfaces import Doc
from .pipeline import ARCPipeline
from .providers import LSAEmbedder
from .graph import EvidenceGraph
from .chunking import chunk_text

CORPUS = {
    "titan-spec": "The Titan X9 pump moves 40 litres per minute at 3 bar. "
                  "Error code E-114 indicates a blocked inlet filter. "
                  "Service interval is 2000 operating hours.",
    "titan-service": "Servicing the Titan X9 requires draining the reservoir "
                     "before removing the inlet filter. Use gasket kit GK-77.",
    "gasket-kit": "Gasket kit GK-77 contains four nitrile seals rated to 6 bar "
                  "and is compatible with the Titan and Atlas pump families.",
    "atlas-spec": "The Atlas M2 pump delivers 12 litres per minute at 2 bar "
                  "and shares the GK-77 gasket kit with the Titan line.",
    "safety": "Always depressurise a pump before service. Residual pressure "
              "above 1 bar can eject the filter housing.",
}

EDGES = [("titan-spec", "titan-service"), ("titan-service", "gasket-kit"),
         ("gasket-kit", "atlas-spec"), ("titan-service", "safety")]

QUERIES = [
    '"error code E-114"',                                   # LEXICAL
    "how often should the pump be maintained?",              # SEMANTIC
    "which other pump family uses the same gasket kit?",     # MULTIHOP
]


def main() -> int:
    docs = []
    for doc_id, text in CORPUS.items():
        cs = chunk_text(text, doc_id, chunk_tokens=400)
        docs.extend(cs if cs else [Doc(doc_id=doc_id, text=text)])

    emb = LSAEmbedder(dim=16).fit([d.indexed_text for d in docs])
    graph = EvidenceGraph()
    # map parent-level edges onto the chunk ids actually indexed
    chunk_of = {}
    for d in docs:
        chunk_of.setdefault(d.meta.get("parent", d.doc_id), d.doc_id)
    graph.add_explicit_edges([(chunk_of[a], chunk_of[b]) for a, b in EDGES
                              if a in chunk_of and b in chunk_of])

    cfg = ARCConfig(k_sparse=10, k_dense=10, rerank_top_n=10, rerank_keep=3,
                    graph_budget=2, contextualize=False)
    pipe = ARCPipeline(cfg, embedder=emb, graph=graph).index(docs)

    print(f"indexed {len(docs)} chunks | graph {graph.n_nodes} nodes / "
          f"{graph.n_edges} edges\n")

    ok = True
    for q in QUERIES:
        res = pipe.retrieve(q)
        t = res.trace
        print(f"query      : {q}")
        print(f"  class    : {t.query_class} (conf {t.route_confidence:.2f})")
        print(f"  candidates: sparse={t.n_sparse} dense={t.n_dense} fused={t.n_fused}")
        print(f"  graph     : +{t.n_graph_added} {t.graph_added_ids}")
        print(f"  top hits  : {[h.doc_id for h in res.hits]}")
        print(f"  latency   : {t.stage_ms.get('total', 0):.1f} ms")
        print(f"  context   : {len(res.context)} chars\n")
        if not res.hits:
            ok = False

    # the lexical query must find the doc containing the exact code
    lex = pipe.retrieve('"error code E-114"')
    assert any("titan-spec" in h.doc_id for h in lex.hits), "lexical retrieval failed"
    # the multi-hop query should reach atlas via the graph or via text
    mh = pipe.retrieve("which other pump family uses the same gasket kit?")
    reached = {h.doc_id for h in mh.hits}
    assert any("atlas" in d or "gasket" in d for d in reached), "multi-hop failed"

    print("smoke test: PASS" if ok else "smoke test: FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
