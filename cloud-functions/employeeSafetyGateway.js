const { createHash } = require('node:crypto');
const { EmployeeAuthorizationError, verifyCanonicalEmployee } = require('./employeeAuthorization');
const { bookingMatchesEmployeeJobVisibility, localDateKey } = require('./employeeJobPacketProjection');

const ORIGINS = new Set([
  'https://servicesos.netlify.app',
  'http://localhost:5173', 'http://127.0.0.1:5173',
  'http://localhost:5174', 'http://127.0.0.1:5174',
]);

class SafetyGatewayError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

function invalid() { throw new SafetyGatewayError('invalid_request', 400); }
function unavailable() { throw new SafetyGatewayError('job_unavailable', 404); }
function isObject(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function validBookingId(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0 &&
    value.length <= 128 && !value.includes('/') && value !== '.' && value !== '..';
}

function parseLocation(value) {
  if (!isObject(value) || Object.keys(value).some(key => !['latitude', 'longitude', 'accuracy', 'capturedAt'].includes(key))) invalid();
  const { latitude, longitude, accuracy, capturedAt } = value;
  if (typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
    typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
    (accuracy !== undefined && (typeof accuracy !== 'number' || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100000)) ||
    typeof capturedAt !== 'string' || capturedAt.length > 40 || Number.isNaN(Date.parse(capturedAt))) invalid();
  return { latitude, longitude, accuracy: accuracy ?? null, capturedAt: new Date(capturedAt).toISOString() };
}

function parseRequest(body) {
  if (!isObject(body) || Object.keys(body).some(key => !['eventId', 'bookingId', 'location'].includes(key))) invalid();
  const { eventId, bookingId, location } = body;
  if (typeof eventId !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(eventId) ||
    (bookingId !== undefined && !validBookingId(bookingId))) invalid();
  return {
    eventId,
    ...(bookingId === undefined ? {} : { bookingId }),
    ...(location === undefined ? {} : { location: parseLocation(location) }),
  };
}

function alertDocumentId(uid, eventId) {
  return createHash('sha256').update(`${uid}\0${eventId}`).digest('hex');
}

async function createSafetyAlert({ admin, uid, body, now = new Date() }) {
  const request = parseRequest(body);
  const employee = await verifyCanonicalEmployee({ admin, uid });
  const db = admin.firestore();
  const alertRef = db.collection('tenants').doc(employee.tenantId)
    .collection('safetyAlerts').doc(alertDocumentId(uid, request.eventId));
  return db.runTransaction(async transaction => {
    const prior = await transaction.get(alertRef);
    if (prior.exists) {
      const existing = prior.data() || {};
      if (existing.employeeUid !== uid || existing.eventId !== request.eventId) invalid();
      return { success: true, eventId: existing.eventId, createdAt: existing.createdAt, status: 'sent' };
    }
    if (request.bookingId) {
      const bookingRef = db.collection('tenants').doc(employee.tenantId).collection('bookings').doc(request.bookingId);
      const bookingSnapshot = await transaction.get(bookingRef);
      const today = localDateKey(now, employee.tenantTimeZone);
      if (!bookingSnapshot.exists || !today || !bookingMatchesEmployeeJobVisibility(bookingSnapshot.data(), {
        uid, today, timeZone: employee.tenantTimeZone,
      })) unavailable();
    }
    const createdAt = now.toISOString();
    const record = {
      eventId: request.eventId,
      type: 'safety_alert',
      source: 'employee_app',
      employeeUid: uid,
      employeeDisplayName: typeof employee.profile.displayName === 'string'
        ? employee.profile.displayName.trim().slice(0, 160) : '',
      createdAt,
      bookingId: request.bookingId || null,
      location: request.location || null,
    };
    transaction.create(alertRef, record);
    return { success: true, eventId: request.eventId, createdAt, status: 'sent' };
  });
}

function applyCors(req, res) {
  const origin = req.headers?.origin;
  if (ORIGINS.has(origin)) res.set('Access-Control-Allow-Origin', origin);
  res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function createEmployeeSafetyGatewayHandler({ admin, now = () => new Date() }) {
  return async (req, res) => {
    applyCors(req, res);
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return res.status(405).json({ code: 'method_not_allowed' });
    const header = req.headers?.authorization || '';
    if (!header.startsWith('Bearer ')) return res.status(401).json({ code: 'unauthenticated' });
    let uid;
    try { uid = (await admin.auth().verifyIdToken(header.slice(7).trim())).uid; }
    catch { return res.status(401).json({ code: 'unauthenticated' }); }
    try {
      return res.status(200).json(await createSafetyAlert({ admin, uid, body: req.body, now: now() }));
    } catch (error) {
      if (error instanceof EmployeeAuthorizationError) return res.status(403).json({ code: 'forbidden' });
      if (error instanceof SafetyGatewayError) return res.status(error.status).json({ code: error.code });
      return res.status(503).json({ code: 'safety_unavailable' });
    }
  };
}

module.exports = { SafetyGatewayError, alertDocumentId, createEmployeeSafetyGatewayHandler, createSafetyAlert, parseRequest };
