const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  BILLING_PURPOSE,
  createCheckout,
  createOwnerOnboardingBillingGatewayHandler,
} = require('../ownerOnboardingBillingGateway');
const MONTHLY_PRICE_ID = 'price_servicesos100';
const ANNUAL_PRICE_ID = 'price_servicesos1000year';
const PRICE_IDS = { monthlyPriceId: MONTHLY_PRICE_ID, annualPriceId: ANNUAL_PRICE_ID };

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
    metadata: { tenantId: 'tenant-a', billingPurpose: BILLING_PURPOSE, onboardingSchemaVersion: '1', priceId: MONTHLY_PRICE_ID },
  };
  const stripe = {
    customers: {
      create: async (...args) => { calls.customersCreate.push(args); if (stripeError) throw stripeError; return structuredClone(defaultCustomer); },
      retrieve: async id => { calls.customersRetrieve.push(id); if (stripeError) throw stripeError; return structuredClone(defaultCustomer); },
    },
    checkout: { sessions: {
      create: async (...args) => { calls.sessionsCreate.push(args); if (stripeError) throw stripeError; return { ...structuredClone(defaultSession), metadata: structuredClone(args[0].metadata) }; },
      retrieve: async id => { calls.sessionsRetrieve.push(id); if (stripeError) throw stripeError; return structuredClone(defaultSession); },
    } },
  };
  return { admin, calls, state, stripe, writes };
}

const run = (source, billingInterval = 'monthly') => createCheckout({
  admin: source.admin, identity: { uid: 'owner-a' }, stripe: source.stripe,
  priceIds: PRICE_IDS, appUrl: 'https://servicesos.netlify.app', body: { billingInterval },
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
  assert.deepEqual(params.line_items, [{ price: MONTHLY_PRICE_ID, quantity: 1 }]);
  assert.equal(params.customer, 'cus_owner');
  assert.equal(params.subscription_data.trial_period_days, undefined);
  assert.equal(params.subscription_data.metadata.billingPurpose, BILLING_PURPOSE);
  assert.equal(params.metadata.priceId, MONTHLY_PRICE_ID);
  assert.equal(params.metadata.billingInterval, 'monthly');
  assert.deepEqual(params.subscription_data.metadata, { tenantId: 'tenant-a', billingPurpose: BILLING_PURPOSE,
    onboardingSchemaVersion: '1', priceId: MONTHLY_PRICE_ID, billingInterval: 'monthly' });
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
    tenant: { stripeCustomerId: 'cus_owner', ownerSubscriptionCheckout: { sessionId: 'cs_old', customerId: 'cus_owner', priceId: MONTHLY_PRICE_ID, status: 'open', attempt: 2 } },
    session: { id: 'cs_owner', url: 'https://checkout.stripe.com/c/pay/new', status: 'expired', customer: 'cus_owner', metadata: { tenantId: 'tenant-a', billingPurpose: BILLING_PURPOSE, onboardingSchemaVersion: '1', priceId: MONTHLY_PRICE_ID } },
  });
  source.stripe.checkout.sessions.create = async (...args) => {
    source.calls.sessionsCreate.push(args);
    return { ...source.stripeSession, id: 'cs_new', url: 'https://checkout.stripe.com/c/pay/new', status: 'open', customer: 'cus_owner', metadata: args[0].metadata };
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
  for (const body of [{}, { billingInterval: 'weekly' }, { billingInterval: 'monthly', priceId: 'price_other' },
    { billingInterval: 'monthly', amount: 1 }, { billingInterval: 'monthly', tenantId: 'tenant-b' },
    { billingInterval: 'annual', customerId: 'cus_other' }, { billingInterval: 'monthly', quantity: 9 }]) {
    const source = fixture();
    await assert.rejects(createCheckout({ admin: source.admin, identity: { uid: 'owner-a' }, stripe: source.stripe, priceIds: PRICE_IDS, appUrl: 'https://servicesos.netlify.app', body }), error => error.code === 'invalid_request');
  }
});

