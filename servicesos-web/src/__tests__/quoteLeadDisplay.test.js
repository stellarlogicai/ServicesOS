import { describe, expect, it } from 'vitest';
import {
  getQuoteLeadDisplayData,
  getQuoteLeadPriceDisplay,
  getRoomSummary,
  isPendingOwnerReview
} from '../services/quoteLeadDisplay';

describe('quote and lead display selectors', () => {
  it('prefers immutable snapshots over legacy form data', () => {
    const display = getQuoteLeadDisplayData({
      customerSnapshot: {
        fullName: 'Snapshot Customer',
        email: 'snapshot@example.com'
      },
      propertySnapshot: {
        address: '100 Snapshot Ave',
        bedrooms: 3,
        bathrooms: 2
      },
      requestSnapshot: {
        cleaningType: 'deep',
        frequency: 'monthly'
      },
      formData: {
        fullName: 'Legacy Customer',
        email: 'legacy@example.com',
        address: '1 Legacy St',
        bedrooms: 0,
        bathrooms: 0,
        cleaningType: 'standard',
        frequency: 'one-time'
      }
    });

    expect(display).toMatchObject({
      fullName: 'Snapshot Customer',
      email: 'snapshot@example.com',
      address: '100 Snapshot Ave',
      bedrooms: 3,
      bathrooms: 2,
      cleaningType: 'deep',
      frequency: 'monthly'
    });
    expect(getRoomSummary(display)).toBe('3 bed, 2 bath');
  });

  it('shows pending owner review instead of a zero-dollar estimate', () => {
    const lead = {
      type: 'quote_request',
      review: { requiresOwnerReview: true },
      estimate: {
        priceLow: 0,
        priceHigh: 0,
        requiresReview: true,
        status: 'pending_owner_review'
      },
      appointmentRequest: {
        status: 'pending_review'
      },
      booking: null
    };

    expect(isPendingOwnerReview(lead)).toBe(true);
    expect(getQuoteLeadPriceDisplay(lead)).toEqual({
      label: 'Quote status',
      text: 'Pending owner review.',
      pending: true
    });
  });

  it('does not treat an appointment request as a confirmed booking', () => {
    const lead = {
      type: 'quote_request',
      appointmentRequest: {
        preferredDate: '2026-07-01',
        status: 'pending_review'
      },
      booking: null,
      review: { requiresOwnerReview: true }
    };

    expect(isPendingOwnerReview(lead)).toBe(true);
    expect(getQuoteLeadPriceDisplay(lead).label).toBe('Quote status');
  });
});
