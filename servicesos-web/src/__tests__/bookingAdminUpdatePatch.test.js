import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => ({
  addDoc: vi.fn(),
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn(),
}));

const loggingMocks = vi.hoisted(() => ({
  logError: vi.fn(),
}));

vi.mock('../firebase', () => ({ db: { id: 'db-test' } }));
vi.mock('firebase/firestore', () => firestoreMocks);
vi.mock('../shared/logging/errorLoggingStandard', () => ({
  ERROR_CODES: { FIRESTORE_ERROR: 'FIRESTORE_ERROR', NOT_FOUND: 'NOT_FOUND' },
  SEVERITY: { HIGH: 'high' },
  logError: loggingMocks.logError,
}));

import {
  BOOKING_MANUAL_PAYMENT_STATUS_LABELS,
  BOOKING_PAYMENT_METHOD_LABELS,
  bookingMatchesEmployeeFieldVisibility,
  buildBookingAdminUpdatePatch,
  buildBookingFieldExecutionPatch,
  buildBookingManualPaymentStatusPatch,
  updateBookingAdminFields,
  updateBookingFieldExecution,
  updateBookingManualPaymentStatus,
} from '../core/scheduling/schedulingService';

const now = '2026-06-30T12:00:00.000Z';

describe('booking admin update whitelist helper', () => {
  it('uses only the canonical Auth UID assignment for employee visibility', () => {
    expect(bookingMatchesEmployeeFieldVisibility({
      assignedEmployeeAuthUid: 'employee-a', status: 'scheduled',
    }, 'employee-a')).toBe(true);
    expect(bookingMatchesEmployeeFieldVisibility({
      assignedEmployeeId: 'employee-a', status: 'scheduled',
    }, 'employee-a')).toBe(false);
    expect(bookingMatchesEmployeeFieldVisibility({ status: 'scheduled' }, 'employee-a')).toBe(false);
    expect(bookingMatchesEmployeeFieldVisibility({
      assignedEmployeeAuthUid: 'employee-b', status: 'scheduled',
    }, 'employee-a')).toBe(false);
    expect(bookingMatchesEmployeeFieldVisibility({
      assignedEmployeeAuthUid: 'employee-a', status: 'cancelled',
    }, 'employee-a')).toBe(false);
  });

  it('allows assigning and unassigning only through the canonical Auth UID field', () => {
    expect(buildBookingAdminUpdatePatch({ assignedEmployeeAuthUid: ' employee-a ' }, { now })).toMatchObject({
      success: true,
      data: { assignedEmployeeAuthUid: 'employee-a', updatedAt: now },
    });
    expect(buildBookingAdminUpdatePatch({ assignedEmployeeAuthUid: null }, { now })).toMatchObject({
      success: true,
      data: { assignedEmployeeAuthUid: null, updatedAt: now },
    });
    for (const invalidValue of ['', '   ', 123, 'x'.repeat(129)]) {
      expect(buildBookingAdminUpdatePatch({ assignedEmployeeAuthUid: invalidValue }, { now }).success).toBe(false);
    }
  });
  it('allows date, time, notes update and adds updatedAt', () => {
    const result = buildBookingAdminUpdatePatch({
      date: '2026-07-03',
      startTime: '09:00',
      endTime: '11:00',
      notes: '  Bring blue towels.  ',
    }, { now });

    expect(result).toMatchObject({
      success: true,
      data: {
        date: '2026-07-03',
        startTime: '09:00',
        endTime: '11:00',
        scheduledAt: expect.any(String),
        notes: 'Bring blue towels.',
        updatedAt: now,
      },
    });
    expect(new Date(result.data.scheduledAt).toISOString()).toBe(result.data.scheduledAt);
  });

  it('keeps scheduledAt, date, and startTime consistent when scheduledAt is supplied', () => {
    const result = buildBookingAdminUpdatePatch({
      date: '2026-07-03',
      startTime: '09:00',
      scheduledAt: new Date('2026-07-03T09:00').toISOString(),
    }, { now });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      date: '2026-07-03',
      startTime: '09:00',
      scheduledAt: new Date('2026-07-03T09:00').toISOString(),
    });
  });

  it('rejects inconsistent scheduledAt/date/time input', () => {
    const result = buildBookingAdminUpdatePatch({
      date: '2026-07-04',
      startTime: '09:00',
      scheduledAt: new Date('2026-07-03T09:00').toISOString(),
    }, { now });

    expect(result).toMatchObject({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Booking date must match scheduledAt.',
    });
  });

  it('requires date and startTime together when scheduledAt is omitted', () => {
    const result = buildBookingAdminUpdatePatch({ date: '2026-07-03' }, { now });

    expect(result).toMatchObject({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Booking date and startTime must be supplied together.',
    });
  });

  it('allows only scheduled, completed, and cancelled statuses', () => {
    ['scheduled', 'completed', 'cancelled'].forEach(status => {
      expect(buildBookingAdminUpdatePatch({ status }, { now })).toMatchObject({
        success: true,
        data: { status, updatedAt: now },
      });
    });
  });

  it('rejects deferred and random statuses', () => {
    ['confirmed', 'needs_reschedule', 'in_progress', 'paid', 'random'].forEach(status => {
      expect(buildBookingAdminUpdatePatch({ status }, { now })).toMatchObject({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Booking status is not allowed for owner/admin updates.',
      });
    });
  });

  it('allows numeric non-negative agreedPrice without currency formatting', () => {
    expect(buildBookingAdminUpdatePatch({ agreedPrice: '205.50' }, { now })).toMatchObject({
      success: true,
      data: { agreedPrice: 205.5, updatedAt: now },
    });
    expect(buildBookingAdminUpdatePatch({ agreedPrice: 0 }, { now })).toMatchObject({
      success: true,
      data: { agreedPrice: 0, updatedAt: now },
    });
  });

  it('rejects negative and non-numeric agreedPrice values', () => {
    [-1, 'free', Number.NaN].forEach(agreedPrice => {
      expect(buildBookingAdminUpdatePatch({ agreedPrice }, { now })).toMatchObject({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Booking agreedPrice must be a non-negative number.',
      });
    });
  });

  it('rejects non-string and oversized notes', () => {
    expect(buildBookingAdminUpdatePatch({ notes: 123 }, { now })).toMatchObject({
      success: false,
      message: 'Booking notes must be a string.',
    });
    expect(buildBookingAdminUpdatePatch({ notes: 'x'.repeat(1001) }, { now })).toMatchObject({
      success: false,
      message: 'Booking notes must be 1000 characters or fewer.',
    });
  });

  it('rejects unknown fields predictably', () => {
    const result = buildBookingAdminUpdatePatch({
      notes: 'Allowed',
      surpriseField: 'not allowed',
    }, { now });

    expect(result).toMatchObject({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Unsupported booking update field: surpriseField.',
    });
  });

  it('does not pass through forbidden tenant, customer, payment, employee, source, route, Stripe, refund, or schema fields', () => {
    const forbiddenFields = [
      'tenantId',
      'customerId',
      'customerName',
      'customerSnapshot',
      'propertyId',
      'propertySnapshot',
      'leadId',
      'sourceLeadId',
      'source',
      'createdAt',
      'createdBy',
      'schemaVersion',
      'paymentStatus',
      'payment',
      'payments',
      'stripe',
      'stripePaymentIntentId',
      'employeeId',
      'assignedEmployee',
      'assignment',
      'route',
      'routeOptimization',
      'refund',
      'delete',
      'cancelledBy',
    ];

    forbiddenFields.forEach(field => {
      const result = buildBookingAdminUpdatePatch({ [field]: 'unsafe' }, { now });
      expect(result).toMatchObject({
        success: false,
        error: 'VALIDATION_ERROR',
        message: `Unsupported booking update field: ${field}.`,
      });
      expect(JSON.stringify(result.data)).not.toContain('unsafe');
    });
  });

  it('allows only a validated owner-approved checklist snapshot and derived execution copy', () => {
    const item = {
      id: 'kitchen-countertops',
      area: 'Kitchen / Countertops',
      fixtureOrSurface: 'Countertops',
      label: 'Clean countertops, edges, and corners',
      completionCriteria: 'Countertops and corners are free of visible debris and removable residue.',
      jobAidSteps: [
        { label: 'Clean countertops', note: '', condition: '' },
        { label: 'Clean corners', note: '', condition: '' },
      ],
      warnings: ['Use only an approved surface-compatible method.'],
      note: '',
      condition: '',
      required: true,
      completed: false,
      approvedMethodIds: [],
      preferredMethodId: null,
      sourceReferences: ['01_ServicesOS/Service Checklist/Kitchen Checklist.md'],
    };
    const result = buildBookingAdminUpdatePatch({
      jobChecklistSnapshot: {
        snapshotVersion: 1,
        templateId: 'standard-one-time',
        ownerApproved: true,
        reviewedAt: now,
        reviewedBy: 'owner-a',
        provenance: { ownerApproved: true },
        items: [item],
      },
      fieldChecklist: [item],
    }, { now });

    expect(result).toMatchObject({
      success: true,
      data: {
        jobChecklistSnapshot: { ownerApproved: true, reviewedBy: 'owner-a' },
        fieldChecklist: [item],
        fieldChecklistSummary: { completed: 0, total: 1 },
        updatedAt: now,
      },
    });
    expect(result.data).not.toHaveProperty('paymentStatus');
    expect(result.data.jobChecklistSnapshot.items[0]).toMatchObject({
      fixtureOrSurface: 'Countertops',
      completionCriteria: 'Countertops and corners are free of visible debris and removable residue.',
      jobAidSteps: [
        { label: 'Clean countertops', note: '', condition: '' },
        { label: 'Clean corners', note: '', condition: '' },
      ],
      warnings: ['Use only an approved surface-compatible method.'],
      sourceReferences: ['01_ServicesOS/Service Checklist/Kitchen Checklist.md'],
    });
    expect(result.data.fieldChecklist[0].jobAidSteps).toHaveLength(2);
  });

  it('rejects unapproved checklist snapshots and independently supplied summaries', () => {
    expect(buildBookingAdminUpdatePatch({
      jobChecklistSnapshot: { ownerApproved: false, items: [] },
    }, { now }).success).toBe(false);
    expect(buildBookingAdminUpdatePatch({
      fieldChecklistSummary: { completed: 1, total: 1 },
    }, { now })).toMatchObject({
      success: false,
      message: 'Booking checklist summary is derived from fieldChecklist.',
    });
  });

  it('requires at least one supported field', () => {
    expect(buildBookingAdminUpdatePatch({}, { now })).toMatchObject({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Booking update patch must include at least one supported field.',
    });
  });
});

