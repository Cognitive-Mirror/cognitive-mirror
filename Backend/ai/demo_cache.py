"""Verified golden evaluations for the canonical demo inputs.

Why this exists
---------------
A client demo cannot depend on a third-party model endpoint being up, keyed and
fast at the moment the presenter clicks submit. For a small, fixed set of
canonical inputs - the "Fill realistic sample" texts and the seeded Apex
evidence - this module holds a pre-computed evaluation.

What keeps it honest
--------------------
* It is only consulted when demo mode is on (development only), and only for
  inputs that match a canonical sample exactly (after normalisation). Anything
  a presenter types themselves goes to the live model or the normal fallback.
* The live model is always tried first. The cache is the fallback.
* A cached evaluation is NOT trusted. It is fed through the same server-side
  verifiers as live model output: the evidence-review guardrails (fabricated
  citations stripped, quotes located verbatim or discarded, causal language
  flagged) and free-response quote verification (credit is arithmetic over
  verified quotes). tests/test_demo.py asserts every entry survives intact.
* Provenance is never hidden. Rows record model_name "demo-cache:golden-v1" and
  structured_method "golden_cache"; the UI labels them "Verified AI Evaluation"
  with a visible "pre-computed" note. The audit trail can always tell a cached
  evaluation from a live one (thesis 23).

Citations use only each capability's anchor clauses (DEF, RUBRIC.STRONG,
RUBRIC.INSUFFICIENT), which retrieval supplies by key on every review, so a
cached citation is never stripped for being absent from the prompt.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.scoring.items import normalise_text

CACHE_MODEL_NAME = "demo-cache:golden-v1"
CACHE_METHOD = "golden_cache"

SI = "stakeholder-influence"
SDM = "strategic-decision-making"
DS = "data-storytelling"


@dataclass(frozen=True)
class GoldenEvidence:
    key: str
    capability_slug: str
    title: str
    content: str
    context: str
    context_ref: str
    review: dict
    artifacts: tuple[dict, ...] = ()
    sample: str | None = None
    """'strong' | 'weak' when offered as a Fill-sample pill, else None (seed only)."""


@dataclass(frozen=True)
class GoldenFreeResponse:
    key: str
    question: str
    answer: str
    assessment: dict
    sample: str | None = None


def _review(
    *,
    summary: str,
    strength: str,
    confidence: float,
    citations: list[str],
    quotes: list[tuple[str, str, str]],
    recommendation: str,
    reasoning: str,
    concerns: list[str] | None = None,
) -> dict:
    return {
        "summary": summary,
        "evidence_type_detected": "workplace_application",
        "strength": strength,
        "confidence": confidence,
        "concerns": concerns or [],
        "recommendation": recommendation,
        "requires_human_review": True,
        "reasoning": reasoning,
        "rubric_citations": citations,
        "evidence_quotes": [
            {"quote": q, "rubric_citation": c, "note": n} for q, c, n in quotes
        ],
    }


# =============================================================================
# Workplace evidence
# =============================================================================

EVIDENCE: tuple[GoldenEvidence, ...] = (
    # --- Stakeholder influence: Fill-sample pills ------------------------------
    GoldenEvidence(
        key="si-sample-strong",
        capability_slug=SI,
        sample="strong",
        title="Moved the platform ops lead on the vendor consolidation",
        content=(
            "Our proposal to consolidate the two observability vendors was blocked by Ravi "
            "Iyer, the platform operations lead. He sits outside my reporting line and had "
            "told the steering group that 'my on-call team cannot absorb a migration this "
            "quarter'. Before the decision meeting I met him one-to-one and asked what a "
            "migration would actually cost his team. His real concern was alert noise during "
            "the cut-over, not the vendor itself. I changed the plan to a phased migration "
            "with his team choosing the cut-over week, and offered two of my engineers to run "
            "the parallel alerting for a fortnight. Ravi withdrew his objection in writing and "
            "spoke in favour at the steering group, which approved the consolidation. We still "
            "work closely; he asked me to help scope his next tooling change."
        ),
        context="Observability vendor consolidation, platform engineering steering group",
        context_ref="observability-consolidation",
        artifacts=(
            {"url": "https://apex.atlassian.net/browse/PLAT-2231", "label": "PLAT-2231 consolidation plan"},
            {"url": "https://docs.google.com/document/d/apex-observability-phasing", "label": "Phased migration plan"},
        ),
        review=_review(
            summary=(
                "A named stakeholder outside the learner's reporting line moved from a stated "
                "objection to public support after a one-to-one conversation and a concrete "
                "concession. No escalation to authority was involved."
            ),
            strength="strong",
            confidence=0.82,
            citations=["CAP-SI.RUBRIC.STRONG", "CAP-SI.DEF"],
            quotes=[
                ("He sits outside my reporting line", "CAP-SI.RUBRIC.STRONG",
                 "Criterion 1: stakeholder outside the reporting line."),
                ("my on-call team cannot absorb a migration this quarter", "CAP-SI.RUBRIC.STRONG",
                 "Criterion 2: a starting position that differed from what the learner needed."),
                ("I changed the plan to a phased migration with his team choosing the cut-over week",
                 "CAP-SI.RUBRIC.STRONG", "Criterion 3: the specific concession the learner made."),
                ("Ravi withdrew his objection in writing and spoke in favour at the steering group",
                 "CAP-SI.RUBRIC.STRONG", "Criterion 4: observable evidence the position moved."),
            ],
            recommendation=(
                "Validate if you can confirm the written withdrawal. Rate exceptional only if "
                "the ops lead's incentives genuinely conflicted with the proposal."
            ),
            reasoning=(
                "CAP-SI.RUBRIC.STRONG requires five elements; all five are present. CAP-SI.DEF "
                "excludes results obtained through escalation, and none is described here. The "
                "stakeholder is a peer, so the exceptional bar (senior or conflicting incentives) "
                "is not clearly met."
            ),
        ),
    ),
    GoldenEvidence(
        key="si-sample-weak",
        capability_slug=SI,
        sample="weak",
        title="Aligned stakeholders on the Q3 roadmap",
        content=(
            "This quarter I aligned all the key stakeholders on the Q3 platform roadmap. We held "
            "a productive kickoff meeting with product, security and operations, and everyone "
            "was on the same page by the end. I have strong relationships across these teams, "
            "which made it easy to get buy-in. Our director then confirmed the roadmap in the "
            "following leadership sync, so the plan went ahead as proposed and the team is now "
            "delivering against it."
        ),
        context="Q3 platform roadmap planning",
        context_ref="q3-roadmap",
        review=_review(
            summary=(
                "Describes a meeting where agreement was reached, but never establishes that any "
                "stakeholder held a different position, and final agreement came through the "
                "director."
            ),
            strength="weak",
            confidence=0.45,
            citations=["CAP-SI.RUBRIC.INSUFFICIENT", "CAP-SI.RUBRIC.STRONG"],
            quotes=[
                ("everyone was on the same page by the end", "CAP-SI.RUBRIC.INSUFFICIENT",
                 "'Aligned the stakeholders' with no account of what was misaligned."),
                ("I have strong relationships across these teams", "CAP-SI.RUBRIC.INSUFFICIENT",
                 "Relationship quality asserted with no instance."),
                ("Our director then confirmed the roadmap in the following leadership sync",
                 "CAP-SI.RUBRIC.INSUFFICIENT", "The operative mechanism reads as escalation to authority."),
            ],
            concerns=[
                "No stakeholder's starting position is described, so no movement can be judged.",
                "The decision was confirmed by the director, which the rubric treats as escalation.",
            ],
            recommendation=(
                "Ask for a revision: name one stakeholder who disagreed, what they wanted, and "
                "what the learner personally did to change it."
            ),
            reasoning=(
                "CAP-SI.RUBRIC.INSUFFICIENT names this pattern directly: a well-written account of "
                "a successful meeting that never establishes anyone disagreed. Elements 2, 3 and 5 "
                "of CAP-SI.RUBRIC.STRONG are missing."
            ),
        ),
    ),
    # --- Stakeholder influence: seeded history ----------------------------------
    GoldenEvidence(
        key="si-priya-sso",
        capability_slug=SI,
        title="Got security to accept a staged rollout for the SSO change",
        content=(
            "The security architect, Mei Tan, had vetoed our single sign-on change because she "
            "wanted every service migrated at once to avoid a mixed estate. I do not manage "
            "anyone in security. I asked her which risk worried her most and it was session "
            "tokens living in two systems. I proposed a staged rollout that retired the old "
            "token store first, and showed her the dependency map we would migrate against. She "
            "agreed to the staged plan and signed off the first two services. The rest of the "
            "rollout is still being scheduled."
        ),
        context="SSO migration, identity platform",
        context_ref="sso-migration",
        artifacts=(
            {"url": "https://github.com/apex-systems/identity-platform/pull/412", "label": "Token store retirement PR"},
        ),
        review=_review(
            summary=(
                "A security architect outside the learner's line moved from a veto to a staged "
                "plan after the learner surfaced her underlying risk and reshaped the proposal."
            ),
            strength="strong",
            confidence=0.74,
            citations=["CAP-SI.RUBRIC.STRONG", "CAP-SI.DEF"],
            quotes=[
                ("had vetoed our single sign-on change", "CAP-SI.RUBRIC.STRONG",
                 "Criterion 2: a starting position opposed to what was needed."),
                ("I asked her which risk worried her most", "CAP-SI.RUBRIC.STRONG",
                 "Criterion 3: the learner's specific action."),
                ("She agreed to the staged plan and signed off the first two services",
                 "CAP-SI.RUBRIC.STRONG", "Criterion 4: a commitment secured."),
            ],
            concerns=[
                "The outcome covers the first two services only; the rest of the rollout is not yet evidenced.",
            ],
            recommendation="Validate; ask for the remaining rollout as follow-up evidence.",
            reasoning=(
                "Meets CAP-SI.RUBRIC.STRONG elements 1-5, with element 4 partial. CAP-SI.DEF is "
                "satisfied: influence without authority, no escalation."
            ),
        ),
    ),
    GoldenEvidence(
        key="si-priya-freeze",
        capability_slug=SI,
        title="Pre-wired the release freeze exception with the head of QA",
        content=(
            "I needed a release freeze exception for the billing hotfix, and the head of QA, "
            "Tomas Berg, had refused two similar requests this year. He does not report to me or "
            "to my manager. Instead of raising it at the change board, I met Tomas the day before "
            "and asked what had gone wrong with the earlier exceptions. Both had shipped without a "
            "rollback rehearsal. I offered to run a rehearsal in staging with his team watching "
            "and to hold the deploy if it failed. Tomas agreed, the rehearsal passed, and he "
            "presented the exception to the change board himself. It was approved without debate "
            "and he has since used the same rehearsal checklist for another team."
        ),
        context="Billing hotfix, change advisory board",
        context_ref="billing-hotfix-freeze",
        artifacts=(
            {"url": "https://github.com/apex-systems/billing-service/pull/1187", "label": "Billing hotfix PR"},
            {"url": "https://www.loom.com/share/apex-rollback-rehearsal", "label": "Rollback rehearsal recording"},
            {"url": "https://apex.atlassian.net/browse/CAB-318", "label": "CAB-318 freeze exception"},
        ),
        review=_review(
            summary=(
                "The head of QA, outside the learner's reporting line and with a record of refusing "
                "such requests, moved to sponsoring the exception after a pre-meeting and a "
                "concrete safeguard."
            ),
            strength="strong",
            confidence=0.84,
            citations=["CAP-SI.RUBRIC.STRONG", "CAP-SI.DEF"],
            quotes=[
                ("had refused two similar requests this year", "CAP-SI.RUBRIC.STRONG",
                 "Criterion 2: a starting position against the learner's need."),
                ("He does not report to me or to my manager", "CAP-SI.RUBRIC.STRONG",
                 "Criterion 1: outside the reporting line."),
                ("I offered to run a rehearsal in staging with his team watching",
                 "CAP-SI.RUBRIC.STRONG", "Criterion 3: the specific concession."),
                ("he presented the exception to the change board himself", "CAP-SI.RUBRIC.STRONG",
                 "Criterion 4: the stakeholder's position visibly moved."),
            ],
            recommendation=(
                "Validate. The repeat use of the checklist suggests the relationship held; confirm "
                "with QA if you did not observe it."
            ),
            reasoning=(
                "All five CAP-SI.RUBRIC.STRONG elements are present and no escalation occurred, as "
                "CAP-SI.DEF requires. Evidence that the stakeholder later reused the approach "
                "supports that the relationship survived."
            ),
        ),
    ),
    GoldenEvidence(
        key="si-marcus-supplier",
        capability_slug=SI,
        title="Brought procurement and engineering to one supplier decision",
        content=(
            "Procurement wanted the cheaper sensor supplier and our hardware lead wanted the "
            "incumbent; the VP of Operations had sided with procurement in writing. I had no "
            "authority over either team. I spent a week with each side establishing what they "
            "were measured on: procurement on unit cost, hardware on field failure rate. I built "
            "a joint cost model that priced field failures into unit cost, and walked the VP "
            "through it before the review. The VP reversed the earlier decision, procurement "
            "co-signed the incumbent contract with a price review clause, and the hardware lead "
            "and procurement manager now run the quarterly supplier review together."
        ),
        context="Sensor supplier selection, operations review",
        context_ref="sensor-supplier-2025",
        review=_review(
            summary=(
                "Influence upward on a senior stakeholder whose written position conflicted with "
                "the outcome, through framing in each party's own measures, with both teams now "
                "working jointly."
            ),
            strength="exceptional",
            confidence=0.86,
            citations=["CAP-SI.RUBRIC.STRONG", "CAP-SI.DEF"],
            quotes=[
                ("the VP of Operations had sided with procurement in writing", "CAP-SI.RUBRIC.STRONG",
                 "A senior stakeholder with a documented opposing position."),
                ("I had no authority over either team", "CAP-SI.DEF",
                 "Influence without authority, as the definition requires."),
                ("establishing what they were measured on", "CAP-SI.RUBRIC.STRONG",
                 "Criterion 3: framing in the stakeholders' own terms."),
                ("The VP reversed the earlier decision", "CAP-SI.RUBRIC.STRONG",
                 "Criterion 4: the position moved."),
            ],
            recommendation="Validate at exceptional if you can confirm the VP's original written position.",
            reasoning=(
                "CAP-SI.RUBRIC.STRONG's exceptional clause applies: the stakeholder was senior, the "
                "incentives conflicted, and the working relationship between the parties improved."
            ),
        ),
    ),
    GoldenEvidence(
        key="si-marcus-account",
        capability_slug=SI,
        title="Re-engaged the customer CTO after the outage escalation",
        content=(
            "After the March outage, the customer's CTO refused further roadmap calls with us and "
            "asked our CEO to replace the account team. I was asked to recover the relationship "
            "without offering credits, which sales had already ruled out. I requested thirty "
            "minutes to walk her through the incident timeline, conceded the two failures that "
            "were ours, and proposed a joint reliability review with her engineers in the room. "
            "She accepted, attended the first review personally, and reinstated the monthly "
            "roadmap call. The account renewed on its original terms and she later invited me to "
            "present at her engineering leadership offsite."
        ),
        context="Strategic account recovery after outage",
        context_ref="account-recovery-orion",
        review=_review(
            summary=(
                "Re-engaged a senior external stakeholder who had refused contact, without the "
                "leverage of credits, and restored the working relationship."
            ),
            strength="exceptional",
            confidence=0.85,
            citations=["CAP-SI.RUBRIC.STRONG", "CAP-SI.DEF"],
            quotes=[
                ("refused further roadmap calls with us", "CAP-SI.RUBRIC.STRONG",
                 "A starting position fully opposed to engagement."),
                ("conceded the two failures that were ours", "CAP-SI.RUBRIC.STRONG",
                 "Criterion 3: a specific concession."),
                ("reinstated the monthly roadmap call", "CAP-SI.RUBRIC.STRONG",
                 "Criterion 4: a concrete commitment."),
            ],
            recommendation="Validate at exceptional; the stakeholder was senior and had disengaged.",
            reasoning=(
                "Matches the exceptional clause of CAP-SI.RUBRIC.STRONG: senior stakeholder, no "
                "leverage, relationship intact afterwards."
            ),
        ),
    ),
    # --- Strategic decision making ---------------------------------------------
    GoldenEvidence(
        key="sdm-sample-strong",
        capability_slug=SDM,
        sample="strong",
        title="Picked the redundancy design for the ground station",
        content=(
            "For the new ground station I had to choose between active-active redundancy and a "
            "cheaper warm standby. Active-active cost 30% more but cut failover from minutes to "
            "seconds; warm standby met the contract's availability clause on paper. I chose warm "
            "standby, recorded that we were giving up sub-minute failover, and stated the "
            "assumption that customer passes stay under four per hour. I told the customer's "
            "operations lead before the design review rather than after. Three months in, pass "
            "volume is at three per hour, availability is 99.95%, and the design review accepted "
            "the decision record unchanged."
        ),
        context="Ground station architecture, design review",
        context_ref="ground-station-redundancy",
        artifacts=(
            {"url": "https://docs.google.com/document/d/apex-ground-station-adr", "label": "ADR-014 redundancy"},
        ),
        review=_review(
            summary=(
                "A real architectural choice with two fairly stated alternatives, an explicit cost, "
                "a named assumption and an observable consequence."
            ),
            strength="strong",
            confidence=0.83,
            citations=["CAP-SDM.RUBRIC.STRONG", "CAP-SDM.DEF"],
            quotes=[
                ("I had to choose between active-active redundancy and a cheaper warm standby",
                 "CAP-SDM.RUBRIC.STRONG", "Criteria 1-2: a real decision between stated alternatives."),
                ("recorded that we were giving up sub-minute failover", "CAP-SDM.DEF",
                 "States what the choice cost."),
                ("stated the assumption that customer passes stay under four per hour",
                 "CAP-SDM.RUBRIC.STRONG", "Criterion 4: the assumption, named by the learner."),
                ("I told the customer's operations lead before the design review rather than after",
                 "CAP-SDM.RUBRIC.STRONG", "Criterion 5: who was affected, informed in advance."),
            ],
            recommendation="Validate. Exceptional would need the decision revisited on new information.",
            reasoning=(
                "All five CAP-SDM.RUBRIC.STRONG elements are present. CAP-SDM.DEF's marker - can the "
                "person state what they gave up - is met explicitly."
            ),
        ),
    ),
    GoldenEvidence(
        key="sdm-sample-weak",
        capability_slug=SDM,
        sample="weak",
        title="Built the capacity planning model",
        content=(
            "I built a detailed capacity planning model for the integration lab covering staffing, "
            "rig utilisation and shift patterns for the next two quarters. The model has twelve "
            "scenarios and a sensitivity analysis on every input. We decided as a team to go with "
            "the recommended scenario, and the leadership team said it was a really strong piece "
            "of work. It went well and the lab is running smoothly."
        ),
        context="Integration lab capacity planning",
        context_ref="lab-capacity-plan",
        review=_review(
            summary=(
                "Thorough analysis, but no individual choice, no trade-off and no observable "
                "outcome are described."
            ),
            strength="weak",
            confidence=0.45,
            citations=["CAP-SDM.RUBRIC.INSUFFICIENT", "CAP-SDM.DEF"],
            quotes=[
                ("I built a detailed capacity planning model", "CAP-SDM.RUBRIC.INSUFFICIENT",
                 "A description of analysis with no choice made."),
                ("We decided as a team to go with the recommended scenario", "CAP-SDM.RUBRIC.INSUFFICIENT",
                 "First person plural with no separable individual action."),
                ("It went well and the lab is running smoothly", "CAP-SDM.RUBRIC.INSUFFICIENT",
                 "Outcome asserted without an observable marker."),
            ],
            concerns=[
                "No alternative is named, so no trade-off can be assessed.",
                "The learner's personal decision is not separable from the team's.",
            ],
            recommendation=(
                "Request a revision: which scenario was rejected, what choosing this one cost, "
                "and what has measurably happened since."
            ),
            reasoning=(
                "CAP-SDM.DEF distinguishes analysis from deciding. Three patterns listed in "
                "CAP-SDM.RUBRIC.INSUFFICIENT are present."
            ),
        ),
    ),
    GoldenEvidence(
        key="sdm-elena-firmware",
        capability_slug=SDM,
        title="Chose to delay the radar firmware release",
        content=(
            "I owned the go/no-go call on the radar firmware 4.0 release. The options were "
            "shipping on the committed date with a known calibration drift in cold conditions, or "
            "slipping three weeks to fix it. I wrote both options up fairly: shipping kept a "
            "customer milestone and its contract payment on schedule; slipping removed a "
            "field-failure risk we estimated at one in twenty units in winter deployments. I "
            "recommended slipping and stated that I would reverse if the cold-chamber tests came "
            "back clean within five days. They did not, so we slipped. The customer accepted the "
            "new date after I briefed their programme manager, and no cold-weather field returns "
            "have been logged since the release."
        ),
        context="Radar firmware 4.0 go/no-go",
        context_ref="radar-fw-4",
        artifacts=(
            {"url": "https://apex.atlassian.net/browse/RDR-904", "label": "RDR-904 go/no-go record"},
        ),
        review=_review(
            summary=(
                "A consequential release decision with both options stated fairly, an explicit "
                "reversal condition, and the condition actually tested before committing."
            ),
            strength="exceptional",
            confidence=0.86,
            citations=["CAP-SDM.RUBRIC.STRONG", "CAP-SDM.DEF"],
            quotes=[
                ("The options were shipping on the committed date with a known calibration drift in cold conditions",
                 "CAP-SDM.RUBRIC.STRONG", "Criterion 2: alternatives stated fairly."),
                ("stated that I would reverse if the cold-chamber tests came back clean within five days",
                 "CAP-SDM.DEF", "Names the information that would reverse the decision."),
                ("The customer accepted the new date after I briefed their programme manager",
                 "CAP-SDM.RUBRIC.STRONG", "Criterion 5: an observable consequence."),
            ],
            recommendation="Validate at exceptional: the decision was revisited against new information.",
            reasoning=(
                "CAP-SDM.RUBRIC.STRONG's exceptional clause applies: the decision was explicitly "
                "revisited on new information before it was finalised."
            ),
        ),
    ),
    GoldenEvidence(
        key="sdm-elena-rig",
        capability_slug=SDM,
        title="Narrowed the test-rig investment to one site",
        content=(
            "Finance gave us budget for one new hardware-in-the-loop test rig, and both the Pune "
            "and Bristol teams made a case for it. I compared queue times, utilisation and the "
            "programmes each site would unblock, and chose Bristol because its queue was blocking "
            "two certification milestones, assuming those certification dates held. I recorded "
            "that Pune would carry a six-week queue for another quarter and agreed a shared "
            "booking slot as mitigation. Pune's lead disagreed but accepted the reasoning once she "
            "saw the queue data. Bristol's certification tests started on time."
        ),
        context="Test-rig capital allocation",
        context_ref="hil-rig-allocation",
        review=_review(
            summary=(
                "A capital allocation between two credible alternatives, with the cost to the "
                "losing site recorded, a named assumption and a mitigation."
            ),
            strength="strong",
            confidence=0.8,
            citations=["CAP-SDM.RUBRIC.STRONG", "CAP-SDM.DEF"],
            quotes=[
                ("chose Bristol because its queue was blocking two certification milestones",
                 "CAP-SDM.RUBRIC.STRONG", "Criterion 1: a real decision with a real cost."),
                ("I recorded that Pune would carry a six-week queue for another quarter",
                 "CAP-SDM.DEF", "States what the choice gave up."),
                ("Bristol's certification tests started on time", "CAP-SDM.RUBRIC.STRONG",
                 "Criterion 5: an observable consequence."),
            ],
            recommendation="Validate at strong.",
            reasoning="All five CAP-SDM.RUBRIC.STRONG elements are present.",
        ),
    ),
    GoldenEvidence(
        key="sdm-elena-pipeline",
        capability_slug=SDM,
        title="Held the architecture decision under board pressure",
        content=(
            "Two board members pushed us to replace our in-house flight data pipeline with a "
            "vendor platform after a competitor announced one. I led the evaluation and "
            "recommended keeping our pipeline for another 18 months, because the vendor could not "
            "meet our export-control constraints and migration would stall two programmes. I "
            "named the assumption that would change my mind: if the vendor achieved ITAR "
            "certification, the cost case flips. I presented this to the board with the trade-off "
            "stated, held the recommendation through two rounds of challenge, and the board "
            "accepted it with a review in six months. At that review the vendor still lacked "
            "certification and the decision stood."
        ),
        context="Flight data pipeline build-vs-buy",
        context_ref="flight-data-pipeline",
        review=_review(
            summary=(
                "A build-versus-buy recommendation held under substantive senior pressure, with "
                "the reversal condition named and later checked."
            ),
            strength="exceptional",
            confidence=0.87,
            citations=["CAP-SDM.RUBRIC.STRONG", "CAP-SDM.DEF"],
            quotes=[
                ("named the assumption that would change my mind", "CAP-SDM.RUBRIC.STRONG",
                 "Criterion 4: the uncertainty named by the learner."),
                ("held the recommendation through two rounds of challenge", "CAP-SDM.RUBRIC.STRONG",
                 "Exceptional clause: held under substantive pressure."),
                ("the board accepted it with a review in six months", "CAP-SDM.RUBRIC.STRONG",
                 "Criterion 5: an observable consequence."),
            ],
            recommendation="Validate at exceptional.",
            reasoning=(
                "The exceptional clause of CAP-SDM.RUBRIC.STRONG applies: reasoning held under "
                "pressure and survived challenge, with a named reversal condition per CAP-SDM.DEF."
            ),
        ),
    ),
    # --- Data storytelling ------------------------------------------------------
    GoldenEvidence(
        key="ds-sample-strong",
        capability_slug=DS,
        sample="strong",
        title="Turned the reliability analysis into a fleet decision",
        content=(
            "The fleet director had to decide whether to ground the older drone batch ahead of "
            "the summer season. My analysis covered failure logs for 1,200 flights, but I led the "
            "briefing with the decision: ground batch B for motor replacement, keep batch A "
            "flying. I left the regression detail in the appendix and stated the uncertainty as a "
            "condition: the recommendation holds unless summer temperatures exceed the 35-degree "
            "band where our data is thin. The director grounded batch B that afternoon and asked "
            "for a monthly temperature check against that band. When challenged on the failure "
            "rate by the operations manager, I walked him through the underlying logs."
        ),
        context="Drone fleet readiness briefing",
        context_ref="fleet-readiness-summer",
        artifacts=(
            {"url": "https://docs.google.com/presentation/d/apex-fleet-readiness", "label": "Fleet readiness brief"},
        ),
        review=_review(
            summary=(
                "Led with the decision, held method in reserve, stated uncertainty as a condition, "
                "and the audience acted the same day."
            ),
            strength="strong",
            confidence=0.82,
            citations=["CAP-DS.RUBRIC.STRONG", "CAP-DS.DEF"],
            quotes=[
                ("I led the briefing with the decision", "CAP-DS.RUBRIC.STRONG",
                 "Criterion 2: what the learner chose to lead with."),
                ("I left the regression detail in the appendix", "CAP-DS.RUBRIC.STRONG",
                 "Criterion 2: what was left out."),
                ("the recommendation holds unless summer temperatures exceed the 35-degree band where our data is thin",
                 "CAP-DS.RUBRIC.STRONG", "Criterion 3: uncertainty as a condition on the decision."),
                ("The director grounded batch B that afternoon", "CAP-DS.RUBRIC.STRONG",
                 "Criterion 4: the audience could act."),
            ],
            recommendation="Validate at strong.",
            reasoning=(
                "All five CAP-DS.RUBRIC.STRONG elements are present; CAP-DS.DEF's observable unit, "
                "a decision made by someone else on the communication, is met."
            ),
        ),
    ),
    GoldenEvidence(
        key="ds-sample-weak",
        capability_slug=DS,
        sample="weak",
        title="Built the reliability dashboard",
        content=(
            "I built a new reliability dashboard in Grafana that pulls failure data from all three "
            "fleets and shows twenty-two metrics with drill-downs by component. I presented it to "
            "leadership in the monthly review and everyone found it really clear. The dashboard is "
            "now available to the whole engineering organisation and has a lot of views."
        ),
        context="Monthly engineering review",
        context_ref="reliability-dashboard",
        artifacts=(
            {"url": "https://grafana.apex.internal/d/fleet-reliability", "label": "Grafana dashboard"},
        ),
        review=_review(
            summary=(
                "A genuinely useful artefact, but no audience decision and no learner choice about "
                "what to lead with are described."
            ),
            strength="weak",
            confidence=0.45,
            citations=["CAP-DS.RUBRIC.INSUFFICIENT", "CAP-DS.RUBRIC.STRONG"],
            quotes=[
                ("shows twenty-two metrics with drill-downs by component", "CAP-DS.RUBRIC.INSUFFICIENT",
                 "An artefact with no audience decision attached."),
                ("I presented it to leadership in the monthly review and everyone found it really clear",
                 "CAP-DS.RUBRIC.INSUFFICIENT", "Clarity claimed with no observable consequence."),
            ],
            concerns=["No decision or reaction from the audience is recorded."],
            recommendation=(
                "Ask which decision the dashboard informed, who made it, and what the learner "
                "chose to lead with."
            ),
            reasoning=(
                "CAP-DS.RUBRIC.INSUFFICIENT: 'An artefact with no audience' and 'a claim that the "
                "audience found it clear, with no observable consequence'."
            ),
        ),
    ),
)


# =============================================================================
# Free-response answers
# =============================================================================

ELEARN_OPEN_QUESTION = (
    "Your proposal to consolidate two vendor contracts is opposed by the regional "
    "ops lead. They have no formal authority over the decision, but their team runs "
    "the vendor day to day. Describe what you would do before the decision meeting, "
    "and why."
)

POST_OPEN_QUESTION = (
    "The finance director is blocking your proposal to move monthly programme reporting to a "
    "self-serve dashboard. She does not report to you and has told the steering group: \"My "
    "team can't absorb another tool this quarter.\" Describe what you would do before the "
    "steering group meets, and why."
)

POST_OPEN_KEY_POINTS = [
    "Meets the finance director one-to-one before the steering group, rather than contesting the objection in the meeting",
    "Separates her stated position from the underlying interest, such as her team's capacity this quarter",
    "Offers a concrete adjustment that addresses that interest, such as phasing, a pilot, or support for her team",
    "Secures a specific commitment and confirms what she will say at the steering group",
]

POST_OPEN_MODEL_ANSWER = (
    "I would meet her privately before the steering group and ask what 'another tool' would "
    "cost her team - most likely capacity during quarter-end. I would offer a pilot with one "
    "programme after the close, with my team building the first reports, and agree what she "
    "will say at the steering group so the meeting ratifies the pilot."
)


def _judged(*quotes: str | None) -> list[dict]:
    return [
        {"index": i, "met": q is not None, "quote": q or ""} for i, q in enumerate(quotes)
    ]


FREE_RESPONSES: tuple[GoldenFreeResponse, ...] = (
    GoldenFreeResponse(
        key="elearn-open-strong",
        question=ELEARN_OPEN_QUESTION,
        sample="strong",
        answer=(
            "Before the decision meeting I would meet the regional ops lead one-to-one, rather "
            "than letting the objection surface in the room. I would ask what worries them about "
            "consolidating, since their team runs the vendor day to day; most likely it is "
            "disruption to service quality during the switch. Even though they have no formal "
            "authority, the decision-maker will listen to the person whose team lives with the "
            "vendor, so their opposition could stall the decision. I would adjust the proposal to "
            "a phased transition with their team choosing the cut-over date, and check they could "
            "support that version before the meeting."
        ),
        assessment={
            "judgements": _judged(
                "I would meet the regional ops lead one-to-one, rather than letting the objection surface in the room",
                "most likely it is disruption to service quality during the switch",
                "adjust the proposal to a phased transition with their team choosing the cut-over date",
                "Even though they have no formal authority, the decision-maker will listen to the person whose team lives with the vendor",
            ),
            "feedback": (
                "Strong answer: you separate the private conversation from the meeting, name the "
                "interest behind the objection, and change the proposal to meet it. You also see "
                "that informal influence can stall a decision the ops lead does not own."
            ),
            "confidence": 0.86,
            "key_points_insufficient": False,
            "concerns": [],
        },
    ),
    GoldenFreeResponse(
        key="elearn-open-weak",
        question=ELEARN_OPEN_QUESTION,
        sample="weak",
        answer=(
            "I would explain the business case for consolidation clearly in the decision meeting "
            "and show the cost savings. If the ops lead still objects, I would escalate to the "
            "COO, since the ops lead has no formal authority over the decision and the COO owns "
            "it. The numbers should speak for themselves."
        ),
        assessment={
            "judgements": _judged(None, None, None, None),
            "feedback": (
                "This argues the case in the meeting and plans to escalate, so none of the key "
                "points are met. Try meeting the ops lead beforehand, asking what worries their "
                "team, and adjusting the proposal - their informal influence can stall the decision "
                "even without formal authority."
            ),
            "confidence": 0.84,
            "key_points_insufficient": False,
            "concerns": [],
        },
    ),
    GoldenFreeResponse(
        key="post-open-strong",
        question=POST_OPEN_QUESTION,
        sample="strong",
        answer=(
            "I would meet the finance director one-to-one a few days before the steering group "
            "instead of debating it in the room. Her position is that her team can't take on a "
            "tool, but the interest underneath is capacity during the quarter-end close, so I "
            "would ask which weeks are hardest. I would offer a pilot with one programme after "
            "quarter-end, with my analyst building the first reports for her team. Before the "
            "meeting I would confirm she supports the pilot and agree what she will say to the "
            "steering group, so the meeting ratifies it."
        ),
        assessment={
            "judgements": _judged(
                "I would meet the finance director one-to-one a few days before the steering group instead of debating it in the room",
                "the interest underneath is capacity during the quarter-end close",
                "I would offer a pilot with one programme after quarter-end, with my analyst building the first reports for her team",
                "confirm she supports the pilot and agree what she will say to the steering group",
            ),
            "feedback": (
                "Every key point is covered: the private conversation, the interest behind her "
                "position, a concrete pilot that protects her team's capacity, and a confirmed "
                "commitment before the meeting."
            ),
            "confidence": 0.88,
            "key_points_insufficient": False,
            "concerns": [],
        },
    ),
    GoldenFreeResponse(
        key="post-open-weak",
        question=POST_OPEN_QUESTION,
        sample="weak",
        answer=(
            "I would put the dashboard on the steering group agenda and present the efficiency "
            "case to everyone. I understand her team's capacity is stretched this quarter, but "
            "the long-term savings outweigh a short disruption. If she still blocks it, the "
            "steering group chair can make the final call."
        ),
        assessment={
            "judgements": _judged(
                None,
                "her team's capacity is stretched this quarter",
                None,
                None,
            ),
            "feedback": (
                "You recognise the capacity concern behind her position, which is the right "
                "starting point. But the plan contests it in the meeting and hands the decision to "
                "the chair, rather than adjusting the proposal and securing her support first."
            ),
            "confidence": 0.82,
            "key_points_insufficient": False,
            "concerns": [],
        },
    ),
)


# --- Lookup ----------------------------------------------------------------------

_EVIDENCE_BY_TEXT = {normalise_text(e.content): e for e in EVIDENCE}
_FREE_BY_TEXT = {
    (normalise_text(f.question), normalise_text(f.answer)): f for f in FREE_RESPONSES
}
EVIDENCE_BY_KEY = {e.key: e for e in EVIDENCE}
FREE_BY_KEY = {f.key: f for f in FREE_RESPONSES}


def lookup_evidence(content: str) -> GoldenEvidence | None:
    """The golden entry for a canonical evidence text, if this is one."""
    return _EVIDENCE_BY_TEXT.get(normalise_text(content))


def lookup_free_response(question: str, answer: str) -> GoldenFreeResponse | None:
    return _FREE_BY_TEXT.get((normalise_text(question), normalise_text(answer)))


@dataclass
class SampleSet:
    evidence: list[dict] = field(default_factory=list)
    free_response: list[dict] = field(default_factory=list)


def samples() -> SampleSet:
    """The Fill-sample texts the presenter UI offers. Single source of truth."""
    out = SampleSet()
    for e in EVIDENCE:
        if e.sample:
            out.evidence.append({
                "key": e.key,
                "capability_slug": e.capability_slug,
                "strength": e.sample,
                "title": e.title,
                "content": e.content,
                "context": e.context,
                "context_ref": e.context_ref,
                "artifacts": [dict(a) for a in e.artifacts],
            })
    for f in FREE_RESPONSES:
        if f.sample:
            out.free_response.append({
                "key": f.key,
                "question": f.question,
                "strength": f.sample,
                "answer": f.answer,
            })
    return out


__all__ = [
    "CACHE_METHOD",
    "CACHE_MODEL_NAME",
    "ELEARN_OPEN_QUESTION",
    "EVIDENCE",
    "EVIDENCE_BY_KEY",
    "FREE_BY_KEY",
    "FREE_RESPONSES",
    "GoldenEvidence",
    "GoldenFreeResponse",
    "POST_OPEN_KEY_POINTS",
    "POST_OPEN_MODEL_ANSWER",
    "POST_OPEN_QUESTION",
    "lookup_evidence",
    "lookup_free_response",
    "samples",
]
