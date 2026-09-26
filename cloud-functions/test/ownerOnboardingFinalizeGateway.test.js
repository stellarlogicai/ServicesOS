const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  createOwnerOnboardingFinalizeGatewayHandler,
  finalizeOwnerOnboarding,
} = require('../ownerOnboardingFinalizeGateway');
const { bootstrapOwnerOnboarding } = require('../ownerOnboardingBootstrapGateway');
const { AGREEMENT_ID, AGREEMENT_TYPE, AGREEMENT_VERSION_DATE, CONTRACT_ID, termsHash, termsMarkdown } = require('../ownerSaasAgreement');

const PRICE_ID = 'price_servicesos100';
const ANNUAL_PRICE_ID = 'price_servicesos1000year';
const PRICE_IDS = { monthlyPriceId: PRICE_ID, annualPriceId: ANNUAL_PRICE_ID };
const NOW = Math.floor(Date.now() / 1000);

function fixture({ tenant = {}, profile = {}, service = {}, agreement = {}, branding = { mode: 'default' }, extraDocuments = {}, providerSubscription = null } = {}) {
  const state = {
    'users/owner-a': { role: 'admin', status: 'active', tenantId: 'tenant-a', email: 'owner@example.test', ...profile },
    'tenants/tenant-a': {
      onboardingSchemaVersion: 1, onboardingOwnerUid: 'owner-a', onboardingState: 'operational_setup_required',
      status: 'active', adminUsers: ['owner-a'], users: ['owner-a'], businessName: 'Example',
      businessEmail: 'owner@example.test', businessPhone: '555-0100', businessAddress: '1 Main St',
      businessSettings: { timeZone: 'America/Chicago', availability: { availableDays: ['monday'] } },
      workforceMode: 'owner_only', stripeCustomerId: 'cus_owner', stripeSubscriptionId: 'sub_owner',
      subscriptionPriceId: PRICE_ID, subscriptionStatus: 'active', currentPeriodEnd: NOW + 3600,
      latestInvoiceId: 'in_paid', stripeAccountId: 'acct_owner', ...tenant,
    },
    [`tenants/tenant-a/contracts/${CONTRACT_ID}`]: {
      agreementType: AGREEMENT_TYPE, agreementVersion: AGREEMENT_ID, agreementVersionDate: AGREEMENT_VERSION_DATE,
      tenantId: 'tenant-a', acceptedByUid: 'owner-a', acceptedByEmail: 'owner@example.test',
      affirmativeAcceptance: true, status: 'accepted', termsSnapshot: termsMarkdown, termsHash, termsFormat: 'markdown', ...agreement,
    },
    'tenants/tenant-a/serviceCatalog/service-a': {
      name: 'Standard clean', serviceType: 'standard', active: true, priceCents: 12000, durationMinutes: 90, ...service,
    },
    'tenants/tenant-a/branding/config': branding,
    ...extraDocuments,
  };
  const writes = [];
  const makeRef = path => ({
    path,
    collection: name => makeRef(`${path}/${name}`),
    doc: id => makeRef(`${path}/${id}`),
    limit: count => ({ queryPath: path, count }),
    get: async () => snap(path),
  });
  const snap = path => ({ exists: state[path] !== undefined, data: () => structuredClone(state[path]) });
  const db = {
    collection: name => makeRef(name),
    runTransaction: callback => callback({
      get: async ref => {
        if (ref.queryPath) {
          const prefix = `${ref.queryPath}/`;
          const docs = Object.entries(state).filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
            .slice(0, ref.count).map(([path, value]) => ({ id: path.slice(prefix.length), exists: true, data: () => structuredClone(value) }));
          return { docs };
        }
        return snap(ref.path);
      },
      update: (ref, patch) => {
        state[ref.path] = { ...state[ref.path], ...structuredClone(patch) };
        writes.push({ path: ref.path, patch: structuredClone(patch) });
      },
    }),
  };
  const admin = { firestore: () => db, auth: () => ({ verifyIdToken: async token => {
    if (token !== 'valid-token') throw new Error('invalid');
    return { uid: 'owner-a', email: 'owner@example.test' };
  } }) };
  admin.firestore.FieldValue = { serverTimestamp: () => 'server-time' };
  const subscription = providerSubscription || {
    id: 'sub_owner', status: 'active', customer: 'cus_owner', current_period_end: NOW + 3600,
    cancel_at_period_end: false, latest_invoice: { id: 'in_paid', status: 'paid' },
    metadata: { tenantId: 'tenant-a', billingPurpose: 'servicesos_owner_subscription', onboardingSchemaVersion: '1' },
    items: { data: [{ price: PRICE_ID, quantity: 1 }] },
  };
  const account = { id: 'acct_owner', charges_enabled: true, payouts_enabled: true,
    requirements: { currently_due: [], past_due: [] } };
  let providerCalls = 0;
  const stripe = {
    subscriptions: { retrieve: async (id, options) => { providerCalls += 1; assert.equal(id, 'sub_owner'); assert.deepEqual(options, { expand: ['latest_invoice'] }); return subscription; } },
    accounts: { retrieve: async id => { providerCalls += 1; assert.equal(id, 'acct_owner'); return account; } },
  };
  return { state, writes, admin, stripe, subscription, account, get providerCalls() { return providerCalls; } };
}

