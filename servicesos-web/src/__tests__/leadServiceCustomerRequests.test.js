import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => ({
  getDocs: vi.fn(),
  queries: []
}));

vi.mock('../firebase', () => ({ db: { mocked: true } }));
vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  collection: vi.fn((_db, ...segments) => ({ path: segments })),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: firestoreMocks.getDocs,
  orderBy: vi.fn((field, direction) => ({ type: 'orderBy', field, direction })),
  query: vi.fn((collectionRef, ...constraints) => {
    const value = { collectionRef, constraints };
    firestoreMocks.queries.push(value);
    return value;
  }),
  updateDoc: vi.fn(),
  where: vi.fn((field, operator, value) => ({ type: 'where', field, operator, value }))
}));

vi.mock('../shared/logging/errorLoggingStandard', () => ({
  ERROR_CODES: { FIRESTORE_ERROR: 'FIRESTORE_ERROR', NOT_FOUND: 'NOT_FOUND' },
  SEVERITY: { HIGH: 'high' },
  logError: vi.fn()
}));

import { getCustomerOwnedQuoteRequests } from '../core/leads/leadService';

describe('leadService customer request query', () => {
  beforeEach(() => {
    firestoreMocks.queries = [];
    firestoreMocks.getDocs.mockReset();
    firestoreMocks.getDocs.mockResolvedValue({
      docs: [
        { id: 'older', data: () => ({ createdAt: '2026-07-01T12:00:00.000Z' }) },
        { id: 'newer', data: () => ({ createdAt: '2026-07-02T12:00:00.000Z' }) }
      ]
    });
  });

  it('queries Firestore by authenticated UID, request type, and customer-portal source', async () => {
    const result = await getCustomerOwnedQuoteRequests('tenant-a', 'customer-auth');

    expect(firestoreMocks.queries).toHaveLength(1);
    expect(firestoreMocks.queries[0].collectionRef.path).toEqual(['tenants', 'tenant-a', 'leads']);
    expect(firestoreMocks.queries[0].constraints).toEqual([
      { type: 'where', field: 'tenantId', operator: '==', value: 'tenant-a' },
      { type: 'where', field: 'createdByAuthUid', operator: '==', value: 'customer-auth' },
      { type: 'where', field: 'type', operator: '==', value: 'quote_request' },
      { type: 'where', field: 'source', operator: '==', value: 'customer-portal' }
    ]);
    expect(result.success).toBe(true);
    expect(result.data.map(request => request.id)).toEqual(['newer', 'older']);
  });

  it('rejects missing tenant or authenticated UID before querying Firestore', async () => {
    expect((await getCustomerOwnedQuoteRequests('', 'customer-auth')).success).toBe(false);
    expect((await getCustomerOwnedQuoteRequests('tenant-a', '')).success).toBe(false);
    expect(firestoreMocks.getDocs).not.toHaveBeenCalled();
  });
});
