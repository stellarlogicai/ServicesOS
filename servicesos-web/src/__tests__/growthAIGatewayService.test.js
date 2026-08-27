import { beforeEach, describe, expect, it, vi } from 'vitest';

const firebase = vi.hoisted(() => ({
  auth: { currentUser: { getIdToken: vi.fn() } },
}));

vi.mock('../firebase', () => firebase);

import {
  createGrowthAIIdempotencyKey,
  generateGrowthAIContent,
  loadGrowthAICreditBalance,
  routeGrowthAIConversation,
} from '../modules/growthAI/growthAIGatewayService';

describe('GrowthAI gateway client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    firebase.auth.currentUser = { getIdToken: vi.fn().mockResolvedValue('id-token') };
    vi.stubEnv('VITE_FUNCTIONS_URL', 'http://127.0.0.1:5001/demo-servicesos-v1-smoke-local/us-central1');
  });

  it('loads only the server-owned tenant credit balance', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        available: 6,
        reserved: 1,
        buckets: { monthly: 3, promotional: 2, purchased: 1 },
        monthlyAllowance: 100,
        periodStart: '2026-08-01T05:00:00.000Z',
        nextResetAt: '2026-09-01T05:00:00.000Z',
        timeZone: 'America/Chicago',
      }),
    });
    await expect(loadGrowthAICreditBalance('tenant-a')).resolves.toEqual({
      available: 6,
      reserved: 1,
      buckets: { monthly: 3, promotional: 2, purchased: 1 },
      monthlyAllowance: 100,
      periodStart: '2026-08-01T05:00:00.000Z',
      nextResetAt: '2026-09-01T05:00:00.000Z',
      timeZone: 'America/Chicago',
    });
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/getGrowthAICreditBalance$/);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ tenantId: 'tenant-a' });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer id-token');
  });

  it('fails closed on a malformed server-owned credit balance', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        available: 999,
        reserved: 0,
        buckets: { monthly: 'untrusted', promotional: 0, purchased: 0 },
        monthlyAllowance: 100,
        periodStart: '2026-08-01T00:00:00.000Z',
        nextResetAt: '2026-09-01T00:00:00.000Z',
        timeZone: 'UTC',
      }),
    });
    await expect(loadGrowthAICreditBalance('tenant-a')).rejects.toMatchObject({ code: 'credit_balance_invalid' });
  });

  it('rejects inconsistent totals and period metadata from the balance endpoint', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        available: 100,
        reserved: 0,
        buckets: { monthly: 3, promotional: 2, purchased: 1 },
        monthlyAllowance: 100,
        periodStart: 'not-a-date',
        nextResetAt: '2026-09-01T00:00:00.000Z',
        timeZone: 'Central-ish',
      }),
    });
    await expect(loadGrowthAICreditBalance('tenant-a')).rejects.toMatchObject({ code: 'credit_balance_invalid' });
  });

  it('uses an authenticated server request without client-controlled cost, provider, or model', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, draftId: 'draft-a', creditsCharged: 1 }),
    });
    const result = await generateGrowthAIContent({
      tenantId: 'tenant-a',
      actionType: 'marketing_post',
      sourceRefs: {},
      input: { postTypeId: 'availability' },
      idempotencyKey: 'request-a',
      creditCost: 0,
      provider: 'browser-provider',
    });
    expect(result.draftId).toBe('draft-a');
    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body).toEqual({
      tenantId: 'tenant-a',
      actionType: 'marketing_post',
      sourceRefs: {},
      input: { postTypeId: 'availability' },
      idempotencyKey: 'request-a',
    });
    expect(options.headers.Authorization).toBe('Bearer id-token');
  });

  it('reports structured server errors and requires authentication', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Not enough AI credits for this generation.', code: 'insufficient_credits' }),
    });
    await expect(generateGrowthAIContent({
      tenantId: 'tenant-a', actionType: 'marketing_post', sourceRefs: {}, input: {}, idempotencyKey: 'request-a',
    })).rejects.toMatchObject({ message: 'Not enough AI credits for this generation.', code: 'insufficient_credits' });

    firebase.auth.currentUser = null;
    await expect(generateGrowthAIContent({ tenantId: 'tenant-a' })).rejects.toThrow(/Sign in/);
  });

  it('sends only an authenticated tenant and owner message to the constrained router', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, skillId: 'marketing', confidence: 0.88 }),
    });

    await expect(routeGrowthAIConversation({ tenantId: 'tenant-a', message: 'Help me grow this week' }))
      .resolves.toEqual({ skillId: 'marketing', confidence: 0.88 });

    expect(fetchMock.mock.calls[0][0]).toMatch(/\/routeGrowthAIConversation$/);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ tenantId: 'tenant-a', message: 'Help me grow this week' });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer id-token');
  });

  it('creates opaque idempotency keys', () => {
    expect(createGrowthAIIdempotencyKey()).toEqual(expect.any(String));
    expect(createGrowthAIIdempotencyKey()).not.toBe(createGrowthAIIdempotencyKey());
  });
});
