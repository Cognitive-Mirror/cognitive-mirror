/**
 * Sign-in and sign-out through Firebase Auth.
 *
 * Firebase proves who someone is; the backend decides what they may do. After
 * any sign-in, callers fetch GET /auth/me (services/session.ts) for the role.
 *
 * Never log identifiers, emails or tokens here: browser console output is
 * visible to anyone with access to the device.
 */

import {
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";

import { clearPersona } from "./demo";
import { getFirebaseAuth, requireFirebaseAuth } from "./firebase";
import { clearSession } from "./session";

export function signInWithEmail(email: string, password: string) {
  clearPersona();
  return signInWithEmailAndPassword(requireFirebaseAuth(), email, password);
}

export function signInWithGoogle() {
  clearPersona();
  return signInWithPopup(requireFirebaseAuth(), new GoogleAuthProvider());
}

export function resetPassword(email: string) {
  return sendPasswordResetEmail(requireFirebaseAuth(), email);
}

export async function logOut() {
  clearPersona();
  clearSession();
  const auth = getFirebaseAuth();
  if (auth) await signOut(auth);
}
