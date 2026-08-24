const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const {
  GrowthAIGatewayError,
  createGrowthAIGenerationHandler,
  generateGrowthAIContent,
  normalizeGenerationRequest,
} = require('../growthAIGateway');
const { GrowthAIProviderError } = require('../growthAIProvider');

function clone(value) {
  return value == null ? value : structuredClone(value);
}

class Snapshot {
  constructor(path, value) {
    this.id = path.split('/').at(-1);
    this._value = value;
    this.exists = value !== undefined;
  }

  data() {
    return clone(this._value);
  }
}

class Reference {
  constructor(db, path) {
    this.db = db;
    this.path = path;
    this.id = path.split('/').at(-1);
  }

  collection(name) {
    return new CollectionReference(this.db, `${this.path}/${name}`);
  }

  get() {
    return Promise.resolve(new Snapshot(this.path, this.db.documents.get(this.path)));
  }
}

class CollectionReference {
  constructor(db, path) {
    this.db = db;
    this.path = path;
  }

  doc(id) {
    return new Reference(this.db, `${this.path}/${id}`);
  }
}

class FakeFirestore {
  constructor(documents = {}) {
    this.documents = new Map(Object.entries(documents).map(([path, value]) => [path, clone(value)]));
    this._lock = Promise.resolve();
  }

  collection(name) {
    return new CollectionReference(this, name);
  }

  runTransaction(callback) {
    const run = this._lock.then(async () => {
      const writes = [];
      const transaction = {
        get: async reference => new Snapshot(reference.path, this.documents.get(reference.path)),
        set: (reference, value) => writes.push({ type: 'set', path: reference.path, value: clone(value) }),
        create: (reference, value) => writes.push({ type: 'create', path: reference.path, value: clone(value) }),
        update: (reference, value) => writes.push({ type: 'update', path: reference.path, value: clone(value) }),
      };
      const result = await callback(transaction);
      for (const write of writes) {
        const current = this.documents.get(write.path);
        if (write.type === 'create' && current !== undefined) throw new Error(`already exists: ${write.path}`);
        if (write.type === 'update' && current === undefined) throw new Error(`missing: ${write.path}`);
        this.documents.set(write.path, write.type === 'update' ? { ...current, ...write.value } : write.value);
      }
      return result;
    });
    this._lock = run.catch(() => {});
    return run;
  }
}

function fakeAdmin(documents) {
  const db = new FakeFirestore(documents);
  return {
    db,
    admin: {
      auth: () => ({ verifyIdToken: async token => ({ uid: token }) }),
      firestore: Object.assign(() => db, {
        FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' },
      }),
    },
  };
}

function seed({ credits = 5 } = {}) {
  return {
    'users/admin-a': { role: 'admin', status: 'active', tenantId: 'tenant-a' },
    'users/admin-b': { role: 'admin', status: 'active', tenantId: 'tenant-b' },
    'users/employee-a': { role: 'employee', status: 'active', tenantId: 'tenant-a' },
    'users/customer-a': { role: 'customer', status: 'active', tenantId: 'tenant-a' },
    'users/super-a': { role: 'super-admin', status: 'active', tenantId: null },
    'tenants/tenant-a': {
      businessName: 'Tenant A Cleaning',
      adminUsers: ['admin-a'],
      businessSettings: { businessName: 'Tenant A Cleaning', serviceArea: 'Test Area' },
    },
    'tenants/tenant-b': { businessName: 'Tenant B Cleaning', adminUsers: ['admin-b'] },
    'tenants/tenant-a/growthAICreditBalances/current': {
      schemaVersion: 1,
      tenantId: 'tenant-a',
      buckets: { monthly: credits, promotional: 0, purchased: 0 },
      reservedCredits: 0,
    },
    'tenants/tenant-b/growthAICreditBalances/current': {
      schemaVersion: 1,
      tenantId: 'tenant-b',
      buckets: { monthly: 5, promotional: 0, purchased: 0 },
      reservedCredits: 0,
    },
    'tenants/tenant-a/growthAIOpportunities/opportunity-a': {
      tenantId: 'tenant-a', type: 'estimate_followup', status: 'open', sourceRefs: { leadId: 'lead-a' },
    },
    'tenants/tenant-a/leads/lead-a': {
      tenantId: 'tenant-a', status: 'quoted', estimate: { status: 'draft' },
      requestSnapshot: { cleaningType: 'deep clean' },
      paymentStatus: 'must-not-reach-provider', stripePaymentIntentId: 'must-not-reach-provider',
    },
  };
}

