"""Scoring constants for the Capability State Model.

EVERY tunable number in the CSM lives here and nowhere else.

Constants are marked [structural] or [seeded] to match
Docs/Architecture/Capability_State_Model.md section 9:

  [structural] - a design commitment. Changing it changes what the product
                 claims. Re-read the thesis before touching one.
  [seeded]     - a placeholder chosen for plausibility, to be replaced by
                 observed data. See section 11 of the CSM doc for how each
                 one gets earned.

Bump SCORING_MODEL_VERSION whenever any value changes. Every persisted state
row stamps the version that produced it, so recalibration never silently
rewrites history.
"""

from __future__ import annotations

from app.schemas.capability import CapabilityClass, CapabilityLevel
from app.schemas.evidence import EvidenceStrengthBand

# Bump on ANY change below. Format: major.minor - major = structural change.
SCORING_MODEL_VERSION = "0.2.0"


# --- D1: decay -------------------------------------------------------------

# Evidence weight never falls to zero: a validated past demonstration stays
# part of the longitudinal record, it is just weaker present-tense proof.
DECAY_FLOOR = 0.10  # [structural]

# Base half-life in days, by capability class. The ORDERING is the claim
# (procedural retains best, interpersonal worst); the numbers are placeholders.
BASE_HALF_LIFE_DAYS: dict[CapabilityClass, float] = {
    CapabilityClass.PROCEDURAL: 270.0,     # [seeded]
    CapabilityClass.ANALYTICAL: 180.0,     # [seeded]
    CapabilityClass.INTERPERSONAL: 120.0,  # [seeded]
}

# Reinforcement coefficient: half_life *= (1 + K * ln(1 + applications)).
# Log form encodes diminishing returns from overlearning.
REINFORCEMENT_K = 0.5  # [seeded]


# --- D3: evidence points ---------------------------------------------------

# Weak evidence is worth exactly zero. Thesis 16.2: submissions that cannot be
# observed or validated are not evidence, however many arrive.
BASE_POINTS: dict[EvidenceStrengthBand, float] = {
    EvidenceStrengthBand.WEAK: 0.0,         # [structural]
    EvidenceStrengthBand.MODERATE: 1.0,     # [seeded]
    EvidenceStrengthBand.STRONG: 2.0,       # [seeded]
    EvidenceStrengthBand.EXCEPTIONAL: 3.0,  # [seeded]
}


# --- D4: level thresholds --------------------------------------------------

# Cumulative validated, recency-weighted points required to reach each level.
# Superlinear: each level demands demonstrated consistency, not one good day.
LEVEL_POINT_THRESHOLDS: dict[CapabilityLevel, float] = {
    CapabilityLevel.NOVICE: 0.0,        # [structural] - the floor
    CapabilityLevel.DEVELOPING: 2.0,    # [seeded]
    CapabilityLevel.COMPETENT: 5.0,     # [seeded]
    CapabilityLevel.PROFICIENT: 10.0,   # [seeded]
    CapabilityLevel.EXPERT: 18.0,       # [seeded]
}

# Independent contexts required at each level. This operationalises transfer
# (thesis 7.1): capability shown once in one setting is not generalised.
LEVEL_CONTEXT_REQUIREMENTS: dict[CapabilityLevel, int] = {
    CapabilityLevel.NOVICE: 0,        # [structural]
    CapabilityLevel.DEVELOPING: 1,    # [seeded]
    CapabilityLevel.COMPETENT: 2,     # [seeded]
    CapabilityLevel.PROFICIENT: 3,    # [seeded]
    CapabilityLevel.EXPERT: 4,        # [seeded]
}

# Expert additionally requires at least one exceptional item.
EXPERT_REQUIRES_EXCEPTIONAL = True  # [structural]

# Two evidence items count as independent only if they differ in context_ref
# AND are at least this many days apart.
INDEPENDENCE_WINDOW_DAYS = 14  # [seeded]


# --- D5: confidence --------------------------------------------------------

CONFIDENCE_WEIGHT_SUFFICIENCY = 0.40  # [seeded]
CONFIDENCE_WEIGHT_VALIDATION = 0.40   # [seeded]
CONFIDENCE_WEIGHT_DIVERSITY = 0.20    # [seeded]

PENALTY_PER_AUTHENTICITY_CONCERN = 0.15  # [seeded]
PENALTY_CALIBRATION_MISMATCH = 0.10      # [seeded]
PENALTY_CAP = 0.40                       # [seeded]

# THE HARD CEILING. Capability state cannot become confident without a human.
# No volume of AI review, assessment or cohort activity may pass this without
# manager validation. This is the governance promise as arithmetic.
UNVALIDATED_CONFIDENCE_CEILING = 0.40  # [structural]

# Confidence bands.
CONFIDENCE_HIGH = 0.75           # [seeded]
CONFIDENCE_MODERATE = 0.50       # [seeded]
CONFIDENCE_LOW = 0.35            # [seeded]
REVALIDATION_THRESHOLD = 0.35    # [seeded] - below this, flag a manager check-in

# --- D2: aggregates --------------------------------------------------------

# Minimum confidence for a subject to count toward validated_coverage,
# the headline metric reported externally.
COVERAGE_CONFIDENCE_FLOOR = 0.60  # [seeded]

# gap >= this is a critical gap requiring intervention.
CRITICAL_GAP_THRESHOLD = 2  # [seeded]
