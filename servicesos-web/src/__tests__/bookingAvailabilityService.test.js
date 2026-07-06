import { describe, expect, it } from 'vitest';
import { checkBookingDayAvailability } from '../services/bookingAvailabilityService';

describe('checkBookingDayAvailability', () => {
  it('reports an included weekday as available', () => {
    expect(checkBookingDayAvailability({
      scheduledAt: '2026-07-20T10:00:00',
      availableDays: ['monday'],
    })).toEqual({ available: true, day: 'monday' });
  });

  it('reports an excluded weekend day as unavailable', () => {
    expect(checkBookingDayAvailability({
      scheduledAt: '2026-07-19T10:00:00',
      availableDays: ['monday', 'tuesday'],
    })).toEqual({ available: false, day: 'sunday' });
  });

  it('defaults missing availability to Monday through Friday', () => {
    expect(checkBookingDayAvailability({ scheduledAt: '2026-07-20T10:00:00' }).available).toBe(true);
    expect(checkBookingDayAvailability({ scheduledAt: '2026-07-19T10:00:00' }).available).toBe(false);
  });

  it.each([[], ['not-a-day'], null])('fails safely for invalid available days: %j', availableDays => {
    expect(() => checkBookingDayAvailability({
      scheduledAt: '2026-07-20T10:00:00',
      availableDays,
    })).toThrow(/availability/i);
  });
});
