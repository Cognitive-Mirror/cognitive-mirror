/**
 * Typed client for the Cognitive Mirror backend.
 *
 * Every request carries the Firebase ID token - or, in demo mode, the chosen
 * demo persona (services/demo.ts). The backend derives the user, tenant and
 * role from that; nothing here sends a tenant or a role, because a
 * client-supplied one would be a trivial isolation bypass.
 */

import { activePersona, API_URL } from "./demo";
import { getFirebaseAuth } from "./firebase";
import type { RoleId } from "@/lib/auth";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const persona = activePersona();
  if (persona) return { "X-Demo-Persona-Email": persona };

  const auth = getFirebaseAuth();
  if (!auth) throw new ApiError("Not signed in.", 401);
  // On a page load Firebase restores the session asynchronously; reading
  // currentUser before it finishes reports "signed out" for a signed-in user.
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) throw new ApiError("Not signed in.", 401);
  return { Authorization: `Bearer ${await user.getIdToken()}` };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = await authHeaders();

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        ...headers,
        "Content-Type": "application/json",
      },
    });
  } catch {
    throw new ApiError(`Cannot reach the backend at ${API_URL}. Start it with "npm run dev".`, 0);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = body?.detail;
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((d: { msg?: string }) => d.msg ?? "Invalid input").join("; ")
          : response.statusText;
    throw new ApiError(message, response.status);
  }
  return response.json() as Promise<T>;
}

const post = <T>(path: string, body: unknown) =>
  request<T>(path, { method: "POST", body: JSON.stringify(body) });

const q = (value: string) => encodeURIComponent(value);

// --- Identity ------------------------------------------------------------------

export type Me = {
  id: string;
  email: string;
  display_name: string;
  role: RoleId;
  tenant_id: string;
};

export const getMe = () => request<Me>("/auth/me");

// --- Capability state ----------------------------------------------------------

export type CapabilityLevel = "novice" | "developing" | "competent" | "proficient" | "expert";
export type ConfidenceBand = "high" | "moderate" | "low" | "revalidation_due";
export type KnowingDoing =
  | "insufficient_data"
  | "knows_not_applied"
  | "aligned"
  | "applied_without_knowledge"
  | "developing";

export type CapabilityState = {
  capability_id: string;
  capability_name: string;
  capability_class: string;

  required_level: CapabilityLevel;
  required_level_source: string;
  required_level_provenance: string;

  /** Highest level ever validated. A historical fact; never falls on its own. */
  attained_level: CapabilityLevel;
  /** What present-day, decayed evidence supports. May be lower than attained. */
  current_support_level: CapabilityLevel;
  /** Support has fallen below attained: a prompt to revalidate, not a downgrade. */
  needs_revalidation: boolean;

  status: string;
  gap: number;
  state_confidence: number;
  confidence_band: ConfidenceBand;
  validated_points: number;
  provisional_points: number;
  independent_contexts: number;
  half_life_days: number;
  recommended_next_action: string;
  scoring_model_version: string;

  /** What the learner KNOWS (e-learns, assessments). Never feeds the level. */
  knowledge_mastery: number | null;
  knowledge_source: "post_assessment" | "knowledge_checks" | "pre_assessment" | "none";
  knowledge_pre: number | null;
  knowledge_post: number | null;
  /** Hake normalised gain, pre to post. */
  knowledge_gain: number | null;
  knowing_doing: KnowingDoing;
};

export type TeamAggregate = {
  capability_id: string;
  capability_name: string;
  subject_count: number;
  /** The headline: at-or-above required, validated, and above the confidence floor. */
  validated_coverage: number;
  nominal_coverage: number;
  median_level: CapabilityLevel | null;
  distribution: Record<string, number>;
  critical_gap_count: number;
  revalidation_due_count: number;
};

export const getMyCapabilityStates = () => request<CapabilityState[]>("/capabilities/me");
export const getTeamAggregate = () => request<TeamAggregate[]>("/capabilities/team");

export type TeamMember = {
  id: string;
  display_name: string;
  email: string;
  role_ref: string | null;
  program_ref: string | null;
  states: CapabilityState[];
};

export const getTeamMembers = () => request<TeamMember[]>("/capabilities/team/members");

