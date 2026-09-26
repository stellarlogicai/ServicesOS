import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getIdToken: vi.fn(async () => 'test-token'),
  fetch: vi.fn(),
}));

vi.mock('../firebase', () => ({
  auth: { currentUser: { getIdToken: mocks.getIdToken } },
}));
vi.mock('../services/stripeService', () => ({
  getFirebaseFunctionUrl: name => `http://127.0.0.1:5001/demo/us-central1/${name}`,
}));

import {
  listBookingPayments,
  recordBookingManualPayment,
  reverseBookingManualPayment,
} from '../services/bookingPaymentService';

beforeEach(() => {
  mocks.getIdToken.mockClear();
  mocks.fetch.mockReset();
  vi.stubGlobal('fetch', mocks.fetch);
});

it('records a manual payment with only booking data and a caller-stable idempotency key', async () => {
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ id: 'server-record', balance: {} }) });
  await recordBookingManualPayment('booking-a', {
    clientPaymentId: 'manual-attempt-0001', amount: '25.50', method: 'cash', note: 'Received',
  });
  const [url, request] = mocks.fetch.mock.calls[0];
  expect(url).toMatch(/bookingManualPaymentGateway$/);
  expect(request.headers.Authorization).toBe('Bearer test-token');
  expect(JSON.parse(request.body)).toEqual({
    action: 'record', bookingId: 'booking-a', clientPaymentId: 'manual-attempt-0001',
    amount: '25.50', method: 'cash', note: 'Received',
  });
  expect(request.body).not.toContain('tenantId');
  expect(request.body).not.toContain('actorUid');
  expect(request.body).not.toContain('paymentRecordId');
});

it('uses narrow server-authoritative list and reversal request shapes', async () => {
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ records: [], balance: {} }) });
  await listBookingPayments('booking-a');
  await reverseBookingManualPayment('booking-a', 'manual_record_hash');
  expect(mocks.fetch.mock.calls.map(([, request]) => JSON.parse(request.body))).toEqual([
    { action: 'list', bookingId: 'booking-a' },
    { action: 'reverse', bookingId: 'booking-a', paymentRecordId: 'manual_record_hash' },
  ]);
});
