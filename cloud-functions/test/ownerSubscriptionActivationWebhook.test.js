const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  ActivationError,
  activateOwnerSubscription,
  applyOwnerSubscriptionLifecycle,
  createOwnerSubscriptionActivationWebhookHandler,
  subscriptionIdFromInvoice,
} = require('../ownerSubscriptionActivationWebhook');

const PRICE_ID = 'price_servicesos100';
const ANNUAL_PRICE_ID = 'price_servicesos1000year';
const PRICE_IDS = { monthlyPriceId: PRICE_ID, annualPriceId: ANNUAL_PRICE_ID };

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
  activateOwnerSubscription({ admin: source.admin, invoice: invoiceValue, subscription: subscriptionValue, priceIds: PRICE_IDS });

test('valid invoice.paid activates tenant and writes canonical billing facts', async () => {
  const source = fixture();
  assert.deepEqual(await activate(source), { success: true, activated: true, stale: false });
  assert.deepEqual(source.state['tenants/tenant-a'], {
    onboardingSchemaVersion: 1, onboardingOwnerUid: 'owner-a',
    onboardingState: 'operational_setup_required', status: 'active',
    adminUsers: ['owner-a'], stripeCustomerId: 'cus_owner', stripeSubscriptionId: 'sub_owner',
    subscriptionStatus: 'active', subscriptionPriceId: PRICE_ID, currentPeriodEnd: 200,
    cancelAtPeriodEnd: false, latestInvoiceId: 'in_paid', latestInvoiceCreated: 100,
    billingUpdatedAt: 'server-time', ownerSubscriptionCheckout: null,
    paymentFailureAt: null, cureDeadline: null,
  });
  assert.equal('subscriptionTier' in source.state['tenants/tenant-a'], false);
});

test('active subscription entitlement does not complete operational onboarding', async () => {
  const source = fixture();
  await activate(source);
  const tenant = source.state['tenants/tenant-a'];
  assert.equal(tenant.subscriptionStatus, 'active');
  assert.equal(tenant.status, 'active');
  assert.equal(tenant.onboardingState, 'operational_setup_required');
});

test('current Stripe invoice.paid shape may omit the legacy paid boolean', async () => {
  const source = fixture();
  assert.deepEqual(
    await activate(source, invoice({ paid: undefined })),
    { success: true, activated: true, stale: false },
  );
  assert.equal(source.state['tenants/tenant-a'].status, 'active');
});

test('annual Price activates canonically and keeps renewal failure, recovery, and cancellation semantics', async () => {
  const source = fixture();
  const annual = subscription({
    current_period_end: 1000 + 366 * 86400,
    metadata: { tenantId: 'tenant-a', billingPurpose: 'servicesos_owner_subscription', onboardingSchemaVersion: '1',
      priceId: ANNUAL_PRICE_ID, billingInterval: 'annual' },
    items: { data: [{ price: { id: ANNUAL_PRICE_ID }, quantity: 1 }] },
  });
  await activate(source, invoice(), annual);
  assert.equal(source.state['tenants/tenant-a'].subscriptionPriceId, ANNUAL_PRICE_ID);
  assert.equal(source.state['tenants/tenant-a'].currentPeriodEnd, annual.current_period_end);

  const failed = invoice({ id: 'in_annual_failed', status: 'open', paid: false, created: 101 });
  await lifecycle(source, 'invoice.payment_failed', annual, failed, 1000);
  assert.equal(source.state['tenants/tenant-a'].subscriptionStatus, 'past_due');
  assert.equal(source.state['tenants/tenant-a'].cureDeadline, 1000 + 7 * 86400);

  await activate(source, invoice({ id: 'in_annual_recovered', created: 102 }), annual);
  assert.equal(source.state['tenants/tenant-a'].subscriptionStatus, 'active');
  assert.equal(source.state['tenants/tenant-a'].subscriptionPriceId, ANNUAL_PRICE_ID);
  assert.equal(source.state['tenants/tenant-a'].paymentFailureAt, null);
  assert.equal(source.state['tenants/tenant-a'].cureDeadline, null);

  await lifecycle(source, 'customer.subscription.deleted', { ...annual, status: 'canceled' });
  assert.equal(source.state['tenants/tenant-a'].subscriptionStatus, 'canceled');
  assert.equal(source.state['tenants/tenant-a'].subscriptionPriceId, ANNUAL_PRICE_ID);
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
  const source = fixture({ tenant: { status: 'active', onboardingState: 'operational_setup_required', stripeSubscriptionId: 'sub_other', subscriptionPriceId: PRICE_ID } });
  await assert.rejects(activate(source), ActivationError);
  assert.equal(source.writes.length, 0);
});

