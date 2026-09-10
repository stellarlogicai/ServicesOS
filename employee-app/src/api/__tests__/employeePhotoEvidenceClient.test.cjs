const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  EmployeePhotoEvidenceError,
  createEmployeePhotoEvidenceClient,
  isEmployeePhotoEvidenceAccessLossError,
  safePhotoMetadata,
} = require("../employeePhotoEvidenceClient");

function snapshot(entries) {
  return { docs: entries.map(([id, data]) => ({ id, data: () => data })) };
}

function validPhoto(overrides = {}) {
  return {
    phase: "before",
    roomLabel: "Kitchen",
    note: "Counter condition",
    contentType: "image/jpeg",
    sizeBytes: 128,
    storagePath: "private-path-must-not-escape",
    uploadedByUid: "employee-private",
    ...overrides,
  };
}

test("safe photo metadata is explicitly allowlisted", () => {
  assert.deepEqual(safePhotoMetadata("photo-a", validPhoto()), {
    id: "photo-a",
    phase: "before",
    roomLabel: "Kitchen",
    note: "Counter condition",
  });
  assert.equal(safePhotoMetadata("photo-a", validPhoto({ phase: "other" })), null);
  assert.equal(safePhotoMetadata("photo-a", validPhoto({ contentType: "application/pdf" })), null);
});

test("only explicit Firestore authorization failures retain an access-loss signal", async () => {
  const denied = createEmployeePhotoEvidenceClient({
    db: "db",
    collection: () => "field-photos-query",
    limit: value => ({ limit: value }),
    query: (...args) => args,
    getDocs: async () => { throw { code: "permission-denied" }; },
  });
  const transient = createEmployeePhotoEvidenceClient({
    db: "db",
    collection: () => "field-photos-query",
    limit: value => ({ limit: value }),
    query: (...args) => args,
    getDocs: async () => { throw new Error("network"); },
  });

  await assert.rejects(denied.listEmployeeFieldPhotos("tenant-a", "booking-a"), error => {
    assert.equal(isEmployeePhotoEvidenceAccessLossError(error), true);
    return true;
  });
  await assert.rejects(transient.listEmployeeFieldPhotos("tenant-a", "booking-a"), error => {
    assert.equal(isEmployeePhotoEvidenceAccessLossError(error), false);
    return true;
  });
});

test("metadata reads only the nested fieldPhotos collection with verified identifiers", async () => {
  const calls = [];
  const api = createEmployeePhotoEvidenceClient({
    db: "db",
    collection: (...args) => {
      calls.push(args);
      return "field-photos-query";
    },
    limit: value => ({ limit: value }),
    query: (...args) => args,
    getDocs: async value => {
      assert.deepEqual(value, ["field-photos-query", { limit: 20 }]);
      return snapshot([["photo-a", validPhoto()], ["invalid", validPhoto({ sizeBytes: 0 })]]);
    },
  });
  assert.deepEqual(await api.listEmployeeFieldPhotos("tenant-a", "booking-a"), [{
    id: "photo-a", phase: "before", roomLabel: "Kitchen", note: "Counter condition",
  }]);
  assert.deepEqual(calls, [["db", "tenants", "tenant-a", "bookings", "booking-a", "fieldPhotos"]]);
  await assert.rejects(api.listEmployeeFieldPhotos("DEFAULT", "booking-a"), EmployeePhotoEvidenceError);
  await assert.rejects(api.listEmployeeFieldPhotos("tenant-a", "booking/a"), EmployeePhotoEvidenceError);
});

test("photo UI code does not import legacy photos or Firebase Storage download APIs", () => {
  const root = path.resolve(__dirname, "..", "..", "..");
  const active = [
    "api/employeePhotoEvidence.js",
    "api/employeePhotoEvidenceClient.js",
    "components/FieldPhotoCapture.jsx",
    "screens/JobDetailsScreen.jsx",
  ].map(file => fs.readFileSync(path.join(root, "src", file), "utf8")).join("\n");
  assert.doesNotMatch(active, /from\s+["']\.\.\/api\/photos|from\s+["'][^"']*\/photos["']/);
  assert.doesNotMatch(active, /getDownloadURL|uploadBytes|uploadString|getBlob/);
  assert.doesNotMatch(active, /fieldPhotoUploadReservations|fieldPhotoUploadControl|fieldPhotoUploadSlots/);
});
