const test = require('node:test');
const assert = require('node:assert/strict');
const { canonicalJobScopeSnapshot, scopeHash, scopeSummary } = require('../jobScopeControl');
const { approveScopeRecord, parseRequest } = require('../jobScopeGateway');

const base = overrides => ({
  bookingType: 'residential', customerName: 'Customer', address: '1 Main St', serviceType: 'Deep clean',
  date: '2026-09-20', startTime: '09:00', agreedPrice: 200,
  requestSnapshot: { serviceScope: { oven: true, fridge: false }, specialRequests: 'Focus on kitchen' },
  jobChecklistSnapshot: { items: [{ id: 'kitchen', label: 'Clean kitchen', area: 'Kitchen', required: true }] },
  ...overrides,
});

test('residential booking produces bounded canonical scope', () => {
  const scope = canonicalJobScopeSnapshot('booking-a', base());
  assert.equal(scope.bookingType, 'residential');
  assert.equal(scope.price, 200);
  assert.deepEqual(scope.selectedAddOns, ['oven']);
  assert.deepEqual(scope.serviceItems, [{ id: 'kitchen', label: 'Clean kitchen', area: 'Kitchen', required: true }]);
});

test('commercial booking uses the same canonical scope model', () => {
  const scope = canonicalJobScopeSnapshot('booking-b', base({
    bookingType: 'commercial', commercialDetails: { areasToClean: 'Lobby and offices' }, requestSnapshot: {},
  }));
  assert.equal(scope.bookingType, 'commercial');
  assert.equal(scope.scopeNotes, 'Lobby and offices');
});

test('legacy booking stays readable without fabricated type', () => {
  assert.equal(canonicalJobScopeSnapshot('legacy', base({ bookingType: undefined })).bookingType, 'legacy');
});

test('scope hash is deterministic and changes for material scope edits', () => {
  const original = canonicalJobScopeSnapshot('b', base());
  assert.equal(scopeHash(original), scopeHash({ ...original, schedule: { ...original.schedule } }));
  assert.notEqual(scopeHash(original), scopeHash({ ...original, price: 250 }));
});

test('approved scope requires approval again when current material hash changes', () => {
  const approved = scopeHash(canonicalJobScopeSnapshot('b', base()));
  const control = { state: 'approved', latestVersion: 1, approvedVersion: 1, approvedScopeHash: approved, approvedAt: 'time' };
  assert.equal(scopeSummary(control, approved).state, 'approved');
  assert.equal(scopeSummary(control, scopeHash(canonicalJobScopeSnapshot('b', base({ agreedPrice: 250 })))).state, 'approval_required');
});

test('request parser rejects injected identity and approval evidence', () => {
  assert.deepEqual(parseRequest({ action: 'owner_get', bookingId: ' b ' }), { action: 'owner_get', bookingId: 'b' });
  for (const body of [
    { action: 'owner_request', bookingId: 'b', uid: 'x' },
    { action: 'customer_approve', bookingId: 'b', version: 1, affirmativeAcceptance: true, approvedAt: 'fake' },
    { action: 'customer_approve', bookingId: 'b', version: 1, affirmativeAcceptance: false },
  ]) assert.throws(() => parseRequest(body));
});

test('customer approval records immutable server evidence and preserves snapshot', async () => {
  const snapshot = canonicalJobScopeSnapshot('booking-a', base());
  const hash = scopeHash(snapshot);
  const booking = { customerId: 'customer-a', ...base(), jobScopeControl: { state: 'awaiting_approval', latestVersion: 1, latestScopeHash: hash } };
  const record = { version: 1, state: 'awaiting_approval', scopeHash: hash, snapshot };
  const updates = [];
  const versionRef = { kind: 'version' };
  const bookingRef = { kind: 'booking', collection: () => ({ doc: () => versionRef }) };
  const db = {
    collection: () => ({ doc: () => ({ collection: () => ({ doc: () => bookingRef }) }) }),
    runTransaction: callback => callback({
      get: async ref => ref.kind === 'booking'
        ? { exists: true, data: () => booking }
        : { exists: true, data: () => record },
      update: (ref, patch) => updates.push([ref.kind, patch]),
    }),
  };
  const admin = { firestore: () => db };
  const result = await approveScopeRecord({ admin, context: { uid: 'customer-uid', tenantId: 'tenant-a' }, bookingId: 'booking-a', version: 1, customer: { id: 'customer-a' } });
  assert.equal(result.scope.state, 'approved');
  assert.deepEqual(record.snapshot, snapshot);
  assert.equal(updates[0][1].approvedByCustomerUid, 'customer-uid');
  assert.equal(updates[1][1].approvedJobScope.snapshot, snapshot);
});