test('renewal preserves incomplete or complete operational state', async () => {
  for (const onboardingState of ['operational_setup_required', 'active']) {
    const source = fixture({ tenant: {
      status: 'active', onboardingState, stripeSubscriptionId: 'sub_owner',
      subscriptionPriceId: PRICE_ID, subscriptionStatus: 'active',
    } });
    await activate(source);
    assert.equal(source.state['tenants/tenant-a'].onboardingState, onboardingState);
  }
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
  const handler = createOwnerSubscriptionActivationWebhookHandler({ admin: source.admin, getStripe: () => stripe, getWebhookSecret: () => 'whsec_test', getPriceIds: () => PRICE_IDS });
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
    const handler = createOwnerSubscriptionActivationWebhookHandler({ admin: source.admin, getStripe: () => stripe, getWebhookSecret: () => 'secret', getPriceIds: () => PRICE_IDS });
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

const lifecycle = (source, eventType, subscriptionValue = subscription(), invoiceValue = undefined, nowSeconds = 1000) =>
  applyOwnerSubscriptionLifecycle({ admin: source.admin, subscription: subscriptionValue,
    priceIds: PRICE_IDS, eventType, invoice: invoiceValue, nowSeconds });

test('renewal failure creates a server-owned fixed seven-day cure and duplicate does not extend it', async () => {
  const source = fixture();
  await activate(source);
  const failed = invoice({ id: 'in_failed', status: 'open', paid: false, created: 101 });
  await lifecycle(source, 'invoice.payment_failed', subscription(), failed);
  const tenant = source.state['tenants/tenant-a'];
  assert.equal(tenant.subscriptionStatus, 'past_due');
  assert.equal(tenant.paymentFailureAt, 1000);
  assert.equal(tenant.cureDeadline, 1000 + 7 * 86400);
  assert.equal(tenant.onboardingState, 'operational_setup_required');
  await lifecycle(source, 'invoice.payment_failed', subscription(), failed, 2000);
  assert.equal(tenant.cureDeadline, 1000 + 7 * 86400);
});

test('valid later paid invoice recovers without altering operational onboarding', async () => {
  const source = fixture();
  await activate(source);
  await lifecycle(source, 'invoice.payment_failed', subscription(), invoice({ id: 'in_failed', status: 'open', paid: false, created: 101 }));
  await activate(source, invoice({ id: 'in_recovered', created: 102 }), subscription({ current_period_end: 500 }));
  const tenant = source.state['tenants/tenant-a'];
  assert.equal(tenant.subscriptionStatus, 'active');
  assert.equal(tenant.paymentFailureAt, null);
  assert.equal(tenant.cureDeadline, null);
  assert.equal(tenant.latestInvoiceId, 'in_recovered');
  assert.equal(tenant.currentPeriodEnd, 500);
  assert.equal(tenant.onboardingState, 'operational_setup_required');
});

test('scheduled cancellation keeps paid state; termination removes it', async () => {
  const source = fixture();
  await activate(source);
  await lifecycle(source, 'customer.subscription.updated', subscription({ cancel_at_period_end: true, current_period_end: 2000 }));
  assert.equal(source.state['tenants/tenant-a'].subscriptionStatus, 'active');
  assert.equal(source.state['tenants/tenant-a'].cancelAtPeriodEnd, true);
  await lifecycle(source, 'customer.subscription.deleted', subscription({ status: 'canceled', current_period_end: 2000 }));
  assert.equal(source.state['tenants/tenant-a'].subscriptionStatus, 'canceled');
  await assert.rejects(activate(source, invoice({ created: 102 })), ActivationError);
});

test('lifecycle cannot mutate a wrong canonical customer, subscription, price or tenant', async () => {
  for (const [tenant, provider] of [
    [{ stripeCustomerId: 'cus_other' }, subscription()],
    [{ stripeSubscriptionId: 'sub_other' }, subscription()],
    [{ subscriptionPriceId: 'price_other' }, subscription()],
    [{}, subscription({ metadata: { tenantId: 'tenant-b', billingPurpose: 'servicesos_owner_subscription', onboardingSchemaVersion: '1' } })],
  ]) {
    const source = fixture({ tenant: { status: 'active', onboardingState: 'operational_setup_required',
      stripeSubscriptionId: 'sub_owner', subscriptionPriceId: PRICE_ID, ...tenant } });
    await assert.rejects(lifecycle(source, 'customer.subscription.updated', provider), ActivationError);
    assert.equal(source.writes.length, 0);
  }
});

test('invalid configured Price and forged invoice correlation cannot mutate billing', async () => {
  const source = fixture();
  await activate(source);
  const before = source.writes.length;
  await assert.rejects(applyOwnerSubscriptionLifecycle({ admin: source.admin, subscription: subscription(),
    priceIds: {}, eventType: 'customer.subscription.updated' }), ActivationError);
  await assert.rejects(lifecycle(source, 'invoice.payment_failed', subscription(),
    invoice({ id: 'in_failed', status: 'open', paid: false, created: 101, customer: 'cus_other' })), ActivationError);
  assert.equal(source.writes.length, before);
});

test('fresh provider update does not clear an unresolved failure; duplicate cancellation is stable', async () => {
  const source = fixture();
  await activate(source);
  await lifecycle(source, 'invoice.payment_failed', subscription(), invoice({ id: 'in_failed', status: 'open', paid: false, created: 101 }));
  const deadline = source.state['tenants/tenant-a'].cureDeadline;
  await lifecycle(source, 'customer.subscription.updated', subscription({ current_period_end: 500 }));
  assert.equal(source.state['tenants/tenant-a'].subscriptionStatus, 'past_due');
  assert.equal(source.state['tenants/tenant-a'].cureDeadline, deadline);
  await lifecycle(source, 'customer.subscription.deleted', subscription({ status: 'canceled', current_period_end: 500 }));
  const writes = source.writes.length;
  await lifecycle(source, 'customer.subscription.deleted', subscription({ status: 'canceled', current_period_end: 500 }));
  assert.equal(source.writes.length, writes);
});

test('fresh paid invoice suppresses delayed failure webhook', async () => {
  const source = fixture();
  await activate(source);
  const staleFailure = invoice({ id: 'in_paid', status: 'open', paid: false });
  const stripe = {
    webhooks: { constructEvent: () => ({ type: 'invoice.payment_failed', data: { object: staleFailure } }) },
    subscriptions: { retrieve: async () => subscription({ latest_invoice: 'in_paid' }) },
    invoices: { retrieve: async () => invoice() },
  };
  const handler = createOwnerSubscriptionActivationWebhookHandler({ admin: source.admin, getStripe: () => stripe,
    getWebhookSecret: () => 'test', getPriceIds: () => PRICE_IDS });
  const res = { statusCode: 0, status(code) { this.statusCode = code; return this; }, json() { return this; } };
  await handler({ method: 'POST', rawBody: Buffer.from('signed'), headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(source.state['tenants/tenant-a'].subscriptionStatus, 'active');
});

test('signed failure and provider cancellation events update only the canonical tenant', async () => {
  const source = fixture();
  await activate(source);
  let event = { type: 'invoice.payment_failed', data: { object: invoice({
    id: 'in_failed', status: 'open', paid: false, created: 101,
  }) } };
  let provider = subscription({ latest_invoice: 'in_failed' });
  const stripe = {
    webhooks: { constructEvent: () => event },
    subscriptions: { retrieve: async () => provider },
    invoices: { retrieve: async () => event.data.object },
  };
  const handler = createOwnerSubscriptionActivationWebhookHandler({ admin: source.admin, getStripe: () => stripe,
    getWebhookSecret: () => 'test', getPriceIds: () => PRICE_IDS });
  const invoke = async () => {
    const res = { statusCode: 0, status(code) { this.statusCode = code; return this; }, json() { return this; } };
    await handler({ method: 'POST', rawBody: Buffer.from('signed'), headers: {} }, res);
    return res.statusCode;
  };
  assert.equal(await invoke(), 200);
  assert.equal(source.state['tenants/tenant-a'].subscriptionStatus, 'past_due');
  event = { type: 'customer.subscription.deleted', data: { object: { id: 'sub_owner' } } };
  provider = subscription({ status: 'canceled' });
  assert.equal(await invoke(), 200);
  assert.equal(source.state['tenants/tenant-a'].subscriptionStatus, 'canceled');
});
