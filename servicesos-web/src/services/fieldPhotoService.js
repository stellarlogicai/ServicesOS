import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import {
  deleteObject,
  getBlob,
  ref,
  uploadBytes,
} from 'firebase/storage';
import { db, storage } from '../firebase';
import { validateImageFile } from './imageCompressionService';

export const FIELD_PHOTO_PHASES = Object.freeze(['before', 'after']);
export const FIELD_PHOTO_ALLOWED_TYPES = Object.freeze([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
export const FIELD_PHOTO_MAX_SIZE_BYTES = 10 * 1024 * 1024;

const EXTENSION_BY_TYPE = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
});

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
  storagePath,
  uploadedByUid,
  contentType,
  sizeBytes,
  clientFileLastModifiedAt,
}) {
  const safePhase = normalizedPhase(phase);
  const extension = EXTENSION_BY_TYPE[contentType];
  if (!extension) throw new Error('Photo type is invalid.');
  const metadata = {
    id: requiredSegment(photoId, 'Photo'),
    phase: safePhase,
    storagePath: requiredText(storagePath, 'Storage path'),
    uploadedAt: serverTimestamp(),
    uploadedByUid: requiredSegment(uploadedByUid, 'Employee'),
    fileName: `${safePhase}-photo.${extension}`,
    contentType,
    sizeBytes,
  };
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

export async function loadFieldPhotoBlob(storagePath) {
  return getBlob(ref(storage, requiredText(storagePath, 'Storage path')));
}

export async function uploadFieldPhoto({ tenantId, bookingId, phase, file, uploadedByUid }) {
  const validation = validateFieldPhoto(file);
  if (!validation.success) return validation;

  const metadataReference = doc(photoCollection(tenantId, bookingId));
  const storagePath = buildFieldPhotoStoragePath(
    tenantId,
    bookingId,
    phase,
    metadataReference.id,
    file.type,
  );
  const storageReference = ref(storage, storagePath);
  const metadata = buildFieldPhotoMetadata({
    photoId: metadataReference.id,
    phase,
    storagePath,
    uploadedByUid,
    contentType: file.type,
    sizeBytes: file.size,
    clientFileLastModifiedAt: file.lastModified,
  });

  try {
    await uploadBytes(storageReference, file, { contentType: file.type });
  } catch (error) {
    console.error('[Field photos] Storage upload failed.', error);
    return { success: false, message: 'Upload failed. Try again.', stage: 'storage' };
  }

  try {
    await setDoc(metadataReference, metadata);
  } catch (error) {
    let cleanupFailed = false;
    try {
      await deleteObject(storageReference);
    } catch (cleanupError) {
      cleanupFailed = true;
      console.error('[Field photos] Orphan cleanup failed.', cleanupError);
    }
    console.error('[Field photos] Metadata write failed.', error);
    return {
      success: false,
      message: 'Upload failed. Try again.',
      stage: 'metadata',
      cleanupFailed,
    };
  }

  return {
    success: true,
    data: {
      ...metadata,
      uploadedAt: new Date(),
    },
  };
}
