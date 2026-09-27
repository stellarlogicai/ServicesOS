const assert = require('node:assert/strict');
const test = require('node:test');
const {
  BOOKING_PAYMENT_SOURCE,
  createBookingCheckoutSessionHandler,
  createBookingCheckoutSessionCore,
  handleBookingCheckoutCompleted,
  handleBookingChargeRefunded,
  handleBookingPaymentSucceeded,
  isBookingPaymentMetadata,
} = require('../bookingStripe');
const { collectionOperationHash } = require('../bookingPaymentAccounting');

const nowIso = '2026-07-07T18:00:00.000Z';

class MockDocRef {
  constructor(path, store) {
    this.path = path;
    this.id = path.split('/').at(-1);
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

  async create(value) {
    if (this.store[this.path] !== undefined) throw new Error('Already exists');
    this.store[this.path] = value;
  }

  async set(value) {
    this.store[this.path] = value;
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
  let queue = Promise.resolve();
  const firestore = {
    collection: name => new MockCollectionRef(name, store),
    runTransaction(callback) {
      const run = () => callback({
        get: ref => ref.get(),
        update: (ref, patch) => ref.update(patch),
        create: (ref, value) => ref.create(value),
        set: (ref, value) => ref.set(value),
      });
      const result = queue.then(run, run);
      queue = result.then(() => undefined, () => undefined);
      return result;
    },
  };
  const admin = {
    auth: () => ({ verifyIdToken: async () => ({ uid: 'admin-1' }) }),
    firestore: () => firestore,
  };
  admin.firestore.FieldValue = { serverTimestamp: () => 'mock-server-time' };
  return admin;
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
            expires_at: 1893456000,
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
    clientCheckoutId: 'checkout-attempt-0001',
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
    clientCheckoutId: 'checkout-attempt-0001',
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

test('createBookingCheckoutSessionCore requires canonical tenant admin membership', async () => {
  const store = baseStore({
    'tenants/tenant-a': {
      stripeAccountId: 'acct_123', chargesEnabled: true, subscriptionTier: 'professional',
      users: ['admin-1'], adminUsers: [],
    },
  });
  const stripe = createStripeMock();
  const result = await createBookingCheckoutSessionCore({
    admin: createMockAdmin(store), appUrl: 'http://localhost:5173', bookingId: 'booking-1',
    getPlatformFee: () => 0.03, nowIso, secretKey: 'sk_test_123', stripe,
    tenantId: 'tenant-a', uid: 'admin-1', clientCheckoutId: 'checkout-attempt-0001',
  });
  assert.equal(result.success, false);
  assert.equal(result.status, 403);
  assert.equal(stripe.calls.length, 0);
});

test('createBookingCheckoutSessionCore rejects invalid booking amount', async () => {
  const result = await createBookingCheckoutSessionCore({
    admin: createMockAdmin(baseStore({
      'tenants/tenant-a/bookings/booking-1': { agreedPrice: 0 },
    })),
    appUrl: 'http://localhost:5173',
    bookingId: 'booking-1',
    clientCheckoutId: 'checkout-attempt-0001',
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
    clientCheckoutId: 'checkout-attempt-0001',
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
    paymentChannel: 'online_checkout',
    paymentCollectionOperationHash: collectionOperationHash('checkout-attempt-0001'),
    stripeMode: 'test',
  });
  assert.deepEqual(stripe.calls[0].params.payment_intent_data.metadata, stripe.calls[0].params.metadata);
  assert.equal(stripe.calls[0].params.payment_intent_data.application_fee_amount, 570);
  assert.equal(store['tenants/tenant-a/bookings/booking-1'].paymentStatus, 'not_paid');
  assert.equal(store['tenants/tenant-a/bookings/booking-1'].stripePaymentStatus, 'checkout_created');
  assert.equal(store['tenants/tenant-a/bookings/booking-1'].amountReceived, 0);
});

test('Checkout uses remaining balance and reuses one open direct-charge session', async () => {
  const store = baseStore({
    'tenants/tenant-a/bookings/booking-1': { agreedPrice: 190, amountReceived: 40 },
  });
  const admin = createMockAdmin(store);
  const stripe = createStripeMock();
  const args = { admin, appUrl: 'http://localhost:5173', bookingId: 'booking-1',
    getPlatformFee: () => 0.03, nowIso, secretKey: 'sk_test_123', stripe,
    tenantId: 'tenant-a', uid: 'admin-1', clientCheckoutId: 'checkout-attempt-0001' };
  const first = await createBookingCheckoutSessionCore(args);
  const second = await createBookingCheckoutSessionCore(args);
  assert.equal(first.success, true);
  assert.equal(second.success, true);
  assert.equal(first.data.sessionId, second.data.sessionId);
  assert.equal(stripe.calls.length, 1);
  assert.equal(stripe.calls[0].params.line_items[0].price_data.unit_amount, 15000);
  assert.equal(stripe.calls[0].params.payment_intent_data.application_fee_amount, 450);
  assert.equal(stripe.calls[0].options.stripeAccount, 'acct_123');
});

test('fully paid booking cannot create another Checkout session', async () => {
  const store = baseStore({
    'tenants/tenant-a/bookings/booking-1': { agreedPrice: 190, amountReceived: 190 },
  });
  const stripe = createStripeMock();
  const result = await createBookingCheckoutSessionCore({
    admin: createMockAdmin(store), appUrl: 'http://localhost:5173', bookingId: 'booking-1',
    getPlatformFee: () => 0.03, nowIso, secretKey: 'sk_test_123', stripe,
    tenantId: 'tenant-a', uid: 'admin-1', clientCheckoutId: 'checkout-attempt-0001',
  });
  assert.equal(result.success, false);
  assert.equal(result.status, 400);
  assert.equal(stripe.calls.length, 0);
});

test('ambiguous Checkout failure retains authority and same-operation retry reuses it', async () => {
  const store = baseStore();
  const args = { admin: createMockAdmin(store), appUrl: 'http://localhost:5173', bookingId: 'booking-1',
    getPlatformFee: () => 0.03, nowIso, secretKey: 'sk_test_123',
    tenantId: 'tenant-a', uid: 'admin-1', clientCheckoutId: 'checkout-attempt-0001' };
  const failed = await createBookingCheckoutSessionCore({
    ...args, stripe: createStripeCheckoutErrorMock(new Error('temporary provider failure')),
  });
  assert.equal(failed.success, false);
  assert.equal(store['tenants/tenant-a/bookings/booking-1/paymentCollectionControl/current'].status, 'reserved');
  const stripe = createStripeMock();
  const retried = await createBookingCheckoutSessionCore({ ...args, stripe });
  assert.equal(retried.success, true);
  assert.equal(stripe.calls.length, 1);
});

test('concurrent Checkout requests cannot create two open sessions', async () => {
  const store = baseStore();
  const admin = createMockAdmin(store);
  const stripe = createStripeMock();
  const args = { admin, appUrl: 'http://localhost:5173', bookingId: 'booking-1',
    getPlatformFee: () => 0.03, nowIso, secretKey: 'sk_test_123', stripe,
    tenantId: 'tenant-a', uid: 'admin-1', clientCheckoutId: 'checkout-attempt-0001' };
  const results = await Promise.all([
    createBookingCheckoutSessionCore(args),
    createBookingCheckoutSessionCore({ ...args, clientCheckoutId: 'checkout-attempt-0002' }),
  ]);
  assert.equal(results.filter(result => result.success).length, 1);
  assert.equal(results.filter(result => result.status === 409).length, 1);
  assert.equal(stripe.calls.length, 1);
});

test('definitive pre-provider Checkout failure releases authority for a new operation', async () => {
  const store = baseStore();
  const error = new Error('invalid request');
  error.statusCode = 400;
  const args = { admin: createMockAdmin(store), appUrl: 'http://localhost:5173', bookingId: 'booking-1',
    getPlatformFee: () => 0.03, nowIso, secretKey: 'sk_test_123',
    tenantId: 'tenant-a', uid: 'admin-1', clientCheckoutId: 'checkout-attempt-release-01' };
  const failed = await createBookingCheckoutSessionCore({
    ...args, stripe: createStripeCheckoutErrorMock(error),
  });
  assert.equal(failed.success, false);
  assert.equal(store['tenants/tenant-a/bookings/booking-1/paymentCollectionControl/current'].status, 'released');
  const stripe = createStripeMock();
  const retried = await createBookingCheckoutSessionCore({
    ...args, clientCheckoutId: 'checkout-attempt-release-02', stripe,
  });
  assert.equal(retried.success, true);
  assert.equal(stripe.calls.length, 1);
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
    clientCheckoutId: 'checkout-attempt-0001',
  });

  assert.equal(result.success, false);
  assert.equal(result.status, 409);
  assert.equal(result.error.includes('Stripe Connect platform setup is not ready'), true);
  assert.equal(result.error.includes('sk_'), false);
  assert.equal(store['tenants/tenant-a/bookings/booking-1'].paymentStatus, 'not_paid');
  assert.equal(store['tenants/tenant-a/bookings/booking-1'].stripePaymentStatus, undefined);
  assert.equal(store['tenants/tenant-a/bookings/booking-1'].amountReceived, 0);
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
    clientCheckoutId: 'checkout-attempt-0001',
  });

