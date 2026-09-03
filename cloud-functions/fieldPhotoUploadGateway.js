const crypto = require('node:crypto');
const { FieldValue } = require('firebase-admin/firestore');

const FIELD_PHOTO_MAX_PER_BOOKING = 20;
const FIELD_PHOTO_MAX_SIZE_BYTES = 10 * 1024 * 1024;
const FIELD_PHOTO_LEGACY_READ_LIMIT = FIELD_PHOTO_MAX_PER_BOOKING + 1;
const FIELD_PHOTO_RESERVATIONS_FIELD = 'fieldPhotoUploadReservations';
const ALLOWED_CONTENT_TYPES = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
});
const ALLOWED_ORIGINS = new Set([
  'https://servicesos.netlify.app',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
]);

class FieldPhotoUploadError extends Error {
  constructor(message, { code = 'field_photo_upload_failed', status = 400 } = {}) {
    super(message);
    this.name = 'FieldPhotoUploadError';
    this.code = code;
    this.status = status;
  }
}

function cleanString(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength + 1) : '';
}

function requiredSegment(value, label) {
  const normalized = cleanString(value, 128);
  if (!normalized || normalized.length > 128 || normalized.includes('/')) {
    throw new FieldPhotoUploadError(`${label} is invalid.`, { code: 'invalid_request' });
  }
  return normalized;
}

function exactKeys(value, allowed, required) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return required.every(key => keys.includes(key)) && keys.every(key => allowed.includes(key));
}

function normalizeGatewayRequest(body = {}) {
  const action = cleanString(body.action, 16);
  const common = ['action', 'tenantId', 'bookingId', 'clientUploadId'];
  const reserveOnly = ['phase', 'roomLabel', 'note', 'contentType', 'sizeBytes', 'clientFileLastModifiedAt'];
  const allowed = action === 'reserve' ? [...common, ...reserveOnly] : common;
  if (!['reserve', 'finalize'].includes(action) || !exactKeys(body, allowed, common)) {
    throw new FieldPhotoUploadError('The field-photo upload request is invalid.', { code: 'invalid_request' });
  }

  const request = {
    action,
    tenantId: requiredSegment(body.tenantId, 'Tenant'),
    bookingId: requiredSegment(body.bookingId, 'Booking'),
    clientUploadId: requiredSegment(body.clientUploadId, 'Upload identifier'),
  };
  if (request.tenantId === 'DEFAULT' || !/^[A-Za-z0-9_-]{16,128}$/.test(request.clientUploadId)) {
    throw new FieldPhotoUploadError('The field-photo upload request is invalid.', { code: 'invalid_request' });
  }
  if (action === 'finalize') return request;

  const phase = cleanString(body.phase, 16);
  const roomLabel = cleanString(body.roomLabel, 80);
  const note = cleanString(body.note, 500);
  const contentType = cleanString(body.contentType, 64);
  if (!['before', 'after'].includes(phase) || !roomLabel || roomLabel.length > 80 ||
      (body.note != null && typeof body.note !== 'string') || note.length > 500 ||
      !Object.hasOwn(ALLOWED_CONTENT_TYPES, contentType) ||
      !Number.isInteger(body.sizeBytes) || body.sizeBytes <= 0 || body.sizeBytes > FIELD_PHOTO_MAX_SIZE_BYTES) {
    throw new FieldPhotoUploadError('The field-photo upload details are invalid.', { code: 'invalid_request' });
  }
  const lastModified = body.clientFileLastModifiedAt;
  if (lastModified != null && (!Number.isInteger(lastModified) || lastModified <= 0)) {
    throw new FieldPhotoUploadError('The field-photo upload details are invalid.', { code: 'invalid_request' });
  }
  return {
    ...request,
    phase,
    roomLabel,
    ...(note ? { note } : {}),
    contentType,
    sizeBytes: body.sizeBytes,
    ...(lastModified != null ? { clientFileLastModifiedAt: lastModified } : {}),
  };
}

function snapshotExists(snapshot) {
  return typeof snapshot?.exists === 'function' ? snapshot.exists() : snapshot?.exists === true;
}

function snapshotData(snapshot) {
  return snapshotExists(snapshot) ? snapshot.data() || {} : null;
}

function membershipIncludes(membership, uid) {
  if (Array.isArray(membership)) return membership.includes(uid);
  return Boolean(membership && typeof membership === 'object' && membership[uid]);
}

