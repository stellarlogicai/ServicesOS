const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  createEmployeeSessionGatewayHandler,
  resolveEmployeeSession,
  tenantMembershipIncludes,
} = require('../employeeSessionGateway');

function createAdmin({ profiles = {}, tenants = {}, tokenError = null, tokenUid = 'employee-a' } = {}) {
  const documents = {};
  for (const [uid, profile] of Object.entries(profiles)) documents[`users/${uid}`] = profile;
  for (const [tenantId, tenant] of Object.entries(tenants)) documents[`tenants/${tenantId}`] = tenant;

  return {
    auth: () => ({
      verifyIdToken: async () => {
        if (tokenError) throw tokenError;
        return { uid: tokenUid };
      },
    }),
    firestore: () => ({
      collection: (collectionName) => ({
        doc: (documentId) => ({
          get: async () => {
            const value = documents[`${collectionName}/${documentId}`];
            return {
              exists: value !== undefined,
              data: () => value,
            };
          },
        }),
      }),
    }),
  };
}

function activeEmployee(overrides = {}) {
  return {
    role: 'employee',
    status: 'active',
    tenantId: 'tenant-a',
    displayName: 'Employee A',
    email: 'employee-a@servicesos.test',
    permissions: ['should-not-leak'],
    ...overrides,
  };
}

function validAdmin(overrides = {}) {
  return createAdmin({
    profiles: { 'employee-a': activeEmployee() },
    tenants: {
      'tenant-a': {
        users: ['employee-a'],
        adminUsers: ['admin-a'],
        businessName: 'Private business data',
        subscription: { tier: 'private' },
      },
    },
    ...overrides,
  });
}

function responseRecorder() {
  return {
    headers: {},
    statusCode: null,
    body: null,
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
  };
}

async function callHandler({ admin = validAdmin(), headers = {}, method = 'POST', body = {} } = {}) {
  const response = responseRecorder();
  await createEmployeeSessionGatewayHandler({ admin })({ method, headers, body }, response);
  return response;
}

test('missing Authorization header is denied', async () => {
  const response = await callHandler();
  assert.equal(response.statusCode, 401);
  assert.equal(response.body.code, 'unauthenticated');
});

test('invalid Firebase token is denied', async () => {
  const response = await callHandler({
    admin: validAdmin({ tokenError: new Error('invalid token') }),
    headers: { authorization: 'Bearer invalid' },
  });
  assert.equal(response.statusCode, 401);
  assert.equal(response.body.code, 'unauthenticated');
});

test('missing canonical user profile is denied', async () => {
  await assert.rejects(
    resolveEmployeeSession({ admin: createAdmin({ tenants: { 'tenant-a': { users: ['employee-a'] } } }), uid: 'employee-a' }),
    (error) => error.code === 'forbidden'
  );
});

for (const role of ['customer', 'admin', 'super-admin']) {
  test(`${role} profile is denied`, async () => {
    const admin = createAdmin({
      profiles: { 'employee-a': activeEmployee({ role }) },
      tenants: { 'tenant-a': { users: ['employee-a'] } },
    });
    await assert.rejects(resolveEmployeeSession({ admin, uid: 'employee-a' }), (error) => error.code === 'forbidden');
  });
}

for (const status of ['inactive', 'suspended', 'disabled']) {
  test(`${status} employee is denied`, async () => {
    const admin = createAdmin({
      profiles: { 'employee-a': activeEmployee({ status }) },
      tenants: { 'tenant-a': { users: ['employee-a'] } },
    });
    await assert.rejects(resolveEmployeeSession({ admin, uid: 'employee-a' }), (error) => error.code === 'forbidden');
  });
}

test('missing tenantId is denied', async () => {
  const admin = createAdmin({ profiles: { 'employee-a': activeEmployee({ tenantId: '' }) } });
  await assert.rejects(resolveEmployeeSession({ admin, uid: 'employee-a' }), (error) => error.code === 'forbidden');
});

