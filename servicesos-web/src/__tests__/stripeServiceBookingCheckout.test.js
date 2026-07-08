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

describe('Stripe Connect setup helpers', () => {
  beforeEach(() => {
    firebaseMocks.auth.currentUser = {
      getIdToken: vi.fn().mockResolvedValue('id-token-123'),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        connected: true,
        status: 'pending',
        chargesEnabled: false,
        payoutsEnabled: false,
      }),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('gets connected account status from the named Firebase function with auth', async () => {
    const { getConnectedAccountStatus } = await import('../services/stripeService');

    await getConnectedAccountStatus('tenant-a');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/getConnectedAccountStatus\?tenantId=tenant-a$/),
      {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer id-token-123',
        },
      }
    );
    expect(fetch.mock.calls[0][0]).not.toContain('/api/stripe-connect');
  });

  it('creates a connected account through the named Firebase function with auth', async () => {
    const { createConnectedAccount } = await import('../services/stripeService');

    await createConnectedAccount({
      tenantId: 'tenant-a',
      businessEmail: 'owner@example.com',
      businessName: 'Aunt B Cleaning',
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/createConnectedAccount'),
      {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer id-token-123',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tenantId: 'tenant-a',
          businessEmail: 'owner@example.com',
          businessName: 'Aunt B Cleaning',
        }),
      }
    );
    expect(fetch.mock.calls[0][0]).not.toContain('/api/stripe-connect');
  });

  it('generates onboarding links through the named Firebase function with auth', async () => {
    const { generateOnboardingLink } = await import('../services/stripeService');

    await generateOnboardingLink({
      tenantId: 'tenant-a',
      returnUrl: 'https://servicesos.netlify.app',
      refreshUrl: 'https://servicesos.netlify.app',
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/generateOnboardingLink'),
      {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer id-token-123',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tenantId: 'tenant-a',
          returnUrl: 'https://servicesos.netlify.app',
          refreshUrl: 'https://servicesos.netlify.app',
        }),
      }
    );
    expect(fetch.mock.calls[0][0]).not.toContain('/api/stripe-connect');
  });
});

describe('Firebase function URL resolution', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('uses VITE_FUNCTIONS_URL when provided', async () => {
    vi.stubEnv('VITE_FUNCTIONS_URL', 'https://us-central1-cleaning-intake-system.cloudfunctions.net/');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'cleaning-intake-system');
    vi.stubEnv('VITE_USE_FUNCTIONS_EMULATOR', '');

    const { getFirebaseFunctionUrl } = await import('../services/stripeService');

    expect(getFirebaseFunctionUrl('createConnectedAccount')).toBe(
      'https://us-central1-cleaning-intake-system.cloudfunctions.net/createConnectedAccount'
    );
  });

  it('falls back to the deployed Firebase Functions URL when no override is set', async () => {
    vi.stubEnv('VITE_FUNCTIONS_URL', '');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'cleaning-intake-system');
    vi.stubEnv('VITE_USE_FUNCTIONS_EMULATOR', '');

    const { getFirebaseFunctionUrl } = await import('../services/stripeService');

    expect(getFirebaseFunctionUrl('getConnectedAccountStatus')).toBe(
      'https://us-central1-cleaning-intake-system.cloudfunctions.net/getConnectedAccountStatus'
    );
  });

  it('uses the local emulator URL only when explicitly configured', async () => {
    vi.stubEnv('VITE_FUNCTIONS_URL', '');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'cleaning-intake-system');
    vi.stubEnv('VITE_USE_FUNCTIONS_EMULATOR', 'true');

    const { getFirebaseFunctionUrl } = await import('../services/stripeService');

    expect(getFirebaseFunctionUrl('generateOnboardingLink')).toBe(
      'http://127.0.0.1:5001/cleaning-intake-system/us-central1/generateOnboardingLink'
    );
  });
});
