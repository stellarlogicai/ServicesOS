const assert = require('node:assert/strict');
const test = require('node:test');
const {
  BOOKING_PAYMENT_SOURCE,
  createBookingCheckoutSessionHandler,
  createBookingCheckoutSessionCore,
  handleBookingCheckoutCompleted,
  handleBookingPaymentSucceeded,
  isBookingPaymentMetadata,
} = require('../bookingStripe');

const nowIso = '2026-07-07T18:00:00.000Z';

class MockDocRef {
  constructor(path, store) {
    this.path = path;
    this.store = store;
    this.updates = [];
  }

  async get() {
    const data = this.store[this.path];
    return {
      exists: data !== undefined,
      data: () => data,
    };
  }

  async update(patch) {
    this.updates.push(patch);
    this.store[this.path] = {
      ...(this.store[this.path] || {}),
      ...patch,
    };
  }

  collection(name) {
    return new MockCollectionRef(`${this.path}/${name}`, this.store);
  }
}

class MockCollectionRef {
  constructor(path, store) {
    this.path = path;
    this.store = store;
  }

  doc(id) {
    return new MockDocRef(`${this.path}/${id}`, this.store);
  }
}

function createMockAdmin(store) {
  return {
    auth: () => ({
      verifyIdToken: async () => ({ uid: 'admin-1' }),
    }),
    firestore: () => ({
      collection: name => new MockCollectionRef(name, store),
    }),
  };
}

function createResponseMock() {
  const response = {
    body: undefined,
    headers: {},
    statusCode: undefined,
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
  };
  return response;
}

function baseStore(overrides = {}) {
  return {
    'users/admin-1': {
      role: 'admin',
      tenantId: 'tenant-a',
      status: 'active',
    },
    'tenants/tenant-a': {
      stripeAccountId: 'acct_123',
      chargesEnabled: true,
      subscriptionTier: 'professional',
      users: ['admin-1'],
      adminUsers: ['admin-1'],
    },
    'tenants/tenant-a/bookings/booking-1': {
      agreedPrice: 190,
      customerName: 'Test Customer',
      customerEmail: 'test@example.com',
      serviceType: 'standard',
    },
    ...overrides,
  };
}

function createStripeMock(session = {}) {
  const calls = [];
  return {
    calls,
    checkout: {
      sessions: {
        create: async (params, options) => {
          calls.push({ params, options });
          return {
            id: 'cs_test_booking',
            url: 'https://checkout.stripe.test/session',
            livemode: false,
            ...session,
          };
        },
      },
    },
  };
}

function createStripeCheckoutErrorMock(error) {
  return {
    checkout: {
      sessions: {
        create: async () => { throw error; },
      },
    },
  };
}

test('createBookingCheckoutSessionHandler OPTIONS returns CORS headers for deployed ServicesOS origin', async () => {
  const handler = createBookingCheckoutSessionHandler({
    admin: createMockAdmin(baseStore()),
    appUrl: 'https://servicesos.netlify.app',
    getPlatformFee: () => 0.03,
    secretKey: 'sk_test_123',
    stripe: createStripeMock(),
  });
  const res = createResponseMock();

  await handler({
    method: 'OPTIONS',
    headers: { origin: 'https://servicesos.netlify.app' },
  }, res);

  assert.equal(res.statusCode, 204);
  assert.equal(res.headers['Access-Control-Allow-Origin'], 'https://servicesos.netlify.app');
  assert.equal(res.headers['Access-Control-Allow-Methods'], 'POST, OPTIONS');
  assert.equal(res.headers['Access-Control-Allow-Headers'], 'Content-Type, Authorization');
});

test('createBookingCheckoutSessionHandler OPTIONS allows local dev origins', async () => {
  const handler = createBookingCheckoutSessionHandler({
    admin: createMockAdmin(baseStore()),
    appUrl: 'http://localhost:5173',
    getPlatformFee: () => 0.03,
    secretKey: 'sk_test_123',
    stripe: createStripeMock(),
  });

  for (const origin of ['http://127.0.0.1:5173', 'http://localhost:5173']) {
    const res = createResponseMock();
    await handler({ method: 'OPTIONS', headers: { origin } }, res);
    assert.equal(res.statusCode, 204);
    assert.equal(res.headers['Access-Control-Allow-Origin'], origin);
  }
});

test('createBookingCheckoutSessionHandler does not reflect disallowed origins', async () => {
  const handler = createBookingCheckoutSessionHandler({
    admin: createMockAdmin(baseStore()),
    appUrl: 'https://servicesos.netlify.app',
    getPlatformFee: () => 0.03,
    secretKey: 'sk_test_123',
    stripe: createStripeMock(),
  });
  const res = createResponseMock();

  await handler({
    method: 'OPTIONS',
    headers: { origin: 'https://evil.example' },
  }, res);

  assert.equal(res.statusCode, 204);
  assert.equal(res.headers['Access-Control-Allow-Origin'], undefined);
  assert.equal(res.headers['Access-Control-Allow-Headers'], 'Content-Type, Authorization');
});

