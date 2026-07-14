const PROFILE_TENANT_ROLES = new Set(['admin', 'employee', 'customer']);

export function normalizeTenantId(value) {
  const tenantId = typeof value === 'string' ? value.trim() : '';
  if (!tenantId || tenantId.toLowerCase() === 'default') return null;
  return tenantId;
}

export function selectedTenantId(currentTenant) {
  if (typeof currentTenant === 'string') return normalizeTenantId(currentTenant);
  return normalizeTenantId(currentTenant?.id);
}

export function resolveActiveTenantId({ role, profileTenantId, currentTenant }) {
  if (role === 'super-admin') return selectedTenantId(currentTenant);
  if (PROFILE_TENANT_ROLES.has(role)) return normalizeTenantId(profileTenantId);
  return null;
}
