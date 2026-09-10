const { buildEmployeeFunctionUrl } = require("./employeeSessionClient");

const FIELD_PHOTO_FUNCTION_NAME = "fieldPhotoUploadGateway";
const FIELD_PHOTO_MAX_SIZE_BYTES = 10 * 1024 * 1024;
const FIELD_PHOTO_MAX_ROOM_LABEL_LENGTH = 80;
const FIELD_PHOTO_MAX_NOTE_LENGTH = 500;
const FIELD_PHOTO_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const FIELD_PHOTO_PHASES = new Set(["before", "after"]);

class FieldPhotoClientError extends Error {
  constructor(message, code = "field_photo_upload_failed", status = 0, stage = "request") {
    super(message);
    this.name = "FieldPhotoClientError";
    this.code = code;
    this.status = status;
    this.stage = stage;
  }
}

function exactKeys(value, allowed, required = allowed) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return required.every(key => keys.includes(key)) && keys.every(key => allowed.includes(key));
}

function invalidRequest(message = "The selected photo cannot be uploaded.") {
  throw new FieldPhotoClientError(message, "invalid_request", 400, "validation");
}

function requiredSegment(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > 128 || normalized.includes("/") || normalized === "." || normalized === "..") {
    invalidRequest();
  }
  return normalized;
}

function uploadIdentifier(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(normalized)) invalidRequest();
  return normalized;
}

function boundedTrimmedText(value, maxLength, required = false) {
  if (typeof value !== "string") invalidRequest();
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > maxLength) invalidRequest();
  return normalized;
}

function normalizeAsset(asset) {
  if (!exactKeys(asset, ["uri", "mimeType", "fileSize", "fileName", "width", "height", "assetId", "base64", "duration", "exif", "rotation", "type"], ["uri", "mimeType", "fileSize"])) {
    invalidRequest();
  }
  const uri = typeof asset.uri === "string" ? asset.uri.trim() : "";
  const contentType = typeof asset.mimeType === "string" ? asset.mimeType.trim().toLowerCase() : "";
  if (("type" in asset && asset.type !== "image") ||
      ("rotation" in asset && asset.rotation != null &&
        (!Number.isFinite(asset.rotation) || asset.rotation < 0 || asset.rotation >= 360)) ||
      !uri.startsWith("file://") || !FIELD_PHOTO_CONTENT_TYPES.has(contentType) ||
      !Number.isInteger(asset.fileSize) || asset.fileSize <= 0 || asset.fileSize > FIELD_PHOTO_MAX_SIZE_BYTES) {
    invalidRequest();
  }
  return { uri, contentType, sizeBytes: asset.fileSize };
}

function normalizeReserveInput(input) {
  if (!exactKeys(
    input,
    ["tenantId", "bookingId", "clientUploadId", "phase", "roomLabel", "note", "asset"],
    ["tenantId", "bookingId", "clientUploadId", "phase", "roomLabel", "asset"]
  )) invalidRequest();
  const tenantId = requiredSegment(input.tenantId);
  if (tenantId === "DEFAULT") invalidRequest();
  const phase = typeof input.phase === "string" ? input.phase.trim() : "";
  if (!FIELD_PHOTO_PHASES.has(phase)) invalidRequest();
  const asset = normalizeAsset(input.asset);
  return {
    tenantId,
    bookingId: requiredSegment(input.bookingId),
    clientUploadId: uploadIdentifier(input.clientUploadId),
    phase,
    roomLabel: boundedTrimmedText(input.roomLabel, FIELD_PHOTO_MAX_ROOM_LABEL_LENGTH, true),
    note: boundedTrimmedText(input.note ?? "", FIELD_PHOTO_MAX_NOTE_LENGTH),
    asset,
  };
}

function normalizeIdentity(input) {
  if (!exactKeys(input, ["tenantId", "bookingId", "clientUploadId"])) invalidRequest();
  const tenantId = requiredSegment(input.tenantId);
  if (tenantId === "DEFAULT") invalidRequest();
  return {
    tenantId,
    bookingId: requiredSegment(input.bookingId),
    clientUploadId: uploadIdentifier(input.clientUploadId),
  };
}

