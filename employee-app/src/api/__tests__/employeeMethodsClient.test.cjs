const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createEmployeeMethodsClient,
  sanitizeEmployeeMethodRecord,
} = require("../employeeMethodsClient");

function method(overrides = {}) {
  return {
    id: "method-a",
    tenantId: "tenant-a",
    name: "Approved Surface Method",
    classification: "cleaning",
    status: "approved",
    employeeVisible: true,
    intendedUses: ["Sealed counters"],
    compatibleSurfaces: ["Sealed laminate"],
    prohibitedSurfaces: ["Natural stone"],
    requiredTools: ["Clean cloth"],
    requiredPPE: ["Gloves"],
    dwellTime: "Five minutes",
    applicationInstructions: "Apply to the cloth.",
    rinseInstructions: "Rinse clean.",
    dryingInstructions: "Dry immediately.",
    ingredients: ["Water"],
    measurements: ["One cup"],
    formulaVariants: [{ id: "standard", name: "Standard", measurements: ["One cup"], expectedYield: "One cup" }],
    dilutionInstructions: "Use as recorded.",
    mixingOrder: ["Add water."],
    dangerousCombinations: ["Never combine with another cleaner."],
    reviewedBy: "private-admin",
    ownerReviewNotes: "private owner note",
    sourceDefaultId: "private-source",
    createdAt: "private-time",
    ...overrides,
  };
}

function recursiveKeys(value, keys = []) {
  if (Array.isArray(value)) value.forEach(item => recursiveKeys(item, keys));
  else if (value && typeof value === "object") Object.entries(value).forEach(([key, child]) => {
    keys.push(key);
    recursiveKeys(child, keys);
  });
  return keys;
}

test("approved and restricted own-tenant methods are strictly allowlisted", () => {
  for (const status of ["approved", "restricted"]) {
    const result = sanitizeEmployeeMethodRecord(method({ status }), { tenantId: "tenant-a", recordId: "method-a" });
    assert.equal(result.status, status);
    assert.equal(result.name, "Approved Surface Method");
    for (const key of ["tenantId", "employeeVisible", "reviewedBy", "ownerReviewNotes", "sourceDefaultId", "createdAt"]) {
      assert.equal(recursiveKeys(result).includes(key), false, key);
    }
  }
});

test("pending, retired, expired, hidden, cross-tenant, and malformed methods are unavailable", () => {
  for (const record of [
    method({ status: "pending_review" }),
    method({ status: "retired" }),
    method({ status: "expired" }),
    method({ employeeVisible: false }),
    method({ tenantId: "tenant-b" }),
    method({ classification: "unknown" }),
    method({ name: {} }),
  ]) {
    assert.equal(sanitizeEmployeeMethodRecord(record, { tenantId: "tenant-a", recordId: "method-a" }), null);
  }
});

test("method fields and nested formula data are bounded without passing unknown objects", () => {
  const result = sanitizeEmployeeMethodRecord(method({
    intendedUses: Array.from({ length: 40 }, () => "x".repeat(250)),
    applicationInstructions: "a".repeat(1200),
    formulaVariants: Array.from({ length: 12 }, (_, index) => ({
      id: `variant-${index}`,
      name: "Variant",
      measurements: ["m".repeat(250)],
      expectedYield: "y".repeat(250),
      private: { secret: true },
    })),
  }), { tenantId: "tenant-a", recordId: "method-a" });
  assert.equal(result.intendedUses.length, 30);
  assert.equal(result.intendedUses[0].length, 200);
  assert.equal(result.applicationInstructions.length, 1000);
  assert.equal(result.formulaVariants.length, 10);
  assert.deepEqual(Object.keys(result.formulaVariants[0]), ["id", "name", "measurements", "expectedYield"]);
});

test("tenant-scoped reader resolves explicit IDs and drops unavailable records", async () => {
  const calls = [];
  const client = createEmployeeMethodsClient({
    async getRecord(tenantId, recordId) {
      calls.push([tenantId, recordId]);
      if (recordId === "missing") return null;
      return method({ id: recordId });
    },
  });
  const records = await client.getEmployeeMethodsByIds("tenant-a", ["method-a", "missing", "method-a"]);
  assert.deepEqual(calls, [["tenant-a", "method-a"], ["tenant-a", "missing"]]);
  assert.deepEqual(records.map(record => record.id), ["method-a"]);
});

test("invalid or DEFAULT tenant scope fails closed", async () => {
  const client = createEmployeeMethodsClient({ getRecord: async () => method() });
  await assert.rejects(client.getEmployeeMethodsByIds("DEFAULT", ["method-a"]));
  await assert.rejects(client.getEmployeeMethodsByIds("", ["method-a"]));
});
