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
  const result = await signInWithPopup(auth, googleProvider);

  const uid = result.user.uid;

  console.log("Popup success");
  console.log(uid);
  console.log(result.user.email);

  const userRef = doc(db, "users", uid);

  console.log("Checking Firestore...");

  const snapshot = await getDoc(userRef);

  console.log("Exists?", snapshot.exists());

  // First time Google login
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

  // Existing user
  const role = snapshot.data().role;

  console.log("Firestore role =", role);
console.log("Type =", typeof role);

  return {
    role,
    user: result.user,
  };
}
console.log("authService loaded");
console.log(loginWithGoogle);