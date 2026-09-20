const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createConnectedAccountHandler,
  generateOnboardingLinkHandler,
  getConnectedAccountStatusHandler,
  projectConnectAccount,
  trustedConnectUrls,
} = require('../connectStripe');

const DELETE_FIELD = Symbol('delete-field');

class MockDocRef {
  constructor(path, store) {
    this.path = path;
    this.store = store;
  }

  async get() {
    const data = this.store[this.path];
    return {
      exists: data !== undefined,
      data: () => data,
      ref: this,
    };
  }

  async update(patch) {
    const next = {
      ...(this.store[this.path] || {}),
    };
    for (const [key, value] of Object.entries(patch)) {
      if (value === DELETE_FIELD) {
        delete next[key];
      } else {
        next[key] = value;
      }
    }
    this.store[this.path] = {
      ...next,
    };
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
  let transactionQueue = Promise.resolve();
  const firestore = {
    collection: name => new MockCollectionRef(name, store),
    runTransaction(callback) {
      const execute = () => callback({
        get: ref => ref.get(),
        update: (ref, patch) => ref.update(patch),
      });
      const result = transactionQueue.then(execute, execute);
      transactionQueue = result.then(() => undefined, () => undefined);
      return result;
    },
  };
  return {
    auth: () => ({
      verifyIdToken: async () => ({ uid: 'admin-1' }),
    }),
    firestore: () => firestore,
  };
}

function createAdminWithFieldValue(store) {
  const admin = createMockAdmin(store);
  admin.firestore.FieldValue = {
    delete: () => DELETE_FIELD,
    serverTimestamp: () => 'mock-server-time',
  };
  return admin;
}

function createResponseMock() {
  return {
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
}

function baseStore(overrides = {}) {
  return {
    'users/admin-1': {
      role: 'admin',
      tenantId: 'tenant-a',
      status: 'active',
    },
    'tenants/tenant-a': {
      stripeAccountId: 'acct_test_123',
      users: ['admin-1'],
      adminUsers: ['admin-1'],
    },
    ...overrides,
  };
}

function createStripeMock() {
  return {
    accounts: {
      create: async () => ({ id: 'acct_test_created', status: 'pending' }),
      retrieve: async () => ({
        id: 'acct_test_123',
        details_submitted: true,
        charges_enabled: true,
        payouts_enabled: false,
        requirements: { currently_due: [] },
      }),
    },
    accountLinks: {
      create: async () => ({
        url: 'https://connect.stripe.test/onboarding',
        expires_at: 123456,
      }),
    },
  };
}

function createStripeAccountLinkErrorMock() {
  const error = new Error('You cannot create an account link for this account.');
  error.type = 'StripeInvalidRequestError';
  error.statusCode = 400;
  error.requestId = 'req_account_link';

  return {
    accountLinks: {
      create: async () => { throw error; },
    },
  };
}

function createStripeConnectNotEnabledMock() {
  const error = new Error("You can only create new accounts if you've signed up for Connect, which you can do at https://dashboard.stripe.com/connect.");
  error.type = 'StripeInvalidRequestError';
  error.statusCode = 400;
  error.requestId = 'req_test_connect';

  return {
    accounts: {
      create: async () => { throw error; },
    },
  };
}

function createStripeInvalidRequestSetupMock() {
  const error = new Error('Connect account creation is not available for this account context.');
  error.type = 'StripeInvalidRequestError';
  error.statusCode = 400;
  error.requestId = 'req_invalid_request_setup';

  return {
    accounts: {
      create: async () => { throw error; },
    },
  };
}

function createStripePlatformRequiredStatusMock() {
  const error = new Error('Only Stripe Connect platforms can work with other accounts.');
  error.type = 'StripePermissionError';
  error.code = 'platform_account_required';
  error.statusCode = 403;
  error.requestId = 'req_status_platform';

  return {
    accounts: {
      retrieve: async () => { throw error; },
    },
  };
}

const handlerCases = [
  ['createConnectedAccount', createConnectedAccountHandler, 'POST, OPTIONS', 'POST'],
  ['generateOnboardingLink', generateOnboardingLinkHandler, 'POST, OPTIONS', 'POST'],
  ['getConnectedAccountStatus', getConnectedAccountStatusHandler, 'GET, OPTIONS', 'GET'],
];

for (const [name, createHandler, methods] of handlerCases) {
  test(`${name} OPTIONS returns CORS headers for ServicesOS origin`, async () => {
    const handler = createHandler({
      admin: createAdminWithFieldValue(baseStore()),
      appUrl: 'https://servicesos.netlify.app',
      stripe: createStripeMock(),
    });
    const res = createResponseMock();

    await handler({
      headers: { origin: 'https://servicesos.netlify.app' },
      method: 'OPTIONS',
    }, res);

    assert.equal(res.statusCode, 204);
    assert.equal(res.headers['Access-Control-Allow-Origin'], 'https://servicesos.netlify.app');
    assert.equal(res.headers['Access-Control-Allow-Methods'], methods);
    assert.equal(res.headers['Access-Control-Allow-Headers'], 'Content-Type, Authorization');
  });

  test(`${name} OPTIONS allows local Vite 5174 origin`, async () => {
    const handler = createHandler({
      admin: createAdminWithFieldValue(baseStore()),
      appUrl: 'https://servicesos.netlify.app',
      stripe: createStripeMock(),
    });
    const res = createResponseMock();

    await handler({
      headers: { origin: 'http://127.0.0.1:5174' },
      method: 'OPTIONS',
    }, res);

    assert.equal(res.statusCode, 204);
    assert.equal(res.headers['Access-Control-Allow-Origin'], 'http://127.0.0.1:5174');
  });

  test(`${name} OPTIONS does not reflect disallowed origins`, async () => {
    const handler = createHandler({
      admin: createAdminWithFieldValue(baseStore()),
      appUrl: 'https://servicesos.netlify.app',
      stripe: createStripeMock(),
    });
    const res = createResponseMock();

    await handler({
      headers: { origin: 'https://evil.example' },
      method: 'OPTIONS',
    }, res);

    assert.equal(res.statusCode, 204);
    assert.equal(res.headers['Access-Control-Allow-Origin'], undefined);
    assert.equal(res.headers['Access-Control-Allow-Headers'], 'Content-Type, Authorization');
  });
}

test('createConnectedAccount POST still requires Firebase ID token auth', async () => {
  const handler = createConnectedAccountHandler({
    admin: createAdminWithFieldValue(baseStore()),
    stripe: createStripeMock(),
  });
  const res = createResponseMock();

  await handler({
    body: { tenantId: 'tenant-a', businessEmail: 'owner@example.com' },
    headers: { origin: 'http://127.0.0.1:5174' },
    method: 'POST',
  }, res);

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'Authentication required');
  assert.equal(res.headers['Access-Control-Allow-Origin'], 'http://127.0.0.1:5174');
});

test('createConnectedAccount creates a fresh account with a stable idempotency key', async () => {
  const store = baseStore({
    'tenants/tenant-a': {
      stripeAccountStatus: 'active',
      stripeAccountMode: 'test',
      stripeAccountUpdatedAt: 'old-time',
      chargesEnabled: true,
      payoutsEnabled: true,
      users: ['admin-1'],
      adminUsers: ['admin-1'],
    },
  });
  let createOptions;
  const stripe = createStripeMock();
  stripe.accounts.create = async (_params, options) => {
    createOptions = options;
    return { id: 'acct_test_created', status: 'pending' };
  };
  const handler = createConnectedAccountHandler({
    admin: createAdminWithFieldValue(store),
    secretKey: 'sk_test_1234',
    stripe,
  });
  const res = createResponseMock();

  await handler({
    body: {
      tenantId: 'tenant-a',
      businessEmail: 'owner@example.com',
      businessName: 'Aunt B Cleaning',
    },
    headers: {
      authorization: 'Bearer id-token',
      origin: 'http://127.0.0.1:5174',
    },
    method: 'POST',
  }, res);

  assert.equal(res.body.accountId, 'acct_test_created');
  assert.equal(store['tenants/tenant-a'].stripeAccountId, 'acct_test_created');
  assert.equal(store['tenants/tenant-a'].stripeAccountStatus, 'pending');
  assert.equal(store['tenants/tenant-a'].stripeAccountMode, 'test');
  assert.equal(store['tenants/tenant-a'].chargesEnabled, false);
  assert.equal(store['tenants/tenant-a'].payoutsEnabled, false);
  assert.equal(store['tenants/tenant-a'].stripeAccountUpdatedAt, undefined);
  assert.match(createOptions.idempotencyKey, /^servicesos-connect-account-v1-[a-f0-9]{64}$/);
  assert.equal(res.body.reused, false);
});

test('repeated and concurrent account creation reuse one canonical account', async () => {
  const store = baseStore({ 'tenants/tenant-a': { users: ['admin-1'], adminUsers: ['admin-1'] } });
  let createCalls = 0;
  const stripe = createStripeMock();
  stripe.accounts.create = async () => { createCalls += 1; return { id: 'acct_test_created' }; };
  stripe.accounts.retrieve = async id => ({ id, charges_enabled: false, payouts_enabled: false, requirements: {} });
  const handler = createConnectedAccountHandler({ admin: createAdminWithFieldValue(store), secretKey: 'sk_test_1234', stripe });
  const request = () => ({ body: { tenantId: 'tenant-a', businessEmail: 'owner@example.com' }, headers: { authorization: 'Bearer id-token' }, method: 'POST' });
  const first = createResponseMock();
  const second = createResponseMock();
  await Promise.all([handler(request(), first), handler(request(), second)]);
  assert.equal(store['tenants/tenant-a'].stripeAccountId, 'acct_test_created');
  assert.equal(first.statusCode, undefined);
  assert.equal(second.statusCode, undefined);
  const third = createResponseMock();
  await handler(request(), third);
  assert.equal(third.body.accountId, 'acct_test_created');
  assert.equal(third.body.reused, true);
  assert.equal(createCalls, 2);
  assert.equal(new Set([first.body.accountId, second.body.accountId, third.body.accountId]).size, 1);
});

test('concurrent canonical pointer conflict is reported without overwrite', async () => {
  const store = baseStore({ 'tenants/tenant-a': { users: ['admin-1'], adminUsers: ['admin-1'] } });
  const stripe = createStripeMock();
  stripe.accounts.create = async () => {
    store['tenants/tenant-a'].stripeAccountId = 'acct_concurrent_winner';
    return { id: 'acct_late_result' };
  };
  const handler = createConnectedAccountHandler({ admin: createAdminWithFieldValue(store), stripe });
  const res = createResponseMock();
  await handler({ body: { tenantId: 'tenant-a', businessEmail: 'owner@example.com' }, headers: { authorization: 'Bearer id-token' }, method: 'POST' }, res);
  assert.equal(res.statusCode, 409);
  assert.equal(store['tenants/tenant-a'].stripeAccountId, 'acct_concurrent_winner');
});

test('client cannot supply connected account authority', async () => {
  const stripe = createStripeMock();
  let createCalls = 0;
  stripe.accounts.create = async () => { createCalls += 1; };
  const handler = createConnectedAccountHandler({ admin: createAdminWithFieldValue(baseStore()), stripe });
  const res = createResponseMock();
  await handler({ body: { tenantId: 'tenant-a', businessEmail: 'owner@example.com', accountId: 'acct_attacker' }, headers: { authorization: 'Bearer id-token' }, method: 'POST' }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(createCalls, 0);
});

test('wrong tenant and unauthorized roles cannot create or retrieve Connect accounts', async () => {
  for (const [role, tenantId] of [['customer', 'tenant-a'], ['admin', 'tenant-b']]) {
    const store = baseStore();
    store['users/admin-1'] = { ...store['users/admin-1'], role };
    let providerCalls = 0;
    const stripe = createStripeMock();
    stripe.accounts.create = async () => { providerCalls += 1; };
    stripe.accounts.retrieve = async () => { providerCalls += 1; };
    const handler = createConnectedAccountHandler({ admin: createAdminWithFieldValue(store), stripe });
    const res = createResponseMock();
    await handler({ body: { tenantId, businessEmail: 'owner@example.com' }, headers: { authorization: 'Bearer id-token' }, method: 'POST' }, res);
    assert.equal(res.statusCode, 403);
    assert.equal(providerCalls, 0);
  }
});

test('createConnectedAccount returns clean actionable error when Stripe Connect is not enabled', async () => {
  const handler = createConnectedAccountHandler({
    admin: createAdminWithFieldValue(baseStore({ 'tenants/tenant-a': { users: ['admin-1'], adminUsers: ['admin-1'] } })),
    stripe: createStripeConnectNotEnabledMock(),
  });
  const res = createResponseMock();

  await handler({
    body: { tenantId: 'tenant-a', businessEmail: 'owner@example.com' },
    headers: {
      authorization: 'Bearer id-token',
      origin: 'http://127.0.0.1:5174',
    },
    method: 'POST',
  }, res);

  assert.equal(res.statusCode, 409);
  assert.equal(
    res.body.error,
    'Stripe Connect platform setup is not ready. Confirm you are using the sk_test key from the Stellar Logic AI onboarding sandbox with Connect enabled.'
  );
  assert.equal(res.body.error.includes('sk_test key'), true);
});

test('createConnectedAccount maps Stripe invalid request setup failures to clean 409', async () => {
  const handler = createConnectedAccountHandler({
    admin: createAdminWithFieldValue(baseStore({ 'tenants/tenant-a': { users: ['admin-1'], adminUsers: ['admin-1'] } })),
    stripe: createStripeInvalidRequestSetupMock(),
  });
  const res = createResponseMock();

  await handler({
    body: { tenantId: 'tenant-a', businessEmail: 'owner@example.com' },
    headers: {
      authorization: 'Bearer id-token',
      origin: 'http://127.0.0.1:5174',
    },
    method: 'POST',
  }, res);

  assert.equal(res.statusCode, 409);
  assert.equal(
    res.body.error,
    'Stripe Connect platform setup is not ready. Confirm you are using the sk_test key from the Stellar Logic AI onboarding sandbox with Connect enabled.'
  );
});

test('generateOnboardingLink rejects invalid return or refresh URLs before calling Stripe', async () => {
  let called = false;
  const handler = generateOnboardingLinkHandler({
    admin: createAdminWithFieldValue(baseStore()),
    appUrl: 'not-a-url',
    stripe: {
      accountLinks: {
        create: async () => {
          called = true;
        },
      },
    },
  });
  const res = createResponseMock();

  await handler({
    body: { tenantId: 'tenant-a' },
    headers: {
      authorization: 'Bearer id-token',
      origin: 'http://127.0.0.1:5174',
    },
    method: 'POST',
  }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'Stripe onboarding needs valid return and refresh URLs. Check APP_URL or the local app URL and try again.');
  assert.equal(called, false);
});

test('onboarding link ignores no client redirects and uses fixed trusted application URLs', async () => {
  let linkRequest;
  const stripe = createStripeMock();
  stripe.accountLinks.create = async value => { linkRequest = value; return { url: 'https://connect.stripe.test/onboarding', expires_at: 123 }; };
  const handler = generateOnboardingLinkHandler({ admin: createAdminWithFieldValue(baseStore()), appUrl: 'https://servicesos.netlify.app/anything', stripe });
  const rejected = createResponseMock();
  await handler({ body: { tenantId: 'tenant-a', returnUrl: 'https://evil.example' }, headers: { authorization: 'Bearer id-token' }, method: 'POST' }, rejected);
  assert.equal(rejected.statusCode, 400);
  assert.equal(linkRequest, undefined);
  const accepted = createResponseMock();
  await handler({ body: { tenantId: 'tenant-a' }, headers: { authorization: 'Bearer id-token' }, method: 'POST' }, accepted);
  assert.equal(linkRequest.account, 'acct_test_123');
  assert.equal(linkRequest.return_url, 'https://servicesos.netlify.app/');
  assert.equal(linkRequest.refresh_url, 'https://servicesos.netlify.app/');
  assert.deepEqual(trustedConnectUrls('https://evil.example'), null);
  assert.deepEqual(trustedConnectUrls('http://evil.example'), null);
  assert.deepEqual(trustedConnectUrls('javascript:alert(1)'), null);
  assert.deepEqual(trustedConnectUrls('data:text/html,unsafe'), null);
  assert.deepEqual(trustedConnectUrls('http://127.0.0.1:5174/path'), {
    refreshUrl: 'http://127.0.0.1:5174/', returnUrl: 'http://127.0.0.1:5174/',
  });
});

test('unauthorized caller cannot receive an account-link capability', async () => {
  const store = baseStore();
  store['users/admin-1'].role = 'customer';
  let linkCalls = 0;
  const stripe = createStripeMock();
  stripe.accountLinks.create = async () => { linkCalls += 1; };
  const handler = generateOnboardingLinkHandler({ admin: createAdminWithFieldValue(store), appUrl: 'https://servicesos.netlify.app', stripe });
  const res = createResponseMock();
  await handler({ body: { tenantId: 'tenant-a' }, headers: { authorization: 'Bearer id-token' }, method: 'POST' }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(linkCalls, 0);
});

test('fresh readiness requires charges, payouts, and no blocking requirements', () => {
  const base = { id: 'acct_test', details_submitted: true, charges_enabled: true, payouts_enabled: true, requirements: { currently_due: [], past_due: [] } };
  assert.equal(projectConnectAccount(base).ready, true);
  for (const account of [
    { ...base, details_submitted: false, charges_enabled: false },
    { ...base, payouts_enabled: false },
    { ...base, requirements: { currently_due: ['business_profile.url'], past_due: [] } },
    { ...base, requirements: { currently_due: [], past_due: ['external_account'] } },
  ]) assert.equal(projectConnectAccount(account).ready, false);
});

test('generateOnboardingLink maps Stripe account-link setup failures to clean 409', async () => {
  const handler = generateOnboardingLinkHandler({
    admin: createAdminWithFieldValue(baseStore()),
    appUrl: 'https://servicesos.netlify.app',
    stripe: createStripeAccountLinkErrorMock(),
  });
  const res = createResponseMock();

  await handler({
    body: { tenantId: 'tenant-a' },
    headers: {
      authorization: 'Bearer id-token',
      origin: 'http://127.0.0.1:5174',
    },
    method: 'POST',
  }, res);

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.error, 'Stripe onboarding link could not be created for this connected account. Confirm the account belongs to this Stripe platform sandbox and supports hosted onboarding.');
  assert.equal(res.body.error.includes('sk_'), false);
});

test('getConnectedAccountStatus GET still requires Firebase ID token auth', async () => {
  const handler = getConnectedAccountStatusHandler({
    admin: createAdminWithFieldValue(baseStore()),
    stripe: createStripeMock(),
  });
  const res = createResponseMock();

  await handler({
    headers: { origin: 'https://servicesos.netlify.app' },
    method: 'GET',
    query: { tenantId: 'tenant-a' },
  }, res);

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'Authentication required');
  assert.equal(res.headers['Access-Control-Allow-Origin'], 'https://servicesos.netlify.app');
});

test('getConnectedAccountStatus returns clean error when configured key cannot access connected account', async () => {
  const handler = getConnectedAccountStatusHandler({
    admin: createAdminWithFieldValue(baseStore()),
    stripe: createStripePlatformRequiredStatusMock(),
  });
  const res = createResponseMock();

  await handler({
    headers: {
      authorization: 'Bearer id-token',
      origin: 'http://127.0.0.1:5174',
    },
    method: 'GET',
    query: { tenantId: 'tenant-a' },
  }, res);

  assert.equal(res.statusCode, 409);
  assert.equal(
    res.body.error,
    'Stripe connected account is not accessible from the configured Stripe test key. Create a new connected account under the currently configured Stripe platform sandbox.'
  );
  assert.equal(res.body.error.includes('sk_'), false);
});

test('getConnectedAccountStatus refreshes Stripe-confirmed tenant readiness fields', async () => {
  const store = baseStore({ 'tenants/tenant-a': { stripeAccountId: 'acct_test_123', users: ['admin-1'], adminUsers: ['admin-1'], stripeAccountStatus: 'active', chargesEnabled: true, payoutsEnabled: true } });
  const handler = getConnectedAccountStatusHandler({
    admin: createAdminWithFieldValue(store),
    stripe: createStripeMock(),
  });
  const res = createResponseMock();

  await handler({
    headers: {
      authorization: 'Bearer id-token',
      origin: 'http://127.0.0.1:5174',
    },
    method: 'GET',
    query: { tenantId: 'tenant-a' },
  }, res);

  assert.equal(res.statusCode, undefined);
  assert.equal(res.body.connected, true);
  assert.equal(res.body.chargesEnabled, true);
  assert.equal(store['tenants/tenant-a'].stripeAccountStatus, 'pending');
  assert.equal(store['tenants/tenant-a'].chargesEnabled, true);
  assert.equal(store['tenants/tenant-a'].payoutsEnabled, false);
  assert.equal(res.body.ready, false);
  assert.equal(store['tenants/tenant-a'].stripeAccountUpdatedAt, 'mock-server-time');
  assert.equal(JSON.stringify(res.body).includes('sk_test_'), false);
});

test('fresh Stripe retrieval failure cannot return stale ready state', async () => {
  const store = baseStore({ 'tenants/tenant-a': { stripeAccountId: 'acct_test_123', users: ['admin-1'], adminUsers: ['admin-1'], stripeAccountStatus: 'active', chargesEnabled: true, payoutsEnabled: true } });
  const stripe = createStripeMock();
  stripe.accounts.retrieve = async () => { throw new Error('provider unavailable'); };
  const handler = getConnectedAccountStatusHandler({ admin: createAdminWithFieldValue(store), stripe });
  const res = createResponseMock();
  await handler({ headers: { authorization: 'Bearer id-token' }, method: 'GET', query: { tenantId: 'tenant-a' } }, res);
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.ready, undefined);
});
