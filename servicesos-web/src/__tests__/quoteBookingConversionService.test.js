import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => ({
  collection: vi.fn(),
  doc: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
  runTransaction: vi.fn()
}));

vi.mock('../firebase', () => ({
  db: { id: 'test-db' }
}));

vi.mock('firebase/firestore', () => ({
  collection: firestoreMocks.collection,
  doc: firestoreMocks.doc,
  runTransaction: firestoreMocks.runTransaction
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

const snapshot = (id, data) => ({
  id,
  exists: () => Boolean(data),
  data: () => data
});

const leadReference = { kind: 'lead', id: pendingLead.id };
const bookingCollection = { kind: 'booking-collection' };
const generatedBookingReference = { kind: 'booking', id: 'booking-test' };

function storedPendingLead(overrides = {}) {
  return {
    ...pendingLead,
    ...overrides,
    booking: Object.prototype.hasOwnProperty.call(overrides, 'booking')
      ? overrides.booking
      : pendingLead.booking,
    appointmentRequest: Object.prototype.hasOwnProperty.call(overrides, 'appointmentRequest')
      ? overrides.appointmentRequest
      : pendingLead.appointmentRequest,
  };
}

describe('quote booking conversion', () => {
  beforeEach(() => {
    Object.values(firestoreMocks).forEach(mock => mock.mockReset());
    firestoreMocks.collection.mockReturnValue(bookingCollection);
    firestoreMocks.doc.mockImplementation((root, ...segments) => {
      if (root === bookingCollection) return generatedBookingReference;
      if (segments.at(-2) === 'leads') return { ...leadReference, id: segments.at(-1) };
      if (segments.at(-2) === 'bookings') return { kind: 'booking', id: segments.at(-1) };
      throw new Error(`Unexpected document path: ${segments.join('/')}`);
    });
    firestoreMocks.get.mockResolvedValue(snapshot(pendingLead.id, storedPendingLead()));
    firestoreMocks.runTransaction.mockImplementation(async (_database, callback) => callback({
      get: firestoreMocks.get,
      set: firestoreMocks.set,
      update: firestoreMocks.update,
    }));
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

  it('writes the booking and lead update in one transaction without payment writes', async () => {
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
    expect(firestoreMocks.get).toHaveBeenCalledWith(leadReference);
    expect(firestoreMocks.set).toHaveBeenCalledWith(
      generatedBookingReference,
      expect.objectContaining({ leadId: 'lead-test', agreedPrice: 245 })
    );
    expect(firestoreMocks.update).toHaveBeenCalledWith(
      leadReference,
      expect.objectContaining({ status: 'booked' })
    );
    expect(firestoreMocks.runTransaction).toHaveBeenCalledOnce();
    expect(result.bookingId).toBe('booking-test');
    expect(result.alreadyConverted).toBe(false);
    expect(JSON.stringify(firestoreMocks.set.mock.calls)).not.toContain('payment');
  });

  it('returns the existing booking on a repeated retry without writing', async () => {
    const convertedLead = storedPendingLead({
      status: 'booked',
      booking: { bookingId: 'booking-existing', status: 'scheduled', agreedPrice: 245 },
      appointmentRequest: {
        ...pendingLead.appointmentRequest,
        status: 'approved',
        approvedBookingId: 'booking-existing',
      },
    });
    const existingBooking = {
      tenantId: 'tenant-test',
      leadId: pendingLead.id,
      sourceLeadId: pendingLead.id,
      status: 'scheduled',
      agreedPrice: 245,
    };
    firestoreMocks.get.mockImplementation(async reference => reference.kind === 'lead'
      ? snapshot(pendingLead.id, convertedLead)
      : snapshot('booking-existing', existingBooking));

    const result = await approveQuoteRequestAndCreateBooking({
      tenantId: 'tenant-test',
      lead: pendingLead,
      bookingData: { scheduledAt: '2026-07-15T15:30:00.000Z', agreedPrice: 245 },
      reviewedBy: 'admin-test',
    });

    expect(result).toMatchObject({ bookingId: 'booking-existing', alreadyConverted: true });
    expect(result.booking).toMatchObject(existingBooking);
    expect(firestoreMocks.set).not.toHaveBeenCalled();
    expect(firestoreMocks.update).not.toHaveBeenCalled();
  });

  it('serializes concurrent conversion attempts to one booking relationship', async () => {
    let generatedId = 0;
    let storedLead = storedPendingLead();
    const storedBookings = new Map();
    let queue = Promise.resolve();
    firestoreMocks.doc.mockImplementation((root, ...segments) => {
      if (root === bookingCollection) {
        generatedId += 1;
        return { kind: 'booking', id: `booking-${generatedId}` };
      }
      if (segments.at(-2) === 'leads') return { ...leadReference, id: segments.at(-1) };
      if (segments.at(-2) === 'bookings') return { kind: 'booking', id: segments.at(-1) };
      throw new Error(`Unexpected document path: ${segments.join('/')}`);
    });
    firestoreMocks.runTransaction.mockImplementation((_database, callback) => {
      const current = queue.then(async () => {
        const writes = [];
        const transaction = {
          get: async reference => reference.kind === 'lead'
            ? snapshot(pendingLead.id, storedLead)
            : snapshot(reference.id, storedBookings.get(reference.id)),
          set: (reference, data) => writes.push({ type: 'set', reference, data }),
          update: (reference, data) => writes.push({ type: 'update', reference, data }),
        };
        const result = await callback(transaction);
        for (const write of writes) {
          if (write.type === 'set') storedBookings.set(write.reference.id, write.data);
          if (write.type === 'update') storedLead = { ...storedLead, ...write.data };
        }
        return result;
      });
      queue = current.catch(() => {});
      return current;
    });

    const request = {
      tenantId: 'tenant-test',
      lead: pendingLead,
      bookingData: { scheduledAt: '2026-07-15T15:30:00.000Z', agreedPrice: 245 },
      reviewedBy: 'admin-test',
    };
    const [first, second] = await Promise.all([
      approveQuoteRequestAndCreateBooking(request),
      approveQuoteRequestAndCreateBooking(request),
    ]);

    expect(storedBookings.size).toBe(1);
    expect(first.bookingId).toBe(second.bookingId);
    expect([first.alreadyConverted, second.alreadyConverted].sort()).toEqual([false, true]);
    expect(storedLead.booking.bookingId).toBe(first.bookingId);
  });

  it.each([
    ['booked lead with no booking reference', storedPendingLead({ status: 'booked', booking: null })],
    ['conflicting lead booking references', storedPendingLead({
      status: 'booked',
      booking: { bookingId: 'booking-one' },
      appointmentRequest: { ...pendingLead.appointmentRequest, approvedBookingId: 'booking-two' },
    })],
  ])('fails safely for %s', async (_label, malformedLead) => {
    firestoreMocks.get.mockResolvedValue(snapshot(pendingLead.id, malformedLead));

    await expect(approveQuoteRequestAndCreateBooking({
      tenantId: 'tenant-test',
      lead: pendingLead,
      bookingData: { scheduledAt: '2026-07-15T15:30:00.000Z', agreedPrice: 245 },
      reviewedBy: 'admin-test',
    })).rejects.toMatchObject({ code: 'booking-conversion-inconsistent' });

    expect(firestoreMocks.set).not.toHaveBeenCalled();
    expect(firestoreMocks.update).not.toHaveBeenCalled();
  });

  it('fails safely when a referenced booking is missing or belongs to another lead', async () => {
    const convertedLead = storedPendingLead({
      status: 'booked',
      booking: { bookingId: 'booking-existing' },
      appointmentRequest: { ...pendingLead.appointmentRequest, approvedBookingId: 'booking-existing' },
    });
    firestoreMocks.get.mockImplementation(async reference => reference.kind === 'lead'
      ? snapshot(pendingLead.id, convertedLead)
      : snapshot('booking-existing', null));

    const request = {
      tenantId: 'tenant-test',
      lead: pendingLead,
      bookingData: { scheduledAt: '2026-07-15T15:30:00.000Z', agreedPrice: 245 },
      reviewedBy: 'admin-test',
    };
    await expect(approveQuoteRequestAndCreateBooking(request))
      .rejects.toMatchObject({ code: 'booking-conversion-inconsistent' });

    firestoreMocks.get.mockImplementation(async reference => reference.kind === 'lead'
      ? snapshot(pendingLead.id, convertedLead)
      : snapshot('booking-existing', { tenantId: 'tenant-test', leadId: 'different-lead' }));
    await expect(approveQuoteRequestAndCreateBooking(request))
      .rejects.toMatchObject({ code: 'booking-conversion-inconsistent' });
    expect(firestoreMocks.set).not.toHaveBeenCalled();
    expect(firestoreMocks.update).not.toHaveBeenCalled();
  });

  it('uses the stored lead scope and rejects a tenant mismatch', async () => {
    const storedScope = {
      cleaningType: 'deep',
      frequency: 'one-time',
      serviceScope: { kitchen: true, bedrooms: false },
      selectedAddOns: ['inside_fridge'],
    };
    firestoreMocks.get.mockResolvedValue(snapshot(pendingLead.id, storedPendingLead({
      requestSnapshot: storedScope,
    })));

    const converted = await approveQuoteRequestAndCreateBooking({
      tenantId: 'tenant-test',
      lead: { ...pendingLead, requestSnapshot: { cleaningType: 'standard' } },
      bookingData: { scheduledAt: '2026-07-15T15:30:00.000Z', agreedPrice: 245 },
      reviewedBy: 'admin-test',
    });
    expect(converted.booking.requestSnapshot).toEqual(storedScope);

    firestoreMocks.get.mockResolvedValue(snapshot(pendingLead.id, storedPendingLead({ tenantId: 'tenant-other' })));
    await expect(approveQuoteRequestAndCreateBooking({
      tenantId: 'tenant-test',
      lead: pendingLead,
      bookingData: { scheduledAt: '2026-07-15T15:30:00.000Z', agreedPrice: 245 },
      reviewedBy: 'admin-test',
    })).rejects.toMatchObject({ code: 'booking-conversion-inconsistent' });
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
