const assert = require("node:assert/strict");
const test = require("node:test");

const {
  EMPLOYEE_FIREBASE_DEMO_PROJECT_ID,
  EMPLOYEE_FIREBASE_MODES,
  EMPLOYEE_FIREBASE_PUBLIC_ENV_KEYS,
  resolveEmployeeFirebaseConfig,
} = require("../firebaseConfig");

function productionEnvironment(overrides = {}) {
  return {
    EXPO_PUBLIC_SERVICESOS_FIREBASE_MODE: "production",
    EXPO_PUBLIC_FIREBASE_API_KEY: "public-client-api-key",
    EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: "example-servicesos.firebaseapp.com",
    EXPO_PUBLIC_FIREBASE_PROJECT_ID: "example-servicesos",
    EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: "example-servicesos.example.invalid",
    EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "1234567890",
    EXPO_PUBLIC_FIREBASE_APP_ID: "1:1234567890:web:example",
    ...overrides,
  };
}

function localEnvironment(overrides = {}) {
  return {
    ...productionEnvironment(),
    EXPO_PUBLIC_SERVICESOS_FIREBASE_MODE: "local-emulator",
    EXPO_PUBLIC_FIREBASE_PROJECT_ID: EMPLOYEE_FIREBASE_DEMO_PROJECT_ID,
    EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: `${EMPLOYEE_FIREBASE_DEMO_PROJECT_ID}.firebaseapp.com`,
    EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: `${EMPLOYEE_FIREBASE_DEMO_PROJECT_ID}.appspot.com`,
    EXPO_PUBLIC_FIREBASE_EMULATOR_HOST: "10.0.2.2",
    ...overrides,
  };
}

test("missing mode fails closed", () => {
  assert.throws(
    () => resolveEmployeeFirebaseConfig(productionEnvironment({
      EXPO_PUBLIC_SERVICESOS_FIREBASE_MODE: "",
    })),
    /Missing required EXPO_PUBLIC_SERVICESOS_FIREBASE_MODE/
  );
});

test("unknown mode fails closed", () => {
  assert.throws(
    () => resolveEmployeeFirebaseConfig(productionEnvironment({
      EXPO_PUBLIC_SERVICESOS_FIREBASE_MODE: "development",
    })),
    /must be local-emulator or production/
  );
});

test("production mode requires every Firebase client field", () => {
  for (const key of [
    "EXPO_PUBLIC_FIREBASE_API_KEY",
    "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "EXPO_PUBLIC_FIREBASE_PROJECT_ID",
    "EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET",
    "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    "EXPO_PUBLIC_FIREBASE_APP_ID",
  ]) {
    assert.throws(
      () => resolveEmployeeFirebaseConfig(productionEnvironment({ [key]: "" })),
      new RegExp(`Missing required ${key}`)
    );
  }
});

test("production mode rejects legacy placeholder values", () => {
  const legacyPlaceholder = ["REPLACE", "WITH", "ACTUAL", "KEY"].join("_");
  assert.throws(
    () => resolveEmployeeFirebaseConfig(productionEnvironment({
      EXPO_PUBLIC_FIREBASE_API_KEY: legacyPlaceholder,
    })),
    /placeholder value/
  );
});

test("production mode rejects the emulator-only demo project", () => {
  assert.throws(
    () => resolveEmployeeFirebaseConfig(productionEnvironment({
      EXPO_PUBLIC_FIREBASE_PROJECT_ID: EMPLOYEE_FIREBASE_DEMO_PROJECT_ID,
    })),
    /Production mode cannot use the local demo project/
  );
});

test("valid production-shaped configuration resolves without emulator settings", () => {
  const result = resolveEmployeeFirebaseConfig(productionEnvironment({
    EXPO_PUBLIC_FIREBASE_EMULATOR_HOST: "127.0.0.1",
  }));

  assert.equal(result.mode, EMPLOYEE_FIREBASE_MODES.PRODUCTION);
  assert.equal(result.firebaseConfig.projectId, "example-servicesos");
  assert.equal(result.emulator, null);
});

test("local emulator mode requires an explicit reachable host", () => {
  assert.throws(
    () => resolveEmployeeFirebaseConfig(localEnvironment({
      EXPO_PUBLIC_FIREBASE_EMULATOR_HOST: "",
    })),
    /Missing required EXPO_PUBLIC_FIREBASE_EMULATOR_HOST/
  );
});

test("local emulator mode rejects a non-demo project", () => {
  assert.throws(
    () => resolveEmployeeFirebaseConfig(localEnvironment({
      EXPO_PUBLIC_FIREBASE_PROJECT_ID: "example-servicesos",
    })),
    /Local emulator mode requires project demo-servicesos-v1-smoke-local/
  );
});

test("valid local emulator configuration resolves all service endpoints", () => {
  const result = resolveEmployeeFirebaseConfig(localEnvironment());

  assert.equal(result.mode, EMPLOYEE_FIREBASE_MODES.LOCAL_EMULATOR);
  assert.equal(result.firebaseConfig.projectId, EMPLOYEE_FIREBASE_DEMO_PROJECT_ID);
  assert.deepEqual(result.emulator, {
    host: "10.0.2.2",
    authPort: 9099,
    firestorePort: 8080,
    storagePort: 9199,
    functionsPort: 5001,
  });
});

test("emulator ports must be integers in the valid port range", () => {
  for (const invalidPort of ["0", "65536", "5001.5", "not-a-port", "-1"]) {
    assert.throws(
      () => resolveEmployeeFirebaseConfig(localEnvironment({
        EXPO_PUBLIC_FIREBASE_FUNCTIONS_EMULATOR_PORT: invalidPort,
      })),
      /must be an integer port|must be between 1 and 65535/
    );
  }

  const result = resolveEmployeeFirebaseConfig(localEnvironment({
    EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT: "19099",
  }));
  assert.equal(result.emulator.authPort, 19099);
});

test("configuration contract references only Expo public client variables", () => {
  assert.ok(EMPLOYEE_FIREBASE_PUBLIC_ENV_KEYS.length > 0);
  for (const key of EMPLOYEE_FIREBASE_PUBLIC_ENV_KEYS) {
    assert.match(key, /^EXPO_PUBLIC_/);
    assert.doesNotMatch(key, /SECRET|PRIVATE|SERVICE_ACCOUNT|STRIPE|RESEND|OPENAI|PROVIDER/);
  }
});
