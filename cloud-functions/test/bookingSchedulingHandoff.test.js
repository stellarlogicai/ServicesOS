const { test } = require('node:test');
const assert = require('node:assert/strict');
const { verifyCanonicalEmployee } = require('../employeeAuthorization');
const { employeeJobPacket, bookingMatchesEmployeeJobVisibility } = require('../employeeJobPacketProjection');
const booking = { date: '2026-10-08', startTime: '00:30', scheduledAt: '2026-10-08T05:30:00.000Z', assignedEmployeeAuthUid: 'synthetic-employee', status: 'scheduled' };
function adminFor(timeZone, profilePatch = {}, tenantPatch = {}) {
  const records = { 'users/synthetic-employee': { role: 'employee', status: 'active', tenantId: 'synthetic-tenant', ...profilePatch }, 'tenants/synthetic-tenant': { users: ['synthetic-employee'], businessSettings: { timeZone }, ...tenantPatch } };
  const ref = path => ({ collection: name => ref(`${path}/${name}`), doc: id => ref(`${path}/${id}`), get: async () => ({ exists: !!records[path], data: () => records[path] }) });
  return { firestore: () => ({ collection: name => ref(name) }) };
}
for (const zone of ['UTC', 'America/Chicago', undefined, 'Invalid/Zone']) {
  test(`employee timezone propagation preserves configured/unavailable distinction: ${zone}`, async () => {
    const employee = await verifyCanonicalEmployee({ admin: adminFor(zone), uid: 'synthetic-employee' });
    assert.equal(employee.tenantTimeZone, zone === undefined || zone === 'Invalid/Zone' ? null : zone);
    assert.equal(employee.uid, 'synthetic-employee');
    assert.equal(employee.tenantId, 'synthetic-tenant');
  });
}
test('tenant-local midnight is projected and visible on its intended day', () => {
  assert.equal(employeeJobPacket('synthetic-booking', booking, 'America/Chicago').schedule.date, booking.date);
  assert.equal(bookingMatchesEmployeeJobVisibility(booking, { uid: 'synthetic-employee', today: booking.date, timeZone: 'America/Chicago' }), true);
});
for (const patch of [{ scheduledAt: '2026-10-08T00:30:00.000Z' }, { scheduledAt: 'invalid' }, { startTime: undefined, scheduledAt: undefined }, { date: '2026-02-30' }]) {
  test(`invalid/conflicting booking cannot fabricate an employee appointment: ${JSON.stringify(patch)}`, () => {
    const record = { ...booking, ...patch };
    assert.equal(employeeJobPacket('synthetic-booking', record, 'America/Chicago').schedule.date, null);
    assert.equal(bookingMatchesEmployeeJobVisibility(record, { uid: 'synthetic-employee', today: '2026-10-08', timeZone: 'America/Chicago' }), false);
  });
}
for (const zone of [null, 'Invalid/Zone']) {
  test(`projection fails safely for unavailable zone: ${zone}`, () => {
    assert.doesNotThrow(() => employeeJobPacket('synthetic-booking', booking, zone));
    assert.equal(employeeJobPacket('synthetic-booking', booking, zone).schedule.date, null);
    assert.equal(bookingMatchesEmployeeJobVisibility(booking, { uid: 'synthetic-employee', today: '2026-10-08', timeZone: zone }), false);
  });
}
test('employee role and membership denials remain unchanged', async () => {
  for (const patch of [{ role: 'customer' }, { status: 'inactive' }, { tenantId: 'foreign-tenant' }]) {
    await assert.rejects(verifyCanonicalEmployee({ admin: adminFor('UTC', patch), uid: 'synthetic-employee' }), { code: 'forbidden' });
  }
  await assert.rejects(verifyCanonicalEmployee({ admin: adminFor('UTC', {}, { users: [] }), uid: 'synthetic-employee' }), { code: 'forbidden' });
});
