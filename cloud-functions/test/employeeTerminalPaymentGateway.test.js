const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createEmployeeTerminalPaymentGatewayHandler,
  parseRequest,
  providerIdempotencyKey,
} = require('../employeeTerminalPaymentGateway');
const { handleBookingPaymentSucceeded } = require('../bookingStripe');
const { collectionOperationHash } = require('../bookingPaymentAccounting');

const NOW = '2026-09-26T18:00:00.000Z';
const OPERATION = 'terminal-operation-0001';
const BOOKING_PATH = 'tenants/tenant-a/bookings/booking-a';
const LEASE_PATH = `${BOOKING_PATH}/paymentCollectionControl/current`;

function accounting(paid = 0) {
  return { version: 1, cutoverAt: NOW, currency: 'usd', legacyOpeningPaidCents: 0,
    confirmedPaymentCents: paid, confirmedRefundCents: 0, confirmedManualReversalCents: 0,
    legacyStripePaymentIntentId: null, legacyStripeCheckoutSessionId: null, issues: [] };
}

function fixture(overrides = {}) {
  const state = new Map(Object.entries({
    'users/employee-a': { role: 'employee', status: 'active', tenantId: 'tenant-a', email: 'employee@example.test' },
    'users/customer-a': { role: 'customer', status: 'active', tenantId: 'tenant-a', email: 'customer@example.test' },
    'users/admin-a': { role: 'admin', status: 'active', tenantId: 'tenant-a', email: 'admin@example.test' },
    'tenants/tenant-a': { users: ['employee-a', 'admin-a'], adminUsers: ['admin-a'],
      stripeAccountId: 'acct_a', subscriptionTier: 'professional', stripeAccountMode: 'test', timeZone: 'America/Chicago' },
    'tenants/tenant-a/employees/employee-a': { authUid: 'employee-a', status: 'active',
      email: 'employee@example.test', canCollectPayments: true },
    [BOOKING_PATH]: { agreedPrice: 100, status: 'completed', fieldStatus: 'completed',
      assignedEmployeeAuthUid: 'employee-a', date: '2026-09-26', paymentAccounting: accounting() },
    'tenants/tenant-a/paymentProviderConfiguration/terminal': { version: 1, active: true,
      stripeAccountId: 'acct_a', locationId: 'tml_location_a', mode: 'test' },
    ...overrides,
  }));
  let queue = Promise.resolve();
  class Ref {
    constructor(path) { this.path = path; this.id = path.split('/').at(-1); }
    collection(name) { return new Collection(`${this.path}/${name}`); }
    async get() { return { exists: state.has(this.path), data: () => state.get(this.path), ref: this }; }
    async set(value) { state.set(this.path, structuredClone(value)); }
    async update(value) { state.set(this.path, { ...(state.get(this.path) || {}), ...structuredClone(value) }); }
    async create(value) { if (state.has(this.path)) throw new Error('exists'); state.set(this.path, structuredClone(value)); }
  }
  class Collection { constructor(path) { this.path = path; } doc(id) { return new Ref(`${this.path}/${id}`); } }
  const db = {
    collection: name => new Collection(name),
    runTransaction(callback) {
      const run = () => callback({ get: ref => ref.get(), set: (ref, value) => ref.set(value),
        update: (ref, value) => ref.update(value), create: (ref, value) => ref.create(value) });
      const result = queue.then(run, run);
      queue = result.then(() => undefined, () => undefined);
      return result;
    },
  };
  const admin = { firestore: () => db, auth: () => ({ verifyIdToken: async token => {
    if (!token || token === 'invalid') throw new Error('invalid');
    return { uid: token };
  } }) };
  admin.firestore.FieldValue = { serverTimestamp: () => 'server-time' };
  return { admin, state };
}

