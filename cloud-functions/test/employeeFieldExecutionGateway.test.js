const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const {
  createEmployeeFieldExecutionGatewayHandler,
  mutateEmployeeFieldExecution,
} = require('../employeeFieldExecutionGateway');
const {
  CHECKLIST_MAX_JOB_AID_STEPS,
  FIELD_ISSUE_MAX_LENGTH,
  FIELD_NOTES_MAX_LENGTH,
  buildEmployeeFieldExecutionMutation,
  parseEmployeeFieldExecutionRequest,
  reconstructChecklist,
} = require('../employeeFieldExecution');
const { currentChecklistScopeSignature } = require('../employeeJobPacketProjection');

const NOW = new Date('2026-09-03T12:00:00.000Z');
const NOW_ISO = NOW.toISOString();

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
    sourceReferences: ['owner-only-source-reference'],
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
    fieldNotes: '',
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
    booking.jobChecklistSnapshot = {
      ownerApproved: true,
      items: [checklistItem()],
      notes: 'Follow the reviewed packet.',
      warnings: ['Watch the loose threshold.'],
      provenance: {
        ownerApproved: true,
        sourceScopeSignature: currentChecklistScopeSignature(booking),
      },
      reviewedBy: 'owner-private-uid',
    };
  }
  return booking;
}

function employeeContext() {
  return { uid: 'employee-a', tenantId: 'tenant-a', tenantTimeZone: 'UTC' };
}

function request(action, overrides = {}) {
  const shared = { action, bookingId: 'booking-a' };
  if (action === 'start') return { ...shared, ...overrides };
  if (action === 'save_checklist') {
    return { ...shared, checklist: [{ id: 'kitchen-counter', completed: true }], ...overrides };
  }
  if (action === 'save_notes') {
    return { ...shared, fieldNotes: 'Finished upstairs.', fieldIssue: 'Loose threshold.', ...overrides };
  }
  return {
    ...shared,
    checklist: [{ id: 'kitchen-counter', completed: true }],
    fieldNotes: 'Finished upstairs.',
    fieldIssue: 'Loose threshold.',
    ...overrides,
  };
}

function createAdmin({
  booking = baseBooking(),
  profile = { role: 'employee', status: 'active', tenantId: 'tenant-a' },
  tenant = { users: ['employee-a'], businessSettings: { timeZone: 'UTC' } },
  tokenUid = 'employee-a',
  tokenError = null,
  beforeTransactionGet,
} = {}) {
  const state = { booking };
  const updates = [];
  let transactionCount = 0;

  const db = {
    collection(name) {
      if (name === 'users') {
        return {
          doc: uid => ({
            get: async () => ({ exists: profile !== undefined, id: uid, data: () => profile }),
          }),
        };
      }
      if (name !== 'tenants') throw new Error(`Unexpected collection ${name}`);
      return {
        doc: tenantId => ({
          get: async () => ({ exists: tenant !== undefined, id: tenantId, data: () => tenant }),
          collection: collectionName => {
            if (collectionName !== 'bookings') throw new Error(`Unexpected collection ${collectionName}`);
            return { doc: id => ({ id, tenantId, collectionName }) };
          },
        }),
      };
    },
    async runTransaction(callback) {
      transactionCount += 1;
      const transaction = {
        async get(ref) {
          if (beforeTransactionGet) beforeTransactionGet(state);
          return {
            id: ref.id,
            exists: state.booking !== undefined && state.booking !== null,
            data: () => state.booking,
          };
        },
        update(ref, patch) {
          updates.push({ ref, patch });
          state.booking = { ...state.booking, ...patch };
        },
      };
      return callback(transaction);
    },
  };

  return {
    admin: {
      auth: () => ({
        verifyIdToken: async () => {
          if (tokenError) throw tokenError;
          return { uid: tokenUid };
        },
      }),
      firestore: () => db,
    },
    state,
    updates,
    get transactionCount() { return transactionCount; },
  };
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

async function callHandler({ admin, method = 'POST', headers = { authorization: 'Bearer valid' }, body = request('start') }) {
  const response = responseRecorder();
  await createEmployeeFieldExecutionGatewayHandler({ admin, now: () => NOW })({ method, headers, body }, response);
  return response;
}

function collectKeys(value, keys = []) {
  if (Array.isArray(value)) value.forEach(item => collectKeys(item, keys));
  else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, nested]) => {
      keys.push(key.toLowerCase());
      collectKeys(nested, keys);
    });
  }
  return keys;
}

