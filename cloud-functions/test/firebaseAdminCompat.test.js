const assert = require('node:assert/strict');
const { test } = require('node:test');
const { firestoreServerTimestamp } = require('../firebaseAdminCompat');

test('uses an injected legacy Firestore FieldValue static when available', () => {
  const existing = { serverTimestamp: () => 'existing' };
  const firestore = () => {};
  firestore.FieldValue = existing;
  assert.equal(firestoreServerTimestamp({ firestore }), 'existing');
});

test('uses the modular Admin Firestore export when the emulator omits the legacy static', () => {
  const value = firestoreServerTimestamp({ firestore: () => {} });
  assert.equal(value?.constructor?.name, 'ServerTimestampTransform');
});
