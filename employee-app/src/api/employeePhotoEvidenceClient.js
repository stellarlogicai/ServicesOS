const FIELD_PHOTO_MAX_PER_BOOKING = 20;
const FIELD_PHOTO_MAX_ROOM_LABEL_LENGTH = 80;
const FIELD_PHOTO_MAX_NOTE_LENGTH = 500;
const FIELD_PHOTO_MAX_SIZE_BYTES = 10 * 1024 * 1024;
const FIELD_PHOTO_PHASES = new Set(["before", "after"]);
const FIELD_PHOTO_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

class EmployeePhotoEvidenceError extends Error {
  constructor(message = "Photo evidence could not be loaded. Try again.") {
    super(message);
    this.name = "EmployeePhotoEvidenceError";
  }
}

function segment(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > 128 || normalized.includes("/") || normalized === "." || normalized === "..") {
    throw new EmployeePhotoEvidenceError();
  }
  return normalized;
}

function optionalText(value, maxLength) {
  if (value == null) return "";
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length <= maxLength ? normalized : null;
}

function safePhotoMetadata(id, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const photoId = segment(id);
  const phase = typeof value.phase === "string" ? value.phase : "";
  const roomLabel = optionalText(value.roomLabel, FIELD_PHOTO_MAX_ROOM_LABEL_LENGTH);
  const note = optionalText(value.note, FIELD_PHOTO_MAX_NOTE_LENGTH);
  if (!FIELD_PHOTO_PHASES.has(phase) || !roomLabel || note === null ||
      !FIELD_PHOTO_CONTENT_TYPES.has(value.contentType) ||
      !Number.isInteger(value.sizeBytes) || value.sizeBytes <= 0 || value.sizeBytes > FIELD_PHOTO_MAX_SIZE_BYTES) {
    return null;
  }
  return { id: photoId, phase, roomLabel, note };
}

function createEmployeePhotoEvidenceClient({ db, collection, getDocs, limit, query }) {
  return {
    async listEmployeeFieldPhotos(tenantId, bookingId) {
      const safeTenantId = segment(tenantId);
      if (safeTenantId === "DEFAULT") throw new EmployeePhotoEvidenceError();
      const safeBookingId = segment(bookingId);
      let snapshot;
      try {
        snapshot = await getDocs(query(
          collection(db, "tenants", safeTenantId, "bookings", safeBookingId, "fieldPhotos"),
          limit(FIELD_PHOTO_MAX_PER_BOOKING)
        ));
      } catch {
        throw new EmployeePhotoEvidenceError();
      }
      if (!Array.isArray(snapshot?.docs)) throw new EmployeePhotoEvidenceError();
      return snapshot.docs
        .map(item => safePhotoMetadata(item?.id, item?.data?.()))
        .filter(Boolean)
        .slice(0, FIELD_PHOTO_MAX_PER_BOOKING);
    },
  };
}

module.exports = {
  EmployeePhotoEvidenceError,
  FIELD_PHOTO_MAX_PER_BOOKING,
  createEmployeePhotoEvidenceClient,
  safePhotoMetadata,
};
