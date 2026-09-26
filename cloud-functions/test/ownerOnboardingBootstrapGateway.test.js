const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  INITIAL_ONBOARDING_STATE,
  OWNER_ONBOARDING_SCHEMA_VERSION,
  bootstrapOwnerOnboarding,
  createOwnerOnboardingBootstrapGatewayHandler,
} = require('../ownerOnboardingBootstrapGateway');

function createAdmin({ documents = {}, token = {}, tokenError = null } = {}) {
  const state = structuredClone(documents);
  const writes = [];
  let generatedTenantCount = 0;
  let transactionQueue = Promise.resolve();

  function ref(path) {
    return {
      path,
      id: path.split('/').at(-1),
      collection(name) { return ref(`${path}/${name}`); },
      doc(id) {
        if (id === undefined) {
          generatedTenantCount += 1;
          return ref(`${path}/generated-${generatedTenantCount}`);
        }
        return ref(`${path}/${id}`);
      },
      limit() { return this; },
      async get() {
        if (Object.hasOwn(state, path)) {
          const value = state[path];
          return { exists: true, id: path.split('/').pop(), data: () => value };
        }
        const prefix = `${path}/`;
        return {
          exists: false,
          data: () => undefined,
          docs: Object.entries(state).filter(([key]) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/')).map(([key, value]) => ({ id: key.slice(prefix.length), data: () => value })),
        };
      },
    };
  }

  const db = {
    collection(name) { return ref(name); },
    runTransaction(callback) {
      const execute = async () => callback({
        async get(documentRef) {
          const value = state[documentRef.path];
          return { exists: value !== undefined, id: documentRef.id, data: () => value };
        },
        create(documentRef, value) {
          if (state[documentRef.path] !== undefined) throw new Error('already exists');
          state[documentRef.path] = structuredClone(value);
          writes.push({ type: 'create', path: documentRef.path, value });
        },
        set(documentRef, value, options) {
          state[documentRef.path] = options?.merge
            ? { ...(state[documentRef.path] || {}), ...structuredClone(value) }
            : structuredClone(value);
          writes.push({ type: 'set', path: documentRef.path, value, options });
        },
        update(documentRef, value) {
          if (state[documentRef.path] === undefined) throw new Error('missing document');
          state[documentRef.path] = { ...state[documentRef.path], ...structuredClone(value) };
          writes.push({ type: 'update', path: documentRef.path, value });
        },
      });
      const result = transactionQueue.then(execute, execute);
      transactionQueue = result.then(() => undefined, () => undefined);
      return result;
    },
  };

  const admin = {
    auth: () => ({
      verifyIdToken: async () => {
        if (tokenError) throw tokenError;
        return { uid: 'owner-a', email: 'owner@example.test', name: 'Owner A', ...token };
      },
    }),
    firestore: () => db,
  };
  admin.firestore.FieldValue = { serverTimestamp: () => 'server-time' };
  return { admin, state, writes, get generatedTenantCount() { return generatedTenantCount; } };
}

function responseRecorder() {
  return {
    headers: {}, statusCode: null, body: null,
    set(name, value) { this.headers[name] = value; return this; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
    send(value) { this.body = value; return this; },
  };
}

async function callHandler({ fixture = createAdmin(), getStripe, method = 'POST', headers, body = {} } = {}) {
  const response = responseRecorder();
  await createOwnerOnboardingBootstrapGatewayHandler({ admin: fixture.admin, getStripe })({
    method,
    headers: headers || { authorization: 'Bearer valid' },
    body,
  }, response);
  return response;
}

function managedTenant(overrides = {}) {
  return {
    onboardingSchemaVersion: OWNER_ONBOARDING_SCHEMA_VERSION,
    onboardingOwnerUid: 'owner-a',
    onboardingState: INITIAL_ONBOARDING_STATE,
    status: 'onboarding',
    adminUsers: ['owner-a'],
    users: ['owner-a'],
    ...overrides,
  };
}

function ownerProfile(overrides = {}) {
  return { role: 'admin', status: 'active', tenantId: 'tenant-a', ...overrides };
}

function operationalDocuments(tenant = {}) {
  return {
    'users/owner-a': ownerProfile(),
    'tenants/tenant-a': managedTenant({
      onboardingState: 'operational_setup_required',
      status: 'active',
      subscriptionStatus: 'active',
      workforceMode: 'owner_only',
      businessSettings: { availability: { availableDays: ['monday'] } },
      ...tenant,
    }),
    'tenants/tenant-a/serviceCatalog/service-a': {
      name: 'Standard', serviceType: 'standard', active: true, priceCents: 100, durationMinutes: 60,
    },
  };
}

test('missing and invalid authentication are denied', async () => {
  assert.equal((await callHandler({ headers: {} })).statusCode, 401);
  const fixture = createAdmin({ tokenError: new Error('invalid') });
  assert.equal((await callHandler({ fixture })).statusCode, 401);
});

test('gateway accepts only POST and controlled OPTIONS', async () => {
  assert.equal((await callHandler({ method: 'GET' })).statusCode, 405);
  const response = await callHandler({ method: 'OPTIONS', headers: { origin: 'http://127.0.0.1:5173' } });
  assert.equal(response.statusCode, 204);
  assert.equal(response.headers['Access-Control-Allow-Origin'], 'http://127.0.0.1:5173');
  assert.equal(response.headers['Access-Control-Allow-Methods'], 'POST, OPTIONS');
});

test('caller-supplied identity, membership, tenant, role, and state are rejected', async () => {
  for (const field of ['uid', 'tenantId', 'role', 'adminUsers', 'status', 'onboardingState', 'accountId', 'chargesEnabled', 'payoutsEnabled', 'stripeConnectComplete']) {
    const response = await callHandler({ body: { [field]: 'attacker-controlled' } });
    assert.equal(response.statusCode, 400, field);
    assert.equal(response.body.code, 'invalid_request', field);
  }
});

test('authenticated user with no profile gets one canonical tenant and admin profile', async () => {
  const fixture = createAdmin();
  const result = await bootstrapOwnerOnboarding({
    admin: fixture.admin,
    identity: { uid: 'owner-a', email: ' owner@example.test ', name: ' Owner A ' },
  });
  assert.equal(result.onboarding.tenantId, 'generated-1');
  assert.equal(result.onboarding.onboardingState, 'business_profile_required');
  assert.equal(result.onboarding.billingEntitlement, 'inactive');
  assert.deepEqual(result.onboarding.operationalProgress, {
    completedSteps: [], nextStep: 'business_profile', operationalComplete: false,
  });
  assert.deepEqual(fixture.state['users/owner-a'], {
    role: 'admin', status: 'active', tenantId: 'generated-1',
    createdAt: 'server-time', updatedAt: 'server-time',
    email: 'owner@example.test', displayName: 'Owner A',
  });
  assert.deepEqual(fixture.state['tenants/generated-1'].adminUsers, ['owner-a']);
  assert.deepEqual(fixture.state['tenants/generated-1'].users, ['owner-a']);
});

test('new tenant uses canonical schema without fake business or legacy alternate fields', async () => {
  const fixture = createAdmin();
  await bootstrapOwnerOnboarding({ admin: fixture.admin, identity: { uid: 'owner-a' } });
  const tenant = fixture.state['tenants/generated-1'];
  assert.equal(tenant.status, 'onboarding');
  assert.equal(tenant.onboardingState, 'business_profile_required');
  assert.equal(tenant.onboardingSchemaVersion, 1);
  assert.equal(tenant.onboardingOwnerUid, 'owner-a');
  for (const field of ['businessName', 'businessEmail', 'businessPhone', 'businessAddress', 'name', 'contactEmail', 'plan']) {
    assert.equal(field in tenant, false, field);
  }
});

test('retry resumes the same tenant without creating another committed tenant', async () => {
  const fixture = createAdmin();
  const first = await bootstrapOwnerOnboarding({ admin: fixture.admin, identity: { uid: 'owner-a' } });
  const second = await bootstrapOwnerOnboarding({ admin: fixture.admin, identity: { uid: 'owner-a' } });
  assert.equal(second.onboarding.tenantId, first.onboarding.tenantId);
  assert.equal(Object.keys(fixture.state).filter(path => path.startsWith('tenants/')).length, 1);
});

test('concurrent bootstrap calls serialize on the user identity and commit one tenant', async () => {
  const fixture = createAdmin();
  const [first, second] = await Promise.all([
    bootstrapOwnerOnboarding({ admin: fixture.admin, identity: { uid: 'owner-a' } }),
    bootstrapOwnerOnboarding({ admin: fixture.admin, identity: { uid: 'owner-a' } }),
  ]);
  assert.equal(first.onboarding.tenantId, second.onboarding.tenantId);
  assert.equal(Object.keys(fixture.state).filter(path => path.startsWith('tenants/')).length, 1);
});

test('valid existing managed tenant is resumed without advancing state', async () => {
  const fixture = createAdmin({ documents: {
    'users/owner-a': ownerProfile(),
    'tenants/tenant-a': managedTenant({ onboardingState: 'agreement_required' }),
  } });
  const result = await bootstrapOwnerOnboarding({ admin: fixture.admin, identity: { uid: 'owner-a' } });
  assert.equal(result.onboarding.tenantId, 'tenant-a');
  assert.equal(result.onboarding.onboardingState, 'agreement_required');
  assert.equal(fixture.generatedTenantCount, 1);
  assert.equal(fixture.writes.length, 0);
});

test('paid operationally incomplete tenant resumes at services and pricing', async () => {
  const fixture = createAdmin({ documents: {
    'users/owner-a': ownerProfile(),
    'tenants/tenant-a': managedTenant({
      status: 'active', onboardingState: 'operational_setup_required', subscriptionStatus: 'active', currentPeriodEnd: 9999999999,
    }),
  } });
  const result = await bootstrapOwnerOnboarding({ admin: fixture.admin, identity: { uid: 'owner-a' } });
  assert.equal(result.onboarding.billingEntitlement, 'active');
  assert.deepEqual(result.onboarding.operationalProgress, {
    completedSteps: ['business_profile', 'saas_agreement', 'subscription_billing'],
    nextStep: 'services_pricing',
    operationalComplete: false,
  });
  assert.equal(fixture.writes.length, 0);
});

test('expired paid period and cure do not appear as active billing entitlement', async () => {
  for (const billing of [
    { subscriptionStatus: 'active', currentPeriodEnd: 1 },
    { subscriptionStatus: 'past_due', currentPeriodEnd: 9999999999, paymentFailureAt: 100, cureDeadline: 100 + 7 * 86400 },
  ]) {
    const fixture = createAdmin({ documents: {
      'users/owner-a': ownerProfile(),
      'tenants/tenant-a': managedTenant({ status: 'active', onboardingState: 'operational_setup_required', ...billing }),
    } });
    const result = await bootstrapOwnerOnboarding({ admin: fixture.admin, identity: { uid: 'owner-a' } });
    assert.equal(result.onboarding.billingEntitlement, 'inactive');
  }
});

test('operational progress treats absent branding as a valid default and advances to team setup', async () => {
  const fixture = createAdmin({ documents: {
    'users/owner-a': ownerProfile(),
    'tenants/tenant-a': managedTenant({
      onboardingState: 'operational_setup_required', status: 'active', subscriptionStatus: 'active',
      businessSettings: { availability: { availableDays: ['monday'] } },
    }),
    'tenants/tenant-a/serviceCatalog/service-a': {
      name: 'Standard clean', serviceType: 'standard', active: true, priceCents: 15000, durationMinutes: 120,
    },
  } });
  const result = await bootstrapOwnerOnboarding({ admin: fixture.admin, identity: { uid: 'owner-a' } });
  assert.equal(result.onboarding.servicesPricingComplete, true);
  assert.equal(result.onboarding.availabilityComplete, true);
  assert.equal(result.onboarding.brandingComplete, true);
  assert.deepEqual(result.onboarding.operationalProgress, {
    completedSteps: ['business_profile', 'saas_agreement', 'subscription_billing', 'services_pricing', 'availability', 'branding'],
    nextStep: 'team_setup', operationalComplete: false,
  });
});

test('malformed custom branding blocks progression only at the branding stage', async () => {
  const fixture = createAdmin({ documents: {
    'users/owner-a': ownerProfile(),
    'tenants/tenant-a': managedTenant({
      onboardingState: 'operational_setup_required',
      businessSettings: { availability: { availableDays: ['monday'] } },
    }),
    'tenants/tenant-a/serviceCatalog/standard': {
      name: 'Standard clean', serviceType: 'standard', active: true, priceCents: 15000, durationMinutes: 120,
    },
    'tenants/tenant-a/branding/config': { mode: 'custom', colors: { primary: 'not-a-color' } },
  } });
  const result = await bootstrapOwnerOnboarding({ admin: fixture.admin, identity: { uid: 'owner-a' } });
  assert.equal(result.onboarding.brandingComplete, false);
  assert.deepEqual(result.onboarding.operationalProgress, {
    completedSteps: ['business_profile', 'saas_agreement', 'subscription_billing', 'services_pricing', 'availability'],
    nextStep: 'branding', operationalComplete: false,
  });
});

test('legacy pricing profile alone cannot complete the schema-managed services stage', async () => {
  const fixture = createAdmin({ documents: {
    'users/owner-a': ownerProfile(),
    'tenants/tenant-a': managedTenant({ onboardingState: 'operational_setup_required', pricingProfileId: 'aunt-bs-cleaning-services' }),
  } });
  const result = await bootstrapOwnerOnboarding({ admin: fixture.admin, identity: { uid: 'owner-a' } });
  assert.equal(result.onboarding.servicesPricingComplete, false);
  assert.equal(result.onboarding.operationalProgress.nextStep, 'services_pricing');
});

test('existing managed active tenant remains operationally complete', async () => {
  const fixture = createAdmin({ documents: {
    'users/owner-a': ownerProfile(),
    'tenants/tenant-a': managedTenant({
      status: 'active', onboardingState: 'active', subscriptionStatus: 'active',
    }),
  } });
  const result = await bootstrapOwnerOnboarding({ admin: fixture.admin, identity: { uid: 'owner-a' } });
  assert.equal(result.onboarding.operationalProgress.operationalComplete, true);
  assert.equal(result.onboarding.operationalProgress.nextStep, null);
});

test('valid missing admin and general membership is repaired without changing lifecycle', async () => {
  const fixture = createAdmin({ documents: {
    'users/owner-a': ownerProfile(),
    'tenants/tenant-a': managedTenant({ adminUsers: ['admin-b'], users: ['admin-b'] }),
  } });
  const result = await bootstrapOwnerOnboarding({ admin: fixture.admin, identity: { uid: 'owner-a' } });
  assert.equal(result.onboarding.onboardingState, 'business_profile_required');
  assert.deepEqual(fixture.state['tenants/tenant-a'].adminUsers, ['admin-b', 'owner-a']);
  assert.deepEqual(fixture.state['tenants/tenant-a'].users, ['admin-b', 'owner-a']);
});

test('map membership compatibility is preserved during repair', async () => {
  const fixture = createAdmin({ documents: {
    'users/owner-a': ownerProfile(),
    'tenants/tenant-a': managedTenant({ adminUsers: { 'admin-b': true }, users: { 'admin-b': true } }),
  } });
  await bootstrapOwnerOnboarding({ admin: fixture.admin, identity: { uid: 'owner-a' } });
  assert.equal(fixture.state['tenants/tenant-a'].adminUsers['owner-a'], true);
  assert.equal(fixture.state['tenants/tenant-a'].users['owner-a'], true);
});

test('legacy tenant without lifecycle marker remains legacy and is not reinterpreted', async () => {
  const fixture = createAdmin({ documents: {
    'users/owner-a': ownerProfile(),
    'tenants/tenant-a': { status: 'active', businessName: 'Existing Business', adminUsers: ['owner-a'], users: ['owner-a'] },
  } });
  const result = await bootstrapOwnerOnboarding({ admin: fixture.admin, identity: { uid: 'owner-a' } });
  assert.equal(result.onboarding.lifecycleManaged, false);
  assert.equal(result.onboarding.onboardingState, null);
  assert.equal('onboardingState' in fixture.state['tenants/tenant-a'], false);
  assert.equal(fixture.writes.length, 0);
});

test('missing referenced tenant fails closed and creates no replacement', async () => {
  const fixture = createAdmin({ documents: { 'users/owner-a': ownerProfile() } });
  await assert.rejects(
    bootstrapOwnerOnboarding({ admin: fixture.admin, identity: { uid: 'owner-a' } }),
    error => error.code === 'onboarding_conflict'
  );
  assert.equal(Object.keys(fixture.state).filter(path => path.startsWith('tenants/')).length, 0);
});

test('DEFAULT and unsupported existing roles fail closed', async () => {
  for (const profile of [ownerProfile({ tenantId: 'DEFAULT' }), ownerProfile({ role: 'customer' })]) {
    const fixture = createAdmin({ documents: {
      'users/owner-a': profile,
      'tenants/tenant-a': managedTenant(),
    } });
    await assert.rejects(
      bootstrapOwnerOnboarding({ admin: fixture.admin, identity: { uid: 'owner-a' } }),
      error => error.code === 'onboarding_conflict'
    );
  }
});

test('conflicting managed owner, lifecycle version, and lifecycle state fail closed', async () => {
  const conflicts = [
    managedTenant({ onboardingOwnerUid: 'other-owner' }),
    managedTenant({ onboardingSchemaVersion: 2 }),
    managedTenant({ onboardingState: 'client_selected_active_state' }),
  ];
  for (const tenant of conflicts) {
    const fixture = createAdmin({ documents: { 'users/owner-a': ownerProfile(), 'tenants/tenant-a': tenant } });
    await assert.rejects(
      bootstrapOwnerOnboarding({ admin: fixture.admin, identity: { uid: 'owner-a' } }),
      error => error.code === 'onboarding_conflict'
    );
  }
});

test('malformed existing membership state fails closed instead of being replaced', async () => {
  for (const tenant of [
    managedTenant({ adminUsers: 'owner-a' }),
    managedTenant({ users: 1 }),
  ]) {
    const fixture = createAdmin({ documents: { 'users/owner-a': ownerProfile(), 'tenants/tenant-a': tenant } });
    await assert.rejects(
      bootstrapOwnerOnboarding({ admin: fixture.admin, identity: { uid: 'owner-a' } }),
      error => error.code === 'onboarding_conflict'
    );
    assert.equal(fixture.writes.length, 0);
  }
});

test('owner-only workforce mode completes team setup without creating an employee', async () => {
  const fixture = createAdmin({ documents: {
    'users/owner-a': ownerProfile(),
    'tenants/tenant-a': managedTenant({ onboardingState: 'operational_setup_required', workforceMode: 'owner_only', status: 'active', subscriptionStatus: 'active', businessSettings: { availability: { availableDays: ['monday'] } } }),
    'tenants/tenant-a/serviceCatalog/service-a': { name: 'Standard', serviceType: 'standard', active: true, priceCents: 100, durationMinutes: 60 },
  } });
  const result = await bootstrapOwnerOnboarding({ admin: fixture.admin, identity: { uid: 'owner-a' } });
  assert.equal(result.onboarding.teamSetupComplete, true);
  assert.equal(result.onboarding.operationalProgress.nextStep, 'stripe_connect');
  assert.equal(Object.keys(fixture.state).some(path => path.includes('/employees/')), false);
});

test('employees workforce mode requires a canonical delivered employee', async () => {
  const fixture = createAdmin({ documents: {
    'users/owner-a': ownerProfile(),
    'tenants/tenant-a': managedTenant({ onboardingState: 'operational_setup_required', workforceMode: 'employees', status: 'active', subscriptionStatus: 'active', users: ['owner-a', 'employee-a'], businessSettings: { availableDays: ['monday'], availability: { availableDays: ['monday'] } } }),
    'tenants/tenant-a/serviceCatalog/service-a': { name: 'Standard', serviceType: 'standard', active: true, priceCents: 100, durationMinutes: 60 },
    'tenants/tenant-a/employees/employee-a': { authUid: 'employee-a', email: 'employee@example.test', activationStatus: 'email_sent' },
    'users/employee-a': { tenantId: 'tenant-a', role: 'employee', status: 'active', email: 'employee@example.test' },
  } });
  const result = await bootstrapOwnerOnboarding({ admin: fixture.admin, identity: { uid: 'owner-a' } });
  assert.equal(result.onboarding.teamSetupComplete, true);
  assert.equal(result.onboarding.operationalProgress.nextStep, 'stripe_connect');
});

test('Stripe Connect remains incomplete without a canonical account', async () => {
  const fixture = createAdmin({ documents: operationalDocuments() });
  const result = await bootstrapOwnerOnboarding({ admin: fixture.admin, identity: { uid: 'owner-a' } });
  assert.equal(result.onboarding.stripeConnectComplete, false);
  assert.equal(result.onboarding.stripeConnectStatus, 'not_connected');
  assert.equal(result.onboarding.operationalProgress.nextStep, 'stripe_connect');
});

test('fresh canonical Stripe readiness alone advances to final acceptance', async () => {
  for (const [name, account, expectedReady] of [
    ['details only', { details_submitted: true, charges_enabled: false, payouts_enabled: false, requirements: {} }, false],
    ['charges disabled', { charges_enabled: false, payouts_enabled: true, requirements: {} }, false],
    ['payouts disabled', { charges_enabled: true, payouts_enabled: false, requirements: {} }, false],
    ['currently due', { charges_enabled: true, payouts_enabled: true, requirements: { currently_due: ['business_profile.url'] } }, false],
    ['past due', { charges_enabled: true, payouts_enabled: true, requirements: { past_due: ['external_account'] } }, false],
    ['ready', { charges_enabled: true, payouts_enabled: true, requirements: { currently_due: [], past_due: [] } }, true],
  ]) {
    const fixture = createAdmin({ documents: operationalDocuments({
      stripeAccountId: 'acct_canonical', stripeAccountStatus: 'active', chargesEnabled: true, payoutsEnabled: true,
    }) });
    const getStripe = () => ({ accounts: { retrieve: async id => ({ id, ...account }) } });
    const result = await bootstrapOwnerOnboarding({ admin: fixture.admin, getStripe, identity: { uid: 'owner-a' } });
    assert.equal(result.onboarding.stripeConnectComplete, expectedReady, name);
    assert.equal(result.onboarding.stripeConnectStatus, expectedReady ? 'ready' : 'incomplete', name);
    assert.equal(result.onboarding.operationalProgress.nextStep, expectedReady ? 'final_acceptance' : 'stripe_connect', name);
    assert.equal(result.onboarding.operationalProgress.operationalComplete, false, name);
  }
});

test('fresh Stripe failure or account mismatch cannot advance stale ready-like tenant state', async () => {
  for (const retrieve of [
    async () => { throw new Error('provider unavailable'); },
    async () => ({ id: 'acct_other', charges_enabled: true, payouts_enabled: true, requirements: {} }),
  ]) {
    const fixture = createAdmin({ documents: operationalDocuments({
      stripeAccountId: 'acct_canonical', stripeAccountStatus: 'active', chargesEnabled: true, payoutsEnabled: true,
    }) });
    const result = await bootstrapOwnerOnboarding({
      admin: fixture.admin,
      getStripe: () => ({ accounts: { retrieve } }),
      identity: { uid: 'owner-a' },
    });
    assert.equal(result.onboarding.stripeConnectComplete, false);
    assert.equal(result.onboarding.stripeConnectStatus, 'unavailable');
    assert.equal(result.onboarding.operationalProgress.nextStep, 'stripe_connect');
  }
});

test('pending, failed, mismatched, and unset workforce modes do not complete team setup', async () => {
  for (const [mode, activationStatus, email] of [['employees', 'pending', 'employee@example.test'], ['employees', 'delivery_failed', 'employee@example.test'], ['employees', 'email_sent', 'other@example.test'], [undefined, 'email_sent', 'employee@example.test']]) {
    const fixture = createAdmin({ documents: {
      'users/owner-a': ownerProfile(),
      'tenants/tenant-a': managedTenant({ onboardingState: 'operational_setup_required', ...(mode ? { workforceMode: mode } : {}), status: 'active', subscriptionStatus: 'active', users: ['owner-a', 'employee-a'], businessSettings: { availability: { availableDays: ['monday'] } } }),
      'tenants/tenant-a/serviceCatalog/service-a': { name: 'Standard', serviceType: 'standard', active: true, priceCents: 100, durationMinutes: 60 },
      'tenants/tenant-a/employees/employee-a': { authUid: 'employee-a', email, activationStatus },
      'users/employee-a': { tenantId: 'tenant-a', role: 'employee', status: 'active', email: 'employee@example.test' },
    } });
    const result = await bootstrapOwnerOnboarding({ admin: fixture.admin, identity: { uid: 'owner-a' } });
    assert.equal(result.onboarding.teamSetupComplete, false, mode || 'unset');
    assert.equal(result.onboarding.operationalProgress.nextStep, 'team_setup', mode || 'unset');
  }
});

test('safe response allowlists onboarding and known business identity only', async () => {
  const fixture = createAdmin({ documents: {
    'users/owner-a': ownerProfile(),
    'tenants/tenant-a': managedTenant({
      businessName: 'Business A', businessEmail: 'business@example.test', businessPhone: '555-0100',
      businessAddress: '100 Test Street', businessSettings: { timeZone: 'America/Chicago' },
      stripeSecret: 'must-not-leak', subscription: { private: true },
      settings: { private: true }, employees: ['private'],
    }),
  } });
  const result = await bootstrapOwnerOnboarding({ admin: fixture.admin, identity: { uid: 'owner-a' } });
  assert.deepEqual(Object.keys(result.onboarding).sort(), [
    'billingEntitlement',
    'businessAddress', 'businessEmail', 'businessName', 'businessPhone',
    'availabilityComplete', 'brandingComplete', 'businessProfileComplete', 'lifecycleManaged', 'onboardingState', 'operationalProgress', 'servicesPricingComplete', 'stripeConnectComplete', 'stripeConnectStatus', 'teamSetupComplete',
    'tenantId', 'timeZone',
  ].sort());
  assert.equal(JSON.stringify(result).includes('must-not-leak'), false);
  assert.equal(result.onboarding.businessProfileComplete, true);
});

test('handler serializes conflicts safely without tenant details', async () => {
  const fixture = createAdmin({ documents: {
    'users/owner-a': ownerProfile(),
    'tenants/tenant-a': managedTenant({ onboardingOwnerUid: 'other-owner' }),
  } });
  const response = await callHandler({ fixture });
  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.body, {
    error: 'Owner onboarding could not be resumed.',
    code: 'onboarding_conflict',
  });
});