function authorizeFieldPhotoActor({ profile, tenant, booking, tenantId, uid }) {
  if (!profile || !tenant || !booking || profile.status !== 'active') {
    throw new FieldPhotoUploadError('Photo upload is unavailable for this account.', { code: 'forbidden', status: 403 });
  }
  if (profile.role === 'super-admin') return;
  if (profile.tenantId !== tenantId) {
    throw new FieldPhotoUploadError('Photo upload is unavailable for this account.', { code: 'forbidden', status: 403 });
  }
  if (profile.role === 'admin' && membershipIncludes(tenant.adminUsers, uid)) return;
  const validEmployee = profile.role === 'employee' &&
    membershipIncludes(tenant.users, uid) &&
    booking.assignedEmployeeAuthUid === uid &&
    ['scheduled', 'completed'].includes(booking.status) &&
    booking.isArchived !== true && booking.isDeleted !== true;
  if (!validEmployee) {
    throw new FieldPhotoUploadError('Photo upload is unavailable for this account.', { code: 'forbidden', status: 403 });
  }
}

function slotIdentity({ tenantId, bookingId, clientUploadId }) {
  const digest = crypto.createHash('sha256')
    .update(`${tenantId}\n${bookingId}\n${clientUploadId}`, 'utf8')
    .digest('hex');
  return { slotId: `slot-${digest.slice(0, 40)}`, photoId: `photo-${digest.slice(0, 40)}` };
}

function fieldPhotoReferences(db, request) {
  const tenantRef = db.collection('tenants').doc(request.tenantId);
  const bookingRef = tenantRef.collection('bookings').doc(request.bookingId);
  const { slotId, photoId } = slotIdentity(request);
  return {
    tenantRef,
    bookingRef,
    profileRef: db.collection('users').doc(request.uid),
    controlRef: bookingRef.collection('fieldPhotoUploadControl').doc('current'),
    slotRef: bookingRef.collection('fieldPhotoUploadSlots').doc(slotId),
    metadataRef: bookingRef.collection('fieldPhotos').doc(photoId),
    legacyQuery: bookingRef.collection('fieldPhotos').limit(FIELD_PHOTO_LEGACY_READ_LIMIT),
    slotId,
    photoId,
  };
}

function serverTimestamp(admin) {
  return admin.firestore?.FieldValue?.serverTimestamp?.() || FieldValue.serverTimestamp();
}

function buildSlot(request, identity, timestamp) {
  const extension = ALLOWED_CONTENT_TYPES[request.contentType];
  const fileName = `${identity.photoId}.${extension}`;
  const storagePath = `tenants/${request.tenantId}/bookings/${request.bookingId}/field-photos/${request.phase}/${fileName}`;
  return {
    schemaVersion: 1,
    tenantId: request.tenantId,
    bookingId: request.bookingId,
    clientUploadId: request.clientUploadId,
    photoId: identity.photoId,
    fileName,
    phase: request.phase,
    storagePath,
    contentType: request.contentType,
    sizeBytes: request.sizeBytes,
    uploadedByUid: request.uid,
    roomLabel: request.roomLabel,
    ...(request.note ? { note: request.note } : {}),
    ...(request.clientFileLastModifiedAt != null
      ? { clientFileLastModifiedAt: request.clientFileLastModifiedAt }
      : {}),
    status: 'reserved',
    createdAt: timestamp,
    finalizedAt: null,
  };
}

function reservationProjection(slot) {
  return {
    schemaVersion: 1,
    tenantId: slot.tenantId,
    bookingId: slot.bookingId,
    phase: slot.phase,
    fileName: slot.fileName,
    storagePath: slot.storagePath,
    contentType: slot.contentType,
    sizeBytes: slot.sizeBytes,
    uploadedByUid: slot.uploadedByUid,
    status: slot.status,
  };
}

function projectionMatchesSlot(projection, slot) {
  const expected = reservationProjection(slot);
  return Object.keys(expected).every(key => projection?.[key] === expected[key]);
}

function slotMatchesRequest(slot, request) {
  const expected = buildSlot(request, slotIdentity(request), null);
  return ['tenantId', 'bookingId', 'clientUploadId', 'photoId', 'fileName', 'phase', 'storagePath',
    'contentType', 'sizeBytes', 'uploadedByUid', 'roomLabel', 'note', 'clientFileLastModifiedAt']
    .every(key => (slot[key] ?? null) === (expected[key] ?? null));
}

