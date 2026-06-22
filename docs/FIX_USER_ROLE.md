# Fix User Role for stellar.logic.ai@gmail.com

## Issue
User stellar.logic.ai@gmail.com (UID: yY0eP6RE9BPaiPbW4WSS6Z5rCFU2) is being routed to customer portal instead of admin dashboard because their role is set to 'customer' in Firestore.

## Solution: Update User Role in Firebase Console

### Step 1: Go to Firebase Console
1. Navigate to https://console.firebase.google.com/
2. Select project: cleaning-intake-system
3. Go to Firestore Database

### Step 2: Update User Document
1. Navigate to collection: `users`
2. Find document: `yY0eP6RE9BPaiPbW4WSS6Z5rCFU2`
3. Update the following fields:
   - `role`: Change from `"customer"` to `"super-admin"`
   - `status`: Ensure it's `"active"`
   - `tenantId`: Set to `null` (for super-admin) or assign to a specific tenant if needed

### Step 3: Verify Changes
After updating, refresh the web app and log in again. You should now see the admin dashboard instead of the customer portal.

## Alternative: Use Firebase Console Shell

If you prefer using the Firebase Console shell:

```javascript
// In Firebase Console → Firestore → Console/Shell
const db = firebase.firestore();

// Update user role
await db.collection('users').doc('yY0eP6RE9BPaiPbW4WSS6Z5rCFU2').update({
  role: 'super-admin',
  status: 'active',
  tenantId: null
});

// Verify
const userDoc = await db.collection('users').doc('yY0eP6RE9BPaiPbW4WSS6Z5rCFU2').get();
console.log(userDoc.data());
```

## Expected Result
After updating the role to `super-admin`, the user will:
- See the tenant management dashboard by default
- Have access to all admin features
- Be able to switch between tenants
- No longer be routed to the customer portal
