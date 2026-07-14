const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const {
  PROJECT_ID,
  TENANT_A,
  TENANT_B,
  buildSeedDocuments,
  validateSmokeEnvironment,
} = require('../scripts/seedV1SmokeEmulator');

const validEnvironment = {
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
  GCLOUD_PROJECT: PROJECT_ID,
};

describe('V1 smoke emulator seed safety', () => {
  test('requires all emulator host variables', () => {
    for (const missing of [
      'FIREBASE_AUTH_EMULATOR_HOST',
      'FIRESTORE_EMULATOR_HOST',
      'FIREBASE_STORAGE_EMULATOR_HOST',
    ]) {
      const environment = { ...validEnvironment };
      delete environment[missing];
      assert.throws(() => validateSmokeEnvironment(environment), new RegExp(`${missing} is required`));
    }
  });

  test('rejects non-loopback hosts and production-like project IDs', () => {
    assert.throws(
      () => validateSmokeEnvironment({ ...validEnvironment, FIRESTORE_EMULATOR_HOST: 'firestore.googleapis.com:443' }),
      /loopback host/,
    );
    assert.throws(
      () => validateSmokeEnvironment({ ...validEnvironment, GCLOUD_PROJECT: 'cleaning-intake-system' }),
      /must be demo-servicesos-v1-smoke-local/,
    );
  });

  test('rejects production service-account credentials', () => {
    assert.throws(
      () => validateSmokeEnvironment({ ...validEnvironment, GOOGLE_APPLICATION_CREDENTIALS: 'service-account.json' }),
      /must be unset/,
    );
  });

  test('builds distinct tenant data and preserves payment truth fixtures', () => {
    const documents = buildSeedDocuments(new Date('2026-07-14T12:00:00.000Z'));
    const tenantA = documents.get(`tenants/${TENANT_A}`);
    const tenantB = documents.get(`tenants/${TENANT_B}`);
    const fieldBooking = documents.get(`tenants/${TENANT_A}/bookings/booking-smoke-a-field`);
    const manualBooking = documents.get(`tenants/${TENANT_A}/bookings/booking-smoke-a-completed`);
    const unassignedBooking = documents.get(`tenants/${TENANT_A}/bookings/booking-smoke-a-payment-pending`);
    const otherEmployeeBooking = documents.get(`tenants/${TENANT_A}/bookings/booking-smoke-a-other-employee`);
    const cancelledBooking = documents.get(`tenants/${TENANT_A}/bookings/booking-smoke-a-cancelled`);

    assert.equal(tenantA.businessSettings.businessName, 'Aunt B Smoke Cleaning A');
    assert.equal(tenantB.businessSettings.businessName, 'ServicesOS Smoke Cleaning B');
    assert.notDeepEqual(tenantA.adminUsers, tenantB.adminUsers);
    assert.equal(fieldBooking.paymentStatus, 'not_paid');
    assert.equal(fieldBooking.fieldStatus, 'not_started');
    assert.equal(fieldBooking.assignedEmployeeAuthUid, 'smoke-employee-a');
    assert.equal(fieldBooking.assignedEmployeeId, undefined);
    assert.equal(fieldBooking.assignedEmployeeUid, undefined);
    assert.equal(unassignedBooking.assignedEmployeeAuthUid, undefined);
    assert.equal(otherEmployeeBooking.assignedEmployeeAuthUid, 'smoke-employee-a-other');
    assert.equal(cancelledBooking.assignedEmployeeAuthUid, 'smoke-employee-a');
    assert.equal(manualBooking.paymentStatus, 'paid_in_full');
    assert.equal(manualBooking.paymentMethod, 'cash');
    assert.notEqual(manualBooking.paymentStatusUpdatedBy, 'stripe_webhook');
    assert.equal(manualBooking.stripeCheckoutSessionId, undefined);
    assert.equal(manualBooking.stripePaymentIntentId, undefined);
  });
});
