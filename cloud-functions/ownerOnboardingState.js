const OWNER_ONBOARDING_SCHEMA_VERSION = 1;
const INITIAL_ONBOARDING_STATE = 'business_profile_required';
const OPERATIONAL_SETUP_STATE = 'operational_setup_required';

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

function onboardingProgressForState(onboardingState) {
  const progress = PROGRESS_BY_STATE[onboardingState];
  if (!progress) return null;
  return {
    completedSteps: [...progress[0]],
    nextStep: progress[1],
    operationalComplete: progress[2],
  };
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
  onboardingProgressForState,
};
