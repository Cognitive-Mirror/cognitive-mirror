"""Reliable structured output across providers.

Native `with_structured_output` depends on provider tool-calling support. It is
dependable on Anthropic and OpenAI and materially less so on NIM-hosted models,
which is the configured deployment here - so this module supplies a fallback
chain rather than assuming the happy path.

    native  ->  JSON extraction from raw text  ->  give up (caller degrades)

The path taken is returned alongside the result and persisted on the review row.
That matters for audit: a reviewer that needed JSON repair is a reviewer whose
output format was not guaranteed, and thesis 23 evaluation should be able to
segment quality by that.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Any, TypeVar

from pydantic import BaseModel, ValidationError

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

# Fenced block first (```json ... ```), then the widest balanced-looking object.
_FENCE = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL)


@dataclass
class StructuredResult:
    """A parsed model, plus how it had to be obtained."""

    value: Any | None
    method: str          # native | json_extracted | failed
    error: str = ""

    @property
    def ok(self) -> bool:
        return self.value is not None


def _extract_json_object(text: str) -> str | None:
    """Pull the most plausible JSON object out of free text.

    Models that cannot emit strict JSON usually emit good JSON wrapped in
    apology or fencing. Brace matching is used rather than a greedy regex
    because nested objects defeat a non-greedy regex.
    """
    if not text:
        return None

    fenced = _FENCE.search(text)
    if fenced:
        return fenced.group(1)

    start = text.find("{")
    if start == -1:
        return None

    depth = 0
    in_string = False
    escape = False
    for i in range(start, len(text)):
        ch = text[i]
        if escape:
            escape = False
            continue
        if ch == "\\":
            escape = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    return None


def _content_of(response: Any) -> str:
    return getattr(response, "content", None) or str(response or "")


# Failures where a second call to the same endpoint cannot help: it would only
# wait out another full timeout, or be refused again. Matched by class name so
# this module needs no provider SDK imports (openai.APITimeoutError,
# httpx.ReadTimeout, openai.AuthenticationError, ...).
_TERMINAL_ERRORS = ("timeout", "authentication", "permissiondenied", "unauthorized")


def _is_terminal(exc: Exception) -> bool:
    names = [c.__name__.lower() for c in type(exc).__mro__]
    return isinstance(exc, TimeoutError) or any(
        marker in name for name in names for marker in _TERMINAL_ERRORS
    )


def invoke_structured(llm: Any, prompt_value: Any, schema: type[T]) -> StructuredResult:
    """Invoke `llm` and return an instance of `schema`.

    `prompt_value` is whatever the LLM accepts - a ChatPromptValue, a message
    list, or a string.
    """
    # --- 1. Native structured output ---
    try:
        structured = llm.with_structured_output(schema)
        value = structured.invoke(prompt_value)
        if isinstance(value, schema):
            return StructuredResult(value=value, method="native")
        if isinstance(value, dict):
            return StructuredResult(value=schema(**value), method="native")
    except Exception as exc:
        if _is_terminal(exc):
            logger.warning("Model call failed (%s); not retrying.", type(exc).__name__)
            return StructuredResult(value=None, method="failed", error=type(exc).__name__)
        logger.info("Native structured output unavailable (%s); extracting JSON.", exc)

    # --- 2. Raw call, then extract and validate ---
    try:
        raw = _content_of(llm.invoke(prompt_value))
        blob = _extract_json_object(raw)
        if blob is None:
            return StructuredResult(
                value=None, method="failed", error="no JSON object in response"
            )
        payload = json.loads(blob)
        return StructuredResult(value=schema(**payload), method="json_extracted")
    except ValidationError as exc:
        logger.warning("Extracted JSON failed schema validation: %s", exc)
        return StructuredResult(
            value=None, method="failed", error=f"schema validation: {exc.error_count()} errors"
        )
    except json.JSONDecodeError as exc:
        return StructuredResult(value=None, method="failed", error=f"invalid JSON: {exc}")
    except Exception as exc:
        logger.warning("Structured invocation failed: %s", exc, exc_info=True)
        return StructuredResult(value=None, method="failed", error=type(exc).__name__)


__all__ = ["StructuredResult", "invoke_structured"]
