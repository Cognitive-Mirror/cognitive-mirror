/**
 * Authentication — Firebase Auth on the client, verified server-side by FastAPI.
 *
 * Never log user identifiers, emails or tokens here; browser console output is
 * visible to anyone with access to the device.
 */

import {
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";

import { doc, getDoc, setDoc } from "firebase/firestore";

import { auth, db } from "./firebase";

const googleProvider = new GoogleAuthProvider();

const DEFAULT_ROLE = "learner";

export async function login(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function logout() {
  return signOut(auth);
}

export async function getUserRole(uid: string) {
  const snapshot = await getDoc(doc(db, "users", uid));

  if (!snapshot.exists()) {
    throw new Error("User record not found.");
  }

  return snapshot.data().role;
}

export async function loginWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  const { uid, email, displayName } = result.user;

  try {
    const userRef = doc(db, "users", uid);
    const snapshot = await getDoc(userRef);

    if (!snapshot.exists()) {
      await setDoc(userRef, {
        email,
        name: displayName,
        role: DEFAULT_ROLE,
      });

      return { role: DEFAULT_ROLE, user: result.user };
    }

    return { role: snapshot.data().role, user: result.user };
  } catch {
    // Firestore unreachable — fall back to the least-privileged role rather
    // than blocking sign-in. Do not log the error payload; it can carry
    // user identifiers.
    console.warn("Firestore unavailable; defaulting to the learner role.");
    return { role: DEFAULT_ROLE, user: result.user };
  }
}

export async function verifyBackendToken(idToken: string) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

  let response: Response;
  try {
    response = await fetch(`${apiUrl}/auth/me`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
    });
  } catch {
    throw new Error(
      `Could not reach the backend at ${apiUrl}. Start it with "npm run dev".`,
    );
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.detail ?? "Backend token verification failed.");
  }

  return response.json();
}
