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
"""

from app.models.audit import CapabilityStateEvent
from app.models.capability import (
    Capability,
    CapabilityRequirement,
    CapabilityStateRecord,
)
from app.models.evidence import Evidence, EvidenceReview, ManagerValidation
from app.models.user import User

__all__ = [
    "User",
    "Capability",
    "CapabilityRequirement",
    "CapabilityStateRecord",
    "Evidence",
    "EvidenceReview",
    "ManagerValidation",
    "CapabilityStateEvent",
]