describe('booking admin update write wrapper', () => {
  beforeEach(() => {
    Object.values(firestoreMocks).forEach(mock => mock.mockReset());
    loggingMocks.logError.mockReset();
    firestoreMocks.doc.mockImplementation((db, ...path) => ({ db, path }));
    firestoreMocks.updateDoc.mockResolvedValue(undefined);
  });

  it('requires tenantId before building or writing', async () => {
    const result = await updateBookingAdminFields('', 'booking-1', { notes: 'ok' }, { now });

    expect(result).toMatchObject({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Tenant ID is required',
    });
    expect(firestoreMocks.doc).not.toHaveBeenCalled();
    expect(firestoreMocks.updateDoc).not.toHaveBeenCalled();
  });

  it('requires bookingId before building or writing', async () => {
    const result = await updateBookingAdminFields('tenant-a', '', { notes: 'ok' }, { now });

    expect(result).toMatchObject({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Booking ID is required',
    });
    expect(firestoreMocks.doc).not.toHaveBeenCalled();
    expect(firestoreMocks.updateDoc).not.toHaveBeenCalled();
  });

  it('requires a non-empty patch and performs no Firestore update', async () => {
    const result = await updateBookingAdminFields('tenant-a', 'booking-1', {}, { now });

    expect(result).toMatchObject({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Booking update patch must include at least one supported field.',
    });
    expect(firestoreMocks.updateDoc).not.toHaveBeenCalled();
  });

  it('writes valid date/time/notes patch only to the tenant-scoped booking document path', async () => {
    const result = await updateBookingAdminFields('tenant-a', 'booking-1', {
      date: '2026-07-03',
      startTime: '09:00',
      endTime: '11:00',
      notes: '  Gate code 1234.  ',
    }, { now });

    expect(result.success).toBe(true);
    expect(firestoreMocks.doc).toHaveBeenCalledWith(
      { id: 'db-test' },
      'tenants',
      'tenant-a',
      'bookings',
      'booking-1'
    );
    expect(firestoreMocks.updateDoc).toHaveBeenCalledWith(
      { db: { id: 'db-test' }, path: ['tenants', 'tenant-a', 'bookings', 'booking-1'] },
      {
        date: '2026-07-03',
        startTime: '09:00',
        endTime: '11:00',
        scheduledAt: expect.any(String),
        notes: 'Gate code 1234.',
        updatedAt: now,
      }
    );
    expect(JSON.stringify(firestoreMocks.updateDoc.mock.calls)).not.toMatch(/lead|customer|payment|employee|stripe|route|refund/i);
  });

  it('writes valid notes-only patch as sanitized payload', async () => {
    const result = await updateBookingAdminFields('tenant-a', 'booking-1', {
      notes: '  Internal owner note.  ',
    }, { now });

    expect(result).toMatchObject({
      success: true,
      data: {
        id: 'booking-1',
        notes: 'Internal owner note.',
        updatedAt: now,
      },
    });
    expect(firestoreMocks.updateDoc).toHaveBeenCalledWith(
      expect.any(Object),
      { notes: 'Internal owner note.', updatedAt: now }
    );
  });

  it('rejects unknown and forbidden fields and performs no Firestore update', async () => {
    const result = await updateBookingAdminFields('tenant-a', 'booking-1', {
      notes: 'ok',
      paymentStatus: 'paid',
    }, { now });

    expect(result).toMatchObject({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Unsupported booking update field: paymentStatus.',
    });
    expect(firestoreMocks.updateDoc).not.toHaveBeenCalled();
  });

  it('rejects invalid status and performs no Firestore update', async () => {
    const result = await updateBookingAdminFields('tenant-a', 'booking-1', {
      status: 'in_progress',
    }, { now });

    expect(result).toMatchObject({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Booking status is not allowed for owner/admin updates.',
    });
    expect(firestoreMocks.updateDoc).not.toHaveBeenCalled();
  });

  it('rejects inconsistent date/time and performs no Firestore update', async () => {
    const result = await updateBookingAdminFields('tenant-a', 'booking-1', {
      date: '2026-07-04',
      startTime: '09:00',
      scheduledAt: new Date('2026-07-03T09:00').toISOString(),
    }, { now });

    expect(result).toMatchObject({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Booking date must match scheduledAt.',
    });
    expect(firestoreMocks.updateDoc).not.toHaveBeenCalled();
  });

  it('does not call delete, assignment, lead, customer, payment, employee, or global collection paths', async () => {
    await updateBookingAdminFields('tenant-a', 'booking-1', { notes: 'ok' }, { now });

    expect(firestoreMocks.deleteDoc).not.toHaveBeenCalled();
    expect(firestoreMocks.collection).not.toHaveBeenCalled();
    expect(firestoreMocks.addDoc).not.toHaveBeenCalled();
    expect(firestoreMocks.getDoc).not.toHaveBeenCalled();
    expect(firestoreMocks.doc.mock.calls).toEqual([[
      { id: 'db-test' },
      'tenants',
      'tenant-a',
      'bookings',
      'booking-1',
    ]]);
  });
});

