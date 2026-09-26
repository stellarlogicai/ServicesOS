const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createEmployeeSafetyGatewayHandler, createSafetyAlert, parseRequest } = require('../employeeSafetyGateway');
const { createOwnerSafetyAlertsGatewayHandler, listOwnerSafetyAlerts } = require('../ownerSafetyAlertsGateway');
const { getEmployeeJob } = require('../employeeJobPacketGateway');
const { verifyCanonicalEmployee } = require('../employeeAuthorization');
const { employeeJobPacket, safeBusinessPhone } = require('../employeeJobPacketProjection');

const NOW = new Date('2026-09-26T12:00:00.000Z');

function setup({ employeeRole = 'employee', employeeStatus = 'active', members = ['employee-a'],
  booking = { date: '2026-09-26', status: 'scheduled', assignedEmployeeAuthUid: 'employee-a' },
  adminRole = 'admin', adminMembers = ['owner-a'] } = {}) {
  const records = new Map();
  const paths = [];
  const profiles = {
    'employee-a': { role: employeeRole, status: employeeStatus, tenantId: 'tenant-a', displayName: 'Worker' },
    'employee-b': { role: 'employee', status: 'active', tenantId: 'tenant-a', displayName: 'Other' },
    'owner-a': { role: adminRole, status: 'active', tenantId: 'tenant-a' },
    'cross-owner': { role: 'admin', status: 'active', tenantId: 'tenant-b' },
  };
  const tenant = { users: members, adminUsers: adminMembers, businessPhone: '(555) 123-4567' };
  function snapshot(path) {
    const [collection, id, subcollection, subId] = path;
    let data;
    if (collection === 'users') data = profiles[id];
    if (collection === 'tenants' && !subcollection && id === 'tenant-a') data = tenant;
    if (collection === 'tenants' && subcollection === 'bookings' && id === 'tenant-a' && subId === 'job-a') data = booking;
    if (collection === 'tenants' && subcollection === 'safetyAlerts') data = records.get(subId);
    return { exists: data !== undefined, id: subId || id, data: () => data };
  }
  function ref(path) {
    return {
      path,
      doc(id) { return ref([...path, id]); },
      collection(id) { return ref([...path, id]); },
      async get() {
        paths.push(path.join('/'));
        if (path.length === 3 && path[2] === 'safetyAlerts') {
          return { docs: [...records.entries()].map(([id, data]) => ({ id, data: () => data })) };
        }
        return snapshot(path);
      },
      orderBy() { return this; },
      limit(value) { assert.equal(value, 25); return this; },
    };
  }
  const db = {
    collection(id) { return ref([id]); },
    async runTransaction(callback) {
      return callback({
        get: target => Promise.resolve(snapshot(target.path)),
        create: (target, value) => { records.set(target.path.at(-1), value); },
      });
    },
  };
  const admin = {
    firestore: () => db,
    auth: () => ({ verifyIdToken: async token => {
      if (token !== 'valid') throw new Error('invalid token');
      return { uid: 'employee-a' };
    } }),
  };
  return { admin, records, paths, profiles, tenant, snapshot };
}

test('request contains only event ID, optional job, and bounded location', () => {
  const eventId = 'safety_event_123456';
  assert.deepEqual(parseRequest({ eventId }), { eventId });
  assert.throws(() => parseRequest({ eventId, tenantId: 'tenant-b' }));
  assert.throws(() => parseRequest({ eventId, location: { latitude: 91, longitude: 0, capturedAt: NOW.toISOString() } }));
  assert.throws(() => parseRequest({ eventId, bookingId: '../other' }));
});

test('employee alert is server-owned and retry creates no second record', async () => {
  const ctx = setup();
  const body = { eventId: 'safety_event_123456', bookingId: 'job-a', location: {
    latitude: 41.8, longitude: -87.6, capturedAt: NOW.toISOString(),
  } };
  const first = await createSafetyAlert({ admin: ctx.admin, uid: 'employee-a', body, now: NOW });
  const retry = await createSafetyAlert({ admin: ctx.admin, uid: 'employee-a', body, now: NOW });
  assert.deepEqual(retry, first);
  assert.equal(first.status, 'sent');
  assert.equal(ctx.records.size, 1);
  const record = [...ctx.records.values()][0];
  assert.equal(record.employeeUid, 'employee-a');
  assert.equal(record.bookingId, 'job-a');
  assert.equal(record.location.latitude, 41.8);
  assert.equal(record.createdAt, NOW.toISOString());
  assert.equal(JSON.stringify(record).includes('businessPhone'), false);
});

test('denied location can be omitted; other employee cannot hijack event ID', async () => {
  const ctx = setup({ members: ['employee-a', 'employee-b'] });
  const body = { eventId: 'safety_event_123456' };
  await createSafetyAlert({ admin: ctx.admin, uid: 'employee-a', body, now: NOW });
  await createSafetyAlert({ admin: ctx.admin, uid: 'employee-b', body, now: NOW });
  assert.equal(ctx.records.size, 2);
  assert.equal([...ctx.records.values()].every(record => record.location === null), true);
});

