# Test Login Setup Guide

## Overview

This guide explains how to set up test user accounts for automated and manual testing of the ServicesOS application.

## Prerequisites

- Firebase project access
- Firebase Admin SDK or Firebase Console access
- Node.js environment

## Step 1: Create Test Users in Firebase

### Option A: Using Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Navigate to **Authentication** → **Users**
4. Click **Add user**
5. Create the following test users:

**Test User (Standard Role)**
- Email: `test@example.com`
- Password: `TestPassword123!`
- Role: Customer

**Test Admin (Admin Role)**
- Email: `admin@example.com`
- Password: `AdminPassword123!`
- Role: Admin

**Test Super Admin**
- Email: `superadmin@example.com`
- Password: `SuperAdmin123!`
- Role: Super Admin

### Option B: Using Firebase Admin SDK

Create a script `scripts/createTestUsers.js`:

```javascript
const admin = require('firebase-admin');
const serviceAccount = require('./service-account-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const auth = admin.auth();

async function createTestUsers() {
  const users = [
    {
      email: 'test@example.com',
      password: 'TestPassword123!',
      displayName: 'Test User',
      role: 'customer'
    },
    {
      email: 'admin@example.com',
      password: 'AdminPassword123!',
      displayName: 'Test Admin',
      role: 'admin'
    },
    {
      email: 'superadmin@example.com',
      password: 'SuperAdmin123!',
      displayName: 'Test Super Admin',
      role: 'super-admin'
    }
  ];

  for (const user of users) {
    try {
      const userRecord = await auth.createUser({
        email: user.email,
        password: user.password,
        displayName: user.displayName
      });
      
      // Set custom claims for role
      await auth.setCustomUserClaims(userRecord.uid, {
        role: user.role
      });
      
      console.log(`Created user: ${user.email} with role: ${user.role}`);
    } catch (error) {
      console.error(`Error creating user ${user.email}:`, error);
    }
  }
}

createTestUsers().then(() => process.exit(0));
```

Run the script:
```bash
node scripts/createTestUsers.js
```

## Step 2: Create Test Tenant

Create a test tenant in Firestore for the test users:

```javascript
const admin = require('firebase-admin');
const serviceAccount = require('./service-account-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function createTestTenant() {
  const tenantData = {
    id: 'test_tenant_001',
    businessName: 'Test Cleaning Company',
    businessEmail: 'test@example.com',
    businessPhone: '+1234567890',
    businessAddress: '123 Test Street, Test City, TC 12345',
    subscriptionTier: 'professional',
    status: 'active',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    settings: {
      customBranding: {},
      bookingUrl: '',
      emailFrom: 'test@testcompany.com',
      businessLogo: ''
    },
    limits: {
      users: 10,
      locations: 5
    }
  };

  try {
    await db.collection('tenants').doc('test_tenant_001').set(tenantData);
    console.log('Created test tenant: test_tenant_001');
  } catch (error) {
    console.error('Error creating test tenant:', error);
  }
}

createTestTenant().then(() => process.exit(0));
```

## Step 3: Configure Environment Variables

1. Copy the test environment template:
```bash
cp .env.test.example .env.test
```

2. Fill in your actual Firebase credentials and test user credentials

3. Update `vite.config.js` to load test environment:

```javascript
export default defineConfig({
  // ... existing config
  define: {
    'import.meta.env.VITE_TEST_MODE': JSON.stringify(process.env.VITE_TEST_MODE || 'false')
  }
})
```

## Step 4: Update User Profiles in Firestore

After creating Firebase Auth users, create corresponding Firestore user documents:

