const { EmployeeAuthorizationError, verifyCanonicalEmployee } = require('./employeeAuthorization');
const { EmployeeJobPacketError } = require('./employeeJobPacketGateway');
const {
  EmployeeWorkAssistantError,
  answerEmployeeWorkAssistant,
  parseEmployeeWorkAssistantRequest,
} = require('./employeeWorkAssistant');
const { EmployeeWorkAssistantUsageError } = require('./employeeWorkAssistantUsage');

const ALLOWED_ORIGINS = new Set([
  'https://servicesos.netlify.app',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'http://127.0.0.1:5174',
  'http://localhost:5174',
]);

function applyCors(req, res) {
  const origin = req.headers?.origin;
  if (ALLOWED_ORIGINS.has(origin)) {
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

function createEmployeeWorkAssistantGatewayHandler({ admin, provider, now = () => new Date() }) {
  return async (req, res) => {
    applyCors(req, res);
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed', code: 'method_not_allowed' });
    const token = bearerToken(req);
    if (!token) return res.status(401).json({ error: 'Authentication required', code: 'unauthenticated' });
    let uid;
    try {
      uid = (await admin.auth().verifyIdToken(token)).uid;
    } catch {
      return res.status(401).json({ error: 'Invalid authentication token', code: 'unauthenticated' });
    }
    try {
      const request = parseEmployeeWorkAssistantRequest(req.body);
      const employee = await verifyCanonicalEmployee({ admin, uid });
      return res.status(200).json(await answerEmployeeWorkAssistant({
        admin, employee, provider, request, now: now(),
      }));
    } catch (error) {
      if (error instanceof EmployeeAuthorizationError) {
        return res.status(403).json({ error: 'Employee access is unavailable.', code: 'forbidden' });
      }
      if (error instanceof EmployeeJobPacketError) {
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      if (error instanceof EmployeeWorkAssistantError || error instanceof EmployeeWorkAssistantUsageError) {
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      return res.status(503).json({
        error: 'Work Assistant is temporarily unavailable.',
        code: 'work_assistant_unavailable',
      });
    }
  };
}

module.exports = { createEmployeeWorkAssistantGatewayHandler };