function publicReservation(slot, control) {
  return {
    photoId: slot.photoId,
    fileName: slot.fileName,
    phase: slot.phase,
    storagePath: slot.storagePath,
    contentType: slot.contentType,
    sizeBytes: slot.sizeBytes,
    status: slot.status,
    maxPhotos: FIELD_PHOTO_MAX_PER_BOOKING,
    usedSlots: control.basePhotoCount + control.issuedSlotCount,
  };
}

function validateControl(control, request) {
  return control?.schemaVersion === 1 && control.tenantId === request.tenantId &&
    control.bookingId === request.bookingId && control.maxPhotos === FIELD_PHOTO_MAX_PER_BOOKING &&
    Number.isInteger(control.basePhotoCount) && control.basePhotoCount >= 0 &&
    Number.isInteger(control.issuedSlotCount) && control.issuedSlotCount >= 0;
}

async function reserveFieldPhotoUpload({ admin, requestBody, uid }) {
  const request = { ...normalizeGatewayRequest(requestBody), uid };
  if (request.action !== 'reserve') {
    throw new FieldPhotoUploadError('Reserve action required.', { code: 'invalid_request' });
  }
  const db = admin.firestore();
  const refs = fieldPhotoReferences(db, request);
  return db.runTransaction(async transaction => {
    const [profileSnapshot, tenantSnapshot, bookingSnapshot, controlSnapshot, slotSnapshot] = await Promise.all([
      transaction.get(refs.profileRef),
      transaction.get(refs.tenantRef),
      transaction.get(refs.bookingRef),
      transaction.get(refs.controlRef),
      transaction.get(refs.slotRef),
    ]);
    const profile = snapshotData(profileSnapshot);
    const tenant = snapshotData(tenantSnapshot);
    const booking = snapshotData(bookingSnapshot);
    authorizeFieldPhotoActor({ profile, tenant, booking, tenantId: request.tenantId, uid });

    const existingSlot = snapshotData(slotSnapshot);
    if (existingSlot) {
      if (!slotMatchesRequest(existingSlot, request) || !['reserved', 'finalized'].includes(existingSlot.status)) {
        throw new FieldPhotoUploadError('This upload identifier is already in use.', { code: 'upload_conflict', status: 409 });
      }
      const control = snapshotData(controlSnapshot);
      if (!validateControl(control, request)) {
        throw new FieldPhotoUploadError('The field-photo quota state is unavailable.', { code: 'quota_state_invalid', status: 409 });
      }
      return { reused: true, reservation: publicReservation(existingSlot, control) };
    }

    let control = snapshotData(controlSnapshot);
    if (!control) {
      if (booking[FIELD_PHOTO_RESERVATIONS_FIELD] != null) {
        throw new FieldPhotoUploadError('The field-photo quota state is unavailable.', { code: 'quota_state_invalid', status: 409 });
      }
      const legacySnapshot = await transaction.get(refs.legacyQuery);
      const basePhotoCount = legacySnapshot.size;
      control = {
        schemaVersion: 1,
        tenantId: request.tenantId,
        bookingId: request.bookingId,
        basePhotoCount,
        issuedSlotCount: 0,
        maxPhotos: FIELD_PHOTO_MAX_PER_BOOKING,
        createdAt: serverTimestamp(admin),
        updatedAt: serverTimestamp(admin),
      };
    } else if (!validateControl(control, request)) {
      throw new FieldPhotoUploadError('The field-photo quota state is unavailable.', { code: 'quota_state_invalid', status: 409 });
    }

    if (control.basePhotoCount + control.issuedSlotCount >= FIELD_PHOTO_MAX_PER_BOOKING) {
      throw new FieldPhotoUploadError('This booking has reached the 20-photo limit.', { code: 'photo_quota_exceeded', status: 409 });
    }
    const reservations = booking[FIELD_PHOTO_RESERVATIONS_FIELD] || {};
    if (!reservations || typeof reservations !== 'object' || Array.isArray(reservations) ||
        Object.keys(reservations).length >= FIELD_PHOTO_MAX_PER_BOOKING) {
      throw new FieldPhotoUploadError('The field-photo quota state is unavailable.', { code: 'quota_state_invalid', status: 409 });
    }
    const timestamp = serverTimestamp(admin);
    const slot = buildSlot(request, { slotId: refs.slotId, photoId: refs.photoId }, timestamp);
    const nextControl = { ...control, issuedSlotCount: control.issuedSlotCount + 1, updatedAt: timestamp };
    transaction.set(refs.controlRef, nextControl);
    transaction.create(refs.slotRef, slot);
    transaction.update(refs.bookingRef, {
      [FIELD_PHOTO_RESERVATIONS_FIELD]: {
        ...reservations,
        [slot.fileName]: reservationProjection(slot),
      },
    });
    return { reused: false, reservation: publicReservation(slot, nextControl) };
  });
}