describe('employee field execution authorization and request boundary', () => {
  test('missing/invalid auth, invalid employee, and missing membership are denied', async () => {
    assert.equal((await callHandler({ admin: createAdmin().admin, headers: {} })).statusCode, 401);
    assert.equal((await callHandler({ admin: createAdmin({ tokenError: new Error('invalid') }).admin })).statusCode, 401);
    assert.equal((await callHandler({
      admin: createAdmin({ profile: { role: 'admin', status: 'active', tenantId: 'tenant-a' } }).admin,
    })).statusCode, 403);
    assert.equal((await callHandler({ admin: createAdmin({ tenant: { users: ['employee-b'] } }).admin })).statusCode, 403);
  });

  test('only exact action-specific request shapes are accepted', () => {
    assert.deepEqual(parseEmployeeFieldExecutionRequest(request('start')), request('start'));
    assert.deepEqual(parseEmployeeFieldExecutionRequest(request('save_checklist')), request('save_checklist'));
    assert.deepEqual(parseEmployeeFieldExecutionRequest(request('save_notes')), request('save_notes'));
    assert.deepEqual(parseEmployeeFieldExecutionRequest(request('complete')), request('complete'));
    for (const body of [
      {},
      { action: 'unknown', bookingId: 'booking-a' },
      { ...request('start'), tenantId: 'tenant-a' },
      { ...request('start'), uid: 'employee-a' },
      { ...request('start'), role: 'employee' },
      { ...request('start'), fieldStartedAt: NOW_ISO },
      { ...request('save_checklist'), fieldChecklistSummary: { completed: 1, total: 1 } },
      request('save_checklist', { checklist: [{ id: 'kitchen-counter', completed: true, label: 'Changed' }] }),
      request('save_checklist', { checklist: [{ id: 'kitchen-counter', completed: true, required: false }] }),
      request('save_checklist', { checklist: [{ id: 'kitchen-counter', completed: 'yes' }] }),
      request('start', { bookingId: '../booking-a' }),
    ]) assert.throws(() => parseEmployeeFieldExecutionRequest(body), error => error.code === 'invalid_request');
  });

  test('notes and checklist request bounds fail closed', () => {
    assert.throws(
      () => parseEmployeeFieldExecutionRequest(request('save_notes', { fieldNotes: 'x'.repeat(FIELD_NOTES_MAX_LENGTH + 1) })),
      error => error.code === 'invalid_request'
    );
    assert.throws(
      () => parseEmployeeFieldExecutionRequest(request('save_notes', { fieldIssue: 'x'.repeat(FIELD_ISSUE_MAX_LENGTH + 1) })),
      error => error.code === 'invalid_request'
    );
    assert.throws(
      () => parseEmployeeFieldExecutionRequest(request('save_checklist', { checklist: [] })),
      error => error.code === 'invalid_request'
    );
    assert.throws(
      () => parseEmployeeFieldExecutionRequest(request('save_checklist', {
        checklist: Array.from({ length: 501 }, (_, index) => ({ id: `item-${index}`, completed: false })),
      })),
      error => error.code === 'invalid_request'
    );
  });

  test('supports only POST/OPTIONS and controlled local CORS', async () => {
    const admin = createAdmin().admin;
    const options = await callHandler({
      admin,
      method: 'OPTIONS',
      headers: { origin: 'http://127.0.0.1:5173' },
    });
    assert.equal(options.statusCode, 204);
    assert.equal(options.headers['Access-Control-Allow-Origin'], 'http://127.0.0.1:5173');
    assert.equal(options.headers['Access-Control-Allow-Methods'], 'POST, OPTIONS');
    assert.equal((await callHandler({ admin, method: 'GET' })).statusCode, 405);
    const denied = await callHandler({ admin, method: 'OPTIONS', headers: { origin: 'https://evil.example' } });
    assert.equal(denied.headers['Access-Control-Allow-Origin'], undefined);
  });

  test('assignment and eligible job state are rechecked inside the transaction', async () => {
    const variants = [
      { assignedEmployeeAuthUid: 'employee-b' },
      { assignedEmployeeAuthUid: null },
      { status: 'cancelled' },
      { isArchived: true },
      { isDeleted: true },
      { date: '2026-09-02' },
    ];
    for (const variant of variants) {
      const fixture = createAdmin({ booking: baseBooking(variant) });
      await assert.rejects(
        mutateEmployeeFieldExecution({
          admin: fixture.admin,
          employee: employeeContext(),
          request: request('start'),
          now: NOW,
        }),
        error => error.code === 'job_unavailable' && error.status === 404
      );
      assert.equal(fixture.updates.length, 0);
    }
    const missing = createAdmin({ booking: null });
    await assert.rejects(
      mutateEmployeeFieldExecution({
        admin: missing.admin,
        employee: employeeContext(),
        request: request('start'),
        now: NOW,
      }),
      error => error.code === 'job_unavailable' && error.status === 404
    );
  });
});

