import { describe, expect, it, vi } from 'vitest';
vi.mock('../firebase', () => ({ db: {} }));
import { buildExistingCustomerBooking } from '../services/existingCustomerBookingService';
import { buildQuoteBookingConversion } from '../services/quoteBookingConversionService';
import { buildBookingAdminUpdatePatch } from '../core/scheduling/schedulingService';
import { resolveBookingSchedule } from '../modules/growthAI/growthAIBookingFacts';
import { findBookingConflict } from '../services/bookingConflictService';
import { checkBookingDayAvailability } from '../services/bookingAvailabilityService';

const timeZone = 'America/Chicago';
const input = { bookingType: 'residential', serviceType: 'Synthetic service', date: '2026-10-08', startTime: '10:00', agreedPrice: 100 };
const create = (schedule = input, zone = timeZone) => buildExistingCustomerBooking({ tenantId: 'synthetic-tenant', customer: { id: 'synthetic-customer' }, bookingInput: schedule, createdBy: 'synthetic-owner', timeZone: zone });
const convert = (schedule = input, zone = timeZone) => buildQuoteBookingConversion({ lead: { id: 'synthetic-lead', tenantId: 'synthetic-tenant', customerId: 'synthetic-customer', estimate: {} }, bookingData: schedule, reviewedBy: 'synthetic-owner', bookingId: 'synthetic-booking', timeZone: zone });

describe('IW-01 scheduling handoff (host timezone must be irrelevant)', () => {
  it('checks the intended tenant day and overlap at midnight', () => {
    const scheduledAt = '2026-10-08T05:30:00.000Z';
    const booking = { date: '2026-10-08', startTime: '00:15', endTime: '01:00' };
    expect(findBookingConflict({ bookings: [booking], scheduledAt, timeZone })).toBe(booking);
    expect(checkBookingDayAvailability({ scheduledAt, timeZone, availableDays: ['thursday'] })).toEqual({ available: true, day: 'thursday' });
  });
  it('does not report clear availability from conflicting or unavailable scheduling evidence', () => {
    const scheduledAt = '2026-10-08T15:00:00.000Z';
    expect(() => findBookingConflict({ scheduledAt, bookings: [], timeZone: null })).toThrow();
    expect(() => checkBookingDayAvailability({ scheduledAt, timeZone: 'Invalid/Zone' })).toThrow();
    expect(() => findBookingConflict({ scheduledAt, timeZone, bookings: [{ ...input, scheduledAt: 'invalid' }] })).toThrow();
  });
  it('creates the canonical Chicago instant and agrees with certified booking facts', () => {
    const result = create();
    expect(result.success).toBe(true);
    expect(result.data.scheduledAt).toBe('2026-10-08T15:00:00.000Z');
    expect(resolveBookingSchedule(result.data, timeZone).error).toBeNull();
  });
  it('converts local estimate appointment input to the same instant', () => {
    expect(convert().booking).toMatchObject({ date: input.date, startTime: input.startTime, scheduledAt: '2026-10-08T15:00:00.000Z' });
  });
  it('converts absolute timestamp-only input using tenant-local fields', () => {
    expect(convert({ scheduledAt: '2026-10-08T15:00:00.000Z', agreedPrice: 100 }).booking).toMatchObject({ date: input.date, startTime: input.startTime });
  });
  it('reschedules to the same canonical instant', () => {
    expect(buildBookingAdminUpdatePatch({ date: input.date, startTime: input.startTime }, { timeZone }).data.scheduledAt).toBe('2026-10-08T15:00:00.000Z');
  });
  it('preserves tenant-local midnight', () => {
    expect(create({ ...input, startTime: '00:30' }).data.scheduledAt).toBe('2026-10-08T05:30:00.000Z');
  });
  it('supports explicitly configured UTC', () => {
    expect(create(input, 'UTC').data.scheduledAt).toBe('2026-10-08T10:00:00.000Z');
  });
  it.each([undefined, '', 'Invalid/Zone'])('rejects unavailable timezone %s on every writer', zone => {
    const args = { ...input };
    expect(buildExistingCustomerBooking({ tenantId: 'synthetic-tenant', customer: { id: 'synthetic-customer' }, bookingInput: args, createdBy: 'synthetic-owner', timeZone: zone }).success).toBe(false);
    expect(() => convert(args, zone === undefined ? null : zone)).toThrow();
    expect(buildBookingAdminUpdatePatch({ date: args.date, startTime: args.startTime }, { timeZone: zone }).success).toBe(false);
  });
  it.each([
    { date: '2026-03-08', startTime: '02:30' },
    { date: '2026-11-01', startTime: '01:30' },
    { date: '2026-02-30' }, { startTime: '24:00' },
    { scheduledAt: 'not-a-timestamp' },
    { scheduledAt: '2026-10-08T10:00:00.000Z' },
  ])('fails closed on invalid, ambiguous, nonexistent or conflicting input %j', patch => {
    const schedule = { ...input, ...patch };
    expect(create(schedule).success).toBe(false);
    expect(() => convert(schedule)).toThrow();
    expect(buildBookingAdminUpdatePatch({ date: schedule.date, startTime: schedule.startTime, ...(Object.hasOwn(schedule, 'scheduledAt') ? { scheduledAt: schedule.scheduledAt } : {}) }, { timeZone }).success).toBe(false);
  });
  it.each([
    ['2026-03-08', '03:30', '2026-03-08T08:30:00.000Z'],
    ['2026-11-01', '02:30', '2026-11-01T08:30:00.000Z'],
  ])('accepts unambiguous DST boundary %s %s', (date, startTime, expected) => {
    expect(create({ ...input, date, startTime }).data.scheduledAt).toBe(expected);
  });
});