  assert.equal(result.success, false);
  assert.equal(result.status, 409);
  assert.equal(result.error.includes('not accessible'), true);
  assert.equal(result.error.includes('sk_'), false);
  assert.equal(store['tenants/tenant-a/bookings/booking-1'].paymentStatus, 'not_paid');
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
    created: Math.floor(Date.parse(nowIso) / 1000) + 1,
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
    connectedAccountId: 'acct_123',
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

test('booking payment from a different connected account cannot cut over or mutate the booking', async () => {
  const store = baseStore();
  await assert.rejects(handleBookingPaymentSucceeded({
    id: 'pi_wrong', amount_received: 19000, currency: 'usd', status: 'succeeded',
    metadata: { source: BOOKING_PAYMENT_SOURCE, tenantId: 'tenant-a', bookingId: 'booking-1' },
  }, { admin: createMockAdmin(store), nowIso, connectedAccountId: 'acct_other' }),
  { code: 'connected_account_mismatch' });
  assert.equal(store['tenants/tenant-a/bookings/booking-1'].paymentAccounting, undefined);
});

test('unconfirmed booking PaymentIntent does not increase paid amount', async () => {
  const store = baseStore();
  const result = await handleBookingPaymentSucceeded({
    id: 'pi_pending', amount_received: 0, currency: 'usd', status: 'requires_payment_method',
    metadata: { source: BOOKING_PAYMENT_SOURCE, tenantId: 'tenant-a', bookingId: 'booking-1' },
  }, { admin: createMockAdmin(store), nowIso, connectedAccountId: 'acct_123' });
  assert.equal(result.unconfirmed, true);
  assert.equal(store['tenants/tenant-a/bookings/booking-1'].paymentAccounting, undefined);
});

test('handleBookingCheckoutCompleted updates booking and is safe for duplicate events', async () => {
  const store = baseStore();
  const session = {
    id: 'cs_test_booking',
    amount_total: 19000,
    created: Math.floor(Date.parse(nowIso) / 1000) + 1,
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
    connectedAccountId: 'acct_123',
  });
  const second = await handleBookingCheckoutCompleted(session, {
    admin: createMockAdmin(store),
    nowIso,
    connectedAccountId: 'acct_123',
  });

  assert.equal(first.handled, true);
  assert.equal(second.handled, true);
  assert.equal(store['tenants/tenant-a/bookings/booking-1'].paymentStatus, 'paid_in_full');
  assert.equal(store['tenants/tenant-a/bookings/booking-1'].paymentMethod, 'stripe');
  assert.equal(store['tenants/tenant-a/bookings/booking-1'].amountReceived, 190);
  assert.equal(store['tenants/tenant-a/bookings/booking-1'].stripeCheckoutSessionId, 'cs_test_booking');
  assert.equal(store['tenants/tenant-a/bookings/booking-1'].stripePaymentIntentId, 'pi_123');
});

