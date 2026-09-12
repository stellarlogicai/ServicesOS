const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  BILLING_PURPOSE,
  createCheckout,
  createOwnerOnboardingBillingGatewayHandler,
} = require('../ownerOnboardingBillingGateway');

function fixture({ user = {}, tenant = {}, customer = null, session = null, stripeError = null } = {}) {
  const state = {
    'users/owner-a': { role: 'admin', status: 'active', tenantId: 'tenant-a', email: 'owner@example.test', ...user },
    'tenants/tenant-a': {
      onboardingSchemaVersion: 1, onboardingOwnerUid: 'owner-a', onboardingState: 'billing_required',
      status: 'onboarding', adminUsers: ['owner-a'], businessName: 'Owner Business', businessEmail: 'billing@example.test', ...tenant,
    },
  };
  const writes = [];
  const calls = { customersCreate: [], customersRetrieve: [], sessionsCreate: [], sessionsRetrieve: [] };
  const ref = path => ({ path, collection: name => ref(`${path}/${name}`), doc: id => ref(`${path}/${id}`), get: async () => snapshot(path) });
  const snapshot = path => ({ exists: state[path] !== undefined, data: () => structuredClone(state[path]) });
  const transaction = {
    get: async documentRef => snapshot(documentRef.path),
    update: (documentRef, value) => {
      state[documentRef.path] = { ...state[documentRef.path], ...structuredClone(value) };
      writes.push({ path: documentRef.path, value: structuredClone(value) });
    },
  };
  const admin = {
    auth: () => ({ verifyIdToken: async token => {
      if (token === 'invalid') throw new Error('invalid');
      return { uid: 'owner-a', email: 'token@example.test' };
    } }),
    firestore: () => ({ collection: name => ref(name), runTransaction: async callback => callback(transaction) }),
  };
  admin.firestore.FieldValue = { serverTimestamp: () => 'server-time' };
  const defaultCustomer = customer || { id: 'cus_owner', metadata: { tenantId: 'tenant-a', billingPurpose: BILLING_PURPOSE, onboardingSchemaVersion: '1' } };
  const defaultSession = session || {
    id: 'cs_owner', url: 'https://checkout.stripe.com/c/pay/test', status: 'open', customer: 'cus_owner',
    metadata: { tenantId: 'tenant-a', billingPurpose: BILLING_PURPOSE, onboardingSchemaVersion: '1', priceId: 'price_servicesos100' },
  };
  const stripe = {
    customers: {
      create: async (...args) => { calls.customersCreate.push(args); if (stripeError) throw stripeError; return structuredClone(defaultCustomer); },
      retrieve: async id => { calls.customersRetrieve.push(id); if (stripeError) throw stripeError; return structuredClone(defaultCustomer); },
    },
    checkout: { sessions: {
      create: async (...args) => { calls.sessionsCreate.push(args); if (stripeError) throw stripeError; return structuredClone(defaultSession); },
      retrieve: async id => { calls.sessionsRetrieve.push(id); if (stripeError) throw stripeError; return structuredClone(defaultSession); },
    } },
  };
  return { admin, calls, state, stripe, writes };
}

const run = source => createCheckout({
  admin: source.admin, identity: { uid: 'owner-a' }, stripe: source.stripe,
  priceId: 'price_servicesos100', appUrl: 'https://servicesos.netlify.app', body: {},
});

