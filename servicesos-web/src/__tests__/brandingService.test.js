import { describe, expect, it, vi } from 'vitest';

vi.mock('../firebase', () => ({ auth: { currentUser: null } }));
import { BrandingServiceError, getBranding, saveBranding } from '../services/brandingService';

const user = { getIdToken: vi.fn(async () => 'token') };
const response = body => ({ ok: true, json: async () => body });
const safeBranding = {
  mode: 'default', ready: true,
  colors: { primary: '#3b82f6', primaryDark: '#1d4ed8', accent: '#f59e0b', background: '#f8fafc' },
  logo: { emoji: 'S' }, assets: { logo: '' }, theme: { borderRadius: 10 },
};

describe('brandingService', () => {
  it('requires authentication locally', async () => {
    await expect(getBranding('tenant-a', { user: null, fetchImpl: vi.fn() })).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('uses the bounded gateway and sends no actor or timestamp authority', async () => {
    const fetchImpl = vi.fn(async () => response({ success: true, branding: safeBranding }));
    await getBranding('tenant-a', { user, fetchImpl });
    const request = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(request).toEqual({ action: 'get', tenantId: 'tenant-a' });
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer token');
  });

  it('allowlists branding updates and ignores unrelated legacy settings', async () => {
    const fetchImpl = vi.fn(async () => response({ success: true, branding: { ...safeBranding, mode: 'custom' } }));
    await saveBranding('tenant-a', { ...safeBranding, services: { unsafe: true }, customCSS: 'unsafe' }, { user, fetchImpl });
    const request = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(Object.keys(request.branding).sort()).toEqual(['assets', 'colors', 'logo', 'mode', 'theme']);
    expect(request).not.toHaveProperty('uid');
    expect(request).not.toHaveProperty('updatedAt');
  });

  it('merges a valid default response with deterministic application defaults', async () => {
    const result = await getBranding('tenant-a', { user, fetchImpl: vi.fn(async () => response({ success: true, branding: safeBranding })) });
    expect(result.brandingReady).toBe(true);
    expect(result.colors.surface).toBe('#ffffff');
    expect(result.mode).toBe('default');
  });

  it('rejects malformed gateway responses', async () => {
    await expect(getBranding('tenant-a', { user, fetchImpl: vi.fn(async () => response({ success: true, branding: { mode: 'custom' } })) }))
      .rejects.toBeInstanceOf(BrandingServiceError);
  });
});