const finalize = source => finalizeOwnerOnboarding({ admin: source.admin, identity: { uid: 'owner-a' },
  getStripe: () => source.stripe, getPriceIds: () => PRICE_IDS });

test('explicit finalization revalidates and records the operational transition once', async () => {
  const source = fixture();
  assert.deepEqual(await finalize(source), { success: true, tenantId: 'tenant-a', completed: true, idempotent: false });
  const tenant = source.state['tenants/tenant-a'];
  assert.equal(tenant.onboardingState, 'active');
  assert.equal(tenant.operationalCompletedAt, 'server-time');
  assert.equal(tenant.operationalCompletedByUid, 'owner-a');
  assert.equal(tenant.subscriptionStatus, 'active');
  assert.equal(tenant.stripeAccountId, 'acct_owner');
  assert.equal(source.writes.length, 1);
  const resumed = await bootstrapOwnerOnboarding({ admin: source.admin, identity: { uid: 'owner-a' } });
  assert.equal(resumed.onboarding.onboardingState, 'active');
  assert.equal(resumed.onboarding.operationalProgress.operationalComplete, true);
  assert.deepEqual(await finalize(source), { success: true, completed: true, idempotent: true, tenantId: 'tenant-a' });
  assert.equal(source.writes.length, 1);
  assert.equal(source.providerCalls, 2);
});

test('all canonical prerequisites are rechecked and return their current blocking stage', async () => {
  const cases = [
    [{ businessSettings: { timeZone: 'UTC', availability: { availableDays: [] } } }, {}, {}, 'availability'],
    [{}, { active: false }, {}, 'services_pricing'],
    [{ workforceMode: 'employees' }, {}, {}, 'team_setup'],
    [{ stripeSubscriptionId: 'sub_other' }, {}, {}, 'subscription_billing'],
    [{ stripeAccountId: 'acct_other' }, {}, {}, 'stripe_connect'],
    [{}, {}, { termsHash: 'forged' }, 'saas_agreement'],
  ];
  for (const [tenant, service, agreement, expected] of cases) {
    const source = fixture({ tenant, service, agreement });
    const result = await finalize(source);
    assert.equal(result.completed, false, expected);
    assert.equal(result.blockingStage, expected, expected);
    assert.equal(source.state['tenants/tenant-a'].onboardingState, 'operational_setup_required');
    assert.equal(source.writes.length, 0);
  }
});

test('employee workforce requires qualifying canonical UID employee, not legacy random IDs', async () => {
  const valid = fixture({
    tenant: { workforceMode: 'employees', users: ['owner-a', 'employee-a'] },
    extraDocuments: {
      'tenants/tenant-a/employees/employee-a': { authUid: 'employee-a', email: 'worker@example.test', activationStatus: 'email_sent' },
      'users/employee-a': { role: 'employee', status: 'active', tenantId: 'tenant-a', email: 'worker@example.test' },
    },
  });
  assert.equal((await finalize(valid)).completed, true);

  const legacy = fixture({
    tenant: { workforceMode: 'employees', users: ['owner-a', 'employee-a'] },
    extraDocuments: {
      'tenants/tenant-a/employees/random-record': { authUid: 'employee-a', email: 'worker@example.test', activationStatus: 'email_sent' },
      'users/employee-a': { role: 'employee', status: 'active', tenantId: 'tenant-a', email: 'worker@example.test' },
    },
  });
  assert.equal((await finalize(legacy)).blockingStage, 'team_setup');
});

test('prerequisite changes before transaction commit are revalidated', async () => {
  const staleService = fixture();
  staleService.stripe.accounts.retrieve = async () => {
    staleService.state['tenants/tenant-a/serviceCatalog/service-a'].active = false;
    return staleService.account;
  };
  assert.equal((await finalize(staleService)).blockingStage, 'services_pricing');
  assert.equal(staleService.writes.length, 0);

  const staleBilling = fixture();
  staleBilling.stripe.accounts.retrieve = async () => {
    staleBilling.state['tenants/tenant-a'].subscriptionStatus = 'past_due';
    staleBilling.state['tenants/tenant-a'].paymentFailureAt = NOW;
    staleBilling.state['tenants/tenant-a'].cureDeadline = NOW + 10;
    return staleBilling.account;
  };
  assert.equal((await finalize(staleBilling)).blockingStage, 'subscription_billing');
  assert.equal(staleBilling.writes.length, 0);
});

