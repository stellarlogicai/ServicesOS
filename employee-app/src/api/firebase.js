// src/api/firebase.js
/**
 * Firebase Configuration for Employee App
 * 
 * This file initializes Firebase services for the employee app.
 * The employee app connects to the same Firebase backend as the web app.
 */

import { getApp, getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectStorageEmulator, getStorage } from "firebase/storage";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import firebaseRuntimeConfig from "./firebaseConfig";

const {
  EMPLOYEE_FIREBASE_MODES,
  readExpoPublicFirebaseEnvironment,
  resolveEmployeeFirebaseConfig,
} = firebaseRuntimeConfig;

const EMULATOR_CONNECTION_KEY = "__SERVICESOS_EMPLOYEE_FIREBASE_EMULATORS_CONNECTED__";
const runtimeConfig = resolveEmployeeFirebaseConfig(readExpoPublicFirebaseEnvironment());

// Reuse the default app during Expo Fast Refresh.
const app = getApps().length > 0 ? getApp() : initializeApp(runtimeConfig.firebaseConfig);

if (app.options.projectId !== runtimeConfig.firebaseConfig.projectId) {
  throw new Error("[Employee Firebase] Existing Firebase app uses a different project.");
}

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

if (runtimeConfig.mode === EMPLOYEE_FIREBASE_MODES.LOCAL_EMULATOR) {
  const { emulator } = runtimeConfig;
  const connectionFingerprint = [
    runtimeConfig.firebaseConfig.projectId,
    emulator.host,
    emulator.authPort,
    emulator.firestorePort,
    emulator.storagePort,
    emulator.functionsPort,
  ].join("|");
  const existingConnection = globalThis[EMULATOR_CONNECTION_KEY];

  if (existingConnection && existingConnection !== connectionFingerprint) {
    throw new Error("[Employee Firebase] Emulator connection changed during Fast Refresh.");
  }

  if (!existingConnection) {
    connectAuthEmulator(auth, `http://${emulator.host}:${emulator.authPort}`, {
      disableWarnings: true,
    });
    connectFirestoreEmulator(db, emulator.host, emulator.firestorePort);
    connectStorageEmulator(storage, emulator.host, emulator.storagePort);
    connectFunctionsEmulator(functions, emulator.host, emulator.functionsPort);
    globalThis[EMULATOR_CONNECTION_KEY] = connectionFingerprint;

    console.info(
      `[Employee Firebase] Local emulator mode: ${runtimeConfig.firebaseConfig.projectId} @ ${emulator.host}`
    );
  }
}

export default app;
