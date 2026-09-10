const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  FIELD_PHOTO_MAX_SIZE_BYTES,
  createFieldPhotoClient,
  createFieldPhotoClientUploadId,
} = require("../fieldPhotosClient");

const runtimeConfig = { mode: "production", projectId: "example-servicesos", emulator: null };
const identity = {
  tenantId: "tenant-a",
  bookingId: "booking-a",
  clientUploadId: "field_photo_upload_0001",
};
const asset = {
  uri: "file:///device-cache/photo.jpg",
  mimeType: "image/jpeg",
  fileSize: 128,
};
const reserveInput = {
  ...identity,
  phase: "before",
  roomLabel: "Kitchen",
  note: "Before work",
  asset,
};
const reservation = {
  photoId: "photo-a",
  fileName: "photo-a.jpg",
  phase: "before",
  storagePath: "tenants/tenant-a/bookings/booking-a/field-photos/before/photo-a.jpg",
  contentType: "image/jpeg",
  sizeBytes: 128,
  status: "reserved",
  maxPhotos: 20,
  usedSlots: 1,
};
const upload = {
  sessionUrl: "https://storage.example.test/fake-resumable-session",
  storagePath: reservation.storagePath,
  contentType: reservation.contentType,
  sizeBytes: reservation.sizeBytes,
};
const photo = {
  id: "photo-a",
  phase: "before",
  roomLabel: "Kitchen",
  note: "Before work",
  storagePath: reservation.storagePath,
  uploadedAt: "2026-09-03T12:00:00.000Z",
  uploadedByUid: "employee-a",
  fileName: "before-photo.jpg",
  contentType: "image/jpeg",
  sizeBytes: 128,
};

