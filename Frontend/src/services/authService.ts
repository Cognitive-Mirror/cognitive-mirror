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

  const snapshot = await getDoc(
    doc(db, "users", uid)
  );

  if (!snapshot.exists()) {
    throw new Error("User record not found.");
  }

  return snapshot.data().role;
}

export async function loginWithGoogle() {
   console.log("Opening Google popup");
  const result = await signInWithPopup(auth, googleProvider);
  console.log("Popup success");
  console.log(result.user.uid);
  console.log(result.user.email);
  const uid = result.user.uid;

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
}

console.log("authService loaded");
console.log(loginWithGoogle);