"""Prompt Registry — central catalog of all AI prompts.

Every prompt used in Cognitive Mirror must be registered here
with its metadata. This supports:
  - Auditability: what prompt produced a given output
  - Versioning: track prompt evolution
  - Governance: risk levels and human review flags
  - Testing: link prompts to evaluation tests
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

from langchain_core.prompts import ChatPromptTemplate


class RiskLevel(StrEnum):
    """How much damage a bad prompt output could cause."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass(frozen=True)
class PromptMetadata:
    """Metadata for a registered prompt."""

    name: str
    version: str
    purpose: str
    input_variables: list[str]
    output_schema: str  # Name of the Pydantic model
    risk_level: RiskLevel
    requires_human_review: bool
    owner: str
    tags: tuple[str, ...] = ()


@dataclass
class PromptEntry:
    """A prompt template paired with its metadata."""

    metadata: PromptMetadata
    template: ChatPromptTemplate


class PromptRegistry:
    """In-memory prompt catalog.

    Usage:
        registry = PromptRegistry()
        registry.register(metadata, template)
        entry = registry.get("evidence_review")
    """

    def __init__(self) -> None:
        self._store: dict[str, PromptEntry] = {}

    def register(
        self,
        metadata: PromptMetadata,
        template: ChatPromptTemplate,
    ) -> None:
        """Register a prompt with its metadata."""
        self._store[metadata.name] = PromptEntry(
            metadata=metadata,
            template=template,
        )

    def get(self, name: str) -> PromptEntry:
        """Retrieve a registered prompt by name.

        Raises:
            KeyError: If the prompt is not registered.
        """
        if name not in self._store:
            raise KeyError(
                f"Prompt '{name}' is not registered. "
                f"Available: {list(self._store.keys())}"
            )
        return self._store[name]

    def list_all(self) -> list[PromptMetadata]:
        """Return metadata for all registered prompts."""
        return [entry.metadata for entry in self._store.values()]

    def __contains__(self, name: str) -> bool:
        return name in self._store

    def __len__(self) -> int:
        return len(self._store)


# ─── Singleton Registry ─── #

_registry: PromptRegistry | None = None


def get_prompt_registry() -> PromptRegistry:
    """Return the global prompt registry, creating it on first access."""
    global _registry
    if _registry is None:
        _registry = PromptRegistry()
        _register_default_prompts(_registry)
    return _registry


def _register_default_prompts(registry: PromptRegistry) -> None:
    """Register all built-in prompts with their metadata."""
    from ai.prompts.evidence_review import EVIDENCE_REVIEW_PROMPT
    from ai.prompts.capability_update import CAPABILITY_UPDATE_PROMPT

    registry.register(
        metadata=PromptMetadata(
            name="evidence_review",
            version="1.0.0",
            purpose="Analyze learner-submitted evidence for capability signals",
            input_variables=[
                "learner_id", "capability_id", "capability_name",
                "evidence_type", "title", "content", "context",
            ],
            output_schema="EvidenceReviewOutput",
            risk_level=RiskLevel.HIGH,
            requires_human_review=True,
            owner="ai-team",
            tags=("evidence", "review", "core"),
        ),
        template=EVIDENCE_REVIEW_PROMPT,
    )

    registry.register(
        metadata=PromptMetadata(
            name="capability_update",
            version="1.0.0",
            purpose="Recommend capability level changes based on evidence reviews",
            input_variables=[
                "learner_id", "capability_id", "capability_name",
                "current_level", "evidence_reviews_json",
            ],
            output_schema="CapabilityUpdateOutput",
            risk_level=RiskLevel.CRITICAL,
            requires_human_review=True,
            owner="ai-team",
            tags=("capability", "update", "core"),
        ),
        template=CAPABILITY_UPDATE_PROMPT,
    )
