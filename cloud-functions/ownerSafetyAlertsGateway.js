const { membershipContains } = require('./ownerOnboardingBootstrapGateway');

const ALERT_LIMIT = 25;
const ORIGINS = new Set([
  'https://servicesos.netlify.app',
  'http://localhost:5173', 'http://127.0.0.1:5173',
  'http://localhost:5174', 'http://127.0.0.1:5174',
]);

class OwnerSafetyError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}

async function listOwnerSafetyAlerts({ admin, uid }) {
  if (!uid) throw new OwnerSafetyError('forbidden', 403);
  const db = admin.firestore();
  const profileSnapshot = await db.collection('users').doc(uid).get();
  const profile = profileSnapshot.data() || {};
  const tenantId = typeof profile.tenantId === 'string' ? profile.tenantId.trim() : '';
  if (!profileSnapshot.exists || profile.role !== 'admin' || profile.status !== 'active' ||
    !tenantId || tenantId === 'DEFAULT') throw new OwnerSafetyError('forbidden', 403);
  const tenantSnapshot = await db.collection('tenants').doc(tenantId).get();
  if (!tenantSnapshot.exists || !membershipContains((tenantSnapshot.data() || {}).adminUsers, uid)) {
    throw new OwnerSafetyError('forbidden', 403);
  }
  const snapshot = await db.collection('tenants').doc(tenantId).collection('safetyAlerts')
    .orderBy('createdAt', 'desc').limit(ALERT_LIMIT).get();
  return {
    success: true,
    alerts: snapshot.docs.map(doc => {
      const source = doc.data() || {};
      const location = source.location;
      return {
        eventId: typeof source.eventId === 'string' ? source.eventId.slice(0, 128) : '',
        employeeDisplayName: typeof source.employeeDisplayName === 'string' ? source.employeeDisplayName.slice(0, 160) : '',
        createdAt: typeof source.createdAt === 'string' && source.createdAt.length <= 40 ? source.createdAt : null,
        bookingId: typeof source.bookingId === 'string' ? source.bookingId.slice(0, 128) : null,
        location: location && Number.isFinite(location.latitude) && Math.abs(location.latitude) <= 90 &&
          Number.isFinite(location.longitude) && Math.abs(location.longitude) <= 180
          ? { latitude: location.latitude, longitude: location.longitude } : null,
      };
    }),
  };
}

function createOwnerSafetyAlertsGatewayHandler({ admin }) {
  return async (req, res) => {
    const origin = req.headers?.origin;
    if (ORIGINS.has(origin)) res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return res.status(405).json({ code: 'method_not_allowed' });
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length) {
      return res.status(400).json({ code: 'invalid_request' });
    }
    const header = req.headers?.authorization || '';
    if (!header.startsWith('Bearer ')) return res.status(401).json({ code: 'unauthenticated' });
    let uid;
    try { uid = (await admin.auth().verifyIdToken(header.slice(7).trim())).uid; }
    catch { return res.status(401).json({ code: 'unauthenticated' }); }
    try { return res.status(200).json(await listOwnerSafetyAlerts({ admin, uid })); }
    catch (error) {
      if (error instanceof OwnerSafetyError) return res.status(error.status).json({ code: error.code });
      return res.status(503).json({ code: 'safety_unavailable' });
    }
  };
}

module.exports = { ALERT_LIMIT, OwnerSafetyError, createOwnerSafetyAlertsGatewayHandler, listOwnerSafetyAlerts };
