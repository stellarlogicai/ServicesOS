const EMPLOYEE_SESSION_ALLOWED_ORIGINS = new Set([
  'https://servicesos.netlify.app',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'http://127.0.0.1:5174',
  'http://localhost:5174',
]);

const {
  EmployeeAuthorizationError,
  tenantMembershipIncludes,
  verifyCanonicalEmployee,
} = require('./employeeAuthorization');

class EmployeeSessionGatewayError extends Error {
  constructor(message, { code, status }) {
    super(message);
    this.name = 'EmployeeSessionGatewayError';
    this.code = code;
    this.status = status;
  }
}

function applyEmployeeSessionCors(req, res) {
  const origin = req.headers?.origin;
  if (EMPLOYEE_SESSION_ALLOWED_ORIGINS.has(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
  }
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function optionalProfileText(value) {
  return typeof value === 'string' ? value.trim() : null;
}

function buildSafeEmployeeSession({ profile, tenantId, uid }) {
  const employee = {
    uid,
    tenantId,
    role: 'employee',
  };
  const displayName = optionalProfileText(profile.displayName);
  const email = optionalProfileText(profile.email);
  if (displayName !== null) employee.displayName = displayName;
  if (email !== null) employee.email = email;
  return { success: true, employee };
}

function denyEmployeeAccess() {
  throw new EmployeeSessionGatewayError('Employee access is unavailable.', {
    code: 'forbidden',
    status: 403,
  });
}

async function resolveEmployeeSession({ admin, uid }) {
  let context;
  try {
    context = await verifyCanonicalEmployee({ admin, uid });
  } catch (error) {
    if (error instanceof EmployeeAuthorizationError) denyEmployeeAccess();
    throw error;
  }
  const { profile, tenantId } = context;
  if (!profile || !tenantId) {
    denyEmployeeAccess();
  }

  return buildSafeEmployeeSession({ profile, tenantId, uid });
}

function createEmployeeSessionGatewayHandler({ admin }) {
  return async (req, res) => {
    applyEmployeeSessionCors(req, res);

    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed', code: 'method_not_allowed' });
    }
    if (req.body && (typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length > 0)) {
      return res.status(400).json({ error: 'Invalid request', code: 'invalid_request' });
    }

    const authHeader = req.headers?.authorization || req.headers?.Authorization || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length).trim()
      : '';
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
      return res.status(200).json(await resolveEmployeeSession({ admin, uid }));
    } catch (error) {
      if (error instanceof EmployeeSessionGatewayError) {
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      return res.status(500).json({
        error: 'Employee account verification is temporarily unavailable.',
        code: 'verification_failed',
      });
    }
  };
}

module.exports = {
  EmployeeSessionGatewayError,
  buildSafeEmployeeSession,
  createEmployeeSessionGatewayHandler,
  resolveEmployeeSession,
  tenantMembershipIncludes,
};
