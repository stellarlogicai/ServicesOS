const DEFAULT_MAX_ENTRIES = 10;
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const EVENT_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

function text(value, maximum) {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum ? value : null;
}

function safeLocation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  if (keys.some(key => !['latitude', 'longitude', 'accuracy', 'capturedAt'].includes(key))) return null;
  const latitude = value.latitude;
  const longitude = value.longitude;
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180) return null;
  const location = { latitude, longitude };
  if (Number.isFinite(value.accuracy) && value.accuracy >= 0) location.accuracy = value.accuracy;
  if (typeof value.capturedAt === 'string' && !Number.isNaN(Date.parse(value.capturedAt))) location.capturedAt = value.capturedAt;
  return location;
}

function normalizeEntry(value, nowMs, maxAgeMs) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (Object.keys(value).some(key => !['version', 'employeeUid', 'eventId', 'bookingId', 'location', 'queuedAt'].includes(key))) return null;
  const employeeUid = text(value.employeeUid, 128);
  const bookingId = text(value.bookingId, 128);
  const queuedAtMs = Date.parse(value.queuedAt);
  if (value.version !== 1 || !employeeUid || employeeUid.includes('/') || !bookingId || bookingId.includes('/') ||
      !EVENT_ID_PATTERN.test(value.eventId || '') || !Number.isFinite(queuedAtMs) ||
      queuedAtMs > nowMs + 60_000 || nowMs - queuedAtMs > maxAgeMs) return null;
  const entry = { version: 1, employeeUid, eventId: value.eventId, bookingId, queuedAt: new Date(queuedAtMs).toISOString() };
  if (Object.hasOwn(value, 'location')) {
    const location = safeLocation(value.location);
    if (!location) return null;
    entry.location = location;
  }
  return entry;
}

function createSafetyAlertQueue({ storage, now = () => Date.now(), maxEntries = DEFAULT_MAX_ENTRIES, maxAgeMs = DEFAULT_MAX_AGE_MS }) {
  if (!storage || typeof storage.read !== 'function' || typeof storage.write !== 'function') throw new Error('invalid_storage');
  let mutation = Promise.resolve();

  function serialize(task) {
    const next = mutation.then(task, task);
    mutation = next.catch(() => {});
    return next;
  }

  async function load() {
    let parsed = [];
    let changed = false;
    let raw;
    try {
      raw = await storage.read();
    } catch {
      throw new Error('queue_storage_unavailable');
    }
    try {
      parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) { parsed = []; changed = true; }
    } catch {
      parsed = [];
      changed = true;
    }
    const nowMs = now();
    const entries = parsed.map(value => normalizeEntry(value, nowMs, maxAgeMs)).filter(Boolean).slice(-maxEntries);
    if (entries.length !== parsed.length) changed = true;
    if (changed) await storage.write(JSON.stringify(entries));
    return entries;
  }

  async function enqueueUnsafe({ employeeUid, eventId, bookingId, location }) {
    const candidate = normalizeEntry({
      version: 1,
      employeeUid,
      eventId,
      bookingId,
      ...(location ? { location } : {}),
      queuedAt: new Date(now()).toISOString(),
    }, now(), maxAgeMs);
    if (!candidate) throw new Error('invalid_queue_entry');
    const entries = await load();
    const existing = entries.find(entry => entry.employeeUid === employeeUid && entry.eventId === eventId);
    if (existing) {
      if (JSON.stringify({ ...existing, queuedAt: candidate.queuedAt }) !== JSON.stringify(candidate)) throw new Error('queue_event_conflict');
      return existing;
    }
    if (entries.length >= maxEntries) throw new Error('queue_full');
    entries.push(candidate);
    await storage.write(JSON.stringify(entries));
    return candidate;
  }

  function enqueue(event) {
    return serialize(() => enqueueUnsafe(event));
  }

  async function removeUnsafe(employeeUid, eventId) {
    const entries = await load();
    const remaining = entries.filter(entry => !(entry.employeeUid === employeeUid && entry.eventId === eventId));
    if (remaining.length !== entries.length) await storage.write(JSON.stringify(remaining));
  }


  function remove(employeeUid, eventId) {
    return serialize(() => removeUnsafe(employeeUid, eventId));
  }

  async function forJob(employeeUid, bookingId) {
    const entries = await load();
    return entries.filter(entry => entry.employeeUid === employeeUid && entry.bookingId === bookingId);
  }

  async function forEmployee(employeeUid) {
    const entries = await load();
    return entries.filter(entry => entry.employeeUid === employeeUid);
  }

  return { enqueue, forEmployee, forJob, load, remove };
}

module.exports = { DEFAULT_MAX_AGE_MS, DEFAULT_MAX_ENTRIES, createSafetyAlertQueue, normalizeEntry };