```javascript
async function createTestUserProfiles() {
  const users = [
    {
      uid: 'test_user_uid', // Replace with actual UID from Firebase Auth
      email: 'test@example.com',
      displayName: 'Test User',
      role: 'customer',
      tenantId: 'test_tenant_001',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    },
    {
      uid: 'test_admin_uid', // Replace with actual UID from Firebase Auth
      email: 'admin@example.com',
      displayName: 'Test Admin',
      role: 'admin',
      tenantId: 'test_tenant_001',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }
  ];

  for (const user of users) {
    try {
      await db.collection('users').doc(user.uid).set(user);
      console.log(`Created user profile: ${user.email}`);
    } catch (error) {
      console.error(`Error creating user profile ${user.email}:`, error);
    }
  }
}

createTestUserProfiles().then(() => process.exit(0));
```

## Step 5: Test the Setup

### Manual Testing

1. Start the application with test environment:
```bash
npm run dev
```

2. Navigate to `http://localhost:5173`

3. Login with test credentials:
   - Email: `test@example.com`
   - Password: `TestPassword123!`

### Automated Testing with Playwright

Create a test file `tests/login.spec.js`:

```javascript
import { test, expect } from '@playwright/test';

test.describe('Login Tests', () => {
  test('successful login with test user', async ({ page }) => {
    await page.goto('http://localhost:5173');
    
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'TestPassword123!');
    await page.click('button:has-text("Sign In")');
    
    // Wait for navigation to dashboard
    await page.waitForURL('**/dashboard');
    expect(page.url()).toContain('dashboard');
  });

  test('successful login with test admin', async ({ page }) => {
    await page.goto('http://localhost:5173');
    
    await page.fill('input[type="email"]', 'admin@example.com');
    await page.fill('input[type="password"]', 'AdminPassword123!');
    await page.click('button:has-text("Sign In")');
    
    // Wait for navigation to dashboard
    await page.waitForURL('**/dashboard');
    expect(page.url()).toContain('dashboard');
  });
});
```

Run Playwright tests:
```bash
npx playwright test
```

## Test User Roles and Permissions

| User | Email | Role | Permissions |
|------|-------|------|-------------|
| Test User | test@example.com | Customer | View own quotes, create quotes, view own bookings, upload photos |
| Test Admin | admin@example.com | Admin | All customer permissions + manage users, view all data, manage bookings |
| Test Super Admin | superadmin@example.com | Super Admin | All permissions + manage tenants, switch tenants, view all tenants |

## Security Considerations

- **Never commit** `.env.test` to version control
- **Never use** test credentials in production
- **Change** test passwords regularly
- **Limit** test user permissions to only what's needed for testing
- **Delete** test users before production deployment

## Cleanup

To remove test users and data:

```javascript
async function cleanupTestData() {
  // Delete test users from Firebase Auth
  const testEmails = ['test@example.com', 'admin@example.com', 'superadmin@example.com'];
  
  for (const email of testEmails) {
    try {
      const user = await auth.getUserByEmail(email);
      await auth.deleteUser(user.uid);
      console.log(`Deleted user: ${email}`);
    } catch (error) {
      console.error(`Error deleting user ${email}:`, error);
    }
  }

  // Delete test tenant from Firestore
  await db.collection('tenants').doc('test_tenant_001').delete();
  console.log('Deleted test tenant');

  // Delete test user profiles from Firestore
  const testUids = ['test_user_uid', 'test_admin_uid']; // Replace with actual UIDs
  for (const uid of testUids) {
    await db.collection('users').doc(uid).delete();
    console.log(`Deleted user profile: ${uid}`);
  }
}

cleanupTestData().then(() => process.exit(0));
```

## Troubleshooting

### Login Fails with "Invalid Credentials"
- Verify test user exists in Firebase Console
- Check email/password match exactly
- Ensure user is not disabled

### Login Fails with "User Not Found"
- Run user creation script again
- Check Firebase project configuration
- Verify API key is correct

### Permission Errors After Login
- Verify custom claims are set correctly
- Check Firestore user document exists
- Ensure tenant assignment is correct

## Related Documentation

- [TESTING_PLAN.md](./docs/TESTING_PLAN.md)
- [Firebase Authentication](https://firebase.google.com/docs/auth)
- [Firestore Security Rules](../shared/firestore.rules)
