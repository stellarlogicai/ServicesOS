const fs = require('node:fs/promises');
const path = require('node:path');
const { deleteApp, getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');

const PROJECT_ID = 'demo-servicesos-v1-smoke-local';
const STORAGE_BUCKET = `${PROJECT_ID}.appspot.com`;
const TENANT_A = 'tenant-smoke-a';
const TENANT_B = 'tenant-smoke-b';
const OTHER_EMPLOYEE_A_UID = 'smoke-employee-a-other';
const LOCAL_PASSWORD = 'ServicesOS-Local-Smoke-Only!';
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CREDENTIALS_PATH = path.join(REPO_ROOT, '.servicesos-smoke-credentials.local.json');
const FIXTURES_PATH = path.join(REPO_ROOT, '.servicesos-smoke-fixtures.local');

const PERSONAS = [
  { uid: 'smoke-admin-a', email: 'admin-a@servicesos.test', displayName: 'Tenant A Admin', role: 'admin', status: 'active', tenantId: TENANT_A },
  { uid: 'smoke-employee-a', email: 'employee-a@servicesos.test', displayName: 'Tenant A Employee', role: 'employee', status: 'active', tenantId: TENANT_A },
  { uid: 'smoke-customer-a', email: 'customer-a@servicesos.test', displayName: 'Tenant A Customer', role: 'customer', status: 'active', tenantId: TENANT_A },
  { uid: 'smoke-admin-b', email: 'admin-b@servicesos.test', displayName: 'Tenant B Admin', role: 'admin', status: 'active', tenantId: TENANT_B },
  { uid: 'smoke-superadmin', email: 'superadmin@servicesos.test', displayName: 'Smoke Super Admin', role: 'super-admin', status: 'active', tenantId: null },
];

function isLoopbackHost(value) {
  if (typeof value !== 'string' || value.includes('://')) return false;
  const host = value.replace(/^\[/, '').split(/\]:|:/, 1)[0];
  return host === '127.0.0.1' || host === 'localhost' || host === '::1';
}

function validateSmokeEnvironment(env = process.env) {
  const requiredHosts = [
    'FIREBASE_AUTH_EMULATOR_HOST',
    'FIRESTORE_EMULATOR_HOST',
    'FIREBASE_STORAGE_EMULATOR_HOST',
  ];

  for (const name of requiredHosts) {
    if (!env[name]) throw new Error(`${name} is required. Refusing to seed without all Firebase emulators.`);
    if (!isLoopbackHost(env[name])) throw new Error(`${name} must use a loopback host without a protocol.`);
  }

  if (env.GCLOUD_PROJECT !== PROJECT_ID) {
    throw new Error(`GCLOUD_PROJECT must be ${PROJECT_ID}. Refusing target ${env.GCLOUD_PROJECT || 'missing'}.`);
  }
  if (!env.GCLOUD_PROJECT.startsWith('demo-')) {
    throw new Error('The V1 smoke seed requires a Firebase demo project ID.');
  }
  if (env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS must be unset for the local V1 smoke seed.');
  }

  return {
    projectId: PROJECT_ID,
    authHost: env.FIREBASE_AUTH_EMULATOR_HOST,
    firestoreHost: env.FIRESTORE_EMULATOR_HOST,
    storageHost: env.FIREBASE_STORAGE_EMULATOR_HOST,
  };
}

function dateKey(date) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function smokeDates(now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  return {
    today: dateKey(today),
    todayIso: today.toISOString(),
    tomorrow: dateKey(tomorrow),
    tomorrowIso: tomorrow.toISOString(),
    yesterday: dateKey(yesterday),
    yesterdayIso: yesterday.toISOString(),
  };
}

function customerSnapshot(name, email, phone) {
  return { name, fullName: name, email, phone };
}

function bookingBase({ id, tenantId, customerId, name, email, phone, address, date, startTime, serviceType, agreedPrice }) {
  return {
    id,
    tenantId,
    customerId,
    customerName: name,
    customerPhone: phone,
    customerSnapshot: customerSnapshot(name, email, phone),
    propertySnapshot: { address, bedrooms: 2, bathrooms: 1 },
    requestSnapshot: {
      cleaningType: serviceType,
      accessInstructions: 'Use the marked side entrance for this fake smoke job.',
      specialRequests: 'Use unscented products for this fake smoke job.',
    },
    address,
    date,
    startTime,
    serviceType,
    agreedPrice,
    status: 'scheduled',
    paymentStatus: 'not_paid',
    fieldStatus: 'not_started',
    internalNotes: 'Private owner-only smoke note. Employees must not see this.',
    notes: 'Owner administration smoke note. Employees must not see this.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function buildSeedDocuments(now = new Date()) {
  const dates = smokeDates(now);
  const adminA = PERSONAS[0].uid;
  const employeeA = PERSONAS[1].uid;
  const customerA = PERSONAS[2].uid;
  const adminB = PERSONAS[3].uid;

  const documents = new Map();
  const add = (documentPath, data) => documents.set(documentPath, data);

  add(`tenants/${TENANT_A}`, {
    businessName: 'Aunt B Smoke Cleaning A',
    status: 'active',
    ownerId: adminA,
    users: [adminA, employeeA, OTHER_EMPLOYEE_A_UID],
    adminUsers: [adminA],
    chargesEnabled: false,
    payoutsEnabled: false,
    stripeAccountId: null,
    businessSettings: {
      businessName: 'Aunt B Smoke Cleaning A',
      businessPhone: '555-0101',
      businessEmail: 'tenant-a@servicesos.test',
      serviceArea: 'Example District A',
      businessAddress: '100 Example Avenue, Test City, TX 00000',
      websiteUrl: 'https://example.test/tenant-a',
      facebookUrl: '',
      defaultServiceNotes: 'Use only fake smoke-test data.',
      availability: { availableDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] },
    },
  });
  add(`tenants/${TENANT_B}`, {
    businessName: 'ServicesOS Smoke Cleaning B',
    status: 'active',
    ownerId: adminB,
    users: [adminB],
    adminUsers: [adminB],
    chargesEnabled: false,
    payoutsEnabled: false,
    stripeAccountId: null,
    businessSettings: {
      businessName: 'ServicesOS Smoke Cleaning B',
      businessPhone: '555-0202',
      businessEmail: 'tenant-b@servicesos.test',
      serviceArea: 'Example District B',
      businessAddress: '200 Example Boulevard, Test City, TX 00000',
      defaultServiceNotes: 'Tenant B fake smoke-test data.',
      availability: { availableDays: ['tuesday', 'thursday'] },
    },
  });

  for (const persona of PERSONAS) {
    add(`users/${persona.uid}`, {
      email: persona.email,
      displayName: persona.displayName,
      role: persona.role,
      status: persona.status,
      tenantId: persona.tenantId,
      onboardingCompleted: true,
      onboardingProgress: 100,
      createdAt: dates.yesterdayIso,
      updatedAt: dates.todayIso,
    });
  }
  add(`users/${OTHER_EMPLOYEE_A_UID}`, {
    email: 'employee-a-other@servicesos.test',
    displayName: 'Tenant A Other Employee',
    role: 'employee',
    status: 'active',
    tenantId: TENANT_A,
    onboardingCompleted: true,
    onboardingProgress: 100,
    createdAt: dates.yesterdayIso,
    updatedAt: dates.todayIso,
  });

  add(`tenants/${TENANT_A}/customers/customer-smoke-a`, {
    name: 'Tenant A Example Customer',
    email: 'customer-a@servicesos.test',
    phone: '555-0110',
    address: '110 Example Lane, Test City, TX 00000',
    serviceNotes: 'Fake linked customer for emulator smoke only.',
    authUid: customerA,
    status: 'active',
    isArchived: false,
    createdAt: dates.yesterdayIso,
    updatedAt: dates.todayIso,
  });
  add(`tenants/${TENANT_A}/customers/customer-smoke-a-secondary`, {
    name: 'Tenant A Secondary Example',
    email: 'secondary-a@servicesos.test',
    phone: '555-0111',
    status: 'active',
    isArchived: false,
    createdAt: dates.yesterdayIso,
    updatedAt: dates.todayIso,
  });
  add(`tenants/${TENANT_B}/customers/customer-smoke-b`, {
    name: 'Tenant B Example Customer',
    email: 'customer-b@servicesos.test',
    phone: '555-0220',
    status: 'active',
    isArchived: false,
    createdAt: dates.yesterdayIso,
    updatedAt: dates.todayIso,
  });

  add(`tenants/${TENANT_A}/leads/request-smoke-a`, {
    schemaVersion: 1,
    type: 'quote_request',
    source: 'customer-portal',
    status: 'new',
    tenantId: TENANT_A,
    customerId: 'customer-smoke-a',
    propertyId: null,
    createdByAuthUid: customerA,
    formData: { fullName: 'Tenant A Example Customer' },
    customerSnapshot: customerSnapshot('Tenant A Example Customer', 'customer-a@servicesos.test', '555-0110'),
    propertySnapshot: { address: '110 Example Lane, Test City, TX 00000', bedrooms: 2, bathrooms: 1 },
    requestSnapshot: { cleaningType: 'standard', frequency: 'one-time', preferredDate: dates.tomorrow, preferredTime: '10:00' },
    estimate: { status: 'pending_owner_review', requiresReview: true },
    review: { requiresOwnerReview: true },
    appointmentRequest: { status: 'pending_review' },
    aiAnalysis: null,
    booking: null,
    createdAt: dates.todayIso,
    updatedAt: dates.todayIso,
  });
  add(`tenants/${TENANT_B}/leads/request-smoke-b`, {
    schemaVersion: 1,
    type: 'lead',
    source: 'admin',
    status: 'new',
    tenantId: TENANT_B,
    customerId: 'customer-smoke-b',
    customerSnapshot: customerSnapshot('Tenant B Example Customer', 'customer-b@servicesos.test', '555-0220'),
    propertySnapshot: { address: '220 Example Road, Test City, TX 00000', bedrooms: 4, bathrooms: 3 },
    requestSnapshot: { cleaningType: 'move-out', preferredDate: dates.tomorrow },
    formData: { fullName: 'Tenant B Example Customer' },
    booking: null,
    createdAt: dates.todayIso,
    updatedAt: dates.todayIso,
  });

  const fieldBooking = bookingBase({
    id: 'booking-smoke-a-field', tenantId: TENANT_A, customerId: 'customer-smoke-a',
    name: 'Tenant A Example Customer', email: 'customer-a@servicesos.test', phone: '555-0110',
    address: '110 Example Lane, Test City, TX 00000', date: dates.today, startTime: '09:00',
    serviceType: 'standard', agreedPrice: 185,
  });
  fieldBooking.assignedEmployeeAuthUid = employeeA;
  add(`tenants/${TENANT_A}/bookings/booking-smoke-a-field`, fieldBooking);

  const pendingPaymentBooking = bookingBase({
    id: 'booking-smoke-a-payment-pending', tenantId: TENANT_A, customerId: 'customer-smoke-a-secondary',
    name: 'Tenant A Secondary Example', email: 'secondary-a@servicesos.test', phone: '555-0111',
    address: '111 Example Lane, Test City, TX 00000', date: dates.tomorrow, startTime: '13:00',
    serviceType: 'deep', agreedPrice: 240,
  });
  pendingPaymentBooking.paymentStatus = 'deposit_requested';
  add(`tenants/${TENANT_A}/bookings/booking-smoke-a-payment-pending`, pendingPaymentBooking);

  const otherEmployeeBooking = bookingBase({
    id: 'booking-smoke-a-other-employee', tenantId: TENANT_A, customerId: 'customer-smoke-a-secondary',
    name: 'Tenant A Other Employee Job', email: 'secondary-a@servicesos.test', phone: '555-0111',
    address: '114 Example Lane, Test City, TX 00000', date: dates.tomorrow, startTime: '11:00',
    serviceType: 'standard', agreedPrice: 175,
  });
  otherEmployeeBooking.assignedEmployeeAuthUid = OTHER_EMPLOYEE_A_UID;
  add(`tenants/${TENANT_A}/bookings/booking-smoke-a-other-employee`, otherEmployeeBooking);

  const completedBooking = bookingBase({
    id: 'booking-smoke-a-completed', tenantId: TENANT_A, customerId: 'customer-smoke-a-secondary',
    name: 'Tenant A Completed Example', email: 'completed-a@servicesos.test', phone: '555-0112',
    address: '112 Example Lane, Test City, TX 00000', date: dates.yesterday, startTime: '08:30',
    serviceType: 'move-out', agreedPrice: 320,
  });
  Object.assign(completedBooking, {
    assignedEmployeeAuthUid: employeeA,
    status: 'completed',
    paymentStatus: 'paid_in_full',
    paymentMethod: 'cash',
    amountReceived: 320,
    receivedAt: dates.yesterdayIso,
    paymentNote: 'Manual cash payment recorded in the fake emulator fixture.',
    paymentStatusUpdatedBy: adminA,
    fieldStatus: 'completed',
    fieldStatusUpdatedAt: dates.yesterdayIso,
    fieldStartedAt: dates.yesterdayIso,
    fieldStartedByUid: employeeA,
    completedAt: dates.yesterdayIso,
    completedByUid: employeeA,
    fieldChecklist: [
      { id: 'walkthrough', label: 'Walk through the home before starting', completed: true },
      { id: 'service-areas', label: 'Complete the requested cleaning areas', completed: true },
      { id: 'final-check', label: 'Do a final quality check before leaving', completed: true },
    ],
    fieldChecklistSummary: { completed: 3, total: 3 },
    fieldNotes: 'Fake completion note: all requested areas checked.',
    fieldIssue: 'Fake issue flag: owner should review a loose cabinet handle.',
  });
  add(`tenants/${TENANT_A}/bookings/booking-smoke-a-completed`, completedBooking);

  const cancelledBooking = bookingBase({
    id: 'booking-smoke-a-cancelled', tenantId: TENANT_A, customerId: 'customer-smoke-a-secondary',
    name: 'Tenant A Cancelled Example', email: 'cancelled-a@servicesos.test', phone: '555-0113',
    address: '113 Example Lane, Test City, TX 00000', date: dates.tomorrow, startTime: '15:00',
    serviceType: 'standard', agreedPrice: 150,
  });
  cancelledBooking.status = 'cancelled';
  cancelledBooking.assignedEmployeeAuthUid = employeeA;
  add(`tenants/${TENANT_A}/bookings/booking-smoke-a-cancelled`, cancelledBooking);

  const tenantBBooking = bookingBase({
    id: 'booking-smoke-b-scheduled', tenantId: TENANT_B, customerId: 'customer-smoke-b',
    name: 'Tenant B Example Customer', email: 'customer-b@servicesos.test', phone: '555-0220',
    address: '220 Example Road, Test City, TX 00000', date: dates.today, startTime: '11:30',
    serviceType: 'move-out', agreedPrice: 475,
  });
  add(`tenants/${TENANT_B}/bookings/booking-smoke-b-scheduled`, tenantBBooking);

  return documents;
}

async function resetAuth(auth) {
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    if (page.users.length > 0) await auth.deleteUsers(page.users.map(user => user.uid));
    pageToken = page.pageToken;
  } while (pageToken);
}

