const { resolveTenantTimeZone } = require('./growthAICreditEntitlement');

class EmployeeAuthorizationError extends Error {
  constructor() {
    super('Employee access is unavailable.');
    this.name = 'EmployeeAuthorizationError';
    this.code = 'forbidden';
    this.status = 403;
  }
}

function tenantMembershipIncludes(membership, uid) {
  if (Array.isArray(membership)) return membership.includes(uid);
  return Boolean(
    membership &&
    typeof membership === 'object' &&
    Object.hasOwn(membership, uid) &&
    membership[uid]
  );
}

function denyEmployeeAccess() {
  throw new EmployeeAuthorizationError();
}

async function verifyCanonicalEmployee({ admin, uid }) {
  if (typeof uid !== 'string' || !uid.trim()) denyEmployeeAccess();

  const db = admin.firestore();
  const profileSnapshot = await db.collection('users').doc(uid).get();
  if (!profileSnapshot.exists) denyEmployeeAccess();

  const profile = profileSnapshot.data() || {};
  const tenantId = typeof profile.tenantId === 'string' ? profile.tenantId.trim() : '';
  if (
    profile.role !== 'employee' ||
    profile.status !== 'active' ||
    !tenantId ||
    tenantId === 'DEFAULT'
  ) {
    denyEmployeeAccess();
  }

  const tenantSnapshot = await db.collection('tenants').doc(tenantId).get();
  if (!tenantSnapshot.exists) denyEmployeeAccess();

  const tenant = tenantSnapshot.data() || {};
  if (!tenantMembershipIncludes(tenant.users, uid)) denyEmployeeAccess();

  return {
    uid,
    tenantId,
    profile,
    tenantTimeZone: resolveTenantTimeZone(tenant),
  };
}

module.exports = {
  EmployeeAuthorizationError,
  tenantMembershipIncludes,
  verifyCanonicalEmployee,
};
