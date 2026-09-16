"""Query classification -- the routing gate.

This is the component that makes the pipeline adaptive rather than one fixed
strategy applied to every query. The evidence for it: graph retrieval delivers
large gains on relational and corpus-level questions and none on lookup
questions, while costing seconds per query against HNSW's milliseconds. A
global graph-first architecture therefore pays multi-hop cost on every single
query to benefit a minority of them. Classification moves that cost to where
the benefit is.

Two implementations:

* `HeuristicRouter` -- zero-latency, zero-cost, no API dependency. Surprisingly
  hard to beat for LEXICAL detection, which is mostly a surface-form question.
* `LLMRouter` -- one cheap small-model call, better on MULTIHOP vs SEMANTIC,
  which genuinely needs semantics. Falls back to the heuristic on any failure,
  because a router that can fail closed is a router that takes the whole
  pipeline down.

Misclassification is the main failure mode, so the design keeps it cheap: a
wrong class changes fusion weights and whether the graph is consulted, but never
removes a retriever entirely. Both retrievers always run.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional, Callable, Dict, Any

from .config import QueryClass

# Surface markers for exact-match intent.
_QUOTED = re.compile(r'"[^"]{2,}"|\'[^\']{2,}\'')
_IDENTIFIER = re.compile(
    r"\b(?:[A-Z]{2,}[-_]?\d+|\d+\.\d+\.\d+|0x[0-9a-fA-F]+|"
    r"[A-Za-z]+\d{3,}|[A-Z]{3,}|v\d+(?:\.\d+)*)\b")
_CODEISH = re.compile(r"[_/\\]|\(\)|::|-->|\.py\b|\.json\b|\.yaml\b")

_RELATIONAL = re.compile(
    r"\b(?:compare|versus|vs\.?|difference between|relationship|related to|"
    r"connect|link|between|both|and also|who else|which other|downstream|"
    r"upstream|cause[ds]?|lead(?:s|ing)? to|depend(?:s|ent)? on|derived from|"
    r"influenced|based on|cites?|cited by)\b", re.I)

_GLOBAL = re.compile(
    r"\b(?:overall|in general|across (?:the|all)|summar(?:y|ise|ize)|"
    r"themes?|trends?|landscape|overview|main (?:topics|ideas|points)|"
    r"how many|count|most common|typical|generally|what kinds?|categor)\b", re.I)

_MULTI_ENTITY = re.compile(r"\b[A-Z][a-z]{2,}\b")


@dataclass
class Route:
    query_class: QueryClass
    confidence: float
    features: Dict[str, Any]
    use_graph: bool


class HeuristicRouter:
    """Order matters: exact-match markers dominate, then corpus-level markers,
    then relational markers, with semantic as the default. Defaulting to
    SEMANTIC is deliberate -- it is the safest class, because its weights keep
    both retrievers active and skip graph cost."""

    def classify(self, query: str) -> Route:
        f = {
            "quoted": bool(_QUOTED.search(query)),
            "identifier": bool(_IDENTIFIER.search(query)),
            "codeish": bool(_CODEISH.search(query)),
            "relational": bool(_RELATIONAL.search(query)),
            "global": bool(_GLOBAL.search(query)),
            "n_caps": len(set(_MULTI_ENTITY.findall(query))),
            "n_tokens": len(query.split()),
        }
        if f["quoted"] or f["identifier"] or f["codeish"]:
            cls, conf = "LEXICAL", 0.9 if f["quoted"] else 0.7
        elif f["global"]:
            cls, conf = "GLOBAL", 0.75
        elif f["relational"] or f["n_caps"] >= 2:
            cls, conf = "MULTIHOP", 0.7 if f["relational"] else 0.55
        else:
            cls, conf = "SEMANTIC", 0.6
        from .config import GRAPH_CLASSES
        return Route(cls, conf, f, use_graph=cls in GRAPH_CLASSES)


_LLM_PROMPT = """Classify the retrieval intent of a search query into exactly one class.

LEXICAL   - needs exact token matching: identifiers, error codes, names, quoted phrases, file paths.
SEMANTIC  - a single self-contained factual question answerable from one passage.
MULTIHOP  - requires joining facts across two or more distinct documents or entities.
GLOBAL    - asks about themes, trends, counts, or summaries across the whole corpus.

Reply with the class name only, no punctuation or explanation.

Query: {q}"""


class LLMRouter:
    """`llm_fn` takes a prompt and returns text. Wire it to a cheap fast model;
    this is the one place in the pipeline where a small model is correct."""

    VALID = {"LEXICAL", "SEMANTIC", "MULTIHOP", "GLOBAL"}

    def __init__(self, llm_fn: Callable[[str], str],
                 fallback: Optional[HeuristicRouter] = None):
        self.llm_fn = llm_fn
        self.fallback = fallback or HeuristicRouter()

    def classify(self, query: str) -> Route:
        base = self.fallback.classify(query)
        try:
            raw = (self.llm_fn(_LLM_PROMPT.format(q=query)) or "").strip().upper()
            cls = next((c for c in self.VALID if c in raw), None)
            if cls is None:
                return base
            from .config import GRAPH_CLASSES
            feats = dict(base.features)
            feats["heuristic_said"] = base.query_class
            return Route(cls, 0.85, feats, use_graph=cls in GRAPH_CLASSES)
        except Exception as e:                      # fail closed to heuristic
            base.features["llm_error"] = type(e).__name__
            return base