test('createBookingCheckoutSessionHandler POST still requires Firebase ID token auth', async () => {
  const handler = createBookingCheckoutSessionHandler({
    admin: createMockAdmin(baseStore()),
    appUrl: 'https://servicesos.netlify.app',
    getPlatformFee: () => 0.03,
    secretKey: 'sk_test_123',
    stripe: createStripeMock(),
  });
  const res = createResponseMock();

  await handler({
    body: { tenantId: 'tenant-a', bookingId: 'booking-1' },
    headers: { origin: 'https://servicesos.netlify.app' },
    method: 'POST',
  }, res);

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'Authentication required');
  assert.equal(res.headers['Access-Control-Allow-Origin'], 'https://servicesos.netlify.app');
});

test('createBookingCheckoutSessionCore rejects missing tenantId or bookingId', async () => {
  const result = await createBookingCheckoutSessionCore({
    admin: createMockAdmin(baseStore()),
    appUrl: 'http://localhost:5173',
    bookingId: '',
    getPlatformFee: () => 0.03,
    nowIso,
    secretKey: 'sk_test_123',
    stripe: createStripeMock(),
    tenantId: 'tenant-a',
    uid: 'admin-1',
  });

  assert.equal(result.success, false);
  assert.equal(result.status, 400);
});

test('createBookingCheckoutSessionCore rejects missing booking', async () => {
  const result = await createBookingCheckoutSessionCore({
    admin: createMockAdmin(baseStore()),
    appUrl: 'http://localhost:5173',
    bookingId: 'missing-booking',
    getPlatformFee: () => 0.03,
    nowIso,
    secretKey: 'sk_test_123',
    stripe: createStripeMock(),
    tenantId: 'tenant-a',
    uid: 'admin-1',
  });

  assert.equal(result.success, false);
  assert.equal(result.status, 404);
});

test('createBookingCheckoutSessionCore rejects invalid booking amount', async () => {
  const result = await createBookingCheckoutSessionCore({
    admin: createMockAdmin(baseStore({
      'tenants/tenant-a/bookings/booking-1': { agreedPrice: 0 },
    })),
    appUrl: 'http://localhost:5173',
    bookingId: 'booking-1',
    getPlatformFee: () => 0.03,
    nowIso,
    secretKey: 'sk_test_123',
    stripe: createStripeMock(),
    tenantId: 'tenant-a',
    uid: 'admin-1',
  });

  assert.equal(result.success, false);
  assert.equal(result.status, 400);
});

test('createBookingCheckoutSessionCore creates checkout metadata and does not mark booking paid', async () => {
  const store = baseStore();
  const stripe = createStripeMock();
  const result = await createBookingCheckoutSessionCore({
    admin: createMockAdmin(store),
    appUrl: 'http://localhost:5173',
    bookingId: 'booking-1',
    getPlatformFee: () => 0.03,
    nowIso,
    secretKey: 'sk_test_123',
    stripe,
    tenantId: 'tenant-a',
    uid: 'admin-1',
  });

  assert.equal(result.success, true);
  assert.equal(result.data.sessionId, 'cs_test_booking');
  assert.equal(stripe.calls[0].options.stripeAccount, 'acct_123');
  assert.deepEqual(stripe.calls[0].params.metadata, {
    source: BOOKING_PAYMENT_SOURCE,
    tenantId: 'tenant-a',
    bookingId: 'booking-1',
    stripeMode: 'test',
  });
  assert.deepEqual(stripe.calls[0].params.payment_intent_data.metadata, stripe.calls[0].params.metadata);
  assert.equal(stripe.calls[0].params.payment_intent_data.application_fee_amount, 570);
  assert.equal(store['tenants/tenant-a/bookings/booking-1'].paymentStatus, 'final_due');
  assert.equal(store['tenants/tenant-a/bookings/booking-1'].stripePaymentStatus, 'checkout_created');
  assert.equal(store['tenants/tenant-a/bookings/booking-1'].amountReceived, undefined);
});

test('createBookingCheckoutSessionCore returns clean error for non-platform Stripe key', async () => {
  const store = baseStore();
  const error = new Error('Only Stripe Connect platforms can work with other accounts.');
  error.type = 'StripePermissionError';
  error.code = 'platform_account_required';
  error.statusCode = 403;

  const result = await createBookingCheckoutSessionCore({
    admin: createMockAdmin(store),
    appUrl: 'https://servicesos.netlify.app',
    bookingId: 'booking-1',
    getPlatformFee: () => 0.03,
    nowIso,
    secretKey: 'sk_test_123',
    stripe: createStripeCheckoutErrorMock(error),
    tenantId: 'tenant-a',
    uid: 'admin-1',
  });

  assert.equal(result.success, false);
  assert.equal(result.status, 409);
  assert.equal(result.error.includes('Stripe Connect platform setup is not ready'), true);
  assert.equal(result.error.includes('sk_'), false);
  assert.equal(store['tenants/tenant-a/bookings/booking-1'].paymentStatus, undefined);
  assert.equal(store['tenants/tenant-a/bookings/booking-1'].stripePaymentStatus, undefined);
  assert.equal(store['tenants/tenant-a/bookings/booking-1'].amountReceived, undefined);
});

