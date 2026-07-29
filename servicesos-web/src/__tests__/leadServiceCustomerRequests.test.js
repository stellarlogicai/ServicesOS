import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => ({
  addDoc: vi.fn(),
  getDocs: vi.fn(),
  queries: []
}));

vi.mock('../firebase', () => ({ db: { mocked: true } }));
vi.mock('firebase/firestore', () => ({
  addDoc: firestoreMocks.addDoc,
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

import { createLead, getCustomerOwnedQuoteRequests } from '../core/leads/leadService';

describe('leadService customer request query', () => {
  beforeEach(() => {
    firestoreMocks.queries = [];
    firestoreMocks.addDoc.mockReset();
    firestoreMocks.addDoc.mockResolvedValue({ id: 'lead-created' });
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

  it('persists the trusted path tenant and complete lead creation state', async () => {
    const result = await createLead('tenant-a', {
      tenantId: 'tenant-untrusted',
      source: 'admin',
      booking: null
    });

    expect(firestoreMocks.addDoc).toHaveBeenCalledWith(
      { path: ['tenants', 'tenant-a', 'leads'] },
      expect.objectContaining({
        tenantId: 'tenant-a',
        source: 'admin',
        booking: null,
        status: 'new',
        createdAt: expect.any(String),
        updatedAt: expect.any(String)
      })
    );
    const persistedLead = firestoreMocks.addDoc.mock.calls[0][1];
    expect(persistedLead.createdAt).toBe(persistedLead.updatedAt);
    expect(persistedLead).not.toHaveProperty('payment');
    expect(persistedLead).not.toHaveProperty('stripeSessionId');
    expect(result).toMatchObject({
      success: true,
      data: {
        id: 'lead-created',
        tenantId: 'tenant-a',
        status: 'new',
        booking: null
      }
    });
  });

  it.each([undefined, null, '', '   '])('rejects missing tenant context before writing: %s', async tenantId => {
    const result = await createLead(tenantId, { source: 'admin' });

    expect(result.success).toBe(false);
    expect(firestoreMocks.addDoc).not.toHaveBeenCalled();
  });
});