describe('booking field execution whitelist helper', () => {
  it('allows field status, checklist, notes, and issues without payment fields', () => {
    const result = buildBookingFieldExecutionPatch({
      fieldStatus: 'completed',
      fieldChecklist: [
        { id: 'walkthrough', label: 'Walk through', completed: true },
        { id: 'final', label: 'Final check', completed: false },
      ],
      fieldNotes: '  Finished upstairs first.  ',
      fieldIssue: ' Back door lock sticks. ',
    }, { now, updatedBy: ' field-user-1 ' });

    expect(result).toMatchObject({
      success: true,
      data: {
        fieldStatus: 'completed',
        fieldStatusUpdatedAt: now,
        completedAt: now,
        completedByUid: 'field-user-1',
        fieldChecklist: [
          { id: 'walkthrough', label: 'Walk through', completed: true },
          { id: 'final', label: 'Final check', completed: false },
        ],
        fieldChecklistSummary: { completed: 1, total: 2 },
        fieldNotes: 'Finished upstairs first.',
        fieldIssue: 'Back door lock sticks.',
        updatedAt: now,
      },
    });
    expect(result.data).not.toHaveProperty('paymentStatus');
    expect(result.data).not.toHaveProperty('amountReceived');
    expect(result.data).not.toHaveProperty('stripeCheckoutSessionId');
  });

  it('records start metadata without touching booking or payment status', () => {
    const result = buildBookingFieldExecutionPatch({ fieldStatus: 'in_progress' }, { now, updatedBy: 'field-user-1' });

    expect(result).toMatchObject({
      success: true,
      data: {
        fieldStatus: 'in_progress',
        fieldStartedAt: now,
        fieldStartedByUid: 'field-user-1',
        updatedAt: now,
      },
    });
    expect(result.data).not.toHaveProperty('status');
    expect(result.data).not.toHaveProperty('paymentStatus');
  });

  it('rejects payment, stripe, customer, and broad booking fields', () => {
    [
      'paymentStatus',
      'paymentMethod',
      'amountReceived',
      'stripeCheckoutSessionId',
      'stripePaymentIntentId',
      'customerId',
      'leadId',
      'status',
      'delete',
      'assignedEmployeeId',
    ].forEach(field => {
      expect(buildBookingFieldExecutionPatch({
        fieldStatus: 'in_progress',
        [field]: 'unsafe',
      }, { now })).toMatchObject({
        success: false,
        error: 'VALIDATION_ERROR',
        message: `Unsupported booking field execution field: ${field}.`,
      });
    });
  });

  it('rejects invalid field status and unsafe checklist input', () => {
    expect(buildBookingFieldExecutionPatch({ fieldStatus: 'paid' }, { now })).toMatchObject({
      success: false,
      message: 'Booking field status is not allowed.',
    });
    expect(buildBookingFieldExecutionPatch({ fieldChecklist: [{ id: '', label: 'Missing id' }] }, { now })).toMatchObject({
      success: false,
      message: 'Booking field checklist items require id and label.',
    });
    expect(buildBookingFieldExecutionPatch({
      fieldChecklist: [{ id: 'countertops', label: 'Clean countertops', jobAidSteps: 'not-an-array' }],
    }, { now })).toMatchObject({
      success: false,
      message: 'Booking field checklist job-aid steps must be an array.',
    });
  });
});

