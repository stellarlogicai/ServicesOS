// src/api/firebase.js
/**
 * Firebase Configuration for Employee App
 * 
 * This file initializes Firebase services for the employee app.
 * The employee app connects to the same Firebase backend as the web app.
 */

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

// Firebase configuration - replace with actual values from Firebase console
const firebaseConfig = {
  apiKey: "REPLACE_WITH_ACTUAL_KEY",
  authDomain: "REPLACE_WITH_ACTUAL_DOMAIN",
  projectId: "REPLACE_WITH_ACTUAL_PROJECT_ID",
  storageBucket: "REPLACE_WITH_ACTUAL_BUCKET",
  messagingSenderId: "REPLACE_WITH_ACTUAL_SENDER_ID",
  appId: "REPLACE_WITH_ACTUAL_APP_ID",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

// Export the app instance
export default app;
