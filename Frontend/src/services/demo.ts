/**
 * Demo mode: persona switching, reset, and presenter samples.
 *
 * A demo persona replaces the Firebase session: requests carry
 * `X-Demo-Persona-Email` instead of a token. The backend honours it only when
 * DEMO_MODE is on (development only) and only for users of the demo tenant, so
 * nothing here can act as a real person.
 *
 * The chosen persona is a per-browser convenience kept in localStorage, and
 * every read and write is guarded: private windows and blocked storage simply
 * mean no persona is remembered.
 */

import { clearSession } from "./session";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8100";

const STORAGE_KEY = "cm.demoPersona";
export const PERSONA_EVENT = "cm:persona";
export const RESET_EVENT = "cm:demo-reset";

export type DemoRole = "learner" | "manager" | "admin";

export type PersonaSummary = {
  capability_name: string;
  attained_level: string;
  current_support_level: string;
  state_confidence: number;
  confidence_band: string;
  knowledge_mastery: number | null;
  knowing_doing: string;
  provisional_points: number;
  validated_points: number;
};

export type DemoPersona = {
  key: string;
  email: string;
  display_name: string;
  role: DemoRole;
  title: string;
  archetype: string;
  headline: string;
  summary: PersonaSummary | null;
};

export type PersonasResponse = {
  enabled: boolean;
  org_name: string;
  tenant_id: string;
  seeded: boolean;
  personas: DemoPersona[];
};

export type ResetResponse = {
  ok: boolean;
  tenant_id: string;
  org_name: string;
  elapsed_ms: number;
  personas: number;
  evidence: number;
  pending_validation: number;
  audit_events: number;
};

export type EvidenceSample = {
  key: string;
  capability_slug: string;
  strength: "strong" | "weak";
  title: string;
  content: string;
  context: string;
  context_ref: string;
  artifacts: { url: string; label: string }[];
};

export type OpenAnswerSample = {
  key: string;
  question: string;
  strength: "strong" | "weak";
  answer: string;
};

export type Samples = {
  evidence: EvidenceSample[];
  free_response: OpenAnswerSample[];
  capability_names: Record<string, string>;
};

export type AIStatus = {
  vendor: string;
  model: string;
  endpoint_host: string;
  key_configured: boolean;
  demo_cache_entries: number;
  live_timeout_seconds: number;
  probe: { ok: boolean; latency_ms: number | null; error: string; error_kind: string } | null;
};

// --- Persona storage -----------------------------------------------------------

/** Fallback when localStorage is unavailable (private window, blocked storage). */
let memoryPersona: string | null = null;

export function getPersona(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setPersona(email: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, email);
  } catch {
    /* storage unavailable: the persona lasts for this page only */
    memoryPersona = email;
  }
  clearSession();
  window.dispatchEvent(new CustomEvent(PERSONA_EVENT, { detail: email }));
}

export function clearPersona() {
  if (typeof window === "undefined") return;
  memoryPersona = null;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing stored */
  }
  clearSession();
  window.dispatchEvent(new CustomEvent(PERSONA_EVENT, { detail: null }));
}

/** The active persona email, if any. */
export function activePersona(): string | null {
  return getPersona() ?? memoryPersona;
}

// --- Demo API (no auth: these act only on the demo tenant) ---------------------------

async function demoFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}/api/demo${path}`, init);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail ?? `Demo request failed (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

export const getPersonas = () => demoFetch<PersonasResponse>("/personas");
export const getAIStatus = (probe = false) =>
  demoFetch<AIStatus>(`/ai-status${probe ? "?probe=true" : ""}`);

export async function resetDemo(): Promise<ResetResponse> {
  const result = await demoFetch<ResetResponse>("/reset", { method: "POST" });
  clearSession();
  samplesCache = null;
  window.dispatchEvent(new CustomEvent(RESET_EVENT, { detail: result }));
  return result;
}

let samplesCache: Promise<Samples | null> | null = null;

/** Presenter fill samples, or null when demo mode is off. Cached per page load. */
export function loadSamples(): Promise<Samples | null> {
  if (!samplesCache) {
    samplesCache = demoFetch<Samples>("/samples").catch(() => null);
  }
  return samplesCache;
}
