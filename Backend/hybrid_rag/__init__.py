"""hybrid_rag -- reference implementation of the ARC pipeline.

ARC = Adaptive Routed Cascade: routed hybrid retrieval with weighted rank
fusion, a cost-saving early-exit gate, reranking, and graph expansion applied
as evidence enrichment rather than as the primary retrieval substrate.

Quick start
-----------
    from hybrid_rag import ARCConfig, ARCPipeline, Doc
    from hybrid_rag.providers import LSAEmbedder, HostLLMReranker

    emb = LSAEmbedder(dim=256).fit([d.text for d in docs])
    pipe = ARCPipeline(ARCConfig(), embedder=emb).index(docs)
    pipe.graph.build_cooccurrence_edges(docs)
    res = pipe.retrieve("your question")
    print([h.doc_id for h in res.hits], res.trace.query_class)
"""
from .config import ARCConfig, CLASS_WEIGHTS, GRAPH_CLASSES
from .interfaces import Doc, Hit
from .pipeline import ARCPipeline, ARCResult, Trace
from .router import HeuristicRouter, LLMRouter, Route
from .graph import EvidenceGraph
from .sparse import BM25Index
from .dense import DenseIndex
from .chunking import chunk_text
from . import fusion, evaluation, providers

__version__ = "0.1.0"
__all__ = [
    "ARCConfig", "CLASS_WEIGHTS", "GRAPH_CLASSES", "Doc", "Hit",
    "ARCPipeline", "ARCResult", "Trace", "HeuristicRouter", "LLMRouter",
    "Route", "EvidenceGraph", "BM25Index", "DenseIndex", "chunk_text",
    "fusion", "evaluation", "providers",
]
