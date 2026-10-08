import { normalizeOwnerUtterance, resolveOwnerVocabulary } from './growthAIOwnerVocabulary';
import { localScheduledStartMillis, localDateParts, validScheduleDate, validScheduleTime } from './growthAITemporalConstraint';

export const BOOKING_SCHEDULE_UNAVAILABLE = 'Booking scheduling evidence is missing, invalid or conflicting. I cannot safely determine the scheduled start or upcoming bookings.';

function timestampMillis(value) {
  try {
    let result;
    if (typeof value === 'string') {
      const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}):([0-5]\d)(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/);
      if (!match || !validScheduleDate(match[1]) || !validScheduleTime(match[2])) return null;
      result = Date.parse(value);
    } else if (value instanceof Date) result = value.getTime();
    else if (typeof value === 'number') result = value;
    else if (typeof value?.toMillis === 'function') result = value.toMillis();
    else if (typeof value?.toDate === 'function') result = value.toDate().getTime();
    else if (Number.isSafeInteger(value?.seconds)) {
      const nanos = value.nanoseconds ?? 0;
      if (!Number.isInteger(nanos) || nanos < 0 || nanos >= 1000000000) return null;
      result = value.seconds * 1000 + nanos / 1000000;
    }
    return Number.isSafeInteger(result) && Number.isFinite(new Date(result).getTime()) ? result : null;
  } catch { return null; }
}

export function resolveBookingSchedule(booking = {}, timeZone) {
  const hasTimestamp = Object.hasOwn(booking, 'scheduledAt');
  const timestamp = hasTimestamp ? timestampMillis(booking.scheduledAt) : null;
  const hasDate = booking.date != null && booking.date !== '';
  const hasTime = booking.startTime != null && booking.startTime !== '';
  const invalid = () => ({ startMillis: null, date: '', time: '', error: BOOKING_SCHEDULE_UNAVAILABLE });
  if (hasTimestamp && timestamp === null || hasDate && !validScheduleDate(booking.date) || hasTime && !validScheduleTime(booking.startTime)) return invalid();
  if (hasDate && hasTime) {
    const startMillis = localScheduledStartMillis(booking.date, booking.startTime, timeZone);
    if (startMillis === null || hasTimestamp && timestamp !== startMillis) return invalid();
    return { startMillis, date: booking.date, time: booking.startTime, error: null };
  }
  if (timestamp === null) return invalid();
  const parts = localDateParts(new Date(timestamp), timeZone);
  const date = parts ? `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}` : '';
  const time = parts ? `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}` : '';
  if ((hasDate || hasTime) && (!parts || hasDate && booking.date !== date || hasTime && booking.startTime !== time)) return invalid();
  return { startMillis: timestamp, date, time, error: null };
}

export function bookingDateMillis(booking, timeZone) {
  return resolveBookingSchedule(booking, timeZone).startMillis;
}

export function isEligibleUpcomingBooking(booking, nowMillis, timeZone, schedule = resolveBookingSchedule(booking, timeZone)) {
  if (!booking || !booking.id || booking.isArchived === true || booking.isDeleted === true) return false;
  if (booking.status === 'cancelled' || booking.status === 'completed' || booking.fieldStatus === 'completed') return false;
  if (schedule.error || !Number.isFinite(nowMillis)) return false;
  if (booking.status === 'in_progress' || booking.fieldStatus === 'in_progress') return true;

  return Number.isFinite(schedule.startMillis) && schedule.startMillis > nowMillis;
}

export const hasInvalidActiveBookingSchedule = packet => packet?.bookings?.some(record => record.scheduleError &&
  !record.completed && record.status !== 'cancelled');

export function isUpcomingBookingCountQuestion(input) {
  const result = resolveOwnerVocabulary(input);
  return result.kind === 'match' && result.intent.id === 'upcoming_bookings';
}

export function answerUpcomingBookingCount(input, { bookings = [], timeZone, now = new Date() } = {}) {
  if (!isUpcomingBookingCountQuestion(input)) return null;

  const nowMillis = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const count = Array.isArray(bookings)
    ? bookings.filter(booking => isEligibleUpcomingBooking(booking, nowMillis, timeZone)).length
    : 0;
  const existenceQuestion = /^(?:do i have|are there)\b/.test(normalizeOwnerUtterance(input));
  if (Array.isArray(bookings) && bookings.some(booking => booking.id && !booking.isArchived && !booking.isDeleted &&
    !['cancelled', 'completed'].includes(booking.status) && booking.fieldStatus !== 'completed' && resolveBookingSchedule(booking, timeZone).error)) {
    return { kind: 'insufficient_evidence', count: null, content: BOOKING_SCHEDULE_UNAVAILABLE };
  }

  return {
    kind: 'upcoming_booking_count',
    count,
    content: existenceQuestion
      ? (count === 0 ? "No, you don't have any upcoming bookings."
        : `Yes, you have ${count} upcoming ${count === 1 ? 'booking' : 'bookings'}.`)
      : count === 0
      ? 'You have no upcoming bookings.'
      : `You have ${count} upcoming ${count === 1 ? 'booking' : 'bookings'}.`,
  };
}