test('canonical Checkout reconciliation closes its matching shared collection lease', async () => {
  const store = baseStore();
  const admin = createMockAdmin(store);
  const stripe = createStripeMock();
  const checkout = await createBookingCheckoutSessionCore({
    admin, appUrl: 'http://localhost:5173', bookingId: 'booking-1',
    clientCheckoutId: 'checkout-reconcile-0001', getPlatformFee: () => 0.03,
    nowIso, secretKey: 'sk_test_123', stripe, tenantId: 'tenant-a', uid: 'admin-1',
  });
  assert.equal(checkout.success, true);
  const metadata = stripe.calls[0].params.metadata;
  await handleBookingCheckoutCompleted({
    id: checkout.data.sessionId, amount_total: 19000,
    created: Math.floor(Date.parse(nowIso) / 1000) + 1,
    currency: 'usd', livemode: false, metadata,
    payment_intent: 'pi_checkout_reconciled', payment_status: 'paid',
  }, { admin, nowIso, connectedAccountId: 'acct_123' });
  const lease = store['tenants/tenant-a/bookings/booking-1/paymentCollectionControl/current'];
  assert.equal(lease.status, 'completed');
  assert.equal(lease.providerObjectId, checkout.data.sessionId);
  assert.match(lease.canonicalPaymentRecordId, /^stripe_pi_/);
});

