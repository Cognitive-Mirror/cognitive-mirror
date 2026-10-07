"""SQLAlchemy ORM models for the Capability State Model.

Every table carries `tenant_id`. Tenant isolation is a governance requirement
(thesis 24), not a later feature, so it is structural in the schema rather than
applied at the query layer only.

Model map:
  User                    people, linked to their Firebase uid
  Capability              a capability in the Spine, with its decay class
  CapabilityRequirement   resolved required_level with provenance (D6)
  Evidence                a learner submission
  EvidenceReview          AI review output for one evidence item (Phase 2)
  ManagerValidation       the human decision. The trust anchor.
  CapabilityStateRecord   current scored state per (subject, capability)
  CapabilityStateEvent    append-only audit log (Update Rule 6)
  KnowledgeDocument       approved Spine knowledge the AI may retrieve
  LearningActivity        an e-learn or assessment for one capability
  AssessmentItem          one interactive exercise; holds the answer key
  ActivityAttempt         a learner attempt; retakes are new rows
  ItemResponse            one answer, its credit, and who scored it
"""

from app.models.audit import CapabilityStateEvent
from app.models.capability import (
    Capability,
    CapabilityRequirement,
    CapabilityStateRecord,
)
from app.models.evidence import Evidence, EvidenceReview, ManagerValidation
from app.models.knowledge import KnowledgeDocument, KnowledgeKind
from app.models.learning import (
    ActivityAttempt,
    AssessmentItem,
    ItemResponse,
    LearningActivity,
)
from app.models.user import Role, User

__all__ = [
    "User",
    "Role",
    "Capability",
    "CapabilityRequirement",
    "CapabilityStateRecord",
    "Evidence",
    "EvidenceReview",
    "ManagerValidation",
    "CapabilityStateEvent",
    "KnowledgeDocument",
    "KnowledgeKind",
    "LearningActivity",
    "AssessmentItem",
    "ActivityAttempt",
    "ItemResponse",
]
