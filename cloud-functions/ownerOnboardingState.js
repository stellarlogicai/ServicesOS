const OWNER_ONBOARDING_SCHEMA_VERSION = 1;
const INITIAL_ONBOARDING_STATE = 'business_profile_required';
const OPERATIONAL_SETUP_STATE = 'operational_setup_required';
const VALID_SERVICE_TYPES = new Set(['standard', 'deep', 'moveout', 'construction']);
const VALID_BUSINESS_DAYS = new Set(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);

const VALID_ONBOARDING_STATES = new Set([
  INITIAL_ONBOARDING_STATE,
  'agreement_required',
  'billing_required',
  OPERATIONAL_SETUP_STATE,
  'active',
]);

const PROGRESS_BY_STATE = Object.freeze({
  business_profile_required: [[], 'business_profile', false],
  agreement_required: [['business_profile'], 'saas_agreement', false],
  billing_required: [['business_profile', 'saas_agreement'], 'subscription_billing', false],
  operational_setup_required: [
    ['business_profile', 'saas_agreement', 'subscription_billing'],
    'services_pricing',
    false,
  ],
  active: [
    ['business_profile', 'saas_agreement', 'subscription_billing', 'operational_setup'],
    null,
    true,
  ],
});

function onboardingProgressForState(onboardingState, operational = {}) {
  const progress = PROGRESS_BY_STATE[onboardingState];
  if (!progress) return null;
  if (onboardingState !== OPERATIONAL_SETUP_STATE) return { completedSteps: [...progress[0]], nextStep: progress[1], operationalComplete: progress[2] };
  const completedSteps = [...progress[0]];
  if (operational.servicesPricingComplete) {
    completedSteps.push('services_pricing');
    if (operational.availabilityComplete) {
      completedSteps.push('availability');
      if (operational.brandingComplete) completedSteps.push('branding');
    }
  }
  return {
    completedSteps,
    nextStep: operational.servicesPricingComplete
      ? (operational.availabilityComplete
        ? (operational.brandingComplete ? 'team_setup' : 'branding')
        : 'availability')
      : 'services_pricing',
    operationalComplete: false,
  };
}

function isValidCanonicalService(value = {}) {
  return typeof value.name === 'string' && value.name.trim().length > 0 && value.name.trim().length <= 100 &&
    VALID_SERVICE_TYPES.has(value.serviceType) && value.active === true && Number.isInteger(value.priceCents) &&
    value.priceCents >= 1 && value.priceCents <= 10000000 && Number.isInteger(value.durationMinutes) &&
    value.durationMinutes >= 1 && value.durationMinutes <= 1440;
}

function isValidAvailability(value = {}) {
  return Array.isArray(value.availableDays) && value.availableDays.some(day => VALID_BUSINESS_DAYS.has(day));
}

function billingEntitlementForTenant(tenant) {
  return tenant?.subscriptionStatus === 'active' ? 'active' : 'inactive';
}

module.exports = {
  INITIAL_ONBOARDING_STATE,
  OPERATIONAL_SETUP_STATE,
  OWNER_ONBOARDING_SCHEMA_VERSION,
  VALID_ONBOARDING_STATES,
  billingEntitlementForTenant,
  isValidAvailability,
  isValidCanonicalService,
  onboardingProgressForState,
};
