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
      tenantId: 'tenant-a', status: 'quoted', booking: null,
      estimate: {
        status: 'draft', priceLow: 190, priceSuggested: 205, priceHigh: 220,
        currency: 'USD', tenantPricingProfileId: 'tenant-a-pricing', requiresManualReview: false,
      },
      requestSnapshot: { cleaningType: 'deep clean', frequency: 'one-time' },
      formData: {
        fullName: 'Must Not Reach Provider', email: 'private@example.test', address: 'Private Address',
        bedrooms: 3, bathrooms: 2, condition: 'normal', extras: { oven: true, fridge: false },
        specialRequests: 'Private customer note',
      },
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

function estimateAssistanceRequest(overrides = {}) {
  return request({
    actionType: 'estimate_assistance',
    idempotencyKey: 'estimate-assistance-1',
    sourceRefs: { leadId: 'lead-a' },
    input: {},
    ...overrides,
  });
}

function customerCommunicationRequest(overrides = {}) {
  return request({
    actionType: 'customer_response',
    idempotencyKey: 'customer-communication-1',
    sourceRefs: { bookingId: 'booking-a' },
    input: {
      channelId: 'sms',
      scenarioId: 'legacy-compatible',
      communicationType: 'review_request',
      customerMessage: 'Please make this warm and concise.',
    },
    ...overrides,
  });
}

