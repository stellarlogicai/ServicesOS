const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  EmployeeWorkAssistantClientError,
  createEmployeeWorkAssistantClient,
  normalizeRequest,
  validateResponse,
} = require('../employeeWorkAssistantClient');

const runtimeConfig = { mode: 'local-emulator', projectId: 'demo-servicesos-v1-smoke-local', emulator: { host: '10.0.2.2', functionsPort: 5001 } };
const requestId = 'request-123456789';

function response(payload, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => payload };
}

test('normalizes only the bounded request contract', () => {
  assert.deepEqual(normalizeRequest({ bookingId: ' booking-a ', question: ' Next task? ', requestId }), {
    bookingId: 'booking-a', question: 'Next task?', requestId,
  });
  assert.throws(() => normalizeRequest({ bookingId: 'booking-a', question: 'x'.repeat(601), requestId }));
  assert.throws(() => normalizeRequest({ bookingId: 'bad/path', question: 'Question', requestId }));
  assert.throws(() => normalizeRequest({ bookingId: 'booking-a', question: 'Question', requestId: 'short' }));
});

test('authenticated request sends only the approved fields and Bearer token', async () => {
  const calls = [];
  const client = createEmployeeWorkAssistantClient({
    auth: { currentUser: { getIdToken: async () => 'token-a' } },
    runtimeConfig,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return response({ success: true, kind: 'deterministic', answer: 'Next task.', requestId });
    },
  });
  const result = await client({ bookingId: 'booking-a', question: 'What is next?', requestId, checklistItemId: 'task-a' });
  assert.equal(result.kind, 'deterministic');
  assert.match(calls[0].url, /employeeWorkAssistantGateway$/);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer token-a');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    bookingId: 'booking-a', question: 'What is next?', requestId, checklistItemId: 'task-a',
  });
  for (const field of ['tenantId', 'uid', 'role', 'employeeId', 'context', 'history', 'action']) {
    assert.equal(field in JSON.parse(calls[0].options.body), false);
  }
});

test('unauthenticated calls fail locally', async () => {
  const client = createEmployeeWorkAssistantClient({ auth: { currentUser: null }, runtimeConfig, fetchImpl: async () => { throw new Error('must not call'); } });
  await assert.rejects(client({ bookingId: 'booking-a', question: 'Question', requestId }), error => error.code === 'unauthenticated');
});

test('strict response validation rejects unknown fields, mismatched request IDs, and oversized answers', () => {
  assert.deepEqual(validateResponse({ success: true, kind: 'explanation', answer: 'Answer', requestId }, requestId), {
    kind: 'explanation', answer: 'Answer', requestId,
  });
  assert.throws(() => validateResponse({ success: true, kind: 'explanation', answer: 'Answer', requestId, model: 'private' }, requestId));
  assert.throws(() => validateResponse({ success: true, kind: 'explanation', answer: 'Answer', requestId: 'other-request-123' }, requestId));
  assert.throws(() => validateResponse({ success: true, kind: 'explanation', answer: 'x'.repeat(1501), requestId }, requestId));
});

test('server errors are reduced to safe client errors', async () => {
  const client = createEmployeeWorkAssistantClient({
    auth: { currentUser: { getIdToken: async () => 'token-a' } },
    runtimeConfig,
    fetchImpl: async () => response({ code: 'job_unavailable', error: 'private internal detail' }, { ok: false, status: 404 }),
  });
  await assert.rejects(
    client({ bookingId: 'booking-a', question: 'Question', requestId }),
    error => error instanceof EmployeeWorkAssistantClientError && error.code === 'job_unavailable' && !error.message.includes('private'),
  );
});