describe('start and notes mutations', () => {
  test('start writes only server-owned field execution identity and ISO timestamps', async () => {
    const fixture = createAdmin();
    const result = await mutateEmployeeFieldExecution({
      admin: fixture.admin,
      employee: employeeContext(),
      request: request('start'),
      now: NOW,
    });
    assert.equal(fixture.transactionCount, 1);
    assert.deepEqual(fixture.updates[0].patch, {
      fieldStatus: 'in_progress',
      fieldStatusUpdatedAt: NOW_ISO,
      fieldStartedAt: NOW_ISO,
      fieldStartedByUid: 'employee-a',
      updatedAt: NOW_ISO,
    });
    assert.equal(result.job.fieldStatus, 'in_progress');
  });

  test('start retry is a no-op and completed field work cannot be reopened', async () => {
    const inProgress = createAdmin({ booking: baseBooking({
      fieldStatus: 'in_progress',
      fieldStartedAt: '2026-09-03T11:00:00.000Z',
      fieldStartedByUid: 'employee-a',
    }) });
    const result = await mutateEmployeeFieldExecution({
      admin: inProgress.admin,
      employee: employeeContext(),
      request: request('start'),
      now: NOW,
    });
    assert.equal(inProgress.updates.length, 0);
    assert.equal(result.job.fieldStatus, 'in_progress');

    const completed = createAdmin({ booking: baseBooking({ fieldStatus: 'completed' }) });
    await assert.rejects(
      mutateEmployeeFieldExecution({
        admin: completed.admin,
        employee: employeeContext(),
        request: request('start'),
        now: NOW,
      }),
      error => error.code === 'job_state_conflict'
    );
    assert.equal(completed.updates.length, 0);
  });

  test('notes and issues are trimmed, clearable, bounded, and do not accept booking notes', async () => {
    const fixture = createAdmin();
    await mutateEmployeeFieldExecution({
      admin: fixture.admin,
      employee: employeeContext(),
      request: parseEmployeeFieldExecutionRequest(request('save_notes', {
        fieldNotes: '  Finished upstairs.  ',
        fieldIssue: '  Loose threshold.  ',
      })),
      now: NOW,
    });
    assert.deepEqual(fixture.updates[0].patch, {
      fieldNotes: 'Finished upstairs.',
      fieldIssue: 'Loose threshold.',
      updatedAt: NOW_ISO,
    });
    assert.throws(
      () => parseEmployeeFieldExecutionRequest({ ...request('save_notes'), notes: 'private booking note' }),
      error => error.code === 'invalid_request'
    );
    const clear = buildEmployeeFieldExecutionMutation({
      booking: baseBooking(),
      request: parseEmployeeFieldExecutionRequest(request('save_notes', { fieldNotes: ' ', fieldIssue: '' })),
      uid: 'employee-a',
      now: NOW_ISO,
    });
    assert.equal(clear.fieldNotes, '');
    assert.equal(clear.fieldIssue, '');
  });
});

