const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const {
  ACTOR_EMAIL_HOURLY_LIMIT,
  EMAIL_PROVIDER_SAFE_RETRY_MS,
  MAX_PDF_ATTACHMENT_BYTES,
  PLATFORM_EMAIL_DAILY_LIMIT,
  TENANT_EMAIL_DAILY_LIMIT,
  createSendCustomerEmailHandler,
  emailOperationId,
  emailReferences,
  emailRequestHash,
  normalizeCustomerEmailRequest,
  reserveCustomerEmail,
} = require('../sendCustomerEmail');

function clone(value) {
  return value == null ? value : structuredClone(value);
}

class Snapshot {
  constructor(value) {
    this.value = value;
    this.exists = value !== undefined;
  }

  data() {
    return clone(this.value);
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

class Reference {
  constructor(db, path) {
    this.db = db;
    this.path = path;
  }

  collection(name) {
    return new CollectionReference(this.db, `${this.path}/${name}`);
  }

  async get() {
    return new Snapshot(this.db.documents.get(this.path));
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
    const run = this._lock.then(() => callback({
      get: async reference => new Snapshot(this.documents.get(reference.path)),
      create: (reference, value) => {
        if (this.documents.has(reference.path)) throw new Error('already exists');
        this.documents.set(reference.path, clone(value));
      },
      set: (reference, value) => this.documents.set(reference.path, clone(value)),
      update: (reference, patch) => {
        if (!this.documents.has(reference.path)) throw new Error('missing document');
        this.documents.set(reference.path, { ...this.documents.get(reference.path), ...clone(patch) });
      },
    }));
    this._lock = run.catch(() => {});
    return run;
  }
}

function baseDocuments() {
  return {
    'users/admin-a': { role: 'admin', status: 'active', tenantId: 'tenant-a' },
    'users/admin-b': { role: 'admin', status: 'active', tenantId: 'tenant-b' },
    'users/admin-inactive': { role: 'admin', status: 'inactive', tenantId: 'tenant-a' },
    'users/admin-no-membership': { role: 'admin', status: 'active', tenantId: 'tenant-a' },
    'users/customer-a': { role: 'customer', status: 'active', tenantId: 'tenant-a' },
    'users/employee-a': { role: 'employee', status: 'active', tenantId: 'tenant-a' },
    'users/super-admin': { role: 'super-admin', status: 'active' },
    'tenants/tenant-a': {
      adminUsers: ['admin-a'],
      businessEmail: 'fallback@example.com',
      businessSettings: { businessEmail: 'Owner@Example.com' },
    },
    'tenants/tenant-b': { adminUsers: ['admin-b'] },
  };
}

function fakeEnvironment(documents = baseDocuments(), timestamp = new Date('2026-09-03T14:15:00.000Z')) {
  const db = new FakeFirestore(documents);
  return {
    db,
    admin: {
      auth: () => ({
        verifyIdToken: async token => {
          if (!token || token === 'invalid') throw new Error('invalid token');
          return { uid: token };
        },
      }),
      firestore: Object.assign(() => db, {
        FieldValue: { serverTimestamp: () => new Date(timestamp) },
      }),
    },
  };
}

function request(overrides = {}) {
  return {
    tenantId: 'tenant-a',
    emailType: 'quote',
    recipientEmail: 'customer@example.com',
    subject: 'Your estimate',
    relatedEntityId: 'lead-123',
    idempotencyKey: 'send-attempt-123',
    html: '<p>Estimate</p>',
    ...overrides,
  };
}

function successFetch(calls = []) {
  return async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, json: async () => ({ id: 'provider-email-123' }) };
  };
}

function responseMock() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    send(payload) { this.payload = payload; return this; },
  };
}

async function invoke(handler, { body = request(), token = 'admin-a', method = 'POST' } = {}) {
  const response = responseMock();
  await handler({ method, headers: token == null ? {} : { authorization: `Bearer ${token}` }, body }, response);
  return response;
}