export type AuditEvent = {
  id: string;
  occurred_at: string;
  kind: "evidence_submitted" | "manager_validation" | "assessment" | "decay" | "other";
  label: string;
  triggered_by: string;
  actor_name: string;
  reason: string;
  previous_level: CapabilityLevel;
  new_level: CapabilityLevel;
  previous_confidence: number;
  new_confidence: number;
  level_changed: boolean;
  /** Crossed the unvalidated ceiling: only manager validation can do this. */
  confidence_unlocked: boolean;
  scoring_model_version: string;
  evidence: { id: string; title: string; context_ref: string; artifact_count: number } | null;
  review: {
    strength: string;
    provenance: ReviewProvenance;
    grounded: boolean;
    citations: string[];
    verified_quotes: number;
  } | null;
  validation: {
    decision: string;
    strength: string;
    feedback: string;
    overrode_ai: boolean;
    manager_name: string;
  } | null;
};

export type AuditTrail = {
  subject_id: string;
  subject_name: string;
  capability_id: string;
  capability_name: string;
  unvalidated_ceiling: number;
  events: AuditEvent[];
};

export const getAuditTrail = (capabilityId: string, learnerId?: string) =>
  request<AuditTrail>(
    `/capabilities/${q(capabilityId)}/audit${learnerId ? `?learner_id=${q(learnerId)}` : ""}`,
  );

export type MatrixClause = {
  slug: string;
  kind: string;
  title: string;
  level: string | null;
  revision: number;
};

export type MatrixCapability = {
  id: string;
  slug: string;
  name: string;
  description: string;
  capability_class: string;
  base_half_life_days: number;
  linked_kpi_ids: string[];
  clauses: MatrixClause[];
  requirements: {
    source: string;
    precedence: number;
    required_level: CapabilityLevel;
    scope: string;
    set_by: string;
    rationale: string;
    effective_from: string;
  }[];
  coverage: {
    subject_count: number;
    validated_coverage: number;
    nominal_coverage: number;
    median_level: CapabilityLevel | null;
    distribution: Record<string, number>;
    critical_gap_count: number;
    revalidation_due_count: number;
  };
};

export type GovernanceMatrix = {
  approved_clause_count: number;
  clauses_by_kind: Record<string, number>;
  shared_clauses: MatrixClause[];
  capabilities: MatrixCapability[];
  resolution_order: string[];
  unvalidated_ceiling: number;
  coverage_confidence_floor: number;
  scoring_model_version: string;
};

export const getGovernanceMatrix = () => request<GovernanceMatrix>("/capabilities/matrix");

export type KnowledgeSummary = {
  slug: string;
  kind: string;
  title: string;
  level: string | null;
  capability_id: string | null;
  revision: number;
};

export const listKnowledge = (capabilityId?: string) =>
  request<KnowledgeSummary[]>(
    `/knowledge${capabilityId ? `?capability_id=${q(capabilityId)}` : ""}`,
  );

// --- Evidence ----------------------------------------------------------------------

export type EvidenceReview = {
  summary: string;
  strength: string;
  ai_confidence: number;
  concerns: string[];
  recommendation: string;
  requires_human_review: boolean;
  model_name: string;
  prompt_version: string;
  /** Whether approved rubric text was in the reviewer's context. */
  grounded: boolean;
  /** Approved clause slugs the judgement rests on. Empty means ungrounded. */
  rubric_citations: string[];
  structured_method: string;
  /** live_model | verified_cache | fallback. Always shown to the reader. */
  provenance: ReviewProvenance;
  /** Passages of the submission, located verbatim by the server. */
  verified_quotes: VerifiedQuote[];
  /** How each cited clause reached the reviewer. */
  citation_details: CitationDetail[];
};

export type ReviewProvenance = "live_model" | "verified_cache" | "fallback";

export type VerifiedQuote = {
  quote: string;
  start: number;
  end: number;
  /** The supplied clause this passage bears on, or "". */
  clause: string;
  note: string;
};

export type CitationDetail = {
  slug: string;
  /** Retrieval score; anchors are fetched by key and score 1.0. */
  score: number | null;
  anchor: boolean;
  via_graph: boolean;
  kind: string;
  level: string | null;
};

export type ArtifactKind = "github" | "docs" | "ticket" | "video" | "link";

export type Artifact = { url: string; kind: ArtifactKind; label: string };