test('valid owner creates tenant-bound customer and fixed subscription Checkout without activation', async () => {
  const source = fixture();
  const result = await run(source);
  assert.deepEqual(result, { success: true, checkout: { sessionId: 'cs_owner', checkoutUrl: 'https://checkout.stripe.com/c/pay/test' } });
  const [customerParams, customerOptions] = source.calls.customersCreate[0];
  assert.equal(customerParams.email, 'billing@example.test');
  assert.deepEqual(customerParams.metadata, { tenantId: 'tenant-a', billingPurpose: BILLING_PURPOSE, onboardingSchemaVersion: '1' });
  assert.equal(customerOptions.idempotencyKey, 'servicesos-owner-customer-tenant-a');
  const [params, options] = source.calls.sessionsCreate[0];
  assert.equal(params.mode, 'subscription');
  assert.deepEqual(params.line_items, [{ price: 'price_servicesos100', quantity: 1 }]);
  assert.equal(params.customer, 'cus_owner');
  assert.equal(params.subscription_data.trial_period_days, undefined);
  assert.equal(params.subscription_data.metadata.billingPurpose, BILLING_PURPOSE);
  assert.equal(params.metadata.priceId, 'price_servicesos100');
  assert.equal(params.transfer_data, undefined);
  assert.equal(params.application_fee_amount, undefined);
  assert.equal(params.payment_method_types, undefined);
  assert.match(params.success_url, /^https:\/\/servicesos\.netlify\.app\//);
  assert.equal(options.idempotencyKey, 'servicesos-owner-checkout-tenant-a-1');
  assert.equal(source.state['tenants/tenant-a'].status, 'onboarding');
  assert.equal(source.state['tenants/tenant-a'].onboardingState, 'billing_required');
});

test('existing customer must carry exact tenant and purpose metadata', async () => {
  const valid = fixture({ tenant: { stripeCustomerId: 'cus_owner' } });
  await run(valid);
  assert.deepEqual(valid.calls.customersRetrieve, ['cus_owner']);
  assert.equal(valid.calls.customersCreate.length, 0);

  for (const metadata of [
    { tenantId: 'tenant-b', billingPurpose: BILLING_PURPOSE, onboardingSchemaVersion: '1' },
    { tenantId: 'tenant-a', billingPurpose: 'other', onboardingSchemaVersion: '1' },
  ]) {
    const invalid = fixture({ tenant: { stripeCustomerId: 'cus_owner' }, customer: { id: 'cus_owner', metadata } });
    await assert.rejects(run(invalid), error => error.code === 'billing_unavailable');
    assert.equal(invalid.calls.sessionsCreate.length, 0);
  }
});

test('open matching Checkout is reused and Customer creation retry is stable', async () => {
  const customerRetry = fixture();
  await run(customerRetry);
  assert.equal(customerRetry.state['tenants/tenant-a'].stripeCustomerId, 'cus_owner');
  const prior = customerRetry.state['tenants/tenant-a'].ownerSubscriptionCheckout;
  const retry = fixture({ tenant: { stripeCustomerId: 'cus_owner', ownerSubscriptionCheckout: prior } });
  const result = await run(retry);
  assert.equal(result.checkout.sessionId, 'cs_owner');
  assert.equal(retry.calls.sessionsRetrieve.length, 1);
  assert.equal(retry.calls.sessionsCreate.length, 0);
});

test('terminal prior Checkout produces a replacement with incremented idempotency attempt', async () => {
  const source = fixture({
    tenant: { stripeCustomerId: 'cus_owner', ownerSubscriptionCheckout: { sessionId: 'cs_old', customerId: 'cus_owner', priceId: 'price_servicesos100', status: 'open', attempt: 2 } },
    session: { id: 'cs_owner', url: 'https://checkout.stripe.com/c/pay/new', status: 'expired', customer: 'cus_owner', metadata: { tenantId: 'tenant-a', billingPurpose: BILLING_PURPOSE, onboardingSchemaVersion: '1', priceId: 'price_servicesos100' } },
  });
  source.stripe.checkout.sessions.create = async (...args) => {
    source.calls.sessionsCreate.push(args);
    return { ...source.stripeSession, id: 'cs_new', url: 'https://checkout.stripe.com/c/pay/new', status: 'open', customer: 'cus_owner', metadata: { tenantId: 'tenant-a', billingPurpose: BILLING_PURPOSE, onboardingSchemaVersion: '1', priceId: 'price_servicesos100' } };
  };
  await run(source);
  assert.equal(source.calls.sessionsCreate[0][1].idempotencyKey, 'servicesos-owner-checkout-tenant-a-3');
});

test('identity, lifecycle, legacy, membership, active, and injected authority fail closed', async () => {
  const sources = [
    fixture({ user: { role: 'employee' } }), fixture({ user: { status: 'disabled' } }),
    fixture({ tenant: { onboardingOwnerUid: 'owner-b' } }), fixture({ tenant: { adminUsers: ['owner-b'] } }),
    fixture({ tenant: { onboardingState: 'agreement_required' } }), fixture({ tenant: { status: 'active', onboardingState: 'active' } }),
    fixture({ tenant: { onboardingSchemaVersion: undefined } }),
  ];
  for (const source of sources) await assert.rejects(run(source), error => error.code === 'billing_unavailable');
  for (const body of [{ tenantId: 'tenant-b' }, { priceId: 'price_other' }, { tier: 'pro' }, { customerId: 'cus_other' }, { status: 'active' }]) {
    const source = fixture();
    await assert.rejects(createCheckout({ admin: source.admin, identity: { uid: 'owner-a' }, stripe: source.stripe, priceId: 'price_servicesos100', appUrl: 'https://servicesos.netlify.app', body }), error => error.code === 'invalid_request');
  }
});

test('missing or unsafe server configuration fails before Stripe use', async () => {
  for (const config of [
    { priceId: '', appUrl: 'https://servicesos.netlify.app' },
    { priceId: 'not-a-price', appUrl: 'https://servicesos.netlify.app' },
    { priceId: 'price_ok', appUrl: 'http://servicesos.netlify.app' },
  ]) {
    const source = fixture();
    await assert.rejects(createCheckout({ admin: source.admin, identity: { uid: 'owner-a' }, stripe: source.stripe, body: {}, ...config }), error => error.status === 503);
    assert.equal(source.calls.customersCreate.length, 0);
  }
});

test('handler requires auth, controls methods, and projects Stripe failures safely', async () => {
  const invoke = async ({ method = 'POST', token, source = fixture() } = {}) => {
    const res = { statusCode: 0, body: null, headers: {}, set(k, v) { this.headers[k] = v; return this; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, send(body) { this.body = body; return this; } };
    await createOwnerOnboardingBillingGatewayHandler({ admin: source.admin, getStripe: () => source.stripe, getPriceId: () => 'price_servicesos100', getAppUrl: () => 'https://servicesos.netlify.app' })({ method, headers: token ? { authorization: `Bearer ${token}` } : {}, body: {} }, res);
    return res;
  };
  assert.equal((await invoke()).statusCode, 401);
  assert.equal((await invoke({ token: 'invalid' })).statusCode, 401);
  assert.equal((await invoke({ method: 'GET', token: 'valid' })).statusCode, 405);
  const failure = await invoke({ token: 'valid', source: fixture({ stripeError: new Error('secret Stripe detail') }) });
  assert.equal(failure.statusCode, 503);
  assert.equal(JSON.stringify(failure.body).includes('secret Stripe detail'), false);
});