function handlerFor(env, overrides = {}) {
  return createSendCustomerEmailHandler({
    admin: env.admin,
    apiKey: 'server-only-test-key',
    cors: (_req, _res, next) => next(),
    fetchImpl: successFetch(),
    now: () => new Date('2026-09-03T14:15:00.000Z'),
    providerEnabled: true,
    ...overrides,
  });
}

function directRequest(overrides = {}) {
  return normalizeCustomerEmailRequest(request(overrides));
}

async function reserve(env, rawRequest, uid = 'admin-a', at = new Date('2026-09-03T14:15:00.000Z')) {
  const normalized = directRequest(rawRequest);
  const requestHash = emailRequestHash({ request: normalized, replyTo: null, uid });
  return reserveCustomerEmail({ admin: env.admin, request: normalized, uid, requestHash, now: at });
}

describe('sendCustomerEmail authorization', () => {
  test('denies missing and invalid authentication', async () => {
    const calls = [];
    const handler = handlerFor(fakeEnvironment(), { fetchImpl: successFetch(calls) });
    assert.equal((await invoke(handler, { token: null })).statusCode, 401);
    assert.equal((await invoke(handler, { token: 'invalid' })).statusCode, 401);
    assert.equal(calls.length, 0);
  });

  test('denies missing/DEFAULT tenant before any provider call', async () => {
    const calls = [];
    const handler = handlerFor(fakeEnvironment(), { fetchImpl: successFetch(calls) });
    for (const tenantId of [undefined, 'DEFAULT']) {
      const body = request();
      if (tenantId === undefined) delete body.tenantId;
      else body.tenantId = tenantId;
      const response = await invoke(handler, { body });
      assert.equal(response.statusCode, 400);
      assert.equal(response.payload.code, 'invalid_request');
    }
    assert.equal(calls.length, 0);
  });

  test('denies missing profiles, non-admin roles, inactive/cross-tenant admins, and absent membership', async () => {
    const calls = [];
    const handler = handlerFor(fakeEnvironment(), { fetchImpl: successFetch(calls) });
    for (const token of ['missing-profile', 'customer-a', 'employee-a', 'admin-inactive', 'admin-b', 'admin-no-membership']) {
      const response = await invoke(handler, { token, body: request({ idempotencyKey: `attempt-${token}` }) });
      assert.equal(response.statusCode, 403, token);
      assert.equal(response.payload.code, 'forbidden', token);
    }
    assert.equal(calls.length, 0);
  });

  test('allows exact-tenant active admins and active super-admins', async () => {
    for (const token of ['admin-a', 'super-admin']) {
      const response = await invoke(handlerFor(fakeEnvironment()), {
        token,
        body: request({ idempotencyKey: `allowed-${token}` }),
      });
      assert.equal(response.statusCode, 200, token);
      assert.equal(response.payload.success, true, token);
    }
  });
});

