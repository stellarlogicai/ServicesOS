const test = require('node:test');
const assert = require('node:assert/strict');
const { createJobScopeGatewayHandler } = require('../jobScopeGateway');
const { canonicalJobScopeSnapshot, scopeHash } = require('../jobScopeControl');
const { employeeJobPacket } = require('../employeeJobPacketProjection');
const { balance, planCutover, readCanonicalBalance, reconcilePayment, reconcileReduction, recordId,
  recordManualPayment, acquirePaymentCollectionLease } = require('../bookingPaymentAccounting');
const { createBookingCheckoutSessionCore } = require('../bookingStripe');
const { approveCustomerExtraWork } = require('../extraWorkApproval');

function fixture({ uid = 'customer-a', requestStatus = 'approval_ready', requestScopeVersion = 1, identityTenant = 'tenant-a' } = {}) {
  const bookingPath = 'tenants/tenant-a/bookings/booking-a';
  const baseBooking = {
    customerId: 'customer-a-record',
    bookingType: 'residential',
    customerName: 'Customer',
    address: '1 Main St',
    serviceType: 'Deep clean',
    date: '2099-01-01',
    startTime: '09:00',
    agreedPrice: 200,
    estimatedDuration: 120,
    assignedEmployeeAuthUid: 'employee-a',
    status: 'scheduled',
    requestSnapshot: { serviceScope: { baseboards: true } },
    jobChecklistSnapshot: { items: [{ id: 'base', label: 'Base clean', area: 'General', required: true }] },
  };
  const originalSnapshot = canonicalJobScopeSnapshot('booking-a', baseBooking);
  const originalHash = scopeHash(originalSnapshot);
  const booking = {
    ...baseBooking,
    jobScopeControl: { state: 'approved', latestVersion: 1, latestScopeHash: originalHash, approvedVersion: 1, approvedScopeHash: originalHash, approvedAt: '2026-09-01T12:00:00.000Z' },
    approvedJobScope: { version: 1, scopeHash: originalHash, approvedAt: '2026-09-01T12:00:00.000Z', snapshot: originalSnapshot },
  };
  const request = {
    id: 'request-a', bookingId: 'booking-a', status: requestStatus,
    submission: {
      scope: { version: requestScopeVersion, scopeHash: originalHash },
      employeeUid: 'employee-a', requestedAt: '2026-09-02T12:00:00.000Z', employeeNote: 'private',
      items: [{ id: 'oven', label: 'Oven', priceCents: 4500, durationMinutes: 45, quantity: 2, lineTotalCents: 9000, totalDurationMinutes: 90 }],
      customRequest: { description: 'Clean pantry', context: 'private customer context' },
    },
    ownerReview: {
      reviewedAt: '2026-09-03T12:00:00.000Z', reviewedByUid: 'owner-a', disposition: 'same_visit_additional_time',
      customPriceCents: 12000, customDurationMinutes: 60, ownerNote: 'private owner note', authorizedExtensionMinutes: 30,
    },
  };
  const data = new Map([
    ['users/customer-a', { role: 'customer', status: 'active', tenantId: identityTenant }],
    ['users/customer-b', { role: 'customer', status: 'active', tenantId: 'tenant-a' }],
    ['users/customer-other-tenant', { role: 'customer', status: 'active', tenantId: 'tenant-b' }],
    ['users/owner-a', { role: 'admin', status: 'active', tenantId: 'tenant-a' }],
    ['users/employee-a', { role: 'employee', status: 'active', tenantId: 'tenant-a' }],
    ['tenants/tenant-a', { users: ['customer-a', 'customer-b', 'owner-a', 'employee-a'], adminUsers: ['owner-a'] }],
    ['tenants/tenant-b', { users: ['customer-other-tenant'], adminUsers: [] }],
    ['tenants/tenant-a/customers/customer-a-record', { authUid: 'customer-a', status: 'active' }],
    ['tenants/tenant-a/customers/customer-b-record', { authUid: 'customer-b', status: 'active' }],
    ['tenants/tenant-b/customers/customer-other-record', { authUid: 'customer-other-tenant', status: 'active' }],
    [bookingPath, booking],
    [`${bookingPath}/jobScopeVersions/v1`, { version: 1, state: 'approved', scopeHash: originalHash, snapshot: originalSnapshot, approvedAt: '2026-09-01T12:00:00.000Z' }],
    [`${bookingPath}/extraWorkRequests/request-a`, request],
  ]);
  const writes = [];
  class Ref {
    constructor(path) { this.path = path; this.id = path.split('/').at(-1); }
    collection(name) { return new Query(`${this.path}/${name}`); }
    async get() { return snapshot(this); }
  }
  class Query {
    constructor(path) { this.path = path; this.filters = []; this.maximum = null; }
    doc(id) { return new Ref(`${this.path}/${id}`); }
    where(field, operator, value) { assert.equal(operator, '=='); this.filters.push([field, value]); return this; }
    limit(maximum) { this.maximum = maximum; return this; }
    async get() {
      const prefix = `${this.path}/`;
      let docs = [...data].filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
        .map(([path, value]) => ({ id: path.slice(prefix.length), ref: new Ref(path), data: () => structuredClone(value) }));
      for (const [field, value] of this.filters) docs = docs.filter(doc => doc.data()[field] === value);
      if (this.maximum !== null) docs = docs.slice(0, this.maximum);
      return { docs };
    }
  }
  const snapshot = ref => ({ id: ref.id, exists: data.has(ref.path), data: () => structuredClone(data.get(ref.path)) });
  let queue = Promise.resolve();
  const db = { collection: name => new Query(name), runTransaction(callback) {
    const run = async () => {
      const staged = [];
      const result = await callback({ get: ref => Promise.resolve(snapshot(ref)),
        create: (ref, value) => staged.push(['create', ref.path, structuredClone(value)]),
        update: (ref, value) => staged.push(['update', ref.path, structuredClone(value)]),
        set: (ref, value) => staged.push(['set', ref.path, structuredClone(value)]),
      });
      for (const [kind, path, value] of staged) {
        if (kind === 'create') assert.equal(data.has(path), false);
        data.set(path, kind === 'update' ? { ...data.get(path), ...value } : value);
        writes.push([kind, path, value]);
      }
      return result;
    };
    const result = queue.then(run, run);
    queue = result.then(() => undefined, () => undefined);
    return result;
  } };
  const admin = { auth: () => ({ verifyIdToken: async () => ({ uid }) }), firestore: () => db };
  admin.firestore.FieldValue = { serverTimestamp: () => 'synthetic-server-time' };
  return { admin, data, writes, bookingPath, originalSnapshot, originalHash };
}

