import { describe, expect, it, vi } from 'vitest';
import { createOwnerSubscriptionCheckout, sanitizeOwnerCheckout } from '../services/ownerBillingService';

describe('owner billing service', () => {
  it('sends only the selected interval with authenticated request and accepts an allowlisted Stripe URL', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, checkout: { sessionId: 'cs_test', checkoutUrl: 'https://checkout.stripe.com/c/pay/test' } }) });
    const result = await createOwnerSubscriptionCheckout({ billingInterval: 'annual', user: { getIdToken: vi.fn().mockResolvedValue('token') }, fetchImpl });
    expect(result).toEqual({ sessionId: 'cs_test', checkoutUrl: 'https://checkout.stripe.com/c/pay/test' });
    expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining('/ownerOnboardingBillingGateway'), expect.objectContaining({
      method: 'POST', body: '{"billingInterval":"annual"}', headers: expect.objectContaining({ Authorization: 'Bearer token' }),
    }));
  });

  it('rejects absent or invalid intervals before calling the gateway', async () => {
    const fetchImpl = vi.fn();
    const user = { getIdToken: vi.fn().mockResolvedValue('token') };
    await expect(createOwnerSubscriptionCheckout({ user, fetchImpl })).rejects.toMatchObject({ code: 'invalid_request' });
    await expect(createOwnerSubscriptionCheckout({ user, billingInterval: 'weekly', fetchImpl })).rejects.toMatchObject({ code: 'invalid_request' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated calls, malformed projections, and non-Stripe redirects', async () => {
    await expect(createOwnerSubscriptionCheckout({ user: null })).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(() => sanitizeOwnerCheckout({ success: true, checkout: { sessionId: 'cs', checkoutUrl: 'https://example.test' } })).toThrow();
    expect(() => sanitizeOwnerCheckout({ success: true, checkout: { sessionId: 'cs', checkoutUrl: 'https://notstripe.com/checkout' } })).toThrow();
    expect(() => sanitizeOwnerCheckout({ success: true, checkout: { sessionId: '', checkoutUrl: 'https://checkout.stripe.com/x' } })).toThrow();
  });

  it('normalizes server failures without exposing private detail', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({ code: 'billing_unavailable', error: 'private Stripe detail' }) });
    await expect(createOwnerSubscriptionCheckout({ billingInterval: 'monthly', user: { getIdToken: async () => 'token' }, fetchImpl })).rejects.toMatchObject({ message: 'Subscription checkout could not be started.' });
  });
});
