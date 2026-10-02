import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import {
  getBlob,
  ref,
  uploadBytes,
} from 'firebase/storage';
import { auth, db, storage } from '../firebase';
import { validateImageFile } from './imageCompressionService';

export const FIELD_PHOTO_PHASES = Object.freeze(['before', 'after']);
export const FIELD_PHOTO_ALLOWED_TYPES = Object.freeze([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
export const FIELD_PHOTO_MAX_SIZE_BYTES = 10 * 1024 * 1024;
export const FIELD_PHOTO_MAX_PER_BOOKING = 20;
export const FIELD_PHOTO_ROOM_LABEL_MAX_LENGTH = 80;
export const FIELD_PHOTO_NOTE_MAX_LENGTH = 500;
export const FIELD_PHOTO_MARKETING_REVIEW_ID = 'current';
export const FIELD_PHOTO_MARKETING_STATUSES = Object.freeze(['not_approved', 'approved']);

const EXTENSION_BY_TYPE = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
});

function fieldPhotoGatewayUrl() {
  const configuredBaseUrl = import.meta.env.VITE_FUNCTIONS_URL?.replace(/\/+$/, '');
  if (configuredBaseUrl) return `${configuredBaseUrl}/fieldPhotoUploadGateway`;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error('Photo upload server configuration is unavailable.');
  if (import.meta.env.VITE_USE_FUNCTIONS_EMULATOR === 'true') {
    return `http://127.0.0.1:5001/${projectId}/us-central1/fieldPhotoUploadGateway`;
  }
  return `https://us-central1-${projectId}.cloudfunctions.net/fieldPhotoUploadGateway`;
}

