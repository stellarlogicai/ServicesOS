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

async function seedAccessData() {
  await testEnvironment.withSecurityRulesDisabled(async context => {
    const database = context.firestore();
    await database.doc(`tenants/${TENANT_A}`).set({
      adminUsers: ['admin-a'],
      users: ['admin-a', 'employee-a', 'employee-inactive', 'employee-disabled', 'employee-suspended', 'employee-tenantless'],
    });
    await database.doc(`tenants/${TENANT_B}`).set({
      adminUsers: ['admin-b'],
      users: ['admin-b', 'employee-b'],
    });
    const profiles = {
      'admin-a': { role: 'admin', status: 'active', tenantId: TENANT_A },
      'admin-b': { role: 'admin', status: 'active', tenantId: TENANT_B },
      'employee-a': { role: 'employee', status: 'active', tenantId: TENANT_A },
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
  });
}

const storageFor = uid => testEnvironment.authenticatedContext(uid).storage();
const upload = (uid, objectPath, contentType, bytes = 32) => storageFor(uid)
  .ref(objectPath)
  .put(new Uint8Array(bytes), { contentType });

describe('tenant-scoped Field Mode Storage rules', () => {
  before(async () => {
    const [firestoreRules, storageRules] = await Promise.all([
      readFile(path.join(__dirname, '..', 'firestore.rules'), 'utf8'),
      readFile(path.join(__dirname, '..', 'storage.rules'), 'utf8'),
    ]);
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

  test('tenant admin, matching employee, and super-admin can read while another tenant admin cannot', async () => {
    await testEnvironment.withSecurityRulesDisabled(async context => {
      await context.storage().ref(PHOTO_PATH).put(new Uint8Array(32), { contentType: 'image/jpeg' });
    });
    await assertSucceeds(storageFor('admin-a').ref(PHOTO_PATH).getDownloadURL());
    await assertSucceeds(storageFor('employee-a').ref(PHOTO_PATH).getDownloadURL());
    await assertSucceeds(storageFor('super-admin').ref(PHOTO_PATH).getDownloadURL());
    await assertFails(storageFor('admin-b').ref(PHOTO_PATH).getDownloadURL());
    await assertFails(storageFor('employee-b').ref(PHOTO_PATH).getDownloadURL());
  });

  test('successful evidence cannot be overwritten or deleted by an employee', async () => {
    const protectedPath = `tenants/${TENANT_A}/bookings/booking-a/field-photos/before/photo-protected.jpg`;
    await assertSucceeds(upload('employee-a', protectedPath, 'image/jpeg'));
    const employeePhoto = storageFor('employee-a').ref(protectedPath);
    await assertFails(employeePhoto.put(new Uint8Array(64), { contentType: 'image/jpeg' }));
    await assertFails(employeePhoto.delete());
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