test('createBookingCheckoutSessionCore returns clean error for inaccessible connected account', async () => {
  const store = baseStore();
  const error = new Error('No such account: acct_missing');
  error.type = 'StripeInvalidRequestError';
  error.code = 'resource_missing';
  error.statusCode = 404;

  const result = await createBookingCheckoutSessionCore({
    admin: createMockAdmin(store),
    appUrl: 'https://servicesos.netlify.app',
    bookingId: 'booking-1',
    getPlatformFee: () => 0.03,
    nowIso,
    secretKey: 'sk_test_123',
    stripe: createStripeCheckoutErrorMock(error),
    tenantId: 'tenant-a',
    uid: 'admin-1',
  });

  assert.equal(result.success, false);
  assert.equal(result.status, 409);
  assert.equal(result.error.includes('not accessible'), true);
  assert.equal(result.error.includes('sk_'), false);
  assert.equal(store['tenants/tenant-a/bookings/booking-1'].paymentStatus, undefined);
});

test('booking webhook metadata guard ignores unrelated metadata', () => {
  assert.equal(isBookingPaymentMetadata({}), false);
  assert.equal(isBookingPaymentMetadata({ source: 'old_lead_payment', leadId: 'lead-1' }), false);
});

test('handleBookingPaymentSucceeded ignores non-booking metadata', async () => {
  const result = await handleBookingPaymentSucceeded({
    id: 'pi_123',
    amount_received: 19000,
    currency: 'usd',
    metadata: { leadId: 'lead-1' },
    status: 'succeeded',
  }, {
    admin: createMockAdmin(baseStore()),
    nowIso,
  });

  assert.deepEqual(result, { handled: false });
});

test('handleBookingPaymentSucceeded updates booking from Stripe-confirmed payment intent', async () => {
  const store = baseStore();
  const result = await handleBookingPaymentSucceeded({
    id: 'pi_123',
    amount_received: 19000,
    created: 1783274400,
    currency: 'usd',
    latest_charge: { receipt_url: 'https://receipt.stripe.test/r' },
    livemode: false,
    metadata: {
      source: BOOKING_PAYMENT_SOURCE,
      tenantId: 'tenant-a',
      bookingId: 'booking-1',
    },
    status: 'succeeded',
  }, {
    admin: createMockAdmin(store),
    nowIso,
  });

  assert.equal(result.handled, true);
  assert.equal(store['tenants/tenant-a/bookings/booking-1'].paymentStatus, 'paid_in_full');
  assert.equal(store['tenants/tenant-a/bookings/booking-1'].paymentMethod, 'stripe');
  assert.equal(store['tenants/tenant-a/bookings/booking-1'].amountReceived, 190);
  assert.equal(store['tenants/tenant-a/bookings/booking-1'].stripeAmountReceived, 19000);
  assert.equal(store['tenants/tenant-a/bookings/booking-1'].stripePaymentIntentId, 'pi_123');
  assert.equal(store['tenants/tenant-a/bookings/booking-1'].stripeReceiptUrl, 'https://receipt.stripe.test/r');
  assert.equal(store['tenants/tenant-a/bookings/booking-1'].paymentStatusUpdatedBy, 'stripe_webhook');
});

test('handleBookingCheckoutCompleted updates booking and is safe for duplicate events', async () => {
  const store = baseStore();
  const session = {
    id: 'cs_test_booking',
    amount_total: 19000,
    created: 1783274400,
    currency: 'usd',
    livemode: false,
    metadata: {
      source: BOOKING_PAYMENT_SOURCE,
      tenantId: 'tenant-a',
      bookingId: 'booking-1',
    },
    payment_intent: 'pi_123',
    payment_status: 'paid',
  };

  const first = await handleBookingCheckoutCompleted(session, {
    admin: createMockAdmin(store),
    nowIso,
  });
  const second = await handleBookingCheckoutCompleted(session, {
    admin: createMockAdmin(store),
    nowIso,
  });

  assert.equal(first.handled, true);
  assert.equal(second.handled, true);
  assert.equal(store['tenants/tenant-a/bookings/booking-1'].paymentStatus, 'paid_in_full');
  assert.equal(store['tenants/tenant-a/bookings/booking-1'].paymentMethod, 'stripe');
  assert.equal(store['tenants/tenant-a/bookings/booking-1'].amountReceived, 190);
  assert.equal(store['tenants/tenant-a/bookings/booking-1'].stripeCheckoutSessionId, 'cs_test_booking');
  assert.equal(store['tenants/tenant-a/bookings/booking-1'].stripePaymentIntentId, 'pi_123');
});
