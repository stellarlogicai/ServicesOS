const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  buildEmployeeSessionGatewayUrl,
  createEmployeeSessionClient,
  validateEmployeeSessionPayload,
} = require("../employeeSessionClient");

const employee = {
  uid: "employee-a",
  tenantId: "tenant-a",
  role: "employee",
  displayName: "Employee A",
  email: "employee-a@servicesos.test",
};

function response({ ok = true, status = 200, payload = { success: true, employee } } = {}) {
  return { ok, status, json: async () => payload };
}

test("gateway URLs derive only from validated runtime configuration", () => {
  assert.equal(
    buildEmployeeSessionGatewayUrl({ mode: "production", projectId: "example-servicesos", emulator: null }),
    "https://us-central1-example-servicesos.cloudfunctions.net/employeeSessionGateway"
  );
  assert.equal(
    buildEmployeeSessionGatewayUrl({
      mode: "local-emulator",
      projectId: "demo-servicesos-v1-smoke-local",
      emulator: { host: "10.0.2.2", functionsPort: 5001 },
    }),
    "http://10.0.2.2:5001/demo-servicesos-v1-smoke-local/us-central1/employeeSessionGateway"
  );
});

test("valid session request sends only the Firebase ID token and an empty body", async () => {
  const calls = [];
  const firebaseUser = { uid: "employee-a", getIdToken: async () => "firebase-token" };
  const verify = createEmployeeSessionClient({
    auth: { currentUser: firebaseUser },
    runtimeConfig: { mode: "production", projectId: "example-servicesos", emulator: null },
    fetchImpl: async (...args) => {
      calls.push(args);
      return response();
    },
  });

  assert.deepEqual(await verify(firebaseUser), employee);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].method, "POST");
  assert.deepEqual(JSON.parse(calls[0][1].body), {});
  assert.equal(calls[0][1].headers.Authorization, "Bearer firebase-token");
});

test("authorization denial returns only the safe employee access error", async () => {
  const firebaseUser = { uid: "employee-a", getIdToken: async () => "firebase-token" };
  const verify = createEmployeeSessionClient({
    auth: { currentUser: firebaseUser },
    runtimeConfig: { mode: "production", projectId: "example-servicesos" },
    fetchImpl: async () => response({ ok: false, status: 403, payload: { error: "private detail" } }),
  });
  await assert.rejects(verify(), (error) =>
    error.code === "employee_access_denied" &&
    error.message === "Your employee account is not available. Contact your business administrator."
  );
});

test("network failure returns only the safe verification error", async () => {
  const firebaseUser = { uid: "employee-a", getIdToken: async () => "firebase-token" };
  const verify = createEmployeeSessionClient({
    auth: { currentUser: firebaseUser },
    runtimeConfig: { mode: "production", projectId: "example-servicesos" },
    fetchImpl: async () => { throw new Error("private network detail"); },
  });
  await assert.rejects(verify(), (error) =>
    error.code === "employee_verification_failed" &&
    error.message === "ServicesOS could not verify your employee account. Try again."
  );
});

test("session validation rejects unexpected server fields", () => {
  assert.throws(
    () => validateEmployeeSessionPayload({
      success: true,
      employee: { ...employee, tenantUsers: ["private"] },
    }, "employee-a"),
    (error) => error.code === "employee_verification_failed"
  );
});

test("session validation rejects a mismatched user or non-employee role", () => {
  assert.throws(
    () => validateEmployeeSessionPayload({ success: true, employee }, "employee-b"),
    (error) => error.code === "employee_verification_failed"
  );
  assert.throws(
    () => validateEmployeeSessionPayload({
      success: true,
      employee: { ...employee, role: "admin" },
    }, "employee-a"),
    (error) => error.code === "employee_verification_failed"
  );
});

test("active Employee App auth source no longer reads the obsolete DEFAULT employee path", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "context", "AuthContext.jsx"),
    "utf8"
  );
  assert.doesNotMatch(source, /tenants["']?\s*,\s*["']DEFAULT|employees["']?\s*,/);
  assert.doesNotMatch(source, /getDoc|firebase\/firestore/);
  assert.match(source, /verifyEmployeeSession/);
});
