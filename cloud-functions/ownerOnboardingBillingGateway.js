const { membershipContains, normalizedText } = require('./ownerOnboardingBootstrapGateway');
const { firestoreServerTimestamp } = require('./firebaseAdminCompat');

const BILLING_PURPOSE = 'servicesos_owner_subscription';
const BILLING_SCHEMA_VERSION = '1';
const ALLOWED_ORIGINS = new Set([
  'https://servicesos.netlify.app',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'http://127.0.0.1:5174',
  'http://localhost:5174',
]);

class BillingError extends Error {
  constructor(message, { code = 'billing_unavailable', status = 409 } = {}) {
    super(message);
    this.name = 'BillingError';
    this.code = code;
    this.status = status;
  }
}

function failClosed() {
  throw new BillingError('Subscription checkout is unavailable.');
}

function validateRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 0) {
    throw new BillingError('Invalid subscription checkout request.', {
      code: 'invalid_request',
      status: 400,
    });
  }
}

function canonicalMetadata(tenantId) {
  return {
    tenantId,
    billingPurpose: BILLING_PURPOSE,
    onboardingSchemaVersion: BILLING_SCHEMA_VERSION,
  };
}

function metadataMatches(metadata, tenantId) {
  const expected = canonicalMetadata(tenantId);
  return metadata?.tenantId === expected.tenantId &&
    metadata?.billingPurpose === expected.billingPurpose &&
    metadata?.onboardingSchemaVersion === expected.onboardingSchemaVersion;
}

function normalizeAppUrl(value) {
  const text = normalizedText(value);
  if (!text) throw new BillingError('Subscription checkout configuration is unavailable.', { status: 503 });
  let url;
  try { url = new URL(text); } catch { throw new BillingError('Subscription checkout configuration is unavailable.', { status: 503 }); }
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) || url.username || url.password) {
    throw new BillingError('Subscription checkout configuration is unavailable.', { status: 503 });
  }
  return url.origin;
}

function validateConfig({ priceId, appUrl }) {
  const canonicalPriceId = normalizedText(priceId);
  if (!canonicalPriceId || !/^price_[A-Za-z0-9]+$/.test(canonicalPriceId)) {
    throw new BillingError('Subscription checkout configuration is unavailable.', { status: 503 });
  }
  return { priceId: canonicalPriceId, appUrl: normalizeAppUrl(appUrl) };
}

function customerMatches(customer, tenantId) {
  return customer && customer.deleted !== true && metadataMatches(customer.metadata, tenantId);
}

function sessionMatches(session, { tenantId, customerId, priceId }) {
  const customer = typeof session?.customer === 'string' ? session.customer : session?.customer?.id;
  return session?.status === 'open' && normalizedText(session.url) && customer === customerId &&
    session?.metadata?.priceId === priceId && metadataMatches(session.metadata, tenantId);
}

async function authorizeOwner({ admin, identity }) {
  const uid = normalizedText(identity?.uid);
  if (!uid || uid === 'DEFAULT') failClosed();
  const db = admin.firestore();
  const userSnapshot = await db.collection('users').doc(uid).get();
  if (!userSnapshot.exists) failClosed();
  const profile = userSnapshot.data() || {};
  const tenantId = normalizedText(profile.tenantId);
  if (profile.role !== 'admin' || profile.status !== 'active' || !tenantId || tenantId === 'DEFAULT') failClosed();
  const tenantRef = db.collection('tenants').doc(tenantId);
  const tenantSnapshot = await tenantRef.get();
  if (!tenantSnapshot.exists) failClosed();
  const tenant = tenantSnapshot.data() || {};
  if (tenant.onboardingSchemaVersion !== 1 || tenant.onboardingOwnerUid !== uid ||
    tenant.status !== 'onboarding' || tenant.onboardingState !== 'billing_required' ||
    !membershipContains(tenant.adminUsers, uid)) failClosed();
  return { db, profile, tenant, tenantId, tenantRef, uid };
}