describe('sendCustomerEmail payload contract', () => {
  test('rejects invalid types, recipients, body combinations, identifiers, and unknown keys', () => {
    const invalidRequests = [
      { emailType: 'marketing_blast' },
      { recipientEmail: 'invalid' },
      { recipientEmail: ['a@example.com', 'b@example.com'] },
      { subject: 'x'.repeat(201) },
      { html: 'x'.repeat(100_001) },
      { html: undefined, text: 'x'.repeat(50_001) },
      { html: undefined },
      { text: 'plain text' },
      { relatedEntityId: 'x'.repeat(257) },
      { idempotencyKey: undefined },
      { replyToBusinessEmail: 'attacker@example.com' },
    ];
    for (const changes of invalidRequests) {
      assert.throws(() => normalizeCustomerEmailRequest(request(changes)), error => error.code === 'invalid_request');
    }
  });

  test('allows only one valid service-agreement PDF attachment', () => {
    const pdf = Buffer.from('%PDF-1.4\nsynthetic');
    const attachment = { filename: 'Service_Agreement.pdf', content: pdf.toString('base64'), type: 'application/pdf' };
    const normalized = normalizeCustomerEmailRequest(request({ emailType: 'service_agreement', attachments: [attachment] }));
    assert.equal(normalized.attachment.sizeBytes, pdf.length);
    for (const attachments of [
      [attachment, attachment],
      [{ ...attachment, type: 'image/png' }],
      [{ ...attachment, content: 'not base64' }],
      [{ ...attachment, filename: '../agreement.pdf' }],
      [{ ...attachment, url: 'https://example.com/file.pdf' }],
    ]) {
      assert.throws(
        () => normalizeCustomerEmailRequest(request({ emailType: 'service_agreement', attachments })),
        error => error.code === 'invalid_request',
      );
    }
    assert.throws(
      () => normalizeCustomerEmailRequest(request({ attachments: [attachment] })),
      error => error.code === 'invalid_request',
    );
  });

  test('rejects decoded PDFs over 2 MB', () => {
    const oversized = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(MAX_PDF_ATTACHMENT_BYTES)]).toString('base64');
    assert.throws(
      () => normalizeCustomerEmailRequest(request({
        emailType: 'service_agreement',
        attachments: [{ filename: 'agreement.pdf', content: oversized, type: 'application/pdf' }],
      })),
      error => error.code === 'invalid_request',
    );
  });

  test('derives reply-to from tenant data and ignores client injection', async () => {
    const calls = [];
    const handler = handlerFor(fakeEnvironment(), { fetchImpl: successFetch(calls) });
    const response = await invoke(handler);
    assert.equal(response.statusCode, 200);
    const payload = JSON.parse(calls[0].options.body);
    assert.equal(payload.reply_to, 'owner@example.com');
    assert.equal(JSON.stringify(payload).includes('fallback@example.com'), false);
  });
});

