import { describe, expect, it, vi } from 'vitest';
import { approveCustomerJobScope, getOwnerJobScope, sanitizeScope } from '../services/jobScopeService';

const scope = { version: 1, state: 'awaiting_approval', scopeHash: 'a'.repeat(64), snapshot: { schemaVersion: 1, bookingId: 'booking-a', bookingType: 'residential', customerName: 'Customer', serviceType: 'Deep clean', schedule: { date: '2026-09-20', startTime: '09:00' }, price: 200, serviceItems: [], selectedAddOns: [] } };
const response = body => ({ ok: true, json: async () => body });
const user = { getIdToken: vi.fn(async () => 'token') };

describe('job scope service', () => {
  it('reconstructs the allowlisted scope and strips private fields', () => {
    const result = sanitizeScope({ ...scope, snapshot: { ...scope.snapshot, paymentStatus: 'paid', customerSnapshot: { email: 'private' } } });
    expect(result.snapshot.paymentStatus).toBeUndefined();
    expect(result.snapshot.customerSnapshot).toBeUndefined();
  });

  it('owner request sends only action and booking ID with bearer identity', async () => {
    const fetchImpl = vi.fn(async () => response({ success: true, scope }));
    await getOwnerJobScope('booking-a', { user, fetchImpl });
    const [, options] = fetchImpl.mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({ action: 'owner_get', bookingId: 'booking-a' });
    expect(options.headers.Authorization).toBe('Bearer token');
  });

  it('customer approval submits no actor or timestamp evidence', async () => {
    const fetchImpl = vi.fn(async () => response({ success: true, scope: { ...scope, state: 'approved', approvedAt: 'server-time' } }));
    await approveCustomerJobScope('booking-a', 1, { user, fetchImpl });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ action: 'customer_approve', bookingId: 'booking-a', version: 1, affirmativeAcceptance: true });
  });
});