function response() {
  return { statusCode: 0, body: null, set() { return this; }, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; }, send(value) { this.body = value; return this; } };
}

async function call(source, body) {
  const res = response();
  await createJobScopeGatewayHandler({ admin: source.admin })({ method: 'POST', headers: { authorization: 'Bearer fake' }, body }, res);
  return res;
}

const approval = { action: 'customer_extra_work_approve', bookingId: 'booking-a', requestId: 'request-a', affirmativeAcceptance: true };
const nowIso = '2026-09-04T12:00:00.000Z';
function accountingFixture(options) {
  const source = fixture(options);
  const booking = source.data.get(source.bookingPath);
  booking.paymentAccounting = planCutover(booking, '2026-09-01T12:00:00.000Z');
  Object.assign(source.data.get('tenants/tenant-a'), { stripeAccountId: 'acct_synthetic', chargesEnabled: true });
  return source;
}
const paymentArgs = source => ({ admin: source.admin, tenantId: 'tenant-a', bookingId: 'booking-a', nowIso });

test('IW-02 partial payment and delayed duplicate webhook preserve revised authority and refund provenance', async () => {
  const source = accountingFixture();
  const paid = { ...paymentArgs(source), connectedAccountId: 'acct_synthetic', providerPaymentId: 'pi_synthetic', amountCents: 10000,
    currency: 'usd', channel: 'online_checkout', paymentCreatedAt: Date.parse(nowIso) / 1000 };
  await reconcilePayment(paid);
  assert.equal((await call(source, approval)).statusCode, 200);
  assert.equal((await reconcilePayment(paid)).duplicate, true);
  assert.equal(balance(source.data.get(source.bookingPath)).remainingCents, 31000);
  await reconcileReduction({ ...paymentArgs(source), connectedAccountId: 'acct_synthetic', originalPaymentId: recordId('stripe_pi', 'pi_synthetic'),
    reductionId: 'refund_synthetic', amountCents: 2500, kind: 'refund' });
  assert.equal(balance(source.data.get(source.bookingPath)).remainingCents, 33500);
  assert.equal(source.data.get(source.bookingPath).agreedPrice, 200);
});

