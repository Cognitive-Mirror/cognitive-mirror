"""Seed the approved Capability Spine knowledge corpus.

    python -m scripts.seed_knowledge

This is the corpus ARC retrieves over to ground evidence review. It is authored
product content, not observed data - thesis 10 makes the Spine one of Impact's
proprietary assets, and someone writes it. A real engagement would author this
with the client from their goals and KPIs; this is a credible stand-in for the
three seeded capabilities so the pipeline is exercisable end to end.

Writing rules followed here, because rubric quality is what determines whether
grounded review is worth anything:

  * Indicators describe OBSERVABLE behaviour. A manager has to be able to say
    yes or no from what they saw, not infer an internal state.
  * Every level says what separates it from the level below. "Better judgement"
    is not a level descriptor; "states the assumption that would change the
    decision" is.
  * The insufficient-evidence rubric is as detailed as the strong one. Thesis
    16.2 lists what does not count, and a reviewer that only knows what good
    looks like will rate everything moderate.
  * No rubric asserts a causal link to a KPI. Capability supports a KPI; it does
    not cause its movement (thesis 19).

Idempotent. Re-running updates bodies and bumps the revision when text changes.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime

from sqlalchemy import select

from app.database import Base, get_engine, get_session_factory
from app.models import KnowledgeDocument, KnowledgeKind

TENANT = "default"
APPROVER = "user-admin-demo"

CAP_DECISION = "cap-strategic-decision"
CAP_INFLUENCE = "cap-stakeholder-influence"
CAP_STORY = "cap-data-storytelling"


DOCUMENTS: list[dict] = [
    # ================================================================
    # Strategic decision making
    # ================================================================
    {
        "slug": "CAP-SDM.DEF",
        "kind": KnowledgeKind.CAPABILITY_DEFINITION,
        "capability_id": CAP_DECISION,
        "title": "Strategic decision making - definition",
        "kpi_ref": "kpi-delivery-predictability",
        "related": ["CAP-SDM.IND.COMPETENT", "CAP-SDM.RUBRIC.STRONG", "KPI.DELIVERY-PREDICTABILITY"],
        "body": (
            "Strategic decision making is the capability to frame a consequential choice, "
            "surface the trade-off it actually turns on, and commit to a direction with the "
            "remaining uncertainty stated rather than hidden.\n\n"
            "It is distinct from analysis. Producing a thorough options paper is not this "
            "capability; choosing between the options, naming what the choice costs, and "
            "owning the consequence is.\n\n"
            "It is also distinct from decisiveness. Committing quickly with the trade-off "
            "unexamined is the failure mode this capability guards against, not an "
            "expression of it. The observable marker is whether the person can state what "
            "they gave up and under what new information they would reverse."
        ),
    },
    {
        "slug": "CAP-SDM.IND.DEVELOPING",
        "kind": KnowledgeKind.BEHAVIOURAL_INDICATOR,
        "capability_id": CAP_DECISION,
        "level": "developing",
        "related": ["CAP-SDM.DEF", "CAP-SDM.IND.COMPETENT"],
        "body": (
            "At developing, the person:\n"
            "- Identifies that a decision is required and escalates it rather than letting it drift.\n"
            "- Lays out options, but weights them by effort or familiarity rather than by impact.\n"
            "- States a recommendation when asked, usually with one dominant reason.\n"
            "- Needs prompting to articulate what the recommendation costs.\n\n"
            "Separating developing from novice: a novice does not recognise the decision point "
            "at all, or treats it as someone else's. Developing recognises and raises it.\n\n"
            "Separating developing from competent: developing still needs someone else to ask "
            "'and what does that cost us?'. Competent volunteers it."
        ),
    },
    {
        "slug": "CAP-SDM.IND.COMPETENT",
        "kind": KnowledgeKind.BEHAVIOURAL_INDICATOR,
        "capability_id": CAP_DECISION,
        "level": "competent",
        "related": ["CAP-SDM.IND.DEVELOPING", "CAP-SDM.IND.PROFICIENT", "CAP-SDM.RUBRIC.STRONG"],
        "body": (
            "At competent, the person independently:\n"
            "- Frames the decision as a trade-off between named, non-strawman alternatives.\n"
            "- States the assumption the decision rests on, unprompted.\n"
            "- Commits to a recommendation and records it, including what was given up.\n"
            "- Identifies who is affected and informs them before they discover it.\n"
            "- Names what new information would reverse the decision.\n\n"
            "This is the level at which the decision record is usable by someone who was not "
            "in the room. That is the practical test: could a colleague reconstruct why, six "
            "months later, without asking?\n\n"
            "Competent applies in standard situations. Novel or politically contested "
            "decisions may still require support - that boundary is what separates this from "
            "proficient."
        ),
    },
    {
        "slug": "CAP-SDM.IND.PROFICIENT",
        "kind": KnowledgeKind.BEHAVIOURAL_INDICATOR,
        "capability_id": CAP_DECISION,
        "level": "proficient",
        "related": ["CAP-SDM.IND.COMPETENT", "CAP-SDM.IND.EXPERT"],
        "body": (
            "At proficient, the person does the competent behaviours in situations that are "
            "ambiguous, contested, or lack a clear owner. Specifically:\n"
            "- Decides under genuine uncertainty without waiting for information that will not arrive.\n"
            "- Holds a position against senior pushback when the evidence supports it, and "
            "changes position when it does not - and can show an instance of each.\n"
            "- Surfaces the second-order consequence others missed.\n"
            "- Sequences a decision: what must be settled now, what can be deferred, what is "
            "reversible and therefore cheap to try.\n\n"
            "The distinguishing observable is reversal discipline. A proficient decision maker "
            "can point to a decision they changed on new evidence, and to one they held despite "
            "pressure. Someone who only ever has examples of one of those is not yet proficient."
        ),
    },
    {
        "slug": "CAP-SDM.IND.EXPERT",
        "kind": KnowledgeKind.BEHAVIOURAL_INDICATOR,
        "capability_id": CAP_DECISION,
        "level": "expert",
        "related": ["CAP-SDM.IND.PROFICIENT"],
        "body": (
            "At expert, the person improves how decisions are made around them, not only the "
            "decisions they personally make:\n"
            "- Sets the decision frame others then use - what question the team is answering.\n"
            "- Is sought out for decisions outside their formal remit.\n"
            "- Coaches others through the trade-off rather than supplying the answer.\n"
            "- Recognises when the organisation is repeatedly making a decision badly and "
            "changes the process, not the instance.\n\n"
            "Expert is a claim about influence on the system. Evidence of personally excellent "
            "decisions, however strong, supports proficient rather than expert. Look for a "
            "second person whose decision quality changed."
        ),
    },
    {
        "slug": "CAP-SDM.RUBRIC.STRONG",
        "kind": KnowledgeKind.EVIDENCE_RUBRIC,
        "capability_id": CAP_DECISION,
        "level": "strong",
        "related": ["CAP-SDM.IND.COMPETENT", "CAP-SDM.RUBRIC.INSUFFICIENT", "CAP-SDM.VALIDATE"],
        "body": (
            "Evidence of strategic decision making rates STRONG when it contains all of:\n\n"
            "1. A real decision with a real cost. Something was foreclosed by choosing.\n"
            "2. The alternatives, stated fairly. A rejected option described only as obviously "
            "   wrong indicates the trade-off was not genuinely weighed.\n"
            "3. The learner's own contribution, distinguishable from the team's. 'We decided' "
            "   without a personal action is a team artefact, not individual evidence.\n"
            "4. The assumption or uncertainty, named by the learner rather than implied.\n"
            "5. An observable consequence: what happened, who was affected, what changed.\n\n"
            "Rate EXCEPTIONAL only when, additionally, the evidence shows the decision being "
            "revisited on new information, or held under substantive pressure with reasoning "
            "that survived challenge.\n\n"
            "Rate MODERATE when the decision and the learner's role are clear but either the "
            "trade-off or the outcome is thin.\n\n"
            "Recency matters for this capability but less than for interpersonal ones: a "
            "well-documented decision from nine months ago still demonstrates the reasoning."
        ),
    },
    {
        "slug": "CAP-SDM.RUBRIC.INSUFFICIENT",
        "kind": KnowledgeKind.EVIDENCE_RUBRIC,
        "capability_id": CAP_DECISION,
        "level": "weak",
        "related": ["CAP-SDM.RUBRIC.STRONG"],
        "body": (
            "Rate WEAK - and ask for a revision rather than penalising - when the submission is:\n\n"
            "- A description of analysis with no choice made. Building the model is not deciding.\n"
            "- A decision with only one option ever considered. Nothing was traded off.\n"
            "- Attendance at a meeting where a decision happened. Presence is not participation.\n"
            "- A recommendation with no record of whether it was taken or what followed.\n"
            "- Written entirely in the first person plural with no separable individual action.\n"
            "- A claim of good judgement with no specific instance attached.\n"
            "- Outcome asserted without any observable marker ('it went well').\n\n"
            "Weak evidence contributes zero to capability state by design. It triggers "
            "developmental guidance: name the alternatives, state what you gave up, say what "
            "happened next. It is never a judgement about the person."
        ),
    },
    {
        "slug": "CAP-SDM.VALIDATE",
        "kind": KnowledgeKind.VALIDATION_GUIDANCE,
        "capability_id": CAP_DECISION,
        "related": ["CAP-SDM.RUBRIC.STRONG"],
        "body": (
            "Manager validation prompts for strategic decision making. Ask only what you can "
            "answer from what you observed:\n\n"
            "- Did you see this decision being made, or are you seeing the write-up now?\n"
            "- Was the trade-off real - did choosing this genuinely cost something?\n"
            "- Was the decision theirs to own, or were they executing one already taken?\n"
            "- Did they raise the uncertainty before you asked about it?\n"
            "- Would you route a comparable decision to them again without supervision?\n\n"
            "That last question is the practical test for competent. If the honest answer is "
            "'yes, but I would check the framing', the capability is developing, not competent.\n\n"
            "You are validating whether the behaviour occurred, not scoring the person. If you "
            "did not observe it, say so - unobserved evidence is a legitimate outcome and more "
            "useful than a guess."
        ),
    },

    # ================================================================
    # Stakeholder influence
    # ================================================================
    {
        "slug": "CAP-SI.DEF",
        "kind": KnowledgeKind.CAPABILITY_DEFINITION,
        "capability_id": CAP_INFLUENCE,
        "title": "Stakeholder influence - definition",
        "kpi_ref": "kpi-cycle-time",
        "related": ["CAP-SI.IND.COMPETENT", "CAP-SI.RUBRIC.STRONG", "KPI.CYCLE-TIME"],
        "body": (
            "Stakeholder influence is the capability to move a decision or commitment through "
            "people who do not report to the person, without escalating to someone who can "
            "compel them.\n\n"
            "The escalation clause is the definition's load-bearing part. Getting a result by "
            "routing to a senior sponsor is a legitimate organisational move but it is not this "
            "capability - it demonstrates knowing who has authority, not influencing without it.\n\n"
            "It is also not persuasion in the abstract. The observable unit is a stakeholder "
            "whose position, priority or commitment demonstrably changed.\n\n"
            "This capability is strongly context-dependent: influence with a familiar peer "
            "group transfers weakly to a hostile or unfamiliar one. Evidence should therefore "
            "be read for the difficulty of the room, not only the outcome."
        ),
    },
    {
        "slug": "CAP-SI.IND.DEVELOPING",
        "kind": KnowledgeKind.BEHAVIOURAL_INDICATOR,
        "capability_id": CAP_INFLUENCE,
        "level": "developing",
        "related": ["CAP-SI.IND.COMPETENT"],
        "body": (
            "At developing, the person:\n"
            "- Identifies who needs to agree before work can proceed.\n"
            "- Makes the case clearly, but largely from their own frame of reference.\n"
            "- Handles agreement well; stalls or escalates when met with resistance.\n"
            "- Follows up on commitments they secured.\n\n"
            "Separating developing from competent: the developing practitioner presents their "
            "reasons. The competent one finds out what the other party needs first, and "
            "presents the case in those terms."
        ),
    },
    {
        "slug": "CAP-SI.IND.COMPETENT",
        "kind": KnowledgeKind.BEHAVIOURAL_INDICATOR,
        "capability_id": CAP_INFLUENCE,
        "level": "competent",
        "related": ["CAP-SI.IND.DEVELOPING", "CAP-SI.IND.PROFICIENT", "CAP-SI.RUBRIC.STRONG"],
        "body": (
            "At competent, the person independently:\n"
            "- Establishes what the stakeholder is measured on before making the case.\n"
            "- Frames the request in terms of the other party's constraint, not their own need.\n"
            "- Secures a specific commitment - who, what, by when - rather than general assent.\n"
            "- Handles a first objection without retreating to escalation.\n"
            "- Keeps the relationship intact when the answer is no.\n\n"
            "That last point separates influence from pressure. A person who gets agreement but "
            "leaves the stakeholder less willing to engage next time has not demonstrated this "
            "capability, whatever the immediate outcome.\n\n"
            "Competent covers stakeholders of comparable or lower seniority in a cooperative "
            "setting. Senior or adversarial contexts belong to proficient."
        ),
    },
    {
        "slug": "CAP-SI.IND.PROFICIENT",
        "kind": KnowledgeKind.BEHAVIOURAL_INDICATOR,
        "capability_id": CAP_INFLUENCE,
        "level": "proficient",
        "related": ["CAP-SI.IND.COMPETENT", "CAP-SI.IND.EXPERT"],
        "body": (
            "At proficient, the person does the competent behaviours where the room is hard:\n"
            "- Influences upward, including stakeholders who can overrule them.\n"
            "- Holds a position with a stakeholder whose incentives genuinely conflict.\n"
            "- Builds a coalition ahead of the meeting rather than arguing inside it.\n"
            "- Concedes the right thing to win the thing that matters.\n"
            "- Re-engages a stakeholder who previously refused, and changes the outcome.\n\n"
            "Distinguishing observable: evidence of influence where the person had no leverage "
            "and the stakeholder had every reason to decline. Influence exercised where the "
            "other party was already inclined to agree does not discriminate between levels."
        ),
    },
    {
        "slug": "CAP-SI.IND.EXPERT",
        "kind": KnowledgeKind.BEHAVIOURAL_INDICATOR,
        "capability_id": CAP_INFLUENCE,
        "level": "expert",
        "related": ["CAP-SI.IND.PROFICIENT"],
        "body": (
            "At expert, the person changes how decisions get made across boundaries:\n"
            "- Is brought in by others to unblock stakeholder situations that are not theirs.\n"
            "- Establishes forums or norms that remove the need for repeated individual persuasion.\n"
            "- Coaches others through a stakeholder problem rather than resolving it for them.\n"
            "- Maintains standing with stakeholders over years, across disagreements.\n\n"
            "As with all expert levels, the evidence must show a change in someone else's "
            "capability or in a process. Personal effectiveness, however high, supports "
            "proficient."
        ),
    },
    {
        "slug": "CAP-SI.RUBRIC.STRONG",
        "kind": KnowledgeKind.EVIDENCE_RUBRIC,
        "capability_id": CAP_INFLUENCE,
        "level": "strong",
        "related": ["CAP-SI.IND.COMPETENT", "CAP-SI.RUBRIC.INSUFFICIENT", "CAP-SI.VALIDATE"],
        "body": (
            "Evidence of stakeholder influence rates STRONG when it contains all of:\n\n"
            "1. A named stakeholder or group outside the learner's reporting line.\n"
            "2. A starting position that differed from what the learner needed. If everyone "
            "   already agreed, no influence was exercised.\n"
            "3. What the learner did specifically - the conversation, the framing, the "
            "   concession - not just that they 'aligned stakeholders'.\n"
            "4. Evidence the position moved: a commitment, a changed plan, a withdrawn objection.\n"
            "5. No escalation to authority as the operative mechanism.\n\n"
            "Rate EXCEPTIONAL when the stakeholder was senior or the incentives genuinely "
            "conflicted, and the relationship survived intact.\n\n"
            "Rate MODERATE when the interaction is described but the stakeholder's starting "
            "position is unclear, so the degree of movement cannot be judged.\n\n"
            "Recency matters more here than for analytical capabilities. Influence depends on "
            "standing and context that decay; evidence older than a year in a changed "
            "organisation supports the capability weakly."
        ),
    },
    {
        "slug": "CAP-SI.RUBRIC.INSUFFICIENT",
        "kind": KnowledgeKind.EVIDENCE_RUBRIC,
        "capability_id": CAP_INFLUENCE,
        "level": "weak",
        "related": ["CAP-SI.RUBRIC.STRONG"],
        "body": (
            "Rate WEAK - and request a revision - when the submission is:\n\n"
            "- A meeting that happened, with no position change described.\n"
            "- 'Aligned the stakeholders' with no account of what was misaligned.\n"
            "- A result obtained by escalating to someone with authority.\n"
            "- Communication of a decision already made. Informing is not influencing.\n"
            "- A stakeholder who wanted the outcome anyway.\n"
            "- Relationship quality asserted with no instance ('I have good relationships').\n"
            "- Group work with no separable individual contribution.\n\n"
            "The most common weak pattern for this capability is a well-written account of a "
            "successful meeting that never establishes anyone disagreed. Ask: what would have "
            "happened without this conversation? If the answer is 'the same thing', there is "
            "no evidence of influence yet."
        ),
    },
    {
        "slug": "CAP-SI.VALIDATE",
        "kind": KnowledgeKind.VALIDATION_GUIDANCE,
        "capability_id": CAP_INFLUENCE,
        "related": ["CAP-SI.RUBRIC.STRONG"],
        "body": (
            "Manager validation prompts for stakeholder influence:\n\n"
            "- Did the stakeholder's position actually change, to your knowledge?\n"
            "- Did they achieve this without you or another senior person applying weight?\n"
            "- How hard was that room? Would you have expected resistance?\n"
            "- Is the working relationship with that stakeholder intact or better?\n"
            "- Have you seen this more than once, or is this the single instance?\n\n"
            "The repeat question matters disproportionately for this capability. A single "
            "successful influence event is frequently situational. Consistency across different "
            "stakeholders is the signal that the capability transfers.\n\n"
            "If you did not observe the interaction and only have the learner's account, record "
            "that. Second-hand evidence is legitimate but should not carry the same weight."
        ),
    },

    # ================================================================
    # Data storytelling
    # ================================================================
    {
        "slug": "CAP-DS.DEF",
        "kind": KnowledgeKind.CAPABILITY_DEFINITION,
        "capability_id": CAP_STORY,
        "title": "Data storytelling - definition",
        "kpi_ref": "kpi-forecast-accuracy",
        "related": ["CAP-DS.IND.COMPETENT", "CAP-DS.RUBRIC.STRONG", "KPI.FORECAST-ACCURACY"],
        "body": (
            "Data storytelling is the capability to turn an analysis into a decision a "
            "non-analyst can act on, without concealing the uncertainty that would change it.\n\n"
            "Both halves are required. A compelling narrative that hides the confidence interval "
            "is not this capability - it is the failure mode. An exhaustive caveat list that "
            "leaves the audience unable to act is the opposite failure.\n\n"
            "The observable unit is a decision made by someone else on the strength of the "
            "communication. Producing a clear chart nobody used does not demonstrate it.\n\n"
            "This capability is largely procedural: the structure that works - lead with the "
            "decision, support with the variance, state the assumption - is teachable and, once "
            "learned, retained comparatively well."
        ),
    },
    {
        "slug": "CAP-DS.IND.DEVELOPING",
        "kind": KnowledgeKind.BEHAVIOURAL_INDICATOR,
        "capability_id": CAP_STORY,
        "level": "developing",
        "related": ["CAP-DS.IND.COMPETENT"],
        "body": (
            "At developing, the person:\n"
            "- Produces accurate analysis and presents it completely.\n"
            "- Leads with method and data before the finding.\n"
            "- Answers the question asked, without reframing it to the one that matters.\n"
            "- States caveats as a list rather than as decision-relevant conditions.\n\n"
            "Separating developing from competent: the developing practitioner presents what "
            "they found. The competent one presents what should be done about it, and can be "
            "asked for the working underneath."
        ),
    },
    {
        "slug": "CAP-DS.IND.COMPETENT",
        "kind": KnowledgeKind.BEHAVIOURAL_INDICATOR,
        "capability_id": CAP_STORY,
        "level": "competent",
        "related": ["CAP-DS.IND.DEVELOPING", "CAP-DS.IND.PROFICIENT", "CAP-DS.RUBRIC.STRONG"],
        "body": (
            "At competent, the person independently:\n"
            "- Leads with the implication for the decision, not the method.\n"
            "- Selects the subset of the analysis the audience needs, and holds the rest in reserve.\n"
            "- States uncertainty as a condition ('this holds unless Q3 volume drops below X'), "
            "  not as a disclaimer.\n"
            "- Adjusts depth to the audience without changing the substance.\n"
            "- Can be challenged on a number and answer from the underlying work.\n\n"
            "The practical test: did the audience leave able to decide? A competent "
            "communication ends with the room knowing what it would do, or knowing precisely "
            "what it still needs.\n\n"
            "Competent covers a cooperative audience and a familiar dataset. A sceptical "
            "audience or a contested number belongs to proficient."
        ),
    },
    {
        "slug": "CAP-DS.IND.PROFICIENT",
        "kind": KnowledgeKind.BEHAVIOURAL_INDICATOR,
        "capability_id": CAP_STORY,
        "level": "proficient",
        "related": ["CAP-DS.IND.COMPETENT", "CAP-DS.IND.EXPERT"],
        "body": (
            "At proficient, the person does the competent behaviours where the audience is "
            "sceptical or the finding unwelcome:\n"
            "- Delivers a finding that contradicts what the audience expected, and is believed.\n"
            "- Defends a number under challenge without either capitulating or stonewalling.\n"
            "- Concedes the limit of the analysis without losing the decision.\n"
            "- Reframes the question when the one asked was the wrong one.\n\n"
            "Distinguishing observable: an unwelcome finding that was nonetheless acted on. "
            "Communicating a welcome result well does not discriminate between levels - the "
            "audience was already willing."
        ),
    },
    {
        "slug": "CAP-DS.IND.EXPERT",
        "kind": KnowledgeKind.BEHAVIOURAL_INDICATOR,
        "capability_id": CAP_STORY,
        "level": "expert",
        "related": ["CAP-DS.IND.PROFICIENT"],
        "body": (
            "At expert, the person raises the standard of evidence-based argument around them:\n"
            "- Establishes the format or standard others then use for decision reporting.\n"
            "- Is asked to review others' analyses before they go to leadership.\n"
            "- Coaches analysts to the decision frame rather than rewriting their work.\n"
            "- Changes what leadership asks for, not only how it is answered.\n\n"
            "Evidence must show another person's or team's communication improving. Personal "
            "excellence supports proficient."
        ),
    },
    {
        "slug": "CAP-DS.RUBRIC.STRONG",
        "kind": KnowledgeKind.EVIDENCE_RUBRIC,
        "capability_id": CAP_STORY,
        "level": "strong",
        "related": ["CAP-DS.IND.COMPETENT", "CAP-DS.RUBRIC.INSUFFICIENT", "CAP-DS.VALIDATE"],
        "body": (
            "Evidence of data storytelling rates STRONG when it contains all of:\n\n"
            "1. A real audience with a real decision in front of them.\n"
            "2. What the learner chose to lead with, and what they left out.\n"
            "3. The uncertainty, communicated as a condition on the decision.\n"
            "4. Evidence the audience could act: a decision taken, a plan changed, a question "
            "   resolved.\n"
            "5. The learner's own authorship, distinguishable from the team's analysis.\n\n"
            "Rate EXCEPTIONAL when the finding was unwelcome or contested and was acted on "
            "anyway, or when the learner reframed the question the audience arrived with.\n\n"
            "Rate MODERATE when the communication is well described but the audience response "
            "is missing - without it, clarity is asserted rather than demonstrated.\n\n"
            "A common misread to avoid: a polished artefact is not evidence by itself. A "
            "beautiful deck with no account of what the room decided is moderate at best."
        ),
    },
    {
        "slug": "CAP-DS.RUBRIC.INSUFFICIENT",
        "kind": KnowledgeKind.EVIDENCE_RUBRIC,
        "capability_id": CAP_STORY,
        "level": "weak",
        "related": ["CAP-DS.RUBRIC.STRONG"],
        "body": (
            "Rate WEAK - and request a revision - when the submission is:\n\n"
            "- An artefact with no audience. A dashboard was built; who used it and for what?\n"
            "- A presentation that happened, with no decision or reaction recorded.\n"
            "- Analysis described in full technical detail, which is the developing behaviour.\n"
            "- 'Presented to leadership' with no account of what was said or concluded.\n"
            "- A claim that the audience found it clear, with no observable consequence.\n"
            "- Team analysis where the learner's specific authorship is not separable.\n\n"
            "The characteristic weak submission for this capability is a genuinely good piece "
            "of analytical work submitted as though the analysis were the capability. Ask for "
            "the audience and the decision; the work itself is usually fine."
        ),
    },
    {
        "slug": "CAP-DS.VALIDATE",
        "kind": KnowledgeKind.VALIDATION_GUIDANCE,
        "capability_id": CAP_STORY,
        "related": ["CAP-DS.RUBRIC.STRONG"],
        "body": (
            "Manager validation prompts for data storytelling:\n\n"
            "- Were you in the room, or are you reading the account?\n"
            "- Did the audience leave able to decide, or did they ask for more analysis?\n"
            "- Did they lead with the implication or with the method?\n"
            "- Was the uncertainty stated in a way that shaped the decision?\n"
            "- Was the finding one the audience wanted to hear?\n\n"
            "That final question calibrates the level. Communicating a welcome finding well is "
            "competent; carrying an unwelcome one is proficient.\n\n"
            "If the analysis was a team product, ask specifically which part of the "
            "communication was theirs. This capability is frequently over-credited to whoever "
            "presented."
        ),
    },

    # ================================================================
    # KPI definitions - association only, never causation
    # ================================================================
    {
        "slug": "KPI.DELIVERY-PREDICTABILITY",
        "kind": KnowledgeKind.KPI_DEFINITION,
        "capability_id": None,
        "kpi_ref": "kpi-delivery-predictability",
        "title": "Delivery predictability",
        "related": ["CAP-SDM.DEF"],
        "body": (
            "Delivery predictability: the proportion of committed deliverables landing within "
            "their committed window, measured per quarter.\n\n"
            "Capabilities associated with this KPI: strategic decision making.\n\n"
            "Interpretation constraint. Capability movement on strategic decision making may be "
            "ASSOCIATED with movement in delivery predictability. It must never be reported as "
            "causing it. Delivery predictability responds to staffing, dependency stability, "
            "scope discipline and demand volatility, most of which no capability programme "
            "touches.\n\n"
            "Permitted phrasing: 'validated capability movement in strategic decision making "
            "coincided with a shift in delivery predictability over the same period, at this "
            "confidence, with these confounders noted.'\n\n"
            "Prohibited phrasing: any construction in which training, capability or the "
            "programme is the subject of a causal verb applied to this metric."
        ),
    },
    {
        "slug": "KPI.CYCLE-TIME",
        "kind": KnowledgeKind.KPI_DEFINITION,
        "capability_id": None,
        "kpi_ref": "kpi-cycle-time",
        "title": "Cross-functional cycle time",
        "related": ["CAP-SI.DEF"],
        "body": (
            "Cross-functional cycle time: median elapsed days from request raised to commitment "
            "secured, for work crossing a team boundary.\n\n"
            "Capabilities associated with this KPI: stakeholder influence.\n\n"
            "Interpretation constraint. This metric is unusually sensitive to organisational "
            "structure and to a small number of bottleneck individuals. A change following a "
            "capability intervention is weak evidence on its own; a reorganisation in the same "
            "period is a sufficient alternative explanation and must be recorded as a "
            "confounder.\n\n"
            "Association only. Never causal attribution."
        ),
    },
    {
        "slug": "KPI.FORECAST-ACCURACY",
        "kind": KnowledgeKind.KPI_DEFINITION,
        "capability_id": None,
        "kpi_ref": "kpi-forecast-accuracy",
        "title": "Forecast accuracy",
        "related": ["CAP-DS.DEF"],
        "body": (
            "Forecast accuracy: absolute percentage error between forecast and actual, by "
            "quarter and business unit.\n\n"
            "Capabilities associated with this KPI: data storytelling.\n\n"
            "Interpretation constraint. The association here is indirect and should be reported "
            "with correspondingly low confidence. Data storytelling affects whether a forecast's "
            "uncertainty is understood and acted on; it does not affect the underlying "
            "forecasting method. Improvement may equally reflect a model change, a market that "
            "became easier to predict, or a revision to the forecasting cadence.\n\n"
            "Association only. Never causal attribution."
        ),
    },
]


def _title(entry: dict) -> str:
    if entry.get("title"):
        return entry["title"]
    kind = entry["kind"].value.replace("_", " ")
    level = f" - {entry['level']}" if entry.get("level") else ""
    return f"{entry['slug']}: {kind}{level}"


async def main() -> None:
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    created = updated = unchanged = 0
    now = datetime.now(UTC)

    factory = get_session_factory()
    async with factory() as session:
        for entry in DOCUMENTS:
            existing = (
                await session.execute(
                    select(KnowledgeDocument).where(
                        KnowledgeDocument.tenant_id == TENANT,
                        KnowledgeDocument.slug == entry["slug"],
                    )
                )
            ).scalar_one_or_none()

            payload = dict(
                kind=entry["kind"],
                title=_title(entry),
                body=entry["body"].strip(),
                capability_id=entry.get("capability_id"),
                level=entry.get("level"),
                kpi_ref=entry.get("kpi_ref"),
                related_slugs=",".join(entry.get("related", [])),
                is_approved=True,
                approved_by=APPROVER,
                approved_at=now,
            )

            if existing is None:
                session.add(
                    KnowledgeDocument(
                        tenant_id=TENANT, slug=entry["slug"], revision=1, **payload
                    )
                )
                created += 1
                continue

            if existing.body != payload["body"]:
                existing.revision += 1
                updated += 1
            else:
                unchanged += 1
            for key, value in payload.items():
                setattr(existing, key, value)

        await session.commit()

    by_kind: dict[str, int] = {}
    for entry in DOCUMENTS:
        by_kind[entry["kind"].value] = by_kind.get(entry["kind"].value, 0) + 1

    print(f"Knowledge corpus seeded for tenant '{TENANT}'.")
    print(f"  created {created}, updated {updated}, unchanged {unchanged}")
    for kind, count in sorted(by_kind.items()):
        print(f"  {kind:24} {count}")
    print()
    print("All documents are marked approved. Only approved documents are indexed.")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