function stripeFixture(options = {}) {
  const intents = new Map();
  const creates = [];
  const retrieves = [];
  const tokens = [];
  const cancels = [];
  return {
    intents, creates, retrieves, tokens, cancels,
    accounts: { retrieve: async id => options.account || { id, charges_enabled: true, payouts_enabled: true,
      details_submitted: true, requirements: { currently_due: [], past_due: [] } } },
    terminal: {
      locations: { retrieve: async (id, requestOptions) => {
        assert.equal(requestOptions.stripeAccount, 'acct_a');
        return options.location === null ? null : options.location || { id, deleted: false };
      } },
      connectionTokens: { create: async (params, requestOptions) => {
        tokens.push({ params, requestOptions });
        return { secret: 'pst_test_ephemeral_secret' };
      } },
    },
    paymentIntents: {
      create: async (params, requestOptions) => {
        creates.push({ params, requestOptions });
        if (options.createError) throw options.createError;
        const prior = [...intents.values()].find(value => value.idempotencyKey === requestOptions.idempotencyKey);
        if (prior) return prior.intent;
        const intent = { id: `pi_terminal_${intents.size + 1}`, client_secret: 'pi_secret_ephemeral',
          status: 'requires_payment_method', amount: params.amount, amount_received: 0,
          currency: params.currency, metadata: params.metadata, livemode: false,
          created: Math.floor(Date.parse(NOW) / 1000) + 1 };
        intents.set(intent.id, { intent, idempotencyKey: requestOptions.idempotencyKey });
        if (options.createErrorAfterStore) throw options.createErrorAfterStore;
        return intent;
      },
      retrieve: async (id, requestOptions) => {
        retrieves.push({ id, requestOptions });
        if (options.retrieveError) throw options.retrieveError;
        return intents.get(id)?.intent || options.intent;
      },
      cancel: async (id, params, requestOptions) => {
        cancels.push({ id, params, requestOptions });
        if (options.cancelError) throw options.cancelError;
        const entry = intents.get(id);
        const intent = { ...(entry?.intent || options.intent), id, status: 'canceled' };
        if (entry) entry.intent = intent;
        return intent;
      },
    },
  };
}

function response() {
  return { statusCode: 0, body: null, set() {}, status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }, send() { return this; } };
}

function gateway(f, stripe) {
  return createEmployeeTerminalPaymentGatewayHandler({ admin: f.admin, getStripe: () => stripe,
    getStripeMode: () => 'test', getPlatformFee: () => 0.03, now: () => new Date(NOW) });
}

async function call(f, stripe, body = { action: 'prepare', bookingId: 'booking-a', operationId: OPERATION }, uid = 'employee-a') {
  const res = response();
  await gateway(f, stripe)({ method: 'POST', headers: uid ? { authorization: `Bearer ${uid}` } : {}, body }, res);
  return res;
}

function preparedLease(state) {
  return state.get(LEASE_PATH);
}

test('request contract accepts only action, bookingId, and stable operationId', () => {
  assert.deepEqual(parseRequest({ action: 'prepare', bookingId: 'booking-a', operationId: OPERATION }),
    { action: 'prepare', bookingId: 'booking-a', operationId: OPERATION });
  for (const injected of ['amount', 'tenantId', 'stripeAccountId', 'locationId', 'currency', 'actorUid']) {
    assert.throws(() => parseRequest({ action: 'prepare', bookingId: 'booking-a', operationId: OPERATION,
      [injected]: 'forged' }));
  }
});

