import { describe, expect, it } from 'vitest';
import { normalizeTenantId, resolveActiveTenantId, selectedTenantId } from '../contexts/activeTenant';

describe('active tenant resolution contract', () => {
  it.each(['admin', 'employee', 'customer'])(
    'uses the profile tenant for %s and ignores a selected tenant',
    role => {
      expect(resolveActiveTenantId({
        role,
        profileTenantId: 'tenant-profile',
        currentTenant: { id: 'tenant-selected' },
      })).toBe('tenant-profile');
    }
  );

  it('uses only an explicit selected tenant for super-admin', () => {
    expect(resolveActiveTenantId({
      role: 'super-admin',
      profileTenantId: 'tenant-profile-should-not-apply',
      currentTenant: { id: 'tenant-selected' },
    })).toBe('tenant-selected');

    expect(resolveActiveTenantId({
      role: 'super-admin',
      profileTenantId: 'tenant-profile-should-not-apply',
      currentTenant: null,
    })).toBeNull();
  });

  it('rejects empty, DEFAULT, malformed, and unsupported tenant contexts', () => {
    expect(normalizeTenantId(' DEFAULT ')).toBeNull();
    expect(normalizeTenantId('')).toBeNull();
    expect(selectedTenantId({ id: 123 })).toBeNull();
    expect(resolveActiveTenantId({ role: 'unknown', profileTenantId: 'tenant-a' })).toBeNull();
  });
});
