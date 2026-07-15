const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { after, before, beforeEach, describe, test } = require('node:test');
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} = require('@firebase/rules-unit-testing');

const PROJECT_ID = 'demo-servicesos-rules';
const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const PHOTO_PATH = `tenants/${TENANT_A}/bookings/booking-a/field-photos/before/photo-a.jpg`;
const BRANDING_PATH = `tenants/${TENANT_A}/branding/logo_test.png`;
let testEnvironment;
let storageRulesSource;

async function seedAccessData() {
  await testEnvironment.withSecurityRulesDisabled(async context => {
    const database = context.firestore();
    await database.doc(`tenants/${TENANT_A}`).set({
      adminUsers: ['admin-a', 'admin-inactive', 'admin-like'],
      users: ['admin-a', 'admin-inactive', 'admin-like', 'employee-a', 'employee-a-2', 'employee-inactive', 'employee-disabled', 'employee-suspended', 'employee-tenantless'],
    });
    await database.doc(`tenants/${TENANT_B}`).set({
      adminUsers: ['admin-b'],
      users: ['admin-b', 'employee-b'],
    });
    const profiles = {
      'admin-a': { role: 'admin', status: 'active', tenantId: TENANT_A },
      'admin-b': { role: 'admin', status: 'active', tenantId: TENANT_B },
      'admin-inactive': { role: 'admin', status: 'inactive', tenantId: TENANT_A },
      'admin-like': { role: 'contractor', status: 'active', tenantId: TENANT_A },
      'employee-a': { role: 'employee', status: 'active', tenantId: TENANT_A },
      'employee-a-2': { role: 'employee', status: 'active', tenantId: TENANT_A },
      'employee-b': { role: 'employee', status: 'active', tenantId: TENANT_B },
      'employee-inactive': { role: 'employee', status: 'inactive', tenantId: TENANT_A },
      'employee-disabled': { role: 'employee', status: 'disabled', tenantId: TENANT_A },
      'employee-suspended': { role: 'employee', status: 'suspended', tenantId: TENANT_A },
      'employee-tenantless': { role: 'employee', status: 'active', tenantId: '' },
      'customer-a': { role: 'customer', status: 'active', tenantId: TENANT_A },
      'unknown-a': { role: 'contractor', status: 'active', tenantId: TENANT_A },
      'super-admin': { role: 'super-admin', status: 'active', tenantId: null },
    };
    for (const [uid, profile] of Object.entries(profiles)) {
      await database.doc(`users/${uid}`).set(profile);
    }
    await database.doc(`tenants/${TENANT_A}/bookings/booking-a`).set({
      status: 'scheduled',
      assignedEmployeeAuthUid: 'employee-a',
    });
    await database.doc(`tenants/${TENANT_A}/bookings/unassigned-booking`).set({
      status: 'scheduled',
    });
    await database.doc(`tenants/${TENANT_A}/bookings/completed-booking`).set({
      status: 'completed',
      assignedEmployeeAuthUid: 'employee-a',
    });
    await database.doc(`tenants/${TENANT_A}/bookings/cancelled-booking`).set({
      status: 'cancelled',
      assignedEmployeeAuthUid: 'employee-a',
    });
    await database.doc(`tenants/${TENANT_A}/bookings/archived-booking`).set({
      status: 'scheduled',
      assignedEmployeeAuthUid: 'employee-a',
      isArchived: true,
    });
    await database.doc(`tenants/${TENANT_A}/bookings/deleted-booking`).set({
      status: 'scheduled',
      assignedEmployeeAuthUid: 'employee-a',
      isDeleted: true,
    });
    await database.doc(`tenants/${TENANT_B}/bookings/booking-b`).set({
      status: 'scheduled',
      assignedEmployeeAuthUid: 'employee-b',
    });
  });
}

const storageFor = uid => testEnvironment.authenticatedContext(uid).storage();
const upload = (uid, objectPath, contentType, bytes = 32) => storageFor(uid)
  .ref(objectPath)
  .put(new Uint8Array(bytes), { contentType });

function ruleFunctionSource(functionName) {
  const match = storageRulesSource.match(new RegExp(`function ${functionName}\\([^)]*\\) \\{[\\s\\S]*?\\n    \\}`));
  assert.ok(match, `${functionName} must exist in the deployed Storage rules source`);
  return match[0];
}

