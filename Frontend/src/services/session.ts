/**
 * The signed-in user as the backend sees them (GET /auth/me).
 *
 * Cached for the page lifetime: every screen needs it and it only changes on
 * sign-in or sign-out, both of which clear the cache.
 */

import { getMe, type Me } from "./api";

let cached: Promise<Me> | null = null;

export function loadSession(): Promise<Me> {
  if (!cached) {
    cached = getMe().catch((err) => {
      cached = null; // let the next caller retry
      throw err;
    });
  }
  return cached;
}

export function clearSession() {
  cached = null;
}
