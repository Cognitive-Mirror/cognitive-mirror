"""Locate a model's quote, verbatim, inside the text it claims to quote.

Both AI judgements that quote a learner - free-response marking and evidence
review - pass every quote through `locate_quote`. A quote that cannot be found
is discarded, whatever the model said about it; a quote that is found comes
back with its character span in the ORIGINAL text, so the UI highlights exactly
the passage the server checked rather than re-searching on the client.

Matching is on the same normalised form `app.scoring.items.normalise_text`
uses (lowercase, punctuation as space, whitespace collapsed), so a model that
drops a comma or changes case still matches, but a model that paraphrases does
not.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.scoring.items import normalise_text

# Shorter than this cannot demonstrate anything ("yes", "the team").
MIN_QUOTE_WORDS = 3


@dataclass(frozen=True)
class LocatedQuote:
    quote: str
    start: int
    end: int

    @property
    def span(self) -> tuple[int, int]:
        return self.start, self.end


def _normalised_with_map(text: str) -> tuple[str, list[int]]:
    """normalise_text(text), plus the original index of every output char."""
    out: list[str] = []
    index: list[int] = []
    pending_space = False
    for i, ch in enumerate(text):
        if ch.isalnum() or ch == "_":
            if pending_space and out:
                out.append(" ")
                index.append(i)
            pending_space = False
            out.append(ch.lower())
            index.append(i)
        else:
            pending_space = True
    return "".join(out), index


def locate_quote(text: str, quote: str, *, min_words: int = MIN_QUOTE_WORDS) -> LocatedQuote | None:
    """Span of `quote` in `text`, or None when it is absent or too short."""
    needle = normalise_text(quote)
    if len(needle.split()) < min_words:
        return None
    haystack, index = _normalised_with_map(text or "")
    if haystack != normalise_text(text or ""):
        # Unicode edge cases where the two normalisers disagree: refuse rather
        # than highlight the wrong passage.
        return None
    at = haystack.find(needle)
    if at < 0:
        return None
    start = index[at]
    end = index[at + len(needle) - 1] + 1
    return LocatedQuote(quote=text[start:end], start=start, end=end)


__all__ = ["MIN_QUOTE_WORDS", "LocatedQuote", "locate_quote"]