test('inactive, nonemployee, no membership, and inaccessible jobs fail closed', async () => {
  const body = { eventId: 'safety_event_123456', bookingId: 'job-a' };
  for (const configuration of [
    { employeeRole: 'customer' }, { employeeStatus: 'inactive' }, { members: [] },
    { booking: { date: '2026-09-26', status: 'scheduled', assignedEmployeeAuthUid: 'employee-b' } },
    { booking: { date: '2026-09-26', status: 'cancelled', assignedEmployeeAuthUid: 'employee-a' } },
    { booking: { date: '2026-09-26', status: 'scheduled', assignedEmployeeAuthUid: 'employee-a', isArchived: true } },
    { booking: { date: '2026-09-26', status: 'scheduled', assignedEmployeeAuthUid: 'employee-a', isDeleted: true } },
    { booking: { date: '2026-09-25', status: 'scheduled', assignedEmployeeAuthUid: 'employee-a' } },
    { booking: null },
  ]) {
    const ctx = setup(configuration);
    await assert.rejects(createSafetyAlert({ admin: ctx.admin, uid: 'employee-a', body, now: NOW }));
    assert.equal(ctx.records.size, 0);
  }
});

test('owner list requires canonical admin membership and stays tenant scoped', async () => {
  const ctx = setup();
  await createSafetyAlert({ admin: ctx.admin, uid: 'employee-a', body: { eventId: 'safety_event_123456' }, now: NOW });
  const result = await listOwnerSafetyAlerts({ admin: ctx.admin, uid: 'owner-a' });
  assert.equal(result.alerts.length, 1);
  assert.equal(result.alerts[0].employeeDisplayName, 'Worker');
  await assert.rejects(listOwnerSafetyAlerts({ admin: ctx.admin, uid: 'employee-a' }));
  await assert.rejects(listOwnerSafetyAlerts({ admin: ctx.admin, uid: 'cross-owner' }));
  const wrongMembership = setup({ adminMembers: [] });
  await assert.rejects(listOwnerSafetyAlerts({ admin: wrongMembership.admin, uid: 'owner-a' }));
});

test('HTTP gateways deny anonymous requests without a Firestore read', async () => {
  const ctx = setup();
  const response = () => ({
    code: 0,
    set() { return this; },
    status(code) { this.code = code; return this; },
    json(value) { this.body = value; return this; },
  });
  const employeeResult = response();
  await createEmployeeSafetyGatewayHandler({ admin: ctx.admin })({ method: 'POST', headers: {}, body: {} }, employeeResult);
  assert.equal(employeeResult.code, 401);
  const ownerResult = response();
  await createOwnerSafetyAlertsGatewayHandler({ admin: ctx.admin })({ method: 'POST', headers: {}, body: {} }, ownerResult);
  assert.equal(ownerResult.code, 401);
  const invalidToken = response();
  await createEmployeeSafetyGatewayHandler({ admin: ctx.admin })({
    method: 'POST', headers: { authorization: 'Bearer invalid' }, body: {},
  }, invalidToken);
  assert.equal(invalidToken.code, 401);
  assert.equal(ctx.paths.length, 0);
});

test('only canonical tenant business phone enters employee packet', () => {
  const booking = { date: '2026-09-26', status: 'scheduled', assignedEmployeeAuthUid: 'employee-a' };
  assert.equal(employeeJobPacket('job-a', booking, 'UTC', '(555) 123-4567').businessPhone, '(555) 123-4567');
  assert.equal(safeBusinessPhone('javascript:alert(1)'), null);
  assert.equal(safeBusinessPhone(`555${' '.repeat(80)}1234567`), null);
  assert.equal(employeeJobPacket('job-a', booking, 'UTC').businessPhone, null);
});

test('employee GET derives phone from its own canonical tenant only', async () => {
  const ctx = setup();
  const employee = await verifyCanonicalEmployee({ admin: ctx.admin, uid: 'employee-a' });
  const result = await getEmployeeJob({ admin: ctx.admin, employee, bookingId: 'job-a', now: NOW });
  assert.equal(result.job.businessPhone, '(555) 123-4567');
  assert.equal(JSON.stringify(result).includes('adminUsers'), false);
  ctx.tenant.businessPhone = 'not a phone';
  const invalidEmployee = await verifyCanonicalEmployee({ admin: ctx.admin, uid: 'employee-a' });
  const invalidResult = await getEmployeeJob({ admin: ctx.admin, employee: invalidEmployee, bookingId: 'job-a', now: NOW });
  assert.equal(invalidResult.job.businessPhone, null);
});
