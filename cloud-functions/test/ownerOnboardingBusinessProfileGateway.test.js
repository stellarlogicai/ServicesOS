const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  createOwnerOnboardingBusinessProfileGatewayHandler,
  saveOwnerBusinessProfile,
  validateBusinessProfile,
} = require('../ownerOnboardingBusinessProfileGateway');

const validProfile = {
  businessName: ' Test Services ', businessEmail: ' OWNER@EXAMPLE.TEST ',
  businessPhone: ' 555-0100 ', businessAddress: ' 10 Main Street ', timezone: ' America/Chicago ',
};

function fixture({ user = {}, tenant = {}, tokenError = false } = {}) {
  const state = {
    'users/owner-a': { role: 'admin', status: 'active', tenantId: 'tenant-a', ...user },
    'tenants/tenant-a': {
      onboardingSchemaVersion: 1, onboardingOwnerUid: 'owner-a', onboardingState: 'business_profile_required',
      status: 'onboarding', adminUsers: ['owner-a'], users: ['owner-a'], settings: {}, ...tenant,
    },
  };
  const writes = [];
  const ref = path => ({ path, doc: id => ref(`${path}/${id}`) });
  const admin = {
    auth: () => ({ verifyIdToken: async () => {
      if (tokenError) throw new Error('invalid');
      return { uid: 'owner-a' };
    } }),
    firestore: () => ({
      collection: name => ref(name),
      runTransaction: async callback => callback({
        get: async documentRef => ({
          exists: state[documentRef.path] !== undefined,
          data: () => state[documentRef.path],
        }),
        update: (documentRef, patch) => {
          state[documentRef.path] = { ...state[documentRef.path], ...structuredClone(patch) };
          writes.push({ path: documentRef.path, patch });
        },
      }),
    }),
  };
  admin.firestore.FieldValue = { serverTimestamp: () => 'server-time' };
  return { admin, state, writes };
}

function responseRecorder() {
  return {
    headers: {}, statusCode: null, body: null,
    set(key, value) { this.headers[key] = value; return this; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
    send(value) { this.body = value; return this; },
  };
}

async function callHandler({ source = fixture(), body = validProfile, headers, method = 'POST' } = {}) {
  const response = responseRecorder();
  await createOwnerOnboardingBusinessProfileGatewayHandler({ admin: source.admin })({
    method, body, headers: headers || { authorization: 'Bearer valid' },
  }, response);
  return response;
}

test('valid profile persists canonical fields and transitions only to agreement_required', async () => {
  const source = fixture({ tenant: { businessSettings: { availability: { availableDays: ['monday'] } } } });
  const result = await saveOwnerBusinessProfile({ admin: source.admin, identity: { uid: 'owner-a' }, profileData: validProfile });
  const tenant = source.state['tenants/tenant-a'];
  assert.equal(tenant.businessName, 'Test Services');
  assert.equal(tenant.businessEmail, 'owner@example.test');
  assert.equal(tenant.businessPhone, '555-0100');
  assert.equal(tenant.businessAddress, '10 Main Street');
  assert.equal(tenant.businessSettings.timeZone, 'America/Chicago');
  assert.deepEqual(tenant.businessSettings.availability, { availableDays: ['monday'] });
  assert.equal(tenant.onboardingState, 'agreement_required');
  assert.equal(tenant.status, 'onboarding');
  assert.equal(result.onboarding.businessProfileComplete, true);
  assert.equal(result.onboarding.timeZone, 'America/Chicago');
});

test('validation requires bounded canonical fields and a valid IANA timezone', () => {
  for (const [field, value] of [
    ['businessName', ''], ['businessEmail', 'invalid'], ['businessPhone', ''],
    ['businessAddress', ''], ['timezone', 'Central-ish'], ['businessName', 'x'.repeat(161)],
  ]) {
    assert.throws(() => validateBusinessProfile({ ...validProfile, [field]: value }), error => {
      assert.equal(error.code, 'validation_failed');
      assert.ok(error.fields[field]);
      return true;
    });
  }
});

test('identity, tenant, membership, status, and lifecycle fields cannot be injected', async () => {
  for (const field of ['uid', 'tenantId', 'role', 'adminUsers', 'users', 'status', 'onboardingState']) {
    const response = await callHandler({ body: { ...validProfile, [field]: 'active' } });
    assert.equal(response.statusCode, 400, field);
    assert.equal(response.body.code, 'invalid_request', field);
  }
});

test('invalid profile makes no write or lifecycle transition', async () => {
  const source = fixture();
  const response = await callHandler({ source, body: { ...validProfile, businessAddress: '' } });
  assert.equal(response.statusCode, 422);
  assert.equal(source.writes.length, 0);
  assert.equal(source.state['tenants/tenant-a'].onboardingState, 'business_profile_required');
});

test('agreement_required retry returns canonical state without rewriting data', async () => {
  const source = fixture({ tenant: {
    onboardingState: 'agreement_required', businessName: 'Saved', businessEmail: 'saved@example.test',
    businessPhone: '555-0199', businessAddress: '20 Saved Street', businessSettings: { timeZone: 'UTC' },
  } });
  const result = await saveOwnerBusinessProfile({ admin: source.admin, identity: { uid: 'owner-a' }, profileData: validProfile });
  assert.equal(result.onboarding.businessName, 'Saved');
  assert.equal(result.onboarding.onboardingState, 'agreement_required');
  assert.equal(source.writes.length, 0);
});

test('employee, wrong owner, missing admin membership, and legacy tenant are rejected', async () => {
  const cases = [
    fixture({ user: { role: 'employee' } }),
    fixture({ tenant: { onboardingOwnerUid: 'owner-b' } }),
    fixture({ tenant: { adminUsers: ['owner-b'] } }),
    fixture({ tenant: { onboardingSchemaVersion: undefined, onboardingOwnerUid: undefined, onboardingState: undefined } }),
  ];
  for (const source of cases) {
    await assert.rejects(
      saveOwnerBusinessProfile({ admin: source.admin, identity: { uid: 'owner-a' }, profileData: validProfile }),
      error => error.code === 'onboarding_conflict'
    );
    assert.equal(source.writes.length, 0);
  }
});

test('billing and active lifecycle states cannot be rewritten or moved backward', async () => {
  for (const state of ['billing_required', 'active']) {
    const source = fixture({ tenant: { onboardingState: state } });
    await assert.rejects(
      saveOwnerBusinessProfile({ admin: source.admin, identity: { uid: 'owner-a' }, profileData: validProfile }),
      error => error.code === 'onboarding_conflict'
    );
    assert.equal(source.state['tenants/tenant-a'].onboardingState, state);
    assert.equal(source.writes.length, 0);
  }
});

test('handler denies missing/invalid auth and returns safe validation fields', async () => {
  assert.equal((await callHandler({ headers: {} })).statusCode, 401);
  assert.equal((await callHandler({ source: fixture({ tokenError: true }) })).statusCode, 401);
  const response = await callHandler({ body: { ...validProfile, timezone: 'invalid' } });
  assert.equal(response.statusCode, 422);
  assert.deepEqual(response.body.fields, { timezone: 'invalid' });
});