export function createFieldPhotoClientUploadId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `photo-upload-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

async function callFieldPhotoGateway(body) {
  const user = auth.currentUser;
  if (!user) {
    const error = new Error('Sign in again before uploading a photo.');
    error.code = 'unauthenticated';
    throw error;
  }
  const token = await user.getIdToken();
  const response = await fetch(fieldPhotoGatewayUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success !== true) {
    const error = new Error(payload.error || 'Photo upload is temporarily unavailable.');
    error.code = payload.code || 'field_photo_upload_failed';
    throw error;
  }
  return payload;
}

function requiredSegment(value, label) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || normalized.includes('/')) {
    throw new Error(`${label} is unavailable.`);
  }
  return normalized;
}

function requiredText(value, label) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new Error(`${label} is unavailable.`);
  return normalized;
}

function normalizedPhase(phase) {
  if (!FIELD_PHOTO_PHASES.includes(phase)) {
    throw new Error('Photo phase is invalid.');
  }
  return phase;
}

export function validateFieldPhotoDetails({ roomLabel, note } = {}) {
  const safeRoomLabel = typeof roomLabel === 'string' ? roomLabel.trim() : '';
  if (!safeRoomLabel) {
    return { success: false, message: 'Add a room or area before uploading this photo.' };
  }
  if (safeRoomLabel.length > FIELD_PHOTO_ROOM_LABEL_MAX_LENGTH) {
    return { success: false, message: 'Room or area must be 80 characters or fewer.' };
  }
  if (note !== undefined && note !== null && typeof note !== 'string') {
    return { success: false, message: 'Photo note is invalid.' };
  }
  const safeNote = typeof note === 'string' ? note.trim() : '';
  if (safeNote.length > FIELD_PHOTO_NOTE_MAX_LENGTH) {
    return { success: false, message: 'Photo note must be 500 characters or fewer.' };
  }
  return { success: true, roomLabel: safeRoomLabel, note: safeNote };
}

export function validateFieldPhoto(file) {
  if (!(file instanceof Blob)) {
    return { success: false, message: 'Choose a JPEG, PNG, or WebP photo.' };
  }
  if (file.size === 0) {
    return { success: false, message: 'The selected photo is empty.' };
  }

  const validation = validateImageFile(file, {
    maxSizeMB: 10,
    allowedTypes: FIELD_PHOTO_ALLOWED_TYPES,
  });
  if (!validation.isValid) {
    const tooLarge = file.size > FIELD_PHOTO_MAX_SIZE_BYTES;
    return {
      success: false,
      message: tooLarge
        ? 'The selected photo is larger than 10 MB.'
        : 'Choose a JPEG, PNG, or WebP photo.',
    };
  }
  return { success: true };
}

export function buildFieldPhotoStoragePath(tenantId, bookingId, phase, photoId, contentType) {
  const safeTenantId = requiredSegment(tenantId, 'Tenant');
  const safeBookingId = requiredSegment(bookingId, 'Booking');
  const safePhotoId = requiredSegment(photoId, 'Photo');
  const safePhase = normalizedPhase(phase);
  const extension = EXTENSION_BY_TYPE[contentType];
  if (!extension) throw new Error('Photo type is invalid.');
  return `tenants/${safeTenantId}/bookings/${safeBookingId}/field-photos/${safePhase}/${safePhotoId}.${extension}`;
}

export function buildFieldPhotoMetadata({
  photoId,
  phase,
  roomLabel,
  note,
  storagePath,
  uploadedByUid,
  contentType,
  sizeBytes,
  clientFileLastModifiedAt,
}) {
  const safePhase = normalizedPhase(phase);
  const details = validateFieldPhotoDetails({ roomLabel, note });
  if (!details.success) throw new Error(details.message);
  const extension = EXTENSION_BY_TYPE[contentType];
  if (!extension) throw new Error('Photo type is invalid.');
  const metadata = {
    id: requiredSegment(photoId, 'Photo'),
    phase: safePhase,
    roomLabel: details.roomLabel,
    storagePath: requiredText(storagePath, 'Storage path'),
    uploadedAt: serverTimestamp(),
    uploadedByUid: requiredSegment(uploadedByUid, 'Employee'),
    fileName: `${safePhase}-photo.${extension}`,
    contentType,
    sizeBytes,
  };
  if (details.note) metadata.note = details.note;
  if (Number.isFinite(clientFileLastModifiedAt) && clientFileLastModifiedAt > 0) {
    metadata.clientFileLastModifiedAt = new Date(clientFileLastModifiedAt);
  }
  return metadata;
}

function photoCollection(tenantId, bookingId) {
  return collection(
    db,
    'tenants',
    requiredSegment(tenantId, 'Tenant'),
    'bookings',
    requiredSegment(bookingId, 'Booking'),
    'fieldPhotos',
  );
}

function photoDocument(tenantId, bookingId, photoId) {
  return doc(photoCollection(tenantId, bookingId), requiredSegment(photoId, 'Photo'));
}

function marketingReviewDocument(tenantId, bookingId, photoId) {
  return doc(photoDocument(tenantId, bookingId, photoId), 'marketingReview', FIELD_PHOTO_MARKETING_REVIEW_ID);
}

function approvedMarketingReview(review, tenantId, bookingId, photoId) {
  return review?.tenantId === tenantId &&
    review?.bookingId === bookingId &&
    review?.photoId === photoId &&
    review?.status === 'approved';
}

export async function listFieldPhotos(tenantId, bookingId) {
  const snapshot = await getDocs(photoCollection(tenantId, bookingId));
  return snapshot.docs
    .map(item => ({ id: item.id, ...item.data() }))
    .filter(photo => FIELD_PHOTO_PHASES.includes(photo.phase))
    .sort((left, right) => {
      const leftTime = left.uploadedAt?.toMillis?.() || 0;
      const rightTime = right.uploadedAt?.toMillis?.() || 0;
      return leftTime - rightTime;
    });
}

export async function listFieldPhotosForMarketing(tenantId, bookingId) {
  const photos = await listFieldPhotos(tenantId, bookingId);
  const reviews = await Promise.all(photos.map(async photo => {
    const snapshot = await getDoc(marketingReviewDocument(tenantId, bookingId, photo.id));
    return snapshot.exists() ? snapshot.data() || {} : null;
  }));
  return photos.map((photo, index) => ({
    ...photo,
    marketingApproved: approvedMarketingReview(reviews[index], tenantId, bookingId, photo.id),
  }));
}

export async function setFieldPhotoMarketingApproval({ tenantId, bookingId, photoId, approved }) {
  const safeTenantId = requiredSegment(tenantId, 'Tenant');
  const safeBookingId = requiredSegment(bookingId, 'Booking');
  const safePhotoId = requiredSegment(photoId, 'Photo');
  const uploader = await resolveFieldPhotoUploader(safeTenantId);
  if (!uploader.success || !['admin', 'super-admin'].includes(uploader.role)) {
    return { success: false, message: 'Marketing approval is unavailable for this account.' };
  }

  const reviewReference = marketingReviewDocument(safeTenantId, safeBookingId, safePhotoId);
  const existing = await getDoc(reviewReference);
  const existingData = existing.exists() ? existing.data() || {} : null;
  const status = approved === true ? 'approved' : 'not_approved';
  const payload = {
    schemaVersion: 1,
    tenantId: safeTenantId,
    bookingId: safeBookingId,
    photoId: safePhotoId,
    status,
    createdByUid: existingData?.createdByUid || uploader.uploadedByUid,
    createdAt: existingData?.createdAt || serverTimestamp(),
    updatedByUid: uploader.uploadedByUid,
    updatedAt: serverTimestamp(),
  };
  try {
    await setDoc(reviewReference, payload);
    return { success: true, data: payload };
  } catch (error) {
    console.error('[Field photos] Marketing approval update failed.', error);
    return { success: false, message: 'Marketing approval could not be saved. Try again.' };
  }
}

export async function loadFieldPhotoBlob(storagePath) {
  return getBlob(ref(storage, requiredText(storagePath, 'Storage path')));
}

async function resolveFieldPhotoUploader(tenantId) {
  const uploadedByUid = auth.currentUser?.uid;
  if (!uploadedByUid) {
    return { success: false, message: 'Sign in again before uploading a photo.' };
  }

  try {
    const profileSnapshot = await getDoc(doc(db, 'users', uploadedByUid));
    if (!profileSnapshot.exists()) {
      return { success: false, message: 'Photo upload is unavailable for this account.' };
    }
    const profile = profileSnapshot.data();
    const supportedRole = ['employee', 'admin', 'super-admin'].includes(profile?.role);
    const active = profile?.status === 'active';
    const tenantMatches = profile?.role === 'super-admin' || profile?.tenantId === tenantId;
    if (!supportedRole || !active || !tenantMatches || tenantId === 'DEFAULT') {
      return { success: false, message: 'Photo upload is unavailable for this account.' };
    }
    return { success: true, uploadedByUid, role: profile.role };
  } catch (error) {
    console.error('[Field photos] Uploader authorization failed.', error);
    return { success: false, message: 'Photo upload could not be authorized. Try again.' };
  }
}

export async function uploadFieldPhoto({
  tenantId,
  bookingId,
  phase,
  roomLabel,
  note,
  file,
  clientUploadId = createFieldPhotoClientUploadId(),
  recoverExisting = false,
}) {
  const details = validateFieldPhotoDetails({ roomLabel, note });
  if (!details.success) return details;
  const validation = validateFieldPhoto(file);
  if (!validation.success) return validation;

  const reserveBody = {
    action: 'reserve',
    tenantId,
    bookingId,
    clientUploadId,
    phase,
    roomLabel: details.roomLabel,
    note: details.note,
    contentType: file.type,
    sizeBytes: file.size,
    ...(Number.isFinite(file.lastModified) && file.lastModified > 0
      ? { clientFileLastModifiedAt: file.lastModified }
      : {}),
  };
  let reservation;
  try {
    reservation = (await callFieldPhotoGateway(reserveBody)).reservation;
  } catch (error) {
    return {
      success: false,
      message: error.message,
      code: error.code,
      stage: 'reserve',
    };
  }

  const finalize = async () => {
    const payload = await callFieldPhotoGateway({ action: 'finalize', tenantId, bookingId, clientUploadId });
    return {
      success: true,
      data: {
        ...payload.photo,
        uploadedAt: new Date(payload.photo.uploadedAt),
      },
    };
  };

  if (recoverExisting) {
    try {
      return await finalize();
    } catch (error) {
      if (error.code !== 'photo_object_missing') {
        return { success: false, message: error.message, code: error.code, stage: 'finalize' };
      }
    }
  }

  const storageReference = ref(storage, reservation.storagePath);

  try {
    await uploadBytes(storageReference, file, { contentType: file.type });
  } catch (error) {
    console.error('[Field photos] Storage upload failed.', error);
    return {
      success: false,
      message: 'Upload status is uncertain. Retry to verify this same photo.',
      stage: 'storage',
    };
  }

  try {
    return await finalize();
  } catch (error) {
    console.error('[Field photos] Finalization failed.', error);
    return {
      success: false,
      message: error.message,
      code: error.code,
      stage: 'finalize',
    };
  }
}
