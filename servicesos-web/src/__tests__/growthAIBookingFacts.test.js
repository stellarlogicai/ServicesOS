import { describe, expect, it } from 'vitest';
import {
  answerUpcomingBookingCount,
  isUpcomingBookingCountQuestion,
  bookingDateMillis, isEligibleUpcomingBooking, resolveBookingSchedule,
} from '../modules/growthAI/growthAIBookingFacts';

const now = new Date('2026-10-03T09:00:00Z');

describe('GrowthAI upcoming booking facts', () => {
  const scheduled = extra => ({ id: 'scheduled', date: '2026-10-04', startTime: '13:00', status: 'scheduled', ...extra });
  it.each([
    ['America/Chicago', '2026-10-04', '13:00', '2026-10-04T18:00:00Z'],
    ['Asia/Tokyo', '2026-10-05', '00:15', '2026-10-04T15:15:00Z'],
    ['Pacific/Kiritimati', '2026-10-05', '00:15', '2026-10-04T10:15:00Z'],
    ['America/Los_Angeles', '2026-10-03', '23:45', '2026-10-04T06:45:00Z'],
    ['Asia/Kathmandu', '2026-10-04', '13:00', '2026-10-04T07:15:00Z'],
    ['Australia/Lord_Howe', '2026-10-04', '13:00', '2026-10-04T02:00:00Z'],
  ])('resolves the saved local start in %s without host authority', (zone, date, startTime, instant) => {
    const booking = scheduled({ date, startTime }); const before = JSON.stringify(booking);
    expect(resolveBookingSchedule(booking, zone)).toEqual({ startMillis: Date.parse(instant), date, time: startTime, error: null });
    expect(JSON.stringify(booking)).toBe(before);
  });
  it.each(['2026-10-04T18:00:00Z', '2026-10-04T13:00:00-05:00', new Date('2026-10-04T18:00:00Z'),
    { seconds: Date.parse('2026-10-04T18:00:00Z') / 1000, nanoseconds: 0 }])('accepts only an agreeing absolute timestamp: %s', scheduledAt => {
    expect(resolveBookingSchedule(scheduled({ scheduledAt }), 'America/Chicago').error).toBeNull();
  });
  it.each(['2026-10-04T13:00:00Z', 'invalid', '2026-10-04T13:00:00', '2026-02-30T18:00:00Z', null, undefined,
    { seconds: 1, nanoseconds: '0' }, { toMillis: () => NaN }])('does not ignore a conflicting or invalid present timestamp: %s', scheduledAt => {
    const booking = scheduled({ scheduledAt });
    expect(resolveBookingSchedule(booking, 'America/Chicago').startMillis).toBeNull();
    expect(isEligibleUpcomingBooking(booking, now.getTime(), 'America/Chicago')).toBe(false);
    expect(answerUpcomingBookingCount('How many upcoming bookings do I have?', { bookings: [booking], timeZone: 'America/Chicago', now }).kind).toBe('insufficient_evidence');
  });
  it.each([
    { date: undefined }, { date: '2026-02-30' }, { startTime: undefined }, { startTime: '25:00' },
    { startTime: '13:60' }, { startTime: '1:00 PM' }, { date: '2026-03-08', startTime: '02:30' },
    { date: '2026-11-01', startTime: '01:30' },
  ])('rejects incomplete, malformed or ambiguous local scheduling: %j', extra => {
    expect(resolveBookingSchedule(scheduled(extra), 'America/Chicago').error).toBeTruthy();
  });
  it.each(['', 'Not/A_Timezone'])('never substitutes a host timezone for %s', zone => {
    expect(resolveBookingSchedule(scheduled(), zone).error).toBeTruthy();
  });
  it('allows timestamp-only history without inventing a start time or host calendar date', () => {
    const booking = { id: 'timestamp-only', scheduledAt: '2026-10-04T18:00:00Z' };
    expect(resolveBookingSchedule(booking, 'America/Chicago')).toEqual({ startMillis: Date.parse(booking.scheduledAt), date: '2026-10-04', time: '13:00', error: null });
    expect(resolveBookingSchedule(booking, '')).toEqual({ startMillis: Date.parse(booking.scheduledAt), date: '', time: '', error: null });
    expect(resolveBookingSchedule({ ...booking, date: '2026-10-05' }, 'America/Chicago').error).toBeTruthy();
    expect(resolveBookingSchedule({ id: 'date-only', date: '2026-10-04' }, 'America/Chicago').error).toBeTruthy();
  });
  it.each([
    ['2026-10-04T17:59:59Z', true], ['2026-10-04T18:00:00Z', false], ['2026-10-04T18:00:01Z', false],
  ])('uses strict scheduled-start eligibility at %s', (reference, upcoming) => {
    expect(isEligibleUpcomingBooking(scheduled(), Date.parse(reference), 'America/Chicago')).toBe(upcoming);
  });
  it.each([{ status: 'cancelled' }, { status: 'completed' }, { fieldStatus: 'completed' }, { isArchived: true }, { isDeleted: true }])('preserves status exclusion %j', extra => {
    expect(isEligibleUpcomingBooking(scheduled(extra), now.getTime(), 'America/Chicago')).toBe(false);
  });
  it('preserves the active in-progress exception but still requires scheduling evidence', () => {
    expect(isEligibleUpcomingBooking(scheduled({ status: 'in_progress' }), Date.parse('2026-10-05T00:00:00Z'), 'America/Chicago')).toBe(true);
    expect(isEligibleUpcomingBooking(scheduled({ status: 'in_progress', startTime: undefined }), now.getTime(), 'America/Chicago')).toBe(false);
  });
  it('uses the saved Chicago start rather than host-local noon', () => {
    const booking = { id: 'future-start', date: '2026-10-04', startTime: '13:00', status: 'scheduled' };
    expect(bookingDateMillis(booking, 'America/Chicago')).toBe(Date.parse('2026-10-04T18:00:00Z'));
    expect(isEligibleUpcomingBooking(booking, Date.parse('2026-10-04T16:30:00Z'), 'America/Chicago')).toBe(true);
  });
  it.each([
    'How many bookings do I have coming up?',
    'How many upcoming bookings do I have?',
    'How many jobs are scheduled for the future?',
    'do i have any upcoming jobs',
    'Are there any upcoming bookings?',
  ])('recognizes the supported count question: %s', input => {
    expect(isUpcomingBookingCountQuestion(input)).toBe(true);
  });

  it('counts only qualifying canonical upcoming bookings with a controlled date', () => {
    const answer = answerUpcomingBookingCount('How many bookings do I have coming up?', {
      now,
      timeZone: 'UTC',
      bookings: [
        { id: 'today', date: '2026-10-03', startTime: '13:00', status: 'scheduled' },
        { id: 'future', date: '2026-10-06', startTime: '13:00', status: 'scheduled' },
        { id: 'in-progress', date: '2026-10-01', startTime: '13:00', status: 'in_progress' },
        { id: 'cancelled', date: '2026-10-05', status: 'cancelled' },
        { id: 'archived', date: '2026-10-05', status: 'scheduled', isArchived: true },
        { id: 'deleted', date: '2026-10-05', status: 'scheduled', isDeleted: true },
        { id: 'completed', date: '2026-10-05', status: 'completed' },
      ],
    });

    expect(answer).toEqual({
      kind: 'upcoming_booking_count',
      count: 3,
      content: 'You have 3 upcoming bookings.',
    });
  });

  it('answers honestly when no bookings qualify', () => {
    expect(answerUpcomingBookingCount('How many upcoming jobs do I have?', {
      now,
      bookings: [{ id: 'cancelled', date: '2026-10-05', status: 'cancelled' }],
    })).toMatchObject({ count: 0, content: 'You have no upcoming bookings.' });
  });

  it('leaves unsupported wording for the existing conversation router', () => {
    expect(answerUpcomingBookingCount('Organize my filing cabinet', { now, bookings: [] })).toBeNull();
    expect(answerUpcomingBookingCount('Do I have any upcoming jobs? Cancel them.', { now, bookings: [] })).toBeNull();
  });

  it('answers an existence question honestly with no qualifying bookings', () => {
    expect(answerUpcomingBookingCount('do i have any upcoming jobs', { now, bookings: [] }))
      .toMatchObject({ count: 0, content: "No, you don't have any upcoming bookings." });
  });
});
