const {
  OWNER_ONBOARDING_SCHEMA_VERSION,
  membershipContains,
  normalizedText,
  safeProjection,
} = require('./ownerOnboardingBootstrapGateway');
const { firestoreServerTimestamp } = require('./firebaseAdminCompat');
const { isValidIanaTimeZone } = require('./growthAICreditEntitlement');

const ALLOWED_ORIGINS = new Set([
  'https://servicesos.netlify.app',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'http://127.0.0.1:5174',
  'http://localhost:5174',
]);
const PROFILE_FIELDS = ['businessName', 'businessEmail', 'businessPhone', 'businessAddress', 'timezone'];
const LIMITS = { businessName: 160, businessEmail: 254, businessPhone: 40, businessAddress: 500, timezone: 100 };

class BusinessProfileError extends Error {
  constructor(message, { code = 'invalid_request', status = 400, fields } = {}) {
    super(message);
    this.name = 'BusinessProfileError';
    this.code = code;
    this.status = status;
    this.fields = fields;
  }
}

function applyCors(req, res) {
  const origin = req.headers?.origin;
  if (ALLOWED_ORIGINS.has(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
  }
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function validateBusinessProfile(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => !PROFILE_FIELDS.includes(key))) {
    throw new BusinessProfileError('Invalid business profile request.');
  }
  const result = {};
  const fields = {};
  for (const field of PROFILE_FIELDS) {
    const value = normalizedText(body[field]);
    if (!value) fields[field] = 'required';
    else if (value.length > LIMITS[field]) fields[field] = 'too_long';
    else result[field] = value;
  }
  if (result.businessEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.businessEmail)) {
    fields.businessEmail = 'invalid';
  }
  if (result.timezone && !isValidIanaTimeZone(result.timezone)) fields.timezone = 'invalid';
  if (Object.keys(fields).length) {
    throw new BusinessProfileError('Check the required business profile fields.', {
      code: 'validation_failed', status: 422, fields,
    });
  }
  result.businessEmail = result.businessEmail.toLowerCase();
  return result;
}

function conflict() {
  throw new BusinessProfileError('Business profile onboarding is unavailable.', {
    code: 'onboarding_conflict', status: 409,
  });
}

async function saveOwnerBusinessProfile({ admin, identity, profileData }) {
  const uid = normalizedText(identity?.uid);
  if (!uid || uid === 'DEFAULT') conflict();
  const approved = validateBusinessProfile(profileData);
  const db = admin.firestore();
  const userRef = db.collection('users').doc(uid);
  return db.runTransaction(async transaction => {
    const userSnapshot = await transaction.get(userRef);
    if (!userSnapshot.exists) conflict();
    const profile = userSnapshot.data() || {};
    const tenantId = normalizedText(profile.tenantId);
    if (profile.role !== 'admin' || profile.status !== 'active' || !tenantId || tenantId === 'DEFAULT') conflict();
    const tenantRef = db.collection('tenants').doc(tenantId);
    const tenantSnapshot = await transaction.get(tenantRef);
    if (!tenantSnapshot.exists) conflict();
    const tenant = tenantSnapshot.data() || {};
    if (
      tenant.onboardingSchemaVersion !== OWNER_ONBOARDING_SCHEMA_VERSION ||
      tenant.onboardingOwnerUid !== uid ||
      tenant.status !== 'onboarding' ||
      !membershipContains(tenant.adminUsers, uid)
    ) conflict();
    if (tenant.onboardingState === 'agreement_required') return safeProjection({ tenantId, tenant });
    if (tenant.onboardingState !== 'business_profile_required') conflict();

    const patch = {
      businessName: approved.businessName,
      businessEmail: approved.businessEmail,
      businessPhone: approved.businessPhone,
      businessAddress: approved.businessAddress,
      businessSettings: { ...(tenant.businessSettings || {}), timeZone: approved.timezone },
      onboardingState: 'agreement_required',
      updatedAt: firestoreServerTimestamp(admin),
    };
    transaction.update(tenantRef, patch);
    return safeProjection({ tenantId, tenant: { ...tenant, ...patch } });
  });
}

function createOwnerOnboardingBusinessProfileGatewayHandler({ admin }) {
  return async (req, res) => {
    applyCors(req, res);
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed', code: 'method_not_allowed' });
    const authHeader = req.headers?.authorization || req.headers?.Authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) return res.status(401).json({ error: 'Authentication required', code: 'unauthenticated' });
    let identity;
    try { identity = await admin.auth().verifyIdToken(token); }
    catch { return res.status(401).json({ error: 'Invalid authentication token', code: 'unauthenticated' }); }
    try {
      return res.status(200).json(await saveOwnerBusinessProfile({ admin, identity, profileData: req.body }));
    } catch (error) {
      if (error instanceof BusinessProfileError) {
        const body = { error: error.message, code: error.code };
        if (error.fields) body.fields = error.fields;
        return res.status(error.status).json(body);
      }
      return res.status(500).json({ error: 'Business profile could not be saved.', code: 'save_failed' });
    }
  };
}

module.exports = {
  BusinessProfileError,
  createOwnerOnboardingBusinessProfileGatewayHandler,
  isValidTimeZone: isValidIanaTimeZone,
  saveOwnerBusinessProfile,
  validateBusinessProfile,
};
