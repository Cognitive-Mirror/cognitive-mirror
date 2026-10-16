/**
 * Firebase client. Used for sign-in only; all data comes from the backend.
 *
 * Initialised lazily, on first use. Firebase's getAuth() throws
 * auth/invalid-api-key at import time when the web config is missing, which
 * used to crash every page - including during `next build` prerendering, and
 * in demo mode, which needs no Firebase at all. Now a missing config only
 * matters when someone actually tries to sign in with Firebase, and it fails
 * there with a readable message instead of a blank page.
 */

import { type FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";
import { type Auth, getAuth } from "firebase/auth";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const missingFirebaseConfig = Object.entries(config)
  .filter(([, value]) => !value)
  .map(([key]) => key);

export const firebaseConfigured = missingFirebaseConfig.length === 0;

let cached: Auth | null = null;

/** The Firebase Auth instance, or null when the web config is not set. */
export function getFirebaseAuth(): Auth | null {
  if (cached) return cached;
  if (!firebaseConfigured) return null;
  const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(config);
  cached = getAuth(app);
  return cached;
}

/** The Auth instance, or a clear error explaining what is missing. */
export function requireFirebaseAuth(): Auth {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error(
      `Firebase sign-in is not configured (missing ${missingFirebaseConfig.join(", ")}). ` +
        "Copy Frontend/.env.example to Frontend/.env.local, or use a demo persona.",
    );
  }
  return auth;
}