describe('sendCustomerEmail quota and idempotency', () => {
  test('first reservation increments all counters once and same-key retry does not', async () => {
    const env = fakeEnvironment();
    const first = await reserve(env, {});
    const second = await reserve(env, {});
    const refs = emailReferences(env.db, {
      tenantId: 'tenant-a', uid: 'admin-a', operationId: first.operationId,
      now: new Date('2026-09-03T14:15:00.000Z'),
    });
    assert.equal(first.kind, 'reserved');
    assert.equal(second.kind, 'retry');
    assert.equal(env.db.documents.get(refs.platformUsageRef.path).count, 1);
    assert.equal(env.db.documents.get(refs.tenantUsageRef.path).count, 1);
    assert.equal(env.db.documents.get(refs.actorUsageRef.path).count, 1);
  });

  test('enforces platform, tenant, and actor limits under concurrent reservations', async () => {
    const at = new Date('2026-09-03T14:15:00.000Z');
    const cases = [
      { limit: PLATFORM_EMAIL_DAILY_LIMIT, existing: PLATFORM_EMAIL_DAILY_LIMIT - 1, count: 2, dimension: 'platform' },
      { limit: TENANT_EMAIL_DAILY_LIMIT, existing: TENANT_EMAIL_DAILY_LIMIT - 2, count: 3, dimension: 'tenant' },
      { limit: ACTOR_EMAIL_HOURLY_LIMIT, existing: ACTOR_EMAIL_HOURLY_LIMIT - 2, count: 3, dimension: 'actor' },
    ];
    for (const quotaCase of cases) {
      const env = fakeEnvironment();
      const seedRefs = emailReferences(env.db, {
        tenantId: 'tenant-a', uid: 'admin-a', operationId: 'seed', now: at,
      });
      const targetRef = quotaCase.dimension === 'platform'
        ? seedRefs.platformUsageRef
        : quotaCase.dimension === 'tenant' ? seedRefs.tenantUsageRef : seedRefs.actorUsageRef;
      env.db.documents.set(targetRef.path, { count: quotaCase.existing });
      const attempts = Array.from({ length: quotaCase.count }, (_, index) => reserve(
        env,
        { idempotencyKey: `${quotaCase.dimension}-${index}` },
        quotaCase.dimension === 'actor' ? 'admin-a' : `actor-${index}`,
        at,
      ));
      const results = await Promise.allSettled(attempts);
      assert.equal(results.filter(result => result.status === 'fulfilled').length, quotaCase.limit - quotaCase.existing);
      assert.equal(env.db.documents.get(targetRef.path).count, quotaCase.limit);
      assert.ok(results.some(result => result.status === 'rejected' && result.reason.code === 'quota_exceeded'));
    }
  });

  test('same key with changed content conflicts without a second provider call', async () => {
    const calls = [];
    const handler = handlerFor(fakeEnvironment(), { fetchImpl: successFetch(calls) });
    assert.equal((await invoke(handler)).statusCode, 200);
    const conflict = await invoke(handler, { body: request({ subject: 'Changed subject' }) });
    assert.equal(conflict.statusCode, 409);
    assert.equal(conflict.payload.code, 'idempotency_conflict');
    assert.equal(calls.length, 1);
  });

  test('sent retries reuse the prior result without provider or quota duplication', async () => {
    const calls = [];
    const env = fakeEnvironment();
    const handler = handlerFor(env, { fetchImpl: successFetch(calls) });
    assert.equal((await invoke(handler)).payload.status, 'sent');
    const retry = await invoke(handler);
    assert.equal(retry.payload.status, 'already_sent');
    assert.equal(retry.payload.reused, true);
    assert.equal(calls.length, 1);
    const usage = [...env.db.documents.entries()].filter(([path]) => path.includes('emailSendUsage/'));
    assert.equal(usage[0][1].count, 1);
  });

  test('reserved retry uses the same provider idempotency key inside 23 hours', async () => {
    const calls = [];
    const env = fakeEnvironment();
    const failing = handlerFor(env, {
      fetchImpl: async (_url, options) => {
        calls.push({
          body: options.body,
          idempotencyKey: options.headers['Idempotency-Key'],
        });
        throw new Error('network unavailable');
      },
    });
    assert.equal((await invoke(failing)).payload.code, 'send_uncertain');
    assert.equal((await invoke(failing)).payload.code, 'send_uncertain');
    assert.equal(calls.length, 2);
    assert.equal(calls[0].idempotencyKey, calls[1].idempotencyKey);
    assert.equal(calls[0].body, calls[1].body);
  });

  test('reserved operations at or beyond the safe retry window are blocked', async () => {
    const now = new Date('2026-09-03T14:15:00.000Z');
    const env = fakeEnvironment();
    const normalized = directRequest();
    const uid = 'admin-a';
    const operationId = emailOperationId({ tenantId: normalized.tenantId, uid, idempotencyKey: normalized.idempotencyKey });
    const requestHash = emailRequestHash({ request: normalized, replyTo: null, uid });
    const refs = emailReferences(env.db, { tenantId: normalized.tenantId, uid, operationId, now });
    env.db.documents.set(refs.operationRef.path, {
      requestHash,
      status: 'reserved',
      reservedAt: new Date(now.getTime() - EMAIL_PROVIDER_SAFE_RETRY_MS),
    });
    await assert.rejects(
      reserveCustomerEmail({ admin: env.admin, request: normalized, uid, requestHash, now }),
      error => error.code === 'retry_window_expired',
    );
  });
});

