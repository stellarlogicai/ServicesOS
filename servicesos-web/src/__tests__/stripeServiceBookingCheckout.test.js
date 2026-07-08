import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const firebaseMocks = vi.hoisted(() => ({
  auth: {
    currentUser: {
      getIdToken: vi.fn(),
    },
  },
}));

vi.mock('../firebase', () => ({
  auth: firebaseMocks.auth,
}));

vi.mock('@stripe/stripe-js', () => ({
  loadStripe: vi.fn(),
}));

vi.mock('../services/tenantService', () => ({
  getTenantSubscription: vi.fn(),
}));

vi.mock('../lib/subscriptionConfig', () => ({
  calculateTransactionFee: vi.fn(),
}));

describe('createBookingCheckoutSession', () => {
  beforeEach(() => {
    firebaseMocks.auth.currentUser = {
      getIdToken: vi.fn().mockResolvedValue('id-token-123'),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        sessionId: 'cs_test_booking',
        url: 'https://checkout.stripe.test/session',
        amount: 19000,
        currency: 'usd',
        stripeAccountId: 'acct_123',
        platformFee: 5.7,
        platformFeePercentage: 3,
      }),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('calls the booking-scoped checkout backend and returns session data', async () => {
    const { createBookingCheckoutSession } = await import('../services/stripeService');

    const result = await createBookingCheckoutSession('tenant-a', 'booking-1');

    expect(firebaseMocks.auth.currentUser.getIdToken).toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/createBookingCheckoutSession'),
      {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer id-token-123',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tenantId: 'tenant-a', bookingId: 'booking-1' }),
      }
    );
    expect(result).toEqual({
      sessionId: 'cs_test_booking',
      url: 'https://checkout.stripe.test/session',
      amount: 19000,
      currency: 'usd',
      stripeAccountId: 'acct_123',
      platformFee: 5.7,
      platformFeePercentage: 3,
    });
  });

  it('does not call the backend when the user is missing', async () => {
    firebaseMocks.auth.currentUser = null;
    const { createBookingCheckoutSession } = await import('../services/stripeService');

    await expect(createBookingCheckoutSession('tenant-a', 'booking-1')).rejects.toThrow('Authentication required');
    expect(fetch).not.toHaveBeenCalled();
  });
});
