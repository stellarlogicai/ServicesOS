import { auntBsCleaningServicesPricingProfile } from './pricingProfiles';

const MONEY_FIELDS = ['low', 'suggested', 'high'];

function roundToNearestFive(value) {
  return Math.round(Number(value || 0) / 5) * 5;
}

function addMoney(a, b) {
  return {
    low: (a.low || 0) + (b.low || 0),
    suggested: (a.suggested || 0) + (b.suggested || 0),
    high: (a.high || 0) + (b.high || 0)
  };
}

function multiplyMoney(amount, multiplier) {
  return {
    low: amount.low * (multiplier.low ?? 1),
    suggested: amount.suggested * (multiplier.suggested ?? 1),
    high: amount.high * (multiplier.high ?? 1)
  };
}

function normalizeServiceType(value) {
  if (value === 'move-out' || value === 'move-in' || value === 'move-in-out') return 'moveout';
  if (value === 'deep-clean' || value === 'initial-reset') return 'deep';
  if (value === 'construction' || value === 'post-construction') return 'deep';
  return value || 'standard';
}

function normalizeCondition(value) {
  const normalized = String(value || 'normal').toLowerCase();
  if (['well-maintained', 'wellmaintained', 'weekly', 'light'].includes(normalized)) return 'wellMaintained';
  if (['needs-attention', 'needsattention', 'moderate', '2-3months', '2-3 months'].includes(normalized)) return 'needsAttention';
  if (['heavy-buildup', 'heavybuildup', 'heavy', '6months+', '6+ months'].includes(normalized)) return 'heavyBuildup';
  if (['severe-buildup', 'severebuildup', 'severe'].includes(normalized)) return 'severeBuildup';
  return 'normal';
}

function normalizeClutter(value) {
  const normalized = String(value || 'low').toLowerCase();
  if (['none', 'light', 'low', 'normal'].includes(normalized)) return normalized === 'normal' ? 'normal' : 'low';
  if (['moderate'].includes(normalized)) return 'moderate';
  if (['heavy', 'high'].includes(normalized)) return 'high';
  if (['excessive'].includes(normalized)) return 'excessive';
  return 'low';
}

function normalizePets(value, flags = {}) {
  if (flags.petWasteOrOdor || flags.petWasteRemoval) return 'petWasteOrOdor';
  const normalized = String(value || 'none').toLowerCase();
  if (['none', 'no'].includes(normalized)) return 'none';
  if (['light', 'onepetlighthair', 'one-pet-light-hair'].includes(normalized)) return 'light';
  if (['moderate', 'multiplepets', 'multiple-pets'].includes(normalized)) return 'multiplePets';
  if (['heavy', 'heavypethair', 'heavy-pet-hair'].includes(normalized)) return 'heavy';
  if (['petwasteorodor', 'pet-waste-or-odor', 'odor'].includes(normalized)) return 'petWasteOrOdor';
  return 'none';
}

function normalizeTravel(value) {
  const normalized = String(value || 'core').toLowerCase();
  if (['core', 'bolivarcore', 'bolivar-core', 'rural'].includes(normalized)) return 'core';
  if (['10-20', '10-20-miles', 'tentotwentymiles', 'ten-to-twenty-miles'].includes(normalized)) return 'tenToTwentyMiles';
  if (['20-35', '20-35-miles', 'twentytothirtyfivemiles', 'twenty-to-thirty-five-miles'].includes(normalized)) return 'twentyToThirtyFiveMiles';
  if (['over35', 'over-35', 'over-35-miles', 'overthirtyfivemiles'].includes(normalized)) return 'overThirtyFiveMiles';
  return 'core';
}

