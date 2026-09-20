const crypto = require('node:crypto');

const CONNECT_SETUP_ALLOWED_ORIGINS = new Set([
  'https://servicesos.netlify.app',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'http://127.0.0.1:5174',
  'http://localhost:5174',
]);
const CONNECT_SETUP_ALLOWED_HEADERS = 'Content-Type, Authorization';

function stripeModeFromKey(secretKey = '') {
  if (typeof secretKey !== 'string') return '';
  if (secretKey.startsWith('sk_live_')) return 'live';
  if (secretKey.startsWith('sk_test_')) return 'test';
  return '';
}

function applyConnectSetupCors(req, res, allowedMethods) {
  const origin = req.headers?.origin;
  if (CONNECT_SETUP_ALLOWED_ORIGINS.has(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
  }
  res.set('Access-Control-Allow-Methods', allowedMethods);
  res.set('Access-Control-Allow-Headers', CONNECT_SETUP_ALLOWED_HEADERS);
}

function handleConnectSetupPreflight(req, res, allowedMethods) {
  applyConnectSetupCors(req, res, allowedMethods);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return true;
  }
  return false;
}

function tenantMembershipIncludes(membership, uid) {
  if (!uid || !membership) return false;
  if (Array.isArray(membership)) return membership.includes(uid);
  if (typeof membership === 'object') return Boolean(membership[uid]);
  return false;
}

function isStripeConnectNotEnabledError(error) {
  const message = typeof error?.message === 'string' ? error.message : '';
  return error?.code === 'platform_account_required'
    || error?.raw?.code === 'platform_account_required'
    || (
      error?.type === 'StripeInvalidRequestError'
      && (error?.statusCode === 400 || error?.raw?.statusCode === 400)
    )
    || (
      error?.type === 'StripeInvalidRequestError'
      && message.includes("signed up for Connect")
    )
    || message.includes('Only Stripe Connect platforms can work with other accounts');
}

function maskedAccountId(accountId = '') {
  if (typeof accountId !== 'string' || accountId.length <= 6) return accountId || 'missing';
  return `...${accountId.slice(-6)}`;
}

function isValidHttpUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function hasExactKeys(value, allowedKeys) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)) &&
    Object.keys(value).every(key => allowedKeys.has(key));
}

function trustedConnectUrls(appUrl) {
  try {
    const url = new URL(appUrl);
    if (!CONNECT_SETUP_ALLOWED_ORIGINS.has(url.origin)) return null;
    const destination = `${url.origin}/`;
    return { refreshUrl: destination, returnUrl: destination };
  } catch {
    return null;
  }
}

function connectAccountIdempotencyKey(tenantId) {
  const digest = crypto.createHash('sha256').update(`servicesos-connect-account-v1:${tenantId}`).digest('hex');
  return `servicesos-connect-account-v1-${digest}`;
}

function boundedRequirements(requirements = {}) {
  const values = key => Array.isArray(requirements[key])
    ? requirements[key].filter(value => typeof value === 'string').slice(0, 50).map(value => value.slice(0, 200))
    : [];
  return { currentlyDue: values('currently_due'), pastDue: values('past_due') };
}

function projectConnectAccount(account) {
  const requirements = boundedRequirements(account?.requirements);
  const chargesEnabled = account?.charges_enabled === true;
  const payoutsEnabled = account?.payouts_enabled === true;
  const ready = chargesEnabled && payoutsEnabled && requirements.currentlyDue.length === 0 && requirements.pastDue.length === 0;
  return {
    connected: true,
    accountId: account.id,
    status: ready ? 'active' : 'pending',
    ready,
    detailsSubmitted: account?.details_submitted === true,
    chargesEnabled,
    payoutsEnabled,
    requirements,
  };
}

function handleStripeConnectSetupError(error, res, context) {
  const stripeRequestId = error?.requestId || error?.raw?.requestId;
  console.error(`[Stripe Connect] ${context}:`, {
    type: error?.type || error?.rawType || 'unknown',
    code: error?.code || error?.raw?.code,
    message: error?.message,
    statusCode: error?.statusCode || error?.raw?.statusCode,
    requestId: stripeRequestId,
  });

  if (isStripeConnectNotEnabledError(error)) {
    return res.status(409).json({
      error: 'Stripe Connect platform setup is not ready. Confirm you are using the sk_test key from the Stellar Logic AI onboarding sandbox with Connect enabled.',
    });
  }

  return res.status(502).json({
    error: 'Stripe Connect setup could not be completed. Check Stripe test-mode setup and try again.',
  });
}

