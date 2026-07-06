import { BUSINESS_DAYS, DEFAULT_AVAILABLE_DAYS } from './businessSettingsService';

const DAY_BY_INDEX = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

export function checkBookingDayAvailability({ scheduledAt, availableDays }) {
  const scheduledDate = new Date(scheduledAt);
  if (Number.isNaN(scheduledDate.getTime())) {
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

  const day = DAY_BY_INDEX[scheduledDate.getDay()];
  return {
    available: normalizedDays.includes(day),
    day,
  };
}