test('IW-02 paid base can receive an approved revised obligation without fabricating payment', async () => {
  const source = accountingFixture();
  await recordManualPayment({ ...paymentArgs(source), actorUid: 'owner-a', clientPaymentId: 'manual-operation-001', amountCents: 20000, method: 'cash', note: '' });
  assert.equal((await call(source, approval)).statusCode, 200);
  assert.equal(balance(source.data.get(source.bookingPath)).remainingCents, 21000);
  assert.equal(source.data.get(source.bookingPath).paymentStatus, 'partial');
  await reconcileReduction({ ...paymentArgs(source), kind: 'manual_reversal', actorUid: 'owner-a', amountCents: 20000,
    originalPaymentId: recordId('manual', 'owner-a\nmanual-operation-001'), reductionId: 'reversal_synthetic' });
  assert.equal(balance(source.data.get(source.bookingPath)).remainingCents, 41000);
});

for (const state of ['reserved', 'provider_pending', 'unknown']) {
  test(`IW-02 unresolved ${state} collection blocks approval without mutation even after local expiry`, async () => {
    const source = accountingFixture();
    source.data.set(`${source.bookingPath}/paymentCollectionControl/current`, { version: 1, status: state,
      tenantId: 'tenant-a', bookingId: 'booking-a', channel: 'checkout', providerObjectId: 'cs_synthetic', providerExpiresAtMs: 1 });
    const before = structuredClone([...source.data]);
    assert.equal((await call(source, approval)).statusCode, 409);
    assert.deepEqual([...source.data], before);
  });
}

test('IW-02 legacy unresolved Checkout blocks approval without a shared lease', async () => {
  const source = accountingFixture();
  Object.assign(source.data.get(source.bookingPath), { stripePaymentStatus: 'checkout_created', stripeCheckoutSessionId: 'cs_synthetic', stripeCheckoutSessionExpiresAt: 1 });
  assert.equal((await call(source, approval)).statusCode, 409);
});

test('IW-02 released collection allows approval, and Checkout receives the revised remaining amount', async () => {
  const source = accountingFixture();
  source.data.set(`${source.bookingPath}/paymentCollectionControl/current`, { version: 1, tenantId: 'tenant-a', bookingId: 'booking-a', status: 'released' });
  assert.equal((await call(source, approval)).statusCode, 200);
  const calls = [];
  const result = await createBookingCheckoutSessionCore({ ...paymentArgs(source), uid: 'owner-a', clientCheckoutId: 'checkout-operation-001', appUrl: 'http://localhost:5173',
    secretKey: '', getPlatformFee: () => 0, stripe: { checkout: { sessions: { create: async params => {
      calls.push(params); return { id: 'cs_synthetic', url: 'https://example.invalid/checkout', expires_at: Date.parse(nowIso) / 1000 + 3600 };
    } } } } });
  assert.equal(result.success, true);
  assert.equal(result.data.amount, 41000);
  assert.equal(calls[0].line_items[0].price_data.unit_amount, 41000);
});

test('IW-02 concurrent same approvals reuse one revision; different stale requests cannot add twice', async () => {
  const source = accountingFixture();
  source.data.set(`${source.bookingPath}/extraWorkRequests/request-b`, { ...structuredClone(source.data.get(`${source.bookingPath}/extraWorkRequests/request-a`)), id: 'request-b' });
  const results = await Promise.all([call(source, approval), call(source, approval), call(source, { ...approval, requestId: 'request-b' })]);
  assert.deepEqual(results.map(result => result.statusCode), [200, 200, 409]);
  assert.equal(balance(source.data.get(source.bookingPath)).totalCents, 41000);
  assert.equal(source.data.has(`${source.bookingPath}/jobScopeVersions/v3`), false);
});