function estimateAssistanceProvider(calls = [], overrides = {}) {
  return {
    async generateText(payload) {
      calls.push(payload);
      return {
        text: JSON.stringify({
          recommendedPrice: 215,
          reasoning: 'The deterministic range supports a modest complexity adjustment.',
          assumptions: ['Normal access and condition'],
          scopeSuggestions: ['Confirm the requested deep-clean scope'],
          possibleAddOns: ['Inside oven'],
          complexityFlags: ['Deep-clean detail level'],
          ...overrides,
        }, null, 2),
        providerRequestId: 'provider-estimate-1',
        modelId: 'model-1',
        rawResponse: 'must-not-persist',
      };
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
    assert.throws(
      () => normalizeGenerationRequest(request({ input: { postTypeId: 'testimonial' } })),
      error => error.code === 'invalid_request',
    );
    assert.throws(
      () => normalizeGenerationRequest(request({
        input: { postTypeId: 'before_after' },
        sourceRefs: { leadId: 'lead-a' },
      })),
      error => error.code === 'invalid_request',
    );
  });

  test('validates completed-job marketing server-side and keeps provider context free of customer, photo, payment, and Stripe data', async () => {
    const documents = seed();
    documents['tenants/tenant-a/growthAI/config'] = {
      tenantId: 'tenant-a', brandVoice: 'Warm and direct', contentTone: 'Clear and local', defaultCTA: 'Request a quote.',
    };
    documents['tenants/tenant-a/growthAIOpportunities/photo-opportunity-a'] = {
      tenantId: 'tenant-a', type: 'marketing_photo_review', status: 'open',
      sourceRefs: { bookingId: 'booking-a', photoIds: ['photo-before', 'photo-after'], customerId: 'customer-a' },
    };
    documents['tenants/tenant-a/bookings/booking-a'] = {
      tenantId: 'tenant-a', status: 'completed', serviceType: 'deep clean',
      customerName: 'Must Not Reach Provider', serviceAddress: 'Private Address',
      paymentStatus: 'must-not-reach-provider', stripePaymentIntentId: 'must-not-reach-provider',
    };
    const { admin, db } = fakeAdmin(documents);
    const calls = [];
    const result = await generateGrowthAIContent({
      admin,
      provider: successProvider(calls),
      requestBody: request({
        idempotencyKey: 'completed-job-marketing',
        sourceRefs: { opportunityId: 'photo-opportunity-a' },
        input: { postTypeId: 'before_after', platform: 'instagram' },
      }),
      uid: 'admin-a',
    });
    const prompt = JSON.stringify(calls[0]);
    const draft = db.documents.get(`tenants/tenant-a/growthAIDrafts/${result.draftId}`);

    assert.match(prompt, /deep clean/);
    assert.match(prompt, /Warm and direct|Clear and local/);
    assert.doesNotMatch(prompt, /Must Not Reach Provider|Private Address|must-not-reach-provider|photo-before|photo-after|customer-a/);
    assert.deepEqual(draft.sourceRefs, { opportunityId: 'photo-opportunity-a' });
    assert.equal(db.documents.get('tenants/tenant-a/growthAIOpportunities/photo-opportunity-a').status, 'acted');
  });

  test('rebuilds customer communication context from a verified tenant booking without exposing identity or private records', async () => {
    const documents = seed();
    documents['tenants/tenant-a/bookings/booking-a'] = {
      tenantId: 'tenant-a', status: 'completed', serviceType: 'deep clean', date: '2026-09-01', time: '10:00',
      customerName: 'Must Not Reach Provider', customerEmail: 'private@example.test',
      serviceAddress: 'Private Address', internalNotes: 'Private incident detail',
      paymentStatus: 'must-not-reach-provider', stripePaymentIntentId: 'must-not-reach-provider',
    };
    const originalBooking = clone(documents['tenants/tenant-a/bookings/booking-a']);
    const { admin, db } = fakeAdmin(documents);
    const calls = [];
    const result = await generateGrowthAIContent({
      admin,
      provider: successProvider(calls),
      requestBody: customerCommunicationRequest(),
      uid: 'admin-a',
    });

    const serialized = JSON.stringify(calls[0]);
    const draft = db.documents.get(`tenants/tenant-a/growthAIDrafts/${result.draftId}`);
    assert.match(serialized, /review_request/);
    assert.match(serialized, /deep clean/);
    assert.doesNotMatch(serialized, /Must Not Reach Provider|private@example|Private Address|Private incident|must-not-reach-provider/);
    assert.match(calls[0].systemInstruction, /Do not claim the customer was satisfied/);
    assert.equal(result.creditsCharged, 1);
    assert.equal(draft.status, 'draft');
    assert.equal(draft.pillar, 'reputation');
    assert.deepEqual(draft.sourceRefs, { bookingId: 'booking-a' });
    assert.deepEqual(db.documents.get('tenants/tenant-a/bookings/booking-a'), originalBooking);
    assert.equal([...db.documents.keys()].some(path => path.includes('/payments/')), false);
  });

  test('requires matching canonical sources for customer communication before reserving a credit', async () => {
    const documents = seed();
    documents['tenants/tenant-a/bookings/booking-a'] = {
      tenantId: 'tenant-a', status: 'completed', serviceType: 'deep clean',
    };
    const { admin, db } = fakeAdmin(documents);
    const calls = [];
    await assert.rejects(
      generateGrowthAIContent({
        admin,
        provider: successProvider(calls),
        requestBody: customerCommunicationRequest({
          idempotencyKey: 'missing-completed-source',
          sourceRefs: {},
        }),
        uid: 'admin-a',
      }),
      error => error.code === 'invalid_source',
    );
    await assert.rejects(
      generateGrowthAIContent({
        admin,
        provider: successProvider(calls),
        requestBody: customerCommunicationRequest({
          idempotencyKey: 'cross-tenant-source',
          sourceRefs: { bookingId: 'booking-a' },
        }),
        uid: 'admin-b',
      }),
      error => error.code === 'forbidden',
    );
    assert.equal(calls.length, 0);
    assert.equal(ledgerEntries(db).length, 0);
  });

  test('requires an eligible completed-job opportunity for before-and-after marketing before reserving credit', async () => {
    const { admin, db } = fakeAdmin(seed());
    await assert.rejects(
      generateGrowthAIContent({
        admin,
        provider: successProvider(),
        requestBody: request({ input: { postTypeId: 'before_after' } }),
        uid: 'admin-a',
      }),
      error => error.code === 'invalid_source',
    );
    assert.equal(ledgerEntries(db).length, 0);
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

  test('creates one tenant-scoped unapproved estimate recommendation and finalizes exactly one credit', async () => {
    const documents = seed();
    const originalLead = clone(documents['tenants/tenant-a/leads/lead-a']);
    const { admin, db } = fakeAdmin(documents);
    const calls = [];
    const result = await generateGrowthAIContent({
      admin,
      provider: estimateAssistanceProvider(calls),
      requestBody: estimateAssistanceRequest(),
      uid: 'admin-a',
    });
    const draft = db.documents.get(`tenants/tenant-a/growthAIDrafts/${result.draftId}`);
    const recommendation = db.documents.get(`tenants/tenant-a/growthAIEstimateRecommendations/${result.draftId}`);
    const [[, ledger]] = ledgerEntries(db);
    const audits = [...db.documents.entries()].filter(([path]) => path.includes(`/growthAIDrafts/${result.draftId}/audit/`));

    assert.equal(result.creditsCharged, 1);
    assert.equal(calls.length, 1);
    assert.deepEqual(db.documents.get('tenants/tenant-a/growthAICreditBalances/current').buckets, {
      monthly: 4, promotional: 0, purchased: 0,
    });
    assert.equal(ledger.status, 'finalized');
    assert.equal(draft.status, 'draft');
    assert.equal(draft.approvedByUid, null);
    assert.equal(recommendation.status, 'unapproved');
    assert.equal(recommendation.authoritative, false);
    assert.equal(recommendation.humanApprovalRequired, true);
    assert.deepEqual(recommendation.baselinePrice, {
      low: 190, suggested: 205, high: 220, currency: 'USD',
      pricingProfileId: 'tenant-a-pricing', requiresManualReview: false,
    });
    assert.equal(recommendation.recommendedPrice, 215);
    assert.equal(recommendation.draftId, result.draftId);
    assert.equal(recommendation.leadId, 'lead-a');
    assert.equal(draft.content.callToAction, 'Human review and approval required.');
    assert.deepEqual(draft.sourceRefs, { leadId: 'lead-a' });
    assert.equal(audits.length, 1);
    assert.equal(audits[0][1].action, 'draft_created');
    assert.deepEqual(db.documents.get('tenants/tenant-a/leads/lead-a'), originalLead);
    assert.equal([...db.documents.keys()].some(path => path.includes('/bookings/')), false);
    assert.equal([...db.documents.keys()].some(path => path.includes('/payments/')), false);
    assert.doesNotMatch(JSON.stringify({ draft, recommendation, ledger }), /rawResponse|must-not-persist/);
  });

  test('builds estimate assistance only from minimized canonical estimate context', async () => {
    const { admin } = fakeAdmin(seed());
    const calls = [];
    await generateGrowthAIContent({
      admin,
      provider: estimateAssistanceProvider(calls),
      requestBody: estimateAssistanceRequest({ idempotencyKey: 'estimate-minimized-context' }),
      uid: 'admin-a',
    });
    const serialized = JSON.stringify(calls[0]);
    assert.match(serialized, /deep clean/);
    assert.match(serialized, /USD 190-220; suggested 205/);
    assert.match(serialized, /Selected add-ons: oven/);
    assert.doesNotMatch(serialized, /fridge/);
    assert.doesNotMatch(serialized, /Must Not Reach Provider|private@example|Private Address|Private customer note/);
    assert.doesNotMatch(serialized, /must-not-reach-provider/);
  });

  test('denies cross-tenant and non-reviewable estimate sources before reserving credit', async () => {
    for (const leadChanges of [
      { tenantId: 'tenant-b' },
      { status: 'booked', booking: { bookingId: 'booking-a' } },
      { status: 'lost' },
      { estimate: { status: 'approved', priceLow: 190, priceHigh: 220 } },
    ]) {
      const documents = seed();
      documents['tenants/tenant-a/leads/lead-a'] = {
        ...documents['tenants/tenant-a/leads/lead-a'],
        ...leadChanges,
      };
      const { admin, db } = fakeAdmin(documents);
      const calls = [];
      await assert.rejects(
        generateGrowthAIContent({
          admin,
          provider: estimateAssistanceProvider(calls),
          requestBody: estimateAssistanceRequest({ idempotencyKey: `invalid-${leadChanges.status || leadChanges.tenantId || 'approved'}` }),
          uid: 'admin-a',
        }),
        error => error.code === 'invalid_source',
      );
      assert.equal(calls.length, 0);
      assert.equal(ledgerEntries(db).length, 0);
    }
  });

  test('rejects client estimate context and requires one canonical lead reference', () => {
    assert.throws(
      () => normalizeGenerationRequest(estimateAssistanceRequest({ input: { recommendedPrice: '1' } })),
      error => error.code === 'invalid_request',
    );
    assert.throws(
      () => normalizeGenerationRequest(estimateAssistanceRequest({ sourceRefs: {} })),
      error => error.code === 'invalid_request',
    );
    assert.throws(
      () => normalizeGenerationRequest(estimateAssistanceRequest({ sourceRefs: { leadId: 'lead-a', opportunityId: 'other' } })),
      error => error.code === 'invalid_request',
    );
  });

  test('restores estimate-assistance credit when provider output is invalid and leaves the estimate unchanged', async () => {
    const documents = seed();
    const originalLead = clone(documents['tenants/tenant-a/leads/lead-a']);
    const { admin, db } = fakeAdmin(documents);
    await assert.rejects(
      generateGrowthAIContent({
        admin,
        provider: { generateText: async () => ({ text: 'not-json' }) },
        requestBody: estimateAssistanceRequest(),
        uid: 'admin-a',
      }),
      error => error.code === 'invalid_provider_output',
    );
    const [[, ledger]] = ledgerEntries(db);
    assert.deepEqual(db.documents.get('tenants/tenant-a/growthAICreditBalances/current').buckets, {
      monthly: 5, promotional: 0, purchased: 0,
    });
    assert.equal(ledger.status, 'restored');
    assert.deepEqual(db.documents.get('tenants/tenant-a/leads/lead-a'), originalLead);
    assert.equal([...db.documents.keys()].some(path => path.includes('/growthAIDrafts/ai-')), false);
  });

  test('insufficient credits do not alter the ordinary saved estimate or call the provider', async () => {
    const documents = seed({ credits: 0 });
    const originalLead = clone(documents['tenants/tenant-a/leads/lead-a']);
    const { admin, db } = fakeAdmin(documents);
    const calls = [];
    await assert.rejects(
      generateGrowthAIContent({
        admin,
        provider: estimateAssistanceProvider(calls),
        requestBody: estimateAssistanceRequest(),
        uid: 'admin-a',
      }),
      error => error.code === 'insufficient_credits',
    );
    assert.equal(calls.length, 0);
    assert.deepEqual(db.documents.get('tenants/tenant-a/leads/lead-a'), originalLead);
    assert.equal(ledgerEntries(db).length, 0);
  });

  test('reuses the finalized estimate-assistance result without a second provider call or charge', async () => {
    const { admin, db } = fakeAdmin(seed());
    const calls = [];
    const requestBody = estimateAssistanceRequest({ idempotencyKey: 'estimate-retry' });
    const first = await generateGrowthAIContent({ admin, provider: estimateAssistanceProvider(calls), requestBody, uid: 'admin-a' });
    const second = await generateGrowthAIContent({ admin, provider: estimateAssistanceProvider(calls), requestBody, uid: 'admin-a' });
    assert.equal(second.reused, true);
    assert.equal(second.draftId, first.draftId);
    assert.equal(calls.length, 1);
    assert.deepEqual(db.documents.get('tenants/tenant-a/growthAICreditBalances/current').buckets, {
      monthly: 4, promotional: 0, purchased: 0,
    });
    assert.equal(ledgerEntries(db).length, 1);
  });
});
