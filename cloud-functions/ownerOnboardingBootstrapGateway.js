const { firestoreServerTimestamp } = require('./firebaseAdminCompat');
const {
  INITIAL_ONBOARDING_STATE,
  OWNER_ONBOARDING_SCHEMA_VERSION,
  VALID_ONBOARDING_STATES,
  billingEntitlementForTenant,
  onboardingProgressForState,
  isValidAvailability,
  isValidCanonicalService,
  hasQualifyingEmployee,
} = require('./ownerOnboardingState');
const { isValidCustomBrandingState } = require('./brandingGateway');

const OWNER_ONBOARDING_ALLOWED_ORIGINS = new Set([
  'https://servicesos.netlify.app',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'http://127.0.0.1:5174',
  'http://localhost:5174',
]);

class OwnerOnboardingBootstrapError extends Error {
  constructor(message, { code, status }) {
    super(message);
    this.name = 'OwnerOnboardingBootstrapError';
    this.code = code;
    this.status = status;
  }
}

function failClosed() {
  throw new OwnerOnboardingBootstrapError('Owner onboarding could not be resumed.', {
    code: 'onboarding_conflict',
    status: 409,
  });
}

function applyCors(req, res) {
  const origin = req.headers?.origin;
  if (OWNER_ONBOARDING_ALLOWED_ORIGINS.has(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
  }
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function normalizedText(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

function membershipContains(membership, uid) {
  if (Array.isArray(membership)) return membership.includes(uid);
  return Boolean(
    membership &&
    typeof membership === 'object' &&
    Object.hasOwn(membership, uid) &&
    membership[uid]
  );
}

function isMembershipShape(membership) {
  return membership === undefined || Array.isArray(membership) || (
    membership !== null && typeof membership === 'object'
  );
}

function membershipWithUid(membership, uid) {
  if (Array.isArray(membership)) {
    return membership.includes(uid) ? membership : [...membership, uid];
  }
  if (membership && typeof membership === 'object') {
    return membershipContains(membership, uid) ? membership : { ...membership, [uid]: true };
  }
  return [uid];
}

function hasCompleteBusinessProfile(tenant) {
  return Boolean(
    normalizedText(tenant.businessName) &&
    normalizedText(tenant.businessEmail) &&
    normalizedText(tenant.businessPhone) &&
    normalizedText(tenant.businessAddress) &&
    normalizedText(tenant.businessSettings?.timeZone)
  );
}

async function operationalProjection({ admin, tenantId, tenant }) {
  if (tenant.onboardingState !== 'operational_setup_required') return { servicesPricingComplete: false, availabilityComplete: false, brandingComplete: false };
  const serviceSnapshot = await admin.firestore().collection('tenants').doc(tenantId).collection('serviceCatalog').limit(50).get();
  const brandingSnapshot = await admin.firestore().collection('tenants').doc(tenantId).collection('branding').doc('config').get();
  const servicesPricingComplete = serviceSnapshot.docs.some(doc => isValidCanonicalService(doc.data() || {}));
  const teamSetupComplete = tenant.workforceMode === 'owner_only' || (
    tenant.workforceMode === 'employees' && await hasQualifyingEmployee({ admin, tenantId, tenant })
  );
  return {
    servicesPricingComplete,
    availabilityComplete: isValidAvailability(tenant.businessSettings?.availability),
    brandingComplete: !brandingSnapshot.exists || isValidCustomBrandingState(brandingSnapshot.data() || {}, tenantId),
    teamSetupComplete,
  };
}

async function safeProjection({ admin, tenantId, tenant }) {
  const lifecycleManaged = tenant.onboardingSchemaVersion === OWNER_ONBOARDING_SCHEMA_VERSION;
  const result = {
    success: true,
    onboarding: {
      tenantId,
      onboardingState: tenant.onboardingState || null,
      lifecycleManaged,
      businessProfileComplete: hasCompleteBusinessProfile(tenant),
    },
  };
  if (lifecycleManaged) {
    const operational = await operationalProjection({ admin, tenantId, tenant });
    result.onboarding.billingEntitlement = billingEntitlementForTenant(tenant);
    result.onboarding.servicesPricingComplete = operational.servicesPricingComplete;
    result.onboarding.availabilityComplete = operational.availabilityComplete;
    result.onboarding.brandingComplete = operational.brandingComplete;
    result.onboarding.teamSetupComplete = operational.teamSetupComplete;
    if (tenant.workforceMode === 'owner_only' || tenant.workforceMode === 'employees') {
      result.onboarding.workforceMode = tenant.workforceMode;
    }
    result.onboarding.operationalProgress = onboardingProgressForState(tenant.onboardingState, operational);
  }
  for (const field of ['businessName', 'businessEmail', 'businessPhone', 'businessAddress']) {
    const value = normalizedText(tenant[field]);
    if (value !== null) result.onboarding[field] = value;
  }
  const timeZone = normalizedText(tenant.businessSettings?.timeZone);
  if (timeZone !== null) result.onboarding.timeZone = timeZone;
  return result;
}

function validateExistingOwnerRelationship({ profile, tenant, uid }) {
  if (profile.role !== 'admin' || profile.status !== 'active') failClosed();
  if (!isMembershipShape(tenant.adminUsers) || !isMembershipShape(tenant.users)) failClosed();
  if (
    tenant.onboardingSchemaVersion !== undefined &&
    tenant.onboardingSchemaVersion !== OWNER_ONBOARDING_SCHEMA_VERSION
  ) {
    failClosed();
  }
  if (
    tenant.onboardingOwnerUid !== undefined &&
    tenant.onboardingOwnerUid !== uid
  ) {
    failClosed();
  }
  if (
    tenant.onboardingSchemaVersion === OWNER_ONBOARDING_SCHEMA_VERSION &&
    (!VALID_ONBOARDING_STATES.has(tenant.onboardingState) || tenant.onboardingOwnerUid !== uid)
  ) {
    failClosed();
  }
}

async function bootstrapOwnerOnboarding({ admin, identity }) {
  const uid = normalizedText(identity?.uid);
  if (!uid || uid === 'DEFAULT') failClosed();

  const db = admin.firestore();
  const userRef = db.collection('users').doc(uid);
  const candidateTenantRef = db.collection('tenants').doc();
  const serverTimestamp = () => firestoreServerTimestamp(admin);

  return db.runTransaction(async transaction => {
    const userSnapshot = await transaction.get(userRef);
    const profile = userSnapshot.exists ? (userSnapshot.data() || {}) : null;
    const existingTenantId = normalizedText(profile?.tenantId);

    if (existingTenantId) {
      if (existingTenantId === 'DEFAULT') failClosed();
      const tenantRef = db.collection('tenants').doc(existingTenantId);
      const tenantSnapshot = await transaction.get(tenantRef);
      if (!tenantSnapshot.exists) failClosed();

      const tenant = tenantSnapshot.data() || {};
      validateExistingOwnerRelationship({ profile, tenant, uid });

      const patch = {};
      if (!membershipContains(tenant.adminUsers, uid)) {
        patch.adminUsers = membershipWithUid(tenant.adminUsers, uid);
      }
      if (!membershipContains(tenant.users, uid)) {
        patch.users = membershipWithUid(tenant.users, uid);
      }
      if (Object.keys(patch).length > 0) {
        patch.updatedAt = serverTimestamp();
        transaction.update(tenantRef, patch);
      }
      return safeProjection({ admin, tenantId: existingTenantId, tenant: { ...tenant, ...patch } });
    }

    const tenantId = candidateTenantRef.id;
    if (!normalizedText(tenantId) || tenantId === 'DEFAULT') failClosed();
    const timestamp = serverTimestamp();
    const tenant = {
      adminUsers: [uid],
      users: [uid],
      settings: {},
      status: 'onboarding',
      onboardingSchemaVersion: OWNER_ONBOARDING_SCHEMA_VERSION,
      onboardingOwnerUid: uid,
      onboardingState: INITIAL_ONBOARDING_STATE,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const user = {
      role: 'admin',
      status: 'active',
      tenantId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const email = normalizedText(identity.email);
    const displayName = normalizedText(identity.name);
    if (email !== null) user.email = email;
    if (displayName !== null) user.displayName = displayName;

    transaction.create(candidateTenantRef, tenant);
    transaction.set(userRef, user, { merge: true });
    return safeProjection({ admin, tenantId, tenant });
  });
}

function createOwnerOnboardingBootstrapGatewayHandler({ admin }) {
  return async (req, res) => {
    applyCors(req, res);
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed', code: 'method_not_allowed' });
    }
    if (req.body && (typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length > 0)) {
      return res.status(400).json({ error: 'Invalid request', code: 'invalid_request' });
    }

    const authHeader = req.headers?.authorization || req.headers?.Authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      return res.status(401).json({ error: 'Authentication required', code: 'unauthenticated' });
    }

    let identity;
    try {
      identity = await admin.auth().verifyIdToken(token);
    } catch {
      return res.status(401).json({ error: 'Invalid authentication token', code: 'unauthenticated' });
    }

    try {
      return res.status(200).json(await bootstrapOwnerOnboarding({ admin, identity }));
    } catch (error) {
      if (error instanceof OwnerOnboardingBootstrapError) {
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      return res.status(500).json({
        error: 'Owner onboarding is temporarily unavailable.',
        code: 'bootstrap_failed',
      });
    }
  };
}

module.exports = {
  INITIAL_ONBOARDING_STATE,
  OWNER_ONBOARDING_SCHEMA_VERSION,
  OwnerOnboardingBootstrapError,
  bootstrapOwnerOnboarding,
  createOwnerOnboardingBootstrapGatewayHandler,
  hasCompleteBusinessProfile,
  membershipContains,
  normalizedText,
  safeProjection,
};
