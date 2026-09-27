const assert = require('node:assert/strict');
const test = require('node:test');
const { createEmployeeSafetyClient, isRetryableSafetyError, withTransportTimeout } = require('../employeeSafetyClient');

const runtimeConfig = { mode: 'production', projectId: 'example-servicesos' };
const eventId = 'safety_event_123456';

test('safety client requires auth and sends only event and job identity with Bearer token', async () => {
  const missing = createEmployeeSafetyClient({ auth: { currentUser: null }, runtimeConfig, fetchImpl: async () => {} });
  await assert.rejects(missing({ eventId, bookingId: 'job-a' }));
  let request;
  const send = createEmployeeSafetyClient({
    auth: { currentUser: { getIdToken: async () => 'test-token' } }, runtimeConfig,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ success: true, eventId, status: 'sent', createdAt: '2026-09-26T12:00:00.000Z' }) };
    },
  });
  const result = await send({ eventId, bookingId: 'job-a' });
  assert.equal(result.status, 'sent');
  assert.match(request.url, /employeeSafetyGateway$/);
  assert.equal(request.options.headers.Authorization, 'Bearer test-token');
  assert.deepEqual(JSON.parse(request.options.body), { eventId, bookingId: 'job-a' });
});

test('client does not claim sent without durable server confirmation', async () => {
  const send = createEmployeeSafetyClient({
    auth: { currentUser: { getIdToken: async () => 'test-token' } }, runtimeConfig,
    fetchImpl: async () => ({ ok: true, json: async () => ({ success: false }) }),
  });
  await assert.rejects(send({ eventId, bookingId: 'job-a' }));
});

test('transport failures and ambiguous server failures are retryable', async () => {
  const offline = createEmployeeSafetyClient({
    auth: { currentUser: { getIdToken: async () => 'test-token' } }, runtimeConfig,
    fetchImpl: async () => { throw new Error('offline'); },
  });
  await assert.rejects(offline({ eventId, bookingId: 'job-a' }), error => isRetryableSafetyError(error));

  const unavailable = createEmployeeSafetyClient({
    auth: { currentUser: { getIdToken: async () => 'test-token' } }, runtimeConfig,
    fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({ code: 'safety_unavailable' }) }),
  });
  await assert.rejects(unavailable({ eventId, bookingId: 'job-a' }), error => isRetryableSafetyError(error));
});

test('auth, authorization, visibility, and validation failures are permanent', async () => {
  for (const [status, code] of [[401, 'unauthenticated'], [403, 'forbidden'], [404, 'job_unavailable'], [400, 'invalid_request']]) {
    const send = createEmployeeSafetyClient({
      auth: { currentUser: { getIdToken: async () => 'test-token' } }, runtimeConfig,
      fetchImpl: async () => ({ ok: false, status, json: async () => ({ code }) }),
    });
    await assert.rejects(send({ eventId, bookingId: 'job-a' }), error => {
      assert.equal(error.code, code);
      assert.equal(error.status, status);
      assert.equal(isRetryableSafetyError(error), false);
      return true;
    });
  }
});

test('token acquisition failure is permanent and makes no request', async () => {
  let requested = false;
  const send = createEmployeeSafetyClient({
    auth: { currentUser: { getIdToken: async () => { throw new Error('expired'); } } }, runtimeConfig,
    fetchImpl: async () => { requested = true; },
  });
  await assert.rejects(send({ eventId, bookingId: 'job-a' }), error => !isRetryableSafetyError(error));
  assert.equal(requested, false);
});

test('indeterminate request timeout is retryable so the same event can resolve idempotently', async () => {
  await assert.rejects(withTransportTimeout(new Promise(() => {}), 1), error => {
    assert.equal(error.code, 'safety_timeout');
    assert.equal(isRetryableSafetyError(error), true);
    return true;
  });
});
