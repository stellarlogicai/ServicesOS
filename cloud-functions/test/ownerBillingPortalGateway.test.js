const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createOwnerBillingPortal, createOwnerBillingPortalGatewayHandler } = require('../ownerBillingPortalGateway');

const metadata = { tenantId: 'tenant-a', billingPurpose: 'servicesos_owner_subscription', onboardingSchemaVersion: '1' };
const configId = 'bpc_testconfiguration';
const customerId = 'cus_canonical';
const returnUrl = 'https://servicesos.netlify.app/?servicesos_owner_billing=returned';

function fixture({ profile = {}, tenant = {}, customer = {}, configuration = {}, session = {}, tokenInvalid = false } = {}) {
  const state = {
    'users/owner-a': { role: 'admin', status: 'active', tenantId: 'tenant-a', ...profile },
    'tenants/tenant-a': { onboardingSchemaVersion: 1, status: 'active', adminUsers: ['owner-a'],
      stripeCustomerId: customerId, stripeSubscriptionId: 'sub_canonical', ...tenant },
  };
  const calls = { customers: [], configurations: [], sessions: [], writes: [] };
  const ref = path => ({ get: async () => ({ exists: state[path] !== undefined, data: () => structuredClone(state[path]) }),
    doc: id => ref(`${path}/${id}`) });
  const admin = {
    auth: () => ({ verifyIdToken: async value => {
      if (tokenInvalid || value === 'bad') throw new Error('invalid');
      return { uid: 'owner-a' };
    } }),
    firestore: () => ({ collection: name => ref(name) }),
  };
  const stripe = {
    customers: { retrieve: async id => { calls.customers.push(id); return { id: customerId, metadata, ...customer }; } },
    billingPortal: {
      configurations: { retrieve: async id => { calls.configurations.push(id); return {
        id: configId, active: true, application: null,
        features: { payment_method_update: { enabled: true }, invoice_history: { enabled: true },
          subscription_cancel: { enabled: true, mode: 'at_period_end' }, subscription_update: { enabled: false },
          subscription_pause: { enabled: false }, customer_update: { enabled: false } }, ...configuration,
      }; } },
      sessions: { create: async params => { calls.sessions.push(params); return {
        customer: customerId, configuration: configId, return_url: params.return_url,
        url: 'https://billing.stripe.com/p/session/test_fixture', ...session,
      }; } },
    },
  };
  return { admin, stripe, calls, state };
}

const run = (source, overrides = {}) => createOwnerBillingPortal({ admin: source.admin, stripe: source.stripe,
  identity: { uid: 'owner-a' }, configurationId: configId, appUrl: 'https://servicesos.netlify.app', body: {}, ...overrides });

test('canonical monthly or annual tenant opens only the approved portal for its verified customer', async () => {
  for (const price of ['price_monthly', 'price_annual']) {
    const source = fixture({ tenant: { subscriptionPriceId: price } });
    assert.deepEqual(await run(source), { success: true, portalUrl: 'https://billing.stripe.com/p/session/test_fixture' });
    assert.deepEqual(source.calls.customers, [customerId]);
    assert.deepEqual(source.calls.configurations, [configId]);
    assert.deepEqual(source.calls.sessions, [{ customer: customerId, configuration: configId, return_url: returnUrl }]);
    assert.deepEqual(source.calls.writes, []);
    assert.equal(source.state['tenants/tenant-a'].cancelAtPeriodEnd, undefined);
  }
});

test('identity, tenant authority, and canonical subscription are required before Stripe access', async () => {
  for (const profile of [{ role: 'employee' }, { role: 'customer' }, { role: 'super-admin' },
    { role: 'admin', status: 'inactive' }, { role: 'admin', tenantId: 'tenant-b' }]) {
    const source = fixture({ profile });
    await assert.rejects(run(source), error => error.code === 'portal_unavailable');
    assert.equal(source.calls.customers.length, 0);
  }
  for (const tenant of [{ adminUsers: [] }, { status: 'onboarding' }, { stripeCustomerId: null },
    { stripeSubscriptionId: null }, { onboardingSchemaVersion: 0 }]) {
    const source = fixture({ tenant });
    await assert.rejects(run(source), error => error.code === 'portal_unavailable');
    assert.equal(source.calls.customers.length, 0);
  }
});

