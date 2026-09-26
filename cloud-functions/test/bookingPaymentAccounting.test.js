const assert = require('node:assert/strict');
const test = require('node:test');
const {
  AccountingError, cents, planCutover, balance, cutoverBooking, readCanonicalBalance,
  reconcilePayment, recordManualPayment, reconcileReduction, recordId,
} = require('../bookingPaymentAccounting');
const { createBookingManualPaymentGatewayHandler } = require('../bookingManualPaymentGateway');
const { buildCutoverReport } = require('../scripts/bookingPaymentCutover');

const nowIso = '2026-09-26T09:00:00.000Z';

function fixture(bookingOverrides = {}) {
  const store = new Map([
    ['users/owner-a', { role: 'admin', status: 'active', tenantId: 'tenant-a' }],
    ['users/owner-b', { role: 'admin', status: 'active', tenantId: 'tenant-b' }],
    ['tenants/tenant-a', { users: ['owner-a'], adminUsers: ['owner-a'], stripeAccountId: 'acct_a' }],
    ['tenants/tenant-b', { users: ['owner-b'], adminUsers: ['owner-b'], stripeAccountId: 'acct_b' }],
    ['tenants/tenant-a/bookings/booking-a', { agreedPrice: 100, status: 'scheduled', ...bookingOverrides }],
  ]);
  let nextId = 0;
  let queue = Promise.resolve();
  class Ref {
    constructor(path) { this.path = path; this.id = path.split('/').at(-1); }
    collection(name) { return new Collection(`${this.path}/${name}`); }
    async get() { return { exists: store.has(this.path), data: () => store.get(this.path) }; }
    async create(value) {
      if (store.has(this.path)) throw new Error('exists');
      store.set(this.path, structuredClone(value));
    }
    async update(value) { store.set(this.path, { ...store.get(this.path), ...structuredClone(value) }); }
    async set(value) { store.set(this.path, structuredClone(value)); }
  }
  class Collection {
    constructor(path) { this.path = path; }
    doc(id) { return new Ref(`${this.path}/${id || `auto-${++nextId}`}`); }
    limit() { return this; }
    async get() {
      const prefix = `${this.path}/`;
      return { docs: [...store].filter(([path]) => path.startsWith(prefix) &&
        !path.slice(prefix.length).includes('/')).map(([path, value]) => ({
        id: path.slice(prefix.length), data: () => value,
      })) };
    }
  }
  const db = {
    collection: name => new Collection(name),
    runTransaction(callback) {
      const run = () => callback({
        get: ref => ref.get(), create: (ref, value) => ref.create(value),
        update: (ref, value) => ref.update(value), set: (ref, value) => ref.set(value),
      });
      const result = queue.then(run, run);
      queue = result.then(() => undefined, () => undefined);
      return result;
    },
  };
  const admin = {
    firestore: () => db,
    auth: () => ({ verifyIdToken: async token => {
      if (!token) throw new Error('missing token');
      return { uid: token };
    } }),
  };
  admin.firestore.FieldValue = { serverTimestamp: () => 'server-time' };
  const booking = () => store.get('tenants/tenant-a/bookings/booking-a');
  const records = () => [...store].filter(([path]) => path.startsWith('tenants/tenant-a/bookings/booking-a/paymentRecords/'));
  return { admin, store, booking, records };
}

function payment(admin, providerPaymentId, amountCents, extra = {}) {
  return reconcilePayment({ admin, tenantId: 'tenant-a', bookingId: 'booking-a',
    connectedAccountId: 'acct_a', providerPaymentId, amountCents, currency: 'usd',
    channel: 'online_checkout', nowIso, paymentCreatedAt: Math.floor(Date.parse(nowIso) / 1000) + 1,
    ...extra });
}

function response() {
  return { statusCode: 200, status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; }, set() { return this; }, send() { return this; } };
}