describe('tenant-scoped Field Mode Storage rules', () => {
  before(async () => {
    const [firestoreRules, storageRules] = await Promise.all([
      readFile(path.join(__dirname, '..', 'firestore.rules'), 'utf8'),
      readFile(path.join(__dirname, '..', 'storage.rules'), 'utf8'),
    ]);
    storageRulesSource = storageRules;
    testEnvironment = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules: firestoreRules },
      storage: { rules: storageRules },
    });
  });

  beforeEach(async () => {
    await testEnvironment.clearStorage();
    await testEnvironment.clearFirestore();
    await seedAccessData();
  });

  test('field-photo authorization has exactly one profile and one booking lookup', () => {
    const accessSource = ruleFunctionSource('canAccessFieldPhoto');
    const profileSource = ruleFunctionSource('userProfileDocument');
    const bookingSource = ruleFunctionSource('bookingDocument');
    const accessCalls = accessSource.match(/\b(?:userProfileDocument|bookingDocument|tenantExists|tenantRecord)\(/g) || [];
    const firestoreCalls = `${profileSource}\n${bookingSource}`.match(/firestore\.(?:get|exists)\(/g) || [];

    assert.deepEqual(accessCalls, ['userProfileDocument(', 'bookingDocument(']);
    assert.equal(firestoreCalls.length, 2);
    assert.doesNotMatch(accessSource, /tenantExists|tenantRecord/);
    assert.match(storageRulesSource, /allow read: if isAllowedPhase\(phase\) &&\s+isAuthenticated\(\) &&\s+canAccessFieldPhoto/);
    assert.match(storageRulesSource, /allow create: if isAllowedPhase\(phase\) &&\s+isAuthenticated\(\) &&\s+canAccessFieldPhoto/);
  });

  after(async () => {
    await testEnvironment.cleanup();
  });

  test('active matching employee can create supported before and after evidence', async () => {
    await assertSucceeds(upload('employee-a', PHOTO_PATH, 'image/jpeg'));
    await assertSucceeds(upload(
      'employee-a',
      `tenants/${TENANT_A}/bookings/booking-a/field-photos/after/photo-b.png`,
      'image/png'
    ));
    await assertSucceeds(upload(
      'employee-a',
      `tenants/${TENANT_A}/bookings/booking-a/field-photos/after/photo-c.webp`,
      'image/webp'
    ));
  });

  test('tenant admin and super-admin can upload within a tenant path without employee assignment', async () => {
    const unassignedAdminPath = `tenants/${TENANT_A}/bookings/unassigned-booking/field-photos/before/admin-photo.jpg`;
    const superAdminPath = `tenants/${TENANT_A}/bookings/unassigned-booking/field-photos/after/super-photo.png`;
    await assertSucceeds(upload('admin-a', unassignedAdminPath, 'image/jpeg'));
    await assertSucceeds(storageFor('admin-a').ref(unassignedAdminPath).getDownloadURL());
    await assertSucceeds(upload('super-admin', superAdminPath, 'image/png'));
    await assertSucceeds(storageFor('super-admin').ref(superAdminPath).getDownloadURL());
    await assertFails(upload('admin-b', unassignedAdminPath.replace('admin-photo', 'cross-admin'), 'image/jpeg'));
  });

  test('inactive and admin-like tenant members cannot create or read field photos', async () => {
    await testEnvironment.withSecurityRulesDisabled(async context => {
      await context.storage().ref(PHOTO_PATH).put(new Uint8Array(32), { contentType: 'image/jpeg' });
    });

    for (const uid of ['admin-inactive', 'admin-like']) {
      await assertFails(upload(uid, `tenants/${TENANT_A}/bookings/unassigned-booking/field-photos/before/${uid}.jpg`, 'image/jpeg'));
      await assertFails(storageFor(uid).ref(PHOTO_PATH).getDownloadURL());
    }
  });

  test('employee upload rejects unsupported type, extension mismatch, zero bytes, and over 10 MB', async () => {
    await assertFails(upload('employee-a', `${PHOTO_PATH}.pdf`, 'application/pdf'));
    await assertFails(upload('employee-a', PHOTO_PATH, 'image/png'));
    await assertFails(upload('employee-a', PHOTO_PATH, 'image/jpeg', 0));
    await assertFails(upload('employee-a', PHOTO_PATH, 'image/jpeg', (10 * 1024 * 1024) + 1));
  });

  test('employee upload rejects another tenant, invalid phase, DEFAULT tenant, and legacy global path', async () => {
    await assertFails(upload('employee-a', `tenants/${TENANT_B}/bookings/booking-b/field-photos/before/photo.jpg`, 'image/jpeg'));
    await assertFails(upload('employee-a', `tenants/${TENANT_A}/bookings/booking-a/field-photos/during/photo.jpg`, 'image/jpeg'));
    await assertFails(upload('employee-a', 'tenants/DEFAULT/bookings/booking-a/field-photos/before/photo.jpg', 'image/jpeg'));
    await assertFails(upload('employee-a', 'jobPhotos/booking-a/photo.jpg', 'image/jpeg'));
  });

  test('employee access requires exact assignment and an active non-archived booking', async () => {
    const deniedBookings = ['unassigned-booking', 'cancelled-booking', 'archived-booking', 'deleted-booking'];
    await testEnvironment.withSecurityRulesDisabled(async context => {
      for (const bookingId of deniedBookings) {
        await context.storage().ref(`tenants/${TENANT_A}/bookings/${bookingId}/field-photos/before/existing.jpg`)
          .put(new Uint8Array(32), { contentType: 'image/jpeg' });
      }
    });

    for (const bookingId of deniedBookings) {
      const basePath = `tenants/${TENANT_A}/bookings/${bookingId}/field-photos/before`;
      await assertFails(storageFor('employee-a').ref(`${basePath}/existing.jpg`).getDownloadURL());
      await assertFails(upload('employee-a', `${basePath}/new.jpg`, 'image/jpeg'));
    }
  });

  test('assigned employee can create and read evidence for a completed booking', async () => {
    const completedPath = `tenants/${TENANT_A}/bookings/completed-booking/field-photos/after/completed.png`;
    await assertSucceeds(upload('employee-a', completedPath, 'image/png'));
    await assertSucceeds(storageFor('employee-a').ref(completedPath).getDownloadURL());
  });

  test('inactive, disabled, suspended, tenantless, and cross-tenant employees cannot upload', async () => {
    for (const uid of ['employee-inactive', 'employee-disabled', 'employee-suspended', 'employee-tenantless', 'employee-b']) {
      await assertFails(upload(uid, PHOTO_PATH, 'image/jpeg'));
    }
  });

  test('customer and anonymous users cannot upload or read evidence', async () => {
    await testEnvironment.withSecurityRulesDisabled(async context => {
      await context.storage().ref(PHOTO_PATH).put(new Uint8Array(32), { contentType: 'image/jpeg' });
    });
    await assertFails(upload('customer-a', `tenants/${TENANT_A}/bookings/booking-a/field-photos/before/customer.jpg`, 'image/jpeg'));
    await assertFails(storageFor('customer-a').ref(PHOTO_PATH).getDownloadURL());
    const anonymous = testEnvironment.unauthenticatedContext().storage();
    await assertFails(anonymous.ref(`tenants/${TENANT_A}/bookings/booking-a/field-photos/before/anonymous.jpg`).put(new Uint8Array(32), { contentType: 'image/jpeg' }));
    await assertFails(anonymous.ref(PHOTO_PATH).getDownloadURL());
  });

  test('customer path guessing and missing booking paths remain denied', async () => {
    const guessedPath = `tenants/${TENANT_A}/bookings/missing-booking/field-photos/before/guessed.jpg`;
    await assertFails(upload('customer-a', guessedPath, 'image/jpeg'));
    await assertFails(storageFor('customer-a').ref(guessedPath).getDownloadURL());
    await assertFails(upload('admin-a', guessedPath, 'image/jpeg'));
  });

  test('tenant admin, matching employee, and super-admin can read while another tenant admin cannot', async () => {
    await testEnvironment.withSecurityRulesDisabled(async context => {
      await context.storage().ref(PHOTO_PATH).put(new Uint8Array(32), { contentType: 'image/jpeg' });
    });
    await assertSucceeds(storageFor('admin-a').ref(PHOTO_PATH).getDownloadURL());
    await assertSucceeds(storageFor('employee-a').ref(PHOTO_PATH).getDownloadURL());
    await assertSucceeds(storageFor('super-admin').ref(PHOTO_PATH).getDownloadURL());
    await assertFails(storageFor('admin-b').ref(PHOTO_PATH).getDownloadURL());
    await assertFails(storageFor('employee-b').ref(PHOTO_PATH).getDownloadURL());
    await assertFails(storageFor('employee-a-2').ref(PHOTO_PATH).getDownloadURL());
  });

  test('reassignment revokes former employee photo access and grants the new employee', async () => {
    await testEnvironment.withSecurityRulesDisabled(async context => {
      await context.storage().ref(PHOTO_PATH).put(new Uint8Array(32), { contentType: 'image/jpeg' });
      await context.firestore().doc(`tenants/${TENANT_A}/bookings/booking-a`).update({
        assignedEmployeeAuthUid: 'employee-a-2',
      });
    });

    await assertFails(storageFor('employee-a').ref(PHOTO_PATH).getDownloadURL());
    await assertFails(upload('employee-a', `tenants/${TENANT_A}/bookings/booking-a/field-photos/after/former.jpg`, 'image/jpeg'));
    await assertSucceeds(storageFor('employee-a-2').ref(PHOTO_PATH).getDownloadURL());
    await assertSucceeds(upload('employee-a-2', `tenants/${TENANT_A}/bookings/booking-a/field-photos/after/new.jpg`, 'image/jpeg'));
  });

  test('successful evidence cannot be overwritten or deleted by an employee', async () => {
    const protectedPath = `tenants/${TENANT_A}/bookings/booking-a/field-photos/before/photo-protected.jpg`;
    await assertSucceeds(upload('employee-a', protectedPath, 'image/jpeg'));
    const employeePhoto = storageFor('employee-a').ref(protectedPath);
    await assertFails(employeePhoto.put(new Uint8Array(64), { contentType: 'image/jpeg' }));
    await assertFails(employeePhoto.delete());
  });

  test('tenant admin cannot overwrite or delete persisted evidence', async () => {
    const protectedPath = `tenants/${TENANT_A}/bookings/booking-a/field-photos/before/admin-protected.jpg`;
    await assertSucceeds(upload('admin-a', protectedPath, 'image/jpeg'));
    const adminPhoto = storageFor('admin-a').ref(protectedPath);
    await assertFails(adminPhoto.put(new Uint8Array(64), { contentType: 'image/jpeg' }));
    await assertFails(adminPhoto.delete());
  });

  test('mounted branding storage is limited to active super-admin image uploads', async () => {
    await assertSucceeds(upload('super-admin', BRANDING_PATH, 'image/png'));
    await assertSucceeds(upload('super-admin', `tenants/${TENANT_A}/branding/favicon_test.ico`, 'image/x-icon'));
    await assertSucceeds(storageFor('super-admin').ref(BRANDING_PATH).getDownloadURL());

    for (const uid of ['admin-a', 'employee-a', 'customer-a', 'admin-b']) {
      await assertFails(upload(uid, `tenants/${TENANT_A}/branding/${uid}.png`, 'image/png'));
      await assertFails(storageFor(uid).ref(BRANDING_PATH).getDownloadURL());
    }
  });

  test('branding uploads reject arbitrary documents, zero bytes, oversized objects, and DEFAULT tenant', async () => {
    await assertFails(upload('super-admin', `tenants/${TENANT_A}/branding/logo.pdf`, 'application/pdf'));
    await assertFails(upload('super-admin', `tenants/${TENANT_A}/branding/logo.svg`, 'image/svg+xml'));
    await assertFails(upload('super-admin', `tenants/${TENANT_A}/branding/empty.png`, 'image/png', 0));
    await assertFails(upload('super-admin', `tenants/${TENANT_A}/branding/large.png`, 'image/png', (5 * 1024 * 1024) + 1));
    await assertFails(upload('super-admin', 'tenants/DEFAULT/branding/logo.png', 'image/png'));
  });

  test('persisted branding cannot be overwritten or deleted through client rules', async () => {
    await testEnvironment.withSecurityRulesDisabled(async context => {
      await context.storage().ref(BRANDING_PATH).put(new Uint8Array(32), { contentType: 'image/png' });
    });
    const brandingObject = storageFor('super-admin').ref(BRANDING_PATH);

    await assertFails(brandingObject.put(new Uint8Array(64), { contentType: 'image/png' }));
    await assertFails(brandingObject.delete());
  });

  test('missing, unknown-role, inactive, and unauthenticated profiles are denied', async () => {
    for (const uid of ['missing-profile', 'unknown-a', 'employee-inactive', 'employee-disabled', 'employee-suspended']) {
      await assertFails(upload(uid, `tenants/${TENANT_A}/bookings/booking-a/field-photos/before/${uid}.jpg`, 'image/jpeg'));
      await assertFails(storageFor(uid).ref(PHOTO_PATH).getDownloadURL());
    }

    const anonymous = testEnvironment.unauthenticatedContext().storage();
    await assertFails(anonymous.ref(BRANDING_PATH).getDownloadURL());
  });

  test('legacy private paths and unknown root uploads remain denied', async () => {
    const unsafePaths = [
      `tenants/${TENANT_A}/documents/customer-a/contract.pdf`,
      `tenants/${TENANT_A}/signatures/customer-a/signature.png`,
      `tenants/${TENANT_A}/photos/customer-a/property.jpg`,
      `tenants/${TENANT_A}/property_conditions/report.jpg`,
      `tenants/${TENANT_A}/incidents/report.jpg`,
      'jobPhotos/booking-a/photo.jpg',
      'profile-images/admin-a.png',
      'unknown-root/file.png'
    ];

    for (const uid of ['super-admin', 'admin-a', 'employee-a', 'customer-a']) {
      for (const objectPath of unsafePaths) {
        await assertFails(upload(uid, objectPath, objectPath.endsWith('.pdf') ? 'application/pdf' : 'image/png'));
      }
    }
  });
});
