"""Learning journey schemas: e-learns, knowledge checks, pre/post assessments.

The client's learning process has several components, not all live on day one:

    assessments (pre / post)  - measure knowledge before and after learning
    e-learns                  - interactive, with embedded knowledge checks
    peer engagement           - not yet available
    AI engagement             - not yet available
    implementing at work      - workplace evidence, validated by a manager

These are different KINDS of signal and the model keeps them apart. Everything
in this module measures what a learner KNOWS. Only workplace evidence, ratified
by a manager, measures what they DO - and only that can raise capability level
(CSM section 5, Tier 1). See Docs/Decisions/ADR-003-learning-signals.md.
"""

from enum import StrEnum


class ActivityKind(StrEnum):
    """What a learning activity is. Decides which signal it produces."""

    ELEARN = "elearn"                  # content + embedded knowledge checks
    ASSESSMENT = "assessment"          # standalone, usually paired pre/post
    PEER_ACTIVITY = "peer_activity"    # reserved: not available yet
    AI_PRACTICE = "ai_practice"        # reserved: not available yet


class AssessmentPhase(StrEnum):
    """Where an activity sits relative to the learning.

    Pre and post attempts on the same `instrument_ref` form a pair, and only a
    pair can produce a learning gain.
    """

    NONE = "none"
    PRE = "pre"
    POST = "post"


class ItemType(StrEnum):
    """Interaction types the client's e-learns use.

    Every type except FREE_RESPONSE is scored deterministically, with partial
    credit where the type admits it. FREE_RESPONSE is scored by AI against the
    item's own key points and is always marked as such.
    """

    SINGLE_CHOICE = "single_choice"
    MULTI_CHOICE = "multi_choice"
    MATCH = "match"              # pair left items to right items
    RANK = "rank"                # put items in order
    CATEGORIZE = "categorize"    # drag items into buckets
    SHORT_ANSWER = "short_answer"    # typed answer, matched to accepted forms
    FREE_RESPONSE = "free_response"  # open text, AI-scored against key points


class ItemDimension(StrEnum):
    """What an item probes. Lets a report separate recall from judgement."""

    RECALL = "recall"            # knows the concept
    UNDERSTANDING = "understanding"  # can explain or distinguish it
    JUDGEMENT = "judgement"      # chooses well in a described situation


class ScoredBy(StrEnum):
    """Provenance of an item score. Persisted so reports can segment by it."""

    DETERMINISTIC = "deterministic"
    AI = "ai"
    HUMAN = "human"              # facilitator or manager, overriding or completing AI
    PENDING = "pending"          # awaiting AI or human scoring
    UNSCORED = "unscored"        # scoring was not possible; excluded from totals


class AttemptStatus(StrEnum):
    IN_PROGRESS = "in_progress"
    SCORING = "scoring"          # submitted; some items still being scored
    SCORED = "scored"


class KnowingDoing(StrEnum):
    """Relationship between what a learner knows and what they have shown at work.

    This is the diagnostic the platform exists to surface. Training measures the
    first column; Cognitive Mirror is the only place the second one lives.
    """

    INSUFFICIENT_DATA = "insufficient_data"
    # Knows it, has not shown it at work yet. The classic transfer gap, and the
    # most actionable state in the product: the next step is application.
    KNOWS_NOT_APPLIED = "knows_not_applied"
    # Knowledge and validated application agree.
    ALIGNED = "aligned"
    # Validated at work, but scores poorly on knowledge. Either the assessment
    # does not measure what the work needs, or the validation was generous.
    # Never resolved automatically: it lowers confidence and asks a human.
    APPLIED_WITHOUT_KNOWLEDGE = "applied_without_knowledge"
    # Neither known nor applied yet.
    DEVELOPING = "developing"