function findClosestAnchor(profile, bedrooms, bathrooms) {
  const safeBedrooms = Number(bedrooms) || 0;
  const safeBathrooms = Number(bathrooms) || 0;

  const exact = profile.anchors.find(anchor =>
    anchor.bedrooms === safeBedrooms && anchor.bathrooms === safeBathrooms
  );
  if (exact) return { anchor: exact, exact: true };

  const closest = [...profile.anchors].sort((a, b) => {
    const aDistance = Math.abs(a.bedrooms - safeBedrooms) + Math.abs(a.bathrooms - safeBathrooms);
    const bDistance = Math.abs(b.bedrooms - safeBedrooms) + Math.abs(b.bathrooms - safeBathrooms);
    if (aDistance !== bDistance) return aDistance - bDistance;
    const aSize = a.bedrooms + a.bathrooms;
    const bSize = b.bedrooms + b.bathrooms;
    return bSize - aSize;
  })[0];

  return { anchor: closest, exact: false };
}

function toLineItem(label, amount) {
  return {
    label,
    low: roundToNearestFive(amount.low),
    suggested: roundToNearestFive(amount.suggested),
    high: roundToNearestFive(amount.high)
  };
}

function addManualReview(reason, manualReviewReasons, internalNotes) {
  if (!manualReviewReasons.includes(reason)) {
    manualReviewReasons.push(reason);
    internalNotes.push(`Manual review: ${reason}`);
  }
}

function normalizeInput(input = {}) {
  const extras = input.extras || {};
  const riskFlags = input.riskFlags || {};
  const specialRequests = String(input.specialRequests || '').toLowerCase();

  return {
    bedrooms: Number(input.bedrooms ?? input.bedroomCount ?? 0),
    bathrooms: Number(input.bathrooms ?? input.bathroomCount ?? 0),
    serviceType: normalizeServiceType(input.serviceType || input.cleaningType),
    condition: normalizeCondition(input.condition || input.lastCleaned),
    clutter: normalizeClutter(input.clutter || input.clutterLevel),
    pets: normalizePets(input.pets || input.petHairLevel, {
      petWasteOrOdor: riskFlags.petWasteOrOdor,
      petWasteRemoval: extras.petWasteRemoval
    }),
    frequency: input.frequency || 'one-time',
    travelZone: normalizeTravel(input.travelZone || input.travel),
    extras,
    addOnQuantities: input.addOnQuantities || {},
    riskFlags: {
      ...riskFlags,
      smokeResidue: riskFlags.smokeResidue || specialRequests.includes('smoke'),
      mold: riskFlags.mold || specialRequests.includes('mold'),
      biohazard: riskFlags.biohazard || specialRequests.includes('biohazard'),
      hoardingCleanup: riskFlags.hoardingCleanup || specialRequests.includes('hoarding'),
      postConstructionDust: riskFlags.postConstructionDust || input.cleaningType === 'construction',
      largeRuralHome: riskFlags.largeRuralHome,
      unclearScope: riskFlags.unclearScope || specialRequests.includes('unclear')
    }
  };
}

