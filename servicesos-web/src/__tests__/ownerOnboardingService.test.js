import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../firebase', () => ({ auth: { currentUser: null } }));

import {
  OwnerOnboardingServiceError,
  bootstrapOwnerOnboarding,
  ownerOnboardingFromTenant,
  resolveOwnerOnboardingGatewayUrl,
  saveOwnerBusinessProfile,
  sanitizeOwnerOnboardingProjection,
} from '../services/ownerOnboardingService';

const validPayload = {
  success: true,
  onboarding: {
    tenantId: 'tenant-a',
    onboardingState: 'business_profile_required',
    lifecycleManaged: true,
    businessProfileComplete: false,
    billingEntitlement: 'inactive',
    operationalProgress: {
      completedSteps: [], nextStep: 'business_profile', operationalComplete: false,
    },
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

  it('submits only canonical business fields to the business profile gateway', async () => {
    const payload = {
      businessName: 'Business', businessEmail: 'owner@example.test', businessPhone: '555-0100',
      businessAddress: '10 Main Street', timezone: 'UTC',
    };
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ...validPayload,
        onboarding: {
          ...validPayload.onboarding,
          onboardingState: 'agreement_required',
          operationalProgress: {
            completedSteps: ['business_profile'],
            nextStep: 'saas_agreement',
            operationalComplete: false,
          },
        },
      }),
    });
    await saveOwnerBusinessProfile(payload, {
      user: { getIdToken: vi.fn().mockResolvedValue('fake-token') }, fetchImpl,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:5001/demo-servicesos-v1-smoke-local/us-central1/ownerOnboardingBusinessProfileGateway',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(payload) })
    );
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    for (const field of ['uid', 'tenantId', 'role', 'adminUsers', 'users', 'status', 'onboardingState']) {
      expect(body).not.toHaveProperty(field);
    }
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
      id: 'managed', onboardingSchemaVersion: 1, onboardingState: 'active', subscriptionStatus: 'active',
      businessName: 'A', businessEmail: 'a@example.test', businessPhone: '555',
      businessAddress: '10 Main', businessSettings: { timeZone: 'UTC' },
    })).toEqual({
      tenantId: 'managed', onboardingState: 'active', lifecycleManaged: true,
      businessProfileComplete: true, billingEntitlement: 'active',
      operationalProgress: {
        completedSteps: ['business_profile', 'saas_agreement', 'subscription_billing', 'operational_setup'],
        nextStep: null, operationalComplete: true,
      },
    });
  });

  it('derives resumable paid operational progress without treating entitlement as completion', () => {
    expect(ownerOnboardingFromTenant({
      id: 'managed', onboardingSchemaVersion: 1,
      onboardingState: 'operational_setup_required', subscriptionStatus: 'active',
    })).toMatchObject({
      billingEntitlement: 'active',
      onboardingState: 'operational_setup_required',
      operationalProgress: {
        completedSteps: ['business_profile', 'saas_agreement', 'subscription_billing'],
        nextStep: 'services_pricing', operationalComplete: false,
      },
    });
  });

  it('accepts only server-derived branding and team-setup progress', () => {
    const payload = {
      success: true,
      onboarding: {
        tenantId: 'managed', onboardingState: 'operational_setup_required', lifecycleManaged: true,
        businessProfileComplete: true, billingEntitlement: 'active',
        servicesPricingComplete: true, availabilityComplete: true, brandingComplete: true,
        operationalProgress: {
          completedSteps: ['business_profile', 'saas_agreement', 'subscription_billing', 'services_pricing', 'availability', 'branding'],
          nextStep: 'team_setup', operationalComplete: false,
        },
      },
    };
    expect(sanitizeOwnerOnboardingProjection(payload).operationalProgress.nextStep).toBe('team_setup');
    payload.onboarding.operationalProgress.nextStep = 'operational_setup';
    expect(() => sanitizeOwnerOnboardingProjection(payload)).toThrow('Owner onboarding returned an invalid response.');
  });

  it('accepts only server-derived Stripe completion and final-acceptance progression', () => {
    const payload = {
      success: true,
      onboarding: {
        tenantId: 'managed', onboardingState: 'operational_setup_required', lifecycleManaged: true,
        businessProfileComplete: true, billingEntitlement: 'active',
        servicesPricingComplete: true, availabilityComplete: true, brandingComplete: true,
        teamSetupComplete: true, stripeConnectComplete: true, stripeConnectStatus: 'ready',
        operationalProgress: {
          completedSteps: ['business_profile', 'saas_agreement', 'subscription_billing', 'services_pricing', 'availability', 'branding', 'team_setup', 'stripe_connect'],
          nextStep: 'final_acceptance', operationalComplete: false,
        },
      },
    };
    expect(sanitizeOwnerOnboardingProjection(payload)).toMatchObject({
      stripeConnectComplete: true,
      stripeConnectStatus: 'ready',
      operationalProgress: { nextStep: 'final_acceptance', operationalComplete: false },
    });
    payload.onboarding.stripeConnectComplete = false;
    expect(() => sanitizeOwnerOnboardingProjection(payload)).toThrow('Owner onboarding returned an invalid response.');
  });
});
