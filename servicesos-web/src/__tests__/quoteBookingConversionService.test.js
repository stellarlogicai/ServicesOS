import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => ({
  collection: vi.fn(),
  doc: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
  commit: vi.fn(),
  writeBatch: vi.fn()
}));

vi.mock('../firebase', () => ({
  db: { id: 'test-db' }
}));

vi.mock('firebase/firestore', () => ({
  collection: firestoreMocks.collection,
  doc: firestoreMocks.doc,
  writeBatch: firestoreMocks.writeBatch
}));

import {
  approveQuoteRequestAndCreateBooking,
  buildQuoteBookingConversion
} from '../services/quoteBookingConversionService';

const pendingLead = {
  id: 'lead-test',
  tenantId: 'tenant-test',
  type: 'quote_request',
  source: 'customer-portal',
  status: 'new',
  customerId: 'customer-test',
  propertyId: 'property-test',
  customerSnapshot: { fullName: 'Avery Johnson', phone: '555-0100' },
  propertySnapshot: { address: '123 Test Lane', bedrooms: 3, bathrooms: 2 },
  requestSnapshot: { cleaningType: 'deep', preferredDate: '2026-07-15' },
  estimate: {
    priceLow: 0,
    priceHigh: 0,
    appointmentDuration: 3,
    requiresReview: true,
    status: 'pending_owner_review'
  },
  review: { requiresOwnerReview: true, reviewedBy: null, reviewedAt: null },
  appointmentRequest: {
    preferredDate: '2026-07-15',
    preferredTime: '10:30',
    status: 'pending_review'
  }
};

describe('quote booking conversion', () => {
  beforeEach(() => {
    Object.values(firestoreMocks).forEach(mock => mock.mockReset());
    firestoreMocks.collection.mockReturnValue('bookings-collection');
    firestoreMocks.doc
      .mockReturnValueOnce({ id: 'booking-test' })
      .mockReturnValueOnce('lead-ref');
    firestoreMocks.writeBatch.mockReturnValue({
      set: firestoreMocks.set,
      update: firestoreMocks.update,
      commit: firestoreMocks.commit
    });
    firestoreMocks.commit.mockResolvedValue();
  });

  it('builds a scheduled booking and clears all pending review flags', () => {
    const result = buildQuoteBookingConversion({
      lead: pendingLead,
      bookingData: {
        scheduledAt: '2026-07-15T15:30:00.000Z',
        agreedPrice: 245,
        notes: 'Use side gate'
      },
      reviewedBy: 'admin-test',
      bookingId: 'booking-test',
      now: '2026-06-23T12:00:00.000Z'
    });

    expect(result.booking).toMatchObject({
      schemaVersion: 1,
      leadId: 'lead-test',
      customerId: 'customer-test',
      propertyId: 'property-test',
      status: 'scheduled',
      agreedPrice: 245,
      customerSnapshot: pendingLead.customerSnapshot,
      propertySnapshot: pendingLead.propertySnapshot,
      requestSnapshot: pendingLead.requestSnapshot
    });
    expect(result.leadPatch).toMatchObject({
      status: 'booked',
      booking: {
        bookingId: 'booking-test',
        agreedPrice: 245,
        status: 'scheduled'
      },
      estimate: {
        priceLow: 245,
        priceHigh: 245,
        requiresReview: false,
        status: 'approved'
      },
      review: {
        requiresOwnerReview: false,
        reviewedBy: 'admin-test',
        status: 'approved'
      },
      appointmentRequest: {
        status: 'approved',
        approvedBookingId: 'booking-test'
      }
    });
  });

  it('writes the booking and lead update in one batch without payment writes', async () => {
    const result = await approveQuoteRequestAndCreateBooking({
      tenantId: 'tenant-test',
      lead: pendingLead,
      bookingData: {
        scheduledAt: '2026-07-15T15:30:00.000Z',
        agreedPrice: 245
      },
      reviewedBy: 'admin-test'
    });

    expect(firestoreMocks.collection).toHaveBeenCalledWith(
      { id: 'test-db' },
      'tenants',
      'tenant-test',
      'bookings'
    );
    expect(firestoreMocks.set).toHaveBeenCalledWith(
      { id: 'booking-test' },
      expect.objectContaining({ leadId: 'lead-test', agreedPrice: 245 })
    );
    expect(firestoreMocks.update).toHaveBeenCalledWith(
      'lead-ref',
      expect.objectContaining({ status: 'booked' })
    );
    expect(firestoreMocks.commit).toHaveBeenCalledOnce();
    expect(result.bookingId).toBe('booking-test');
    expect(JSON.stringify(firestoreMocks.set.mock.calls)).not.toContain('payment');
  });

  it('copies admin-created lead formData customer display fields onto the booking', () => {
    const adminLead = {
      id: 'lead-admin-manual',
      tenantId: 'tenant-test',
      type: 'lead',
      source: 'admin',
      status: 'new',
      formData: {
        fullName: 'Customer Name Display Smoke 0630',
        email: 'display-smoke@example.com',
        phone: '555-0630',
        address: '630 Display Lane',
        cleaningType: 'standard',
        frequency: 'one-time',
        bedroomCount: 2,
        bathroomCount: 1,
        kitchenCount: 1,
        extras: { oven: true, fridge: false },
        specialRequests: 'Protect the wood table.'
      },
      estimate: {
        priceLow: 190,
        priceHigh: 220,
        appointmentDuration: 3
      },
      booking: null
    };

    const result = buildQuoteBookingConversion({
      lead: adminLead,
      bookingData: {
        scheduledAt: '2026-07-02T14:00:00.000Z',
        agreedPrice: 205
      },
      reviewedBy: 'admin-test',
      bookingId: 'booking-admin-manual',
      now: '2026-06-30T12:00:00.000Z'
    });

    expect(result.booking).toMatchObject({
      leadId: 'lead-admin-manual',
      source: 'admin',
      customerName: 'Customer Name Display Smoke 0630',
      customerSnapshot: {
        name: 'Customer Name Display Smoke 0630',
        email: 'display-smoke@example.com',
        phone: '555-0630'
      },
      address: '630 Display Lane',
      serviceType: 'standard',
      propertySnapshot: {
        roomCounts: expect.objectContaining({ bedrooms: 2, bathrooms: 1, kitchens: 1 })
      },
      requestSnapshot: {
        cleaningType: 'standard',
        frequency: 'one-time',
        serviceScope: expect.objectContaining({ oven: true, fridge: false }),
        specialRequests: 'Protect the wood table.'
      },
      agreedPrice: 205,
      status: 'scheduled'
    });
  });

  it('rejects conversion without a positive approved price', () => {
    expect(() => buildQuoteBookingConversion({
      lead: pendingLead,
      bookingData: { scheduledAt: '2026-07-15T15:30:00.000Z', agreedPrice: 0 },
      reviewedBy: 'admin-test',
      bookingId: 'booking-test'
    })).toThrow('approved price greater than zero');
  });
});
