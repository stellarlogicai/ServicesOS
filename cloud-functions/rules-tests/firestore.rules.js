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
  serverTimestamp,
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
      businessSettings: {
        businessName: 'Tenant A Cleaning',
        availability: { availableDays: ['monday'] }
      },
      stripeAccountId: 'acct_test_tenant_a',
      chargesEnabled: false,
      payoutsEnabled: false,
      users: [
        'admin-a',
        'employee-a',
        'employee-a-2',
        'employee-no-status',
        'employee-tenantless',
        'employee-inactive',
        'employee-disabled',
        'employee-suspended',
        'unknown-a',
        'missing-profile'
      ]
    });
    await setDoc(doc(database, 'tenants', TENANT_B), {
      adminUsers: ['admin-b'],
      businessSettings: {
        businessName: 'Tenant B Cleaning',
        availability: { availableDays: ['tuesday'] }
      },
      users: ['admin-b', 'employee-b']
    });

    const profiles = {
      'admin-a': { role: 'admin', status: 'active', tenantId: TENANT_A },
      'admin-b': { role: 'admin', status: 'active', tenantId: TENANT_B },
      'customer-a-auth': { role: 'customer', status: 'active', tenantId: TENANT_A },
      'customer-b-auth': { role: 'customer', status: 'active', tenantId: TENANT_A },
      'customer-other-auth': { role: 'customer', status: 'active', tenantId: TENANT_B },
      'employee-a': { role: 'employee', status: 'active', tenantId: TENANT_A },
      'employee-a-2': { role: 'employee', status: 'active', tenantId: TENANT_A },
      'employee-b': { role: 'employee', status: 'active', tenantId: TENANT_B },
      'employee-no-status': { role: 'employee', tenantId: TENANT_A },
      'employee-tenantless': { role: 'employee', status: 'active', tenantId: '' },
      'employee-inactive': { role: 'employee', status: 'inactive', tenantId: TENANT_A },
      'employee-disabled': { role: 'employee', status: 'disabled', tenantId: TENANT_A },
      'employee-suspended': { role: 'employee', status: 'suspended', tenantId: TENANT_A },
      'unknown-a': { role: 'contractor', status: 'active', tenantId: TENANT_A },
      'super-admin': { role: 'super-admin', status: 'active', tenantId: null }
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
      assignedEmployeeAuthUid: 'employee-a',
      updatedAt: '2026-07-13T12:00:00.000Z'
    });
    await setDoc(doc(database, 'tenants', TENANT_A, 'bookings', 'unassigned-booking'), {
      status: 'scheduled',
      updatedAt: '2026-07-13T12:00:00.000Z'
    });
    await setDoc(doc(database, 'tenants', TENANT_A, 'bookings', 'other-assigned-booking'), {
      status: 'scheduled',
      assignedEmployeeAuthUid: 'employee-a-2',
      updatedAt: '2026-07-13T12:00:00.000Z'
    });
    await setDoc(doc(database, 'tenants', TENANT_B, 'bookings', 'other-booking'), {
      status: 'scheduled',
      assignedEmployeeAuthUid: 'employee-b',
      updatedAt: '2026-07-13T12:00:00.000Z'
    });
    await setDoc(doc(database, 'tenants', TENANT_A, 'quotes', 'quote-a'), { status: 'draft' });
    await setDoc(doc(database, 'tenants', TENANT_A, 'jobs', 'job-a'), { status: 'scheduled' });
    await setDoc(doc(database, 'tenants', TENANT_A, 'properties', 'property-a'), { label: 'Property A' });
    await setDoc(doc(database, 'tenants', TENANT_A, 'photos', 'photo-a'), { type: 'legacy' });
    await setDoc(doc(database, 'tenants', TENANT_A, 'appointments', 'appointment-a'), { status: 'scheduled' });
    await setDoc(doc(database, 'tenants', TENANT_A, 'employees', 'staff-a'), { name: 'Staff A' });
    await setDoc(doc(database, 'tenants', TENANT_A, 'payments', 'payment-a'), { status: 'pending' });
    await setDoc(doc(database, 'tenants', TENANT_B, 'payments', 'payment-b'), { status: 'pending' });
    await setDoc(doc(database, 'tenants', TENANT_A, 'branding', 'config'), { primaryColor: '#123456' });
    await setDoc(doc(database, 'tenants', TENANT_A, 'insurance', 'policy'), { status: 'active' });
    await setDoc(doc(database, 'tenants', TENANT_A, 'time_clock', 'clock-a'), { status: 'open' });
    await setDoc(doc(database, 'tenant_usage', TENANT_A), { bookings: 1 });
    await setDoc(doc(database, 'ai_usage', TENANT_A), { estimatedCredits: 0 });
    await setDoc(doc(database, 'ai_credit_history', 'history-a'), { tenantId: TENANT_A });
    await setDoc(doc(database, 'unsafe_global', 'record-a'), { tenantId: TENANT_A });
  });
}

