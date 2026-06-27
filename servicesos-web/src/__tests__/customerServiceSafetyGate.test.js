import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => ({
  collection: vi.fn(),
  doc: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  getDocs: vi.fn(),
  addDoc: vi.fn(),
  getDoc: vi.fn(),
  updateDoc: vi.fn()
}));

vi.mock('../firebase', () => ({ db: { id: 'db-test' } }));

vi.mock('firebase/firestore', () => firestoreMocks);

import {
  createCustomer,
  deleteCustomer,
  getCustomers,
  updateCustomer
} from '../core/customers/customerService';

describe('customer service restoration safety gate', () => {
  beforeEach(() => {
    Object.values(firestoreMocks).forEach(mock => mock.mockReset());
    firestoreMocks.collection.mockImplementation((db, ...path) => ({ db, path }));
    firestoreMocks.doc.mockImplementation((db, ...path) => ({ db, path }));
    firestoreMocks.orderBy.mockReturnValue({ field: 'name' });
    firestoreMocks.query.mockImplementation((collectionRef, ...constraints) => ({
      collectionRef,
      constraints
    }));
    firestoreMocks.getDocs.mockResolvedValue({ docs: [] });
    firestoreMocks.addDoc.mockResolvedValue({ id: 'customer-new' });
    firestoreMocks.updateDoc.mockResolvedValue(undefined);
  });

  it('reads and creates customers only under the tenant customer collection', async () => {
    await getCustomers('tenant-test');
    await createCustomer('tenant-test', { name: 'Tenant Customer' });

    expect(firestoreMocks.collection).toHaveBeenNthCalledWith(
      1,
      { id: 'db-test' },
      'tenants',
      'tenant-test',
      'customers'
    );
    expect(firestoreMocks.collection).toHaveBeenNthCalledWith(
      2,
      { id: 'db-test' },
      'tenants',
      'tenant-test',
      'customers'
    );
    expect(firestoreMocks.addDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: ['tenants', 'tenant-test', 'customers'] }),
      expect.objectContaining({ name: 'Tenant Customer', schemaVersion: 1 })
    );
  });

  it('preserves portal and relationship metadata when visible fields are edited', async () => {
    firestoreMocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        name: 'Original Name',
        email: 'linked@example.com',
        authUid: 'auth-linked',
        customerProfileId: 'profile-linked',
        propertyIds: ['property-1'],
        leadIds: ['lead-1'],
        bookingIds: ['booking-1'],
        createdAt: '2026-06-01T12:00:00.000Z',
        schemaVersion: 1
      })
    });

    await updateCustomer('tenant-test', 'customer-linked', {
      name: 'Updated Name',
      email: 'updated@example.com'
    });

    expect(firestoreMocks.doc).toHaveBeenCalledWith(
      { id: 'db-test' },
      'tenants',
      'tenant-test',
      'customers',
      'customer-linked'
    );
    expect(firestoreMocks.updateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: ['tenants', 'tenant-test', 'customers', 'customer-linked'] }),
      expect.objectContaining({
        name: 'Updated Name',
        email: 'updated@example.com',
        authUid: 'auth-linked',
        customerProfileId: 'profile-linked',
        propertyIds: ['property-1'],
        leadIds: ['lead-1'],
        bookingIds: ['booking-1'],
        createdAt: '2026-06-01T12:00:00.000Z',
        schemaVersion: 1
      })
    );
  });

  it('blocks hard deletion until all linked records can be verified', async () => {
    const result = await deleteCustomer('tenant-test', 'customer-linked');

    expect(result).toMatchObject({
      success: false,
      error: 'CUSTOMER_DELETE_BLOCKED'
    });
    expect(result.message).toContain('Customer deletion is disabled');
    expect(firestoreMocks.doc).not.toHaveBeenCalled();
    expect(firestoreMocks.updateDoc).not.toHaveBeenCalled();
  });
});
