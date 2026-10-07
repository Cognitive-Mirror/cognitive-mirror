"""Deterministic scoring for interactive e-learn items.

Pure functions: (payload, answer_key, response) -> ItemScore. No I/O, no model.
Every deterministic item type is scored here; FREE_RESPONSE is not, because it
needs judgement (see app/services/learning_service.py).

Partial-credit rules are chosen to resist the obvious gaming strategy for each
interaction, and are documented per scorer because a learner disputing a mark
deserves a rule they can read:

  single_choice  all or nothing
  multi_choice   (correct picks - wrong picks) / correct options, floored at 0.
                 Ticking every box therefore scores 0, not partial credit.
  match          share of pairs matched correctly
  categorize     share of items placed in the right bucket
  rank           1 - discordant pairs / all pairs (normalised Kendall distance).
                 One adjacent swap in a list of five still earns 0.9; a fully
                 reversed list earns 0. Position-exact scoring would give a
                 nearly-right ranking with one early slip almost nothing.
  short_answer   normalised exact match against any accepted form

Malformed responses score 0 with an explanation rather than raising: a learner
submitting a half-dragged exercise is ordinary, not exceptional.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from itertools import combinations
from typing import Any

from app.schemas.learning import ItemType

# Bump when any rule below changes. Stamped on every attempt.
ITEM_SCORING_VERSION = "1.0.0"


@dataclass(frozen=True)
class ItemScore:
    credit: float          # 0..1
    detail: str            # learner-facing explanation of the mark


def _ratio(hit: int, total: int) -> float:
    return 0.0 if total <= 0 else max(0.0, min(1.0, hit / total))


def score_single_choice(key: dict, response: dict) -> ItemScore:
    chosen = response.get("choice")
    if chosen is None:
        return ItemScore(0.0, "No option selected.")
    ok = chosen == key.get("correct")
    return ItemScore(1.0 if ok else 0.0, "Correct." if ok else "Not the best answer.")


def score_multi_choice(key: dict, response: dict) -> ItemScore:
    correct = set(key.get("correct", []))
    chosen = set(response.get("choices", []))
    if not chosen:
        return ItemScore(0.0, "No options selected.")
    hits = len(chosen & correct)
    wrong = len(chosen - correct)
    credit = _ratio(hits - wrong, len(correct))
    return ItemScore(
        credit,
        f"{hits} of {len(correct)} correct options selected"
        + (f", {wrong} incorrect" if wrong else "")
        + ".",
    )


def score_match(key: dict, response: dict) -> ItemScore:
    pairs: dict = key.get("pairs", {})
    given: dict = response.get("pairs", {}) or {}
    hits = sum(1 for left, right in pairs.items() if given.get(left) == right)
    return ItemScore(_ratio(hits, len(pairs)), f"{hits} of {len(pairs)} pairs matched.")


def score_categorize(key: dict, response: dict) -> ItemScore:
    placement: dict = key.get("placement", {})
    given: dict = response.get("placement", {}) or {}
    hits = sum(1 for item, bucket in placement.items() if given.get(item) == bucket)
    return ItemScore(
        _ratio(hits, len(placement)), f"{hits} of {len(placement)} items placed correctly."
    )


def score_rank(key: dict, response: dict) -> ItemScore:
    truth: list = key.get("order", [])
    given: list = response.get("order", []) or []
    if sorted(map(str, given)) != sorted(map(str, truth)):
        return ItemScore(0.0, "Ranking incomplete: every item must be placed once.")
    n = len(truth)
    if n < 2:
        return ItemScore(1.0, "Correct.")
    pos = {item: i for i, item in enumerate(given)}
    discordant = sum(
        1 for a, b in combinations(truth, 2) if pos[a] > pos[b]
    )
    total = n * (n - 1) // 2
    credit = 1.0 - discordant / total
    if discordant == 0:
        return ItemScore(1.0, "Correct order.")
    return ItemScore(credit, f"{total - discordant} of {total} pairwise orderings correct.")


_NON_WORD = re.compile(r"[^\w\s]")
_SPACE = re.compile(r"\s+")


def normalise_text(text: str) -> str:
    """Lowercase, strip punctuation, collapse whitespace."""
    return _SPACE.sub(" ", _NON_WORD.sub(" ", (text or "").lower())).strip()


def score_short_answer(key: dict, response: dict) -> ItemScore:
    given = normalise_text(response.get("text", ""))
    if not given:
        return ItemScore(0.0, "No answer entered.")
    accepted = {normalise_text(a) for a in key.get("accepted", [])}
    ok = given in accepted
    return ItemScore(1.0 if ok else 0.0, "Correct." if ok else "Not an accepted answer.")


_SCORERS = {
    ItemType.SINGLE_CHOICE: score_single_choice,
    ItemType.MULTI_CHOICE: score_multi_choice,
    ItemType.MATCH: score_match,
    ItemType.CATEGORIZE: score_categorize,
    ItemType.RANK: score_rank,
    ItemType.SHORT_ANSWER: score_short_answer,
}


def is_deterministic(item_type: ItemType) -> bool:
    return item_type in _SCORERS


def score_item(item_type: ItemType, answer_key: dict, response: dict[str, Any]) -> ItemScore:
    """Score one response. Raises only for a type that is not deterministic."""
    scorer = _SCORERS.get(item_type)
    if scorer is None:
        raise ValueError(f"{item_type} is not deterministically scorable.")
    if not isinstance(response, dict):
        return ItemScore(0.0, "Response was not in the expected format.")
    return scorer(answer_key or {}, response)


__all__ = [
    "ITEM_SCORING_VERSION",
    "ItemScore",
    "is_deterministic",
    "normalise_text",
    "score_item",
]
