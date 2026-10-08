import { resolveSchedule } from '../../../cloud-functions/bookingSchedule.mjs';

function timeToMinutes(value) {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function findBookingConflict({ bookings, scheduledAt, durationHours, timeZone }) {
  const proposed = resolveSchedule({ scheduledAt }, timeZone);
  if (!proposed.scheduledAt) throw new Error('Valid scheduling evidence and business timezone are required.');

  const proposedStart = timeToMinutes(proposed.startTime);
  const safeDuration = Math.max(Number(durationHours) || 2, 0.5);
  const proposedEnd = proposedStart + safeDuration * 60;

  return (Array.isArray(bookings) ? bookings : []).find(booking => {
    if (String(booking?.status || '').toLowerCase() === 'cancelled') return false;
    const existing = resolveSchedule(booking, timeZone);
    if (!existing.scheduledAt) throw new Error('Existing booking scheduling evidence is unavailable or conflicting.');
    const existingDate = existing.date;
    const existingTime = existing.startTime;
    if (existingDate !== proposed.date) return false;

    const existingStart = timeToMinutes(existingTime);
    if (existingStart === null) return false;
    const existingEnd = timeToMinutes(booking?.endTime);

    if (existingEnd === null) return existingStart === proposedStart;
    const normalizedEnd = existingEnd <= existingStart ? existingEnd + 24 * 60 : existingEnd;
    return proposedStart < normalizedEnd && existingStart < proposedEnd;
  }) || null;
}