const authenticatedDatabase = uid =>
  testEnvironment.authenticatedContext(uid, { email: `${uid}@example.test` }).firestore();

const fieldPhotoMetadata = ({
  tenantId = TENANT_A,
  bookingId = 'field-booking',
  photoId = 'photo-valid',
  phase = 'before',
  uploadedByUid = 'employee-a',
  contentType = 'image/jpeg',
  extension = 'jpg',
  extra = {},
} = {}) => ({
  id: photoId,
  phase,
  storagePath: `tenants/${tenantId}/bookings/${bookingId}/field-photos/${phase}/${photoId}.${extension}`,
  uploadedAt: serverTimestamp(),
  uploadedByUid,
  fileName: `${phase}-photo.${extension}`,
  contentType,
  sizeBytes: 256,
  ...extra,
});

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

  test('assigned active employee can read booking and use every approved execution field', async () => {
    const database = authenticatedDatabase('employee-a');
    const booking = doc(database, 'tenants', TENANT_A, 'bookings', 'field-booking');

    await assertSucceeds(getDoc(booking));
    await assertSucceeds(updateDoc(booking, {
      fieldStatus: 'in_progress',
      fieldStatusUpdatedAt: '2026-07-13T13:00:00.000Z',
      fieldStartedAt: '2026-07-13T13:00:00.000Z',
      fieldStartedByUid: 'employee-a',
      fieldChecklist: [{ id: 'kitchen', label: 'Kitchen', completed: true }],
      fieldChecklistSummary: { completed: 1, total: 1 },
      fieldNotes: 'Kitchen completed.',
      fieldIssue: 'Back door lock sticks.',
      updatedAt: '2026-07-13T13:00:00.000Z'
    }));
  });

  test('employee cannot read unassigned or another employee booking', async () => {
    const database = authenticatedDatabase('employee-a');
    await assertFails(getDoc(doc(database, 'tenants', TENANT_A, 'bookings', 'unassigned-booking')));
    await assertFails(getDoc(doc(database, 'tenants', TENANT_A, 'bookings', 'other-assigned-booking')));
  });

  test('reassignment revokes the former employee and grants the new employee', async () => {
    const admin = authenticatedDatabase('admin-a');
    const booking = doc(admin, 'tenants', TENANT_A, 'bookings', 'field-booking');
    await assertSucceeds(updateDoc(booking, { assignedEmployeeAuthUid: 'employee-a-2' }));

    await assertFails(getDoc(doc(authenticatedDatabase('employee-a'), 'tenants', TENANT_A, 'bookings', 'field-booking')));
    await assertSucceeds(getDoc(doc(authenticatedDatabase('employee-a-2'), 'tenants', TENANT_A, 'bookings', 'field-booking')));
  });

  test('invalid, tenantless, cross-tenant, unknown-role, and missing employee profiles cannot read Field Mode bookings', async () => {
    const deniedUsers = [
      'employee-no-status',
      'employee-tenantless',
      'employee-inactive',
      'employee-disabled',
      'employee-suspended',
      'employee-b',
      'unknown-a',
      'missing-profile'
    ];

    for (const uid of deniedUsers) {
      const database = authenticatedDatabase(uid);
      await assertFails(getDoc(doc(database, 'tenants', TENANT_A, 'bookings', 'field-booking')));
    }

    const employeeDatabase = authenticatedDatabase('employee-a');
    await assertFails(getDoc(doc(employeeDatabase, 'tenants', TENANT_B, 'bookings', 'other-booking')));
  });

  test('employee booking writes reject price, schedule, customer, payment, Stripe, assignment, delete, and arbitrary fields', async () => {
    const database = authenticatedDatabase('employee-a');
    const booking = doc(database, 'tenants', TENANT_A, 'bookings', 'field-booking');
    const forbiddenPatches = [
      { agreedPrice: 1 },
      { date: '2026-07-14' },
      { scheduledAt: '2026-07-14T09:00:00.000Z' },
      { customerId: 'customer-b' },
      { leadId: 'lead-b' },
      { paymentStatus: 'paid_in_full' },
      { amountReceived: 100 },
      { stripeCheckoutSessionId: 'cs_test_employee' },
      { stripePaymentIntentId: 'pi_test_employee' },
      { assignedEmployeeId: 'employee-b' },
      { assignedEmployeeAuthUid: 'employee-a-2' },
      { assignedEmployees: ['employee-b'] },
      { isDeleted: true },
      { unexpectedField: true }
    ];

    for (const patch of forbiddenPatches) {
      await assertFails(updateDoc(booking, patch));
    }
    await assertFails(deleteDoc(booking));
  });

  test('employee cannot inherit unrelated temporary collection access', async () => {
    const database = authenticatedDatabase('employee-a');
    const deniedPaths = [
      ['tenants', TENANT_A],
      ['tenant_usage', TENANT_A],
      ['tenants', TENANT_A, 'quotes', 'quote-a'],
      ['tenants', TENANT_A, 'jobs', 'job-a'],
      ['tenants', TENANT_A, 'properties', 'property-a'],
      ['tenants', TENANT_A, 'photos', 'photo-a'],
      ['tenants', TENANT_A, 'appointments', 'appointment-a'],
      ['tenants', TENANT_A, 'employees', 'staff-a'],
      ['tenants', TENANT_A, 'payments', 'payment-a'],
      ['tenants', TENANT_A, 'time_clock', 'clock-a']
    ];

    for (const pathParts of deniedPaths) {
      await assertFails(getDoc(doc(database, ...pathParts)));
    }
    await assertFails(setDoc(doc(database, 'tenants', 'employee-created-tenant'), {
      adminUsers: ['employee-a'],
      users: ['employee-a']
    }));
    await assertFails(setDoc(doc(database, 'tenants', TENANT_A, 'payments', 'employee-payment'), {
      status: 'paid'
    }));
  });

  test('employee cannot change own role, tenant, or status', async () => {
    const database = authenticatedDatabase('employee-a');
    const profile = doc(database, 'users', 'employee-a');

    await assertFails(updateDoc(profile, { role: 'admin' }));
    await assertFails(updateDoc(profile, { tenantId: TENANT_B }));
    await assertFails(updateDoc(profile, { status: 'inactive' }));
  });

  test('active matching employee can create and read valid field photo metadata', async () => {
    const database = authenticatedDatabase('employee-a');
    const photo = doc(database, 'tenants', TENANT_A, 'bookings', 'field-booking', 'fieldPhotos', 'photo-valid');

    await assertSucceeds(setDoc(photo, fieldPhotoMetadata()));
    await assertSucceeds(getDoc(photo));
  });

  test('tenant admin can create valid photo metadata without assignment and parent booking stays unchanged', async () => {
    const database = authenticatedDatabase('admin-a');
    const booking = doc(database, 'tenants', TENANT_A, 'bookings', 'unassigned-booking');
    const before = (await getDoc(booking)).data();
    const photo = doc(database, 'tenants', TENANT_A, 'bookings', 'unassigned-booking', 'fieldPhotos', 'admin-photo');

    await assertSucceeds(setDoc(photo, fieldPhotoMetadata({
      bookingId: 'unassigned-booking',
      photoId: 'admin-photo',
      uploadedByUid: 'admin-a',
    })));
    await assertSucceeds(getDoc(photo));

    const after = (await getDoc(booking)).data();
    assert.deepEqual(after, before);
    assert.equal(after.assignedEmployeeAuthUid, undefined);
    await assertFails(getDoc(doc(
      authenticatedDatabase('employee-a-2'),
      'tenants', TENANT_A, 'bookings', 'unassigned-booking'
    )));
  });

  test('tenant admin photo creation remains tenant, identity, path, and metadata scoped', async () => {
    const adminA = authenticatedDatabase('admin-a');
    const adminB = authenticatedDatabase('admin-b');
    const validPath = ['tenants', TENANT_A, 'bookings', 'field-booking', 'fieldPhotos'];

    await assertFails(setDoc(
      doc(adminB, ...validPath, 'cross-tenant-admin'),
      fieldPhotoMetadata({ photoId: 'cross-tenant-admin', uploadedByUid: 'admin-b' })
    ));

    const invalidAdminMetadata = [
      fieldPhotoMetadata({ photoId: 'admin-spoof-user', uploadedByUid: 'employee-a' }),
      fieldPhotoMetadata({ photoId: 'admin-spoof-tenant', uploadedByUid: 'admin-a', extra: {
        storagePath: 'tenants/tenant-b/bookings/field-booking/field-photos/before/admin-spoof-tenant.jpg',
      } }),
      fieldPhotoMetadata({ photoId: 'admin-spoof-booking', uploadedByUid: 'admin-a', extra: {
        storagePath: 'tenants/tenant-a/bookings/other-booking/field-photos/before/admin-spoof-booking.jpg',
      } }),
      fieldPhotoMetadata({ photoId: 'admin-spoof-phase', phase: 'during', uploadedByUid: 'admin-a' }),
      fieldPhotoMetadata({ photoId: 'admin-extra-field', uploadedByUid: 'admin-a', extra: { paymentStatus: 'paid' } }),
    ];

    for (const metadata of invalidAdminMetadata) {
      await assertFails(setDoc(doc(adminA, ...validPath, metadata.id), metadata));
    }
  });

  test('active super-admin can create valid photo metadata within an explicit tenant path', async () => {
    const database = authenticatedDatabase('super-admin');
    const photo = doc(database, 'tenants', TENANT_A, 'bookings', 'unassigned-booking', 'fieldPhotos', 'super-photo');
    await assertSucceeds(setDoc(photo, fieldPhotoMetadata({
      bookingId: 'unassigned-booking',
      photoId: 'super-photo',
      uploadedByUid: 'super-admin',
    })));
  });

  test('field photo metadata access follows booking reassignment', async () => {
    await testEnvironment.withSecurityRulesDisabled(async context => {
      const database = context.firestore();
      await setDoc(doc(database, 'tenants', TENANT_A, 'bookings', 'field-booking', 'fieldPhotos', 'reassigned-photo'), {
        ...fieldPhotoMetadata({ photoId: 'reassigned-photo' }),
        uploadedAt: new Date('2026-07-13T12:00:00.000Z'),
      });
      await updateDoc(doc(database, 'tenants', TENANT_A, 'bookings', 'field-booking'), {
        assignedEmployeeAuthUid: 'employee-a-2',
      });
    });

    const photoPath = ['tenants', TENANT_A, 'bookings', 'field-booking', 'fieldPhotos', 'reassigned-photo'];
    await assertFails(getDoc(doc(authenticatedDatabase('employee-a'), ...photoPath)));
    await assertSucceeds(getDoc(doc(authenticatedDatabase('employee-a-2'), ...photoPath)));
    await assertFails(setDoc(
      doc(authenticatedDatabase('employee-a'), 'tenants', TENANT_A, 'bookings', 'field-booking', 'fieldPhotos', 'former-photo'),
      fieldPhotoMetadata({ photoId: 'former-photo' })
    ));
    await assertSucceeds(setDoc(
      doc(authenticatedDatabase('employee-a-2'), 'tenants', TENANT_A, 'bookings', 'field-booking', 'fieldPhotos', 'new-photo'),
      fieldPhotoMetadata({ photoId: 'new-photo', uploadedByUid: 'employee-a-2' })
    ));
  });

  test('employee cannot spoof field photo identity, path, phase, uploader, size, or arbitrary metadata', async () => {
    const database = authenticatedDatabase('employee-a');
    const invalidCases = [
      fieldPhotoMetadata({ photoId: 'photo-1', extra: { id: 'different-photo' } }),
      fieldPhotoMetadata({ photoId: 'photo-2', uploadedByUid: 'employee-b' }),
      fieldPhotoMetadata({ photoId: 'photo-3', extra: { storagePath: 'tenants/tenant-b/bookings/field-booking/field-photos/before/photo-3.jpg' } }),
      fieldPhotoMetadata({ photoId: 'photo-4', extra: { storagePath: 'tenants/tenant-a/bookings/other-booking/field-photos/before/photo-4.jpg' } }),
      fieldPhotoMetadata({ photoId: 'photo-5', phase: 'during' }),
      fieldPhotoMetadata({ photoId: 'photo-6', extra: { sizeBytes: 0 } }),
      fieldPhotoMetadata({ photoId: 'photo-7', extra: { sizeBytes: (10 * 1024 * 1024) + 1 } }),
      fieldPhotoMetadata({ photoId: 'photo-8', extra: { customerName: 'Not allowed' } }),
      fieldPhotoMetadata({ photoId: 'photo-9', contentType: 'application/pdf', extension: 'pdf' }),
    ];

    for (const metadata of invalidCases) {
      const photo = doc(database, 'tenants', TENANT_A, 'bookings', 'field-booking', 'fieldPhotos', metadata.id === 'different-photo' ? 'photo-1' : metadata.id);
      await assertFails(setDoc(photo, metadata));
    }
  });

  test('employee cannot update or delete persisted field photo metadata', async () => {
    await testEnvironment.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), 'tenants', TENANT_A, 'bookings', 'field-booking', 'fieldPhotos', 'persisted-photo'), {
        ...fieldPhotoMetadata({ photoId: 'persisted-photo' }),
        uploadedAt: new Date('2026-07-13T12:00:00.000Z'),
      });
    });
    const database = authenticatedDatabase('employee-a');
    const photo = doc(database, 'tenants', TENANT_A, 'bookings', 'field-booking', 'fieldPhotos', 'persisted-photo');
    await assertFails(updateDoc(photo, { sizeBytes: 512 }));
    await assertFails(deleteDoc(photo));
  });

  test('field photo metadata reads and creates remain tenant and role scoped', async () => {
    await testEnvironment.withSecurityRulesDisabled(async context => {
      const database = context.firestore();
      await setDoc(doc(database, 'tenants', TENANT_A, 'bookings', 'field-booking', 'fieldPhotos', 'photo-a'), {
        ...fieldPhotoMetadata({ photoId: 'photo-a' }),
        uploadedAt: new Date('2026-07-13T12:00:00.000Z'),
      });
      await setDoc(doc(database, 'tenants', TENANT_B, 'bookings', 'other-booking', 'fieldPhotos', 'photo-b'), {
        ...fieldPhotoMetadata({ tenantId: TENANT_B, bookingId: 'other-booking', photoId: 'photo-b', uploadedByUid: 'employee-b' }),
        uploadedAt: new Date('2026-07-13T12:00:00.000Z'),
      });
    });

    const employeeA = authenticatedDatabase('employee-a');
    const employeeB = authenticatedDatabase('employee-b');
    const customer = authenticatedDatabase('customer-a-auth');
    const adminA = authenticatedDatabase('admin-a');
    const adminB = authenticatedDatabase('admin-b');
    const superAdmin = authenticatedDatabase('super-admin');
    const anonymous = testEnvironment.unauthenticatedContext().firestore();
    const photoAPath = ['tenants', TENANT_A, 'bookings', 'field-booking', 'fieldPhotos', 'photo-a'];

    await assertSucceeds(getDoc(doc(employeeA, ...photoAPath)));
    await assertFails(getDoc(doc(employeeB, ...photoAPath)));
    await assertFails(setDoc(
      doc(employeeB, 'tenants', TENANT_A, 'bookings', 'field-booking', 'fieldPhotos', 'cross-create'),
      fieldPhotoMetadata({ photoId: 'cross-create', uploadedByUid: 'employee-b' })
    ));
    await assertFails(getDoc(doc(customer, ...photoAPath)));
    await assertFails(setDoc(
      doc(customer, 'tenants', TENANT_A, 'bookings', 'field-booking', 'fieldPhotos', 'customer-create'),
      fieldPhotoMetadata({ photoId: 'customer-create', uploadedByUid: 'customer-a-auth' })
    ));
    await assertFails(getDoc(doc(anonymous, ...photoAPath)));
    await assertSucceeds(getDoc(doc(adminA, ...photoAPath)));
    await assertFails(getDoc(doc(adminB, ...photoAPath)));
    await assertSucceeds(getDoc(doc(superAdmin, ...photoAPath)));
  });

  test('customer cannot use employee Field Mode reads or writes', async () => {
    const database = authenticatedDatabase('customer-a-auth');
    const booking = doc(database, 'tenants', TENANT_A, 'bookings', 'field-booking');

    await assertFails(getDoc(booking));
    await assertFails(updateDoc(booking, {
      fieldStatus: 'in_progress',
      fieldStatusUpdatedAt: '2026-07-13T13:00:00.000Z',
      updatedAt: '2026-07-13T13:00:00.000Z'
    }));
  });

  test('tenant admin and super-admin retain intended booking access', async () => {
    const adminDatabase = authenticatedDatabase('admin-a');
    const superDatabase = authenticatedDatabase('super-admin');
    const adminBooking = doc(adminDatabase, 'tenants', TENANT_A, 'bookings', 'field-booking');
    const superBooking = doc(superDatabase, 'tenants', TENANT_A, 'bookings', 'field-booking');

    await assertSucceeds(getDoc(adminBooking));
    await assertSucceeds(updateDoc(adminBooking, { agreedPrice: 225 }));
    await assertSucceeds(getDoc(superBooking));
    await assertSucceeds(updateDoc(superBooking, { status: 'completed' }));
  });

  test('tenant admin can set, change, and clear only valid tenant employee assignments', async () => {
    const adminDatabase = authenticatedDatabase('admin-a');
    const booking = doc(adminDatabase, 'tenants', TENANT_A, 'bookings', 'field-booking');

    await assertSucceeds(updateDoc(booking, { assignedEmployeeAuthUid: 'employee-a-2' }));
    await assertSucceeds(updateDoc(booking, { assignedEmployeeAuthUid: null }));
    await assertFails(updateDoc(booking, { assignedEmployeeAuthUid: 'employee-b' }));
    await assertFails(updateDoc(booking, { assignedEmployeeAuthUid: 'admin-a' }));
    await assertFails(updateDoc(booking, { assignedEmployeeAuthUid: 'customer-a-auth' }));

    const otherAdminBooking = doc(authenticatedDatabase('admin-b'), 'tenants', TENANT_A, 'bookings', 'field-booking');
    await assertFails(updateDoc(otherAdminBooking, { assignedEmployeeAuthUid: 'employee-b' }));
  });

  test('tenant admin can query only active employee profiles for assignment', async () => {
    const adminDatabase = authenticatedDatabase('admin-a');
    const employeeQuery = query(
      collection(adminDatabase, 'users'),
      where('tenantId', '==', TENANT_A),
      where('role', '==', 'employee'),
      where('status', '==', 'active')
    );
    const snapshot = await assertSucceeds(getDocs(employeeQuery));
    assert.deepEqual(snapshot.docs.map(profile => profile.id).sort(), ['employee-a', 'employee-a-2']);
    await assertFails(getDoc(doc(adminDatabase, 'users', 'admin-b')));
    await assertFails(getDoc(doc(adminDatabase, 'users', 'employee-b')));
  });

  test('tenant admin can read and update only approved Business Settings fields', async () => {
    const adminDatabase = authenticatedDatabase('admin-a');
    const otherAdminDatabase = authenticatedDatabase('admin-b');
    const tenant = doc(adminDatabase, 'tenants', TENANT_A);

    await assertSucceeds(getDoc(tenant));
    await assertSucceeds(updateDoc(tenant, {
      businessSettings: {
        businessName: 'Updated Tenant A Cleaning',
        businessPhone: '555-0100',
        businessEmail: 'owner@example.test',
        serviceArea: 'Metro area',
        businessAddress: '1 Main Street',
        websiteUrl: 'https://example.test',
        facebookUrl: '',
        defaultServiceNotes: 'Use side entrance.',
        availability: { availableDays: ['monday', 'tuesday'] }
      },
      updatedAt: '2026-07-13T14:00:00.000Z',
      updatedByUid: 'admin-a'
    }));

    await assertFails(updateDoc(tenant, { adminUsers: ['admin-a', 'employee-a'] }));
    await assertFails(updateDoc(tenant, { users: ['admin-a'] }));
    await assertFails(updateDoc(tenant, { stripeAccountId: 'acct_spoofed' }));
    await assertFails(updateDoc(tenant, { chargesEnabled: true }));
    await assertFails(updateDoc(tenant, { updatedByUid: 'admin-b' }));
    await assertFails(getDoc(doc(otherAdminDatabase, 'tenants', TENANT_A)));
  });

  test('employees and customers cannot create tenants or read tenant administration data', async () => {
    for (const uid of ['employee-a', 'customer-a-auth']) {
      const database = authenticatedDatabase(uid);
      await assertFails(getDoc(doc(database, 'tenants', TENANT_A)));
      await assertFails(setDoc(doc(database, 'tenants', `${uid}-tenant`), {
        adminUsers: [uid],
        users: [uid]
      }));
    }

    const anonymousDatabase = testEnvironment.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anonymousDatabase, 'tenants', TENANT_A)));
  });

  test('tenant payment documents are admin-readable but client-immutable', async () => {
    const adminA = authenticatedDatabase('admin-a');
    const adminB = authenticatedDatabase('admin-b');
    const superAdmin = authenticatedDatabase('super-admin');
    const paymentA = doc(adminA, 'tenants', TENANT_A, 'payments', 'payment-a');

    await assertSucceeds(getDoc(paymentA));
    await assertSucceeds(getDoc(doc(superAdmin, 'tenants', TENANT_A, 'payments', 'payment-a')));
    await assertFails(getDoc(doc(adminB, 'tenants', TENANT_A, 'payments', 'payment-a')));
    await assertFails(getDoc(doc(authenticatedDatabase('employee-a'), 'tenants', TENANT_A, 'payments', 'payment-a')));
    await assertFails(getDoc(doc(authenticatedDatabase('customer-a-auth'), 'tenants', TENANT_A, 'payments', 'payment-a')));
    await assertFails(setDoc(doc(adminA, 'tenants', TENANT_A, 'payments', 'fabricated'), { status: 'paid' }));
    await assertFails(updateDoc(paymentA, { status: 'paid' }));
    await assertFails(deleteDoc(paymentA));
  });

  test('tenant admin can create the proven quote-to-booking shape without trusted payment fields', async () => {
    const database = authenticatedDatabase('admin-a');
    const safeBooking = doc(database, 'tenants', TENANT_A, 'bookings', 'new-safe-booking');

    await assertSucceeds(setDoc(safeBooking, {
      schemaVersion: 1,
      tenantId: TENANT_A,
      leadId: 'request-a',
      sourceLeadId: 'request-a',
      source: 'customer-portal',
      customerId: 'customer-a',
      propertyId: null,
      customerName: 'Customer A',
      customerSnapshot: { name: 'Customer A' },
      propertySnapshot: { address: '1 Test Street' },
      requestSnapshot: { cleaningType: 'standard' },
      appointmentRequest: null,
      date: '2026-07-20',
      startTime: '09:00',
      endTime: '11:00',
      scheduledAt: '2026-07-20T14:00:00.000Z',
      agreedPrice: 190,
      status: 'scheduled',
      serviceType: 'standard',
      address: '1 Test Street',
      notes: '',
      createdBy: 'admin-a',
      createdAt: '2026-07-13T14:00:00.000Z',
      updatedAt: '2026-07-13T14:00:00.000Z'
    }));

    await assertFails(setDoc(doc(database, 'tenants', TENANT_A, 'bookings', 'spoofed-stripe-booking'), {
      tenantId: TENANT_A,
      status: 'scheduled',
      stripeCheckoutSessionId: 'cs_test_spoofed'
    }));
    await assertFails(setDoc(doc(database, 'tenants', TENANT_A, 'bookings', 'wrong-tenant-booking'), {
      tenantId: TENANT_B,
      status: 'scheduled'
    }));
  });

  test('manual booking payment updates require the acting admin and cannot fabricate Stripe confirmation', async () => {
    const database = authenticatedDatabase('admin-a');
    const booking = doc(database, 'tenants', TENANT_A, 'bookings', 'field-booking');

    await assertSucceeds(updateDoc(booking, {
      paymentStatus: 'paid_cash',
      paymentStatusUpdatedAt: '2026-07-13T14:00:00.000Z',
      paymentMethod: 'cash',
      amountReceived: 190,
      receivedAt: '2026-07-13T14:00:00.000Z',
      paymentNote: 'Paid at the job.',
      paymentStatusUpdatedBy: 'admin-a',
      updatedAt: '2026-07-13T14:00:00.000Z'
    }));

    await assertFails(updateDoc(booking, {
      paymentStatus: 'paid_in_full',
      paymentStatusUpdatedBy: 'stripe_webhook'
    }));
    await assertFails(updateDoc(booking, { stripeCheckoutSessionId: 'cs_test_spoofed' }));
    await assertFails(updateDoc(booking, { stripePaymentIntentId: 'pi_test_spoofed' }));
    await assertFails(updateDoc(booking, { platformFee: 20 }));
    await assertFails(updateDoc(booking, { refundStatus: 'succeeded' }));
  });

  test('only super-admin can use mounted compatibility and global administration paths', async () => {
    const superAdmin = authenticatedDatabase('super-admin');
    const admin = authenticatedDatabase('admin-a');
    const employee = authenticatedDatabase('employee-a');
    const customer = authenticatedDatabase('customer-a-auth');
    const mountedPaths = [
      ['tenants', TENANT_A, 'employees', 'staff-a'],
      ['tenants', TENANT_A, 'branding', 'config'],
      ['tenants', TENANT_A, 'insurance', 'policy'],
      ['tenant_usage', TENANT_A],
      ['ai_usage', TENANT_A],
      ['ai_credit_history', 'history-a']
    ];

    for (const pathParts of mountedPaths) {
      await assertSucceeds(getDoc(doc(superAdmin, ...pathParts)));
      await assertFails(getDoc(doc(admin, ...pathParts)));
      await assertFails(getDoc(doc(employee, ...pathParts)));
      await assertFails(getDoc(doc(customer, ...pathParts)));
    }

    await assertSucceeds(setDoc(doc(superAdmin, 'tenants', TENANT_A, 'employees', 'staff-new'), { name: 'New Staff' }));
    await assertFails(setDoc(doc(admin, 'tenants', TENANT_A, 'employees', 'staff-admin'), { name: 'Unsafe Staff' }));

    const superRouteBooking = doc(superAdmin, 'tenants', TENANT_A, 'bookings', 'field-booking');
    const adminRouteBooking = doc(admin, 'tenants', TENANT_A, 'bookings', 'field-booking');
    await assertSucceeds(updateDoc(superRouteBooking, {
      routeOrder: 1,
      estimatedTravelTime: 12,
      distanceFromPrevious: 4.2
    }));
    await assertFails(updateDoc(adminRouteBooking, {
      routeOrder: 2,
      estimatedTravelTime: 18,
      distanceFromPrevious: 7.5
    }));
  });

  test('stale tenant paths, DEFAULT tenant, and unknown global paths are denied to every client role', async () => {
    const stalePaths = [
      ['tenants', TENANT_A, 'quotes', 'quote-a'],
      ['tenants', TENANT_A, 'jobs', 'job-a'],
      ['tenants', TENANT_A, 'properties', 'property-a'],
      ['tenants', TENANT_A, 'photos', 'photo-a'],
      ['tenants', TENANT_A, 'appointments', 'appointment-a'],
      ['tenants', TENANT_A, 'time_clock', 'clock-a'],
      ['unsafe_global', 'record-a']
    ];

    for (const uid of ['super-admin', 'admin-a', 'employee-a', 'customer-a-auth']) {
      const database = authenticatedDatabase(uid);
      for (const pathParts of stalePaths) {
        await assertFails(getDoc(doc(database, ...pathParts)));
      }
      await assertFails(setDoc(doc(database, 'tenants', 'DEFAULT', 'leads', `${uid}-lead`), {
        type: 'lead',
        status: 'new'
      }));
    }
  });
});
