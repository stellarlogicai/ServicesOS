import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../firebase', () => ({ auth: { currentUser: null } }));
import { acceptOwnerSaasAgreement, loadOwnerSaasAgreement, sanitizeAgreement } from '../services/ownerSaasAgreementService';

const agreement = { success: true, agreement: {
  agreementType: 'servicesos_saas', agreementId: 'servicesos-saas-v1', agreementVersionDate: '2026-09-12',
  agreementVersionDateLabel: 'September 12, 2026', termsMarkdown: 'Exact terms', termsHash: 'a'.repeat(64),
  termsFormat: 'markdown', acceptanceLanguage: 'Exact acceptance', accepted: false, onboardingState: 'agreement_required',
} };

describe('owner SaaS agreement service', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'demo-servicesos-v1-smoke-local');
    vi.stubEnv('VITE_USE_FIREBASE_EMULATORS', 'true');
    vi.stubEnv('VITE_FUNCTIONS_URL', 'http://127.0.0.1:5001/demo-servicesos-v1-smoke-local/us-central1');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('loads presentation with bearer auth and no client-selected version', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => agreement });
    await loadOwnerSaasAgreement({ user: { getIdToken: async () => 'fake-token' }, fetchImpl });
    expect(fetchImpl.mock.calls[0][1]).toEqual({ method: 'GET', headers: { Authorization: 'Bearer fake-token', 'Content-Type': 'application/json' } });
  });

  it('accepts using only signer interaction and server-issued assertions', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...agreement, agreement: { ...agreement.agreement, accepted: true, onboardingState: 'billing_required' } }) });
    await acceptOwnerSaasAgreement({ signerName: 'Owner', agreementId: 'servicesos-saas-v1', termsHash: 'a'.repeat(64) }, { user: { getIdToken: async () => 'fake-token' }, fetchImpl });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ signerName: 'Owner', affirmativeAcceptance: true, agreementId: 'servicesos-saas-v1', termsHash: 'a'.repeat(64) });
  });

  it('rejects malformed, altered, or privileged presentation fields', () => {
    expect(() => sanitizeAgreement({ ...agreement, agreement: { ...agreement.agreement, agreementId: 'other' } })).toThrow();
    expect(sanitizeAgreement({ ...agreement, agreement: { ...agreement.agreement, adminUsers: ['private'], stripeSecret: 'private' } })).not.toHaveProperty('adminUsers');
  });
});
