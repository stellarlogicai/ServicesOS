import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  collection: vi.fn(() => ({ kind: 'collection' })),
  doc: vi.fn((...args) => ({ id: args.at(-1)?.kind === 'collection' ? 'photo-generated-1' : args.at(-1) || 'photo-generated-1' })),
  fetch: vi.fn(),
  getBlob: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  ref: vi.fn((_storage, path) => ({ path })),
  serverTimestamp: vi.fn(() => ({ __serverTimestamp: true })),
  setDoc: vi.fn(),
  uploadBytes: vi.fn(),
}));

vi.mock('../firebase', () => ({
  auth: { currentUser: { uid: 'employee-a', getIdToken: vi.fn(() => Promise.resolve('test-token')) } },
  db: { name: 'db' },
  storage: { name: 'storage' },
}));
vi.mock('firebase/firestore', () => ({
  collection: mocks.collection,
  doc: mocks.doc,
  getDoc: mocks.getDoc,
  getDocs: mocks.getDocs,
  serverTimestamp: mocks.serverTimestamp,
  setDoc: mocks.setDoc,
}));
vi.mock('firebase/storage', () => ({
  getBlob: mocks.getBlob,
  ref: mocks.ref,
  uploadBytes: mocks.uploadBytes,
}));

import {
  buildFieldPhotoMetadata,
  buildFieldPhotoStoragePath,
  listFieldPhotosForMarketing,
  setFieldPhotoMarketingApproval,
  uploadFieldPhoto,
  validateFieldPhoto,
  validateFieldPhotoDetails,
} from '../services/fieldPhotoService';
import { auth } from '../firebase';

function imageFile({ name = 'customer-name.jpg', size = 128, type = 'image/jpeg' } = {}) {
  return new File([new Uint8Array(size)], name, { type, lastModified: 1710000000000 });
}

function gatewayResponse(body, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) });
}

function mockSuccessfulGateway(photoId = 'photo-generated-1') {
  mocks.fetch
    .mockResolvedValueOnce(gatewayResponse({
      success: true,
      reservation: {
        photoId,
        storagePath: `tenants/tenant-a/bookings/booking-a/field-photos/before/${photoId}.jpg`,
      },
    }))
    .mockResolvedValueOnce(gatewayResponse({
      success: true,
      photo: {
        id: photoId,
        phase: 'before',
        roomLabel: 'Kitchen',
        storagePath: `tenants/tenant-a/bookings/booking-a/field-photos/before/${photoId}.jpg`,
        uploadedAt: '2026-09-03T12:00:00.000Z',
      },
    }));
}

