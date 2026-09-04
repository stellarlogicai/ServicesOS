const {
  EmployeeAuthorizationError,
  verifyCanonicalEmployee,
} = require('./employeeAuthorization');
const {
  JOB_LIST_LIMIT,
  JOB_PACKET_SCHEMA_VERSION,
  bookingMatchesEmployeeJobVisibility,
  employeeJobPacket,
  employeeJobSortValue,
  employeeJobSummary,
  localDateKey,
} = require('./employeeJobPacketProjection');

const EMPLOYEE_JOB_ALLOWED_ORIGINS = new Set([
  'https://servicesos.netlify.app',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'http://127.0.0.1:5174',
  'http://localhost:5174',
]);

class EmployeeJobPacketError extends Error {
  constructor(message, { code, status }) {
    super(message);
    this.name = 'EmployeeJobPacketError';
    this.code = code;
    this.status = status;
  }
}

function applyEmployeeJobCors(req, res) {
  const origin = req.headers?.origin;
  if (EMPLOYEE_JOB_ALLOWED_ORIGINS.has(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
  }
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function invalidRequest() {
  throw new EmployeeJobPacketError('Invalid request', { code: 'invalid_request', status: 400 });
}

function jobUnavailable() {
  throw new EmployeeJobPacketError('Job unavailable', { code: 'job_unavailable', status: 404 });
}

function parseEmployeeJobRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalidRequest();
  const keys = Object.keys(body);
  if (body.action === 'list' && keys.length === 1) return { action: 'list' };
  if (body.action !== 'get' || keys.length !== 2 || !keys.includes('bookingId')) invalidRequest();
  const bookingId = typeof body.bookingId === 'string' ? body.bookingId.trim() : '';
  if (!bookingId || bookingId.length > 128 || bookingId.includes('/') || bookingId === '.' || bookingId === '..') {
    invalidRequest();
  }
  return { action: 'get', bookingId };
}

function bearerToken(req) {
  const value = req.headers?.authorization || req.headers?.Authorization || '';
  return value.startsWith('Bearer ') ? value.slice('Bearer '.length).trim() : '';
}

async function listEmployeeJobs({ admin, employee, now = new Date() }) {
  const today = localDateKey(now, employee.tenantTimeZone);
  if (!today) throw new Error('Current date is unavailable.');

  const query = admin.firestore()
    .collection('tenants')
    .doc(employee.tenantId)
    .collection('bookings')
    .where('assignedEmployeeAuthUid', '==', employee.uid)
    .where('status', 'in', ['scheduled', 'completed'])
    .where('date', '>=', today)
    .orderBy('date', 'desc')
    .limitToLast(JOB_LIST_LIMIT);
  const snapshot = await query.get();
  const visibility = {
    uid: employee.uid,
    today,
    timeZone: employee.tenantTimeZone,
  };
  const jobs = snapshot.docs
    .map(document => ({ id: document.id, booking: document.data() || {} }))
    .filter(({ booking }) => bookingMatchesEmployeeJobVisibility(booking, visibility))
    .map(({ id, booking }) => employeeJobSummary(id, booking, employee.tenantTimeZone))
    .filter(job => job.id)
    .sort((left, right) => employeeJobSortValue(left).localeCompare(employeeJobSortValue(right)))
    .slice(0, JOB_LIST_LIMIT);

  return {
    success: true,
    schemaVersion: JOB_PACKET_SCHEMA_VERSION,
    todayDate: today,
    jobs,
  };
}

async function getEmployeeJob({ admin, employee, bookingId, now = new Date() }) {
  const today = localDateKey(now, employee.tenantTimeZone);
  if (!today) throw new Error('Current date is unavailable.');
  const snapshot = await admin.firestore()
    .collection('tenants')
    .doc(employee.tenantId)
    .collection('bookings')
    .doc(bookingId)
    .get();
  if (!snapshot.exists) jobUnavailable();
  const booking = snapshot.data() || {};
  if (!bookingMatchesEmployeeJobVisibility(booking, {
    uid: employee.uid,
    today,
    timeZone: employee.tenantTimeZone,
  })) {
    jobUnavailable();
  }
  return {
    success: true,
    schemaVersion: JOB_PACKET_SCHEMA_VERSION,
    job: employeeJobPacket(snapshot.id || bookingId, booking, employee.tenantTimeZone),
  };
}

function createEmployeeJobPacketGatewayHandler({ admin, now = () => new Date() }) {
  return async (req, res) => {
    applyEmployeeJobCors(req, res);
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed', code: 'method_not_allowed' });
    }

    const token = bearerToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Authentication required', code: 'unauthenticated' });
    }

    let uid;
    try {
      uid = (await admin.auth().verifyIdToken(token)).uid;
    } catch {
      return res.status(401).json({ error: 'Invalid authentication token', code: 'unauthenticated' });
    }

    try {
      const request = parseEmployeeJobRequest(req.body);
      const employee = await verifyCanonicalEmployee({ admin, uid });
      const result = request.action === 'list'
        ? await listEmployeeJobs({ admin, employee, now: now() })
        : await getEmployeeJob({ admin, employee, bookingId: request.bookingId, now: now() });
      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof EmployeeAuthorizationError) {
        return res.status(403).json({ error: 'Employee access is unavailable.', code: 'forbidden' });
      }
      if (error instanceof EmployeeJobPacketError) {
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      return res.status(500).json({
        error: 'Employee jobs are temporarily unavailable.',
        code: 'job_service_unavailable',
      });
    }
  };
}

module.exports = {
  EmployeeJobPacketError,
  createEmployeeJobPacketGatewayHandler,
  getEmployeeJob,
  listEmployeeJobs,
  parseEmployeeJobRequest,
};
