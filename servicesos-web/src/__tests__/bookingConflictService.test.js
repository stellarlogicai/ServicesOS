import { describe, expect, it } from 'vitest';
import { findBookingConflict } from '../services/bookingConflictService';

const proposed = {
  scheduledAt: new Date('2026-07-15T10:00').toISOString(),
  durationHours: 2,
};

describe('findBookingConflict', () => {
  it('finds the same date and start time when an existing end time is missing', () => {
    const booking = { id: 'same-time', date: '2026-07-15', startTime: '10:00' };
    expect(findBookingConflict({ ...proposed, bookings: [booking] })).toBe(booking);
  });

  it('finds overlapping windows', () => {
    const booking = { id: 'overlap', date: '2026-07-15', startTime: '09:30', endTime: '10:30' };
    expect(findBookingConflict({ ...proposed, bookings: [booking] })).toBe(booking);
  });

  it('allows adjacent and non-overlapping same-day bookings', () => {
    const bookings = [
      { id: 'before', date: '2026-07-15', startTime: '08:00', endTime: '10:00' },
      { id: 'after', date: '2026-07-15', startTime: '12:00', endTime: '14:00' },
    ];
    expect(findBookingConflict({ ...proposed, bookings })).toBeNull();
  });

  it('ignores bookings on another date and cancelled bookings', () => {
    const bookings = [
      { id: 'other-date', date: '2026-07-16', startTime: '10:00', endTime: '12:00' },
      { id: 'cancelled', date: '2026-07-15', startTime: '10:00', endTime: '12:00', status: 'cancelled' },
    ];
    expect(findBookingConflict({ ...proposed, bookings })).toBeNull();
  });

  it('uses the existing two-hour duration fallback for a proposed booking', () => {
    const booking = { id: 'fallback-duration', date: '2026-07-15', startTime: '11:30', endTime: '12:30' };
    expect(findBookingConflict({ bookings: [booking], scheduledAt: proposed.scheduledAt })).toBe(booking);
  });
});