function createFieldPhotoClientUploadId() {
  const random = globalThis.crypto?.randomUUID?.().replace(/-/g, "_") ||
    `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
  return `field_photo_${random}`.slice(0, 128);
}

function safeGatewayError(payload, status) {
  const code = typeof payload?.code === "string" && /^[a-z0-9_]{1,64}$/.test(payload.code)
    ? payload.code
    : "field_photo_upload_failed";
  return new FieldPhotoClientError("The photo upload could not be completed. Try again.", code, status);
}

function validateReservationPayload(payload) {
  if (!exactKeys(payload, ["success", "action", "reused", "reservation"]) ||
      payload.success !== true || payload.action !== "reserve" || typeof payload.reused !== "boolean") {
    throw safeGatewayError(null, 502);
  }
  const value = payload.reservation;
  if (!exactKeys(value, ["photoId", "fileName", "phase", "storagePath", "contentType", "sizeBytes", "status", "maxPhotos", "usedSlots"]) ||
      typeof value.photoId !== "string" || typeof value.fileName !== "string" ||
      !FIELD_PHOTO_PHASES.has(value.phase) || typeof value.storagePath !== "string" ||
      !FIELD_PHOTO_CONTENT_TYPES.has(value.contentType) || !Number.isInteger(value.sizeBytes) ||
      value.status !== "reserved" || value.maxPhotos !== 20 || !Number.isInteger(value.usedSlots)) {
    throw safeGatewayError(null, 502);
  }
  return {
    reused: payload.reused,
    reservation: {
      photoId: value.photoId,
      fileName: value.fileName,
      phase: value.phase,
      storagePath: value.storagePath,
      contentType: value.contentType,
      sizeBytes: value.sizeBytes,
      status: value.status,
      maxPhotos: value.maxPhotos,
      usedSlots: value.usedSlots,
    },
  };
}

function validateUploadSessionPayload(payload, runtimeConfig) {
  if (!exactKeys(payload, ["success", "action", "upload"]) ||
      payload.success !== true || payload.action !== "create_upload_session") {
    throw safeGatewayError(null, 502);
  }
  const upload = payload.upload;
  if (!exactKeys(upload, ["sessionUrl", "storagePath", "contentType", "sizeBytes"]) ||
      typeof upload.sessionUrl !== "string" || typeof upload.storagePath !== "string" ||
      !FIELD_PHOTO_CONTENT_TYPES.has(upload.contentType) || !Number.isInteger(upload.sizeBytes)) {
    throw safeGatewayError(null, 502);
  }
  let protocol;
  try {
    protocol = new URL(upload.sessionUrl).protocol;
  } catch {
    throw safeGatewayError(null, 502);
  }
  if (protocol !== "https:" && !(runtimeConfig.mode === "local-emulator" && protocol === "http:")) {
    throw safeGatewayError(null, 502);
  }
  return {
    sessionUrl: upload.sessionUrl,
    storagePath: upload.storagePath,
    contentType: upload.contentType,
    sizeBytes: upload.sizeBytes,
  };
}

function validateFinalizedPhoto(payload) {
  if (!exactKeys(payload, ["success", "action", "photo"]) ||
      payload.success !== true || payload.action !== "finalize") {
    throw safeGatewayError(null, 502);
  }
  const value = payload.photo;
  const allowed = ["id", "phase", "roomLabel", "note", "storagePath", "uploadedAt", "uploadedByUid", "fileName", "contentType", "sizeBytes", "clientFileLastModifiedAt"];
  const required = ["id", "phase", "roomLabel", "storagePath", "uploadedAt", "uploadedByUid", "fileName", "contentType", "sizeBytes"];
  if (!exactKeys(value, allowed, required) || typeof value.id !== "string" ||
      !FIELD_PHOTO_PHASES.has(value.phase) || typeof value.roomLabel !== "string" ||
      ("note" in value && typeof value.note !== "string") || typeof value.storagePath !== "string" ||
      typeof value.uploadedAt !== "string" || typeof value.uploadedByUid !== "string" ||
      typeof value.fileName !== "string" || !FIELD_PHOTO_CONTENT_TYPES.has(value.contentType) ||
      !Number.isInteger(value.sizeBytes)) {
    throw safeGatewayError(null, 502);
  }
  return Object.fromEntries(allowed.filter(key => key in value).map(key => [key, value[key]]));
}

function createFieldPhotoClient({
  auth,
  runtimeConfig,
  fetchImpl,
  uploadFileAsync,
  binaryUploadType = 0,
  foregroundSessionType = 1,
}) {
  async function gatewayRequest(body) {
    const user = auth.currentUser;
    if (!user || typeof user.getIdToken !== "function") {
      throw new FieldPhotoClientError("Sign in to upload a photo.", "unauthenticated", 401);
    }
    let token;
    try {
      token = await user.getIdToken();
    } catch {
      throw new FieldPhotoClientError("The photo upload could not be authorized. Try again.", "unauthenticated", 401);
    }
    let response;
    try {
      response = await fetchImpl(
        buildEmployeeFunctionUrl(runtimeConfig, FIELD_PHOTO_FUNCTION_NAME),
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
    } catch {
      throw new FieldPhotoClientError("The photo upload could not be completed. Try again.");
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success !== true) throw safeGatewayError(payload, response.status);
    return payload;
  }

  async function reserveFieldPhotoUpload(input) {
    const value = normalizeReserveInput(input);
    const payload = await gatewayRequest({
      action: "reserve",
      tenantId: value.tenantId,
      bookingId: value.bookingId,
      clientUploadId: value.clientUploadId,
      phase: value.phase,
      roomLabel: value.roomLabel,
      note: value.note,
      contentType: value.asset.contentType,
      sizeBytes: value.asset.sizeBytes,
    });
    return validateReservationPayload(payload);
  }

  async function createFieldPhotoUploadSession(input) {
    const value = normalizeIdentity(input);
    const payload = await gatewayRequest({ action: "create_upload_session", ...value });
    return validateUploadSessionPayload(payload, runtimeConfig);
  }

  async function uploadReservedFieldPhotoBinary(assetInput, upload) {
    const asset = normalizeAsset(assetInput);
    if (!exactKeys(upload, ["sessionUrl", "storagePath", "contentType", "sizeBytes"]) ||
        upload.contentType !== asset.contentType || upload.sizeBytes !== asset.sizeBytes) {
      invalidRequest();
    }
    let result;
    try {
      result = await uploadFileAsync(upload.sessionUrl, asset.uri, {
        httpMethod: "PUT",
        uploadType: binaryUploadType,
        sessionType: foregroundSessionType,
        headers: {
          "Content-Length": String(upload.sizeBytes),
          "Content-Type": upload.contentType,
        },
      });
    } catch {
      throw new FieldPhotoClientError("The photo bytes could not be uploaded. Try again.", "photo_binary_upload_failed", 0, "upload");
    }
    if (![200, 201].includes(result?.status)) {
      throw new FieldPhotoClientError("The photo bytes could not be uploaded. Try again.", "photo_binary_upload_failed", result?.status || 0, "upload");
    }
    return { status: result.status };
  }

  async function finalizeFieldPhotoUpload(input) {
    const value = normalizeIdentity(input);
    return validateFinalizedPhoto(await gatewayRequest({ action: "finalize", ...value }));
  }

  async function uploadFieldPhoto(input) {
    const value = normalizeReserveInput(input);
    const identity = {
      tenantId: value.tenantId,
      bookingId: value.bookingId,
      clientUploadId: value.clientUploadId,
    };
    const reserved = await reserveFieldPhotoUpload(input);
    if (reserved.reused) {
      try {
        return await finalizeFieldPhotoUpload(identity);
      } catch (error) {
        if (error.code !== "photo_object_missing") throw error;
      }
    }
    const upload = await createFieldPhotoUploadSession(identity);
    if (upload.storagePath !== reserved.reservation.storagePath ||
        upload.contentType !== reserved.reservation.contentType ||
        upload.sizeBytes !== reserved.reservation.sizeBytes) {
      throw safeGatewayError(null, 502);
    }
    await uploadReservedFieldPhotoBinary({
      uri: value.asset.uri,
      mimeType: value.asset.contentType,
      fileSize: value.asset.sizeBytes,
    }, upload);
    return finalizeFieldPhotoUpload(identity);
  }

  return {
    createFieldPhotoUploadSession,
    finalizeFieldPhotoUpload,
    reserveFieldPhotoUpload,
    uploadFieldPhoto,
    uploadReservedFieldPhotoBinary,
  };
}

module.exports = {
  FIELD_PHOTO_CONTENT_TYPES,
  FIELD_PHOTO_MAX_NOTE_LENGTH,
  FIELD_PHOTO_MAX_ROOM_LABEL_LENGTH,
  FIELD_PHOTO_MAX_SIZE_BYTES,
  FieldPhotoClientError,
  createFieldPhotoClient,
  createFieldPhotoClientUploadId,
  normalizeReserveInput,
};
