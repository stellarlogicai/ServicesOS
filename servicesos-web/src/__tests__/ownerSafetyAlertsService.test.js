import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../firebase', () => ({ auth: { currentUser: null } }));
import { listOwnerSafetyAlerts } from '../services/ownerSafetyAlertsService';

beforeEach(() => {
  vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'demo-servicesos-v1-smoke-local');
  vi.stubEnv('VITE_USE_FIREBASE_EMULATORS', 'true');
  vi.stubEnv('VITE_FUNCTIONS_URL', 'http://127.0.0.1:5001/demo-servicesos-v1-smoke-local/us-central1');
});
afterEach(() => vi.unstubAllEnvs());

it('posts no tenant selector and allowlists bounded owner alert data', async () => {
  const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, alerts: [{
    eventId: 'event-a', employeeDisplayName: 'Worker', createdAt: '2026-09-26T12:00:00.000Z',
    bookingId: 'job-a', location: { latitude: 41.8, longitude: -87.6, secret: 'private' },
    tenantId: 'private', paymentStatus: 'private',
  }] }) });
  const alerts = await listOwnerSafetyAlerts({ user: { getIdToken: async () => 'test-token' }, fetchImpl });
  expect(fetchImpl.mock.calls[0][0]).toMatch(/ownerSafetyAlertsGateway$/);
  expect(fetchImpl.mock.calls[0][1].body).toBe('{}');
  expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer test-token');
  expect(alerts).toEqual([{ eventId: 'event-a', employeeDisplayName: 'Worker',
    createdAt: '2026-09-26T12:00:00.000Z', bookingId: 'job-a', location: { latitude: 41.8, longitude: -87.6 } }]);
});

it('rejects anonymous access and malformed oversized responses', async () => {
  await expect(listOwnerSafetyAlerts({ user: null })).rejects.toThrow();
  await expect(listOwnerSafetyAlerts({ user: { getIdToken: async () => 'test-token' },
    fetchImpl: async () => ({ ok: true, json: async () => ({ success: true, alerts: Array(26).fill({}) }) }),
  })).rejects.toThrow();
});