test('DEFAULT tenant is denied', async () => {
  const admin = createAdmin({
    profiles: { 'employee-a': activeEmployee({ tenantId: 'DEFAULT' }) },
    tenants: { DEFAULT: { users: ['employee-a'] } },
  });
  await assert.rejects(resolveEmployeeSession({ admin, uid: 'employee-a' }), (error) => error.code === 'forbidden');
});

test('missing tenant is denied', async () => {
  const admin = createAdmin({ profiles: { 'employee-a': activeEmployee() } });
  await assert.rejects(resolveEmployeeSession({ admin, uid: 'employee-a' }), (error) => error.code === 'forbidden');
});

test('employee absent from tenant users is denied', async () => {
  const admin = createAdmin({
    profiles: { 'employee-a': activeEmployee() },
    tenants: { 'tenant-a': { users: ['other-employee'] } },
  });
  await assert.rejects(resolveEmployeeSession({ admin, uid: 'employee-a' }), (error) => error.code === 'forbidden');
});

test('array tenant users membership is accepted', async () => {
  assert.equal(tenantMembershipIncludes(['employee-a'], 'employee-a'), true);
  const result = await resolveEmployeeSession({ admin: validAdmin(), uid: 'employee-a' });
  assert.equal(result.success, true);
});

test('map tenant users membership compatibility is accepted', async () => {
  assert.equal(tenantMembershipIncludes({ 'employee-a': true }, 'employee-a'), true);
  const admin = createAdmin({
    profiles: { 'employee-a': activeEmployee() },
    tenants: { 'tenant-a': { users: { 'employee-a': { active: true } } } },
  });
  const result = await resolveEmployeeSession({ admin, uid: 'employee-a' });
  assert.equal(result.success, true);
});

test('map membership does not accept an inherited UID property', () => {
  const membership = Object.create({ 'employee-a': true });
  assert.equal(tenantMembershipIncludes(membership, 'employee-a'), false);
});

test('valid employee response is an explicit minimal safe projection', async () => {
  const result = await resolveEmployeeSession({ admin: validAdmin(), uid: 'employee-a' });
  assert.deepEqual(result, {
    success: true,
    employee: {
      uid: 'employee-a',
      tenantId: 'tenant-a',
      role: 'employee',
      displayName: 'Employee A',
      email: 'employee-a@servicesos.test',
    },
  });
  assert.equal('users' in result.employee, false);
  assert.equal('adminUsers' in result.employee, false);
  assert.equal('businessName' in result.employee, false);
  assert.equal('subscription' in result.employee, false);
  assert.equal('permissions' in result.employee, false);
});

test('gateway rejects caller-supplied identity fields', async () => {
  const response = await callHandler({
    headers: { authorization: 'Bearer valid' },
    body: { tenantId: 'tenant-a', uid: 'employee-a', role: 'employee' },
  });
  assert.equal(response.statusCode, 400);
  assert.equal(response.body.code, 'invalid_request');
});

test('gateway supports POST and OPTIONS only with controlled CORS', async () => {
  const optionsResponse = await callHandler({
    method: 'OPTIONS',
    headers: { origin: 'http://127.0.0.1:5173' },
  });
  assert.equal(optionsResponse.statusCode, 204);
  assert.equal(optionsResponse.headers['Access-Control-Allow-Origin'], 'http://127.0.0.1:5173');
  assert.equal(optionsResponse.headers['Access-Control-Allow-Methods'], 'POST, OPTIONS');

  const getResponse = await callHandler({ method: 'GET' });
  assert.equal(getResponse.statusCode, 405);

  const disallowedResponse = await callHandler({
    method: 'OPTIONS',
    headers: { origin: 'https://untrusted.example' },
  });
  assert.equal(disallowedResponse.headers['Access-Control-Allow-Origin'], undefined);
});
