import { auth, db } from "./firebase";

import {
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
} from "firebase/auth";

import {
  doc,
  getDoc,
  setDoc,
} from "firebase/firestore";

const googleProvider = new GoogleAuthProvider();

export async function login(
  email: string,
  password: string
) {
  return signInWithEmailAndPassword(
    auth,
    email,
    password
  );
}

export async function logout() {
  return signOut(auth);
}

export async function getUserRole(uid: string) {
  const snapshot = await getDoc(doc(db, "users", uid));

  if (!snapshot.exists()) {
    throw new Error("User record not found.");
  }

  console.log("Firestore role:", snapshot.data().role);

  return snapshot.data().role;
}   

export async function loginWithGoogle() {
  console.log("Opening Google popup");
  const result = await signInWithPopup(auth, googleProvider);

  const uid = result.user.uid;
  console.log("Popup success");
  console.log(uid);
  console.log(result.user.email);

  try {
    const userRef = doc(db, "users", uid);
    console.log("Checking Firestore...");
    const snapshot = await getDoc(userRef);
    console.log("Exists?", snapshot.exists());
    if (!snapshot.exists()) {
      await setDoc(userRef, {
        email: result.user.email,
        name: result.user.displayName,
        role: "learner",
      });

      return {
        role: "learner",
        user: result.user,
      };
    }

    return {
      role: snapshot.data().role,
      user: result.user,
    };
  } catch (err) {
    console.warn("Firestore unavailable, defaulting role to learner:", err);
    return {
      role: "learner",
      user: result.user,
    };
  }
}

export async function verifyBackendToken(idToken: string) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
  try {
    const response = await fetch(`${apiUrl}/auth/me`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(
        errorData?.detail ?? "FastAPI token verification failed."
      );
    }

    return await response.json();
  } catch (err) {
    if (err instanceof Error && err.message.includes("fetch")) {
      throw new Error(
        "Could not connect to FastAPI backend at http://127.0.0.1:8000. Make sure the backend is running via 'npm run dev'."
      );
    }
    throw err;
  }
}
console.log("authService loaded");
console.log(loginWithGoogle);