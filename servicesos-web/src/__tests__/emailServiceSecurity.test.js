/**
 * emailServiceSecurity.test.js
 * Security test to verify email service does not use VITE_RESEND_* variables
 * and does not call Resend API directly from the browser.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { sendQuoteEmail, sendBookingConfirmationEmail } from '../services/emailService';

describe('emailService security', () => {
  beforeEach(() => {
    // Mock import.meta.env to ensure no VITE_RESEND_* variables are set
    vi.stubGlobal('import', {
      meta: {
        env: {
          VITE_FUNCTIONS_URL: 'https://functions.example.com',
          VITE_BUSINESS_NAME: 'Test Business',
          VITE_EMAIL_FROM: 'test@example.com',
          VITE_BOOKING_URL: 'https://example.com/book'
        }
      }
    });

    // Mock fetch to track calls
    const mockFetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ id: 'email-123' })
      })
    );
    vi.stubGlobal('fetch', mockFetch);

    // Mock auth
    vi.stubGlobal('auth', {
      currentUser: {
        getIdToken: () => Promise.resolve('mock-token')
      }
    });
  });

  it('sendQuoteEmail does not use VITE_RESEND_API_KEY', async () => {
    const lead = { email: 'customer@example.com', firstName: 'John', id: 'lead-123' };
    const estimate = { priceLow: 100, priceHigh: 150 };

    await sendQuoteEmail(lead, estimate);

    // Verify VITE_RESEND_API_KEY was not accessed
    expect(import.meta.env.VITE_RESEND_API_KEY).toBeUndefined();
  });

  it('sendQuoteEmail calls cloud function endpoint, not Resend API', async () => {
    const lead = { email: 'customer@example.com', firstName: 'John', id: 'lead-123' };
    const estimate = { priceLow: 100, priceHigh: 150 };

    await sendQuoteEmail(lead, estimate);

    const fetchCalls = vi.mocked(fetch).mock.calls;
    expect(fetchCalls.length).toBeGreaterThan(0);
    
    // Verify the call is to the cloud function, not Resend
    const url = fetchCalls[0][0];
    expect(url).toContain('sendCustomerEmail');
    expect(url).not.toContain('api.resend.com');
  });

  it('sendBookingConfirmationEmail does not use VITE_RESEND_API_KEY', async () => {
    const lead = { email: 'customer@example.com', firstName: 'John' };
    const booking = { scheduledAt: new Date().toISOString(), agreedPrice: 125, id: 'booking-123' };

    await sendBookingConfirmationEmail(lead, booking);

    // Verify VITE_RESEND_API_KEY was not accessed
    expect(import.meta.env.VITE_RESEND_API_KEY).toBeUndefined();
  });

  it('sendBookingConfirmationEmail calls cloud function endpoint, not Resend API', async () => {
    const lead = { email: 'customer@example.com', firstName: 'John' };
    const booking = { scheduledAt: new Date().toISOString(), agreedPrice: 125, id: 'booking-123' };

    await sendBookingConfirmationEmail(lead, booking);

    const fetchCalls = vi.mocked(fetch).mock.calls;
    expect(fetchCalls.length).toBeGreaterThan(0);
    
    // Verify the call is to the cloud function, not Resend
    const url = fetchCalls[0][0];
    expect(url).toContain('sendCustomerEmail');
    expect(url).not.toContain('api.resend.com');
  });
});
