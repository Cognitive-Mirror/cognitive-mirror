"""Evidence enumerations, shared by the ORM, the AI contract and scoring."""

from enum import StrEnum


class EvidenceStrengthBand(StrEnum):
    """How strongly an evidence item demonstrates capability.

    Canonical domain enum. `ai.schemas.evidence_review.EvidenceStrength` aliases
    this so the AI output contract and the scoring engine cannot drift apart.

    WEAK is worth zero scoring points by design (thesis 16.2): it triggers
    developmental guidance, never progression.
    """

    WEAK = "weak"
    MODERATE = "moderate"
    STRONG = "strong"
    EXCEPTIONAL = "exceptional"


class EvidenceType(StrEnum):
    """Categories of evidence a learner can submit."""

    WORKPLACE_APPLICATION = "workplace_application"
    SCENARIO_PRACTICE = "scenario_practice"
    REFLECTION = "reflection"
    PEER_FEEDBACK = "peer_feedback"
    MANAGER_OBSERVATION = "manager_observation"
    DOCUMENT = "document"
    OTHER = "other"
