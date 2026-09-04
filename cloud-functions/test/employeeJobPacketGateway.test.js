const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const checklistParityFixtures = require('../../shared/employeeJobPacketChecklistParityFixtures.json');
const firestoreIndexes = require('../firestore.indexes.json');
const {
  createEmployeeJobPacketGatewayHandler,
  getEmployeeJob,
  listEmployeeJobs,
  parseEmployeeJobRequest,
} = require('../employeeJobPacketGateway');
const {
  CHECKLIST_MAX_ITEMS,
  CHECKLIST_MAX_RESPONSE_BYTES,
  JOB_LIST_LIMIT,
  bookingMatchesEmployeeJobVisibility,
  checklistProjection,
  currentChecklistScopeSignature,
  employeeJobPacket,
  employeeJobSummary,
} = require('../employeeJobPacketProjection');

const NOW = new Date('2026-09-03T12:00:00.000Z');

function checklistItem(overrides = {}) {
  return {
    id: 'kitchen-counter',
    area: 'Kitchen',
    fixtureOrSurface: 'Counter',
    label: 'Clean kitchen counter',
    completionCriteria: 'Counter is clean and dry.',
    jobAidSteps: [{ label: 'Wipe the counter', note: '', condition: '' }],
    warnings: ['Use the approved surface method.'],
    note: '',
    condition: '',
    required: true,
    completed: false,
    approvedMethodIds: ['method-a'],
    preferredMethodId: 'method-a',
    sourceReferences: ['private-provenance-reference'],
    ...overrides,
  };
}

function baseBooking(overrides = {}) {
  const booking = {
    date: '2026-09-03',
    startTime: '09:00',
    endTime: '11:00',
    status: 'scheduled',
    fieldStatus: 'not_started',
    assignedEmployeeAuthUid: 'employee-a',
    serviceType: 'standard',
    customerName: 'Synthetic Customer',
    customerPhone: '555-0100',
    address: '100 Test Street',
    fieldInstructions: 'Use the side entrance.',
    fieldNotes: 'Bring clean cloths.',
    fieldIssue: '',
    propertySnapshot: {
      roomCounts: { bedrooms: 2, bathrooms: 1, kitchens: 1 },
      household: { petCount: 0, petHairLevel: 'none' },
    },
    requestSnapshot: {
      cleaningType: 'standard',
      frequency: 'one-time',
      serviceScope: {},
    },
    ...overrides,
  };
  if (!Object.hasOwn(overrides, 'jobChecklistSnapshot')) {
    const items = [checklistItem()];
    booking.jobChecklistSnapshot = {
      ownerApproved: true,
      items,
      notes: 'Follow the reviewed packet.',
      warnings: ['Watch the loose threshold.'],
      provenance: {
        ownerApproved: true,
        sourceScopeSignature: currentChecklistScopeSignature(booking),
        sourceScopeSnapshot: { private: 'must-not-leak' },
      },
      reviewedBy: 'owner-private-uid',
    };
    booking.fieldChecklist = items.map(item => ({ ...item, completed: true }));
  }
  return booking;
}

