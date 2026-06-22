// Script to update user role in Firestore
// Run with: node scripts/updateUserRole.js <uid> <role> [tenantId]

const admin = require('firebase-admin');
const serviceAccount = require('../service-account-key.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'cleaning-intake-system'
});

const db = admin.firestore();

async function updateUserRole(uid, role, tenantId = null) {
  try {
    console.log(`Updating user ${uid} to role: ${role}`);
    
    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      console.log('User document does not exist. Creating...');
      await userRef.set({
        email: 'stellar.logic.ai@gmail.com',
        role: role,
        tenantId: tenantId,
        displayName: 'Jamie',
        status: 'active',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log('User document created successfully');
    } else {
      console.log('User document exists. Updating...');
      await userRef.update({
        role: role,
        tenantId: tenantId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log('User document updated successfully');
    }
    
    // Verify the update
    const updatedDoc = await userRef.get();
    console.log('Current user data:', updatedDoc.data());
    
  } catch (error) {
    console.error('Error updating user role:', error);
    process.exit(1);
  }
}

// Get command line arguments
const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: node updateUserRole.js <uid> <role> [tenantId]');
  console.log('Example: node updateUserRole.js yY0eP6RE9BPaiPbW4WSS6Z5rCFU2 super-admin');
  process.exit(1);
}

const uid = args[0];
const role = args[1];
const tenantId = args[2] || null;

// Validate role
const validRoles = ['customer', 'admin', 'super-admin'];
if (!validRoles.includes(role)) {
  console.log(`Invalid role: ${role}. Valid roles are: ${validRoles.join(', ')}`);
  process.exit(1);
}

updateUserRole(uid, role, tenantId).then(() => {
  console.log('User role update completed');
  process.exit(0);
});
