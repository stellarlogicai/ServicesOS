const { firestoreServerTimestamp } = require('./firebaseAdminCompat');
const {
  hasCompleteBusinessProfile,
  membershipContains,
  normalizedText,
} = require('./ownerOnboardingBootstrapGateway');
const {
  isValidAvailability,
  isValidCanonicalService,
  isQualifyingEmployee,
} = require('./ownerOnboardingState');
const { isValidCustomBrandingState } = require('./brandingGateway');
const { projectConnectAccount } = require('./connectStripe');
const { ownerSubscriptionEntitlement } = require('./ownerSubscriptionEntitlement');
const { AGREEMENT_ID, AGREEMENT_TYPE, AGREEMENT_VERSION_DATE, CONTRACT_ID, termsHash, termsMarkdown } = require('./ownerSaasAgreement');

const ALLOWED_ORIGINS = new Set(['https://servicesos.netlify.app', 'http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:5174', 'http://localhost:5174']);
const MAX_SERVICES = 50;
const MAX_EMPLOYEES = 100;

class FinalizeError extends Error {
  constructor(message, { code = 'onboarding_conflict', status = 409, blockingStage = null } = {}) {
    super(message);
    this.name = 'FinalizeError';
    this.code = code;
    this.status = status;
    this.blockingStage = blockingStage;
  }
}

function failClosed() {
  throw new FinalizeError('Owner onboarding could not be finalized.');
}