test('billing requires fresh active provider facts and paid latest invoice', async () => {
  const cases = [
    [{ subscriptionStatus: 'past_due', paymentFailureAt: NOW, cureDeadline: NOW + 10 }, 'subscription_billing'],
    [{ subscriptionStatus: 'active', currentPeriodEnd: NOW + 3600, paymentFailureAt: NOW }, 'subscription_billing'],
  ];
  for (const [tenant, expected] of cases) {
    const source = fixture({ tenant });
    assert.equal((await finalize(source)).blockingStage, expected);
  }
  for (const mutate of [
    subscription => ({ ...subscription, status: 'past_due' }),
    subscription => ({ ...subscription, status: 'canceled' }),
    subscription => ({ ...subscription, customer: 'cus_other' }),
    subscription => ({ ...subscription, latest_invoice: { id: 'in_unpaid', status: 'open' } }),
    subscription => ({ ...subscription, items: { data: [{ price: 'price_other', quantity: 1 }] } }),
  ]) {
    const source = fixture();
    source.stripe.subscriptions.retrieve = async () => mutate(source.subscription);
    assert.equal((await finalize(source)).blockingStage, 'subscription_billing');
  }
  const unavailable = fixture();
  unavailable.stripe.subscriptions.retrieve = async () => { throw new Error('provider unavailable'); };
  assert.equal((await finalize(unavailable)).blockingStage, 'subscription_billing');
});

test('Connect readiness must be fresh and fully ready', async () => {
  for (const account of [
    { id: 'acct_other', charges_enabled: true, payouts_enabled: true, requirements: {} },
    { id: 'acct_owner', charges_enabled: false, payouts_enabled: true, requirements: {} },
    { id: 'acct_owner', charges_enabled: true, payouts_enabled: false, requirements: {} },
    { id: 'acct_owner', charges_enabled: true, payouts_enabled: true, requirements: { currently_due: ['person.id'] } },
    { id: 'acct_owner', charges_enabled: true, payouts_enabled: true, requirements: { past_due: ['person.id'] } },
  ]) {
    const source = fixture();
    source.stripe.accounts.retrieve = async () => account;
    assert.equal((await finalize(source)).blockingStage, 'stripe_connect');
    assert.equal(source.writes.length, 0);
  }
  const source = fixture();
  source.stripe.accounts.retrieve = async () => { throw new Error('provider unavailable'); };
  assert.equal((await finalize(source)).blockingStage, 'stripe_connect');
});

test('fresh annual canonical Price remains final-acceptance eligible', async () => {
  const source = fixture({
    tenant: { subscriptionPriceId: ANNUAL_PRICE_ID },
    providerSubscription: {
      id: 'sub_owner', status: 'active', customer: 'cus_owner', current_period_end: NOW + 366 * 86400,
      cancel_at_period_end: false, latest_invoice: { id: 'in_paid', status: 'paid' },
      metadata: { tenantId: 'tenant-a', billingPurpose: 'servicesos_owner_subscription', onboardingSchemaVersion: '1',
        priceId: ANNUAL_PRICE_ID, billingInterval: 'annual' },
      items: { data: [{ price: ANNUAL_PRICE_ID, quantity: 1 }] },
    },
  });
  assert.equal((await finalize(source)).completed, true);
  assert.equal(source.state['tenants/tenant-a'].subscriptionPriceId, ANNUAL_PRICE_ID);
});

test('authorization rejects non-owner and cross-tenant identity without Stripe calls', async () => {
  for (const [uid, changes] of [
    ['employee-a', {}], ['owner-a', { profile: { role: 'employee' } }],
    ['owner-a', { profile: { tenantId: 'tenant-b' } }], ['owner-a', { tenant: { onboardingOwnerUid: 'owner-b' } }],
    ['owner-a', { tenant: { adminUsers: [] } }],
  ]) {
    const source = fixture(changes);
    await assert.rejects(finalizeOwnerOnboarding({ admin: source.admin, identity: { uid }, getStripe: () => source.stripe, getPriceIds: () => PRICE_IDS }));
    assert.equal(source.providerCalls, 0);
    assert.equal(source.writes.length, 0);
  }
});

test('gateway requires authentication and rejects client authority fields', async () => {
  const source = fixture();
  const handler = createOwnerOnboardingFinalizeGatewayHandler({ admin: source.admin, getStripe: () => source.stripe, getPriceIds: () => PRICE_IDS });
  const invoke = async ({ token = '', body = {} } = {}) => {
    const response = { statusCode: 0, body: null, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; }, set() { return this; } };
    await handler({ method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {}, body }, response);
    return response;
  };
  assert.equal((await invoke()).statusCode, 401);
  assert.equal((await invoke({ token: 'valid-token', body: { tenantId: 'tenant-a' } })).statusCode, 400);
  assert.equal((await invoke({ token: 'valid-token' })).statusCode, 200);
});
