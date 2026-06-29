export const AUNT_BS_PRICING_PROFILE_ID = 'aunt-bs-cleaning-services';

export const auntBsCleaningServicesPricingProfile = {
  id: AUNT_BS_PRICING_PROFILE_ID,
  businessName: "Aunt B's Cleaning Services",
  market: 'Bolivar, MO',
  currency: 'USD',
  minimumJobPrice: 135,
  publicStartingPrices: {
    standard: 135,
    deep: 175,
    moveout: 225,
    addons: 15
  },
  anchors: [
    { bedrooms: 1, bathrooms: 1, low: 125, suggested: 135, high: 140 },
    { bedrooms: 2, bathrooms: 1, low: 145, suggested: 155, high: 165 },
    { bedrooms: 3, bathrooms: 1, low: 165, suggested: 180, high: 190 },
    { bedrooms: 3, bathrooms: 2, low: 190, suggested: 205, high: 220 },
    { bedrooms: 4, bathrooms: 2, low: 230, suggested: 255, high: 280 }
  ],
  serviceMultipliers: {
    standard: { low: 1, suggested: 1, high: 1, minimum: 135, label: 'Standard cleaning' },
    deep: { low: 1.2, suggested: 1.3, high: 1.35, minimum: 175, label: 'Deep clean / initial reset' },
    moveout: { low: 1.35, suggested: 1.55, high: 1.75, minimum: 225, label: 'Move-in / move-out' }
  },
  conditionMultipliers: {
    wellMaintained: { low: 0.95, suggested: 0.95, high: 0.95, label: 'well maintained' },
    normal: { low: 1, suggested: 1, high: 1, label: 'normal' },
    needsAttention: { low: 1.1, suggested: 1.15, high: 1.2, label: 'needs attention' },
    heavyBuildup: { low: 1.25, suggested: 1.3, high: 1.4, label: 'heavy buildup' },
    severeBuildup: { manualReview: true, label: 'severe buildup' }
  },
  clutterMultipliers: {
    low: { low: 1, suggested: 1, high: 1, label: 'low' },
    normal: { low: 1, suggested: 1, high: 1, label: 'low' },
    moderate: { low: 1.05, suggested: 1.1, high: 1.15, label: 'moderate' },
    high: { low: 1.15, suggested: 1.25, high: 1.35, label: 'high' },
    excessive: { manualReview: true, label: 'excessive clutter' }
  },
  petAdjustments: {
    none: { low: 0, suggested: 0, high: 0, label: 'no pets' },
    light: { low: 10, suggested: 10, high: 15, label: 'one pet / light hair' },
    onePetLightHair: { low: 10, suggested: 10, high: 15, label: 'one pet / light hair' },
    multiplePets: { low: 20, suggested: 25, high: 35, label: 'multiple pets' },
    moderate: { low: 20, suggested: 25, high: 35, label: 'multiple pets' },
    heavy: { low: 40, suggested: 50, high: 60, label: 'heavy pet hair' },
    petWasteOrOdor: { manualReview: true, label: 'pet waste or odor' }
  },
  addOns: {
    fridge: { low: 25, suggested: 30, high: 35, label: 'Inside fridge' },
    oven: { low: 30, suggested: 40, high: 45, label: 'Inside oven' },
    baseboards: { low: 35, suggested: 55, high: 75, label: 'Baseboards' },
    windows: { low: 5, suggested: 6, high: 8, label: 'Interior windows', perUnit: true },
    cabinetExteriorKitchen: { low: 20, suggested: 30, high: 35, label: 'Cabinet exterior kitchen' },
    cabinetsInside: { low: 45, suggested: 65, high: 90, label: 'Cabinet interior kitchen' },
    woodFurniturePolish: { low: 15, suggested: 20, high: 30, label: 'Wood furniture polish' },
    laundryPerLoad: { low: 15, suggested: 20, high: 25, label: 'Laundry per load', perUnit: true },
    dishesLightSinkful: { low: 10, suggested: 15, high: 20, label: 'Dishes light sinkful' }
  },
  recurringDiscounts: {
    weekly: { percent: 0.12, label: 'Weekly recurring discount after initial reset' },
    biweekly: { percent: 0.08, label: 'Biweekly recurring discount after initial reset' },
    'bi-weekly': { percent: 0.08, label: 'Biweekly recurring discount after initial reset' },
    monthly: { percent: 0.03, label: 'Monthly recurring discount after initial reset' }
  },
  travelAdjustments: {
    core: { low: 0, suggested: 0, high: 0, label: 'Bolivar core zone' },
    bolivarCore: { low: 0, suggested: 0, high: 0, label: 'Bolivar core zone' },
    tenToTwentyMiles: { low: 15, suggested: 15, high: 15, label: '10–20 road miles' },
    twentyToThirtyFiveMiles: { low: 25, suggested: 30, high: 40, label: '20–35 road miles' },
    overThirtyFiveMiles: { manualReview: true, label: 'over 35 miles' }
  },
  manualReviewTriggers: [
    'severeBuildup',
    'excessiveClutter',
    'petWasteOrOdor',
    'smokeResidue',
    'mold',
    'biohazard',
    'hoardingCleanup',
    'postConstructionDust',
    'largeRuralHome',
    'unclearScope'
  ]
};

export const pricingProfiles = {
  [AUNT_BS_PRICING_PROFILE_ID]: auntBsCleaningServicesPricingProfile
};

export function getPricingProfileById(profileId) {
  return pricingProfiles[profileId] || null;
}

export function getPricingProfileForTenant(tenant) {
  const profileId = tenant?.pricingProfileId || tenant?.pricingProfile?.id;
  if (profileId) return getPricingProfileById(profileId);

  const normalizedBusinessName = String(tenant?.businessName || tenant?.name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  if (normalizedBusinessName === AUNT_BS_PRICING_PROFILE_ID) {
    return auntBsCleaningServicesPricingProfile;
  }

  return null;
}
