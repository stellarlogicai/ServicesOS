function timeToMinutes(value) {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function localDateParts(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const pad = number => String(number).padStart(2, '0');
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

export function findBookingConflict({ bookings, scheduledAt, durationHours }) {
  const proposed = localDateParts(scheduledAt);
  if (!proposed) return null;

  const proposedStart = timeToMinutes(proposed.time);
  const safeDuration = Math.max(Number(durationHours) || 2, 0.5);
  const proposedEnd = proposedStart + safeDuration * 60;

  return (Array.isArray(bookings) ? bookings : []).find(booking => {
    if (String(booking?.status || '').toLowerCase() === 'cancelled') return false;
    const existingDate = booking?.date || localDateParts(booking?.scheduledAt)?.date;
    const existingTime = booking?.startTime || localDateParts(booking?.scheduledAt)?.time;
    if (existingDate !== proposed.date) return false;

    const existingStart = timeToMinutes(existingTime);
    if (existingStart === null) return false;
    const existingEnd = timeToMinutes(booking?.endTime);

    if (existingEnd === null) return existingStart === proposedStart;
    const normalizedEnd = existingEnd <= existingStart ? existingEnd + 24 * 60 : existingEnd;
    return proposedStart < normalizedEnd && existingStart < proposedEnd;
  }) || null;
}
