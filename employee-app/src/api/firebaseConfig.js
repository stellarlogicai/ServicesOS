const EMPLOYEE_FIREBASE_MODES = Object.freeze({
  LOCAL_EMULATOR: "local-emulator",
  PRODUCTION: "production",
});

const EMPLOYEE_FIREBASE_DEMO_PROJECT_ID = "demo-servicesos-v1-smoke-local";

const FIREBASE_CLIENT_FIELDS = Object.freeze([
  ["EXPO_PUBLIC_FIREBASE_API_KEY", "apiKey"],
  ["EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN", "authDomain"],
  ["EXPO_PUBLIC_FIREBASE_PROJECT_ID", "projectId"],
  ["EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET", "storageBucket"],
  ["EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", "messagingSenderId"],
  ["EXPO_PUBLIC_FIREBASE_APP_ID", "appId"],
]);

const EMPLOYEE_FIREBASE_PUBLIC_ENV_KEYS = Object.freeze([
  "EXPO_PUBLIC_SERVICESOS_FIREBASE_MODE",
  ...FIREBASE_CLIENT_FIELDS.map(([environmentKey]) => environmentKey),
  "EXPO_PUBLIC_FIREBASE_EMULATOR_HOST",
  "EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT",
  "EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT",
  "EXPO_PUBLIC_FIREBASE_STORAGE_EMULATOR_PORT",
  "EXPO_PUBLIC_FIREBASE_FUNCTIONS_EMULATOR_PORT",
]);

const LEGACY_PLACEHOLDER_PREFIX = ["REPLACE", "WITH", "ACTUAL"].join("_") + "_";

function requiredText(value, environmentKey) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    throw new Error(`[Employee Firebase] Missing required ${environmentKey}.`);
  }
  if (normalized.startsWith(LEGACY_PLACEHOLDER_PREFIX)) {
    throw new Error(`[Employee Firebase] ${environmentKey} still contains a placeholder value.`);
  }
  return normalized;
}

function parsePort(value, environmentKey, defaultPort) {
  const normalized = value == null || value === "" ? String(defaultPort) : String(value).trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`[Employee Firebase] ${environmentKey} must be an integer port.`);
  }

  const port = Number(normalized);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error(`[Employee Firebase] ${environmentKey} must be between 1 and 65535.`);
  }
  return port;
}

function validateEmulatorHost(value) {
  const host = requiredText(value, "EXPO_PUBLIC_FIREBASE_EMULATOR_HOST");
  if (/\s|:\/\/|[/?#]/.test(host)) {
    throw new Error(
      "[Employee Firebase] EXPO_PUBLIC_FIREBASE_EMULATOR_HOST must be a host name or address without a protocol, path, or port."
    );
  }
  return host;
}

function resolveEmployeeFirebaseConfig(environment = {}) {
  const mode = requiredText(
    environment.EXPO_PUBLIC_SERVICESOS_FIREBASE_MODE,
    "EXPO_PUBLIC_SERVICESOS_FIREBASE_MODE"
  );

  if (!Object.values(EMPLOYEE_FIREBASE_MODES).includes(mode)) {
    throw new Error(
      "[Employee Firebase] EXPO_PUBLIC_SERVICESOS_FIREBASE_MODE must be local-emulator or production."
    );
  }

  const firebaseConfig = Object.fromEntries(
    FIREBASE_CLIENT_FIELDS.map(([environmentKey, configKey]) => [
      configKey,
      requiredText(environment[environmentKey], environmentKey),
    ])
  );

  if (mode === EMPLOYEE_FIREBASE_MODES.PRODUCTION) {
    if (firebaseConfig.projectId === EMPLOYEE_FIREBASE_DEMO_PROJECT_ID) {
      throw new Error("[Employee Firebase] Production mode cannot use the local demo project.");
    }
    return { mode, firebaseConfig, emulator: null };
  }

  if (firebaseConfig.projectId !== EMPLOYEE_FIREBASE_DEMO_PROJECT_ID) {
    throw new Error(
      `[Employee Firebase] Local emulator mode requires project ${EMPLOYEE_FIREBASE_DEMO_PROJECT_ID}.`
    );
  }

  return {
    mode,
    firebaseConfig,
    emulator: {
      host: validateEmulatorHost(environment.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST),
      authPort: parsePort(
        environment.EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT,
        "EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT",
        9099
      ),
      firestorePort: parsePort(
        environment.EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT,
        "EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT",
        8080
      ),
      storagePort: parsePort(
        environment.EXPO_PUBLIC_FIREBASE_STORAGE_EMULATOR_PORT,
        "EXPO_PUBLIC_FIREBASE_STORAGE_EMULATOR_PORT",
        9199
      ),
      functionsPort: parsePort(
        environment.EXPO_PUBLIC_FIREBASE_FUNCTIONS_EMULATOR_PORT,
        "EXPO_PUBLIC_FIREBASE_FUNCTIONS_EMULATOR_PORT",
        5001
      ),
    },
  };
}

function readExpoPublicFirebaseEnvironment() {
  // Static property access is required so Expo can inline EXPO_PUBLIC_* values.
  return {
    EXPO_PUBLIC_SERVICESOS_FIREBASE_MODE:
      process.env.EXPO_PUBLIC_SERVICESOS_FIREBASE_MODE,
    EXPO_PUBLIC_FIREBASE_API_KEY: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    EXPO_PUBLIC_FIREBASE_PROJECT_ID: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:
      process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    EXPO_PUBLIC_FIREBASE_APP_ID: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
    EXPO_PUBLIC_FIREBASE_EMULATOR_HOST:
      process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST,
    EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT:
      process.env.EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT,
    EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT:
      process.env.EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT,
    EXPO_PUBLIC_FIREBASE_STORAGE_EMULATOR_PORT:
      process.env.EXPO_PUBLIC_FIREBASE_STORAGE_EMULATOR_PORT,
    EXPO_PUBLIC_FIREBASE_FUNCTIONS_EMULATOR_PORT:
      process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_EMULATOR_PORT,
  };
}

module.exports = {
  EMPLOYEE_FIREBASE_DEMO_PROJECT_ID,
  EMPLOYEE_FIREBASE_MODES,
  EMPLOYEE_FIREBASE_PUBLIC_ENV_KEYS,
  readExpoPublicFirebaseEnvironment,
  resolveEmployeeFirebaseConfig,
};
