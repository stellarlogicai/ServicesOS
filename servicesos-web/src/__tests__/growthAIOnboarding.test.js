import { describe, expect, it } from 'vitest';
import {
  defaultGrowthAIOnboardingState,
  growthAIOnboardingStorageKey,
  loadGrowthAIOnboardingState,
  saveGrowthAIOnboardingState,
} from '../modules/growthAI/growthAIOnboarding';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, value),
  };
}

describe('GrowthAI first-run onboarding state', () => {
  it('uses a tenant-and-user scoped versioned storage key', () => {
    const first = growthAIOnboardingStorageKey('tenant-a', 'user-a');
    const secondTenant = growthAIOnboardingStorageKey('tenant-b', 'user-a');
    const secondUser = growthAIOnboardingStorageKey('tenant-a', 'user-b');

    expect(first).toContain('growthai-onboarding:v1');
    expect(first).not.toBe(secondTenant);
    expect(first).not.toBe(secondUser);
    expect(growthAIOnboardingStorageKey('', 'user-a')).toBeNull();
  });

  it('defaults safely when nothing has been stored', () => {
    expect(loadGrowthAIOnboardingState({
      tenantId: 'tenant-a',
      userId: 'user-a',
      storage: memoryStorage(),
    })).toEqual(defaultGrowthAIOnboardingState());
  });

  it('persists resumable progress without sharing it across tenants', () => {
    const storage = memoryStorage();
    saveGrowthAIOnboardingState({
      tenantId: 'tenant-a',
      userId: 'user-a',
      storage,
      state: { status: 'in_progress', step: 3 },
    });

    expect(loadGrowthAIOnboardingState({ tenantId: 'tenant-a', userId: 'user-a', storage })).toMatchObject({
      status: 'in_progress',
      step: 3,
    });
    expect(loadGrowthAIOnboardingState({ tenantId: 'tenant-b', userId: 'user-a', storage })).toEqual(defaultGrowthAIOnboardingState());
  });

  it('persists completed or skipped state and clamps invalid step values', () => {
    const storage = memoryStorage();
    const completed = saveGrowthAIOnboardingState({
      tenantId: 'tenant-a',
      userId: 'user-a',
      storage,
      state: { status: 'completed', step: 99 },
    });

    expect(completed).toMatchObject({ status: 'completed', step: 5 });

    const skipped = saveGrowthAIOnboardingState({
      tenantId: 'tenant-a',
      userId: 'user-a',
      storage,
      state: { status: 'skipped', step: 2 },
    });
    expect(skipped).toMatchObject({ status: 'skipped', step: 2 });
  });

  it('falls back safely when stored data is malformed or from another version', () => {
    const storage = memoryStorage();
    const key = growthAIOnboardingStorageKey('tenant-a', 'user-a');
    storage.setItem(key, '{bad-json');
    expect(loadGrowthAIOnboardingState({ tenantId: 'tenant-a', userId: 'user-a', storage })).toEqual(defaultGrowthAIOnboardingState());

    storage.setItem(key, JSON.stringify({ version: 999, status: 'completed', step: 5 }));
    expect(loadGrowthAIOnboardingState({ tenantId: 'tenant-a', userId: 'user-a', storage })).toEqual(defaultGrowthAIOnboardingState());
  });
});