async function ensureCustomer({ stripe, access, admin }) {
  const { tenant, tenantId, tenantRef, profile } = access;
  let customerId = normalizedText(tenant.stripeCustomerId);
  if (customerId) {
    const customer = await stripe.customers.retrieve(customerId);
    if (!customerMatches(customer, tenantId)) failClosed();
    return customerId;
  }

  const metadata = canonicalMetadata(tenantId);
  const customer = await stripe.customers.create({
    email: normalizedText(tenant.businessEmail) || normalizedText(profile.email) || undefined,
    name: normalizedText(tenant.businessName) || undefined,
    metadata,
  }, { idempotencyKey: `servicesos-owner-customer-${tenantId}` });
  if (!customerMatches(customer, tenantId)) failClosed();
  customerId = customer.id;
  await access.db.runTransaction(async transaction => {
    const currentSnapshot = await transaction.get(tenantRef);
    if (!currentSnapshot.exists) failClosed();
    const current = currentSnapshot.data() || {};
    if (current.status !== 'onboarding' || current.onboardingState !== 'billing_required') failClosed();
    const existing = normalizedText(current.stripeCustomerId);
    if (existing && existing !== customerId) failClosed();
    if (!existing) transaction.update(tenantRef, {
      stripeCustomerId: customerId,
      billingUpdatedAt: firestoreServerTimestamp(admin),
    });
  });
  return customerId;
}

async function createCheckout({ admin, identity, stripe, priceId, appUrl, body }) {
  validateRequest(body);
  const config = validateConfig({ priceId, appUrl });
  const access = await authorizeOwner({ admin, identity });
  const customerId = await ensureCustomer({ stripe, access, admin });
  const latestTenant = (await access.tenantRef.get()).data() || {};
  const prior = latestTenant.ownerSubscriptionCheckout;
  if (prior?.sessionId && prior.customerId === customerId && prior.priceId === config.priceId) {
    const existingSession = await stripe.checkout.sessions.retrieve(prior.sessionId);
    if (sessionMatches(existingSession, { tenantId: access.tenantId, customerId, priceId: config.priceId })) {
      return { success: true, checkout: { sessionId: existingSession.id, checkoutUrl: existingSession.url } };
    }
  }

  const attempt = Number.isSafeInteger(prior?.attempt) && prior.attempt >= 0 ? prior.attempt + 1 : 1;
  const metadata = { ...canonicalMetadata(access.tenantId), priceId: config.priceId };
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: config.priceId, quantity: 1 }],
    success_url: `${config.appUrl}/?servicesos_owner_checkout=returned&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.appUrl}/?servicesos_owner_checkout=cancelled`,
    metadata,
    subscription_data: { metadata: canonicalMetadata(access.tenantId) },
  }, { idempotencyKey: `servicesos-owner-checkout-${access.tenantId}-${attempt}` });
  if (!sessionMatches(session, { tenantId: access.tenantId, customerId, priceId: config.priceId })) {
    throw new BillingError('Subscription checkout could not be created.', { status: 503 });
  }
  await access.db.runTransaction(async transaction => {
    const snapshot = await transaction.get(access.tenantRef);
    if (!snapshot.exists) failClosed();
    const tenant = snapshot.data() || {};
    if (tenant.status !== 'onboarding' || tenant.onboardingState !== 'billing_required' ||
      tenant.stripeCustomerId !== customerId) failClosed();
    transaction.update(access.tenantRef, {
      ownerSubscriptionCheckout: {
        sessionId: session.id,
        customerId,
        priceId: config.priceId,
        status: 'open',
        attempt,
      },
      billingUpdatedAt: firestoreServerTimestamp(admin),
    });
  });
  return { success: true, checkout: { sessionId: session.id, checkoutUrl: session.url } };
}

function applyCors(req, res) {
  const origin = req.headers?.origin;
  if (ALLOWED_ORIGINS.has(origin)) res.set('Access-Control-Allow-Origin', origin);
  res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function createOwnerOnboardingBillingGatewayHandler({ admin, getStripe, getPriceId, getAppUrl }) {
  return async (req, res) => {
    applyCors(req, res);
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed', code: 'method_not_allowed' });
    const authHeader = req.headers?.authorization || '';
    if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required', code: 'unauthenticated' });
    let identity;
    try { identity = await admin.auth().verifyIdToken(authHeader.slice(7).trim()); }
    catch { return res.status(401).json({ error: 'Invalid authentication token', code: 'unauthenticated' }); }
    try {
      const stripe = getStripe();
      const result = await createCheckout({ admin, identity, stripe, priceId: getPriceId(), appUrl: getAppUrl(), body: req.body });
      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof BillingError) return res.status(error.status).json({ error: error.message, code: error.code });
      return res.status(503).json({ error: 'Subscription checkout is temporarily unavailable.', code: 'billing_unavailable' });
    }
  };
}

module.exports = {
  BILLING_PURPOSE,
  BillingError,
  canonicalMetadata,
  createCheckout,
  createOwnerOnboardingBillingGatewayHandler,
  metadataMatches,
  sessionMatches,
  validateConfig,
  validateRequest,
};
