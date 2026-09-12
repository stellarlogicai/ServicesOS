const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  ActivationError,
  activateOwnerSubscription,
  createOwnerSubscriptionActivationWebhookHandler,
  subscriptionIdFromInvoice,
} = require('../ownerSubscriptionActivationWebhook');

const PRICE_ID = 'price_servicesos100';

function fixture({ tenant = {}, owner = {} } = {}) {
  const state = {
    'tenants/tenant-a': {
      onboardingSchemaVersion: 1, onboardingOwnerUid: 'owner-a', onboardingState: 'billing_required',
      status: 'onboarding', adminUsers: ['owner-a'], stripeCustomerId: 'cus_owner', ...tenant,
    },
    'users/owner-a': { role: 'admin', status: 'active', tenantId: 'tenant-a', ...owner },
  };
  const writes = [];
  const ref = path => ({ path, collection: name => ref(`${path}/${name}`), doc: id => ref(`${path}/${id}`) });
  const snapshot = path => ({ exists: state[path] !== undefined, data: () => structuredClone(state[path]) });
  const transaction = {
    get: async documentRef => snapshot(documentRef.path),
    update: (documentRef, value) => {
      state[documentRef.path] = { ...state[documentRef.path], ...structuredClone(value) };
      writes.push({ path: documentRef.path, value: structuredClone(value) });
    },
  };
  const admin = { firestore: () => ({ collection: name => ref(name), runTransaction: callback => callback(transaction) }) };
  admin.firestore.FieldValue = { serverTimestamp: () => 'server-time' };
  return { admin, state, writes };
}

function invoice(overrides = {}) {
  return {
    id: 'in_paid', paid: true, status: 'paid', created: 100,
    customer: 'cus_owner', subscription: 'sub_owner', ...overrides,
  };
}

function subscription(overrides = {}) {
  return {
    id: 'sub_owner', status: 'active', customer: 'cus_owner', current_period_end: 200,
    cancel_at_period_end: false,
    metadata: { tenantId: 'tenant-a', billingPurpose: 'servicesos_owner_subscription', onboardingSchemaVersion: '1' },
    items: { data: [{ price: { id: PRICE_ID }, quantity: 1 }] }, ...overrides,
  };
}

const activate = (source, invoiceValue = invoice(), subscriptionValue = subscription()) =>
  activateOwnerSubscription({ admin: source.admin, invoice: invoiceValue, subscription: subscriptionValue, priceId: PRICE_ID });

test('valid invoice.paid activates tenant and writes canonical billing facts', async () => {
  const source = fixture();
  assert.deepEqual(await activate(source), { success: true, activated: true, stale: false });
  assert.deepEqual(source.state['tenants/tenant-a'], {
    onboardingSchemaVersion: 1, onboardingOwnerUid: 'owner-a', onboardingState: 'active', status: 'active',
    adminUsers: ['owner-a'], stripeCustomerId: 'cus_owner', stripeSubscriptionId: 'sub_owner',
    subscriptionStatus: 'active', subscriptionPriceId: PRICE_ID, currentPeriodEnd: 200,
    cancelAtPeriodEnd: false, latestInvoiceId: 'in_paid', latestInvoiceCreated: 100,
    billingUpdatedAt: 'server-time', ownerSubscriptionCheckout: null,
  });
  assert.equal('subscriptionTier' in source.state['tenants/tenant-a'], false);
});

test('current Stripe invoice.paid shape may omit the legacy paid boolean', async () => {
  const source = fixture();
  assert.deepEqual(
    await activate(source, invoice({ paid: undefined })),
    { success: true, activated: true, stale: false },
  );
  assert.equal(source.state['tenants/tenant-a'].status, 'active');
});

