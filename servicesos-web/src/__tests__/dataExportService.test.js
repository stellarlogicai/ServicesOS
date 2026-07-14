import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCustomers: vi.fn(),
  getLeads: vi.fn(),
  getJobs: vi.fn(),
}));

vi.mock('../core/customers/customerService', () => ({ getCustomers: mocks.getCustomers }));
vi.mock('../core/leads/leadService', () => ({ getLeads: mocks.getLeads }));
vi.mock('../core/scheduling/schedulingService', () => ({ getJobs: mocks.getJobs }));

import {
  buildBookingRows,
  buildCustomerRows,
  buildLeadRows,
  buildPaymentRows,
  loadTenantExportData,
} from '../services/dataExportService';

describe('dataExportService', () => {
  beforeEach(() => {
    mocks.getCustomers.mockReset().mockResolvedValue({ success: true, data: [] });
    mocks.getLeads.mockReset().mockResolvedValue({ success: true, data: [] });
    mocks.getJobs.mockReset().mockResolvedValue({ success: true, data: [] });
  });

  it('loads customer, lead, and booking records with the requested tenant ID only', async () => {
    mocks.getCustomers.mockResolvedValue({ success: true, data: [{ id: 'customer-a' }] });
    mocks.getLeads.mockResolvedValue({ success: true, data: [{ id: 'lead-a' }] });
    mocks.getJobs.mockResolvedValue({ success: true, data: [{ id: 'booking-a' }] });

    await expect(loadTenantExportData('tenant-a')).resolves.toEqual({
      customers: [{ id: 'customer-a' }],
      leads: [{ id: 'lead-a' }],
      bookings: [{ id: 'booking-a' }],
    });
    expect(mocks.getCustomers).toHaveBeenCalledWith('tenant-a');
    expect(mocks.getLeads).toHaveBeenCalledWith('tenant-a');
    expect(mocks.getJobs).toHaveBeenCalledWith('tenant-a');
  });

  it('fails honestly when a tenant-scoped collection cannot load', async () => {
    mocks.getJobs.mockResolvedValue({ success: false, data: null });
    await expect(loadTenantExportData('tenant-a')).rejects.toThrow('Booking records could not be loaded.');
  });

  it('maps customer, lead, and booking fields without inventing missing values', () => {
    expect(buildCustomerRows([{ id: 'customer-a', name: 'Aunt B, Cleaning', isArchived: true }])[0])
      .toMatchObject({ customerId: 'customer-a', name: 'Aunt B, Cleaning', isArchived: true, phone: '', email: '' });

    expect(buildLeadRows([{
      id: 'lead-a',
      customerSnapshot: { fullName: 'Jamie Owner', email: 'jamie@example.com', phone: '555-0100' },
      propertySnapshot: { address: '10 Main Street' },
      requestSnapshot: { cleaningType: 'deep clean', preferredDate: '2026-07-20' },
      estimate: { priceLow: 180, priceHigh: 220 },
      booking: { bookingId: 'booking-a' },
    }])[0]).toMatchObject({
      leadId: 'lead-a', customerName: 'Jamie Owner', address: '10 Main Street',
      serviceType: 'deep clean', estimatedPriceLow: 180, estimatedPriceHigh: 220, bookingId: 'booking-a',
    });

    expect(buildBookingRows([{
      id: 'booking-a', customerSnapshot: { name: 'Jamie Owner', phone: '555-0100' },
      propertySnapshot: { address: '10 Main Street' }, requestSnapshot: { cleaningType: 'deep clean' },
      scheduledAt: '2026-07-20T15:00:00.000Z', agreedPrice: 220, status: 'cancelled',
    }])[0]).toMatchObject({ bookingId: 'booking-a', bookingStatus: 'cancelled', agreedPrice: 220 });
  });

  it('builds payment rows from bookings without Stripe identifiers and distinguishes manual from webhook-confirmed payments', () => {
    const rows = buildPaymentRows([
      {
        id: 'manual-booking', customerName: 'Cash Customer', agreedPrice: 150,
        paymentStatus: 'paid_cash', paymentMethod: 'cash', amountReceived: 150,
        receivedAt: '2026-07-13', paymentNote: 'Paid at door', paymentStatusUpdatedBy: 'admin-test',
        stripeCheckoutSessionId: 'cs_secret', stripePaymentIntentId: 'pi_secret', clientSecret: 'secret',
      },
      {
        id: 'stripe-booking', customerName: 'Stripe Customer', agreedPrice: 190,
        paymentStatus: 'paid_in_full', paymentMethod: 'stripe', amountReceived: 190,
        stripePaidAt: '2026-07-13T12:00:00.000Z', paymentStatusUpdatedBy: 'stripe_webhook',
        stripeCheckoutSessionId: 'cs_secret', stripePaymentIntentId: 'pi_secret',
      },
    ]);

    expect(rows[0]).toMatchObject({
      bookingId: 'manual-booking', amountStillOwed: 0, manualPaymentNote: 'Paid at door', stripeConfirmed: false,
    });
    expect(rows[1]).toMatchObject({
      bookingId: 'stripe-booking', amountStillOwed: 0, manualPaymentNote: '', stripeConfirmed: true,
    });
    rows.forEach(row => {
      expect(row).not.toHaveProperty('stripeCheckoutSessionId');
      expect(row).not.toHaveProperty('stripePaymentIntentId');
      expect(row).not.toHaveProperty('clientSecret');
    });
  });
});