test('authentication, role, membership, identity, status, and permission fail closed', async () => {
  assert.equal((await call(fixture(), stripeFixture(), undefined, '')).statusCode, 401);
  assert.equal((await call(fixture(), stripeFixture(), undefined, 'customer-a')).statusCode, 403);
  assert.equal((await call(fixture(), stripeFixture(), undefined, 'admin-a')).statusCode, 403);
  for (const mutate of [
    f => f.state.set('users/employee-a', { ...f.state.get('users/employee-a'), status: 'inactive' }),
    f => f.state.set('tenants/tenant-a', { ...f.state.get('tenants/tenant-a'), users: ['admin-a'] }),
    f => f.state.set('tenants/tenant-a/employees/employee-a', { ...f.state.get('tenants/tenant-a/employees/employee-a'), authUid: 'other' }),
    f => f.state.set('tenants/tenant-a/employees/employee-a', { ...f.state.get('tenants/tenant-a/employees/employee-a'), email: 'other@example.test' }),
    f => f.state.set('tenants/tenant-a/employees/employee-a', { ...f.state.get('tenants/tenant-a/employees/employee-a'), canCollectPayments: false }),
    f => { const record = { ...f.state.get('tenants/tenant-a/employees/employee-a') }; delete record.canCollectPayments;
      f.state.set('tenants/tenant-a/employees/employee-a', record); },
  ]) {
    const f = fixture(); mutate(f);
    assert.equal((await call(f, stripeFixture())).statusCode, 403);
  }
});

test('prepare requires current assignment, visible completed work, valid booking, and collectible balance', async () => {
  for (const expectedStatus of [
    { assignedEmployeeAuthUid: 'other' }, { status: 'cancelled' }, { isDeleted: true },
    { isArchived: true }, { fieldStatus: 'in_progress' }, { date: '2026-09-25' },
  ]) {
    const f = fixture({ [BOOKING_PATH]: { ...fixture().state.get(BOOKING_PATH), ...expectedStatus } });
    assert.equal((await call(f, stripeFixture())).statusCode, 404);
  }
  const paid = fixture();
  paid.state.set(BOOKING_PATH, { ...paid.state.get(BOOKING_PATH), paymentAccounting: accounting(10000) });
  const result = await call(paid, stripeFixture());
  assert.equal(result.statusCode, 409);
  assert.equal(result.body.code, 'fully_paid');
});

test('prepare uses canonical amount, connected account, location, metadata, fee, and shared terminal lease', async () => {
  const f = fixture(); const stripe = stripeFixture();
  const result = await call(f, stripe);
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, 'ready');
  assert.equal(result.body.amountCents, 10000);
  assert.equal(result.body.currency, 'usd');
  assert.equal(result.body.locationId, 'tml_location_a');
  assert.equal(result.body.clientSecret, 'pi_secret_ephemeral');
  assert.equal(stripe.creates.length, 1);
  const create = stripe.creates[0];
  assert.equal(create.params.amount, 10000);
  assert.deepEqual(create.params.payment_method_types, ['card_present']);
  assert.equal(create.params.capture_method, 'automatic');
  assert.equal(create.params.application_fee_amount, 300);
  assert.equal(create.params.metadata.paymentChannel, 'card_present');
  assert.equal(create.params.metadata.tenantId, 'tenant-a');
  assert.equal(create.params.metadata.bookingId, 'booking-a');
  assert.equal(create.requestOptions.stripeAccount, 'acct_a');
  assert.equal(create.params.stripeAccountId, undefined);
  assert.equal(create.params.locationId, undefined);
  const lease = preparedLease(f.state);
  assert.equal(lease.channel, 'terminal');
  assert.equal(lease.amountCents, 10000);
  assert.equal(lease.connectedAccountId, 'acct_a');
  assert.equal(lease.providerObjectId, 'pi_terminal_1');
  assert.equal(lease.operationId, undefined);
  assert.equal(lease.status, 'provider_pending');
});

test('prepare calls Stripe with canonical connected account and stable server idempotency', async () => {
  const f = fixture(); const stripe = stripeFixture();
  await call(f, stripe);
  const first = stripe.creates[0];
  assert.equal(first.requestOptions.stripeAccount, 'acct_a');
  const lease = preparedLease(f.state);
  const expected = providerIdempotencyKey({ tenantId: 'tenant-a', bookingId: 'booking-a',
    operationHash: collectionOperationHash(OPERATION) });
  assert.equal(lease.operationHash, collectionOperationHash(OPERATION));
  assert.equal(stripe.intents.get(lease.providerObjectId).idempotencyKey, expected);
});

