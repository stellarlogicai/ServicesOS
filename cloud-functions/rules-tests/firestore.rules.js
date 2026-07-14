const { readFile } = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { after, before, beforeEach, describe, test } = require('node:test');
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} = require('@firebase/rules-unit-testing');
const {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where
} = require('firebase/firestore');

const PROJECT_ID = 'demo-servicesos-rules';
const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
let testEnvironment;

const customerRequest = ({
  tenantId = TENANT_A,
  customerId = 'customer-a',
  authUid = 'customer-a-auth'
} = {}) => ({
  schemaVersion: 1,
  type: 'quote_request',
  source: 'customer-portal',
  status: 'new',
  tenantId,
  customerId,
  propertyId: null,
  createdByAuthUid: authUid,
  formData: { fullName: 'Customer A' },
  estimate: { status: 'pending_owner_review', requiresReview: true },
  aiAnalysis: null,
  booking: null,
  customerSnapshot: { fullName: 'Customer A' },
  propertySnapshot: { address: '1 Test Street' },
  requestSnapshot: { cleaningType: 'standard' },
  review: { requiresOwnerReview: true },
  appointmentRequest: { status: 'pending_review' },
  createdAt: '2026-07-13T12:00:00.000Z',
  updatedAt: '2026-07-13T12:00:00.000Z'
});

async function seedFirestore() {
  await testEnvironment.withSecurityRulesDisabled(async context => {
    const database = context.firestore();

    await setDoc(doc(database, 'tenants', TENANT_A), {
      adminUsers: ['admin-a'],
      users: ['admin-a', 'employee-a']
    });
    await setDoc(doc(database, 'tenants', TENANT_B), {
      adminUsers: ['admin-b'],
      users: ['admin-b', 'employee-b']
    });

    const profiles = {
      'admin-a': { role: 'admin', status: 'active', tenantId: TENANT_A },
      'admin-b': { role: 'admin', status: 'active', tenantId: TENANT_B },
      'customer-a-auth': { role: 'customer', status: 'active', tenantId: TENANT_A },
      'customer-b-auth': { role: 'customer', status: 'active', tenantId: TENANT_A },
      'customer-other-auth': { role: 'customer', status: 'active', tenantId: TENANT_B },
      'employee-a': { role: 'employee', status: 'active', tenantId: TENANT_A }
    };

    for (const [uid, profile] of Object.entries(profiles)) {
      await setDoc(doc(database, 'users', uid), {
        email: `${uid}@example.test`,
        displayName: uid,
        ...profile
      });
    }

    await setDoc(doc(database, 'tenants', TENANT_A, 'customers', 'customer-a'), {
      authUid: 'customer-a-auth',
      status: 'active',
      name: 'Customer A'
    });
    await setDoc(doc(database, 'tenants', TENANT_A, 'customers', 'customer-b'), {
      authUid: 'customer-b-auth',
      status: 'active',
      name: 'Customer B'
    });
    await setDoc(doc(database, 'tenants', TENANT_B, 'customers', 'customer-other'), {
      authUid: 'customer-other-auth',
      status: 'active',
      name: 'Other Tenant Customer'
    });

    await setDoc(
      doc(database, 'tenants', TENANT_A, 'leads', 'request-a'),
      customerRequest()
    );
    await setDoc(
      doc(database, 'tenants', TENANT_A, 'leads', 'request-b'),
      customerRequest({ customerId: 'customer-b', authUid: 'customer-b-auth' })
    );
    await setDoc(doc(database, 'tenants', TENANT_A, 'bookings', 'field-booking'), {
      status: 'scheduled',
      paymentStatus: 'unpaid',
      updatedAt: '2026-07-13T12:00:00.000Z'
    });
  });
}

const authenticatedDatabase = uid =>
  testEnvironment.authenticatedContext(uid, { email: `${uid}@example.test` }).firestore();

