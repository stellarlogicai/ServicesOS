const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  EMPLOYEE_DAILY_LIMIT,
  TENANT_DAILY_LIMIT,
  reserveEmployeeWorkAssistantUsage,
  settleEmployeeWorkAssistantUsage,
} = require('../employeeWorkAssistantUsage');

function clone(value) { return value == null ? value : structuredClone(value); }
class Snapshot {
  constructor(value) { this.value = value; this.exists = value !== undefined; }
  data() { return clone(this.value); }
}
class Ref {
  constructor(db, path) { this.db = db; this.path = path; }
  collection(name) { return new Collection(this.db, `${this.path}/${name}`); }
}
class Collection {
  constructor(db, path) { this.db = db; this.path = path; }
  doc(id) { return new Ref(this.db, `${this.path}/${id}`); }
}
class Firestore {
  constructor() { this.documents = new Map(); this.lock = Promise.resolve(); }
  collection(name) { return new Collection(this, name); }
  runTransaction(callback) {
    const run = this.lock.then(async () => {
      const writes = [];
      const transaction = {
        get: async ref => new Snapshot(this.documents.get(ref.path)),
        set: (ref, value, options) => writes.push({ ref, value: clone(value), merge: options?.merge === true }),
      };
      const result = await callback(transaction);
      writes.forEach(({ ref, value, merge }) => {
        const current = this.documents.get(ref.path) || {};
        this.documents.set(ref.path, merge ? { ...current, ...value } : value);
      });
      return result;
    });
    this.lock = run.catch(() => {});
    return run;
  }
}
function fixture() {
  const db = new Firestore();
  return {
    db,
    admin: { firestore: Object.assign(() => db, { FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' } }) },
    employee: { uid: 'employee-a', tenantId: 'tenant-a', tenantTimeZone: 'America/Chicago' },
    request: { bookingId: 'booking-a', question: 'Explain this task', requestId: 'request-123456789', checklistItemId: 'task-a' },
    now: new Date('2026-09-03T05:30:00.000Z'),
  };
}

test('uses tenant-local day and stores no question, answer, or booking content', async () => {
  const value = fixture();
  const reservation = await reserveEmployeeWorkAssistantUsage(value);
  assert.equal(reservation.dateKey, '2026-09-03');
  const persisted = JSON.stringify([...value.db.documents.values()]);
  for (const forbidden of [value.request.question, value.request.bookingId, value.request.requestId]) {
    assert.equal(persisted.includes(forbidden), false);
  }
});

test('enforces one employee in-flight request and idempotent in-flight reuse', async () => {
  const value = fixture();
  await reserveEmployeeWorkAssistantUsage(value);
  await assert.rejects(reserveEmployeeWorkAssistantUsage(value), error => error.code === 'request_in_progress');
  await assert.rejects(
    reserveEmployeeWorkAssistantUsage({ ...value, request: { ...value.request, requestId: 'another-request-1234' } }),
    error => error.code === 'concurrency_limit',
  );
});

test('enforces three in-flight provider requests per tenant across employees', async () => {
  const value = fixture();
  for (let index = 1; index <= 3; index += 1) {
    await reserveEmployeeWorkAssistantUsage({
      ...value,
      employee: { ...value.employee, uid: `employee-${index}` },
      request: { ...value.request, requestId: `tenant-concurrent-${index}` },
    });
  }
  await assert.rejects(
    reserveEmployeeWorkAssistantUsage({
      ...value,
      employee: { ...value.employee, uid: 'employee-4' },
      request: { ...value.request, requestId: 'tenant-concurrent-4' },
    }),
    error => error.code === 'concurrency_limit',
  );
});

test('successful request remains counted and cannot call the provider twice', async () => {
  const value = fixture();
  const reservation = await reserveEmployeeWorkAssistantUsage(value);
  await settleEmployeeWorkAssistantUsage({ admin: value.admin, reservation, succeeded: true });
  const retry = await reserveEmployeeWorkAssistantUsage(value);
  assert.equal(retry.kind, 'succeeded');
});

test('failure releases concurrency and allowance for same-id retry', async () => {
  const value = fixture();
  const reservation = await reserveEmployeeWorkAssistantUsage(value);
  await settleEmployeeWorkAssistantUsage({ admin: value.admin, reservation, succeeded: false, failureCode: 'timeout' });
  const retry = await reserveEmployeeWorkAssistantUsage(value);
  assert.equal(retry.kind, 'reserved');
});

test('enforces employee and tenant daily limits', async () => {
  const employeeValue = fixture();
  const employeeReservation = await reserveEmployeeWorkAssistantUsage(employeeValue);
  await settleEmployeeWorkAssistantUsage({ admin: employeeValue.admin, reservation: employeeReservation, succeeded: true });
  const employeeDoc = [...employeeValue.db.documents.entries()].find(([path]) => path.includes('/employees/'));
  employeeValue.db.documents.set(employeeDoc[0], { ...employeeDoc[1], providerRequests: EMPLOYEE_DAILY_LIMIT });
  await assert.rejects(
    reserveEmployeeWorkAssistantUsage({ ...employeeValue, request: { ...employeeValue.request, requestId: 'employee-limit-1234' } }),
    error => error.code === 'usage_limit',
  );

  const tenantValue = fixture();
  const tenantReservation = await reserveEmployeeWorkAssistantUsage(tenantValue);
  await settleEmployeeWorkAssistantUsage({ admin: tenantValue.admin, reservation: tenantReservation, succeeded: true });
  const dayDoc = [...tenantValue.db.documents.entries()].find(([path]) => path.split('/').length === 4);
  tenantValue.db.documents.set(dayDoc[0], { ...dayDoc[1], providerRequests: TENANT_DAILY_LIMIT });
  await assert.rejects(
    reserveEmployeeWorkAssistantUsage({ ...tenantValue, request: { ...tenantValue.request, requestId: 'tenant-limit-12345' } }),
    error => error.code === 'usage_limit',
  );
});

test('same request ID with different input is rejected', async () => {
  const value = fixture();
  await reserveEmployeeWorkAssistantUsage(value);
  await assert.rejects(
    reserveEmployeeWorkAssistantUsage({ ...value, request: { ...value.request, question: 'Different question' } }),
    error => error.code === 'idempotency_conflict',
  );
});
