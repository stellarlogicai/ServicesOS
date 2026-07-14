import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  app: { name: '[DEFAULT]' },
  auth: { service: 'auth' },
  db: { service: 'firestore' },
  storage: { service: 'storage' },
  connectAuthEmulator: vi.fn(),
  connectFirestoreEmulator: vi.fn(),
  connectStorageEmulator: vi.fn(),
  getApps: vi.fn(() => []),
  getApp: vi.fn(),
  initializeApp: vi.fn(),
}));

vi.mock('firebase/app', () => ({
  getApp: mocks.getApp,
  getApps: mocks.getApps,
  initializeApp: mocks.initializeApp,
}));

vi.mock('firebase/auth', () => ({
  connectAuthEmulator: mocks.connectAuthEmulator,
  getAuth: vi.fn(() => mocks.auth),
  GoogleAuthProvider: class GoogleAuthProvider {},
}));

vi.mock('firebase/firestore', () => ({
  connectFirestoreEmulator: mocks.connectFirestoreEmulator,
  getFirestore: vi.fn(() => mocks.db),
}));

vi.mock('firebase/storage', () => ({
  connectStorageEmulator: mocks.connectStorageEmulator,
  getStorage: vi.fn(() => mocks.storage),
}));

const CONNECTION_KEY = '__SERVICESOS_V1_FIREBASE_EMULATORS_CONNECTED__';

async function importFirebase() {
  vi.resetModules();
  return import('../firebase.js');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  delete globalThis[CONNECTION_KEY];
  mocks.getApps.mockReturnValue([]);
  mocks.getApp.mockReturnValue(mocks.app);
  mocks.initializeApp.mockReturnValue(mocks.app);
});

describe('Firebase emulator mode', () => {
  it('does not connect emulators by default', async () => {
    vi.stubEnv('VITE_USE_FIREBASE_EMULATORS', 'false');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'cleaning-intake-system');

    await importFirebase();

    expect(mocks.connectAuthEmulator).not.toHaveBeenCalled();
    expect(mocks.connectFirestoreEmulator).not.toHaveBeenCalled();
    expect(mocks.connectStorageEmulator).not.toHaveBeenCalled();
  });

  it('connects all Firebase services only for the explicit fake smoke project', async () => {
    vi.stubEnv('VITE_USE_FIREBASE_EMULATORS', 'true');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'demo-servicesos-v1-smoke-local');

    await importFirebase();

    expect(mocks.connectAuthEmulator).toHaveBeenCalledWith(
      mocks.auth,
      'http://127.0.0.1:9099',
      { disableWarnings: true },
    );
    expect(mocks.connectFirestoreEmulator).toHaveBeenCalledWith(mocks.db, '127.0.0.1', 8080);
    expect(mocks.connectStorageEmulator).toHaveBeenCalledWith(mocks.storage, '127.0.0.1', 9199);
  });

  it('refuses emulator mode for a production-like project', async () => {
    vi.stubEnv('VITE_USE_FIREBASE_EMULATORS', 'true');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'cleaning-intake-system');

    await expect(importFirebase()).rejects.toThrow(
      'Firebase emulator mode requires project demo-servicesos-v1-smoke-local',
    );

    expect(mocks.connectAuthEmulator).not.toHaveBeenCalled();
    expect(mocks.connectFirestoreEmulator).not.toHaveBeenCalled();
    expect(mocks.connectStorageEmulator).not.toHaveBeenCalled();
  });

  it('does not reconnect during a hot reload style module evaluation', async () => {
    vi.stubEnv('VITE_USE_FIREBASE_EMULATORS', 'true');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'demo-servicesos-v1-smoke-local');

    await importFirebase();
    await importFirebase();

    expect(mocks.connectAuthEmulator).toHaveBeenCalledTimes(1);
    expect(mocks.connectFirestoreEmulator).toHaveBeenCalledTimes(1);
    expect(mocks.connectStorageEmulator).toHaveBeenCalledTimes(1);
  });
});
