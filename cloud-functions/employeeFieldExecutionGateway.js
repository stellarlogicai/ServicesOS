const {
  EmployeeAuthorizationError,
  verifyCanonicalEmployee,
} = require('./employeeAuthorization');
const {
  EmployeeFieldExecutionError,
  assertEmployeeCanMutateBooking,
  buildEmployeeFieldExecutionMutation,
  parseEmployeeFieldExecutionRequest,
  safeMutationResult,
} = require('./employeeFieldExecution');

const EMPLOYEE_FIELD_ALLOWED_ORIGINS = new Set([
  'https://servicesos.netlify.app',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'http://127.0.0.1:5174',
  'http://localhost:5174',
]);

function applyCors(req, res) {
  const origin = req.headers?.origin;
  if (EMPLOYEE_FIELD_ALLOWED_ORIGINS.has(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
  }
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function bearerToken(req) {
  const value = req.headers?.authorization || req.headers?.Authorization || '';
  return value.startsWith('Bearer ') ? value.slice('Bearer '.length).trim() : '';
}

async function mutateEmployeeFieldExecution({ admin, employee, request, now = new Date() }) {
  const db = admin.firestore();
  const bookingRef = db.collection('tenants')
    .doc(employee.tenantId)
    .collection('bookings')
    .doc(request.bookingId);
  const nowIso = now.toISOString();

  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(bookingRef);
    if (!snapshot.exists) {
      throw new EmployeeFieldExecutionError('Job unavailable', { code: 'job_unavailable', status: 404 });
    }
    const booking = snapshot.data() || {};
    assertEmployeeCanMutateBooking(booking, employee, now);
    const patch = buildEmployeeFieldExecutionMutation({
      booking,
      request,
      uid: employee.uid,
      now: nowIso,
    });
    if (patch) transaction.update(bookingRef, patch);
    return safeMutationResult(
      snapshot.id || request.bookingId,
      patch ? { ...booking, ...patch } : booking,
      employee,
    );
  });
}

function createEmployeeFieldExecutionGatewayHandler({ admin, now = () => new Date() }) {
  return async (req, res) => {
    applyCors(req, res);
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
      const request = parseEmployeeFieldExecutionRequest(req.body);
      const employee = await verifyCanonicalEmployee({ admin, uid });
      const result = await mutateEmployeeFieldExecution({ admin, employee, request, now: now() });
      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof EmployeeAuthorizationError) {
        return res.status(403).json({ error: 'Employee access is unavailable.', code: 'forbidden' });
      }
      if (error instanceof EmployeeFieldExecutionError) {
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      return res.status(500).json({
        error: 'Employee field updates are temporarily unavailable.',
        code: 'field_execution_service_unavailable',
      });
    }
  };
}

module.exports = {
  createEmployeeFieldExecutionGatewayHandler,
  mutateEmployeeFieldExecution,
};
