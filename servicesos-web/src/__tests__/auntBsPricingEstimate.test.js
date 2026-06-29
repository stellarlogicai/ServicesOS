import { describe, expect, it } from 'vitest';
import { calculatePricingProfileEstimate } from '../core/estimates/calculateEstimate';
import {
  AUNT_BS_PRICING_PROFILE_ID,
  auntBsCleaningServicesPricingProfile
} from '../core/estimates/pricingProfiles';

const baseInput = {
  bedrooms: 3,
  bathrooms: 2,
  serviceType: 'standard',
  condition: 'normal',
  clutter: 'low',
  pets: 'none',
  travelZone: 'core',
  frequency: 'one-time'
};

function estimate(input) {
  return calculatePricingProfileEstimate(
    { ...baseInput, ...input },
    auntBsCleaningServicesPricingProfile
  );
}

describe('Aunt B pricing profile estimate utility', () => {
  it('returns the 3 bed / 2 bath standard normal-condition anchor', () => {
    const result = estimate({});

    expect(result).toMatchObject({
      tenantPricingProfileId: AUNT_BS_PRICING_PROFILE_ID,
      market: 'Bolivar, MO',
      currency: 'USD',
      low: 190,
      suggested: 205,
      high: 220,
      requiresManualReview: false,
      manualReviewReasons: []
    });
    expect(result.customerSummary).toContain('3 bed / 2 bath');
    expect(result.internalNotes).toContain('Base anchor: 3 bed / 2 bath standard cleaning');
  });

  it('prices a 3 bed / 2 bath deep clean with multiple pets around the expected suggested quote', () => {
    const result = estimate({ serviceType: 'deep', pets: 'multiplePets' });

    expect(result.suggested).toBeGreaterThanOrEqual(290);
    expect(result.suggested).toBeLessThanOrEqual(295);
    expect(result.lineItems).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: 'multiple pets' })])
    );
  });

  it('enforces the minimum job price for a well-maintained biweekly 2 bed / 1 bath cleaning', () => {
    const result = estimate({
      bedrooms: 2,
      bathrooms: 1,
      condition: 'wellMaintained',
      frequency: 'biweekly'
    });

    expect(result.low).toBe(135);
    expect(result.suggested).toBe(135);
    expect(result.high).toBeGreaterThanOrEqual(135);
    expect(result.internalNotes).toEqual(
      expect.arrayContaining(['Minimum enforced: $135'])
    );
  });

  it('adds move-out fridge and oven add-ons to the suggested quote and notes', () => {
    const result = estimate({
      serviceType: 'moveout',
      extras: {
        fridge: true,
        oven: true
      }
    });

    expect(result.suggested).toBeGreaterThan(205);
    expect(result.lineItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Inside fridge' }),
        expect.objectContaining({ label: 'Inside oven' })
      ])
    );
    expect(result.internalNotes).toEqual(
      expect.arrayContaining(['Add-on: Inside fridge', 'Add-on: Inside oven'])
    );
  });

  it('requires manual review for pet waste or severe buildup', () => {
    const petWaste = estimate({ pets: 'petWasteOrOdor' });
    const severeBuildup = estimate({ condition: 'severeBuildup' });

    expect(petWaste.requiresManualReview).toBe(true);
    expect(petWaste.manualReviewReasons).toContain('pet waste or odor');
    expect(severeBuildup.requiresManualReview).toBe(true);
    expect(severeBuildup.manualReviewReasons).toContain('severe buildup');
  });

  it('requires manual review for excessive clutter', () => {
    const result = estimate({ clutter: 'excessive' });

    expect(result.requiresManualReview).toBe(true);
    expect(result.manualReviewReasons).toContain('excessive clutter');
  });

  it('requires manual review for over 35 miles travel', () => {
    const result = estimate({ travelZone: 'overThirtyFiveMiles' });

    expect(result.requiresManualReview).toBe(true);
    expect(result.manualReviewReasons).toContain('over 35 miles');
  });

  it('does not crash for unsupported larger homes and warns/manual-reviews safely', () => {
    const result = estimate({ bedrooms: 6, bathrooms: 4 });

    expect(result.low).toBeGreaterThan(0);
    expect(result.requiresManualReview).toBe(true);
    expect(result.manualReviewReasons).toContain('large rural home');
    expect(result.warnings.some(warning => warning.includes('Closest supported anchor'))).toBe(true);
  });

  it('rounds final prices to the nearest five dollars', () => {
    const result = estimate({
      bedrooms: 2,
      bathrooms: 1,
      extras: {
        windows: 1
      }
    });

    expect(result.low % 5).toBe(0);
    expect(result.suggested % 5).toBe(0);
    expect(result.high % 5).toBe(0);
    expect(result).toMatchObject({ low: 150, suggested: 160, high: 175 });
  });

  it('enforces service-specific minimums', () => {
    const result = estimate({
      bedrooms: 1,
      bathrooms: 1,
      serviceType: 'moveout',
      condition: 'wellMaintained'
    });

    expect(result.low).toBeGreaterThanOrEqual(225);
    expect(result.suggested).toBeGreaterThanOrEqual(225);
    expect(result.high).toBeGreaterThanOrEqual(225);
  });
});