export function calculatePricingProfileEstimate(input = {}, profile = auntBsCleaningServicesPricingProfile) {
  if (!profile) {
    throw new Error('Pricing profile is required');
  }

  const normalized = normalizeInput(input);
  const manualReviewReasons = [];
  const internalNotes = [];
  const warnings = [];
  const lineItems = [];

  const { anchor, exact } = findClosestAnchor(profile, normalized.bedrooms, normalized.bathrooms);
  const maxAnchor = profile.anchors.reduce((largest, current) =>
    (current.bedrooms + current.bathrooms) > (largest.bedrooms + largest.bathrooms) ? current : largest
  , profile.anchors[0]);
  const largerThanSupported = normalized.bedrooms > maxAnchor.bedrooms || normalized.bathrooms > maxAnchor.bathrooms;

  let total = { low: anchor.low, suggested: anchor.suggested, high: anchor.high };
  lineItems.push(toLineItem('Base cleaning', total));
  internalNotes.push(`Base anchor: ${anchor.bedrooms} bed / ${anchor.bathrooms} bath standard cleaning`);

  if (!exact) {
    const warning = `Closest supported anchor used for ${normalized.bedrooms} bed / ${normalized.bathrooms} bath home.`;
    warnings.push(warning);
    internalNotes.push(warning);
  }

  if (largerThanSupported) {
    addManualReview('large rural home', manualReviewReasons, internalNotes);
    warnings.push('Large or unsupported home size should be reviewed before sending a final quote.');
  }

  const service = profile.serviceMultipliers[normalized.serviceType] || profile.serviceMultipliers.standard;
  total = multiplyMoney(total, service);
  internalNotes.push(`Service: ${service.label}`);

  const condition = profile.conditionMultipliers[normalized.condition] || profile.conditionMultipliers.normal;
  if (condition.manualReview) addManualReview(condition.label, manualReviewReasons, internalNotes);
  else total = multiplyMoney(total, condition);
  internalNotes.push(`Condition: ${condition.label}`);

  const clutter = profile.clutterMultipliers[normalized.clutter] || profile.clutterMultipliers.low;
  if (clutter.manualReview) addManualReview(clutter.label, manualReviewReasons, internalNotes);
  else total = multiplyMoney(total, clutter);
  internalNotes.push(`Clutter: ${clutter.label}`);

  const pets = profile.petAdjustments[normalized.pets] || profile.petAdjustments.none;
  if (pets.manualReview) addManualReview(pets.label, manualReviewReasons, internalNotes);
  else if (pets.suggested) {
    total = addMoney(total, pets);
    lineItems.push(toLineItem(pets.label, pets));
    internalNotes.push(`Pets: ${pets.label}`);
  } else {
    internalNotes.push('Pets: none');
  }

  Object.entries(profile.addOns).forEach(([key, addOn]) => {
    const rawEnabled = normalized.extras[key];
    const quantity = Number(normalized.addOnQuantities[key] ?? (rawEnabled === true ? 1 : rawEnabled || 0));
    if (!quantity) return;

    const amount = {
      low: addOn.low * quantity,
      suggested: addOn.suggested * quantity,
      high: addOn.high * quantity
    };
    total = addMoney(total, amount);
    lineItems.push(toLineItem(quantity > 1 ? `${addOn.label} x${quantity}` : addOn.label, amount));
    internalNotes.push(`Add-on: ${quantity > 1 ? `${addOn.label} x${quantity}` : addOn.label}`);
  });

  const travel = profile.travelAdjustments[normalized.travelZone] || profile.travelAdjustments.core;
  if (travel.manualReview) addManualReview(travel.label, manualReviewReasons, internalNotes);
  else {
    total = addMoney(total, travel);
  }
  internalNotes.push(`Travel: ${travel.label}`);

  const recurring = profile.recurringDiscounts[normalized.frequency];
  if (recurring) {
    const discount = {
      low: total.low * recurring.percent,
      suggested: total.suggested * recurring.percent,
      high: total.high * recurring.percent
    };
    total = {
      low: total.low - discount.low,
      suggested: total.suggested - discount.suggested,
      high: total.high - discount.high
    };
    internalNotes.push(recurring.label);
  }

  Object.entries(normalized.riskFlags).forEach(([key, enabled]) => {
    if (!enabled) return;
    const reason = key
      .replace(/([A-Z])/g, ' $1')
      .toLowerCase()
      .trim();
    addManualReview(reason, manualReviewReasons, internalNotes);
  });

  const minimum = Math.max(profile.minimumJobPrice, service.minimum || 0);
  const beforeMinimum = { ...total };
  MONEY_FIELDS.forEach(field => {
    total[field] = Math.max(roundToNearestFive(total[field]), minimum);
  });
  if (total.suggested > total.high) total.high = total.suggested;
  if (total.low > total.suggested) total.suggested = total.low;

  if (beforeMinimum.low < minimum || beforeMinimum.suggested < minimum || beforeMinimum.high < minimum) {
    internalNotes.push(`Minimum enforced: $${minimum}`);
  }

  const serviceLabel = service.label.toLowerCase();
  const customerSummary = `Estimated ${serviceLabel} range for a ${normalized.bedrooms} bed / ${normalized.bathrooms} bath home in ${condition.label} condition.`;

  return {
    tenantPricingProfileId: profile.id,
    market: profile.market,
    currency: profile.currency || 'USD',
    low: total.low,
    suggested: total.suggested,
    high: total.high,
    requiresManualReview: manualReviewReasons.length > 0,
    manualReviewReasons,
    customerSummary,
    internalNotes,
    lineItems,
    warnings
  };
}