export type PendingEvidence = {
  evidence_id: string;
  learner_id: string;
  learner_name: string;
  capability_id: string;
  title: string;
  content: string;
  context: string;
  context_ref: string;
  occurred_at: string;
  submitted_at: string | null;
  capability_name: string;
  artifacts: Artifact[];
  review: EvidenceReview | null;
  /** False when the deterministic fallback produced the review, not a model. */
  ai_generated: boolean;
};

export type MyEvidence = {
  evidence_id: string;
  capability_id: string;
  capability_name: string;
  title: string;
  content: string;
  context: string;
  context_ref: string;
  occurred_at: string;
  submitted_at: string;
  validation_status: "pending" | "validated" | "rejected" | "disputed" | "not_requested";
  artifacts: Artifact[];
  review: EvidenceReview | null;
  decision: {
    decision: string;
    strength: string;
    feedback: string;
    decided_at: string;
    overrode_ai: boolean;
  } | null;
};

export type EvidenceSubmission = {
  capability_id: string;
  evidence_type: string;
  title: string;
  content: string;
  context: string;
  context_ref: string;
  artifacts?: { url: string; label: string }[];
};

export type EvidenceSubmitResult = {
  evidence_id: string;
  validation_status: string;
  review: EvidenceReview;
  capability_state: CapabilityState;
};

export type EvidenceStrength = "weak" | "moderate" | "strong" | "exceptional";

export type ValidationDecision = {
  decision: "approved" | "needs_revision" | "rejected";
  strength: EvidenceStrength;
  observed_in_work?: boolean;
  applied_independently?: boolean;
  feedback?: string;
};

export const submitEvidence = (payload: EvidenceSubmission) =>
  post<EvidenceSubmitResult>("/evidence", payload);
export const getPendingEvidence = () => request<PendingEvidence[]>("/evidence/pending");
export const getMyEvidence = () => request<MyEvidence[]>("/evidence/mine");
export const validateEvidence = (evidenceId: string, payload: ValidationDecision) =>
  post<CapabilityState>(`/evidence/${q(evidenceId)}/validate`, payload);

// --- Approved knowledge -----------------------------------------------------------

export type KnowledgeItem = {
  slug: string;
  kind: string;
  title: string;
  body: string;
  level: string | null;
  capability_id: string | null;
  kpi_ref: string | null;
  revision: number;
  related: string[];
  capability_name: string | null;
  approved_at: string | null;
};

export type IndexStatus = {
  available: boolean;
  doc_count: number;
  edge_count: number;
  embedder: string;
  reranker: string;
  degraded: boolean;
  /** Fusion weights fitted to this corpus, or inherited defaults. */
  weights_calibrated: boolean;
  notes: string[];
};

export type SearchHit = {
  slug: string;
  kind: string;
  title: string;
  level: string | null;
  score: number;
  via_graph: boolean;
  excerpt: string;
};

export const getKnowledgeItem = (slug: string) => request<KnowledgeItem>(`/knowledge/${q(slug)}`);
export const getIndexStatus = () => request<IndexStatus>("/knowledge/status");
export const searchKnowledge = (text: string, limit = 8) =>
  request<SearchHit[]>(`/knowledge/search?q=${q(text)}&limit=${limit}`);

export type ArmScore = { rank: number; score: number };

export type DebugHit = {
  slug: string;
  kind: string;
  title: string;
  level: string | null;
  capability_id: string | null;
  fused_rank: number;
  fused_score: number;
  bm25: ArmScore | null;
  dense: ArmScore | null;
  via_graph: boolean;
  excerpt: string;
};

export type DebugSearch = {
  query: string;
  query_class: string;
  route_confidence: number;
  weights: { bm25: number; dense: number };
  embedder: string;
  reranker: string;
  reranked: boolean;
  early_exit: boolean;
  graph_added: string[];
  stage_ms: Record<string, number>;
  n_sparse: number;
  n_dense: number;
  corpus_docs: number;
  hits: DebugHit[];
};

export const debugSearch = (text: string, limit = 8) =>
  request<DebugSearch>(`/knowledge/search/debug?q=${q(text)}&limit=${limit}`);

// --- Learning journey ---------------------------------------------------------------

export type ItemType =
  | "single_choice"
  | "multi_choice"
  | "match"
  | "rank"
  | "categorize"
  | "short_answer"
  | "free_response";

export type Choice = { id: string; text: string };