test('supports current parent subscription correlation and rejects non-subscription parent', () => {
  assert.equal(subscriptionIdFromInvoice(invoice({ subscription: undefined, parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_owner' } } })), 'sub_owner');
  assert.equal(subscriptionIdFromInvoice(invoice({ parent: { type: 'quote_details', quote_details: { quote: 'qt_1' } } })), '');
});

test('invoice payment, active subscription, customer, metadata, Price, and quantity are mandatory', async () => {
  const cases = [
    [invoice({ paid: false })], [invoice({ status: 'open' })],
    [invoice(), subscription({ status: 'incomplete' })], [invoice(), subscription({ status: 'incomplete_expired' })],
    [invoice({ customer: 'cus_other' })],
    [invoice(), subscription({ metadata: { tenantId: 'tenant-b', billingPurpose: 'servicesos_owner_subscription', onboardingSchemaVersion: '1' } })],
    [invoice(), subscription({ metadata: { tenantId: 'tenant-a', billingPurpose: 'other', onboardingSchemaVersion: '1' } })],
    [invoice(), subscription({ metadata: { tenantId: 'tenant-a', billingPurpose: 'servicesos_owner_subscription', onboardingSchemaVersion: '2' } })],
    [invoice(), subscription({ items: { data: [{ price: { id: 'price_other' }, quantity: 1 }] } })],
    [invoice(), subscription({ items: { data: [{ price: { id: PRICE_ID }, quantity: 2 }] } })],
  ];
  for (const [invoiceValue, subscriptionValue = subscription()] of cases) {
    const source = fixture();
    await assert.rejects(activate(source, invoiceValue, subscriptionValue), ActivationError);
    assert.equal(source.writes.length, 0);
  }
});

test('tenant Customer and canonical owner relationship are revalidated transactionally', async () => {
  for (const source of [
    fixture({ tenant: { stripeCustomerId: 'cus_other' } }),
    fixture({ tenant: { onboardingOwnerUid: 'owner-b' } }),
    fixture({ tenant: { adminUsers: [] } }),
    fixture({ owner: { role: 'employee' } }),
    fixture({ owner: { status: 'disabled' } }),
  ]) {
    await assert.rejects(activate(source), ActivationError);
    assert.equal(source.writes.length, 0);
  }
});

test('duplicate and exact already-active deliveries are idempotent', async () => {
  const source = fixture();
  await activate(source);
  assert.deepEqual(await activate(source), { success: true, activated: false, stale: false });
  assert.equal(source.state['tenants/tenant-a'].stripeSubscriptionId, 'sub_owner');
});

test('conflicting active billing identity fails closed', async () => {
  const source = fixture({ tenant: { status: 'active', onboardingState: 'active', stripeSubscriptionId: 'sub_other', subscriptionPriceId: PRICE_ID } });
  await assert.rejects(activate(source), ActivationError);
  assert.equal(source.writes.length, 0);
});

test('stale paid invoice cannot regress active billing facts', async () => {
  const source = fixture({ tenant: {
    status: 'active', onboardingState: 'active', stripeSubscriptionId: 'sub_owner', subscriptionPriceId: PRICE_ID,
    latestInvoiceId: 'in_new', latestInvoiceCreated: 500,
  } });
  assert.deepEqual(await activate(source), { success: true, activated: false, stale: true });
  assert.equal(source.writes.length, 0);
  assert.equal(source.state['tenants/tenant-a'].latestInvoiceId, 'in_new');
});

test('other tenant lifecycle states cannot be activated', async () => {
  for (const tenant of [{ onboardingState: 'agreement_required' }, { status: 'disabled' }, { onboardingSchemaVersion: 2 }]) {
    const source = fixture({ tenant });
    await assert.rejects(activate(source), ActivationError);
    assert.equal(source.writes.length, 0);
  }
});

test('handler verifies signature, retrieves subscription independently, and ignores unrelated events', async () => {
  const source = fixture();
  const calls = [];
  let event = { type: 'invoice.paid', data: { object: invoice() } };
  const stripe = {
    webhooks: { constructEvent: (raw, signature, secret) => { calls.push(['signature', raw, signature, secret]); return event; } },
    subscriptions: { retrieve: async id => { calls.push(['retrieve', id]); return subscription(); } },
  };
  const handler = createOwnerSubscriptionActivationWebhookHandler({ admin: source.admin, getStripe: () => stripe, getWebhookSecret: () => 'whsec_test', getPriceId: () => PRICE_ID });
  const invoke = async () => {
    const res = { statusCode: 0, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await handler({ method: 'POST', rawBody: Buffer.from('signed'), headers: { 'stripe-signature': 'sig' } }, res);
    return res;
  };
  assert.equal((await invoke()).statusCode, 200);
  assert.deepEqual(calls[0].slice(2), ['sig', 'whsec_test']);
  assert.deepEqual(calls[1], ['retrieve', 'sub_owner']);
  event = { type: 'invoice.created', data: { object: invoice() } };
  assert.equal((await invoke()).statusCode, 200);
  assert.equal(calls.filter(call => call[0] === 'retrieve').length, 1);
});

test('signature and validation failures expose no Stripe or tenant detail', async () => {
  const source = fixture();
  const invoke = async stripe => {
    const handler = createOwnerSubscriptionActivationWebhookHandler({ admin: source.admin, getStripe: () => stripe, getWebhookSecret: () => 'secret', getPriceId: () => PRICE_ID });
    const res = { statusCode: 0, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await handler({ method: 'POST', rawBody: Buffer.from('x'), headers: {} }, res);
    return res;
  };
  const badSignature = await invoke({ webhooks: { constructEvent: () => { throw new Error('secret detail'); } } });
  assert.equal(badSignature.statusCode, 400);
  assert.equal(JSON.stringify(badSignature.body).includes('secret detail'), false);
  const rejected = await invoke({ webhooks: { constructEvent: () => ({ type: 'invoice.paid', data: { object: invoice({ paid: false }) } }) }, subscriptions: { retrieve: async () => subscription() } });
  assert.equal(rejected.statusCode, 409);
  assert.equal(JSON.stringify(rejected.body).includes('tenant-a'), false);
});