describe('fieldPhotoService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'demo-servicesos-v1-smoke-local');
    vi.stubEnv('VITE_USE_FUNCTIONS_EMULATOR', 'true');
    vi.stubGlobal('fetch', mocks.fetch);
    auth.currentUser = { uid: 'employee-a', getIdToken: vi.fn(() => Promise.resolve('test-token')) };
    mocks.uploadBytes.mockResolvedValue({});
    mocks.setDoc.mockResolvedValue(undefined);
    mocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ role: 'employee', status: 'active', tenantId: 'tenant-a' }),
    });
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

  it('requires and trims a room label while keeping the note optional', () => {
    expect(validateFieldPhotoDetails()).toEqual({
      success: false,
      message: 'Add a room or area before uploading this photo.',
    });
    expect(validateFieldPhotoDetails({ roomLabel: '   ', note: '' })).toMatchObject({ success: false });
    expect(validateFieldPhotoDetails({ roomLabel: '  Kitchen  ', note: '  Grease behind stove  ' })).toEqual({
      success: true,
      roomLabel: 'Kitchen',
      note: 'Grease behind stove',
    });
    expect(validateFieldPhotoDetails({ roomLabel: 'Kitchen' })).toEqual({
      success: true,
      roomLabel: 'Kitchen',
      note: '',
    });
    expect(validateFieldPhotoDetails({ roomLabel: 'K'.repeat(81) })).toMatchObject({ success: false });
    expect(validateFieldPhotoDetails({ roomLabel: 'Kitchen', note: 'N'.repeat(501) })).toMatchObject({ success: false });
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
      roomLabel: '  Kitchen  ',
      note: '  Grease removed  ',
      storagePath: 'tenants/tenant-a/bookings/booking-a/field-photos/after/photo-generated-1.png',
      uploadedByUid: 'employee-a',
      contentType: 'image/png',
      sizeBytes: 128,
      clientFileLastModifiedAt: 1710000000000,
    });

    expect(metadata).toEqual({
      id: 'photo-generated-1',
      phase: 'after',
      roomLabel: 'Kitchen',
      note: 'Grease removed',
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

  it('reports success only after gateway reservation, Storage upload, and server finalization succeed', async () => {
    mockSuccessfulGateway();
    const result = await uploadFieldPhoto({
      tenantId: 'tenant-a',
      bookingId: 'booking-a',
      phase: 'before',
      roomLabel: 'Kitchen',
      note: '',
      file: imageFile(),
      clientUploadId: 'client-upload-0001',
    });

    expect(result.success).toBe(true);
    expect(mocks.uploadBytes).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.fetch.mock.invocationCallOrder[0]).toBeLessThan(mocks.uploadBytes.mock.invocationCallOrder[0]);
    expect(mocks.uploadBytes.mock.invocationCallOrder[0]).toBeLessThan(mocks.fetch.mock.invocationCallOrder[1]);
    const reserve = JSON.parse(mocks.fetch.mock.calls[0][1].body);
    const finalize = JSON.parse(mocks.fetch.mock.calls[1][1].body);
    expect(reserve).toMatchObject({
      action: 'reserve', tenantId: 'tenant-a', bookingId: 'booking-a', clientUploadId: 'client-upload-0001',
      phase: 'before', roomLabel: 'Kitchen', contentType: 'image/jpeg', sizeBytes: 128,
    });
    expect(finalize).toEqual({
      action: 'finalize', tenantId: 'tenant-a', bookingId: 'booking-a', clientUploadId: 'client-upload-0001',
    });
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it('decorates only matching approved marketing reviews without changing evidence metadata', async () => {
    mocks.getDocs.mockResolvedValue({ docs: [
      { id: 'photo-approved', data: () => ({ phase: 'before', storagePath: 'safe/a.jpg' }) },
      { id: 'photo-unapproved', data: () => ({ phase: 'after', storagePath: 'safe/b.jpg' }) },
    ] });
    mocks.getDoc
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ tenantId: 'tenant-a', bookingId: 'booking-a', photoId: 'photo-approved', status: 'approved' }) })
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ tenantId: 'tenant-a', bookingId: 'booking-a', photoId: 'photo-unapproved', status: 'not_approved' }) });

    await expect(listFieldPhotosForMarketing('tenant-a', 'booking-a')).resolves.toEqual([
      expect.objectContaining({ id: 'photo-approved', marketingApproved: true }),
      expect.objectContaining({ id: 'photo-unapproved', marketingApproved: false }),
    ]);
  });

  it('allows only an authenticated tenant admin to save a separate marketing review record', async () => {
    auth.currentUser = { uid: 'admin-a', getIdToken: vi.fn(() => Promise.resolve('test-token')) };
    mocks.getDoc
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ role: 'admin', status: 'active', tenantId: 'tenant-a' }) })
      .mockResolvedValueOnce({ exists: () => false, data: () => ({}) });

    await expect(setFieldPhotoMarketingApproval({ tenantId: 'tenant-a', bookingId: 'booking-a', photoId: 'photo-a', approved: true }))
      .resolves.toMatchObject({ success: true });
    expect(mocks.setDoc).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      tenantId: 'tenant-a', bookingId: 'booking-a', photoId: 'photo-a', status: 'approved',
      createdByUid: 'admin-a', updatedByUid: 'admin-a',
    }));
  });

  it('rejects missing room metadata before authorization or Storage writes', async () => {
    const result = await uploadFieldPhoto({
      tenantId: 'tenant-a', bookingId: 'booking-a', phase: 'before', roomLabel: '   ', file: imageFile(),
    });

    expect(result).toEqual({ success: false, message: 'Add a room or area before uploading this photo.' });
    expect(mocks.getDoc).not.toHaveBeenCalled();
    expect(mocks.uploadBytes).not.toHaveBeenCalled();
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it('derives a tenant admin uploader from Firebase Auth without changing booking data', async () => {
    auth.currentUser = { uid: 'admin-a', getIdToken: vi.fn(() => Promise.resolve('test-token')) };
    mocks.getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ role: 'admin', status: 'active', tenantId: 'tenant-a' }),
    });

    mockSuccessfulGateway();
    const result = await uploadFieldPhoto({
      tenantId: 'tenant-a', bookingId: 'unassigned-booking', phase: 'after', roomLabel: 'Bathroom', file: imageFile({ type: 'image/png' }),
    });

    expect(result.success).toBe(true);
    expect(mocks.setDoc).not.toHaveBeenCalled();
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toMatchObject({
      tenantId: 'tenant-a', bookingId: 'unassigned-booking', phase: 'after', roomLabel: 'Bathroom', contentType: 'image/png',
    });
  });

  it('rejects unsupported or cross-tenant profiles before Storage is written', async () => {
    mocks.fetch.mockResolvedValueOnce(gatewayResponse({
      success: false, code: 'permission_denied', error: 'Photo upload is unavailable for this account.' }, false));

    const result = await uploadFieldPhoto({
      tenantId: 'tenant-a', bookingId: 'booking-a', phase: 'before', roomLabel: 'Kitchen', file: imageFile(),
    });

    expect(result).toMatchObject({
      success: false, message: 'Photo upload is unavailable for this account.', code: 'permission_denied', stage: 'reserve',
    });
    expect(mocks.uploadBytes).not.toHaveBeenCalled();
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it('does not finalize when Storage upload fails and leaves the reservation retryable', async () => {
    mocks.fetch.mockResolvedValueOnce(gatewayResponse({
      success: true,
      reservation: { photoId: 'photo-generated-1', storagePath: 'tenants/tenant-a/bookings/booking-a/field-photos/before/photo-generated-1.jpg' },
    }));
    mocks.uploadBytes.mockRejectedValueOnce(new Error('storage unavailable'));
    const result = await uploadFieldPhoto({
      tenantId: 'tenant-a', bookingId: 'booking-a', phase: 'before', roomLabel: 'Kitchen', file: imageFile(),
    });
    expect(result).toMatchObject({ success: false, stage: 'storage' });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(result.message).toContain('Retry to verify this same photo');
  });

  it('enforces a server quota rejection before Storage is written', async () => {
    mocks.fetch.mockResolvedValueOnce(gatewayResponse({
      success: false, code: 'photo_quota_exceeded', error: 'This job already has the maximum of 20 photos.' }, false));
    const result = await uploadFieldPhoto({
      tenantId: 'tenant-a', bookingId: 'booking-a', phase: 'before', roomLabel: 'Kitchen', file: imageFile(),
    });
    expect(result).toMatchObject({ success: false, stage: 'reserve', code: 'photo_quota_exceeded' });
    expect(mocks.uploadBytes).not.toHaveBeenCalled();
  });

  it('reuses one client upload identity and recovers a previously uploaded object without another upload', async () => {
    const reservation = {
      photoId: 'photo-generated-1',
      storagePath: 'tenants/tenant-a/bookings/booking-a/field-photos/after/photo-generated-1.jpg',
    };
    mocks.fetch
      .mockResolvedValueOnce(gatewayResponse({ success: true, reservation }))
      .mockResolvedValueOnce(gatewayResponse({
        success: true,
        photo: { id: reservation.photoId, phase: 'after', roomLabel: 'Kitchen', storagePath: reservation.storagePath, uploadedAt: '2026-09-03T12:00:00.000Z' },
      }));
    const result = await uploadFieldPhoto({
      tenantId: 'tenant-a', bookingId: 'booking-a', phase: 'after', roomLabel: 'Kitchen', file: imageFile(),
      clientUploadId: 'client-upload-stable', recoverExisting: true,
    });
    expect(result.success).toBe(true);
    expect(mocks.uploadBytes).not.toHaveBeenCalled();
    expect(mocks.fetch.mock.calls.map(call => JSON.parse(call[1].body).clientUploadId)).toEqual([
      'client-upload-stable', 'client-upload-stable',
    ]);
  });

  it('does not delete an uploaded object when finalization fails', async () => {
    mocks.fetch
      .mockResolvedValueOnce(gatewayResponse({
        success: true,
        reservation: { photoId: 'photo-generated-1', storagePath: 'tenants/tenant-a/bookings/booking-a/field-photos/after/photo-generated-1.jpg' },
      }))
      .mockResolvedValueOnce(gatewayResponse({ success: false, code: 'metadata_conflict', error: 'Finalization failed.' }, false));
    const result = await uploadFieldPhoto({
      tenantId: 'tenant-a', bookingId: 'booking-a', phase: 'after', roomLabel: 'Kitchen', file: imageFile(),
    });
    expect(result).toMatchObject({ success: false, stage: 'finalize', code: 'metadata_conflict' });
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });
});
