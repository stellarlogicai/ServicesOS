import { describe, expect, it, vi } from 'vitest';
import { createOwnerSubscriptionCheckout, sanitizeOwnerCheckout } from '../services/ownerBillingService';

describe('owner billing service', () => {
  it('sends only an authenticated empty request and accepts an allowlisted Stripe URL', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, checkout: { sessionId: 'cs_test', checkoutUrl: 'https://checkout.stripe.com/c/pay/test' } }) });
    const result = await createOwnerSubscriptionCheckout({ user: { getIdToken: vi.fn().mockResolvedValue('token') }, fetchImpl });
    expect(result).toEqual({ sessionId: 'cs_test', checkoutUrl: 'https://checkout.stripe.com/c/pay/test' });
    expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining('/ownerOnboardingBillingGateway'), expect.objectContaining({
      method: 'POST', body: '{}', headers: expect.objectContaining({ Authorization: 'Bearer token' }),
    }));
  });

  it('rejects unauthenticated calls, malformed projections, and non-Stripe redirects', async () => {
    await expect(createOwnerSubscriptionCheckout({ user: null })).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(() => sanitizeOwnerCheckout({ success: true, checkout: { sessionId: 'cs', checkoutUrl: 'https://example.test' } })).toThrow();
    expect(() => sanitizeOwnerCheckout({ success: true, checkout: { sessionId: 'cs', checkoutUrl: 'https://notstripe.com/checkout' } })).toThrow();
    expect(() => sanitizeOwnerCheckout({ success: true, checkout: { sessionId: '', checkoutUrl: 'https://checkout.stripe.com/x' } })).toThrow();
  });

  it('normalizes server failures without exposing private detail', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({ code: 'billing_unavailable', error: 'private Stripe detail' }) });
    await expect(createOwnerSubscriptionCheckout({ user: { getIdToken: async () => 'token' }, fetchImpl })).rejects.toMatchObject({ message: 'Subscription checkout could not be started.' });
  });
});
