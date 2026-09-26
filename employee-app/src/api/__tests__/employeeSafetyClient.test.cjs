const assert = require('node:assert/strict');
const test = require('node:test');
const { createEmployeeSafetyClient } = require('../employeeSafetyClient');

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
