import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  collection: vi.fn(() => ({ kind: 'collection' })),
  deleteObject: vi.fn(),
  doc: vi.fn(() => ({ id: 'photo-generated-1' })),
  getBlob: vi.fn(),
  getDocs: vi.fn(),
  ref: vi.fn((_storage, path) => ({ path })),
  serverTimestamp: vi.fn(() => ({ __serverTimestamp: true })),
  setDoc: vi.fn(),
  uploadBytes: vi.fn(),
}));

vi.mock('../firebase', () => ({ db: { name: 'db' }, storage: { name: 'storage' } }));
vi.mock('firebase/firestore', () => ({
  collection: mocks.collection,
  doc: mocks.doc,
  getDocs: mocks.getDocs,
  serverTimestamp: mocks.serverTimestamp,
  setDoc: mocks.setDoc,
}));
vi.mock('firebase/storage', () => ({
  deleteObject: mocks.deleteObject,
  getBlob: mocks.getBlob,
  ref: mocks.ref,
  uploadBytes: mocks.uploadBytes,
}));

import {
  buildFieldPhotoMetadata,
  buildFieldPhotoStoragePath,
  uploadFieldPhoto,
  validateFieldPhoto,
} from '../services/fieldPhotoService';

function imageFile({ name = 'customer-name.jpg', size = 128, type = 'image/jpeg' } = {}) {
  return new File([new Uint8Array(size)], name, { type, lastModified: 1710000000000 });
}

describe('fieldPhotoService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.uploadBytes.mockResolvedValue({});
    mocks.setDoc.mockResolvedValue(undefined);
    mocks.deleteObject.mockResolvedValue(undefined);
  });

  it('validates only non-empty JPEG, PNG, or WebP files up to 10 MB', () => {
    expect(validateFieldPhoto(imageFile())).toEqual({ success: true });
    expect(validateFieldPhoto(imageFile({ type: 'image/png' }))).toEqual({ success: true });
    expect(validateFieldPhoto(imageFile({ type: 'image/webp' }))).toEqual({ success: true });
    expect(validateFieldPhoto(imageFile({ size: 0 }))).toMatchObject({ success: false, message: expect.stringContaining('empty') });
    expect(validateFieldPhoto(imageFile({ type: 'application/pdf' }))).toMatchObject({ success: false });
    expect(validateFieldPhoto(imageFile({ size: (10 * 1024 * 1024) + 1 }))).toMatchObject({
      success: false,
      message: expect.stringContaining('10 MB'),
    });
  });

  it('builds a generated tenant, booking, and phase-scoped path without the original file name', () => {
    const path = buildFieldPhotoStoragePath('tenant-a', 'booking-a', 'before', 'photo-generated-1', 'image/jpeg');
    expect(path).toBe('tenants/tenant-a/bookings/booking-a/field-photos/before/photo-generated-1.jpg');
    expect(path).not.toContain('customer-name');
  });

  it('builds only approved metadata and uses a non-identifying display name', () => {
    const metadata = buildFieldPhotoMetadata({
      photoId: 'photo-generated-1',
      phase: 'after',
      storagePath: 'tenants/tenant-a/bookings/booking-a/field-photos/after/photo-generated-1.png',
      uploadedByUid: 'employee-a',
      contentType: 'image/png',
      sizeBytes: 128,
      clientFileLastModifiedAt: 1710000000000,
    });

    expect(metadata).toEqual({
      id: 'photo-generated-1',
      phase: 'after',
      storagePath: 'tenants/tenant-a/bookings/booking-a/field-photos/after/photo-generated-1.png',
      uploadedAt: { __serverTimestamp: true },
      uploadedByUid: 'employee-a',
      fileName: 'after-photo.png',
      contentType: 'image/png',
      sizeBytes: 128,
      clientFileLastModifiedAt: new Date(1710000000000),
    });
    expect(metadata).not.toHaveProperty('downloadUrl');
    expect(metadata).not.toHaveProperty('customerName');
  });

  it('reports success only after Storage upload and Firestore metadata both succeed', async () => {
    const result = await uploadFieldPhoto({
      tenantId: 'tenant-a',
      bookingId: 'booking-a',
      phase: 'before',
      file: imageFile(),
      uploadedByUid: 'employee-a',
    });

    expect(result.success).toBe(true);
    expect(mocks.uploadBytes).toHaveBeenCalledTimes(1);
    expect(mocks.setDoc).toHaveBeenCalledTimes(1);
    expect(mocks.uploadBytes.mock.invocationCallOrder[0]).toBeLessThan(mocks.setDoc.mock.invocationCallOrder[0]);
    const writtenMetadata = mocks.setDoc.mock.calls[0][1];
    expect(Object.keys(writtenMetadata).sort()).toEqual([
      'clientFileLastModifiedAt',
      'contentType',
      'fileName',
      'id',
      'phase',
      'sizeBytes',
      'storagePath',
      'uploadedAt',
      'uploadedByUid',
    ]);
  });

  it('does not create metadata when Storage upload fails', async () => {
    mocks.uploadBytes.mockRejectedValueOnce(new Error('storage unavailable'));
    const result = await uploadFieldPhoto({
      tenantId: 'tenant-a', bookingId: 'booking-a', phase: 'before', file: imageFile(), uploadedByUid: 'employee-a',
    });
    expect(result).toMatchObject({ success: false, stage: 'storage' });
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it('attempts Storage cleanup when metadata creation fails and never reports fake success', async () => {
    mocks.setDoc.mockRejectedValueOnce(new Error('metadata denied'));
    const result = await uploadFieldPhoto({
      tenantId: 'tenant-a', bookingId: 'booking-a', phase: 'after', file: imageFile(), uploadedByUid: 'employee-a',
    });
    expect(result).toMatchObject({ success: false, stage: 'metadata', cleanupFailed: false });
    expect(mocks.deleteObject).toHaveBeenCalledTimes(1);
  });

  it('reports cleanup failure for diagnostics without reporting upload success', async () => {
    mocks.setDoc.mockRejectedValueOnce(new Error('metadata denied'));
    mocks.deleteObject.mockRejectedValueOnce(new Error('cleanup denied'));
    const result = await uploadFieldPhoto({
      tenantId: 'tenant-a', bookingId: 'booking-a', phase: 'after', file: imageFile(), uploadedByUid: 'employee-a',
    });
    expect(result).toMatchObject({ success: false, stage: 'metadata', cleanupFailed: true });
    expect(result.message).toBe('Upload failed. Try again.');
  });
});