function handleStripeAccountLinkError(error, res, { tenantId, stripeAccountId }) {
  console.error('[Stripe Connect] Error generating onboarding link:', {
    type: error?.type || error?.rawType || 'unknown',
    code: error?.code || error?.raw?.code,
    message: error?.message,
    statusCode: error?.statusCode || error?.raw?.statusCode,
    requestId: error?.requestId || error?.raw?.requestId,
    tenantId,
    stripeAccountId: maskedAccountId(stripeAccountId),
  });

  const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
  const code = error?.code || error?.raw?.code;

  if (message.includes('no such account') || code === 'resource_missing') {
    return res.status(409).json({
      error: 'Stripe connected account is not accessible from the configured Stripe test key. Create a new connected account under the currently configured Stripe platform sandbox.',
    });
  }

  if (error?.statusCode === 400 || error?.raw?.statusCode === 400 || code || message) {
    return res.status(409).json({
      error: 'Stripe onboarding link could not be created for this connected account. Confirm the account belongs to this Stripe platform sandbox and supports hosted onboarding.',
    });
  }

  return res.status(502).json({
    error: 'Stripe onboarding link could not be created. Check Stripe test-mode setup and try again.',
  });
}

async function verifyHttpTenantAdmin(req, { admin, tenantId }) {
  const authHeader = req.headers?.authorization || req.headers?.Authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return { success: false, status: 401, error: 'Authentication required' };
  }

  let decodedToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(authHeader.slice('Bearer '.length).trim());
  } catch (error) {
    return { success: false, status: 401, error: 'Invalid authentication token' };
  }

  const uid = decodedToken.uid;
  const db = admin.firestore();
  const userDoc = await db.collection('users').doc(uid).get();
  if (!userDoc.exists) {
    return { success: false, status: 403, error: 'User is not authorized for this tenant' };
  }

  const userData = userDoc.data() || {};
  const isAllowedRole = ['admin', 'owner', 'super_admin'].includes(userData.role);
  if (!isAllowedRole || userData.status !== 'active' || userData.tenantId !== tenantId) {
    return { success: false, status: 403, error: 'User is not authorized for this tenant' };
  }

  const tenantDoc = await db.collection('tenants').doc(tenantId).get();
  if (!tenantDoc.exists) {
    return { success: false, status: 404, error: 'Tenant not found' };
  }

  const tenantData = tenantDoc.data() || {};
  const inAdminUsers = tenantMembershipIncludes(tenantData.adminUsers, uid);
  const inUsers = tenantMembershipIncludes(tenantData.users, uid);
  if ((tenantData.adminUsers && !inAdminUsers) || (tenantData.users && !inUsers)) {
    return { success: false, status: 403, error: 'User is not authorized for this tenant' };
  }

  return { success: true, db, tenantDoc, tenantData, uid };
}

function createConnectedAccountHandler({ admin, secretKey, stripe }) {
  return async (req, res) => {
    if (handleConnectSetupPreflight(req, res, 'POST, OPTIONS')) return;

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      if (!hasExactKeys(req.body, new Set(['tenantId', 'businessEmail', 'businessName']))) {
        return res.status(400).json({ error: 'Invalid request' });
      }
      const { tenantId, businessEmail, businessName } = req.body;

      if (!tenantId || !businessEmail) {
        return res.status(400).json({ error: 'tenantId and businessEmail are required' });
      }

      const access = await verifyHttpTenantAdmin(req, { admin, tenantId });
      if (!access.success) {
        return res.status(access.status).json({ error: access.error });
      }

      const existingAccountId = access.tenantData.stripeAccountId;
      if (existingAccountId) {
        const existingAccount = await stripe.accounts.retrieve(existingAccountId);
        return res.json({ ...projectConnectAccount(existingAccount), reused: true });
      }

      const account = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        email: businessEmail,
        business_profile: {
          name: businessName || businessEmail.split('@')[0],
          url: `https://${businessEmail.split('@')[1]}`,
        },
        capabilities: {
          transfers: { requested: true },
          card_payments: { requested: true },
        },
      }, { idempotencyKey: connectAccountIdempotencyKey(tenantId) });

      const db = admin.firestore();
      const canonicalAccountId = await db.runTransaction(async transaction => {
        const freshTenant = await transaction.get(access.tenantDoc.ref);
        const currentAccountId = freshTenant.data()?.stripeAccountId;
        if (currentAccountId && currentAccountId !== account.id) return currentAccountId;
        if (!currentAccountId) {
          transaction.update(access.tenantDoc.ref, {
            stripeAccountId: account.id,
            stripeAccountStatus: 'pending',
            stripeAccountMode: stripeModeFromKey(secretKey),
            chargesEnabled: false,
            payoutsEnabled: false,
            stripeAccountCreatedAt: admin.firestore.FieldValue.serverTimestamp(),
            stripeAccountUpdatedAt: admin.firestore.FieldValue.delete(),
          });
        }
        return currentAccountId || account.id;
      });
      if (canonicalAccountId !== account.id) {
        return res.status(409).json({ error: 'Stripe account setup changed while this request was running. Refresh and try again.' });
      }

      return res.json({ ...projectConnectAccount(account), reused: false });
    } catch (error) {
      return handleStripeConnectSetupError(error, res, 'Error creating connected account');
    }
  };
}

