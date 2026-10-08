// Shared pure scheduling contract. No host timezone defaults or persistent state.
export function scheduleParts(value, timeZone) {
  if (typeof timeZone !== 'string' || !timeZone.trim()) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(value);
    const get = type => parts.find(part => part.type === type)?.value;
    return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}`, second: Number(get('second')) };
  } catch { return null; }
}
export function validScheduleDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return year >= 1000 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
export const validScheduleTime = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
export function localStartMillis(date, time, timeZone) {
  if (!validScheduleDate(date) || !validScheduleTime(time)) return null;
  const wall = Date.parse(`${date}T${time}:00Z`);
  const offsets = new Set();
  // Round-trip offsets on both sides of a transition. Gaps and folds must fail closed.
  for (const hours of [-36, -12, 0, 12, 36]) {
    const instant = wall + hours * 3600000;
    const parts = scheduleParts(new Date(instant), timeZone);
    if (!parts) return null;
    offsets.add(Date.parse(`${parts.date}T${parts.time}:${String(parts.second).padStart(2, '0')}Z`) - instant);
  }
  const matches = [...offsets].map(offset => wall - offset).filter(instant => {
    const parts = scheduleParts(new Date(instant), timeZone);
    return parts?.date === date && parts.time === time && parts.second === 0;
  });
  return matches.length === 1 ? matches[0] : null;
}
function absoluteMillis(value) {
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
export function resolveSchedule(booking = {}, timeZone) {
  const invalid = () => ({ date: null, startTime: null, scheduledAt: null });
  if (!scheduleParts(new Date(0), timeZone)) return invalid();
  const hasTimestamp = Object.hasOwn(booking, 'scheduledAt');
  const timestamp = hasTimestamp ? absoluteMillis(booking.scheduledAt) : null;
  const hasDate = booking.date != null && booking.date !== '';
  const hasTime = booking.startTime != null && booking.startTime !== '';
  if (hasTimestamp && timestamp === null || hasDate && !validScheduleDate(booking.date) || hasTime && !validScheduleTime(booking.startTime)) return invalid();
  if (hasDate && hasTime) {
    const instant = localStartMillis(booking.date, booking.startTime, timeZone);
    if (instant === null || hasTimestamp && timestamp !== instant) return invalid();
    return { date: booking.date, startTime: booking.startTime, scheduledAt: new Date(instant).toISOString() };
  }
  if (timestamp === null) return invalid();
  const parts = scheduleParts(new Date(timestamp), timeZone);
  if (hasDate && booking.date !== parts.date || hasTime && booking.startTime !== parts.time) return invalid();
  return { date: parts.date, startTime: parts.time, scheduledAt: new Date(timestamp).toISOString() };
}
