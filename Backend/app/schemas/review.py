"""Manager review decisions."""

from enum import StrEnum


class ReviewDecision(StrEnum):
    """Possible outcomes when a manager reviews evidence."""

    APPROVED = "approved"
    NEEDS_REVISION = "needs_revision"
    REJECTED = "rejected"
    ESCALATED = "escalated"