async function resetFirestore(firestoreHost) {
  const endpoint = `http://${firestoreHost}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
  const response = await fetch(endpoint, { method: 'DELETE' });
  if (!response.ok) throw new Error(`Firestore emulator reset failed with HTTP ${response.status}.`);
}

async function resetStorage(storage) {
  const bucket = storage.bucket(STORAGE_BUCKET);
  const [files] = await bucket.getFiles();
  await Promise.all(files.map(file => file.delete({ ignoreNotFound: true })));
}

async function seedAuth(auth) {
  for (const persona of PERSONAS) {
    await auth.createUser({
      uid: persona.uid,
      email: persona.email,
      emailVerified: true,
      password: LOCAL_PASSWORD,
      displayName: persona.displayName,
      disabled: false,
    });
  }
}

async function seedFirestore(db, now = new Date()) {
  const documents = buildSeedDocuments(now);
  const batch = db.batch();
  for (const [documentPath, data] of documents) batch.set(db.doc(documentPath), data);
  await batch.commit();
  return documents.size;
}

async function writeLocalArtifacts() {
  const credentials = {
    warning: 'LOCAL FIREBASE EMULATOR ONLY. These credentials cannot authenticate to production.',
    projectId: PROJECT_ID,
    password: LOCAL_PASSWORD,
    accounts: PERSONAS.map(({ email, displayName, role, tenantId }) => ({ email, displayName, role, tenantId })),
  };
  await fs.writeFile(CREDENTIALS_PATH, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 });

  await fs.mkdir(FIXTURES_PATH, { recursive: true });
  const fixtures = {
    'valid-before.jpg': Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9k=', 'base64'),
    'valid-after.png': Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlS8AAAAASUVORK5CYII=', 'base64'),
    'valid-after.webp': Buffer.from('UklGRiIAAABXRUJQVlA4IC4AAACwAQCdASoBAAEALmk0mk0iIiIiIgBoSygABc6zbAAA', 'base64'),
    'invalid-file.txt': Buffer.from('ServicesOS V1 smoke invalid upload fixture.\n'),
    'oversized-file.bin': Buffer.alloc((10 * 1024 * 1024) + 1, 0x53),
  };
  for (const [name, contents] of Object.entries(fixtures)) {
    await fs.writeFile(path.join(FIXTURES_PATH, name), contents);
  }
}

async function run({ reset = false, env = process.env, now = new Date() } = {}) {
  const config = validateSmokeEnvironment(env);
  console.log(`[V1 smoke seed] Local emulator target confirmed: ${config.projectId}`);

  const app = getApps().length > 0
    ? getApps()[0]
    : initializeApp({ projectId: PROJECT_ID, storageBucket: STORAGE_BUCKET });
  const auth = getAuth(app);
  const db = getFirestore(app);
  const storage = getStorage(app);

  try {
    if (reset) {
      await Promise.all([
        resetAuth(auth),
        resetFirestore(config.firestoreHost),
        resetStorage(storage),
      ]);
      console.log('[V1 smoke seed] Auth, Firestore, and Storage emulator data cleared.');
    }

    if (!reset) {
      const existing = await auth.listUsers(1);
      if (existing.users.length > 0) {
        throw new Error('Auth emulator is not empty. Run npm run reset:v1-smoke for a deterministic reseed.');
      }
    }

    await seedAuth(auth);
    const documentCount = await seedFirestore(db, now);
    await writeLocalArtifacts();

    console.log(`[V1 smoke seed] Seeded ${PERSONAS.length} fake personas and ${documentCount} Firestore documents.`);
    console.log(`[V1 smoke seed] Local credentials: ${CREDENTIALS_PATH}`);
    console.log(`[V1 smoke seed] Upload fixtures: ${FIXTURES_PATH}`);
  } finally {
    await deleteApp(app);
  }
}

if (require.main === module) {
  run({ reset: process.argv.includes('--reset') }).catch(error => {
    console.error(`[V1 smoke seed] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  CREDENTIALS_PATH,
  FIXTURES_PATH,
  PERSONAS,
  PROJECT_ID,
  STORAGE_BUCKET,
  TENANT_A,
  TENANT_B,
  buildSeedDocuments,
  isLoopbackHost,
  run,
  smokeDates,
  validateSmokeEnvironment,
};
