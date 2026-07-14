import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestoreMockState = vi.hoisted(() => ({
  snapshots: [],
  queries: []
}));

vi.mock('../firebase', () => ({
  db: { mocked: true }
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((db, ...path) => ({ db, path, type: 'collection' })),
  getDocs: vi.fn(async (customerQuery) => {
    firestoreMockState.queries.push(customerQuery);
    return firestoreMockState.snapshots.shift() || createSnapshot([]);
  }),
  limit: vi.fn((count) => ({ count, type: 'limit' })),
  query: vi.fn((collectionRef, ...constraints) => ({
    collectionRef,
    constraints,
    type: 'query'
  })),
  where: vi.fn((field, operator, value) => ({
    field,
    operator,
    value,
    type: 'where'
  }))
}));

import {
  CUSTOMER_PORTAL_IDENTITY_STATUS,
  resolveCustomerPortalCustomer
} from '../services/customerPortalIdentityService';

function createSnapshot(customers) {
  return {
    empty: customers.length === 0,
    docs: customers.map(({ id, data }) => ({
      id,
      data: () => data
    }))
  };
}

describe('Customer Portal identity service', () => {
  beforeEach(() => {
    firestoreMockState.snapshots = [];
    firestoreMockState.queries = [];
  });

  it('returns missing tenant without querying Firestore', async () => {
    const result = await resolveCustomerPortalCustomer({
      tenantId: null,
      user: { uid: 'auth-1', email: 'customer@example.com' }
    });

    expect(result).toMatchObject({
      status: CUSTOMER_PORTAL_IDENTITY_STATUS.MISSING_TENANT,
      customer: null,
      matchMethod: null,
      message: "Your account is not connected to a service business yet. Please use the business's quote request link or contact the business directly."
    });
    expect(firestoreMockState.queries).toHaveLength(0);
  });

  it('resolves a customer by authUid', async () => {
    firestoreMockState.snapshots = [
      createSnapshot([
        {
          id: 'customer-auth',
          data: {
            name: 'Auth Matched Customer',
            authUid: 'auth-1',
            email: 'customer@example.com'
          }
        }
      ])
    ];

    const result = await resolveCustomerPortalCustomer({
      tenantId: 'tenant-1',
      user: { uid: 'auth-1', email: 'customer@example.com' }
    });

    expect(result).toMatchObject({
      status: CUSTOMER_PORTAL_IDENTITY_STATUS.FOUND,
      matchMethod: 'authUid',
      customer: {
        id: 'customer-auth',
        authUid: 'auth-1'
      }
    });
    expect(firestoreMockState.queries).toHaveLength(1);
    expect(firestoreMockState.queries[0].constraints[0]).toMatchObject({
      field: 'authUid',
      operator: '==',
      value: 'auth-1'
    });
  });

  it('does not treat an email-only record as an authenticated customer link', async () => {
    firestoreMockState.snapshots = [createSnapshot([])];

    const result = await resolveCustomerPortalCustomer({
      tenantId: 'tenant-1',
      user: { uid: 'auth-1', email: 'customer@example.com' }
    });

    expect(result).toMatchObject({
      status: CUSTOMER_PORTAL_IDENTITY_STATUS.CUSTOMER_NOT_FOUND,
      customer: null,
      matchMethod: null,
      message: "Your account is not connected to a service business yet. Please use the business's quote request link or contact the business directly."
    });
    expect(firestoreMockState.queries).toHaveLength(1);
    expect(firestoreMockState.queries[0].constraints[0].field).toBe('authUid');
  });
});