test('charge.refunded maps through the connected account and reconciles each refund once', async () => {
  const store = baseStore();
  const stripe = {
    paymentIntents: { retrieve: async (id, options) => {
      assert.equal(id, 'pi_123');
      assert.equal(options.stripeAccount, 'acct_123');
      return { id, status: 'succeeded', amount_received: 19000, currency: 'usd',
        created: Math.floor(Date.parse(nowIso) / 1000) + 1,
        metadata: { source: BOOKING_PAYMENT_SOURCE, tenantId: 'tenant-a', bookingId: 'booking-1' } };
    } },
    refunds: { list: async () => ({ has_more: false, data: [{
      id: 're_123', charge: 'ch_123', payment_intent: 'pi_123',
      amount: 5000, currency: 'usd', status: 'succeeded',
    }] }) },
  };
  const charge = { id: 'ch_123', payment_intent: 'pi_123', currency: 'usd' };
  const options = { admin: createMockAdmin(store), stripe, connectedAccountId: 'acct_123', nowIso };
  assert.equal((await handleBookingChargeRefunded(charge, options)).handled, true);
  assert.equal((await handleBookingChargeRefunded(charge, options)).handled, true);
  const booking = store['tenants/tenant-a/bookings/booking-1'];
  assert.equal(booking.amountReceived, 140);
  assert.equal(booking.paymentStatus, 'partial');
  assert.equal(booking.paymentAccounting.confirmedRefundCents, 5000);
});

test('wrong connected account cannot reconcile a booking refund', async () => {
  const store = baseStore();
  const stripe = {
    paymentIntents: { retrieve: async () => ({ id: 'pi_123', status: 'succeeded',
      amount_received: 19000, currency: 'usd',
      metadata: { source: BOOKING_PAYMENT_SOURCE, tenantId: 'tenant-a', bookingId: 'booking-1' } }) },
  };
  await assert.rejects(handleBookingChargeRefunded(
    { id: 'ch_123', payment_intent: 'pi_123', currency: 'usd' },
    { admin: createMockAdmin(store), stripe, connectedAccountId: 'acct_other', nowIso },
  ), { code: 'connected_account_mismatch' });
  assert.equal(store['tenants/tenant-a/bookings/booking-1'].amountReceived, undefined);
  assert.equal(store['tenants/tenant-a/bookings/booking-1'].paymentAccounting, undefined);
});