function applyCors(req, res) {
  const origin = req.headers?.origin;
  if (ALLOWED_ORIGINS.has(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
  }
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function validAgreement(record, tenantId, uid, email) {
  return record?.agreementType === AGREEMENT_TYPE && record.agreementVersion === AGREEMENT_ID &&
    record.agreementVersionDate === AGREEMENT_VERSION_DATE && record.tenantId === tenantId &&
    record.acceptedByUid === uid && record.acceptedByEmail === email && record.affirmativeAcceptance === true &&
    record.status === 'accepted' && record.termsSnapshot === termsMarkdown && record.termsHash === termsHash &&
    record.termsFormat === 'markdown';
}

function accountReadiness(account, expectedId) {
  if (!account || account.id !== expectedId) return false;
  return projectConnectAccount(account).ready === true;
}

function billingReadiness(tenant, subscription, configuredPriceId) {
  if (!tenant || !subscription || !configuredPriceId || tenant.subscriptionPriceId !== configuredPriceId) return false;
  return ownerSubscriptionEntitlement(tenant, Math.floor(Date.now() / 1000), subscription).finalAcceptanceEligible === true;
}

async function collectTransactionFacts({ transaction, db, tenantId, uid, identityEmail }) {
  const tenantRef = db.collection('tenants').doc(tenantId);
  const userRef = db.collection('users').doc(uid);
  const [userSnapshot, tenantSnapshot, servicesSnapshot, brandingSnapshot, agreementSnapshot] = await Promise.all([
    transaction.get(userRef), transaction.get(tenantRef),
    transaction.get(tenantRef.collection('serviceCatalog').limit(MAX_SERVICES)),
    transaction.get(tenantRef.collection('branding').doc('config')),
    transaction.get(tenantRef.collection('contracts').doc(CONTRACT_ID)),
  ]);
  if (!userSnapshot.exists || !tenantSnapshot.exists) failClosed();
  const profile = userSnapshot.data() || {};
  const tenant = { id: tenantId, ...(tenantSnapshot.data() || {}) };
  if (profile.role !== 'admin' || profile.status !== 'active' || profile.tenantId !== tenantId ||
    tenant.onboardingSchemaVersion !== 1 || tenant.status !== 'active' || tenant.onboardingOwnerUid !== uid ||
    !membershipContains(tenant.adminUsers, uid)) failClosed();

  const serviceReady = servicesSnapshot.docs.some(document => isValidCanonicalService(document.data() || {}));
  const availabilityReady = isValidAvailability(tenant.businessSettings?.availability);
  const brandingReady = !brandingSnapshot.exists || isValidCustomBrandingState(brandingSnapshot.data() || {}, tenantId);
  const email = normalizedText(profile.email) || normalizedText(identityEmail);
  const agreementReady = Boolean(email && validAgreement(agreementSnapshot.data() || {}, tenantId, uid, email));
  let teamReady = tenant.workforceMode === 'owner_only';
  if (tenant.workforceMode === 'employees') {
    const employeesSnapshot = await transaction.get(tenantRef.collection('employees').limit(MAX_EMPLOYEES));
    const employeeProfiles = await Promise.all(employeesSnapshot.docs.map(document =>
      transaction.get(db.collection('users').doc(document.id))));
    teamReady = employeesSnapshot.docs.some((document, index) => employeeProfiles[index].exists &&
      isQualifyingEmployee({ tenantId, tenant, uid: document.id, employee: document.data() || {},
        profile: employeeProfiles[index].data() || {} }));
  }
  return { tenant, profile, businessProfileReady: hasCompleteBusinessProfile(tenant), agreementReady,
    serviceReady, availabilityReady, brandingReady, teamReady };
}

function firstBlockingStage(facts, providerReady) {
  if (!facts.businessProfileReady) return 'business_profile';
  if (!facts.agreementReady) return 'saas_agreement';
  if (!facts.serviceReady) return 'services_pricing';
  if (!facts.availabilityReady) return 'availability';
  if (!facts.brandingReady) return 'branding';
  if (!facts.teamReady) return 'team_setup';
  if (!providerReady.billing) return 'subscription_billing';
  if (!providerReady.connect) return 'stripe_connect';
  return null;
}

async function authorizeOwner({ admin, uid }) {
  if (!uid || uid === 'DEFAULT') failClosed();
  const db = admin.firestore();
  const userSnapshot = await db.collection('users').doc(uid).get();
  if (!userSnapshot.exists) failClosed();
  const profile = userSnapshot.data() || {};
  const tenantId = normalizedText(profile.tenantId);
  if (profile.role !== 'admin' || profile.status !== 'active' || !tenantId || tenantId === 'DEFAULT') failClosed();
  const tenantSnapshot = await db.collection('tenants').doc(tenantId).get();
  if (!tenantSnapshot.exists) failClosed();
  const tenant = { id: tenantId, ...(tenantSnapshot.data() || {}) };
  if (tenant.onboardingSchemaVersion !== 1 || tenant.onboardingOwnerUid !== uid ||
    !membershipContains(tenant.adminUsers, uid) || tenant.status !== 'active') failClosed();
  return { db, tenantId, tenant };
}

async function finalizeOwnerOnboarding({ admin, getStripe, getPriceId, identity }) {
  const uid = normalizedText(identity?.uid);
  const access = await authorizeOwner({ admin, uid });
  const { db, tenantId, tenant } = access;
  if (tenant.onboardingState === 'active') return { success: true, completed: true, idempotent: true, tenantId };
  if (tenant.onboardingState !== 'operational_setup_required') failClosed();

  let subscription = null;
  let account = null;
  try {
    const stripe = getStripe();
    if (tenant.stripeSubscriptionId && stripe?.subscriptions?.retrieve) {
      subscription = await stripe.subscriptions.retrieve(tenant.stripeSubscriptionId, { expand: ['latest_invoice'] });
    }
    if (tenant.stripeAccountId && stripe?.accounts?.retrieve) {
      account = await stripe.accounts.retrieve(tenant.stripeAccountId);
    }
  } catch {
    // Provider failures remain false readiness and are reported as a bounded blocking stage.
  }
  const priceId = normalizedText(getPriceId());
  const result = await db.runTransaction(async transaction => {
    const facts = await collectTransactionFacts({ transaction, db, tenantId, uid, identityEmail: identity.email });
    if (facts.tenant.onboardingState === 'active') return { completed: true, idempotent: true };
    if (facts.tenant.onboardingState !== 'operational_setup_required' ||
      facts.tenant.stripeCustomerId !== tenant.stripeCustomerId ||
      facts.tenant.stripeSubscriptionId !== tenant.stripeSubscriptionId ||
      facts.tenant.subscriptionPriceId !== tenant.subscriptionPriceId ||
      facts.tenant.stripeAccountId !== tenant.stripeAccountId) failClosed();
    const blockingStage = firstBlockingStage(facts, {
      billing: billingReadiness(facts.tenant, subscription, priceId),
      connect: accountReadiness(account, facts.tenant.stripeAccountId),
    });
    if (blockingStage) return { completed: false, blockingStage };
    const timestamp = firestoreServerTimestamp(admin);
    transaction.update(db.collection('tenants').doc(tenantId), {
      onboardingState: 'active',
      operationalCompletedAt: timestamp,
      operationalCompletedByUid: uid,
      updatedAt: timestamp,
    });
    return { completed: true, idempotent: false };
  });
  return { success: true, tenantId, ...result };
}

function createOwnerOnboardingFinalizeGatewayHandler({ admin, getStripe, getPriceId }) {
  return async (req, res) => {
    applyCors(req, res);
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed', code: 'method_not_allowed' });
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length !== 0) {
      return res.status(400).json({ error: 'Invalid request.', code: 'invalid_request' });
    }
    const authorization = req.headers?.authorization || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!token) return res.status(401).json({ error: 'Authentication required.', code: 'unauthenticated' });
    let identity;
    try { identity = await admin.auth().verifyIdToken(token); }
    catch { return res.status(401).json({ error: 'Authentication required.', code: 'unauthenticated' }); }
    try {
      const result = await finalizeOwnerOnboarding({ admin, getStripe, getPriceId, identity });
      if (!result.completed) return res.status(409).json({ error: 'Setup requirements changed. Review the current setup step.', code: 'prerequisite_incomplete', blockingStage: result.blockingStage });
      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof FinalizeError) return res.status(error.status).json({ error: error.message, code: error.code });
      return res.status(503).json({ error: 'Owner onboarding is temporarily unavailable.', code: 'onboarding_unavailable' });
    }
  };
}

module.exports = {
  FinalizeError,
  accountReadiness,
  billingReadiness,
  createOwnerOnboardingFinalizeGatewayHandler,
  finalizeOwnerOnboarding,
  firstBlockingStage,
};