test('IW-02 collection and approval serialize against the same booking and lease', async () => {
  const source = accountingFixture();
  const [lease, approvalResult] = await Promise.all([
    acquirePaymentCollectionLease({ ...paymentArgs(source), channel: 'terminal', operationId: 'terminal-operation-001', actorUid: 'owner-a' }),
    call(source, approval),
  ]);
  assert.equal(lease.lease.amountCents, 20000);
  assert.equal(approvalResult.statusCode, 409);
  assert.equal(balance(source.data.get(source.bookingPath)).totalCents, 20000);
});

test('IW-02 invalid base monetary precision cannot be legitimized by rounded scope history', async () => {
  const source = accountingFixture();
  source.data.get(source.bookingPath).agreedPrice = '111.111';
  assert.equal((await call(source, approval)).statusCode, 409);
});

test('IW-02 invalid reviewed cents, missing immutable evidence and unresolved payment history fail without writes', async () => {
  for (const kind of ['precision', 'history', 'unresolved_payment']) {
    const source = accountingFixture();
    if (kind === 'precision') source.data.get(`${source.bookingPath}/extraWorkRequests/request-a`).ownerReview.customPriceCents = 111.111;
    if (kind === 'history') source.data.delete(`${source.bookingPath}/jobScopeVersions/v1`);
    if (kind === 'unresolved_payment') source.data.get(source.bookingPath).paymentAccounting.issues = ['unresolved_legacy_payment'];
    const before = structuredClone([...source.data]);
    assert.equal((await call(source, approval)).statusCode, 409);
    assert.deepEqual([...source.data], before);
  }
});

test('IW-02 an approval that wins first binds the next collector to the revised amount', async () => {
  const source = accountingFixture();
  const [result, lease] = await Promise.all([approveCustomerExtraWork({ admin: source.admin,
    context: { tenantId: 'tenant-a', uid: 'customer-a' }, customer: { id: 'customer-a-record' },
    bookingId: 'booking-a', requestId: 'request-a', now: new Date(nowIso) }),
    acquirePaymentCollectionLease({ ...paymentArgs(source), channel: 'checkout', operationId: 'checkout-operation-002', actorUid: 'owner-a' })]);
  assert.equal(result.request.approvedRevisionVersion, 2);
  assert.equal(lease.lease.amountCents, 41000);
});

test('IW-02 a delayed confirmed payment changes net paid, never the approved total', async () => {
  const source = accountingFixture();
  assert.equal((await call(source, approval)).statusCode, 200);
  await reconcilePayment({ ...paymentArgs(source), connectedAccountId: 'acct_synthetic', providerPaymentId: 'pi_delayed_synthetic', amountCents: 20000,
    currency: 'usd', channel: 'online_checkout', paymentCreatedAt: Date.parse('2026-09-02T12:00:00Z') / 1000 });
  const current = await readCanonicalBalance(paymentArgs(source));
  assert.equal(current.totalCents, 41000);
  assert.equal(current.netPaidCents, 20000);
  assert.equal(current.remainingCents, 21000);
});

test('IW-02 approved revised total reaches canonical accounting without changing the original price', async () => {
  const source = fixture();
  const original = source.data.get(source.bookingPath);
  original.paymentAccounting = planCutover(original, '2026-09-01T12:00:00.000Z');
  assert.equal(balance(original).totalCents, 20000);
  const result = await call(source, approval);
  assert.equal(result.statusCode, 200);
  const booking = source.data.get(source.bookingPath);
  assert.equal(booking.approvedJobScope.snapshot.price, 410);
  assert.equal(booking.agreedPrice, 200);
  assert.equal(balance(booking).totalCents, 41000);
  assert.equal(booking.remainingBalanceCents, 41000);
  assert.equal(booking.paymentStatus, 'not_paid');
});

