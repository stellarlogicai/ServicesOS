// src/firebase.js
import { getApp, getApps, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, GoogleAuthProvider } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectStorageEmulator, getStorage } from 'firebase/storage';

const V1_SMOKE_PROJECT_ID = 'demo-servicesos-v1-smoke-local';
const EMULATOR_CONNECTION_KEY = '__SERVICESOS_V1_FIREBASE_EMULATORS_CONNECTED__';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const emulatorMode = import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';

if (emulatorMode && firebaseConfig.projectId !== V1_SMOKE_PROJECT_ID) {
  throw new Error(
    `Firebase emulator mode requires project ${V1_SMOKE_PROJECT_ID}. Refusing project ${firebaseConfig.projectId || 'missing'}.`
  );
}

// Reuse the default app during Vite hot reload.
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const googleProvider = new GoogleAuthProvider();

if (emulatorMode && !globalThis[EMULATOR_CONNECTION_KEY]) {
  const authHost = import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1';
  const authPort = Number(import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_PORT || 9099);
  const firestoreHost = import.meta.env.VITE_FIRESTORE_EMULATOR_HOST || '127.0.0.1';
  const firestorePort = Number(import.meta.env.VITE_FIRESTORE_EMULATOR_PORT || 8080);
  const storageHost = import.meta.env.VITE_FIREBASE_STORAGE_EMULATOR_HOST || '127.0.0.1';
  const storagePort = Number(import.meta.env.VITE_FIREBASE_STORAGE_EMULATOR_PORT || 9199);

  connectAuthEmulator(auth, `http://${authHost}:${authPort}`, { disableWarnings: true });
  connectFirestoreEmulator(db, firestoreHost, firestorePort);
  connectStorageEmulator(storage, storageHost, storagePort);
  globalThis[EMULATOR_CONNECTION_KEY] = true;

  console.info(`[Firebase] V1 smoke emulator mode enabled for ${V1_SMOKE_PROJECT_ID}.`);
}

export { app, auth, db, storage, googleProvider };