function slotMatchesObject(slot, metadata = {}) {
  const size = Number(metadata.size);
  return (!metadata.name || metadata.name === slot.storagePath) &&
    metadata.contentType === slot.contentType && size === slot.sizeBytes;
}

function metadataMatchesSlot(metadata, slot) {
  return metadata?.id === slot.photoId && metadata.phase === slot.phase &&
    metadata.roomLabel === slot.roomLabel && (metadata.note ?? null) === (slot.note ?? null) &&
    metadata.storagePath === slot.storagePath && metadata.uploadedByUid === slot.uploadedByUid &&
    metadata.fileName === `${slot.phase}-photo.${ALLOWED_CONTENT_TYPES[slot.contentType]}` &&
    metadata.contentType === slot.contentType && metadata.sizeBytes === slot.sizeBytes &&
    (metadata.clientFileLastModifiedAt?.toMillis?.() ?? metadata.clientFileLastModifiedAt?.getTime?.() ?? null) ===
      (slot.clientFileLastModifiedAt ?? null);
}

async function loadReservedSlot({ admin, request, uid }) {
  const db = admin.firestore();
  const refs = fieldPhotoReferences(db, { ...request, uid });
  const [profileSnapshot, tenantSnapshot, bookingSnapshot, slotSnapshot] = await Promise.all([
    refs.profileRef.get(), refs.tenantRef.get(), refs.bookingRef.get(), refs.slotRef.get(),
  ]);
  const profile = snapshotData(profileSnapshot);
  const tenant = snapshotData(tenantSnapshot);
  const booking = snapshotData(bookingSnapshot);
  authorizeFieldPhotoActor({ profile, tenant, booking, tenantId: request.tenantId, uid });
  const slot = snapshotData(slotSnapshot);
  if (!slot || slot.uploadedByUid !== uid || !['reserved', 'finalized'].includes(slot.status)) {
    throw new FieldPhotoUploadError('The field-photo reservation was not found.', { code: 'reservation_not_found', status: 404 });
  }
  return { refs, slot };
}