describe('server-owned checklist reconstruction', () => {
  test('applies only completion booleans and preserves canonical approved structure', () => {
    const booking = baseBooking();
    const result = reconstructChecklist(booking, [{ id: 'kitchen-counter', completed: true }]);
    assert.deepEqual(result, [{ ...checklistItem(), completed: true }]);
    assert.equal(result[0].required, true);
    assert.equal(result[0].label, 'Clean kitchen counter');
    assert.deepEqual(result[0].sourceReferences, ['owner-only-source-reference']);
  });

  test('unknown, duplicate, missing, and extra completion IDs are rejected', () => {
    const booking = baseBooking({
      jobChecklistSnapshot: undefined,
    });
    booking.jobChecklistSnapshot = {
      ownerApproved: true,
      items: [checklistItem(), checklistItem({ id: 'optional-floor', label: 'Clean floor', required: false })],
      provenance: { ownerApproved: true },
    };
    booking.jobChecklistSnapshot.provenance.sourceScopeSignature = currentChecklistScopeSignature(booking);
    for (const states of [
      [{ id: 'unknown', completed: true }, { id: 'optional-floor', completed: false }],
      [{ id: 'kitchen-counter', completed: true }, { id: 'kitchen-counter', completed: false }],
      [{ id: 'kitchen-counter', completed: true }],
      [
        { id: 'kitchen-counter', completed: true },
        { id: 'optional-floor', completed: false },
        { id: 'extra', completed: false },
      ],
    ]) assert.throws(() => reconstructChecklist(booking, states), error => error.code === 'invalid_request');
  });

  test('unapproved, stale, malformed, and oversized approved checklists fail closed', () => {
    const unapproved = baseBooking({ jobChecklistSnapshot: { ownerApproved: false, items: [checklistItem()] } });
    assert.throws(
      () => reconstructChecklist(unapproved, [{ id: 'kitchen-counter', completed: true }]),
      error => error.code === 'checklist_unavailable'
    );
    const stale = baseBooking();
    stale.serviceType = 'deep';
    assert.throws(
      () => reconstructChecklist(stale, [{ id: 'kitchen-counter', completed: true }]),
      error => error.code === 'checklist_unavailable'
    );
    const malformed = baseBooking();
    malformed.jobChecklistSnapshot.items[0].jobAidSteps = Array.from(
      { length: CHECKLIST_MAX_JOB_AID_STEPS + 1 },
      () => ({ label: 'Step' })
    );
    assert.throws(
      () => reconstructChecklist(malformed, [{ id: 'kitchen-counter', completed: true }]),
      error => error.code === 'checklist_unavailable'
    );
  });

  test('save checklist computes summary server-side and retries deterministically', async () => {
    const fixture = createAdmin();
    const operation = {
      admin: fixture.admin,
      employee: employeeContext(),
      request: request('save_checklist'),
      now: NOW,
    };
    await mutateEmployeeFieldExecution(operation);
    await mutateEmployeeFieldExecution(operation);
    assert.equal(fixture.updates.length, 2);
    assert.deepEqual(fixture.updates[0].patch.fieldChecklistSummary, { completed: 1, total: 1 });
    assert.deepEqual(fixture.updates[1].patch.fieldChecklist, fixture.updates[0].patch.fieldChecklist);
    assert.equal(fixture.updates[0].patch.fieldChecklist[0].label, 'Clean kitchen counter');
  });
});

