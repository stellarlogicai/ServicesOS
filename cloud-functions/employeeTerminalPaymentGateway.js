const { createHash } = require('node:crypto');
const { verifyCanonicalEmployee, tenantMembershipIncludes } = require('./employeeAuthorization');
const { bookingMatchesEmployeeJobVisibility, localDateKey } = require('./employeeJobPacketProjection');
const {
  AccountingError,
  acquirePaymentCollectionLease,
  balance,
  collectionOperationHash,
  cutoverBooking,
  paymentCollectionLeasePatch,
  paymentCollectionLeaseRef,
  reconcilePayment,
} = require('./bookingPaymentAccounting');
const { bookingPaymentMetadata } = require('./bookingStripe');
const { projectConnectAccount } = require('./connectStripe');

const ALLOWED_ORIGINS = new Set([
  'https://servicesos.netlify.app',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'http://127.0.0.1:5174',
  'http://localhost:5174',
]);
const TERMINAL_CONFIG_VERSION = 1;

class EmployeeTerminalPaymentError extends Error {
  constructor(message, code, status = 409) {
    super(message);
    this.name = 'EmployeeTerminalPaymentError';
    this.code = code;
    this.status = status;
  }
}

function fail(message, code, status) {
  throw new EmployeeTerminalPaymentError(message, code, status);
}

function exactKeys(value, keys) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)) &&
    Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function cleanId(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  return id && id.length <= 128 && !id.includes('/') && id !== '.' && id !== '..' ? id : '';
}