function addDays(dateText, days) {
  const date = new Date(`${dateText}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function createAdmin({
  profile = { role: 'employee', status: 'active', tenantId: 'tenant-a' },
  tenant = { users: ['employee-a'], businessSettings: { timeZone: 'UTC' } },
  bookings = {},
  tokenUid = 'employee-a',
  tokenError = null,
} = {}) {
  const queryOperations = [];
  const reads = [];

  function bookingCollection() {
    const query = {
      where(field, operator, value) {
        queryOperations.push(['where', field, operator, value]);
        return this;
      },
      orderBy(field, direction) {
        queryOperations.push(['orderBy', field, direction]);
        return this;
      },
      limitToLast(value) {
        queryOperations.push(['limitToLast', value]);
        return this;
      },
      async get() {
        reads.push('bookings-query');
        return {
          docs: Object.entries(bookings).map(([id, data]) => ({ id, data: () => data })),
        };
      },
      doc(id) {
        return {
          async get() {
            reads.push(`booking:${id}`);
            const data = bookings[id];
            return { id, exists: data !== undefined, data: () => data };
          },
        };
      },
    };
    return query;
  }

  const admin = {
    auth: () => ({
      verifyIdToken: async () => {
        if (tokenError) throw tokenError;
        return { uid: tokenUid };
      },
    }),
    firestore: () => ({
      collection(name) {
        if (name === 'users') {
          return { doc: uid => ({ get: async () => ({ exists: profile !== undefined, data: () => profile, id: uid }) }) };
        }
        if (name !== 'tenants') throw new Error(`Unexpected collection: ${name}`);
        return {
          doc: tenantId => ({
            get: async () => ({ exists: tenant !== undefined, data: () => tenant, id: tenantId }),
            collection: name => {
              if (name !== 'bookings') throw new Error(`Unexpected tenant collection: ${name}`);
              return bookingCollection();
            },
          }),
        };
      },
    }),
  };
  return { admin, queryOperations, reads };
}

function responseRecorder() {
  return {
    headers: {},
    statusCode: null,
    body: null,
    set(name, value) { this.headers[name] = value; return this; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
    send(value) { this.body = value; return this; },
  };
}

async function callHandler({ admin, method = 'POST', headers = { authorization: 'Bearer valid' }, body = { action: 'list' } }) {
  const response = responseRecorder();
  await createEmployeeJobPacketGatewayHandler({ admin, now: () => NOW })({ method, headers, body }, response);
  return response;
}

function employeeContext() {
  return { uid: 'employee-a', tenantId: 'tenant-a', tenantTimeZone: 'UTC' };
}

function collectKeys(value, keys = []) {
  if (Array.isArray(value)) value.forEach(item => collectKeys(item, keys));
  else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, nested]) => {
      keys.push(key);
      collectKeys(nested, keys);
    });
  }
  return keys;
}

describe('employee JobPacket authorization and request boundary', () => {
  test('missing and invalid authentication are denied', async () => {
    const missing = createAdmin();
    assert.equal((await callHandler({ admin: missing.admin, headers: {} })).statusCode, 401);
    const invalid = createAdmin({ tokenError: new Error('invalid') });
    assert.equal((await callHandler({ admin: invalid.admin })).statusCode, 401);
  });

  test('invalid employee profile and tenant membership are denied', async () => {
    const invalidProfile = createAdmin({ profile: { role: 'admin', status: 'active', tenantId: 'tenant-a' } });
    assert.equal((await callHandler({ admin: invalidProfile.admin })).statusCode, 403);
    const missingMembership = createAdmin({ tenant: { users: ['other-employee'] } });
    assert.equal((await callHandler({ admin: missingMembership.admin })).statusCode, 403);
  });

  test('only exact list and get request shapes are accepted', () => {
    assert.deepEqual(parseEmployeeJobRequest({ action: 'list' }), { action: 'list' });
    assert.deepEqual(parseEmployeeJobRequest({ action: 'get', bookingId: ' booking-a ' }), {
      action: 'get', bookingId: 'booking-a',
    });
    for (const body of [
      {},
      { action: 'unknown' },
      { action: 'list', tenantId: 'tenant-a' },
      { action: 'get', bookingId: 'booking-a', uid: 'employee-a' },
      { action: 'get', bookingId: '' },
      { action: 'get', bookingId: '../booking-a' },
      { action: 'get', bookingId: 'x'.repeat(129) },
    ]) assert.throws(() => parseEmployeeJobRequest(body), error => error.code === 'invalid_request');
  });

  test('gateway supports only POST and OPTIONS with controlled CORS', async () => {
    const fixture = createAdmin();
    const options = await callHandler({
      admin: fixture.admin,
      method: 'OPTIONS',
      headers: { origin: 'http://127.0.0.1:5173' },
    });
    assert.equal(options.statusCode, 204);
    assert.equal(options.headers['Access-Control-Allow-Origin'], 'http://127.0.0.1:5173');
    assert.equal(options.headers['Access-Control-Allow-Methods'], 'POST, OPTIONS');
    assert.equal((await callHandler({ admin: fixture.admin, method: 'GET' })).statusCode, 405);
    const disallowed = await callHandler({
      admin: fixture.admin,
      method: 'OPTIONS',
      headers: { origin: 'https://untrusted.example' },
    });
    assert.equal(disallowed.headers['Access-Control-Allow-Origin'], undefined);
  });
});

describe('employee job list', () => {
  test('bounded list query is supported by the existing booking index', () => {
    const expectedFields = [
      ['assignedEmployeeAuthUid', 'ASCENDING'],
      ['status', 'ASCENDING'],
      ['date', 'DESCENDING'],
    ];
    const matchingIndex = firestoreIndexes.indexes.find(index =>
      index.collectionGroup === 'bookings' &&
      index.queryScope === 'COLLECTION' &&
      JSON.stringify(index.fields.map(field => [field.fieldPath, field.order])) === JSON.stringify(expectedFields)
    );
    assert.ok(matchingIndex);
  });

  test('returns only assigned, active, non-archived current and future jobs', async () => {
    const bookings = {
      today: baseBooking(),
      future: baseBooking({ date: '2026-09-04', startTime: '08:00' }),
      other: baseBooking({ assignedEmployeeAuthUid: 'employee-b' }),
      unassigned: baseBooking({ assignedEmployeeAuthUid: null }),
      cancelled: baseBooking({ status: 'cancelled' }),
      archived: baseBooking({ isArchived: true }),
      deleted: baseBooking({ isDeleted: true }),
      past: baseBooking({ date: '2026-09-02' }),
    };
    const fixture = createAdmin({ bookings });
    const result = await listEmployeeJobs({ admin: fixture.admin, employee: employeeContext(), now: NOW });
    assert.equal(result.todayDate, '2026-09-03');
    assert.deepEqual(result.jobs.map(job => job.id), ['today', 'future']);
  });

  test('list is chronologically ordered and hard-limited to 50', async () => {
    const bookings = Object.fromEntries(Array.from({ length: 60 }, (_, index) => [
      `job-${String(index).padStart(2, '0')}`,
      baseBooking({ date: addDays('2026-09-03', index), startTime: index % 2 ? '10:00' : '08:00' }),
    ]));
    const fixture = createAdmin({ bookings });
    const result = await listEmployeeJobs({ admin: fixture.admin, employee: employeeContext(), now: NOW });
    assert.equal(result.jobs.length, JOB_LIST_LIMIT);
    assert.equal(result.jobs[0].id, 'job-00');
    assert.equal(result.jobs[49].id, 'job-49');
    assert.deepEqual(fixture.queryOperations, [
      ['where', 'assignedEmployeeAuthUid', '==', 'employee-a'],
      ['where', 'status', 'in', ['scheduled', 'completed']],
      ['where', 'date', '>=', '2026-09-03'],
      ['orderBy', 'date', 'desc'],
      ['limitToLast', 50],
    ]);
    assert.deepEqual(fixture.reads, ['bookings-query']);
  });

  test('today is resolved in the canonical tenant timezone', async () => {
    const fixture = createAdmin({ bookings: { localToday: baseBooking({ date: '2026-09-02' }) } });
    const result = await listEmployeeJobs({
      admin: fixture.admin,
      employee: { ...employeeContext(), tenantTimeZone: 'Pacific/Honolulu' },
      now: new Date('2026-09-03T05:00:00.000Z'),
    });
    assert.equal(result.todayDate, '2026-09-02');
    assert.deepEqual(result.jobs.map(job => job.id), ['localToday']);
    assert.equal(Object.hasOwn(result, 'tenantTimeZone'), false);
    assert.equal(Object.hasOwn(result, 'tenant'), false);
    assert.ok(fixture.queryOperations.some(operation => operation[1] === 'date' && operation[3] === '2026-09-02'));
  });

  test('summary uses an exact employee-safe allowlist', () => {
    const summary = employeeJobSummary('booking-a', baseBooking({ paymentStatus: 'paid', agreedPrice: 250 }), 'UTC');
    assert.deepEqual(Object.keys(summary), [
      'id', 'schedule', 'serviceType', 'customerName', 'address', 'status', 'fieldStatus',
    ]);
    assert.deepEqual(Object.keys(summary.schedule), ['date', 'startTime', 'endTime', 'scheduledAt']);
    assert.equal(JSON.stringify(summary).includes('250'), false);
    assert.equal(JSON.stringify(summary).includes('paid'), false);
  });
});

describe('employee job detail access', () => {
  test('assigned eligible booking succeeds with one booking read', async () => {
    const fixture = createAdmin({ bookings: { 'booking-a': baseBooking() } });
    const result = await getEmployeeJob({
      admin: fixture.admin,
      employee: employeeContext(),
      bookingId: 'booking-a',
      now: NOW,
    });
    assert.equal(result.job.id, 'booking-a');
    assert.deepEqual(fixture.reads, ['booking:booking-a']);
  });

  test('inaccessible job states all return the same unavailable error', async () => {
    const variants = [
      baseBooking({ assignedEmployeeAuthUid: 'employee-b' }),
      baseBooking({ assignedEmployeeAuthUid: null }),
      baseBooking({ status: 'cancelled' }),
      baseBooking({ isArchived: true }),
      baseBooking({ isDeleted: true }),
      baseBooking({ date: '2026-09-02' }),
    ];
    for (const booking of variants) {
      const fixture = createAdmin({ bookings: { hidden: booking } });
      await assert.rejects(
        getEmployeeJob({ admin: fixture.admin, employee: employeeContext(), bookingId: 'hidden', now: NOW }),
        error => error.code === 'job_unavailable' && error.status === 404
      );
    }
    const missing = createAdmin();
    await assert.rejects(
      getEmployeeJob({ admin: missing.admin, employee: employeeContext(), bookingId: 'missing', now: NOW }),
      error => error.code === 'job_unavailable' && error.status === 404
    );

    const response = await callHandler({
      admin: createAdmin({ bookings: { hidden: baseBooking({ assignedEmployeeAuthUid: 'employee-b' }) } }).admin,
      body: { action: 'get', bookingId: 'hidden' },
    });
    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.body, { error: 'Job unavailable', code: 'job_unavailable' });
  });

  test('visibility uses only assignedEmployeeAuthUid', () => {
    const booking = baseBooking({
      assignedEmployeeAuthUid: 'employee-b',
      assignedEmployeeId: 'employee-a',
      assignedEmployeeUid: 'employee-a',
      employeeId: 'employee-a',
    });
    assert.equal(bookingMatchesEmployeeJobVisibility(booking, {
      uid: 'employee-a', today: '2026-09-03', timeZone: 'UTC',
    }), false);
  });
});

describe('employee-safe JobPacket projection', () => {
  test('detail exposes only the approved top-level and nested fields', () => {
    const packet = employeeJobPacket('booking-a', baseBooking(), 'UTC');
    assert.deepEqual(Object.keys(packet), [
      'id', 'schedule', 'serviceType', 'customer', 'location', 'status', 'fieldStatus',
      'instructions', 'checklist', 'fieldNotes', 'fieldIssue',
    ]);
    assert.deepEqual(Object.keys(packet.customer), ['name', 'phone']);
    assert.deepEqual(Object.keys(packet.location), ['address']);
    assert.deepEqual(Object.keys(packet.checklist), ['ready', 'items', 'completed', 'total', 'notes', 'warnings']);
  });

  test('safe display scalars follow Field Mode compatibility precedence', () => {
    const packet = employeeJobPacket('booking-a', baseBooking({
      customerName: '',
      customerPhone: '',
      address: '',
      serviceType: '',
      fieldInstructions: '',
      customerSnapshot: { fullName: 'Snapshot Name', phone: '555-0199' },
      propertySnapshot: { address: { street: '10 Main', city: 'Bolivar', state: 'MO', zipCode: '65613' } },
      requestSnapshot: {
        cleaningType: 'deep',
        frequency: 'one-time',
        serviceScope: {},
        accessInstructions: 'Use the rear gate.',
      },
    }), 'UTC');
    assert.equal(packet.customer.name, 'Snapshot Name');
    assert.equal(packet.customer.phone, '555-0199');
    assert.equal(packet.location.address, '10 Main, Bolivar, MO, 65613');
    assert.equal(packet.serviceType, 'deep');
    assert.equal(packet.instructions, 'Use the rear gate.');
  });

  test('forbidden booking data is absent recursively', () => {
    const sensitive = 'SENSITIVE_SENTINEL';
    const packet = employeeJobPacket('booking-a', baseBooking({
      agreedPrice: sensitive,
      price: sensitive,
      pricing: { amount: sensitive },
      paymentStatus: sensitive,
      paymentMethod: sensitive,
      amountReceived: sensitive,
      paymentNote: sensitive,
      stripePaymentIntentId: sensitive,
      subscriptionData: { secret: sensitive },
      billing: { secret: sensitive },
      notes: sensitive,
      leadId: sensitive,
      sourceLeadId: sensitive,
      customerSnapshot: { fullName: 'Safe Name', private: sensitive },
      propertySnapshot: { address: 'Safe Address', private: sensitive },
      requestSnapshot: { cleaningType: 'standard', frequency: 'one-time', serviceScope: {}, private: sensitive },
      rawInput: { private: sensitive },
      formData: { private: sensitive },
      tenant: { users: [sensitive], adminUsers: [sensitive] },
      assignedEmployeeId: sensitive,
      employeeManagement: { secret: sensitive },
      growthAIContext: { secret: sensitive },
    }), 'UTC');
    const keys = new Set(collectKeys(packet).map(key => key.toLowerCase()));
    for (const forbidden of [
      'agreedprice', 'price', 'pricing', 'paymentstatus', 'paymentmethod', 'amountreceived',
      'paymentnote', 'stripepaymentintentid', 'subscriptiondata', 'billing', 'leadid',
      'sourceleadid', 'customersnapshot', 'propertysnapshot', 'requestsnapshot', 'rawinput',
      'formdata', 'tenant', 'assignedemployeeauthuid', 'assignedemployeeid',
      'employeemanagement', 'growthaicontext', 'sourcereferences', 'sourcescopesnapshot',
      'sourcescopesignature', 'reviewedby',
    ]) assert.equal(keys.has(forbidden), false, forbidden);
    assert.equal([...keys].some(key => /stripe|payment|pricing|billing|subscription/.test(key)), false);
    assert.equal(JSON.stringify(packet).includes(sensitive), false);
  });

  test('invalid list document IDs are excluded instead of truncated', async () => {
    const fixture = createAdmin({ bookings: { ['x'.repeat(129)]: baseBooking() } });
    const result = await listEmployeeJobs({ admin: fixture.admin, employee: employeeContext(), now: NOW });
    assert.deepEqual(result.jobs, []);
  });

  test('all output is JSON-safe and malformed optional timestamps become null', () => {
    const timestamp = { toDate: () => new Date('2026-09-03T14:30:00.000Z') };
    const packet = employeeJobPacket('booking-a', baseBooking({ scheduledAt: timestamp }), 'UTC');
    assert.equal(packet.schedule.scheduledAt, '2026-09-03T14:30:00.000Z');
    assert.doesNotThrow(() => JSON.stringify(packet));
    const malformed = employeeJobPacket('booking-b', baseBooking({ scheduledAt: { toDate: () => { throw new Error('bad'); } } }), 'UTC');
    assert.equal(malformed.schedule.scheduledAt, null);
    assert.equal(malformed.schedule.date, '2026-09-03');
  });

  test('field strings and list strings are bounded', () => {
    const packet = employeeJobPacket('booking-a', baseBooking({
      customerName: 'n'.repeat(500),
      address: 'a'.repeat(900),
      fieldInstructions: 'i'.repeat(1500),
      fieldNotes: 'f'.repeat(1500),
      fieldIssue: 'x'.repeat(1000),
    }), 'UTC');
    assert.equal(packet.customer.name.length, 160);
    assert.equal(packet.location.address.length, 500);
    assert.equal(packet.instructions.length, 1000);
    assert.equal(packet.fieldNotes.length, 1000);
    assert.equal(packet.fieldIssue.length, 750);
  });
});

describe('approved and current checklist projection', () => {
  test('server checklist signatures match the shared web parity fixtures', () => {
    for (const fixture of checklistParityFixtures) {
      assert.equal(currentChecklistScopeSignature(fixture.booking), fixture.expectedSignature, fixture.name);
    }
  });

  test('current owner-approved packet returns safe checklist and current progress', () => {
    const result = checklistProjection(baseBooking());
    assert.equal(result.ready, true);
    assert.equal(result.completed, 1);
    assert.equal(result.total, 1);
    assert.equal(result.items[0].completed, true);
    assert.equal('sourceReferences' in result.items[0], false);
    assert.equal('provenance' in result, false);
  });

  test('unapproved and stale approved packets return no task content', () => {
    const unapproved = baseBooking({ jobChecklistSnapshot: { ownerApproved: false, items: [checklistItem()] } });
    assert.deepEqual(checklistProjection(unapproved), {
      ready: false,
      items: [],
      completed: 0,
      total: 0,
      notes: '',
      warnings: ['Owner review is required before this checklist can be used.'],
    });
    const stale = baseBooking();
    stale.serviceType = 'deep';
    assert.equal(checklistProjection(stale).ready, false);
    assert.deepEqual(checklistProjection(stale).items, []);
  });

  test('mismatched field progress is discarded and approved structure initializes incomplete', () => {
    const booking = baseBooking();
    booking.fieldChecklist = [checklistItem({ label: 'Mutated field label', completed: true })];
    const result = checklistProjection(booking);
    assert.equal(result.ready, true);
    assert.equal(result.items[0].label, 'Clean kitchen counter');
    assert.equal(result.items[0].completed, false);
  });

  test('checklist item limits and malformed item content fail closed', () => {
    const oversized = baseBooking();
    oversized.jobChecklistSnapshot.items = Array.from(
      { length: CHECKLIST_MAX_ITEMS + 1 },
      (_, index) => checklistItem({ id: `item-${index}` })
    );
    oversized.jobChecklistSnapshot.provenance.sourceScopeSignature = currentChecklistScopeSignature(oversized);
    assert.equal(checklistProjection(oversized).ready, false);
    assert.deepEqual(checklistProjection(oversized).items, []);

    const malformed = baseBooking();
    malformed.jobChecklistSnapshot.items = [checklistItem({ label: 'x'.repeat(121) })];
    assert.equal(checklistProjection(malformed).ready, false);
  });

  test('checklist total response size is bounded below a multi-megabyte payload', () => {
    const booking = baseBooking();
    booking.jobChecklistSnapshot.items = Array.from({ length: CHECKLIST_MAX_ITEMS }, (_, index) => checklistItem({
      id: `item-${index}`,
      note: 'n'.repeat(500),
      warnings: Array.from({ length: 10 }, () => 'w'.repeat(500)),
    }));
    booking.fieldChecklist = [];
    const result = checklistProjection(booking);
    assert.equal(result.ready, false);
    assert.deepEqual(result.items, []);
    assert.ok(Buffer.byteLength(JSON.stringify(result), 'utf8') < CHECKLIST_MAX_RESPONSE_BYTES);
  });
});