describe('booking field execution write wrapper', () => {
  beforeEach(() => {
    firestoreMocks.updateDoc.mockClear();
    firestoreMocks.doc.mockClear();
    firestoreMocks.updateDoc.mockResolvedValue(undefined);
    firestoreMocks.doc.mockImplementation((db, ...path) => ({ db, path }));
  });

  it('writes only sanitized field execution payload to the tenant-scoped booking document path', async () => {
    const result = await updateBookingFieldExecution('tenant-a', 'booking-1', {
      fieldStatus: 'completed',
      fieldChecklist: [{ id: 'final', label: 'Final check', completed: true }],
      fieldNotes: 'Done',
    }, { now, updatedBy: 'field-user-1' });

    expect(result.success).toBe(true);
    expect(firestoreMocks.doc).toHaveBeenCalledWith(
      { id: 'db-test' },
      'tenants',
      'tenant-a',
      'bookings',
      'booking-1'
    );
    expect(firestoreMocks.updateDoc).toHaveBeenCalledWith(
      { db: { id: 'db-test' }, path: ['tenants', 'tenant-a', 'bookings', 'booking-1'] },
      expect.objectContaining({
        fieldStatus: 'completed',
        completedAt: now,
        completedByUid: 'field-user-1',
        fieldChecklistSummary: { completed: 1, total: 1 },
        fieldNotes: 'Done',
        updatedAt: now,
      })
    );
    expect(JSON.stringify(firestoreMocks.updateDoc.mock.calls[0][1])).not.toMatch(/payment|stripe|customer|lead/i);
  });

  it('does not write when field execution patch includes unsafe fields', async () => {
    const result = await updateBookingFieldExecution('tenant-a', 'booking-1', {
      fieldStatus: 'completed',
      paymentStatus: 'paid_in_full',
    }, { now });

    expect(result.success).toBe(false);
    expect(firestoreMocks.updateDoc).not.toHaveBeenCalled();
  });
});