describe('completion mutation and concurrency', () => {
  test('complete requires all required outcomes and writes only field execution state', async () => {
    const incomplete = createAdmin();
    await assert.rejects(
      mutateEmployeeFieldExecution({
        admin: incomplete.admin,
        employee: employeeContext(),
        request: request('complete', { checklist: [{ id: 'kitchen-counter', completed: false }] }),
        now: NOW,
      }),
      error => error.code === 'incomplete_required_checklist' && error.status === 422
    );
    assert.equal(incomplete.updates.length, 0);

    const fixture = createAdmin({ booking: baseBooking({
      paymentStatus: 'not_paid',
      agreedPrice: 250,
      schedulePrivate: 'unchanged',
    }) });
    await mutateEmployeeFieldExecution({
      admin: fixture.admin,
      employee: employeeContext(),
      request: request('complete'),
      now: NOW,
    });
    assert.deepEqual(Object.keys(fixture.updates[0].patch).sort(), [
      'completedAt', 'completedByUid', 'fieldChecklist', 'fieldChecklistSummary', 'fieldIssue',
      'fieldNotes', 'fieldStatus', 'fieldStatusUpdatedAt', 'updatedAt',
    ]);
    assert.equal(fixture.state.booking.status, 'scheduled');
    assert.equal(fixture.state.booking.paymentStatus, 'not_paid');
    assert.equal(fixture.state.booking.agreedPrice, 250);
    assert.equal(fixture.state.booking.assignedEmployeeAuthUid, 'employee-a');
    assert.equal(fixture.state.booking.completedAt, NOW_ISO);
    assert.equal(fixture.state.booking.completedByUid, 'employee-a');
  });

  test('complete retry is a safe no-op', async () => {
    const fixture = createAdmin({ booking: baseBooking({
      fieldStatus: 'completed',
      completedAt: '2026-09-03T11:30:00.000Z',
      completedByUid: 'employee-a',
    }) });
    const result = await mutateEmployeeFieldExecution({
      admin: fixture.admin,
      employee: employeeContext(),
      request: request('complete'),
      now: NOW,
    });
    assert.equal(fixture.updates.length, 0);
    assert.equal(result.job.fieldStatus, 'completed');
    assert.equal(fixture.state.booking.completedAt, '2026-09-03T11:30:00.000Z');
  });

  test('transaction fails closed when assignment or checklist scope changes before its read', async () => {
    const reassigned = createAdmin({
      beforeTransactionGet: state => { state.booking = { ...state.booking, assignedEmployeeAuthUid: 'employee-b' }; },
    });
    await assert.rejects(
      mutateEmployeeFieldExecution({
        admin: reassigned.admin,
        employee: employeeContext(),
        request: request('save_checklist'),
        now: NOW,
      }),
      error => error.code === 'job_unavailable'
    );
    assert.equal(reassigned.updates.length, 0);

    const stale = createAdmin({
      beforeTransactionGet: state => { state.booking = { ...state.booking, serviceType: 'deep' }; },
    });
    await assert.rejects(
      mutateEmployeeFieldExecution({
        admin: stale.admin,
        employee: employeeContext(),
        request: request('complete'),
        now: NOW,
      }),
      error => error.code === 'checklist_unavailable'
    );
    assert.equal(stale.updates.length, 0);
  });
});

describe('safe response contract', () => {
  test('successful mutations return only the safe JobPacket projection', async () => {
    const sentinel = 'PRIVATE_SENTINEL';
    const fixture = createAdmin({ booking: baseBooking({
      agreedPrice: sentinel,
      price: sentinel,
      paymentStatus: sentinel,
      stripePaymentIntentId: sentinel,
      notes: sentinel,
      customerSnapshot: { fullName: 'Safe Name', private: sentinel },
      requestSnapshot: { cleaningType: 'standard', frequency: 'one-time', serviceScope: {}, private: sentinel },
      tenant: { users: [sentinel] },
    }) });
    const result = await mutateEmployeeFieldExecution({
      admin: fixture.admin,
      employee: employeeContext(),
      request: request('start'),
      now: NOW,
    });
    assert.deepEqual(Object.keys(result), ['success', 'schemaVersion', 'job']);
    const keys = collectKeys(result);
    for (const forbidden of [
      'agreedprice', 'price', 'paymentstatus', 'stripepaymentintentid',
      'customersnapshot', 'requestsnapshot', 'tenant', 'assignedemployeeauthuid',
      'sourcereferences', 'sourcescopesignature', 'reviewedby',
    ]) assert.equal(keys.includes(forbidden), false, forbidden);
    assert.equal(JSON.stringify(result).includes(sentinel), false);
  });

  test('handler maps field conflicts safely and never returns raw booking details', async () => {
    const fixture = createAdmin({ booking: baseBooking({ fieldStatus: 'completed', agreedPrice: 250 }) });
    const response = await callHandler({ admin: fixture.admin, body: request('start') });
    assert.equal(response.statusCode, 409);
    assert.deepEqual(response.body, { error: 'Job state conflict', code: 'job_state_conflict' });
    assert.equal(JSON.stringify(response.body).includes('250'), false);
  });
});
