import { describe, expect, it, vi } from 'vitest';

vi.mock('../firebase', () => ({ db: { id: 'db-test' } }));
vi.mock('firebase/firestore', () => ({
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
vi.mock('../shared/logging/errorLoggingStandard', () => ({
  ERROR_CODES: { FIRESTORE_ERROR: 'FIRESTORE_ERROR', NOT_FOUND: 'NOT_FOUND' },
  SEVERITY: { HIGH: 'high' },
  logError: vi.fn(),
}));

import { buildBookingAdminUpdatePatch } from '../core/scheduling/schedulingService';

const now = '2026-06-30T12:00:00.000Z';

describe('booking admin update whitelist helper', () => {
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

  it('requires at least one supported field', () => {
    expect(buildBookingAdminUpdatePatch({}, { now })).toMatchObject({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Booking update patch must include at least one supported field.',
    });
  });
});
