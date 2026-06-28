import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => ({
  addDoc: vi.fn(),
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn(),
}));

const loggingMocks = vi.hoisted(() => ({
  logError: vi.fn(),
}));

vi.mock('../firebase', () => ({ db: { id: 'db-test' } }));
vi.mock('firebase/firestore', () => firestoreMocks);
vi.mock('../shared/logging/errorLoggingStandard', () => ({
  ERROR_CODES: { FIRESTORE_ERROR: 'FIRESTORE_ERROR' },
  SEVERITY: { HIGH: 'high' },
  logError: loggingMocks.logError,
}));

import { getJobs } from '../core/scheduling/schedulingService';

describe('Bookings admin-list audit service boundary', () => {
  beforeEach(() => {
    Object.values(firestoreMocks).forEach(mock => mock.mockReset());
    loggingMocks.logError.mockReset();
    firestoreMocks.collection.mockImplementation((db, ...path) => ({ db, path }));
    firestoreMocks.orderBy.mockReturnValue({ field: 'date', direction: 'desc' });
    firestoreMocks.query.mockImplementation((collectionRef, ...constraints) => ({
      collectionRef,
      constraints,
    }));
    firestoreMocks.getDocs.mockResolvedValue({ docs: [] });
  });

  it('reads bookings only from the active tenant collection', async () => {
    firestoreMocks.getDocs.mockResolvedValue({
      docs: [{
        id: 'booking-messy',
        data: () => ({ status: null }),
      }],
    });

    const result = await getJobs('tenant-test');

    expect(firestoreMocks.collection).toHaveBeenCalledWith(
      { id: 'db-test' },
      'tenants',
      'tenant-test',
      'bookings'
    );
    expect(result).toMatchObject({
      success: true,
      data: [{ id: 'booking-messy', status: null }],
    });
  });

  it('returns a stable empty result when the tenant has no bookings', async () => {
    const result = await getJobs('tenant-empty');

    expect(result).toMatchObject({ success: true, data: [] });
  });

  it('rejects a missing tenant before attempting a Firestore read', async () => {
    const result = await getJobs(null);

    expect(result).toMatchObject({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Tenant ID is required',
    });
    expect(firestoreMocks.collection).not.toHaveBeenCalled();
  });

  it('returns a clear service error when the booking load fails', async () => {
    firestoreMocks.getDocs.mockRejectedValue(new Error('permission-denied'));

    const result = await getJobs('tenant-denied');

    expect(result).toMatchObject({
      success: false,
      error: 'FIRESTORE_ERROR',
      message: 'Failed to load jobs',
    });
    expect(loggingMocks.logError).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-denied' })
    );
  });
});
