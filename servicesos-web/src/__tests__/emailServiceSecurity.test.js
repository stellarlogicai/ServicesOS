import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: {
    currentUser: {
      getIdToken: vi.fn().mockResolvedValue('mock-token'),
    },
  },
}));

vi.mock('../firebase', () => ({ auth: mocks.auth }));

import {
  sendBookingConfirmationEmail,
  sendQuoteEmail,
  sendServiceAgreementEmail,
} from '../services/emailService';

const tenantId = 'tenant-a';
const lead = { email: 'customer@example.com', firstName: 'John', id: 'lead-123' };
const estimate = { priceLow: 100, priceHigh: 150, laborHours: 2 };

function successResponse() {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ success: true, id: 'email-123', status: 'sent' }),
  });
}

describe('emailService security', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv('VITE_FUNCTIONS_URL', 'https://functions.example.com');
    vi.stubEnv('VITE_RESEND_API_KEY', '');
    mocks.auth.currentUser = { getIdToken: vi.fn().mockResolvedValue('mock-token') };
    vi.stubGlobal('fetch', vi.fn(successResponse));
  });

  it('sends tenant, auth, and the caller-stable idempotency key only to the Cloud Function', async () => {
    const result = await sendQuoteEmail(tenantId, lead, estimate, { idempotencyKey: 'stable-attempt-key' });

    expect(result).toMatchObject({ success: true, idempotencyKey: 'stable-attempt-key' });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('https://functions.example.com/sendCustomerEmail');
    expect(url).not.toContain('api.resend.com');
    expect(options.headers.Authorization).toBe('Bearer mock-token');
    expect(JSON.parse(options.body)).toMatchObject({
      tenantId,
      idempotencyKey: 'stable-attempt-key',
      emailType: 'quote',
      relatedEntityId: 'lead-123',
    });
    expect(import.meta.env.VITE_RESEND_API_KEY).toBeFalsy();
  });

  it('returns the same idempotency key on an uncertain response so a retry can reuse it', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ code: 'send_uncertain', error: 'Retry this same email attempt.' }),
    });

    const result = await sendQuoteEmail(tenantId, lead, estimate, { idempotencyKey: 'retry-this-key' });

    expect(result).toEqual(expect.objectContaining({
      success: false,
      code: 'send_uncertain',
      idempotencyKey: 'retry-this-key',
    }));
  });

  it('requires an authenticated browser session before calling the Function', async () => {
    mocks.auth.currentUser = null;

    const result = await sendQuoteEmail(tenantId, lead, estimate, { idempotencyKey: 'auth-required' });

    expect(result).toMatchObject({ success: false, code: 'unauthenticated' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects missing tenant context before calling the Function', async () => {
    const result = await sendQuoteEmail('', lead, estimate, { idempotencyKey: 'tenant-required' });

    expect(result).toMatchObject({ success: false, code: 'invalid_request' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps the same key when browser fetch fails ambiguously', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const result = await sendQuoteEmail(tenantId, lead, estimate, { idempotencyKey: 'network-attempt' });

    expect(result).toMatchObject({
      success: false,
      code: 'send_uncertain',
      idempotencyKey: 'network-attempt',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('uses the same tenant-aware boundary for booking confirmation', async () => {
    const booking = { scheduledAt: new Date().toISOString(), agreedPrice: 125, id: 'booking-123' };

    await sendBookingConfirmationEmail(tenantId, lead, booking, { idempotencyKey: 'booking-attempt' });

    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).not.toContain('api.resend.com');
    expect(JSON.parse(options.body)).toMatchObject({
      tenantId,
      idempotencyKey: 'booking-attempt',
      emailType: 'booking_confirmation',
      relatedEntityId: 'booking-123',
    });
  });

  it('sends one canonical PDF for a service agreement', async () => {
    const pdf = new Blob(['%PDF-1.4\nsynthetic'], { type: 'application/pdf' });

    await sendServiceAgreementEmail(
      tenantId,
      lead,
      estimate,
      { id: 'contract-123', signedAt: new Date().toISOString() },
      pdf,
      { idempotencyKey: 'agreement-attempt' },
    );

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1].body);
    expect(body).toMatchObject({
      tenantId,
      idempotencyKey: 'agreement-attempt',
      emailType: 'service_agreement',
      relatedEntityId: 'contract-123',
    });
    expect(body.attachments).toEqual([expect.objectContaining({
      filename: 'Service_Agreement.pdf',
      type: 'application/pdf',
    })]);
    expect(body.attachments[0].content).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it('rejects oversized service-agreement files before fetch', async () => {
    const oversized = new Blob([new Uint8Array((2 * 1024 * 1024) + 1)], { type: 'application/pdf' });

    const result = await sendServiceAgreementEmail(
      tenantId,
      lead,
      estimate,
      { id: 'contract-123' },
      oversized,
      { idempotencyKey: 'oversized-attempt' },
    );

    expect(result).toMatchObject({ success: false, code: 'invalid_request' });
    expect(fetch).not.toHaveBeenCalled();
  });
});