test('integer cents, cutover and collectible balance preserve a legacy opening amount once', async () => {
  assert.equal(cents('0.01'), 1);
  assert.equal(cents('1.23'), 123);
  assert.equal(cents('1.234'), null);
  const f = fixture({ amountReceived: 30.25, stripeAmountReceived: 3025,
    stripePaymentIntentId: 'pi_old', paymentStatus: 'deposit_paid' });
  const first = await cutoverBooking({ admin: f.admin, tenantId: 'tenant-a', bookingId: 'booking-a', nowIso });
  const second = await cutoverBooking({ admin: f.admin, tenantId: 'tenant-a', bookingId: 'booking-a', nowIso: 'later' });
  assert.deepEqual(second, first);
  assert.equal(first.legacyOpeningPaidCents, 3025);
  assert.equal(first.confirmedPaymentCents, 0);
  assert.equal(first.remainingCents, 6975);
  assert.equal(first.paymentStatus, 'partial');
  assert.equal(f.booking().paymentAccounting.cutoverAt, nowIso);
  const old = await payment(f.admin, 'pi_old', 3025);
  assert.equal(old.legacy, true);
  assert.equal(f.records().length, 0);
  assert.equal((await readCanonicalBalance({ admin: f.admin, tenantId: 'tenant-a', bookingId: 'booking-a' })).remainingCents, 6975);
});

test('cutover reports invalid and overpaid legacy state without inventing provenance', async () => {
  const bad = planCutover({ agreedPrice: 100, amountReceived: 'unknown', stripePaymentIntentId: 'pi_old' }, nowIso);
  assert.deepEqual(bad.issues, ['invalid_legacy_amount']);
  const f = fixture({ amountReceived: 120 });
  const result = await cutoverBooking({ admin: f.admin, tenantId: 'tenant-a', bookingId: 'booking-a', nowIso });
  assert.equal(result.remainingCents, 0);
  assert.equal(result.collectible, false);
  assert.deepEqual(f.booking().paymentAccounting.issues, ['legacy_overpayment']);
  const ambiguous = fixture({ amountReceived: 'unknown' });
  await assert.rejects(cutoverBooking({ admin: ambiguous.admin, tenantId: 'tenant-a', bookingId: 'booking-a', nowIso }),
    error => error instanceof AccountingError && error.code === 'ambiguous_legacy_balance');
});

test('cutover report is dry-run by default and reports canonical or ambiguous state deterministically', () => {
  const first = buildCutoverReport({
    booking: { agreedPrice: 100, amountReceived: 25 }, tenantId: 'tenant-a',
    bookingId: 'booking-a', nowIso, mode: undefined,
  });
  const second = buildCutoverReport({
    booking: { agreedPrice: 100, amountReceived: 25 }, tenantId: 'tenant-a',
    bookingId: 'booking-a', nowIso, mode: undefined,
  });
  assert.deepEqual(second, first);
  assert.equal(first.mode, 'dry_run');
  assert.equal(first.alreadyCutOver, false);
  assert.equal(first.legacyOpeningPaidCents, 2500);
  assert.deepEqual(buildCutoverReport({
    booking: { agreedPrice: 100, amountReceived: 'unknown' }, tenantId: 'tenant-a',
    bookingId: 'booking-a', nowIso, mode: undefined,
  }).issues, ['invalid_legacy_amount']);
});

test('unique concurrent Stripe payments aggregate; duplicate identity and wrong account/currency do not', async () => {
  const f = fixture();
  await cutoverBooking({ admin: f.admin, tenantId: 'tenant-a', bookingId: 'booking-a', nowIso });
  const [first, second] = await Promise.all([payment(f.admin, 'pi_a', 4000), payment(f.admin, 'pi_b', 6000)]);
  assert.equal(first.balance.remainingCents === 0 || second.balance.remainingCents === 0, true);
  assert.equal(f.booking().paymentAccounting.confirmedPaymentCents, 10000);
  assert.equal(f.booking().paymentStatus, 'paid_in_full');
  assert.equal(f.records().length, 2);
  assert.equal((await payment(f.admin, 'pi_a', 4000)).duplicate, true);
  assert.equal(f.records().length, 2);
  await assert.rejects(payment(f.admin, 'pi_a', 4100), { code: 'payment_identity_conflict' });
  await assert.rejects(payment(f.admin, 'pi_x', 100, { currency: 'eur' }), { code: 'invalid_payment' });
  await assert.rejects(payment(f.admin, 'pi_x', 100, { connectedAccountId: 'acct_b' }), { code: 'connected_account_mismatch' });
  f.store.set('tenants/tenant-a', { ...f.store.get('tenants/tenant-a'), stripeAccountMode: 'test' });
  await assert.rejects(payment(f.admin, 'pi_x', 100, { livemode: true }), { code: 'stripe_mode_mismatch' });
  assert.equal(f.booking().paymentAccounting.confirmedPaymentCents, 10000);
});