test('Customer ID and server-authored metadata must agree exactly', async () => {
  for (const customer of [{ deleted: true }, { id: 'cus_other' },
    { metadata: { ...metadata, tenantId: 'tenant-b' } }, { metadata: { ...metadata, billingPurpose: 'other' } },
    { metadata: { ...metadata, onboardingSchemaVersion: '2' } }]) {
    const source = fixture({ customer });
    await assert.rejects(run(source), error => error.code === 'portal_unavailable');
    assert.equal(source.calls.sessions.length, 0);
  }
});

test('request cannot select tenant, Customer, Price, configuration, return URL, or portal behavior', async () => {
  for (const field of ['tenantId', 'customer', 'subscription', 'priceId', 'configuration', 'returnUrl', 'cancellationMode', 'features']) {
    const source = fixture();
    await assert.rejects(run(source, { body: { [field]: 'arbitrary' } }), error => error.code === 'invalid_request');
    assert.equal(source.calls.customers.length, 0);
  }
});

test('configuration must be canonical, active, and limited to payment methods, invoices, and period-end cancellation', async () => {
  const source = fixture();
  await assert.rejects(run(source, { configurationId: '' }), error => error.code === 'portal_unavailable');
  await assert.rejects(run(source, { configurationId: 'bpc_invalid-characters' }), error => error.code === 'portal_unavailable');
  for (const configuration of [{ id: 'bpc_other' }, { active: false }, { application: 'ca_other' },
    { features: { payment_method_update: { enabled: false } } },
    { features: { payment_method_update: { enabled: true }, invoice_history: { enabled: false } } },
    { features: { payment_method_update: { enabled: true }, invoice_history: { enabled: true },
      subscription_cancel: { enabled: true, mode: 'immediately' }, subscription_update: { enabled: false } } },
    { features: { payment_method_update: { enabled: true }, invoice_history: { enabled: true },
      subscription_cancel: { enabled: true, mode: 'at_period_end' }, subscription_update: { enabled: true } } },
    { features: { payment_method_update: { enabled: true }, invoice_history: { enabled: true },
      subscription_cancel: { enabled: true, mode: 'at_period_end' }, subscription_update: { enabled: false },
      subscription_pause: { enabled: true } } }]) {
    const invalid = fixture({ configuration });
    await assert.rejects(run(invalid), error => error.code === 'portal_unavailable');
    assert.equal(invalid.calls.sessions.length, 0);
  }
});

test('return URL follows trusted server app origin and session response is allowlisted', async () => {
  const local = fixture({ session: { privateField: 'not for browser' } });
  assert.deepEqual(await run(local, { appUrl: 'http://127.0.0.1:5174', }),
    { success: true, portalUrl: 'https://billing.stripe.com/p/session/test_fixture' });
  assert.equal(local.calls.sessions[0].return_url, 'http://127.0.0.1:5174/?servicesos_owner_billing=returned');
  for (const session of [{ url: 'https://evil.example/portal' }, { customer: 'cus_other' }, { configuration: 'bpc_other' }]) {
    const invalid = fixture({ session });
    await assert.rejects(run(invalid), error => error.code === 'portal_unavailable');
  }
});

test('handler rejects unauthenticated requests and normalizes Stripe failures', async () => {
  const source = fixture();
  const handler = createOwnerBillingPortalGatewayHandler({ admin: source.admin, getStripe: () => source.stripe,
    getConfigurationId: () => configId, getAppUrl: () => 'https://servicesos.netlify.app' });
  const invoke = async authorization => {
    const res = { statusCode: 0, body: null, set() { return this; }, status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; } };
    await handler({ method: 'POST', headers: authorization ? { authorization } : {}, body: {} }, res);
    return res;
  };
  assert.equal((await invoke()).statusCode, 401);
  assert.equal((await invoke('Bearer bad')).statusCode, 401);
  source.stripe.customers.retrieve = async () => { throw new Error('private Stripe detail'); };
  const failed = await invoke('Bearer valid');
  assert.equal(failed.statusCode, 503);
  assert.doesNotMatch(JSON.stringify(failed.body), /private Stripe detail/);
});
