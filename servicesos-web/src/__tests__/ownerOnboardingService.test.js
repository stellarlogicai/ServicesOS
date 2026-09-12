import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../firebase', () => ({ auth: { currentUser: null } }));

import {
  OwnerOnboardingServiceError,
  bootstrapOwnerOnboarding,
  ownerOnboardingFromTenant,
  resolveOwnerOnboardingGatewayUrl,
  sanitizeOwnerOnboardingProjection,
} from '../services/ownerOnboardingService';

const validPayload = {
  success: true,
  onboarding: {
    tenantId: 'tenant-a',
    onboardingState: 'business_profile_required',
    lifecycleManaged: true,
    businessProfileComplete: false,
  },
};

describe('owner onboarding web service', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'demo-servicesos-v1-smoke-local');
    vi.stubEnv('VITE_USE_FIREBASE_EMULATORS', 'true');
    vi.stubEnv('VITE_FUNCTIONS_URL', 'http://127.0.0.1:5001/demo-servicesos-v1-smoke-local/us-central1');
  });

  afterEach(() => vi.unstubAllEnvs());

  it('posts an empty body with only the authenticated bearer token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => validPayload });
    const result = await bootstrapOwnerOnboarding({
      user: { getIdToken: vi.fn().mockResolvedValue('fake-token') },
      fetchImpl,
    });
    expect(result).toEqual(validPayload.onboarding);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:5001/demo-servicesos-v1-smoke-local/us-central1/ownerOnboardingBootstrapGateway',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer fake-token', 'Content-Type': 'application/json' },
        body: '{}',
      }
    );
    const request = JSON.parse(fetchImpl.mock.calls[0][1].body);
    for (const field of ['uid', 'role', 'tenantId', 'adminUsers', 'status', 'onboardingState']) {
      expect(request).not.toHaveProperty(field);
    }
  });

  it('requires an authenticated Firebase user locally', async () => {
    await expect(bootstrapOwnerOnboarding({ user: null })).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('derives a production endpoint only from validated Firebase configuration', () => {
    expect(resolveOwnerOnboardingGatewayUrl({
      VITE_FIREBASE_PROJECT_ID: 'servicesos-project',
      VITE_USE_FIREBASE_EMULATORS: 'false',
      VITE_FUNCTIONS_URL: '',
    })).toBe('https://us-central1-servicesos-project.cloudfunctions.net/ownerOnboardingBootstrapGateway');
    expect(() => resolveOwnerOnboardingGatewayUrl({
      VITE_FIREBASE_PROJECT_ID: 'demo-servicesos-v1-smoke-local',
      VITE_USE_FIREBASE_EMULATORS: 'false',
    })).toThrow(OwnerOnboardingServiceError);
  });

  it('rejects malformed and privileged response shapes safely', () => {
    for (const payload of [
      null,
      { success: true, onboarding: { ...validPayload.onboarding, tenantId: '' } },
      { success: true, onboarding: { ...validPayload.onboarding, onboardingState: 'attacker_state' } },
      { success: true, onboarding: { ...validPayload.onboarding, lifecycleManaged: false } },
    ]) {
      expect(() => sanitizeOwnerOnboardingProjection(payload)).toThrow(OwnerOnboardingServiceError);
    }
    const result = sanitizeOwnerOnboardingProjection({
      ...validPayload,
      onboarding: { ...validPayload.onboarding, adminUsers: ['private'], stripeSecret: 'private' },
    });
    expect(result).not.toHaveProperty('adminUsers');
    expect(result).not.toHaveProperty('stripeSecret');
  });

  it('normalizes server rejection and invalid JSON without exposing details', async () => {
    const user = { getIdToken: vi.fn().mockResolvedValue('fake-token') };
    await expect(bootstrapOwnerOnboarding({
      user,
      fetchImpl: vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({ code: 'onboarding_conflict', private: 'x' }) }),
    })).rejects.toMatchObject({ code: 'onboarding_conflict', message: 'Owner onboarding could not be resumed.' });
    await expect(bootstrapOwnerOnboarding({
      user,
      fetchImpl: vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new Error('raw'); } }),
    })).rejects.toMatchObject({ message: 'Owner onboarding is temporarily unavailable.' });
  });

  it('distinguishes managed lifecycle tenants from untouched legacy tenants', () => {
    expect(ownerOnboardingFromTenant({ id: 'legacy', status: 'active' })).toEqual({
      tenantId: 'legacy', onboardingState: null, lifecycleManaged: false, businessProfileComplete: false,
    });
    expect(ownerOnboardingFromTenant({
      id: 'managed', onboardingSchemaVersion: 1, onboardingState: 'active',
      businessName: 'A', businessEmail: 'a@example.test', businessPhone: '555',
    })).toEqual({
      tenantId: 'managed', onboardingState: 'active', lifecycleManaged: true, businessProfileComplete: true,
    });
  });
});
