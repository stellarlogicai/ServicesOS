import { describe, expect, it } from 'vitest';
import {
  buildDeterministicCommunicationDraft,
  listCommunicationBookings,
  listCommunicationLeads,
  validateCommunicationSelection,
} from '../modules/growthAI/growthAICommunicationService';

describe('GrowthAI customer communication helpers', () => {
  const lead = {
    id: 'lead-a', tenantId: 'tenant-a', status: 'quoted',
    customerSnapshot: { fullName: 'Private Customer' },
    requestSnapshot: { cleaningType: 'deep clean' },
    estimate: { priceLow: 180, priceHigh: 240, currency: 'USD' },
  };
  const completedBooking = {
    id: 'booking-a', tenantId: 'tenant-a', status: 'completed', serviceType: 'standard clean',
    customerName: 'Private Customer',
  };

  it('selects only eligible tenant sources without exposing their identity in a deterministic draft', () => {
    const leads = listCommunicationLeads([lead, { ...lead, id: 'foreign', tenantId: 'tenant-b' }], 'tenant-a');
    const bookings = listCommunicationBookings([completedBooking], 'tenant-a', { completedOnly: true });
    const draft = buildDeterministicCommunicationDraft({
      businessName: 'Tenant A Cleaning', channelId: 'sms', typeId: 'quote_question',
      source: { ...leads[0], leadId: leads[0].id },
    });

    expect(leads).toHaveLength(1);
    expect(bookings).toHaveLength(1);
    expect(draft.messageTemplate).toContain('$180.00 to $240.00');
    expect(draft.messageTemplate).not.toContain('Private Customer');
    expect(draft.sourceRefs).toEqual({ leadId: 'lead-a' });
  });

  it('keeps rebooking and review requests explicit and neutral', () => {
    const review = buildDeterministicCommunicationDraft({
      businessName: 'Tenant A Cleaning', channelId: 'email', typeId: 'review_request',
      source: { ...completedBooking, bookingId: 'booking-a' },
    });
    expect(review.messageTemplate).toContain('honest review');
    expect(review.messageTemplate).not.toMatch(/happy|satisfied/i);
    expect(validateCommunicationSelection({ typeId: 'review_request' })).toContain('completed job');
    const serviceQuestion = buildDeterministicCommunicationDraft({
      businessName: 'Tenant A Cleaning', channelId: 'sms', typeId: 'service_question',
      source: { ...completedBooking, bookingId: 'booking-a' },
    });
    expect(validateCommunicationSelection({ typeId: 'service_question' })).toContain('booking');
    expect(serviceQuestion.messageTemplate).toContain('Standard Cleaning');
  });
});