describe('booking manual payment status whitelist helper', () => {
  it('allows each approved manual payment status and adds paymentStatusUpdatedAt', () => {
    Object.keys(BOOKING_MANUAL_PAYMENT_STATUS_LABELS).forEach(paymentStatus => {
      expect(buildBookingManualPaymentStatusPatch({ paymentStatus }, { now })).toMatchObject({
        success: true,
        data: {
          paymentStatus,
          paymentStatusUpdatedAt: now,
        },
      });
    });
  });

  it('allows approved manual payment detail fields and sanitizes values', () => {
    const result = buildBookingManualPaymentStatusPatch({
      paymentStatus: 'paid_cash',
      paymentMethod: 'cash',
      amountReceived: '205.50',
      receivedAt: '2026-07-07',
      paymentNote: '  Paid at walkthrough.  ',
      paymentStatusUpdatedBy: ' admin-uid ',
    }, { now });

    expect(result).toMatchObject({
      success: true,
      data: {
        paymentStatus: 'paid_cash',
        paymentMethod: 'cash',
        amountReceived: 205.5,
        receivedAt: '2026-07-07',
        paymentNote: 'Paid at walkthrough.',
        paymentStatusUpdatedAt: now,
        paymentStatusUpdatedBy: 'admin-uid',
      },
    });
  });

  it('allows each approved payment method', () => {
    Object.keys(BOOKING_PAYMENT_METHOD_LABELS).forEach(paymentMethod => {
      expect(buildBookingManualPaymentStatusPatch({
        paymentStatus: 'not_paid',
        paymentMethod,
      }, { now })).toMatchObject({
        success: true,
        data: {
          paymentStatus: 'not_paid',
          paymentMethod,
          paymentStatusUpdatedAt: now,
        },
      });
    });
  });

  it('allows amountReceived to be zero', () => {
    expect(buildBookingManualPaymentStatusPatch({
      paymentStatus: 'waived_family_discount',
      paymentMethod: 'waived',
      amountReceived: 0,
    }, { now })).toMatchObject({
      success: true,
      data: {
        paymentStatus: 'waived_family_discount',
        paymentMethod: 'waived',
        amountReceived: 0,
      },
    });
  });

  it('preserves blank optional payment details so admins can clear stale values', () => {
    expect(buildBookingManualPaymentStatusPatch({
      paymentStatus: 'payment_issue',
      paymentMethod: '',
      amountReceived: '',
      receivedAt: '',
      paymentNote: '',
    }, { now })).toMatchObject({
      success: true,
      data: {
        paymentStatus: 'payment_issue',
        paymentMethod: '',
        amountReceived: '',
        receivedAt: '',
        paymentNote: '',
        paymentStatusUpdatedAt: now,
      },
    });
  });

  it('rejects unknown and random manual payment statuses', () => {
    ['paid', 'unpaid', 'refunded', 'stripe_paid', 'random'].forEach(paymentStatus => {
      expect(buildBookingManualPaymentStatusPatch({ paymentStatus }, { now })).toMatchObject({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Booking manual payment status is not allowed.',
      });
    });
  });

  it('rejects empty, missing, and non-object patches with standardized validation response', () => {
    expect(buildBookingManualPaymentStatusPatch({}, { now })).toMatchObject({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Booking manual payment status patch must include paymentStatus.',
    });
    expect(buildBookingManualPaymentStatusPatch({ paymentStatusUpdatedBy: 'admin-1' }, { now })).toMatchObject({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Booking manual payment status patch must include paymentStatus.',
    });
    expect(buildBookingManualPaymentStatusPatch(null, { now })).toMatchObject({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Booking manual payment status patch must be an object.',
    });
    expect(buildBookingManualPaymentStatusPatch([], { now })).toMatchObject({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Booking manual payment status patch must be an object.',
    });
  });

  it('rejects unknown, Stripe, payment-intent, payment-link, refund, invoice, platform, payroll, tax, and dispute fields', () => {
    [
      'payment',
      'payments',
      'paymentId',
      'paymentIntentId',
      'stripeCheckoutSessionId',
      'stripePaymentIntentId',
      'stripePaymentStatus',
      'stripePaidAt',
      'stripePaymentLinkUrl',
      'stripe',
      'stripeCustomerId',
      'stripeAccountId',
      'checkoutSessionId',
      'checkoutUrl',
      'paymentLink',
      'paymentLinkId',
      'paymentLinkUrl',
      'invoice',
      'invoiceId',
      'refund',
      'refundId',
      'charge',
      'chargeId',
      'platformFee',
      'applicationFee',
      'payout',
      'dispute',
      'chargeback',
      'payroll',
      'tax',
      'unknownField',
    ].forEach(field => {
      const result = buildBookingManualPaymentStatusPatch({
        paymentStatus: 'not_paid',
        [field]: 'unsafe',
      }, { now });

      expect(result).toMatchObject({
        success: false,
        error: 'VALIDATION_ERROR',
        message: `Unsupported booking manual payment status field: ${field}.`,
      });
      expect(JSON.stringify(result.data)).not.toContain('unsafe');
    });
  });

  it('rejects financial calculation fields', () => {
    [
      'amount',
      'paidAmount',
      'depositAmount',
      'balanceDue',
      'tip',
      'fee',
      'currency',
    ].forEach(field => {
      expect(buildBookingManualPaymentStatusPatch({
        paymentStatus: 'not_paid',
        [field]: 123,
      }, { now })).toMatchObject({
        success: false,
        error: 'VALIDATION_ERROR',
        message: `Unsupported booking manual payment status field: ${field}.`,
      });
    });
  });

  it('rejects invalid amountReceived values', () => {
    [-1, 'free', Number.NaN, Number.POSITIVE_INFINITY].forEach(amountReceived => {
      expect(buildBookingManualPaymentStatusPatch({
        paymentStatus: 'not_paid',
        amountReceived,
      }, { now })).toMatchObject({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Booking amount received must be a non-negative number.',
      });
    });
  });

  it('rejects invalid payment methods', () => {
    ['stripe_paid', 'wire', 'cashapp', 123].forEach(paymentMethod => {
      expect(buildBookingManualPaymentStatusPatch({
        paymentStatus: 'not_paid',
        paymentMethod,
      }, { now })).toMatchObject({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Booking payment method is not allowed.',
      });
    });
  });

  it('rejects invalid receivedAt values', () => {
    ['not-a-date', '2026-02-30', 123].forEach(receivedAt => {
      expect(buildBookingManualPaymentStatusPatch({
        paymentStatus: 'not_paid',
        receivedAt,
      }, { now })).toMatchObject({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Booking receivedAt must be a valid date string.',
      });
    });
  });

  it('rejects non-string and excessive payment notes', () => {
    expect(buildBookingManualPaymentStatusPatch({
      paymentStatus: 'not_paid',
      paymentNote: 123,
    }, { now })).toMatchObject({
      success: false,
      message: 'Booking payment note must be a string.',
    });

    expect(buildBookingManualPaymentStatusPatch({
      paymentStatus: 'not_paid',
      paymentNote: 'x'.repeat(501),
    }, { now })).toMatchObject({
      success: false,
      message: 'Booking payment note must be 500 characters or fewer.',
    });
  });

  it('rejects customer, lead, tenant, source, employee, schema, route, and delete fields', () => {
    [
      'customerId',
      'customerName',
      'customerSnapshot',
      'leadId',
      'sourceLeadId',
      'tenantId',
      'createdAt',
      'createdBy',
      'schemaVersion',
      'employeeId',
      'assignment',
      'route',
      'delete',
      'cancelledBy',
    ].forEach(field => {
      expect(buildBookingManualPaymentStatusPatch({
        paymentStatus: 'not_paid',
        [field]: 'unsafe',
      }, { now })).toMatchObject({
        success: false,
        error: 'VALIDATION_ERROR',
        message: `Unsupported booking manual payment status field: ${field}.`,
      });
    });
  });

  it('accepts safe paymentStatusUpdatedBy from the patch or options', () => {
    expect(buildBookingManualPaymentStatusPatch({
      paymentStatus: 'paid_cash',
      paymentStatusUpdatedBy: '  admin-uid-1  ',
    }, { now })).toMatchObject({
      success: true,
      data: {
        paymentStatus: 'paid_cash',
        paymentStatusUpdatedAt: now,
        paymentStatusUpdatedBy: 'admin-uid-1',
      },
    });

    expect(buildBookingManualPaymentStatusPatch({
      paymentStatus: 'paid_check',
    }, { now, updatedBy: ' admin-uid-2 ' })).toMatchObject({
      success: true,
      data: {
        paymentStatus: 'paid_check',
        paymentStatusUpdatedAt: now,
        paymentStatusUpdatedBy: 'admin-uid-2',
      },
    });
  });

  it('rejects unsafe paymentStatusUpdatedBy values', () => {
    expect(buildBookingManualPaymentStatusPatch({
      paymentStatus: 'paid_cash',
      paymentStatusUpdatedBy: 123,
    }, { now })).toMatchObject({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Booking manual payment status updatedBy must be a string.',
    });

    expect(buildBookingManualPaymentStatusPatch({
      paymentStatus: 'paid_cash',
      paymentStatusUpdatedBy: '   ',
    }, { now })).toMatchObject({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Booking manual payment status updatedBy must not be empty.',
    });
  });
});