test('valid customer approval creates one immutable authoritative scope revision', async () => {
  const source = fixture();
  const before = structuredClone(source.data.get(`${source.bookingPath}/jobScopeVersions/v1`));
  const oldPacket = employeeJobPacket('booking-a', source.data.get(source.bookingPath), 'UTC');
  const result = await call(source, approval);
  assert.equal(result.statusCode, 200);
  const booking = source.data.get(source.bookingPath);
  const revision = source.data.get(`${source.bookingPath}/jobScopeVersions/v2`);
  const request = source.data.get(`${source.bookingPath}/extraWorkRequests/request-a`);
  assert.deepEqual(source.data.get(`${source.bookingPath}/jobScopeVersions/v1`), before);
  assert.equal(revision.priorVersion, 1);
  assert.equal(revision.source, 'extra_work');
  assert.equal(revision.approvedByCustomerUid, 'customer-a');
  assert.equal(revision.snapshot.price, 410);
  assert.equal(revision.snapshot.estimatedDuration, 270);
  assert.deepEqual(revision.snapshot.selectedAddOns, ['baseboards', 'oven']);
  assert.match(revision.snapshot.serviceItems.map(item => item.label).join('|'), /Oven x 2/);
  assert.match(revision.snapshot.serviceItems.map(item => item.label).join('|'), /Clean pantry/);
  assert.equal(booking.approvedJobScope.version, 2);
  assert.equal(booking.jobScopeControl.approvedVersion, 2);
  assert.equal(scopeHash(canonicalJobScopeSnapshot('booking-a', booking)), booking.approvedJobScope.scopeHash);
  assert.equal(request.status, 'customer_approved');
  assert.equal(request.customerApproval.scopeVersion, 2);
  const newPacket = employeeJobPacket('booking-a', booking, 'UTC');
  assert.equal(oldPacket.approvedScope.version, 1);
  assert.equal(newPacket.approvedScope.version, 2);
  assert.match(newPacket.approvedScope.serviceItems.map(item => item.label).join('|'), /Clean pantry/);
  assert.equal(JSON.stringify(newPacket).includes('410'), false);
});

test('duplicate approval is idempotent and does not create another revision', async () => {
  const source = fixture();
  assert.equal((await call(source, approval)).statusCode, 200);
  const writesAfterFirst = source.writes.length;
  const second = await call(source, approval);
  assert.equal(second.statusCode, 200);
  assert.equal(second.body.request.approvedRevisionVersion, 2);
  assert.equal(source.writes.length, writesAfterFirst);
  assert.equal(source.data.has(`${source.bookingPath}/jobScopeVersions/v3`), false);
});

test('owner and employee credentials cannot impersonate customer approval', async () => {
  assert.equal((await call(fixture({ uid: 'owner-a' }), approval)).statusCode, 403);
  assert.equal((await call(fixture({ uid: 'employee-a' }), approval)).statusCode, 403);
});

test('wrong customer and cross-tenant customer cannot approve', async () => {
  assert.equal((await call(fixture({ uid: 'customer-b' }), approval)).statusCode, 404);
  assert.equal((await call(fixture({ uid: 'customer-other-tenant' }), approval)).statusCode, 404);
});

test('non-ready, declined, cancelled, and stale requests cannot create revisions', async () => {
  for (const status of ['submitted', 'declined', 'cancelled', 'expired']) {
    const source = accountingFixture({ requestStatus: status });
    assert.equal((await call(source, approval)).statusCode, 409, status);
    assert.equal(source.data.has(`${source.bookingPath}/jobScopeVersions/v2`), false);
    assert.equal(balance(source.data.get(source.bookingPath)).totalCents, 20000);
  }
  const stale = fixture({ requestScopeVersion: 0 });
  assert.equal((await call(stale, approval)).statusCode, 409);
  assert.equal(stale.data.has(`${stale.bookingPath}/jobScopeVersions/v2`), false);
});

test('customer list exposes reviewed terms without private employee or owner fields', async () => {
  const source = fixture();
  const result = await call(source, { action: 'customer_extra_work_list', bookingId: 'booking-a' });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.requests.length, 1);
  const json = JSON.stringify(result.body);
  assert.equal(json.includes('employeeNote'), false);
  assert.equal(json.includes('ownerNote'), false);
  assert.equal(json.includes('reviewedByUid'), false);
  assert.equal(json.includes('private customer context'), false);
  assert.equal(result.body.requests[0].totalPriceCents, 21000);
});

test('approval request shape rejects customer-supplied scope, price, actor, and timestamp', async () => {
  for (const extra of [
    { priceCents: 1 }, { tenantId: 'tenant-b' }, { uid: 'owner-a' }, { approvedAt: 'fake' }, { scope: {} },
  ]) {
    assert.equal((await call(fixture(), { ...approval, ...extra })).statusCode, 400);
  }
});
