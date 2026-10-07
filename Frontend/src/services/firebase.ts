/**
 * Firebase client. Used for sign-in only; all data comes from the backend.
 *
 * The web config is public by design (access is enforced by the backend's
 * token verification), but it must be present: there is no silent fallback to
 * a fake project, which would only fail later with a confusing auth error.
 */

import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const missing = Object.entries(config)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missing.length > 0) {
  console.error(
    `[Firebase] Missing ${missing.join(", ")}. Copy Frontend/.env.example to ` +
      "Frontend/.env.local and fill it in.",
  );
}

const app = getApps().length > 0 ? getApp() : initializeApp(config);

export const auth = getAuth(app);