describe('sendCustomerEmail provider boundary', () => {
  test('disabled provider makes zero external calls and creates no reservation', async () => {
    const calls = [];
    const env = fakeEnvironment();
    const response = await invoke(handlerFor(env, { providerEnabled: false, fetchImpl: successFetch(calls) }));
    assert.equal(response.statusCode, 503);
    assert.equal(response.payload.code, 'email_disabled');
    assert.equal(calls.length, 0);
    assert.equal([...env.db.documents.keys()].some(path => path.includes('emailSendLedger')), false);
  });

  test('missing provider configuration makes zero external calls and creates no reservation', async () => {
    const calls = [];
    const env = fakeEnvironment();
    const response = await invoke(handlerFor(env, { apiKey: '', fetchImpl: successFetch(calls) }));
    assert.equal(response.statusCode, 503);
    assert.equal(response.payload.code, 'email_disabled');
    assert.equal(calls.length, 0);
    assert.equal([...env.db.documents.keys()].some(path => path.includes('emailSendLedger')), false);
  });

  test('successful provider send uses a server-derived key and finalizes once', async () => {
    const calls = [];
    const env = fakeEnvironment();
    const response = await invoke(handlerFor(env, { fetchImpl: successFetch(calls) }));
    assert.equal(response.statusCode, 200);
    const header = calls[0].options.headers['Idempotency-Key'];
    assert.match(header, /^servicesos-[a-f0-9]{64}$/);
    const ledger = [...env.db.documents.entries()].find(([path]) => path.includes('emailSendLedger/'))[1];
    assert.equal(ledger.status, 'sent');
    assert.equal(ledger.providerRequestId, 'provider-email-123');
    assert.equal('html' in ledger, false);
  });

  test('network timeout performs one call and leaves the operation reserved', async () => {
    let calls = 0;
    const env = fakeEnvironment();
    const handler = handlerFor(env, {
      providerTimeoutMs: 5,
      fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
        calls += 1;
        options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      }),
    });
    const response = await invoke(handler);
    assert.equal(response.statusCode, 503);
    assert.equal(response.payload.code, 'send_uncertain');
    assert.equal(calls, 1);
    const ledger = [...env.db.documents.entries()].find(([path]) => path.includes('emailSendLedger/'))[1];
    assert.equal(ledger.status, 'reserved');
  });

  test('concurrent provider idempotency response remains retryable without closing the key', async () => {
    let calls = 0;
    const env = fakeEnvironment();
    const handler = handlerFor(env, {
      fetchImpl: async () => {
        calls += 1;
        return {
          ok: false,
          status: 409,
          json: async () => ({ name: 'concurrent_idempotent_requests' }),
        };
      },
    });
    const response = await invoke(handler);
    assert.equal(response.statusCode, 503);
    assert.equal(response.payload.code, 'send_uncertain');
    assert.equal(calls, 1);
    const ledger = [...env.db.documents.entries()].find(([path]) => path.includes('emailSendLedger/'))[1];
    assert.equal(ledger.status, 'reserved');
  });

  test('definitive rejection closes the key, retains quota, and a new key uses a new reservation', async () => {
    let calls = 0;
    const env = fakeEnvironment();
    const handler = handlerFor(env, {
      fetchImpl: async () => {
        calls += 1;
        return { ok: false, status: 400, json: async () => ({ name: 'validation_error' }) };
      },
    });
    assert.equal((await invoke(handler)).payload.code, 'provider_failed');
    assert.equal((await invoke(handler)).payload.code, 'retry_with_new_key');
    assert.equal((await invoke(handler, { body: request({ idempotencyKey: 'new-deliberate-attempt' }) })).payload.code, 'provider_failed');
    assert.equal(calls, 2);
    const usage = [...env.db.documents.entries()].find(([path]) => path.includes('emailSendUsage/'))[1];
    assert.equal(usage.count, 2);
    const ledgers = [...env.db.documents.values()].filter(value => value?.schemaVersion === 1 && value?.requestHash);
    assert.equal(ledgers.length, 2);
    assert.ok(ledgers.every(ledger => ledger.status === 'failed'));
  });
});