test('same operation reuses one PaymentIntent while competing terminal, checkout, and manual operations conflict', async () => {
  const f = fixture(); const stripe = stripeFixture();
  const first = await call(f, stripe);
  const second = await call(f, stripe);
  assert.equal(first.body.clientSecret, second.body.clientSecret);
  assert.equal(stripe.creates.length, 1);
  const different = await call(f, stripe, { action: 'prepare', bookingId: 'booking-a',
    operationId: 'terminal-operation-0002' });
  assert.equal(different.statusCode, 409);
  for (const channel of ['checkout', 'manual']) {
    const other = fixture();
    other.state.set(LEASE_PATH, { version: 1, tenantId: 'tenant-a', bookingId: 'booking-a', channel,
      operationHash: collectionOperationHash(`${channel}-operation-0001`), attempt: 1,
      actorUid: channel === 'manual' ? 'admin-a' : 'admin-a', amountCents: 10000, currency: 'usd',
      connectedAccountId: channel === 'checkout' ? 'acct_a' : null, status: 'reserved' });
    assert.equal((await call(other, stripeFixture())).statusCode, 409);
  }
});

test('missing or mismatched Terminal configuration and unready Connect account fail closed before PaymentIntent creation', async () => {
  const missing = fixture(); missing.state.delete('tenants/tenant-a/paymentProviderConfiguration/terminal');
  assert.equal((await call(missing, stripeFixture())).body.code, 'terminal_setup_required');
  const mismatch = fixture(); mismatch.state.set('tenants/tenant-a/paymentProviderConfiguration/terminal', {
    version: 1, active: true, stripeAccountId: 'acct_other', locationId: 'tml_location_a', mode: 'test' });
  assert.equal((await call(mismatch, stripeFixture())).body.code, 'terminal_setup_required');
  const unreadyStripe = stripeFixture({ account: { id: 'acct_a', charges_enabled: false,
    payouts_enabled: true, requirements: { currently_due: [], past_due: [] } } });
  assert.equal((await call(fixture(), unreadyStripe)).body.code, 'terminal_setup_required');
  assert.equal(unreadyStripe.creates.length, 0);
});

test('ambiguous provider failure retains lease and retry uses identical provider idempotency key', async () => {
  const f = fixture();
  const error = new Error('network unavailable');
  const failedStripe = stripeFixture({ createError: error });
  const failed = await call(f, failedStripe);
  assert.equal(failed.statusCode, 503);
  assert.equal(preparedLease(f.state).status, 'reserved');
  const recovered = stripeFixture();
  const retried = await call(f, recovered);
  assert.equal(retried.statusCode, 200);
  assert.equal(failedStripe.creates[0].requestOptions.idempotencyKey,
    recovered.creates[0].requestOptions.idempotencyKey);
});

test('definitive pre-provider failure releases only the matching reserved lease', async () => {
  const f = fixture(); const error = new Error('invalid provider request'); error.statusCode = 400;
  const result = await call(f, stripeFixture({ createError: error }));
  assert.equal(result.statusCode, 422);
  assert.equal(preparedLease(f.state).status, 'released');
});

test('connection token is scoped, ephemeral, and permission revocation blocks new token use', async () => {
  const f = fixture(); const stripe = stripeFixture();
  await call(f, stripe);
  const token = await call(f, stripe, { action: 'connection_token', bookingId: 'booking-a', operationId: OPERATION });
  assert.equal(token.statusCode, 200);
  assert.equal(token.body.secret, 'pst_test_ephemeral_secret');
  assert.deepEqual(stripe.tokens[0], { params: { location: 'tml_location_a' },
    requestOptions: { stripeAccount: 'acct_a' } });
  assert.equal(JSON.stringify([...f.state]).includes('pst_test_ephemeral_secret'), false);
  f.state.set('tenants/tenant-a/employees/employee-a', {
    ...f.state.get('tenants/tenant-a/employees/employee-a'), canCollectPayments: false });
  const denied = await call(f, stripe, { action: 'connection_token', bookingId: 'booking-a', operationId: OPERATION });
  assert.equal(denied.statusCode, 403);
});

