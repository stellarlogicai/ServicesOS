const assert = require('node:assert/strict');
const test = require('node:test');
const { createSafetyAlertQueue } = require('../employeeSafetyQueueClient');
const fs = require('node:fs');
const path = require('node:path');

const NOW = Date.parse('2026-09-26T12:00:00.000Z');
const base = index => ({
  employeeUid: 'employee-a',
  eventId: `safety_event_${String(index).padStart(4, '0')}`,
  bookingId: 'job-a',
});

function memoryStorage(initial = '') {
  let value = initial;
  return {
    read: async () => value,
    write: async next => { value = next; },
    value: () => value,
  };
}

test('queued event survives reload with only bounded retry fields and no credentials', async () => {
  const storage = memoryStorage();
  const first = createSafetyAlertQueue({ storage, now: () => NOW });
  await first.enqueue({
    ...base(1),
    location: { latitude: 41.8, longitude: -87.6, accuracy: 12, capturedAt: '2026-09-26T11:59:00.000Z' },
  });
  const reloaded = createSafetyAlertQueue({ storage, now: () => NOW });
  const entries = await reloaded.forJob('employee-a', 'job-a');
  assert.equal(entries.length, 1);
  assert.deepEqual(Object.keys(entries[0]).sort(), ['bookingId', 'employeeUid', 'eventId', 'location', 'queuedAt', 'version']);
  assert.equal(entries[0].eventId, base(1).eventId);
  assert.equal(entries[0].location.latitude, 41.8);
  assert.doesNotMatch(storage.value(), /token|credential|authorization|secret/i);
});

test('successful retry removal clears the entire event including location', async () => {
  const storage = memoryStorage();
  const queue = createSafetyAlertQueue({ storage, now: () => NOW });
  await queue.enqueue({ ...base(1), location: { latitude: 41.8, longitude: -87.6 } });
  await queue.remove('employee-a', base(1).eventId);
  assert.deepEqual(await queue.load(), []);
  assert.equal(storage.value(), '[]');
});

test('same event is idempotent but conflicting payload is rejected', async () => {
  const storage = memoryStorage();
  const queue = createSafetyAlertQueue({ storage, now: () => NOW });
  await queue.enqueue(base(1));
  await queue.enqueue(base(1));
  assert.equal((await queue.load()).length, 1);
  await assert.rejects(queue.enqueue({ ...base(1), bookingId: 'job-b' }), /queue_event_conflict/);
});

test('queue is bounded without silently evicting an existing safety alert', async () => {
  const storage = memoryStorage();
  const queue = createSafetyAlertQueue({ storage, now: () => NOW, maxEntries: 2 });
  await queue.enqueue(base(1));
  await queue.enqueue(base(2));
  await assert.rejects(queue.enqueue(base(3)), /queue_full/);
  assert.deepEqual((await queue.load()).map(item => item.eventId), [base(1).eventId, base(2).eventId]);
});

test('malformed and stale persisted entries fail closed and are removed', async () => {
  const stale = { version: 1, ...base(1), queuedAt: '2026-09-01T00:00:00.000Z' };
  const malformed = { version: 1, ...base(2), queuedAt: new Date(NOW).toISOString(), token: 'must-not-survive' };
  const storage = memoryStorage(JSON.stringify([stale, malformed]));
  const queue = createSafetyAlertQueue({ storage, now: () => NOW });
  assert.deepEqual(await queue.load(), []);
  assert.equal(storage.value(), '[]');
});

test('transient storage read failure does not overwrite a potentially valid queue', async () => {
  let writes = 0;
  const queue = createSafetyAlertQueue({
    storage: {
      read: async () => { throw new Error('temporary I/O failure'); },
      write: async () => { writes += 1; },
    },
    now: () => NOW,
  });
  await assert.rejects(queue.load(), /queue_storage_unavailable/);
  assert.equal(writes, 0);
});

test('entries are isolated by verified employee and booking identity', async () => {
  const storage = memoryStorage();
  const queue = createSafetyAlertQueue({ storage, now: () => NOW });
  await queue.enqueue(base(1));
  await queue.enqueue({ ...base(2), employeeUid: 'employee-b' });
  assert.equal((await queue.forJob('employee-a', 'job-a')).length, 1);
  assert.equal((await queue.forJob('employee-b', 'job-a')).length, 1);
});

test('native persistence adapter stores no token, credential, or arbitrary response fields', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'employeeSafetyQueue.js'), 'utf8');
  assert.doesNotMatch(source, /getIdToken|Authorization|Bearer|AsyncStorage|serverResponse|console\./);
  assert.match(source, /safety-alert-queue-v1\.json/);
});
