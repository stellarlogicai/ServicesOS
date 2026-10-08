export const WEEKDAYS = Object.freeze(['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']);

export function localDateParts(reference, timeZone) {
  if (!timeZone) return null;
  try {
    const values = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(reference);
    const part = type => values.find(value => value.type === type)?.value;
    const index = WEEKDAYS.indexOf(String(part('weekday') || '').toLowerCase());
    return index < 0 ? null : { year: Number(part('year')), month: Number(part('month')), day: Number(part('day')), weekday: index,
      hour: Number(part('hour')), minute: Number(part('minute')), second: Number(part('second')) };
  } catch { return null; }
}

const dateKey = ({ year, month, day }) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
function addDays(parts, count) {
  const value = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + count));
  return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() };
}
function validDate(parts) {
  const value = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  return value.getUTCFullYear() === parts.year && value.getUTCMonth() === parts.month - 1 && value.getUTCDate() === parts.day;
}

export function validScheduleDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [year, month, day] = date.split('-').map(Number);
  return year >= 1000 && validDate({ year, month, day });
}

export function validScheduleTime(time) {
  return typeof time === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time);
}

export function localScheduledStartMillis(date, time, timeZone) {
  if (!validScheduleDate(date) || !validScheduleTime(time) || !timeZone) return null;
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const wallClock = Date.UTC(year, month - 1, day, hour, minute);
  const offsets = new Set();
  // Sample either side of a zone transition, then round-trip candidates. Gaps and folds fail closed.
  for (const hours of [-36, -12, 0, 12, 36]) {
    const instant = wallClock + hours * 3600000;
    const parts = localDateParts(new Date(instant), timeZone);
    if (!parts) return null;
    offsets.add(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - instant);
  }
  const matches = [...offsets].map(offset => wallClock - offset).filter(instant => {
    const parts = localDateParts(new Date(instant), timeZone);
    return parts && parts.year === year && parts.month === month && parts.day === day &&
      parts.hour === hour && parts.minute === minute && parts.second === 0;
  });
  return matches.length === 1 ? matches[0] : null;
}

// Both Assistant routes use current packet timezone authority, never host-local dates.
export function resolveTemporalConstraint(spec, packet, options = {}) {
  if (!spec) return null;
  const timeZone = packet.timeZone;
  const reference = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const local = timeZone && Number.isFinite(reference.getTime()) ? localDateParts(reference, timeZone) : null;
  if (!local) return { error: 'The tenant business timezone is unavailable or invalid, so I cannot resolve that date safely.' };
  let start;
  if (spec.kind === 'today') start = local;
  else if (spec.kind === 'tomorrow') start = addDays(local, 1);
  else if (spec.kind === 'this_week') start = addDays(local, -((local.weekday + 6) % 7)); // Monday starts the V1 business week.
  else if (spec.kind === 'weekday') start = addDays(local, (WEEKDAYS.indexOf(spec.weekday) - local.weekday + 7) % 7); // Next occurrence, including today.
  else if (spec.kind === 'date') start = { year: local.year, month: spec.month, day: spec.day };
  if (!start || !validDate(start)) return { error: 'That calendar date is invalid. Use a valid month and day.' };
  const end = addDays(start, spec.kind === 'this_week' ? 7 : 1);
  return { ...spec, timeZone, referenceDate: dateKey(local), startDate: dateKey(start), endDate: dateKey(end) };
}
