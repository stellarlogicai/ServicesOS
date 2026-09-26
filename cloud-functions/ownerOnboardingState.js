const OWNER_ONBOARDING_SCHEMA_VERSION = 1;
const { ownerSubscriptionEntitlement } = require('./ownerSubscriptionEntitlement');
const INITIAL_ONBOARDING_STATE = 'business_profile_required';
const OPERATIONAL_SETUP_STATE = 'operational_setup_required';
const VALID_SERVICE_TYPES = new Set(['standard', 'deep', 'moveout', 'construction']);
const VALID_BUSINESS_DAYS = new Set(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);

function membershipContains(membership, uid) {
  if (Array.isArray(membership)) return membership.includes(uid);
  return Boolean(membership && typeof membership === 'object' && Object.hasOwn(membership, uid) && membership[uid]);
}

function isQualifyingEmployee({ tenantId, tenant, uid, employee, profile }) {
  if (!tenantId || !uid || !employee || !profile) return false;
  if (employee.authUid !== uid || profile.tenantId !== tenantId || profile.role !== 'employee' || profile.status !== 'active') return false;
  if (!membershipContains(tenant.users, uid)) return false;
  if (typeof employee.email !== 'string' || typeof profile.email !== 'string' || employee.email.trim().toLowerCase() !== profile.email.trim().toLowerCase()) return false;
  const activationStatus = typeof employee.activationStatus === 'string' ? employee.activationStatus.trim() : '';
  return activationStatus === '' || activationStatus === 'email_sent';
}

async function hasQualifyingEmployee({ admin, tenantId, tenant }) {
  const employeeSnapshot = await admin.firestore().collection('tenants').doc(tenantId).collection('employees').limit(100).get();
  for (const employeeDocument of employeeSnapshot.docs) {
    const uid = employeeDocument.id;
    const profileSnapshot = await admin.firestore().collection('users').doc(uid).get();
    if (profileSnapshot.exists && isQualifyingEmployee({ tenantId, tenant, uid, employee: employeeDocument.data() || {}, profile: profileSnapshot.data() || {} })) return true;
  }
  return false;
}

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
      if (operational.brandingComplete) {
        completedSteps.push('branding');
        if (operational.teamSetupComplete) {
          completedSteps.push('team_setup');
          if (operational.stripeConnectComplete) completedSteps.push('stripe_connect');
        }
      }
    }
  }
  return {
    completedSteps,
    nextStep: operational.servicesPricingComplete
      ? (operational.availabilityComplete
        ? (operational.brandingComplete
          ? (operational.teamSetupComplete
            ? (operational.stripeConnectComplete ? 'final_acceptance' : 'stripe_connect')
            : 'team_setup')
          : 'branding')
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
  return ownerSubscriptionEntitlement(tenant).state === 'active' ? 'active' : 'inactive';
}

module.exports = {
  INITIAL_ONBOARDING_STATE,
  OPERATIONAL_SETUP_STATE,
  OWNER_ONBOARDING_SCHEMA_VERSION,
  VALID_ONBOARDING_STATES,
  billingEntitlementForTenant,
  isValidAvailability,
  isValidCanonicalService,
  hasQualifyingEmployee,
  isQualifyingEmployee,
  onboardingProgressForState,
};