test('one Stripe PaymentIntent cannot be attributed to two bookings in one tenant', async () => {
  const f = fixture();
  f.store.set('tenants/tenant-a/bookings/booking-b', { agreedPrice: 100, status: 'scheduled' });
  await cutoverBooking({ admin: f.admin, tenantId: 'tenant-a', bookingId: 'booking-a', nowIso });
  await cutoverBooking({ admin: f.admin, tenantId: 'tenant-a', bookingId: 'booking-b', nowIso });
  await payment(f.admin, 'pi_shared', 10000);
  await assert.rejects(reconcilePayment({ admin: f.admin, tenantId: 'tenant-a', bookingId: 'booking-b',
    connectedAccountId: 'acct_a', providerPaymentId: 'pi_shared', amountCents: 10000,
    currency: 'usd', channel: 'online_checkout', nowIso,
    paymentCreatedAt: Math.floor(Date.parse(nowIso) / 1000) + 1 }), { code: 'payment_identity_conflict' });
  assert.equal(f.store.get('tenants/tenant-a/bookings/booking-b').amountReceived, 0);
});

test('partial and overpaid Stripe accounting never yields negative collectible balance', async () => {
  const f = fixture();
  await cutoverBooking({ admin: f.admin, tenantId: 'tenant-a', bookingId: 'booking-a', nowIso });
  assert.equal(balance(f.booking()).paymentStatus, 'not_paid');
  const part = await payment(f.admin, 'pi_part', 3000);
  assert.equal(part.balance.remainingCents, 7000);
  assert.equal(part.balance.paymentStatus, 'partial');
  const over = await payment(f.admin, 'pi_extra', 8000);
  assert.equal(over.balance.remainingCents, 0);
  assert.equal(over.balance.netPaidCents, 11000);
  assert.equal(over.balance.collectible, false);
});

test('post-cutover Stripe refund reduces balance once and cannot exceed the original payment', async () => {
  const f = fixture();
  await cutoverBooking({ admin: f.admin, tenantId: 'tenant-a', bookingId: 'booking-a', nowIso });
  await payment(f.admin, 'pi_paid', 10000);
  const request = { admin: f.admin, tenantId: 'tenant-a', bookingId: 'booking-a',
    originalPaymentId: recordId('stripe_pi', 'pi_paid'), reductionId: 're_1', amountCents: 2500,
    kind: 'refund', connectedAccountId: 'acct_a', nowIso };
  const first = await reconcileReduction(request);
  assert.equal(first.balance.remainingCents, 2500);
  assert.equal(first.balance.paymentStatus, 'partial');
  assert.equal((await reconcileReduction(request)).duplicate, true);
  assert.equal(f.booking().paymentAccounting.confirmedRefundCents, 2500);
  await assert.rejects(reconcileReduction({ ...request, reductionId: 're_2', amountCents: 8000 }),
    { code: 'reduction_exceeds_payment' });
  assert.equal(f.records().length, 2);
});

test('unmappable legacy Stripe refund is recorded unresolved and cannot change net paid', async () => {
  const f = fixture({ amountReceived: 100, stripePaymentIntentId: 'pi_old' });
  await cutoverBooking({ admin: f.admin, tenantId: 'tenant-a', bookingId: 'booking-a', nowIso });
  const result = await reconcileReduction({ admin: f.admin, tenantId: 'tenant-a', bookingId: 'booking-a',
    originalPaymentId: recordId('stripe_pi', 'pi_old'), reductionId: 're_old', amountCents: 2000,
    kind: 'refund', connectedAccountId: 'acct_a', nowIso });
  assert.equal(result.unresolvedLegacy, true);
  assert.equal(result.balance.netPaidCents, 10000);
  assert.equal(result.balance.collectible, false);
  assert.equal(f.records()[0][1].status, 'unresolved_legacy');
});

