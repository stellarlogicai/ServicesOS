const { membershipContains, normalizedText } = require('./ownerOnboardingBootstrapGateway');
const { metadataMatches, normalizeAppUrl } = require('./ownerOnboardingBillingGateway');

const ALLOWED_ORIGINS = new Set([
  'https://servicesos.netlify.app',
  'http://127.0.0.1:5173', 'http://localhost:5173',
  'http://127.0.0.1:5174', 'http://localhost:5174',
]);

class PortalError extends Error {
  constructor(message, status = 409, code = 'portal_unavailable') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function unavailable() {
  throw new PortalError('Billing management is unavailable. Try again.');
}

function validateRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 0) {
    throw new PortalError('Invalid billing management request.', 400, 'invalid_request');
  }
}

function validateConfiguration(configuration, expectedId) {
  const features = configuration?.features;
  if (configuration?.id !== expectedId || configuration?.active !== true ||
    configuration.application != null ||
    features?.payment_method_update?.enabled !== true ||
    features?.invoice_history?.enabled !== true ||
    features?.subscription_cancel?.enabled !== true ||
    features?.subscription_cancel?.mode !== 'at_period_end' ||
    features?.subscription_update?.enabled !== false ||
    features?.subscription_pause?.enabled !== false ||
    features?.customer_update?.enabled !== false) unavailable();
}

async function createOwnerBillingPortal({ admin, stripe, identity, configurationId, appUrl, body }) {
  validateRequest(body);
  const portalConfigurationId = normalizedText(configurationId);
  if (!portalConfigurationId || !/^bpc_[A-Za-z0-9]+$/.test(portalConfigurationId)) unavailable();
  const origin = normalizeAppUrl(appUrl);
  const uid = normalizedText(identity?.uid);
  if (!uid || uid === 'DEFAULT') unavailable();
  const db = admin.firestore();
  const user = await db.collection('users').doc(uid).get();
  if (!user.exists) unavailable();
  const profile = user.data() || {};
  const tenantId = normalizedText(profile.tenantId);
  if (profile.role !== 'admin' || profile.status !== 'active' || !tenantId || tenantId === 'DEFAULT') unavailable();
  const tenantSnapshot = await db.collection('tenants').doc(tenantId).get();
  if (!tenantSnapshot.exists) unavailable();
  const tenant = tenantSnapshot.data() || {};
  const customerId = normalizedText(tenant.stripeCustomerId);
  if (tenant.onboardingSchemaVersion !== 1 || tenant.status !== 'active' ||
    !membershipContains(tenant.adminUsers, uid) || !customerId || !/^cus_[A-Za-z0-9]+$/.test(customerId) ||
    !normalizedText(tenant.stripeSubscriptionId)) unavailable();

  const customer = await stripe.customers.retrieve(customerId);
  if (!customer || customer.deleted === true || customer.id !== customerId ||
    !metadataMatches(customer.metadata, tenantId)) unavailable();
  const configuration = await stripe.billingPortal.configurations.retrieve(portalConfigurationId);
  validateConfiguration(configuration, portalConfigurationId);

  const returnUrl = `${origin}/?servicesos_owner_billing=returned`;
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    configuration: portalConfigurationId,
    return_url: returnUrl,
  });
  let sessionUrl;
  try { sessionUrl = new URL(session?.url); } catch { unavailable(); }
  if (sessionUrl.protocol !== 'https:' || sessionUrl.hostname !== 'billing.stripe.com' ||
    sessionUrl.username || sessionUrl.password || session.customer !== customerId ||
    session.configuration !== portalConfigurationId || session.return_url !== returnUrl) unavailable();
  return { success: true, portalUrl: sessionUrl.toString() };
}

function applyCors(req, res) {
  const origin = req.headers?.origin;
  if (ALLOWED_ORIGINS.has(origin)) res.set('Access-Control-Allow-Origin', origin);
  res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function createOwnerBillingPortalGatewayHandler({ admin, getStripe, getConfigurationId, getAppUrl }) {
  return async (req, res) => {
    applyCors(req, res);
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed', code: 'method_not_allowed' });
    const authHeader = req.headers?.authorization || '';
    if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required', code: 'unauthenticated' });
    let identity;
    try { identity = await admin.auth().verifyIdToken(authHeader.slice(7).trim()); }
    catch { return res.status(401).json({ error: 'Authentication required', code: 'unauthenticated' }); }
    try {
      const result = await createOwnerBillingPortal({ admin, stripe: getStripe(), identity,
        configurationId: getConfigurationId(), appUrl: getAppUrl(), body: req.body });
      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof PortalError) return res.status(error.status).json({ error: error.message, code: error.code });
      return res.status(503).json({ error: 'Billing management is temporarily unavailable. Try again.', code: 'portal_unavailable' });
    }
  };
}

module.exports = { createOwnerBillingPortal, createOwnerBillingPortalGatewayHandler, validateConfiguration };
