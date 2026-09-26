import { describe, expect, it, vi } from 'vitest';
import { openOwnerBillingPortal } from '../services/ownerBillingPortalService';

describe('owner billing Portal service', () => {
  it('sends only an authenticated empty request and returns an allowlisted Stripe URL', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true,
      portalUrl: 'https://billing.stripe.com/p/session/test_fixture', customer: 'cus_private' }) });
    const user = { getIdToken: vi.fn().mockResolvedValue('test-token') };
    expect(await openOwnerBillingPortal({ user, fetchImpl })).toBe('https://billing.stripe.com/p/session/test_fixture');
    expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining('/ownerBillingPortalGateway'), {
      method: 'POST', body: '{}', headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
    });
  });

  it('rejects missing identity, provider errors, and unexpected redirect hosts', async () => {
    await expect(openOwnerBillingPortal({ user: null, fetchImpl: vi.fn() })).rejects.toMatchObject({ code: 'unauthenticated' });
    const user = { getIdToken: async () => 'test-token' };
    const fail = payload => vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
    await expect(openOwnerBillingPortal({ user, fetchImpl: fail({ success: true, portalUrl: 'https://evil.example/' }) })).rejects.toThrow('unavailable');
    await expect(openOwnerBillingPortal({ user, fetchImpl: fail({ success: true, portalUrl: 'http://billing.stripe.com/' }) })).rejects.toThrow('unavailable');
    await expect(openOwnerBillingPortal({ user, fetchImpl: vi.fn().mockResolvedValue({ ok: false,
      json: async () => ({ error: 'private Stripe detail' }) }) })).rejects.not.toThrow('private Stripe detail');
  });
});