/** An exercise as the learner sees it. The backend never sends answer keys. */
export type PublicItem = {
  id: string;
  position: number;
  /** Content section this exercise follows; -1 means after all content. */
  section: number;
  item_type: ItemType;
  dimension: "recall" | "understanding" | "judgement";
  prompt: string;
  points: number;
  payload: {
    options?: Choice[];
    items?: Choice[];
    left?: Choice[];
    right?: Choice[];
    buckets?: { id: string; label: string }[];
    placeholder?: string;
    min_words?: number;
    guidance?: string;
  };
};

export type ItemAnswer = Record<string, unknown>;

export type ActivitySummary = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  kind: "elearn" | "assessment" | "peer_activity" | "ai_practice";
  phase: "none" | "pre" | "post";
  capability_id: string;
  capability_name: string;
  sequence: number;
  estimated_minutes: number;
  item_count: number;
  available: boolean;
  available_from: string | null;
  attempts_used: number;
  max_attempts: number;
  first_score: number | null;
  latest_score: number | null;
  latest_status: string | null;
  pass_mark: number;
};

export type ActivityDetail = ActivitySummary & {
  sections: { heading: string; body: string }[];
  items: PublicItem[];
};

export type ItemResult = {
  item_id: string;
  response_id: string;
  /** 0..1, or null while an open answer is still being marked. */
  credit: number | null;
  scored_by: "deterministic" | "ai" | "human" | "pending" | "unscored";
  feedback: string;
  /** Teaching notes and the correct answer: e-learn checks only. */
  explanation: string;
  reveal: Record<string, unknown> | null;
  /** Open answers: key points credited and the verbatim quotes behind them. */
  ai_detail: OpenAnswerDetail | null;
};

export type OpenAnswerDetail = {
  met_key_points: number[];
  quotes: { key_point: number; quote: string; start: number; end: number }[];
  provenance: "live_model" | "verified_cache" | "none";
  answer_text: string;
};

export type AttemptResult = {
  attempt_id: string;
  activity_id: string;
  attempt_number: number;
  status: "in_progress" | "scoring" | "scored";
  score: number | null;
  points_earned: number;
  points_scored: number;
  points_possible: number;
  passed: boolean | null;
  pending_items: number;
  items: ItemResult[];
};

export type OpenAnswer = {
  response_id: string;
  learner_id: string;
  learner_name: string;
  activity_title: string;
  question: string;
  answer: string;
  key_points: string[];
  ai_note: string;
  submitted_at: string | null;
};

export const listActivities = () => request<ActivitySummary[]>("/learning/activities");
export const getActivity = (activityId: string) =>
  request<ActivityDetail>(`/learning/activities/${q(activityId)}`);
export const submitAttempt = (activityId: string, responses: Record<string, ItemAnswer>) =>
  post<AttemptResult>(`/learning/activities/${q(activityId)}/attempts`, { responses });
export const getAttempt = (attemptId: string) =>
  request<AttemptResult>(`/learning/attempts/${q(attemptId)}`);
export const getOpenAnswers = () => request<OpenAnswer[]>("/learning/review-queue");
export const markOpenAnswer = (responseId: string, credit: number, feedback: string) =>
  post<{ attempt_id: string; status: string; score: number | null }>(
    `/learning/responses/${q(responseId)}/score`,
    { credit, feedback },
  );

// --- Display helpers -----------------------------------------------------------------

const LEVELS: CapabilityLevel[] = ["novice", "developing", "competent", "proficient", "expert"];

/** Position of a level on the scale, 0-100, for bar widths. */
export const levelPercent = (level: CapabilityLevel) =>
  (LEVELS.indexOf(level) / (LEVELS.length - 1)) * 100;

export const formatLevel = (level: string) => level.charAt(0).toUpperCase() + level.slice(1);

export const percent = (value: number | null) =>
  value === null ? "—" : `${Math.round(value * 100)}%`;

export const CONFIDENCE_BAND_LABEL: Record<ConfidenceBand, string> = {
  high: "High confidence",
  moderate: "Moderate confidence",
  low: "Low confidence",
  revalidation_due: "Revalidation due",
};

export const KNOWING_DOING_LABEL: Record<KnowingDoing, string> = {
  insufficient_data: "Not enough data yet",
  knows_not_applied: "Knows it — not yet shown at work",
  aligned: "Knowledge and work agree",
  applied_without_knowledge: "Shown at work, knowledge scores low",
  developing: "Still building knowledge",
};
