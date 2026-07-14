import { beforeEach, describe, expect, it, vi } from 'vitest';

const getTenant = vi.fn();

vi.mock('../services/tenantService', () => ({ getTenant }));

const {
  isV1SmokeEmulatorEnvironment,
  loadV1SmokeTenants
} = await import('../services/v1SmokeEmulatorService');

describe('V1 smoke emulator tenant fixtures', () => {
  beforeEach(() => {
    getTenant.mockReset();
  });

  it('does not load fixture tenants outside explicit smoke emulator mode', async () => {
    await expect(loadV1SmokeTenants({
      enabled: false,
      projectId: 'cleaning-intake-system'
    })).resolves.toBeNull();

    expect(getTenant).not.toHaveBeenCalled();
  });

  it('rejects production project IDs even when the emulator flag is enabled', () => {
    expect(isV1SmokeEmulatorEnvironment({
      enabled: true,
      projectId: 'cleaning-intake-system'
    })).toBe(false);
  });

  it('loads only the two deterministic smoke tenants in explicit smoke mode', async () => {
    getTenant.mockImplementation(async (tenantId) => ({ id: tenantId }));

    await expect(loadV1SmokeTenants({
      enabled: true,
      projectId: 'demo-servicesos-v1-smoke-local'
    })).resolves.toEqual([
      { id: 'tenant-smoke-a' },
      { id: 'tenant-smoke-b' }
    ]);

    expect(getTenant).toHaveBeenNthCalledWith(1, 'tenant-smoke-a');
    expect(getTenant).toHaveBeenNthCalledWith(2, 'tenant-smoke-b');
  });
});