test('revoked employee may recover exact existing operation status but cannot prepare another operation', async () => {
  const f = fixture(); const stripe = stripeFixture();
  await call(f, stripe);
  f.state.set('tenants/tenant-a/employees/employee-a', {
    ...f.state.get('tenants/tenant-a/employees/employee-a'), canCollectPayments: false });
  const status = await call(f, stripe, { action: 'status', bookingId: 'booking-a', operationId: OPERATION });
  assert.equal(status.statusCode, 200);
  assert.equal(status.body.status, 'ready');
  const fresh = await call(f, stripe, { action: 'prepare', bookingId: 'booking-a',
    operationId: 'terminal-operation-0002' });
  assert.equal(fresh.statusCode, 403);
});

test('revoked employee status recovery resolves an ambiguously created intent with the same idempotency key', async () => {
  const f = fixture();
  const stripe = stripeFixture({ createErrorAfterStore: new Error('response lost') });
  const prepared = await call(f, stripe);
  assert.equal(prepared.statusCode, 503);
  assert.equal(preparedLease(f.state).status, 'reserved');
  f.state.set('tenants/tenant-a/employees/employee-a', {
    ...f.state.get('tenants/tenant-a/employees/employee-a'), canCollectPayments: false,
  });
  delete stripe.paymentIntents.create;
  stripe.paymentIntents.create = async (params, requestOptions) => {
    stripe.creates.push({ params, requestOptions });
    return [...stripe.intents.values()].find(value =>
      value.idempotencyKey === requestOptions.idempotencyKey).intent;
  };
  const recovered = await call(f, stripe, {
    action: 'status', bookingId: 'booking-a', operationId: OPERATION,
  });
  assert.equal(recovered.statusCode, 200);
  assert.equal(recovered.body.status, 'ready');
  assert.equal(stripe.creates.length, 2);
  assert.equal(stripe.creates[0].requestOptions.idempotencyKey,
    stripe.creates[1].requestOptions.idempotencyKey);
  assert.equal(preparedLease(f.state).providerObjectId, 'pi_terminal_1');
});

test('provider object authority mismatch fails closed and retains the terminal lease', async () => {
  const f = fixture(); const stripe = stripeFixture();
  await call(f, stripe);
  const lease = preparedLease(f.state);
  stripe.intents.get(lease.providerObjectId).intent = {
    ...stripe.intents.get(lease.providerObjectId).intent,
    amount: 1,
    metadata: { tenantId: 'tenant-other' },
  };
  const result = await call(f, stripe, {
    action: 'status', bookingId: 'booking-a', operationId: OPERATION,
  });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, 'uncertain');
  assert.equal(preparedLease(f.state).status, 'provider_pending');
});

test('status reconciles succeeded PaymentIntent once and returns paid only after canonical accounting', async () => {
  const f = fixture(); const stripe = stripeFixture();
  await call(f, stripe);
  const lease = preparedLease(f.state);
  const entry = stripe.intents.get(lease.providerObjectId);
  entry.intent = { ...entry.intent, status: 'succeeded', amount_received: 10000 };
  const first = await call(f, stripe, { action: 'status', bookingId: 'booking-a', operationId: OPERATION });
  const second = await call(f, stripe, { action: 'status', bookingId: 'booking-a', operationId: OPERATION });
  assert.equal(first.body.status, 'paid');
  assert.equal(second.body.status, 'paid');
  assert.equal(f.state.get(BOOKING_PATH).remainingBalanceCents, 0);
  const records = [...f.state.keys()].filter(path => path.startsWith(`${BOOKING_PATH}/paymentRecords/`));
  assert.equal(records.length, 1);
  assert.equal(f.state.get(records[0]).channel, 'card_present');
});