test('missing or unsafe server configuration fails before Stripe use', async () => {
  for (const config of [
    { priceIds: { monthlyPriceId: '', annualPriceId: ANNUAL_PRICE_ID }, appUrl: 'https://servicesos.netlify.app' },
    { priceIds: { monthlyPriceId: 'not-a-price', annualPriceId: ANNUAL_PRICE_ID }, appUrl: 'https://servicesos.netlify.app' },
    { priceIds: { monthlyPriceId: MONTHLY_PRICE_ID, annualPriceId: MONTHLY_PRICE_ID }, appUrl: 'https://servicesos.netlify.app' },
    { priceIds: PRICE_IDS, appUrl: 'http://servicesos.netlify.app' },
  ]) {
    const source = fixture();
    await assert.rejects(createCheckout({ admin: source.admin, identity: { uid: 'owner-a' }, stripe: source.stripe, body: { billingInterval: 'monthly' }, ...config }), error => error.status === 503);
    assert.equal(source.calls.customersCreate.length, 0);
  }
});

test('annual selection uses only the configured annual Price and quantity one', async () => {
  const source = fixture();
  await run(source, 'annual');
  const [params, options] = source.calls.sessionsCreate[0];
  assert.deepEqual(params.line_items, [{ price: ANNUAL_PRICE_ID, quantity: 1 }]);
  assert.equal(params.metadata.priceId, ANNUAL_PRICE_ID);
  assert.equal(params.metadata.billingInterval, 'annual');
  assert.equal(params.subscription_data.metadata.priceId, ANNUAL_PRICE_ID);
  assert.equal(options.idempotencyKey, 'servicesos-owner-checkout-tenant-a-annual-1');
  assert.equal(params.subscription_data.trial_period_days, undefined);
  assert.equal(params.transfer_data, undefined);
  assert.equal(params.application_fee_amount, undefined);
});

test('open Checkout reuse respects interval and preserves legacy monthly reuse', async () => {
  const monthly = fixture({ tenant: { stripeCustomerId: 'cus_owner', ownerSubscriptionCheckout: {
    sessionId: 'cs_month', customerId: 'cus_owner', priceId: MONTHLY_PRICE_ID, billingInterval: 'monthly', attempt: 1,
  } } });
  await run(monthly, 'monthly');
  assert.equal(monthly.calls.sessionsCreate.length, 0);

  const annualSession = { id: 'cs_annual', url: 'https://checkout.stripe.com/c/pay/annual', status: 'open', customer: 'cus_owner',
    metadata: { tenantId: 'tenant-a', billingPurpose: BILLING_PURPOSE, onboardingSchemaVersion: '1', priceId: ANNUAL_PRICE_ID, billingInterval: 'annual' } };
  const annualPrior = fixture({ tenant: { stripeCustomerId: 'cus_owner', ownerSubscriptionCheckout: {
    sessionId: 'cs_annual', customerId: 'cus_owner', priceId: ANNUAL_PRICE_ID, billingInterval: 'annual', attempt: 1,
  } }, session: annualSession });
  await run(annualPrior, 'monthly');
  assert.equal(annualPrior.calls.sessionsRetrieve.length, 0);
  assert.equal(annualPrior.calls.sessionsCreate.length, 1);
  assert.deepEqual(annualPrior.calls.sessionsCreate[0][0].line_items, [{ price: MONTHLY_PRICE_ID, quantity: 1 }]);

  const legacyMonthly = fixture({ tenant: { stripeCustomerId: 'cus_owner', ownerSubscriptionCheckout: {
    sessionId: 'cs_legacy', customerId: 'cus_owner', priceId: MONTHLY_PRICE_ID, attempt: 1,
  } } });
  await run(legacyMonthly, 'monthly');
  assert.equal(legacyMonthly.calls.sessionsCreate.length, 0);
});

test('handler requires auth, controls methods, and projects Stripe failures safely', async () => {
  const invoke = async ({ method = 'POST', token, source = fixture() } = {}) => {
    const res = { statusCode: 0, body: null, headers: {}, set(k, v) { this.headers[k] = v; return this; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, send(body) { this.body = body; return this; } };
    await createOwnerOnboardingBillingGatewayHandler({ admin: source.admin, getStripe: () => source.stripe, getPriceIds: () => PRICE_IDS, getAppUrl: () => 'https://servicesos.netlify.app' })({ method, headers: token ? { authorization: `Bearer ${token}` } : {}, body: { billingInterval: 'monthly' } }, res);
    return res;
  };
  assert.equal((await invoke()).statusCode, 401);
  assert.equal((await invoke({ token: 'invalid' })).statusCode, 401);
  assert.equal((await invoke({ method: 'GET', token: 'valid' })).statusCode, 405);
  const failure = await invoke({ token: 'valid', source: fixture({ stripeError: new Error('secret Stripe detail') }) });
  assert.equal(failure.statusCode, 503);
  assert.equal(JSON.stringify(failure.body).includes('secret Stripe detail'), false);
});
