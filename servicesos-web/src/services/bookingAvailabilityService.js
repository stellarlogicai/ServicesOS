import { BUSINESS_DAYS, DEFAULT_AVAILABLE_DAYS } from './businessSettingsService';
import { resolveSchedule } from '../../../cloud-functions/bookingSchedule.mjs';

const DAY_BY_INDEX = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

export function checkBookingDayAvailability({ scheduledAt, availableDays, timeZone }) {
  const schedule = resolveSchedule({ scheduledAt }, timeZone);
  if (!schedule.scheduledAt) {
    throw new Error('A valid booking date is required.');
  }

  const requestedDays = availableDays === undefined
    ? DEFAULT_AVAILABLE_DAYS
    : availableDays;

  if (!Array.isArray(requestedDays)) {
    throw new Error('Business availability is invalid.');
  }

  const normalizedDays = BUSINESS_DAYS.filter(day => requestedDays.includes(day));
  if (normalizedDays.length === 0) {
    throw new Error('Business availability has no valid available days.');
  }

  const day = DAY_BY_INDEX[new Date(`${schedule.date}T00:00:00Z`).getUTCDay()];
  return {
    available: normalizedDays.includes(day),
    day,
  };
}
