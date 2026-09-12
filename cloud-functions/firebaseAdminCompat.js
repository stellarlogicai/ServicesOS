const { FieldValue } = require('firebase-admin/firestore');

function firestoreServerTimestamp(admin) {
  const implementation = admin?.firestore?.FieldValue || FieldValue;
  if (!implementation?.serverTimestamp) throw new Error('Firebase Admin Firestore FieldValue is unavailable.');
  return implementation.serverTimestamp();
}

module.exports = { firestoreServerTimestamp };