function parseRequest(body) {
  if (!exactKeys(body, ['action', 'bookingId', 'operationId']) ||
      !['prepare', 'connection_token', 'status', 'cancel'].includes(body.action)) {
    fail('Invalid request.', 'invalid_request', 400);
  }
  const bookingId = cleanId(body.bookingId);
  const operationId = typeof body.operationId === 'string' ? body.operationId.trim() : '';
  try { collectionOperationHash(operationId); } catch { fail('Invalid request.', 'invalid_request', 400); }
  if (!bookingId) fail('Invalid request.', 'invalid_request', 400);
  return { action: body.action, bookingId, operationId };
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

function bearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function normalizedEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

async function employeeContext({ admin, uid }) {
  const base = await verifyCanonicalEmployee({ admin, uid });
  const db = admin.firestore();
  const tenantRef = db.collection('tenants').doc(base.tenantId);
  const employeeRef = tenantRef.collection('employees').doc(uid);
  const [tenantSnap, employeeSnap] = await Promise.all([tenantRef.get(), employeeRef.get()]);
  const tenant = tenantSnap.exists ? tenantSnap.data() || {} : null;
  const employee = employeeSnap.exists ? employeeSnap.data() || {} : null;
  if (!tenant || !employee || employee.authUid !== uid || employee.status !== 'active' ||
      !tenantMembershipIncludes(tenant.users, uid) ||
      !normalizedEmail(base.profile.email) ||
      normalizedEmail(base.profile.email) !== normalizedEmail(employee.email)) {
    fail('Payment collection is unavailable.', 'forbidden', 403);
  }
  return { ...base, tenant, tenantRef, employee, employeeRef };
}

function terminalConfigRef(context) {
  return context.tenantRef.collection('paymentProviderConfiguration').doc('terminal');
}

function validateTerminalConfig(config, { connectedAccountId, providerMode }) {
  if (!config || config.version !== TERMINAL_CONFIG_VERSION || config.active !== true ||
      typeof config.locationId !== 'string' || !/^tml_[A-Za-z0-9_]+$/.test(config.locationId) ||
      config.stripeAccountId !== connectedAccountId ||
      !['test', 'live'].includes(config.mode) || config.mode !== providerMode) {
    fail('Terminal setup is required.', 'terminal_setup_required', 409);
  }
  return { locationId: config.locationId, mode: config.mode };
}

function leaseMatches(lease, { context, request }) {
  return Boolean(lease && lease.version === 1 && lease.tenantId === context.tenantId &&
    lease.bookingId === request.bookingId && lease.channel === 'terminal' &&
    lease.operationHash === collectionOperationHash(request.operationId) &&
    lease.actorUid === context.uid && lease.currency === 'usd' && lease.connectedAccountId);
}

async function readOperationContext({ admin, context, request, providerMode, requirePermission, nowIso }) {
  const db = admin.firestore();
  const bookingRef = context.tenantRef.collection('bookings').doc(request.bookingId);
  const leaseRef = paymentCollectionLeaseRef(db, context.tenantId, request.bookingId);
  const configRef = terminalConfigRef(context);
  const [bookingSnap, leaseSnap, configSnap] = await Promise.all([
    bookingRef.get(), leaseRef.get(), configRef.get(),
  ]);
  if (!bookingSnap.exists) fail('Job unavailable.', 'job_unavailable', 404);
  const booking = bookingSnap.data() || {};
  const today = localDateKey(new Date(nowIso), context.tenantTimeZone);
  if (!today || !bookingMatchesEmployeeJobVisibility(booking, {
    uid: context.uid, today, timeZone: context.tenantTimeZone,
  }) || booking.fieldStatus !== 'completed') {
    fail('Job unavailable.', 'job_unavailable', 404);
  }
  const lease = leaseSnap.exists ? leaseSnap.data() || {} : null;
  const recovering = leaseMatches(lease, { context, request });
  if (requirePermission && context.employee.canCollectPayments !== true) {
    fail('Payment collection is unavailable.', 'payment_permission_required', 403);
  }
  if (!requirePermission && context.employee.canCollectPayments !== true && !recovering) {
    fail('Payment collection is unavailable.', 'payment_permission_required', 403);
  }
  const connectedAccountId = typeof context.tenant.stripeAccountId === 'string'
    ? context.tenant.stripeAccountId.trim() : '';
  if (!connectedAccountId || (lease && recovering && lease.connectedAccountId !== connectedAccountId)) {
    fail('Terminal setup is required.', 'terminal_setup_required', 409);
  }
  const config = validateTerminalConfig(configSnap.exists ? configSnap.data() : null, {
    connectedAccountId, providerMode,
  });
  return { booking, bookingRef, lease, leaseRef, connectedAccountId, config, recovering };
}

function providerIdempotencyKey({ tenantId, bookingId, operationHash }) {
  return createHash('sha256')
    .update(`servicesos-terminal-prepare-v1:${tenantId}:${bookingId}:${operationHash}`)
    .digest('hex');
}

function paymentIntentParams({ amountCents, bookingId, metadata, platformFeeAmount }) {
  return {
    amount: amountCents,
    currency: 'usd',
    payment_method_types: ['card_present'],
    capture_method: 'automatic',
    description: `ServicesOS booking ${bookingId}`,
    metadata,
    ...(platformFeeAmount > 0 ? { application_fee_amount: platformFeeAmount } : {}),
  };
}

function terminalPaymentMetadata({ context, request }) {
  return {
    ...bookingPaymentMetadata(context.tenantId, request.bookingId,
      collectionOperationHash(request.operationId)),
    paymentChannel: 'card_present',
  };
}

function assertPaymentIntentAuthority(paymentIntent, { context, request, lease, providerMode }) {
  const metadata = paymentIntent?.metadata || {};
  if (!paymentIntent || typeof paymentIntent.id !== 'string' ||
      paymentIntent.amount !== lease.amountCents || paymentIntent.currency !== lease.currency ||
      paymentIntent.livemode !== (providerMode === 'live') ||
      metadata.source !== 'servicesos_booking_payment' || metadata.tenantId !== context.tenantId ||
      metadata.bookingId !== request.bookingId || metadata.paymentChannel !== 'card_present' ||
      metadata.paymentCollectionOperationHash !== lease.operationHash) {
    fail('Payment status is uncertain.', 'payment_status_uncertain', 409);
  }
  return paymentIntent;
}

function statusProjection(status, extra = {}) {
  return { success: true, status, ...extra };
}

function providerStatus(paymentIntent) {
  if (paymentIntent?.status === 'succeeded') return 'paid';
  if (paymentIntent?.status === 'processing' || paymentIntent?.status === 'requires_capture') return 'processing';
  if (paymentIntent?.status === 'canceled') return 'cancelled';
  if (paymentIntent?.status === 'requires_payment_method' && paymentIntent?.last_payment_error) {
    return 'declined_or_failed';
  }
  if (['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(paymentIntent?.status)) {
    return 'ready';
  }
  return 'uncertain';
}

async function setLeaseProvider({ admin, context, request, paymentIntent, nowIso }) {
  const db = admin.firestore();
  const leaseRef = paymentCollectionLeaseRef(db, context.tenantId, request.bookingId);
  return db.runTransaction(async tx => {
    const snap = await tx.get(leaseRef);
    const lease = snap.exists ? snap.data() || {} : null;
    if (!leaseMatches(lease, { context, request })) return null;
    if (lease.status === 'completed') return lease;
    if (lease.status !== 'reserved' && lease.status !== 'provider_pending') return null;
    if (lease.providerObjectId && lease.providerObjectId !== paymentIntent.id) return null;
    const updated = paymentCollectionLeasePatch(lease, {
      status: 'provider_pending', provider: 'stripe_payment_intent',
      providerObjectId: paymentIntent.id, providerExpiresAtMs: null,
    }, nowIso);
    tx.set(leaseRef, updated);
    return updated;
  });
}

async function closeCancelledLease({ admin, context, request, paymentIntent, nowIso }) {
  const db = admin.firestore();
  const leaseRef = paymentCollectionLeaseRef(db, context.tenantId, request.bookingId);
  return db.runTransaction(async tx => {
    const snap = await tx.get(leaseRef);
    const lease = snap.exists ? snap.data() || {} : null;
    if (!leaseMatches(lease, { context, request }) || lease.providerObjectId !== paymentIntent.id ||
        paymentIntent.status !== 'canceled') return false;
    tx.set(leaseRef, paymentCollectionLeasePatch(lease, {
      status: 'released', closedAt: nowIso, providerFinalStatus: 'canceled',
    }, nowIso));
    return true;
  });
}

async function reconcileTerminalSuccess({ admin, context, request, paymentIntent, nowIso }) {
  if (paymentIntent.status !== 'succeeded' || !Number.isSafeInteger(paymentIntent.amount_received) ||
      paymentIntent.amount_received !== paymentIntent.amount) {
    fail('Payment status is uncertain.', 'payment_status_uncertain', 409);
  }
  await reconcilePayment({
    admin, tenantId: context.tenantId, bookingId: request.bookingId,
    connectedAccountId: context.tenant.stripeAccountId,
    providerPaymentId: paymentIntent.id, amountCents: paymentIntent.amount_received,
    currency: paymentIntent.currency, channel: 'card_present', nowIso,
    livemode: paymentIntent.livemode, paymentCreatedAt: paymentIntent.created,
    collectionOperationHash: collectionOperationHash(request.operationId),
  });
}

async function validateProviderSetup({ stripe, connectedAccountId, locationId }) {
  const [account, location] = await Promise.all([
    stripe.accounts.retrieve(connectedAccountId),
    stripe.terminal.locations.retrieve(locationId, { stripeAccount: connectedAccountId }),
  ]);
  if (!account || account.id !== connectedAccountId || projectConnectAccount(account).ready !== true ||
      !location || location.id !== locationId || location.deleted === true) {
    fail('Terminal setup is required.', 'terminal_setup_required', 409);
  }
}

async function createTerminalPaymentIntent({ stripe, context, request, lease, getPlatformFee }) {
  const fee = Math.round(lease.amountCents * getPlatformFee(context.tenant.subscriptionTier));
  return stripe.paymentIntents.create(paymentIntentParams({
    amountCents: lease.amountCents,
    bookingId: request.bookingId,
    metadata: terminalPaymentMetadata({ context, request }),
    platformFeeAmount: fee,
  }), {
    stripeAccount: lease.connectedAccountId,
    idempotencyKey: providerIdempotencyKey({ tenantId: context.tenantId,
      bookingId: request.bookingId, operationHash: lease.operationHash }),
  });
}

async function prepare({ admin, context, request, stripe, providerMode, getPlatformFee, nowIso }) {
  const operation = await readOperationContext({
    admin, context, request, providerMode, requirePermission: true, nowIso,
  });
  await validateProviderSetup({ stripe, connectedAccountId: operation.connectedAccountId,
    locationId: operation.config.locationId });
  await cutoverBooking({ admin, tenantId: context.tenantId, bookingId: request.bookingId, nowIso });
  let reservation;
  try {
    reservation = await acquirePaymentCollectionLease({
      admin, tenantId: context.tenantId, bookingId: request.bookingId, channel: 'terminal',
      operationId: request.operationId, actorUid: context.uid,
      connectedAccountId: operation.connectedAccountId, nowIso,
    });
  } catch (error) {
    if (error instanceof AccountingError && error.code === 'amount_exceeds_collectible') {
      fail('This booking has no collectible balance.', 'fully_paid', 409);
    }
    if (error instanceof AccountingError && ['payment_collection_conflict', 'payment_collection_mismatch'].includes(error.code)) {
      fail('Another payment collection is already in progress.', 'payment_collection_conflict', 409);
    }
    throw error;
  }
  let paymentIntent;
  if (reservation.lease.providerObjectId) {
    paymentIntent = await stripe.paymentIntents.retrieve(reservation.lease.providerObjectId,
      { stripeAccount: operation.connectedAccountId });
    assertPaymentIntentAuthority(paymentIntent, {
      context, request, lease: reservation.lease, providerMode,
    });
  } else {
    try {
      paymentIntent = await createTerminalPaymentIntent({
        stripe, context, request, lease: reservation.lease, getPlatformFee,
      });
    } catch (error) {
      const definitive = Number.isInteger(error?.statusCode) && error.statusCode >= 400 &&
        error.statusCode < 500 && ![408, 409, 429].includes(error.statusCode);
      if (definitive) {
        const leaseRef = paymentCollectionLeaseRef(admin.firestore(), context.tenantId, request.bookingId);
        await admin.firestore().runTransaction(async tx => {
          const snap = await tx.get(leaseRef);
          const lease = snap.exists ? snap.data() || {} : null;
          if (leaseMatches(lease, { context, request }) && lease.status === 'reserved' && !lease.providerObjectId) {
            tx.set(leaseRef, paymentCollectionLeasePatch(lease,
              { status: 'released', closedAt: nowIso }, nowIso));
          }
        });
      }
      fail('Payment preparation is temporarily unavailable.',
        definitive ? 'payment_prepare_failed' : 'payment_status_uncertain', definitive ? 422 : 503);
    }
    assertPaymentIntentAuthority(paymentIntent, {
      context, request, lease: reservation.lease, providerMode,
    });
    const persisted = await setLeaseProvider({ admin, context, request, paymentIntent, nowIso });
    if (!persisted) fail('Payment status is uncertain.', 'payment_status_uncertain', 409);
  }
  if (paymentIntent.status === 'succeeded') {
    await reconcileTerminalSuccess({ admin, context, request, paymentIntent, nowIso });
    return statusProjection('paid', { operationId: request.operationId });
  }
  if (!paymentIntent.client_secret || providerStatus(paymentIntent) === 'cancelled') {
    fail('Payment status is uncertain.', 'payment_status_uncertain', 409);
  }
  return statusProjection(providerStatus(paymentIntent), {
    operationId: request.operationId,
    clientSecret: paymentIntent.client_secret,
    amountCents: reservation.lease.amountCents,
    currency: reservation.lease.currency,
    locationId: operation.config.locationId,
  });
}

async function readPaymentIntent({ operation, stripe, context, request, providerMode }) {
  if (!operation.lease?.providerObjectId || operation.lease.provider !== 'stripe_payment_intent') return null;
  const paymentIntent = await stripe.paymentIntents.retrieve(operation.lease.providerObjectId,
    { stripeAccount: operation.connectedAccountId });
  return assertPaymentIntentAuthority(paymentIntent, {
    context, request, lease: operation.lease, providerMode,
  });
}

async function status({ admin, context, request, stripe, providerMode, getPlatformFee, nowIso }) {
  const operation = await readOperationContext({
    admin, context, request, providerMode, requirePermission: false, nowIso,
  });
  if (!operation.recovering) fail('Payment operation is unavailable.', 'payment_operation_unavailable', 404);
  if (operation.lease.status === 'completed') return statusProjection('paid', { operationId: request.operationId });
  let paymentIntent;
  try {
    paymentIntent = await readPaymentIntent({ operation, stripe, context, request, providerMode });
    if (!paymentIntent && operation.lease.status === 'reserved') {
      await validateProviderSetup({ stripe, connectedAccountId: operation.connectedAccountId,
        locationId: operation.config.locationId });
      paymentIntent = await createTerminalPaymentIntent({
        stripe, context, request, lease: operation.lease, getPlatformFee,
      });
      assertPaymentIntentAuthority(paymentIntent, {
        context, request, lease: operation.lease, providerMode,
      });
      const persisted = await setLeaseProvider({ admin, context, request, paymentIntent, nowIso });
      if (!persisted) return statusProjection('uncertain', { operationId: request.operationId });
    }
  }
  catch { return statusProjection('uncertain', { operationId: request.operationId }); }
  if (!paymentIntent) return statusProjection('uncertain', { operationId: request.operationId });
  const state = providerStatus(paymentIntent);
  if (state === 'paid') {
    await reconcileTerminalSuccess({ admin, context, request, paymentIntent, nowIso });
    return statusProjection('paid', { operationId: request.operationId });
  }
  if (state === 'cancelled') await closeCancelledLease({ admin, context, request, paymentIntent, nowIso });
  return statusProjection(state, { operationId: request.operationId });
}

async function connectionToken({ admin, context, request, stripe, providerMode, nowIso }) {
  const operation = await readOperationContext({
    admin, context, request, providerMode, requirePermission: true, nowIso,
  });
  if (!operation.recovering || operation.lease.status !== 'provider_pending' ||
      operation.lease.provider !== 'stripe_payment_intent' || !operation.lease.providerObjectId) {
    fail('Payment operation is unavailable.', 'payment_operation_unavailable', 404);
  }
  await validateProviderSetup({ stripe, connectedAccountId: operation.connectedAccountId,
    locationId: operation.config.locationId });
  const token = await stripe.terminal.connectionTokens.create(
    { location: operation.config.locationId }, { stripeAccount: operation.connectedAccountId });
  if (!token || typeof token.secret !== 'string' || !token.secret) {
    fail('Terminal connection is temporarily unavailable.', 'terminal_connection_unavailable', 503);
  }
  return { success: true, secret: token.secret };
}

async function cancel({ admin, context, request, stripe, providerMode, nowIso }) {
  const operation = await readOperationContext({
    admin, context, request, providerMode, requirePermission: true, nowIso,
  });
  if (!operation.recovering) fail('Payment operation is unavailable.', 'payment_operation_unavailable', 404);
  if (operation.lease.status === 'completed') return statusProjection('paid', { operationId: request.operationId });
  let paymentIntent;
  try { paymentIntent = await readPaymentIntent({ operation, stripe, context, request, providerMode }); }
  catch { return statusProjection('uncertain', { operationId: request.operationId }); }
  if (!paymentIntent) return statusProjection('uncertain', { operationId: request.operationId });
  let state = providerStatus(paymentIntent);
  if (state === 'paid') {
    await reconcileTerminalSuccess({ admin, context, request, paymentIntent, nowIso });
    return statusProjection('paid', { operationId: request.operationId });
  }
  if (state === 'cancelled') {
    await closeCancelledLease({ admin, context, request, paymentIntent, nowIso });
    return statusProjection('cancelled', { operationId: request.operationId });
  }
  if (state === 'processing') return statusProjection('processing', { operationId: request.operationId });
  try {
    paymentIntent = await stripe.paymentIntents.cancel(paymentIntent.id,
      {}, { stripeAccount: operation.connectedAccountId });
  } catch {
    return statusProjection('uncertain', { operationId: request.operationId });
  }
  try {
    assertPaymentIntentAuthority(paymentIntent, {
      context, request, lease: operation.lease, providerMode,
    });
  } catch {
    return statusProjection('uncertain', { operationId: request.operationId });
  }
  state = providerStatus(paymentIntent);
  if (state === 'paid') {
    await reconcileTerminalSuccess({ admin, context, request, paymentIntent, nowIso });
    return statusProjection('paid', { operationId: request.operationId });
  }
  if (state === 'cancelled') await closeCancelledLease({ admin, context, request, paymentIntent, nowIso });
  return statusProjection(state === 'cancelled' ? 'cancelled' : 'uncertain', { operationId: request.operationId });
}

function createEmployeeTerminalPaymentGatewayHandler({ admin, getStripe, getStripeMode,
  getPlatformFee, now = () => new Date() }) {
  return async (req, res) => {
    applyCors(req, res);
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.', code: 'method_not_allowed' });
    const token = bearerToken(req);
    if (!token) return res.status(401).json({ error: 'Authentication required.', code: 'unauthenticated' });
    let identity;
    try { identity = await admin.auth().verifyIdToken(token); }
    catch { return res.status(401).json({ error: 'Authentication required.', code: 'unauthenticated' }); }
    try {
      const request = parseRequest(req.body);
      const context = await employeeContext({ admin, uid: identity.uid });
      const stripe = getStripe();
      const providerMode = getStripeMode();
      if (!stripe || !['test', 'live'].includes(providerMode)) {
        fail('Terminal setup is required.', 'terminal_setup_required', 409);
      }
      const nowIso = now().toISOString();
      const args = { admin, context, request, stripe, providerMode, getPlatformFee, nowIso };
      const result = request.action === 'prepare' ? await prepare(args)
        : request.action === 'connection_token' ? await connectionToken(args)
          : request.action === 'status' ? await status(args) : await cancel(args);
      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof EmployeeTerminalPaymentError) {
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      if (error?.name === 'EmployeeAuthorizationError') {
        return res.status(403).json({ error: 'Payment collection is unavailable.', code: 'forbidden' });
      }
      return res.status(503).json({ error: 'Payment collection is temporarily unavailable.', code: 'terminal_unavailable' });
    }
  };
}

module.exports = {
  EmployeeTerminalPaymentError,
  TERMINAL_CONFIG_VERSION,
  closeCancelledLease,
  createEmployeeTerminalPaymentGatewayHandler,
  employeeContext,
  leaseMatches,
  parseRequest,
  paymentIntentParams,
  providerIdempotencyKey,
  providerStatus,
  validateTerminalConfig,
};