test('webhook-first then status and status-first then webhook each create one canonical payment', async () => {
  for (const webhookFirst of [true, false]) {
    const f = fixture(); const stripe = stripeFixture();
    await call(f, stripe);
    const lease = preparedLease(f.state);
    const entry = stripe.intents.get(lease.providerObjectId);
    entry.intent = { ...entry.intent, status: 'succeeded', amount_received: 10000 };
    const webhook = () => handleBookingPaymentSucceeded(entry.intent, {
      admin: f.admin, nowIso: NOW, connectedAccountId: 'acct_a',
    });
    const recover = () => call(f, stripe, { action: 'status', bookingId: 'booking-a', operationId: OPERATION });
    if (webhookFirst) { await webhook(); await recover(); } else { await recover(); await webhook(); }
    assert.equal([...f.state.keys()].filter(path => path.startsWith(`${BOOKING_PATH}/paymentRecords/`)).length, 1);
    assert.equal(f.state.get(BOOKING_PATH).amountReceived, 100);
  }
});

test('processing and retrieval errors retain provider-associated terminal lease without time release', async () => {
  const f = fixture(); const stripe = stripeFixture();
  await call(f, stripe);
  const lease = preparedLease(f.state);
  stripe.intents.get(lease.providerObjectId).intent.status = 'processing';
  assert.equal((await call(f, stripe, { action: 'status', bookingId: 'booking-a', operationId: OPERATION })).body.status,
    'processing');
  assert.equal(preparedLease(f.state).status, 'provider_pending');
  const uncertain = stripeFixture({ retrieveError: new Error('timeout') });
  uncertain.intents.set(lease.providerObjectId, stripe.intents.get(lease.providerObjectId));
  assert.equal((await call(f, uncertain, { action: 'status', bookingId: 'booking-a', operationId: OPERATION })).body.status,
    'uncertain');
  assert.equal(preparedLease(f.state).status, 'provider_pending');
});

test('cancel reconciles success, retains processing/uncertain, and releases only provider-confirmed cancellation', async () => {
  const succeeded = fixture(); const paidStripe = stripeFixture(); await call(succeeded, paidStripe);
  let lease = preparedLease(succeeded.state); paidStripe.intents.get(lease.providerObjectId).intent = {
    ...paidStripe.intents.get(lease.providerObjectId).intent, status: 'succeeded', amount_received: 10000 };
  assert.equal((await call(succeeded, paidStripe, { action: 'cancel', bookingId: 'booking-a', operationId: OPERATION })).body.status,
    'paid');
  assert.equal(preparedLease(succeeded.state).status, 'completed');

  const processing = fixture(); const processingStripe = stripeFixture(); await call(processing, processingStripe);
  lease = preparedLease(processing.state); processingStripe.intents.get(lease.providerObjectId).intent.status = 'processing';
  assert.equal((await call(processing, processingStripe, { action: 'cancel', bookingId: 'booking-a', operationId: OPERATION })).body.status,
    'processing');
  assert.equal(preparedLease(processing.state).status, 'provider_pending');

  const uncertain = fixture(); const uncertainStripe = stripeFixture({ cancelError: new Error('timeout') });
  await call(uncertain, uncertainStripe);
  assert.equal((await call(uncertain, uncertainStripe, { action: 'cancel', bookingId: 'booking-a', operationId: OPERATION })).body.status,
    'uncertain');
  assert.equal(preparedLease(uncertain.state).status, 'provider_pending');

  const cancelled = fixture(); const cancelStripe = stripeFixture(); await call(cancelled, cancelStripe);
  assert.equal((await call(cancelled, cancelStripe, { action: 'cancel', bookingId: 'booking-a', operationId: OPERATION })).body.status,
    'cancelled');
  assert.equal(preparedLease(cancelled.state).status, 'released');
});