test('pre-cutover Stripe event with a lost old identifier is unresolved, never added to opening balance', async () => {
  const f = fixture({ amountReceived: 100 });
  await cutoverBooking({ admin: f.admin, tenantId: 'tenant-a', bookingId: 'booking-a', nowIso });
  const old = await payment(f.admin, 'pi_older_unstored', 10000, {
    paymentCreatedAt: Math.floor(Date.parse(nowIso) / 1000) - 86400,
  });
  assert.equal(old.unresolvedLegacy, true);
  assert.equal(old.balance.netPaidCents, 10000);
  assert.equal(old.balance.collectible, false);
  assert.equal(f.records()[0][1].status, 'unresolved_legacy');
  assert.equal((await payment(f.admin, 'pi_older_unstored', 10000)).duplicate, true);
  const refund = await reconcileReduction({ admin: f.admin, tenantId: 'tenant-a', bookingId: 'booking-a',
    originalPaymentId: recordId('stripe_pi', 'pi_older_unstored'), reductionId: 're_old',
    amountCents: 5000, kind: 'refund', connectedAccountId: 'acct_a', nowIso });
  assert.equal(refund.unresolvedLegacy, true);
  assert.equal(f.booking().paymentAccounting.confirmedRefundCents, 0);
});

test('manual gateway derives tenant and records bounded payment; full reversal is idempotent', async () => {
  const f = fixture();
  const handler = createBookingManualPaymentGatewayHandler({ admin: f.admin, now: () => nowIso });
  const call = async (token, body) => {
    const res = response();
    await handler({ method: 'POST', headers: { authorization: `Bearer ${token}` }, body }, res);
    return res;
  };
  const request = { action: 'record', bookingId: 'booking-a', clientPaymentId: 'manual-attempt-0001',
    amount: '25.50', method: 'cash' };
  const unauthenticated = await call('', request);
  assert.equal(unauthenticated.statusCode, 401);
  const denied = await call('owner-b', { ...request, amount: '10' });
  assert.equal(denied.statusCode, 404);
  f.store.set('tenants/tenant-a', { stripeAccountId: 'acct_a', users: ['owner-a'], adminUsers: [] });
  const missingMembership = await call('owner-a', request);
  assert.equal(missingMembership.statusCode, 403);
  f.store.set('tenants/tenant-a', {
    users: ['owner-a'], adminUsers: ['owner-a'], stripeAccountId: 'acct_a',
  });
  const invalid = await call('owner-a', { ...request, amount: '0' });
  assert.equal(invalid.statusCode, 400);
  const first = await call('owner-a', request);
  assert.equal(first.statusCode, 200);
  assert.equal(first.body.balance.remainingCents, 7450);
  const retry = await call('owner-a', request);
  assert.equal(retry.body.duplicate, true);
  assert.equal(retry.body.id, first.body.id);
  assert.equal(f.records().length, 1);
  const conflict = await call('owner-a', { ...request, amount: '20' });
  assert.equal(conflict.statusCode, 409);
  const tooMuch = await call('owner-a', { ...request, clientPaymentId: 'manual-attempt-0002', amount: '80' });
  assert.equal(tooMuch.statusCode, 409);
  const reverse = { action: 'reverse', bookingId: 'booking-a', paymentRecordId: first.body.id };
  assert.equal((await call('owner-a', reverse)).body.balance.remainingCents, 10000);
  assert.equal((await call('owner-a', reverse)).body.duplicate, true);
  assert.equal(f.booking().paymentAccounting.confirmedRefundCents, 0);
  assert.equal(f.booking().paymentAccounting.confirmedManualReversalCents, 2550);
  assert.equal(f.records().length, 2);
});

test('manual payment cannot race an active Checkout link', async () => {
  const f = fixture();
  await cutoverBooking({ admin: f.admin, tenantId: 'tenant-a', bookingId: 'booking-a', nowIso });
  f.store.set('tenants/tenant-a/bookings/booking-a', {
    ...f.booking(), stripeCheckoutSessionId: 'cs_open', stripePaymentStatus: 'checkout_created',
    stripeCheckoutSessionExpiresAt: 1893456000,
  });
  await assert.rejects(recordManualPayment({ admin: f.admin, tenantId: 'tenant-a', bookingId: 'booking-a',
    actorUid: 'owner-a', clientPaymentId: 'manual-attempt-0003', amountCents: 100,
    method: 'cash', note: '', nowIso }),
  { code: 'checkout_link_active' });
  assert.equal(f.records().length, 0);
});
