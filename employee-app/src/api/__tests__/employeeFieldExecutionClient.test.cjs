const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { createEmployeeFieldExecutionClient } = require("../employeeFieldExecutionClient");

const runtimeConfig = { mode: "production", projectId: "example-servicesos", emulator: null };

function packet(overrides = {}) {
  return {
    id: "booking-a",
    schedule: { date: "2026-09-03", startTime: "09:00", endTime: "11:00", scheduledAt: null },
    serviceType: "Standard Cleaning",
    customer: { name: "Sample Customer", phone: "555-0100" },
    location: { address: "100 Example Ave" },
    status: "scheduled",
    fieldStatus: "in_progress",
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

function response(job = packet()) {
  return { ok: true, status: 200, json: async () => ({ success: true, schemaVersion: 1, job }) };
}

function client(fetchImpl, user = { getIdToken: async () => "firebase-token" }) {
  return createEmployeeFieldExecutionClient({ auth: { currentUser: user }, runtimeConfig, fetchImpl });
}

function captureClient(result = packet()) {
  const calls = [];
  return {
    calls,
    api: client(async (...args) => {
      calls.push(args);
      return response(result);
    }),
  };
}

test("execution calls require an authenticated Firebase user", async () => {
  const api = client(async () => response(), null);
  await assert.rejects(api.startEmployeeJob("booking-a"), error => error.code === "unauthenticated");
});

test("start sends a Bearer token and the exact narrow request", async () => {
  const { api, calls } = captureClient();
  await api.startEmployeeJob(" booking-a ");
  assert.equal(calls[0][0], "https://us-central1-example-servicesos.cloudfunctions.net/employeeFieldExecutionGateway");
  assert.equal(calls[0][1].headers.Authorization, "Bearer firebase-token");
  assert.deepEqual(JSON.parse(calls[0][1].body), { action: "start", bookingId: "booking-a" });
});

test("checklist sends only item IDs and completion booleans", async () => {
  const { api, calls } = captureClient();
  await api.saveEmployeeChecklist("booking-a", [{ id: "item-a", completed: true }]);
  assert.deepEqual(JSON.parse(calls[0][1].body), {
    action: "save_checklist",
    bookingId: "booking-a",
    checklist: [{ id: "item-a", completed: true }],
  });
  await assert.rejects(
    api.saveEmployeeChecklist("booking-a", [{ id: "item-a", completed: true, label: "Changed" }]),
    error => error.code === "invalid_request"
  );
});

test("notes request contains exactly both bounded employee fields", async () => {
  const { api, calls } = captureClient();
  await api.saveEmployeeNotes("booking-a", "Field note", "Reported issue");
  assert.deepEqual(JSON.parse(calls[0][1].body), {
    action: "save_notes",
    bookingId: "booking-a",
    fieldNotes: "Field note",
    fieldIssue: "Reported issue",
  });
});

test("complete sends only checklist completion state and bounded field text", async () => {
  const { api, calls } = captureClient(packet({ fieldStatus: "completed" }));
  await api.completeEmployeeJob(
    "booking-a",
    [{ id: "item-a", completed: true }],
    "Field note",
    ""
  );
  assert.deepEqual(JSON.parse(calls[0][1].body), {
    action: "complete",
    bookingId: "booking-a",
    checklist: [{ id: "item-a", completed: true }],
    fieldNotes: "Field note",
    fieldIssue: "",
  });
});

test("identity, timestamp, actor, and structural fields cannot enter requests", async () => {
  const { api, calls } = captureClient();
  await api.startEmployeeJob("booking-a");
  const body = JSON.parse(calls[0][1].body);
  ["tenantId", "uid", "role", "employeeId", "assignedEmployeeAuthUid", "updatedAt", "actorUid"]
    .forEach(key => assert.equal(Object.hasOwn(body, key), false));
});

test("notes and issues are locally bounded before network access", async () => {
  const { api, calls } = captureClient();
  await assert.rejects(api.saveEmployeeNotes("booking-a", "x".repeat(1001), ""));
  await assert.rejects(api.saveEmployeeNotes("booking-a", "", "x".repeat(751)));
  assert.equal(calls.length, 0);
});

test("successful responses use the shared safe packet allowlist", async () => {
  const { api } = captureClient(packet({
    agreedPrice: 900,
    paymentStatus: "paid",
    assignedEmployeeAuthUid: "private",
    customerSnapshot: { email: "private@example.test" },
  }));
  const result = await api.startEmployeeJob("booking-a");
  assert.equal(Object.hasOwn(result, "agreedPrice"), false);
  assert.equal(Object.hasOwn(result, "paymentStatus"), false);
  assert.equal(Object.hasOwn(result, "assignedEmployeeAuthUid"), false);
  assert.equal(Object.hasOwn(result, "customerSnapshot"), false);
});

test("active job and execution flow does not use legacy checklist or direct Firestore APIs", () => {
  const sourceFiles = [
    path.resolve(__dirname, "..", "employeeJobs.js"),
    path.resolve(__dirname, "..", "employeeJobsClient.js"),
    path.resolve(__dirname, "..", "employeeFieldExecution.js"),
    path.resolve(__dirname, "..", "employeeFieldExecutionClient.js"),
    path.resolve(__dirname, "..", "..", "screens", "TodayScreen.jsx"),
    path.resolve(__dirname, "..", "..", "screens", "JobDetailsScreen.jsx"),
    path.resolve(__dirname, "..", "..", "navigation", "AppNavigator.jsx"),
  ];
  const source = sourceFiles.map(file => fs.readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(source, /api\/checklists|ChecklistScreen|checklistItems/);
  assert.doesNotMatch(source, /firebase\/firestore|getDoc|getDocs|onSnapshot|collection\s*\(/);
  assert.doesNotMatch(source, /tenants\s*["'],\s*["']DEFAULT|jobs\s*["'],/);
});
