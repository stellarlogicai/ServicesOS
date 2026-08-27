import { describeGrowthAIAuditEntry, describeGrowthAIDraft, describeGrowthAIDraftSource } from '../modules/growthAI/growthAIDraftPresentation';
import { describe, expect, it } from 'vitest';

const context = {
  tenantId: 'tenant-a',
  opportunities: [{
    id: 'rebooking-a', tenantId: 'tenant-a', type: 'rebooking_gap',
  }],
  leads: [{
    id: 'lead-a', tenantId: 'tenant-a', formData: { serviceType: 'Deep Clean' },
  }],
  bookings: [{
    id: 'booking-a', tenantId: 'tenant-a', serviceType: 'Standard Clean',
  }],
};

describe('GrowthAI draft presentation', () => {
  it('uses owner-friendly labels and safe canonical source context', () => {
    expect(describeGrowthAIDraft({
      actionType: 'customer_response',
      title: 'Rebooking request',
      status: 'needs_review',
      sourceRefs: { opportunityId: 'rebooking-a' },
    }, context)).toEqual(expect.objectContaining({
      typeLabel: 'Rebooking Message',
      statusLabel: 'Needs Review',
      source: expect.objectContaining({ label: 'Rebooking opportunity' }),
    }));

    expect(describeGrowthAIDraftSource({ sourceRefs: { bookingId: 'booking-a' } }, context)).toEqual({
      label: 'Completed service',
      detail: 'Standard Clean',
    });
  });

  it('does not resolve cross-tenant or missing source references', () => {
    expect(describeGrowthAIDraftSource({ sourceRefs: { leadId: 'lead-a' } }, {
      ...context,
      tenantId: 'tenant-b',
    })).toEqual({ label: 'Source no longer available', unavailable: true });

    expect(describeGrowthAIDraftSource({ sourceRefs: { bookingId: 'missing-booking' } }, context)).toEqual({
      label: 'Source no longer available', unavailable: true,
    });
  });

  it('presents audit entries as business events without exposing actor IDs', () => {
    expect(describeGrowthAIAuditEntry({ action: 'approved', actorUid: 'owner-a' }, { currentUserUid: 'owner-a' })).toEqual({
      actor: 'You',
      headline: 'You approved this draft for internal use',
    });
    expect(describeGrowthAIAuditEntry({ action: 'unknown_internal_event', actorUid: 'owner-a' }, { currentUserUid: 'owner-a' })).toEqual({
      actor: 'System',
      headline: 'Draft activity recorded',
    });
  });
});