describe('tenant-scoped customer intake Firestore rules', () => {
  before(async () => {
    const rules = await readFile(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
    testEnvironment = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules }
    });
  });

  beforeEach(async () => {
    await testEnvironment.clearFirestore();
    await seedFirestore();
  });

  after(async () => {
    await testEnvironment.cleanup();
  });

  test('tenant admin can manage tenant leads and customer records', async () => {
    const database = authenticatedDatabase('admin-a');
    await assertSucceeds(getDoc(doc(database, 'tenants', TENANT_A, 'leads', 'request-a')));
    await assertSucceeds(setDoc(doc(database, 'tenants', TENANT_A, 'leads', 'admin-lead'), {
      type: 'lead', source: 'admin', status: 'new'
    }));
    await assertSucceeds(updateDoc(doc(database, 'tenants', TENANT_A, 'leads', 'request-a'), {
      requestStatus: 'contacted'
    }));
    await assertSucceeds(deleteDoc(doc(database, 'tenants', TENANT_A, 'leads', 'admin-lead')));
    await assertSucceeds(getDoc(doc(database, 'tenants', TENANT_A, 'customers', 'customer-a')));
    await assertSucceeds(updateDoc(doc(database, 'tenants', TENANT_A, 'customers', 'customer-a'), {
      notes: 'Owner note'
    }));
  });

  test('customer can create and read only an owned request in their own tenant', async () => {
    const database = authenticatedDatabase('customer-a-auth');
    const ownRequest = doc(database, 'tenants', TENANT_A, 'leads', 'new-request-a');

    await assertSucceeds(setDoc(ownRequest, customerRequest()));
    await assertSucceeds(getDoc(ownRequest));
    await assertFails(getDoc(doc(database, 'tenants', TENANT_A, 'leads', 'request-b')));
    await assertFails(getDoc(doc(database, 'tenants', TENANT_B, 'leads', 'other-request')));
  });

  test('customer own-request query succeeds while a broad tenant-lead query is denied', async () => {
    const database = authenticatedDatabase('customer-a-auth');
    const leads = collection(database, 'tenants', TENANT_A, 'leads');
    const ownRequests = query(
      leads,
      where('tenantId', '==', TENANT_A),
      where('createdByAuthUid', '==', 'customer-a-auth'),
      where('type', '==', 'quote_request'),
      where('source', '==', 'customer-portal')
    );

    const ownSnapshot = await assertSucceeds(getDocs(ownRequests));
    assert.strictEqual(ownSnapshot.size, 1);
    await assertFails(getDocs(leads));
  });

  test('new users can create only a tenant-bound customer profile, not an admin profile', async () => {
    const customerDatabase = authenticatedDatabase('new-customer');
    const adminDatabase = authenticatedDatabase('spoofed-admin');

    await assertSucceeds(setDoc(doc(customerDatabase, 'users', 'new-customer'), {
      email: 'new-customer@example.test',
      displayName: 'New Customer',
      role: 'customer',
      tenantId: TENANT_A,
      status: 'active',
      createdAt: '2026-07-13T12:00:00.000Z'
    }));
    await assertFails(setDoc(doc(adminDatabase, 'users', 'spoofed-admin'), {
      email: 'spoofed-admin@example.test',
      displayName: 'Spoofed Admin',
      role: 'admin',
      tenantId: TENANT_A,
      status: 'active',
      createdAt: '2026-07-13T12:00:00.000Z'
    }));
  });

  test('customer cannot spoof tenant, authenticated UID, or linked customer', async () => {
    const database = authenticatedDatabase('customer-a-auth');

    await assertFails(setDoc(
      doc(database, 'tenants', TENANT_B, 'leads', 'cross-tenant'),
      customerRequest({ tenantId: TENANT_B, customerId: 'customer-other', authUid: 'customer-a-auth' })
    ));
    await assertFails(setDoc(
      doc(database, 'tenants', TENANT_A, 'leads', 'spoofed-uid'),
      customerRequest({ authUid: 'customer-b-auth' })
    ));
    await assertFails(setDoc(
      doc(database, 'tenants', TENANT_A, 'leads', 'spoofed-customer'),
      customerRequest({ customerId: 'customer-b' })
    ));
  });

  test('customer cannot update or delete a submitted lead', async () => {
    const database = authenticatedDatabase('customer-a-auth');
    const request = doc(database, 'tenants', TENANT_A, 'leads', 'request-a');

    await assertFails(updateDoc(request, { status: 'booked' }));
    await assertFails(deleteDoc(request));
  });

  test('customer can read only their linked customer record and cannot modify it', async () => {
    const database = authenticatedDatabase('customer-a-auth');
    const ownCustomer = doc(database, 'tenants', TENANT_A, 'customers', 'customer-a');

    await assertSucceeds(getDoc(ownCustomer));
    await assertFails(getDoc(doc(database, 'tenants', TENANT_A, 'customers', 'customer-b')));
    await assertFails(updateDoc(ownCustomer, { notes: 'Customer edit' }));
    await assertFails(deleteDoc(ownCustomer));
  });

  test('employee and unauthenticated users cannot access customer-management data', async () => {
    const employeeDatabase = authenticatedDatabase('employee-a');
    const anonymousDatabase = testEnvironment.unauthenticatedContext().firestore();

    await assertFails(getDoc(doc(employeeDatabase, 'tenants', TENANT_A, 'leads', 'request-a')));
    await assertFails(getDoc(doc(employeeDatabase, 'tenants', TENANT_A, 'customers', 'customer-a')));
    await assertFails(getDoc(doc(anonymousDatabase, 'tenants', TENANT_A, 'leads', 'request-a')));
    await assertFails(setDoc(
      doc(anonymousDatabase, 'tenants', TENANT_A, 'leads', 'anonymous-request'),
      customerRequest()
    ));
  });

  test('user cannot change role, tenantId, or status but can update safe profile fields', async () => {
    const database = authenticatedDatabase('customer-a-auth');
    const userProfile = doc(database, 'users', 'customer-a-auth');

    await assertFails(updateDoc(userProfile, { role: 'admin' }));
    await assertFails(updateDoc(userProfile, { tenantId: TENANT_B }));
    await assertFails(updateDoc(userProfile, { status: 'suspended' }));
    await assertSucceeds(updateDoc(userProfile, {
      displayName: 'Updated Customer',
      phone: '555-0100',
      updatedAt: '2026-07-13T13:00:00.000Z'
    }));
  });

  test('Field Mode employee allowlist remains intact', async () => {
    const database = authenticatedDatabase('employee-a');
    const booking = doc(database, 'tenants', TENANT_A, 'bookings', 'field-booking');

    await assertSucceeds(updateDoc(booking, {
      fieldStatus: 'in_progress',
      fieldStatusUpdatedAt: '2026-07-13T13:00:00.000Z',
      updatedAt: '2026-07-13T13:00:00.000Z'
    }));
    await assertFails(updateDoc(booking, { paymentStatus: 'paid_in_full' }));
  });
});
