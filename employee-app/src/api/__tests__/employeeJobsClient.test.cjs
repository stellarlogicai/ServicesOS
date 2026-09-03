const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createEmployeeJobsClient,
  sanitizeEmployeeJobPacket,
  sanitizeEmployeeJobSummary,
  validateEmployeeJobListPayload,
} = require("../employeeJobsClient");

const productionRuntime = {
  mode: "production",
  projectId: "example-servicesos",
  emulator: null,
};

function summary(overrides = {}) {
  return {
    id: "booking-a",
    schedule: {
      date: "2026-09-03",
      startTime: "09:00",
      endTime: "11:00",
      scheduledAt: "2026-09-03T14:00:00.000Z",
    },
    serviceType: "Standard Cleaning",
    customerName: "Sample Customer",
    address: "100 Example Ave",
    status: "scheduled",
    fieldStatus: "not_started",
    ...overrides,
  };
}

function packet(overrides = {}) {
  return {
    id: "booking-a",
    schedule: summary().schedule,
    serviceType: "Standard Cleaning",
    customer: { name: "Sample Customer", phone: "555-0100" },
    location: { address: "100 Example Ave" },
    status: "scheduled",
    fieldStatus: "not_started",
    instructions: "Use the side entrance.",
    checklist: {
      ready: true,
      items: [{
        id: "item-a",
        area: "Kitchen",
        fixtureOrSurface: "Counter",
        label: "Clean counter",
        completionCriteria: "Counter is clean",
        jobAidSteps: [],
        warnings: [],
        note: "",
        condition: "",
        required: true,
        completed: false,
        approvedMethodIds: [],
        preferredMethodId: null,
      }],
      completed: 0,
      total: 1,
      notes: "",
      warnings: [],
    },
    fieldNotes: "",
    fieldIssue: "",
    ...overrides,
  };
}

function response(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

function createClient({ runtimeConfig = productionRuntime, fetchImpl, user } = {}) {
  return createEmployeeJobsClient({
    auth: { currentUser: user === undefined ? { getIdToken: async () => "firebase-token" } : user },
    runtimeConfig,
    fetchImpl,
  });
}

function recursiveKeys(value, keys = []) {
  if (Array.isArray(value)) {
    value.forEach(item => recursiveKeys(item, keys));
  } else if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, child]) => {
      keys.push(key);
      recursiveKeys(child, keys);
    });
  }
  return keys;
}

test("job service requires an authenticated Firebase user", async () => {
  const client = createClient({ user: null, fetchImpl: async () => response({}) });
  await assert.rejects(client.listEmployeeJobs(), error => error.code === "unauthenticated");
});

test("LIST sends a Bearer token and only action:list", async () => {
  const calls = [];
  const client = createClient({
    fetchImpl: async (...args) => {
      calls.push(args);
      return response({ success: true, schemaVersion: 1, jobs: [summary()] });
    },
  });

  assert.deepEqual(await client.listEmployeeJobs(), [summary()]);
  assert.equal(calls[0][0], "https://us-central1-example-servicesos.cloudfunctions.net/employeeJobPacketGateway");
  assert.equal(calls[0][1].headers.Authorization, "Bearer firebase-token");
  assert.deepEqual(JSON.parse(calls[0][1].body), { action: "list" });
});

test("GET sends only action and bookingId without caller identity", async () => {
  const bodies = [];
  const client = createClient({
    fetchImpl: async (_url, options) => {
      bodies.push(JSON.parse(options.body));
      return response({ success: true, schemaVersion: 1, job: packet() });
    },
  });

  await client.getEmployeeJob(" booking-a ");
  assert.deepEqual(bodies, [{ action: "get", bookingId: "booking-a" }]);
  assert.equal("tenantId" in bodies[0], false);
  assert.equal("uid" in bodies[0], false);
  assert.equal("role" in bodies[0], false);
});

test("emulator URL derives from validated runtime configuration", async () => {
  const urls = [];
  const client = createClient({
    runtimeConfig: {
      mode: "local-emulator",
      projectId: "demo-servicesos-v1-smoke-local",
      emulator: { host: "10.0.2.2", functionsPort: 5001 },
    },
    fetchImpl: async url => {
      urls.push(url);
      return response({ success: true, schemaVersion: 1, jobs: [] });
    },
  });
  await client.listEmployeeJobs();
  assert.equal(
    urls[0],
    "http://10.0.2.2:5001/demo-servicesos-v1-smoke-local/us-central1/employeeJobPacketGateway"
  );
});

test("summary and detail projections strip all unknown and forbidden fields", () => {
  const hostile = {
    agreedPrice: 500,
    paymentStatus: "paid",
    assignedEmployeeAuthUid: "private-uid",
    customerSnapshot: { email: "private@example.test" },
    requestSnapshot: { rawInput: { private: true } },
    jobChecklistSnapshot: { provenance: { sourceScopeSignature: "private" } },
  };
  const safeSummary = sanitizeEmployeeJobSummary({ ...summary(), ...hostile });
  const safePacket = sanitizeEmployeeJobPacket({
    ...packet(),
    ...hostile,
    customer: { ...packet().customer, tenantUsers: ["private"] },
    checklist: {
      ...packet().checklist,
      sourceScopeSignature: "private",
      items: [{ ...packet().checklist.items[0], provenance: { private: true } }],
    },
  });
  const forbidden = new Set([
    "agreedPrice", "price", "pricing", "paymentStatus", "paymentMethod", "amountReceived",
    "stripeCustomerId", "billing", "subscription", "leadId", "sourceLeadId",
    "customerSnapshot", "propertySnapshot", "requestSnapshot", "rawInput", "formData",
    "assignedEmployeeAuthUid", "assignedEmployeeId", "jobChecklistSnapshot", "provenance",
    "sourceScopeSignature", "tenantUsers",
  ]);
  assert.equal(recursiveKeys(safeSummary).some(key => forbidden.has(key)), false);
  assert.equal(recursiveKeys(safePacket).some(key => forbidden.has(key)), false);
});

test("unready checklist cannot place stale task content in mobile state", () => {
  const unsafe = packet({
    checklist: {
      ...packet().checklist,
      ready: false,
      items: [{ ...packet().checklist.items[0], label: "Stale private task" }],
    },
  });
  assert.deepEqual(sanitizeEmployeeJobPacket(unsafe).checklist.items, []);
});

test("malformed and oversized payloads fail safely", () => {
  assert.throws(
    () => validateEmployeeJobListPayload({ success: true, schemaVersion: 1, jobs: [summary({ id: "" })] }),
    error => error.code === "invalid_request"
  );
  assert.throws(
    () => validateEmployeeJobListPayload({ success: true, schemaVersion: 1, jobs: "not-an-array" }),
    error => error.code === "job_service_unavailable"
  );
  assert.throws(
    () => validateEmployeeJobListPayload({
      success: true,
      schemaVersion: 1,
      jobs: Array.from({ length: 51 }, (_, index) => summary({ id: `booking-${index}` })),
    }),
    error => error.code === "job_service_unavailable"
  );
});

test("server failures expose only normalized safe errors", async () => {
  const unavailable = createClient({
    fetchImpl: async () => response({ code: "job_unavailable", internal: "private" }, 404),
  });
  await assert.rejects(
    unavailable.getEmployeeJob("booking-a"),
    error => error.code === "job_unavailable" && error.message === "This job is no longer available."
  );
});
