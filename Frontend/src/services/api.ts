/**
 * Typed client for the Cognitive Mirror backend.
 *
 * Every request carries the Firebase ID token; the backend derives tenant and
 * subject from it. Nothing here sends a tenant_id — a client-supplied tenant
 * would be a trivial isolation bypass.
 */

import { auth } from "./firebase";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export type CapabilityLevel =
  | "novice"
  | "developing"
  | "competent"
  | "proficient"
  | "expert";

export type ConfidenceBand = "high" | "moderate" | "low" | "revalidation_due";

export const LEVEL_ORDER: CapabilityLevel[] = [
  "novice",
  "developing",
  "competent",
  "proficient",
  "expert",
];

export function levelIndex(level: CapabilityLevel): number {
  return LEVEL_ORDER.indexOf(level);
}

/** Percentage position of a level on the scale, for bar widths. */
export function levelPercent(level: CapabilityLevel): number {
  return (levelIndex(level) / (LEVEL_ORDER.length - 1)) * 100;
}

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
  /** True when support has fallen below attained. A prompt, not a downgrade. */
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

export type PendingEvidence = {
  evidence_id: string;
  learner_id: string;
  capability_id: string;
  title: string;
  context_ref: string;
  occurred_at: string;
  ai_summary: string;
  ai_strength: string | null;
  ai_confidence: number | null;
  concerns: string[];
  requires_human_review: boolean;
  /** False when the review came from the deterministic fallback, not a model. */
  ai_generated: boolean;
  /** Whether approved rubric text was in the reviewer's context. */
  grounded: boolean;
  /** Approved clause slugs the judgement rests on. Empty means ungrounded. */
  rubric_citations: string[];
};

// --- Approved knowledge ----------------------------------------------------

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
};

export type KnowledgeSummary = {
  slug: string;
  kind: string;
  title: string;
  level: string | null;
  capability_id: string | null;
  revision: number;
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

export type EvidenceReviewResult = {
  summary: string;
  strength: string;
  ai_confidence: number;
  concerns: string[];
  recommendation: string;
  requires_human_review: boolean;
  model_name: string;
  prompt_version: string;
  grounded: boolean;
  rubric_citations: string[];
  structured_method: string;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const user = auth.currentUser;
  if (!user) {
    throw new ApiError("Not signed in.", 401);
  }

  const token = await user.getIdToken();

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
  } catch {
    throw new ApiError(
      `Could not reach the backend at ${API_URL}. Start it with "npm run dev".`,
      0,
    );
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(body?.detail ?? response.statusText, response.status);
  }

  return response.json() as Promise<T>;
}

export function getMyCapabilityStates() {
  return request<CapabilityState[]>("/capabilities/me");
}

export function getLearnerCapabilityStates(learnerId: string) {
  return request<CapabilityState[]>(`/capabilities/learner/${learnerId}`);
}

export function getTeamAggregate() {
  return request<TeamAggregate[]>("/capabilities/team");
}

export function getPendingEvidence() {
  return request<PendingEvidence[]>("/evidence/pending");
}

export function getKnowledgeItem(slug: string) {
  return request<KnowledgeItem>(`/knowledge/${encodeURIComponent(slug)}`);
}

export function listKnowledge(capabilityId?: string) {
  const qs = capabilityId
    ? `?capability_id=${encodeURIComponent(capabilityId)}`
    : "";
  return request<KnowledgeSummary[]>(`/knowledge${qs}`);
}

export function getIndexStatus() {
  return request<IndexStatus>("/knowledge/status");
}

export function searchKnowledge(q: string, limit = 8) {
  return request<SearchHit[]>(
    `/knowledge/search?q=${encodeURIComponent(q)}&limit=${limit}`,
  );
}

export type EvidenceSubmission = {
  capability_id: string;
  evidence_type: string;
  title: string;
  content: string;
  context: string;
  context_ref: string;
};

export type EvidenceSubmitResult = {
  evidence_id: string;
  validation_status: string;
  review: EvidenceReviewResult;
  capability_state: CapabilityState;
};

export function submitEvidence(payload: EvidenceSubmission) {
  return request<EvidenceSubmitResult>("/evidence", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function validateEvidence(
  evidenceId: string,
  payload: {
    decision: "approved" | "needs_revision" | "rejected" | "escalated";
    strength: "weak" | "moderate" | "strong" | "exceptional";
    observed_in_work?: boolean;
    applied_independently?: boolean;
    feedback?: string;
  },
) {
  return request<CapabilityState>(`/evidence/${evidenceId}/validate`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// --- Display helpers -------------------------------------------------------

export function formatLevel(level: CapabilityLevel): string {
  return level.charAt(0).toUpperCase() + level.slice(1);
}

export const CONFIDENCE_BAND_LABEL: Record<ConfidenceBand, string> = {
  high: "High confidence",
  moderate: "Moderate confidence",
  low: "Low confidence",
  revalidation_due: "Revalidation due",
};

export const CONFIDENCE_BAND_TONE: Record<ConfidenceBand, string> = {
  high: "emerald",
  moderate: "indigo",
  low: "amber",
  revalidation_due: "rose",
};
