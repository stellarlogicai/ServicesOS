import { describe, expect, it } from 'vitest';
import {
  listEligibleEstimateAssistanceLeads,
  readSavedEstimatePricing,
} from '../modules/growthAI/growthAIEstimateAssistance';

describe('GrowthAI estimate assistance presentation helpers', () => {
  it('uses only canonical tenant-scoped, unbooked new or quoted estimate leads', () => {
    const eligible = {
      id: 'lead-eligible',
      tenantId: 'tenant-a',
      status: 'quoted',
      customerSnapshot: { fullName: 'Estimate Customer' },
      formData: { cleaningType: 'Deep clean' },
      estimate: { priceLow: 180, priceSuggested: 220, priceHigh: 260, currency: 'USD' },
    };
    const results = listEligibleEstimateAssistanceLeads([
      eligible,
      { ...eligible, id: 'lead-booked', booking: { bookingId: 'booking-a' } },
      { ...eligible, id: 'lead-approved', estimate: { ...eligible.estimate, status: 'approved' } },
      { ...eligible, id: 'lead-other-tenant', tenantId: 'tenant-b' },
      { ...eligible, id: 'lead-lost', status: 'lost' },
    ], 'tenant-a');

    expect(results).toEqual([expect.objectContaining({
      id: 'lead-eligible',
      customerName: 'Estimate Customer',
      serviceType: 'Deep clean',
      pricing: { low: 180, suggested: 220, high: 260, currency: 'USD' },
    })]);
  });

  it('does not calculate a replacement price range when saved pricing is incomplete', () => {
    expect(readSavedEstimatePricing({ priceLow: 200, priceHigh: 150 })).toBeNull();
    expect(readSavedEstimatePricing({ priceLow: 200, priceSuggested: 150, priceHigh: 300 })).toEqual({
      low: 200,
      suggested: null,
      high: 300,
      currency: 'USD',
    });
  });
});