async function finalizeFieldPhotoUpload({ admin, requestBody, uid }) {
  const request = normalizeGatewayRequest(requestBody);
  if (request.action !== 'finalize') {
    throw new FieldPhotoUploadError('Finalize action required.', { code: 'invalid_request' });
  }
  const { refs, slot } = await loadReservedSlot({ admin, request, uid });
  let objectMetadata;
  try {
    [objectMetadata] = await admin.storage().bucket().file(slot.storagePath).getMetadata();
  } catch (error) {
    if (error?.code === 404 || error?.code === '404') {
      throw new FieldPhotoUploadError('The reserved photo has not reached Storage yet.', { code: 'photo_object_missing', status: 404 });
    }
    throw new FieldPhotoUploadError('The uploaded photo could not be verified.', { code: 'storage_verification_failed', status: 502 });
  }
  if (!slotMatchesObject(slot, objectMetadata)) {
    throw new FieldPhotoUploadError('The uploaded photo does not match its reservation.', { code: 'photo_object_mismatch', status: 409 });
  }

  const db = admin.firestore();
  const finalizedAt = new Date();
  const photo = await db.runTransaction(async transaction => {
    const [profileSnapshot, tenantSnapshot, bookingSnapshot, controlSnapshot, slotSnapshot, metadataSnapshot] = await Promise.all([
      transaction.get(refs.profileRef), transaction.get(refs.tenantRef), transaction.get(refs.bookingRef),
      transaction.get(refs.controlRef), transaction.get(refs.slotRef), transaction.get(refs.metadataRef),
    ]);
    const profile = snapshotData(profileSnapshot);
    const tenant = snapshotData(tenantSnapshot);
    const booking = snapshotData(bookingSnapshot);
    authorizeFieldPhotoActor({ profile, tenant, booking, tenantId: request.tenantId, uid });
    const currentSlot = snapshotData(slotSnapshot);
    const control = snapshotData(controlSnapshot);
    if (!currentSlot || currentSlot.uploadedByUid !== uid || !validateControl(control, request)) {
      throw new FieldPhotoUploadError('The field-photo reservation is unavailable.', { code: 'reservation_not_found', status: 404 });
    }
    const projection = booking[FIELD_PHOTO_RESERVATIONS_FIELD]?.[currentSlot.fileName];
    if (!projectionMatchesSlot(projection, currentSlot)) {
      throw new FieldPhotoUploadError('The field-photo reservation is inconsistent.', { code: 'quota_state_invalid', status: 409 });
    }
    const existingMetadata = snapshotData(metadataSnapshot);
    if (existingMetadata && !metadataMatchesSlot(existingMetadata, currentSlot)) {
      throw new FieldPhotoUploadError('Conflicting field-photo evidence already exists.', { code: 'metadata_conflict', status: 409 });
    }
    if (currentSlot.status === 'finalized' && !existingMetadata) {
      throw new FieldPhotoUploadError('The finalized field-photo evidence is unavailable.', { code: 'quota_state_invalid', status: 409 });
    }
    if (existingMetadata) return existingMetadata;

    const timestamp = serverTimestamp(admin);
    const metadata = {
      id: currentSlot.photoId,
      phase: currentSlot.phase,
      roomLabel: currentSlot.roomLabel,
      ...(currentSlot.note ? { note: currentSlot.note } : {}),
      storagePath: currentSlot.storagePath,
      uploadedAt: timestamp,
      uploadedByUid: currentSlot.uploadedByUid,
      fileName: `${currentSlot.phase}-photo.${ALLOWED_CONTENT_TYPES[currentSlot.contentType]}`,
      contentType: currentSlot.contentType,
      sizeBytes: currentSlot.sizeBytes,
      ...(currentSlot.clientFileLastModifiedAt != null
        ? { clientFileLastModifiedAt: new Date(currentSlot.clientFileLastModifiedAt) }
        : {}),
    };
    transaction.create(refs.metadataRef, metadata);
    transaction.update(refs.slotRef, { status: 'finalized', finalizedAt: timestamp });
    transaction.update(refs.controlRef, { updatedAt: timestamp });
    transaction.update(refs.bookingRef, {
      [FIELD_PHOTO_RESERVATIONS_FIELD]: {
        ...booking[FIELD_PHOTO_RESERVATIONS_FIELD],
        [currentSlot.fileName]: reservationProjection({ ...currentSlot, status: 'finalized' }),
      },
    });
    return metadata;
  });
  return { ...photo, uploadedAt: photo.uploadedAt?.toDate?.() || finalizedAt };
}

function applyCors(req, res) {
  const origin = req.headers?.origin;
  if (ALLOWED_ORIGINS.has(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
  }
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function createFieldPhotoUploadGatewayHandler({ admin }) {
  return async (req, res) => {
    applyCors(req, res);
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed', code: 'method_not_allowed' });
    const authHeader = req.headers?.authorization || req.headers?.Authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required', code: 'unauthenticated' });
    }
    let uid;
    try {
      uid = (await admin.auth().verifyIdToken(authHeader.slice('Bearer '.length).trim())).uid;
    } catch {
      return res.status(401).json({ error: 'Invalid authentication token', code: 'unauthenticated' });
    }
    try {
      const request = normalizeGatewayRequest(req.body);
      if (request.action === 'reserve') {
        const result = await reserveFieldPhotoUpload({ admin, requestBody: req.body, uid });
        return res.status(200).json({ success: true, action: 'reserve', ...result });
      }
      const photo = await finalizeFieldPhotoUpload({ admin, requestBody: req.body, uid });
      return res.status(200).json({ success: true, action: 'finalize', photo });
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 500;
      return res.status(status).json({
        error: status >= 500 ? 'Field-photo upload is temporarily unavailable.' : error.message,
        code: cleanString(error?.code, 64) || 'field_photo_upload_failed',
      });
    }
  };
}

module.exports = {
  FIELD_PHOTO_LEGACY_READ_LIMIT,
  FIELD_PHOTO_MAX_PER_BOOKING,
  FIELD_PHOTO_RESERVATIONS_FIELD,
  FieldPhotoUploadError,
  authorizeFieldPhotoActor,
  createFieldPhotoUploadGatewayHandler,
  finalizeFieldPhotoUpload,
  normalizeGatewayRequest,
  reserveFieldPhotoUpload,
  slotIdentity,
};