function generateOnboardingLinkHandler({ admin, appUrl, stripe }) {
  return async (req, res) => {
    if (handleConnectSetupPreflight(req, res, 'POST, OPTIONS')) return;

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      if (!hasExactKeys(req.body, new Set(['tenantId']))) {
        return res.status(400).json({ error: 'Invalid request' });
      }
      const { tenantId } = req.body;

      if (!tenantId) {
        return res.status(400).json({ error: 'tenantId is required' });
      }

      const access = await verifyHttpTenantAdmin(req, { admin, tenantId });
      if (!access.success) {
        return res.status(access.status).json({ error: access.error });
      }

      if (!access.tenantData.stripeAccountId) {
        return res.status(400).json({ error: 'Tenant does not have a connected account' });
      }

      const stripeAccountId = access.tenantData.stripeAccountId;
      const trustedUrls = trustedConnectUrls(appUrl);
      if (!trustedUrls) {
        return res.status(400).json({
          error: 'Stripe onboarding needs valid return and refresh URLs. Check APP_URL or the local app URL and try again.',
        });
      }

      let accountLink;
      try {
        accountLink = await stripe.accountLinks.create({
          account: stripeAccountId,
          refresh_url: trustedUrls.refreshUrl,
          return_url: trustedUrls.returnUrl,
          type: 'account_onboarding',
        });
      } catch (error) {
        return handleStripeAccountLinkError(error, res, { tenantId, stripeAccountId });
      }

      return res.json({
        url: accountLink.url,
        expiresAt: accountLink.expires_at,
      });
    } catch (error) {
      console.error('[Stripe Connect] Unexpected onboarding link error:', {
        type: error?.type || error?.rawType || 'unknown',
        code: error?.code || error?.raw?.code,
        message: error?.message,
        statusCode: error?.statusCode || error?.raw?.statusCode,
        requestId: error?.requestId || error?.raw?.requestId,
      });
      return res.status(500).json({ error: 'Stripe onboarding link could not be created. Please try again.' });
    }
  };
}

function getConnectedAccountStatusHandler({ admin, stripe }) {
  return async (req, res) => {
    if (handleConnectSetupPreflight(req, res, 'GET, OPTIONS')) return;

    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const { tenantId } = req.query || {};

      if (!tenantId) {
        return res.status(400).json({ error: 'tenantId is required' });
      }

      const access = await verifyHttpTenantAdmin(req, { admin, tenantId });
      if (!access.success) {
        return res.status(access.status).json({ error: access.error });
      }

      const stripeAccountId = access.tenantData.stripeAccountId;

      if (!stripeAccountId) {
        return res.json({
          connected: false,
          status: 'not_connected',
        });
      }

      const account = await stripe.accounts.retrieve(stripeAccountId);
      const projection = projectConnectAccount(account);

      await access.tenantDoc.ref.update({
        stripeAccountStatus: projection.status,
        chargesEnabled: projection.chargesEnabled,
        payoutsEnabled: projection.payoutsEnabled,
        stripeAccountUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return res.json({
        ...projection,
      });
    } catch (error) {
      if (isStripeConnectNotEnabledError(error)) {
        console.error('[Stripe Connect] Error getting account status:', {
          type: error?.type || error?.rawType || 'unknown',
          code: error?.code || error?.raw?.code,
          message: error?.message,
          statusCode: error?.statusCode || error?.raw?.statusCode,
          requestId: error?.requestId || error?.raw?.requestId,
        });
        return res.status(409).json({
          error: 'Stripe connected account is not accessible from the configured Stripe test key. Create a new connected account under the currently configured Stripe platform sandbox.',
        });
      }

      console.error('[Stripe Connect] Error getting account status:', {
        type: error?.type || error?.rawType || 'unknown',
        code: error?.code || error?.raw?.code,
        message: error?.message,
        statusCode: error?.statusCode || error?.raw?.statusCode,
        requestId: error?.requestId || error?.raw?.requestId,
      });
      return res.status(502).json({ error: 'Stripe Connect status could not be refreshed. Check Stripe test-mode setup and try again.' });
    }
  };
}

module.exports = {
  CONNECT_SETUP_ALLOWED_HEADERS,
  applyConnectSetupCors,
  createConnectedAccountHandler,
  generateOnboardingLinkHandler,
  getConnectedAccountStatusHandler,
  handleConnectSetupPreflight,
  isValidHttpUrl,
  connectAccountIdempotencyKey,
  projectConnectAccount,
  trustedConnectUrls,
  maskedAccountId,
  stripeModeFromKey,
  verifyHttpTenantAdmin,
};
