import { createHash } from 'node:crypto';

export function approvedBookingFixture(overrides = {}) {
  const snapshot = {
    bookingId: 'financial-booking',
    extraWork: [{ priceDeltaCents: 21000, requestId: 'synthetic-addition' }],
    price: 410,
    schemaVersion: 1,
  };
  const scopeHash = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  return {
    id: snapshot.bookingId, tenantId: 'tenant-a', customerId: 'synthetic-customer',
    customerName: 'Synthetic Financial', serviceType: 'standard', status: 'scheduled',
    date: '2026-10-15', startTime: '10:00', agreedPrice: 200,
    approvedJobScope: { version: 2, scopeHash, approvedAt: '2026-10-08T11:00:00Z', snapshot },
    jobScopeControl: { approvedVersion: 2, approvedScopeHash: scopeHash },
    ...overrides,
  };
}
