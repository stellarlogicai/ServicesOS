import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestore = vi.hoisted(() => ({
  docs: [],
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  serverTimestamp: vi.fn(() => 'server-time'),
}));

vi.mock('../firebase', () => ({ db: { name: 'test-db' } }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((...parts) => ({ kind: 'collection', parts })),
  doc: vi.fn((...parts) => {
    if (parts[0]?.kind === 'collection') return { id: 'generated-record', parts: [...parts[0].parts, 'generated-record'] };
    return { id: parts.at(-1), parts };
  }),
  getDoc: firestore.getDoc,
  getDocs: firestore.getDocs,
  serverTimestamp: firestore.serverTimestamp,
  setDoc: firestore.setDoc,
  updateDoc: firestore.updateDoc,
}));

import {
  createTenantCommercialProduct,
  listTenantCommercialProducts,
  reviewTenantCommercialProduct,
  updateTenantCommercialProduct,
} from '../modules/cleaning/products/cleaningProductService';

const completeRecord = {
  id: 'product-one',
  recordType: 'commercial_product',
  scope: 'tenant',
  tenantId: 'tenant-a',
  name: 'Brand Product Original',
  category: 'surface cleaner',
  classification: 'cleaning',
  status: 'pending_review',
  intendedUses: ['Counters'],
  compatibleSurfaces: ['Sealed counters'],
  prohibitedSurfaces: [],
  requiredPPE: ['Gloves'],
  dangerousCombinations: ['Do not mix with bleach'],
  ownerReviewNotes: 'Exact label reviewed.',
  employeeVisible: false,
  brand: 'Brand',
  productName: 'Product',
  variant: 'Original',
  manufacturer: 'Maker',
  containerSize: '24 oz',
  productCategory: 'surface cleaner',
  containerCondition: 'good',
  labelInformationComplete: true,
  labelDirections: 'Follow label.',
  requiresDilution: false,
};

describe('cleaning product service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestore.getDocs.mockResolvedValue({ docs: firestore.docs });
    firestore.setDoc.mockResolvedValue(undefined);
    firestore.updateDoc.mockResolvedValue(undefined);
  });

  it('creates only a tenant-scoped pending commercial product with audit fields', async () => {
    const result = await createTenantCommercialProduct('tenant-a', completeRecord, { actorUid: 'admin-a' });
    expect(result.id).toBe('generated-record');
    expect(result.status).toBe('pending_review');
    expect(result.employeeVisible).toBe(false);
    expect(firestore.setDoc).toHaveBeenCalledWith(expect.objectContaining({ id: 'generated-record' }), expect.objectContaining({
      tenantId: 'tenant-a',
      createdBy: 'admin-a',
      updatedBy: 'admin-a',
      createdAt: 'server-time',
      updatedAt: 'server-time',
    }));
  });

  it('lists only tenant commercial product records in name order', async () => {
    firestore.getDocs.mockResolvedValue({
      docs: [
        { id: 'b', data: () => ({ ...completeRecord, id: 'b', name: 'Zulu' }) },
        { id: 'a', data: () => ({ ...completeRecord, id: 'a', name: 'Alpha' }) },
        { id: 'ignored', data: () => ({ ...completeRecord, recordType: 'company_mix' }) },
      ],
    });
    const records = await listTenantCommercialProducts('tenant-a');
    expect(records.map(record => record.name)).toEqual(['Alpha', 'Zulu']);
  });

  it('reviews through the existing tenant record and writes only review state', async () => {
    firestore.getDoc.mockResolvedValue({ exists: () => true, id: 'product-one', data: () => completeRecord });
    const result = await reviewTenantCommercialProduct('tenant-a', 'product-one', 'approved', {
      actorUid: 'admin-a',
      ownerReviewNotes: 'Approved from exact label.',
    });
    expect(result.status).toBe('approved');
    expect(result.employeeVisible).toBe(true);
    expect(firestore.updateDoc).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      status: 'approved',
      employeeVisible: true,
      reviewedBy: 'admin-a',
      updatedBy: 'admin-a',
    }));
    expect(firestore.updateDoc.mock.calls[0][1]).not.toHaveProperty('paymentStatus');
  });

  it('updates owner-entered details without changing identity or review status', async () => {
    firestore.getDoc.mockResolvedValue({ exists: () => true, id: 'product-one', data: () => completeRecord });
    const result = await updateTenantCommercialProduct(
      'tenant-a',
      'product-one',
      { labelDirections: 'Corrected exact label directions.', status: 'approved', tenantId: 'tenant-b' },
      { actorUid: 'admin-a' },
    );
    expect(result.labelDirections).toBe('Corrected exact label directions.');
    expect(result.status).toBe('pending_review');
    expect(result.tenantId).toBe('tenant-a');
    expect(firestore.updateDoc.mock.calls[0][1]).not.toHaveProperty('paymentStatus');
  });
});