function response(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

function successFor(body, { reused = false } = {}) {
  if (body.action === "reserve") {
    return response({ success: true, action: "reserve", reused, reservation });
  }
  if (body.action === "create_upload_session") {
    return response({ success: true, action: "create_upload_session", upload });
  }
  return response({ success: true, action: "finalize", photo });
}

function harness({ user = { getIdToken: async () => "firebase-token" }, fetchHandler, uploadHandler } = {}) {
  const fetchCalls = [];
  const uploadCalls = [];
  const api = createFieldPhotoClient({
    auth: { currentUser: user },
    runtimeConfig,
    fetchImpl: async (...args) => {
      fetchCalls.push(args);
      const body = JSON.parse(args[1].body);
      return fetchHandler ? fetchHandler(body, fetchCalls.length) : successFor(body);
    },
    uploadFileAsync: async (...args) => {
      uploadCalls.push(args);
      return uploadHandler ? uploadHandler(...args) : { status: 200, body: "" };
    },
    binaryUploadType: 0,
    foregroundSessionType: 1,
  });
  return { api, fetchCalls, uploadCalls };
}

test("mobile photo gateway calls require an authenticated Firebase user", async () => {
  const { api, fetchCalls } = harness({ user: null });
  await assert.rejects(api.reserveFieldPhotoUpload(reserveInput), error => error.code === "unauthenticated");
  assert.equal(fetchCalls.length, 0);
});

test("reserve sends a Bearer token and the exact validated request", async () => {
  const { api, fetchCalls } = harness();
  await api.reserveFieldPhotoUpload(reserveInput);
  assert.equal(fetchCalls[0][0], "https://us-central1-example-servicesos.cloudfunctions.net/fieldPhotoUploadGateway");
  assert.equal(fetchCalls[0][1].headers.Authorization, "Bearer firebase-token");
  assert.deepEqual(JSON.parse(fetchCalls[0][1].body), {
    action: "reserve",
    tenantId: "tenant-a",
    bookingId: "booking-a",
    clientUploadId: "field_photo_upload_0001",
    phase: "before",
    roomLabel: "Kitchen",
    note: "Before work",
    contentType: "image/jpeg",
    sizeBytes: 128,
  });
});

test("session and finalize requests contain only reservation identity", async () => {
  const { api, fetchCalls } = harness();
  await api.createFieldPhotoUploadSession(identity);
  await api.finalizeFieldPhotoUpload(identity);
  assert.deepEqual(JSON.parse(fetchCalls[0][1].body), { action: "create_upload_session", ...identity });
  assert.deepEqual(JSON.parse(fetchCalls[1][1].body), { action: "finalize", ...identity });
  for (const call of fetchCalls) {
    assert.equal(call[1].headers.Authorization, "Bearer firebase-token");
    const body = JSON.parse(call[1].body);
    for (const key of ["uid", "role", "employeeId", "assignedEmployeeAuthUid", "storagePath", "contentType", "sizeBytes"]) {
      assert.equal(Object.hasOwn(body, key), false, key);
    }
  }
});

test("caller cannot add or override server-owned upload-session fields", async () => {
  const { api, fetchCalls } = harness();
  await assert.rejects(api.createFieldPhotoUploadSession({ ...identity, storagePath: "other/path" }));
  await assert.rejects(api.createFieldPhotoUploadSession({ ...identity, contentType: "image/png" }));
  await assert.rejects(api.createFieldPhotoUploadSession({ ...identity, sizeBytes: 1 }));
  assert.equal(fetchCalls.length, 0);
});

test("local file validation rejects invalid phase, labels, notes, MIME, URI, and size", async () => {
  const { api, fetchCalls } = harness();
  for (const input of [
    { ...reserveInput, phase: "during" },
    { ...reserveInput, roomLabel: " " },
    { ...reserveInput, note: "x".repeat(501) },
    { ...reserveInput, asset: { ...asset, mimeType: "application/pdf" } },
    { ...reserveInput, asset: { ...asset, uri: "https://example.test/photo.jpg" } },
    { ...reserveInput, asset: { ...asset, fileSize: 0 } },
    { ...reserveInput, asset: { ...asset, fileSize: FIELD_PHOTO_MAX_SIZE_BYTES + 1 } },
  ]) await assert.rejects(api.reserveFieldPhotoUpload(input), error => error.code === "invalid_request");
  assert.equal(fetchCalls.length, 0);
});

test("client upload identifiers are stable-format non-secret values", () => {
  const value = createFieldPhotoClientUploadId();
  assert.match(value, /^[A-Za-z0-9_-]{16,128}$/);
});

test("native upload sends the local file as one binary PUT to the returned session URL", async () => {
  const { api, uploadCalls } = harness();
  const result = await api.uploadReservedFieldPhotoBinary(asset, upload);
  assert.deepEqual(result, { status: 200 });
  assert.deepEqual(uploadCalls, [[
    upload.sessionUrl,
    asset.uri,
    {
      httpMethod: "PUT",
      uploadType: 0,
      sessionType: 1,
      headers: { "Content-Length": "128", "Content-Type": "image/jpeg" },
    },
  ]]);
});

test("native upload rejects a local file that does not match the reserved MIME or size", async () => {
  const { api, uploadCalls } = harness();
  await assert.rejects(api.uploadReservedFieldPhotoBinary({ ...asset, mimeType: "image/png" }, upload));
  await assert.rejects(api.uploadReservedFieldPhotoBinary({ ...asset, fileSize: 127 }, upload));
  assert.equal(uploadCalls.length, 0);
});

test("new upload completes reserve, session, binary PUT, then authoritative finalize", async () => {
  const { api, fetchCalls, uploadCalls } = harness();
  const result = await api.uploadFieldPhoto(reserveInput);
  assert.deepEqual(result, photo);
  assert.deepEqual(fetchCalls.map(call => JSON.parse(call[1].body).action), [
    "reserve", "create_upload_session", "finalize",
  ]);
  assert.equal(uploadCalls.length, 1);
});

test("binary upload success followed by finalize failure is never reported as success", async () => {
  const { api, fetchCalls } = harness({
    fetchHandler: body => body.action === "finalize"
      ? response({ success: false, code: "storage_verification_failed" }, 502)
      : successFor(body),
  });
  await assert.rejects(api.uploadFieldPhoto(reserveInput), error => error.code === "storage_verification_failed");
  assert.deepEqual(fetchCalls.map(call => JSON.parse(call[1].body).action), [
    "reserve", "create_upload_session", "finalize",
  ]);
});

test("uncertain retry attempts finalize first and returns without another upload when finalized", async () => {
  const { api, fetchCalls, uploadCalls } = harness({
    fetchHandler: body => successFor(body, { reused: body.action === "reserve" }),
  });
  const result = await api.uploadFieldPhoto(reserveInput);
  assert.deepEqual(result, photo);
  assert.deepEqual(fetchCalls.map(call => JSON.parse(call[1].body).action), ["reserve", "finalize"]);
  assert.equal(uploadCalls.length, 0);
});

test("object-missing retry reuses the same slot and client upload ID", async () => {
  let finalizeCount = 0;
  const { api, fetchCalls, uploadCalls } = harness({
    fetchHandler: body => {
      if (body.action === "reserve") return successFor(body, { reused: true });
      if (body.action === "finalize" && finalizeCount++ === 0) {
        return response({ success: false, code: "photo_object_missing" }, 404);
      }
      return successFor(body);
    },
  });
  const result = await api.uploadFieldPhoto(reserveInput);
  assert.deepEqual(result, photo);
  assert.deepEqual(fetchCalls.map(call => JSON.parse(call[1].body).action), [
    "reserve", "finalize", "create_upload_session", "finalize",
  ]);
  for (const call of fetchCalls) {
    assert.equal(JSON.parse(call[1].body).clientUploadId, identity.clientUploadId);
  }
  assert.equal(uploadCalls.length, 1);
});

test("server session mismatch fails before binary upload", async () => {
  const { api, uploadCalls } = harness({
    fetchHandler: body => body.action === "create_upload_session"
      ? response({ success: true, action: body.action, upload: { ...upload, storagePath: "other/path" } })
      : successFor(body),
  });
  await assert.rejects(api.uploadFieldPhoto(reserveInput), error => error.code === "field_photo_upload_failed");
  assert.equal(uploadCalls.length, 0);
});

test("production rejects non-HTTPS session capabilities", async () => {
  const { api } = harness({
    fetchHandler: body => response({
      success: true,
      action: body.action,
      upload: { ...upload, sessionUrl: "http://storage.example.test/session" },
    }),
  });
  await assert.rejects(api.createFieldPhotoUploadSession(identity));
});

test("mobile transport source uses no Firebase JS Storage upload, download URL, persistence, or logging", () => {
  const files = [
    path.resolve(__dirname, "..", "fieldPhotos.js"),
    path.resolve(__dirname, "..", "fieldPhotosClient.js"),
  ];
  const source = files.map(file => fs.readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(source, /firebase\/storage|uploadBytes|uploadBytesResumable|uploadString|getDownloadURL/);
  assert.doesNotMatch(source, /AsyncStorage|console\.(?:log|info|warn|error)/);
  assert.match(source, /expo-file-system/);
  assert.match(source, /httpMethod:\s*"PUT"/);
});

test("legacy photos module remains dormant and is not imported by active Employee App code", () => {
  const sourceRoot = path.resolve(__dirname, "..", "..");
  const files = [];
  const walk = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (/\.(?:js|jsx)$/.test(entry.name) && !fullPath.endsWith(`${path.sep}api${path.sep}photos.js`)) files.push(fullPath);
    }
  };
  walk(sourceRoot);
  const source = files.map(file => fs.readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(source, /from\s+["'][^"']*\/photos["']|require\(["'][^"']*\/photos["']\)/);
  assert.doesNotMatch(source, /pickAndUploadJobPhoto|getJobPhotos/);
});