function request(overrides = {}) {
  return {
    tenantId: 'tenant-a',
    actionType: 'marketing_post',
    idempotencyKey: 'request-1',
    sourceRefs: {},
    input: { postTypeId: 'availability', serviceType: 'standard clean' },
    ...overrides,
  };
}

function successProvider(calls = []) {
  return {
    async generateText(payload) {
      calls.push(payload);
      return { text: 'AI draft for human review.', providerRequestId: 'provider-1', modelId: 'model-1' };
    },
  };
}

function ledgerEntries(db) {
  return [...db.documents.entries()].filter(([path]) => path.includes('/growthAICreditLedger/'));
}

describe('GrowthAI server gateway', () => {
  test('requires a strict allowlisted request shape', () => {
    assert.throws(
      () => normalizeGenerationRequest({ ...request(), provider: 'browser-choice' }),
      error => error.code === 'invalid_request',
    );
    assert.throws(
      () => normalizeGenerationRequest(request({ actionType: 'lead_finder' })),
      error => error.code === 'invalid_request',
    );
    assert.throws(
      () => normalizeGenerationRequest(request({ input: { postTypeId: 'availability', creditCost: 0 } })),
      error => error.code === 'invalid_request',
    );
  });

  test('denies anonymous HTTP requests before provider access', async () => {
    const { admin } = fakeAdmin(seed());
    const providerCalls = [];
    const handler = createGrowthAIGenerationHandler({ admin, provider: successProvider(providerCalls) });
    const response = {
      statusCode: null,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.payload = payload; return this; },
      send(payload) { this.payload = payload; return this; },
      set() {},
    };
    await handler({ method: 'POST', headers: {}, body: request() }, response);
    assert.equal(response.statusCode, 401);
    assert.equal(providerCalls.length, 0);
  });

  for (const [label, uid] of [['employee', 'employee-a'], ['customer', 'customer-a'], ['wrong tenant admin', 'admin-b']]) {
    test(`denies ${label}`, async () => {
      const { admin } = fakeAdmin(seed());
      const providerCalls = [];
      await assert.rejects(
        generateGrowthAIContent({ admin, provider: successProvider(providerCalls), requestBody: request(), uid }),
        error => error.code === 'forbidden' && error.status === 403,
      );
      assert.equal(providerCalls.length, 0);
    });
  }

  test('allows a tenant admin and an explicitly scoped super-admin', async () => {
    for (const uid of ['admin-a', 'super-a']) {
      const { admin } = fakeAdmin(seed());
      const result = await generateGrowthAIContent({ admin, provider: successProvider(), requestBody: request({ idempotencyKey: `allowed-${uid}` }), uid });
      assert.equal(result.success, true);
      assert.match(result.draftId, /^ai-/);
    }
  });

  test('reserves, generates, finalizes once, and persists an unapproved draft', async () => {
    const { admin, db } = fakeAdmin(seed());
    const calls = [];
    const first = await generateGrowthAIContent({ admin, provider: successProvider(calls), requestBody: request(), uid: 'admin-a' });
    const second = await generateGrowthAIContent({ admin, provider: successProvider(calls), requestBody: request(), uid: 'admin-a' });
    const balance = db.documents.get('tenants/tenant-a/growthAICreditBalances/current');
    const [[, ledger]] = ledgerEntries(db);
    const draft = db.documents.get(`tenants/tenant-a/growthAIDrafts/${first.draftId}`);
    assert.equal(first.creditsCharged, 1);
    assert.equal(second.reused, true);
    assert.equal(second.draftId, first.draftId);
    assert.equal(calls.length, 1);
    assert.deepEqual(balance.buckets, { monthly: 4, promotional: 0, purchased: 0 });
    assert.equal(balance.reservedCredits, 0);
    assert.equal(ledger.status, 'finalized');
    assert.equal(ledger.actorUid, 'admin-a');
    assert.equal(draft.status, 'draft');
    assert.equal(draft.approvedByUid, null);
  });

  test('uses the modular Admin SDK timestamp when the legacy namespace is unavailable', async () => {
    const { admin, db } = fakeAdmin(seed());
    delete admin.firestore.FieldValue;
    const result = await generateGrowthAIContent({
      admin,
      provider: successProvider(),
      requestBody: request({ idempotencyKey: 'modular-field-value' }),
      uid: 'admin-a',
    });
    assert.equal(result.success, true);
    assert.equal(db.documents.get('tenants/tenant-a/growthAICreditBalances/current').reservedCredits, 0);
  });

  test('restores reserved credits after provider failure without creating a draft', async () => {
    const { admin, db } = fakeAdmin(seed());
    await assert.rejects(
      generateGrowthAIContent({
        admin,
        provider: { generateText: async () => { throw new GrowthAIProviderError('failed', 'provider_error'); } },
        requestBody: request(),
        uid: 'admin-a',
      }),
      error => error.code === 'provider_error',
    );
    const balance = db.documents.get('tenants/tenant-a/growthAICreditBalances/current');
    const [[, ledger]] = ledgerEntries(db);
    assert.deepEqual(balance.buckets, { monthly: 5, promotional: 0, purchased: 0 });
    assert.equal(balance.reservedCredits, 0);
    assert.equal(ledger.status, 'restored');
    assert.equal([...db.documents.keys()].some(path => path.includes('/growthAIDrafts/ai-')), false);
  });

  test('does not call the provider when credits are insufficient', async () => {
    const { admin } = fakeAdmin(seed({ credits: 0 }));
    const calls = [];
    await assert.rejects(
      generateGrowthAIContent({ admin, provider: successProvider(calls), requestBody: request(), uid: 'admin-a' }),
      error => error.code === 'insufficient_credits' && error.status === 402,
    );
    assert.equal(calls.length, 0);
  });

  test('prevents concurrent requests from overspending one credit', async () => {
    const { admin, db } = fakeAdmin(seed({ credits: 1 }));
    const calls = [];
    const results = await Promise.allSettled([
      generateGrowthAIContent({ admin, provider: successProvider(calls), requestBody: request({ idempotencyKey: 'concurrent-a' }), uid: 'admin-a' }),
      generateGrowthAIContent({ admin, provider: successProvider(calls), requestBody: request({ idempotencyKey: 'concurrent-b' }), uid: 'admin-a' }),
    ]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter(result => result.status === 'rejected' && result.reason.code === 'insufficient_credits').length, 1);
    assert.equal(calls.length, 1);
    assert.deepEqual(db.documents.get('tenants/tenant-a/growthAICreditBalances/current').buckets, {
      monthly: 0, promotional: 0, purchased: 0,
    });
  });

  test('prevents duplicate in-flight idempotency requests from charging or calling twice', async () => {
    const { admin } = fakeAdmin(seed());
    let releaseProvider;
    const calls = [];
    const provider = {
      generateText: payload => {
        calls.push(payload);
        return new Promise(resolve => { releaseProvider = () => resolve({ text: 'One logical result.' }); });
      },
    };
    const first = generateGrowthAIContent({ admin, provider, requestBody: request(), uid: 'admin-a' });
    await new Promise(resolve => setImmediate(resolve));
    await assert.rejects(
      generateGrowthAIContent({ admin, provider, requestBody: request(), uid: 'admin-a' }),
      error => error.code === 'already_processing',
    );
    releaseProvider();
    await first;
    assert.equal(calls.length, 1);
  });

  test('rejects cross-tenant and mismatched estimate source references before reservation', async () => {
    const documents = seed();
    documents['tenants/tenant-a/growthAIOpportunities/opportunity-a'].sourceRefs.leadId = 'lead-other';
    const { admin, db } = fakeAdmin(documents);
    const calls = [];
    await assert.rejects(
      generateGrowthAIContent({
        admin,
        provider: successProvider(calls),
        requestBody: request({
          actionType: 'estimate_followup',
          sourceRefs: { opportunityId: 'opportunity-a', leadId: 'lead-a' },
          input: { channelId: 'email' },
        }),
        uid: 'admin-a',
      }),
      error => error.code === 'invalid_source',
    );
    assert.equal(calls.length, 0);
    assert.equal(ledgerEntries(db).length, 0);
  });

  test('minimizes estimate prompt context and excludes payment and Stripe fields', async () => {
    const { admin } = fakeAdmin(seed());
    const calls = [];
    await generateGrowthAIContent({
      admin,
      provider: successProvider(calls),
      requestBody: request({
        actionType: 'estimate_followup',
        sourceRefs: { opportunityId: 'opportunity-a', leadId: 'lead-a' },
        input: { channelId: 'email' },
      }),
      uid: 'admin-a',
    });
    const serialized = JSON.stringify(calls[0]);
    assert.match(serialized, /deep clean/);
    assert.doesNotMatch(serialized, /must-not-reach-provider/);
  });
});
