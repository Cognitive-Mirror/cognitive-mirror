import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";



const requiredEnv = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const missingConfig = Object.entries(requiredEnv)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missingConfig.length > 0) {
  console.warn(
    `[Firebase] Missing environment variables: ${missingConfig.join(
      ", "
    )}. Using fallback development configuration.`
  );
}

const firebaseConfig = {
  apiKey: requiredEnv.apiKey || "demo-api-key",
  authDomain: requiredEnv.authDomain || "cognitive-mirror.firebaseapp.com",
  projectId: requiredEnv.projectId || "cognitive-mirror",
  storageBucket: requiredEnv.storageBucket || "cognitive-mirror.appspot.com",
  messagingSenderId: requiredEnv.messagingSenderId || "1234567890",
  appId: requiredEnv.appId || "1:1234567890:web:1234567890",
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);