describe('booking manual payment status write wrapper', () => {
  beforeEach(() => {
    Object.values(firestoreMocks).forEach(mock => mock.mockReset());
    loggingMocks.logError.mockReset();
    firestoreMocks.doc.mockImplementation((db, ...path) => ({ db, path }));
    firestoreMocks.updateDoc.mockResolvedValue(undefined);
  });

  it('requires tenantId before validating or writing', async () => {
    const result = await updateBookingManualPaymentStatus('', 'booking-1', { paymentStatus: 'not_paid' }, { now });

    expect(result).toMatchObject({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Tenant ID is required',
    });
    expect(firestoreMocks.doc).not.toHaveBeenCalled();
    expect(firestoreMocks.updateDoc).not.toHaveBeenCalled();
  });

  it('requires bookingId before validating or writing', async () => {
    const result = await updateBookingManualPaymentStatus('tenant-a', '', { paymentStatus: 'not_paid' }, { now });

    expect(result).toMatchObject({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Booking ID is required',
    });
    expect(firestoreMocks.doc).not.toHaveBeenCalled();
    expect(firestoreMocks.updateDoc).not.toHaveBeenCalled();
  });

  it('writes only sanitized manual payment status payload to the tenant-scoped booking document path', async () => {
    const result = await updateBookingManualPaymentStatus('tenant-a', 'booking-1', {
      paymentStatus: 'deposit_paid',
      paymentMethod: 'cash',
      amountReceived: '100',
      receivedAt: '2026-07-07',
      paymentNote: '  Cash deposit.  ',
    }, { now, updatedBy: ' admin-uid ' });

    expect(result).toMatchObject({
      success: true,
      data: {
        id: 'booking-1',
        paymentStatus: 'deposit_paid',
        paymentMethod: 'cash',
        amountReceived: 100,
        receivedAt: '2026-07-07',
        paymentNote: 'Cash deposit.',
        paymentStatusUpdatedAt: now,
        paymentStatusUpdatedBy: 'admin-uid',
      },
    });
    expect(firestoreMocks.doc).toHaveBeenCalledWith(
      { id: 'db-test' },
      'tenants',
      'tenant-a',
      'bookings',
      'booking-1'
    );
    expect(firestoreMocks.updateDoc).toHaveBeenCalledWith(
      { db: { id: 'db-test' }, path: ['tenants', 'tenant-a', 'bookings', 'booking-1'] },
      {
        paymentStatus: 'deposit_paid',
        paymentMethod: 'cash',
        amountReceived: 100,
        receivedAt: '2026-07-07',
        paymentNote: 'Cash deposit.',
        paymentStatusUpdatedAt: now,
        paymentStatusUpdatedBy: 'admin-uid',
      }
    );
    expect(JSON.stringify(firestoreMocks.updateDoc.mock.calls)).not.toMatch(/lead|customer|employee|stripe|route|refund|paymentLink|paymentIntent/i);
  });

  it('does not call doc or updateDoc on validation failure', async () => {
    const result = await updateBookingManualPaymentStatus('tenant-a', 'booking-1', {
      paymentStatus: 'not_paid',
      paidAmount: 100,
    }, { now, updatedBy: 'admin-uid' });

    expect(result).toMatchObject({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Unsupported booking manual payment status field: paidAmount.',
    });
    expect(firestoreMocks.doc).not.toHaveBeenCalled();
    expect(firestoreMocks.updateDoc).not.toHaveBeenCalled();
  });

  it('does not call global collections, payment, delete, assignment, lead, or customer paths', async () => {
    await updateBookingManualPaymentStatus('tenant-a', 'booking-1', { paymentStatus: 'paid_external_app' }, { now, updatedBy: 'admin-uid' });

    expect(firestoreMocks.collection).not.toHaveBeenCalled();
    expect(firestoreMocks.addDoc).not.toHaveBeenCalled();
    expect(firestoreMocks.deleteDoc).not.toHaveBeenCalled();
    expect(firestoreMocks.getDoc).not.toHaveBeenCalled();
    expect(firestoreMocks.getDocs).not.toHaveBeenCalled();
    expect(firestoreMocks.doc.mock.calls).toEqual([[
      { id: 'db-test' },
      'tenants',
      'tenant-a',
      'bookings',
      'booking-1',
    ]]);
  });

  it('requires the authenticated actor option before creating a Firestore write', async () => {
    const result = await updateBookingManualPaymentStatus(
      'tenant-a',
      'booking-1',
      { paymentStatus: 'paid_cash' },
      { now }
    );

    expect(result).toMatchObject({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Authenticated user ID is required to update booking manual payment status.',
    });
    expect(firestoreMocks.doc).not.toHaveBeenCalled();
    expect(firestoreMocks.updateDoc).not.toHaveBeenCalled();
  });

  it('rejects a forged actor field instead of trusting caller-provided payment data', async () => {
    const result = await updateBookingManualPaymentStatus(
      'tenant-a',
      'booking-1',
      {
        paymentStatus: 'paid_cash',
        paymentStatusUpdatedBy: 'admin-b',
      },
      { now, updatedBy: 'admin-a' }
    );

    expect(result).toMatchObject({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Booking manual payment status actor is managed by the authenticated session.',
    });
    expect(firestoreMocks.doc).not.toHaveBeenCalled();
    expect(firestoreMocks.updateDoc).not.toHaveBeenCalled();
  });
});
