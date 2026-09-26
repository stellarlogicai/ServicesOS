const { randomUUID, createHash } = require('node:crypto');
const BOOKING_PAYMENT_SOURCE = 'servicesos_booking_payment';
const DEFAULT_CURRENCY = 'usd';
const {
  AccountingError, balance, canonicalTotalCents, cutoverBooking, reconcilePayment, reconcileReduction, recordId,
} = require('./bookingPaymentAccounting');
const BOOKING_CHECKOUT_ALLOWED_ORIGINS = new Set([
  'https://servicesos.netlify.app',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
]);
const BOOKING_CHECKOUT_ALLOWED_METHODS = 'POST, OPTIONS';
const BOOKING_CHECKOUT_ALLOWED_HEADERS = 'Content-Type, Authorization';

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function applyBookingCheckoutCors(req, res) {
  const origin = req.headers?.origin;
  if (BOOKING_CHECKOUT_ALLOWED_ORIGINS.has(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
  }
  res.set('Access-Control-Allow-Methods', BOOKING_CHECKOUT_ALLOWED_METHODS);
  res.set('Access-Control-Allow-Headers', BOOKING_CHECKOUT_ALLOWED_HEADERS);
}

function bookingAmountCents(booking = {}) {
  const amount = canonicalTotalCents(booking);
  return amount > 0 ? amount : null;
}

function tenantMembershipIncludes(membership, uid) {
  if (!uid || !membership) return false;
  if (Array.isArray(membership)) return membership.includes(uid);
  if (typeof membership === 'object') return Boolean(membership[uid]);
  return false;
}

function stripeModeFromKey(secretKey = '') {
  if (typeof secretKey !== 'string') return '';
  if (secretKey.startsWith('sk_live_')) return 'live';
  if (secretKey.startsWith('sk_test_')) return 'test';
  return '';
}

function bookingPaymentMetadata(tenantId, bookingId) {
  return {
    source: BOOKING_PAYMENT_SOURCE,
    tenantId,
    bookingId,
    paymentChannel: 'online_checkout',
  };
}

function paymentChannel(metadata) {
  if (!metadata.paymentChannel) return 'online_checkout'; // pre-cutover Checkout metadata
  if (['online_checkout', 'card_present'].includes(metadata.paymentChannel)) return metadata.paymentChannel;
  throw new AccountingError('invalid_payment_channel', 400);
}

function isBookingPaymentMetadata(metadata = {}) {
  return metadata.source === BOOKING_PAYMENT_SOURCE
    && isNonEmptyString(metadata.tenantId)
    && isNonEmptyString(metadata.bookingId);
}

function buildCheckoutCreatedPatch(session, { nowIso }) {
  return {
    stripeCheckoutSessionId: session.id,
    stripePaymentStatus: 'checkout_created',
    stripeMode: session.livemode ? 'live' : 'test',
  };
}

function isStripePlatformAccountRequiredError(error) {
  return error?.code === 'platform_account_required'
    || (
      error?.type === 'StripePermissionError'
      && typeof error.message === 'string'
      && error.message.includes('Only Stripe Connect platforms can work with other accounts')
    );
}

function isStripeConnectedAccountAccessError(error) {
  const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
  return error?.code === 'account_invalid'
    || error?.code === 'resource_missing'
    || message.includes('no such account')
    || message.includes('does not have access to account');
}

function stripeSetupFailureResult(error) {
  if (isStripePlatformAccountRequiredError(error)) {
    return {
      success: false,
      status: 409,
      error: 'Stripe Connect platform setup is not ready for booking checkout. Use the Stripe test secret key for the platform account that owns this connected account.',
    };
  }

  if (isStripeConnectedAccountAccessError(error)) {
    return {
      success: false,
      status: 409,
      error: 'Stripe connected account is not accessible from the configured Stripe test key. Confirm the tenant stripeAccountId belongs to this Stripe platform in test mode.',
    };
  }

  return null;
}

async function verifyRequestAuth(req, admin) {
  const authHeader = req.headers?.authorization || req.headers?.Authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return { success: false, status: 401, error: 'Authentication required' };
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(authHeader.slice('Bearer '.length).trim());
    return { success: true, uid: decodedToken.uid };
  } catch (error) {
    return { success: false, status: 401, error: 'Invalid authentication token' };
  }
}

async function verifyTenantAdminAccess(db, uid, tenantId) {
  const userDoc = await db.collection('users').doc(uid).get();
  if (!userDoc.exists) {
    return { success: false, status: 403, error: 'User is not authorized for this tenant' };
  }

  const userData = userDoc.data() || {};
  const role = userData.role;
  const isAllowedRole = role === 'admin' || role === 'owner' || role === 'super_admin';
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
  if (!inAdminUsers || !inUsers) {
    return { success: false, status: 403, error: 'User is not authorized for this tenant' };
  }

  return { success: true, tenantData };
}

function buildBookingCheckoutSessionParams({
  amountCents,
  booking,
  bookingId,
  currency = DEFAULT_CURRENCY,
  metadata,
  platformFeeAmount,
  appUrl,
}) {
  const customerName = booking.customerName || booking.customerSnapshot?.name || 'Customer';
  const serviceName = booking.serviceType || booking.service || 'Service booking';
  const customerEmail = booking.customerEmail || booking.customerSnapshot?.email || undefined;
  const sessionParams = {
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency,
        product_data: {
          name: `ServicesOS booking ${bookingId}`,
          description: `${serviceName} for ${customerName}`,
        },
        unit_amount: amountCents,
      },
      quantity: 1,
    }],
    success_url: `${appUrl}/?stripe_booking_checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/?stripe_booking_checkout=cancelled`,
    metadata,
    payment_intent_data: {
      metadata,
    },
  };

  if (customerEmail) {
    sessionParams.customer_email = customerEmail;
  }

  if (platformFeeAmount > 0) {
    sessionParams.payment_intent_data.application_fee_amount = platformFeeAmount;
  }

  return sessionParams;
}

async function createBookingCheckoutSessionCore({
  admin,
  appUrl,
  bookingId,
  currency = DEFAULT_CURRENCY,
  getPlatformFee,
  nowIso,
  secretKey,
  stripe,
  tenantId,
  uid,
}) {
  if (!isNonEmptyString(tenantId) || !isNonEmptyString(bookingId)) {
    return { success: false, status: 400, error: 'tenantId and bookingId are required' };
  }
  if (currency !== DEFAULT_CURRENCY) {
    return { success: false, status: 400, error: 'Unsupported booking currency' };
  }

  const db = admin.firestore();
  const access = await verifyTenantAdminAccess(db, uid, tenantId);
  if (!access.success) return access;

  const tenantData = access.tenantData || {};
  const stripeAccountId = tenantData.stripeAccountId;
  if (!isNonEmptyString(stripeAccountId) || tenantData.chargesEnabled !== true) {
    return { success: false, status: 409, error: 'Tenant Stripe account is not ready for booking checkout' };
  }

  const bookingRef = db.collection('tenants').doc(tenantId).collection('bookings').doc(bookingId);
  const bookingDoc = await bookingRef.get();
  if (!bookingDoc.exists) {
    return { success: false, status: 404, error: 'Booking not found' };
  }

  await cutoverBooking({ admin, tenantId, bookingId, nowIso });
  const nowMs = Date.parse(nowIso);
  const reservationId = randomUUID();
  const reservation = await db.runTransaction(async tx => {
    const fresh = await tx.get(bookingRef);
    const booking = fresh.data() || {};
    const currentBalance = balance(booking);
    if (!currentBalance.collectible) return { invalid: true };
    const amountCents = currentBalance.remainingCents;
    if (booking.stripePaymentStatus === 'checkout_created' && booking.stripeCheckoutSessionId) {
      const expiresAt = booking.stripeCheckoutSessionExpiresAt;
      if (!Number.isSafeInteger(expiresAt)) return { conflict: true };
      if (expiresAt * 1000 > nowMs) {
        if (booking.stripeCheckoutSessionAmountCents !== amountCents || !booking.stripeCheckoutSessionUrl) {
          return { conflict: true };
        }
        return { reused: true, booking, amountCents,
          session: { id: booking.stripeCheckoutSessionId, url: booking.stripeCheckoutSessionUrl } };
      }
    }
    if (booking.stripeCheckoutReservation?.expiresAtMs > nowMs) return { conflict: true };
    tx.update(bookingRef, { stripeCheckoutReservation: { id: reservationId,
      amountCents, expiresAtMs: nowMs + 10 * 60 * 1000 } });
    return { booking, amountCents };
  });
  if (reservation.conflict) return { success: false, status: 409,
    error: 'An existing booking checkout is still open. Refresh or try again after it expires.' };
  const { booking } = reservation;
  const amountCents = reservation.invalid ? 0 : reservation.amountCents;
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return { success: false, status: 400, error: 'Booking amount must be a positive number' };
  }

  const subscriptionTier = tenantData.subscriptionTier || 'professional';
  const platformFeePercentage = getPlatformFee(subscriptionTier);
  const platformFeeAmount = Math.round(amountCents * platformFeePercentage);
  const metadata = {
    ...bookingPaymentMetadata(tenantId, bookingId),
    stripeMode: stripeModeFromKey(secretKey),
  };
  const sessionParams = buildBookingCheckoutSessionParams({
    amountCents,
    booking,
    bookingId,
    currency,
    metadata,
    platformFeeAmount,
    appUrl,
  });

  let session = reservation.session;
  if (!reservation.reused) {
    try {
      const idempotencyKey = createHash('sha256')
        .update(`booking-checkout-v1:${tenantId}:${bookingId}:${reservationId}`).digest('hex');
      session = await stripe.checkout.sessions.create(sessionParams,
        { stripeAccount: stripeAccountId, idempotencyKey });
      if (!Number.isSafeInteger(session.expires_at) || session.expires_at * 1000 <= nowMs || !session.url) {
        throw new AccountingError('invalid_checkout_session');
      }
      const finalized = await db.runTransaction(async tx => {
        const fresh = await tx.get(bookingRef);
        const current = fresh.data() || {};
        if (current.stripeCheckoutReservation?.id !== reservationId ||
            balance(current).remainingCents !== amountCents) return false;
        tx.update(bookingRef, { ...buildCheckoutCreatedPatch(session, { nowIso }),
          stripeCheckoutSessionUrl: session.url,
          stripeCheckoutSessionExpiresAt: session.expires_at,
          stripeCheckoutSessionAmountCents: amountCents,
          stripeCheckoutReservation: null });
        return true;
      });
      if (!finalized) throw new AccountingError('checkout_balance_changed');
    } catch (error) {
      if (session?.id && stripe.checkout.sessions.expire) {
        try { await stripe.checkout.sessions.expire(session.id, { stripeAccount: stripeAccountId }); }
        catch (expireError) { console.error('[Booking Stripe] Could not expire unused session:', expireError?.code); }
      }
      await db.runTransaction(async tx => {
        const fresh = await tx.get(bookingRef);
        if (fresh.data()?.stripeCheckoutReservation?.id === reservationId) {
          tx.update(bookingRef, { stripeCheckoutReservation: null });
        }
      });
      const setupFailure = stripeSetupFailureResult(error);
      if (setupFailure) return setupFailure;
      console.error('[Booking Stripe] Checkout session error:', {
        type: error?.type || error?.rawType || 'unknown', code: error?.code,
        statusCode: error?.statusCode || error?.raw?.statusCode,
      });
      return { success: false, status: 502, error: 'Stripe checkout could not be created. Please try again.' };
    }
  }

  return {
    success: true,
    data: {
      sessionId: session.id,
      url: session.url,
      amount: amountCents,
      currency,
      stripeAccountId,
      platformFee: platformFeeAmount / 100,
      platformFeePercentage: platformFeePercentage * 100,
    },
  };
}

function createBookingCheckoutSessionHandler({ admin, appUrl, getPlatformFee, secretKey, stripe }) {
  return async (req, res) => {
    applyBookingCheckoutCors(req, res);

    if (req.method === 'OPTIONS') {
      return res.status(204).send('');
    }

    try {
      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
      }

      const auth = await verifyRequestAuth(req, admin);
      if (!auth.success) {
        return res.status(auth.status).json({ error: auth.error });
      }

      const result = await createBookingCheckoutSessionCore({
        admin,
        appUrl,
        bookingId: req.body?.bookingId,
        currency: req.body?.currency || DEFAULT_CURRENCY,
        getPlatformFee,
        nowIso: new Date().toISOString(),
        secretKey,
        stripe,
        tenantId: req.body?.tenantId,
        uid: auth.uid,
      });

      if (!result.success) {
        return res.status(result.status || 500).json({ error: result.error });
      }

      return res.json(result.data);
    } catch (error) {
      console.error('[Booking Stripe] Checkout session error:', error);
      return res.status(500).json({ error: 'Failed to create booking checkout session' });
    }
  };
}

async function handleBookingPaymentSucceeded(paymentIntent, { admin, nowIso, connectedAccountId }) {
  const metadata = paymentIntent.metadata || {};
  if (!isBookingPaymentMetadata(metadata)) {
    return { handled: false };
  }
  if (paymentIntent.status !== 'succeeded' || !Number.isSafeInteger(paymentIntent.amount_received) ||
      paymentIntent.amount_received <= 0) return { handled: true, unconfirmed: true };
  await cutoverBooking({ admin, tenantId: metadata.tenantId, bookingId: metadata.bookingId,
    nowIso, connectedAccountId, requireConnectedAccount: true });
  const result = await reconcilePayment({
    admin, tenantId: metadata.tenantId, bookingId: metadata.bookingId,
    connectedAccountId, providerPaymentId: paymentIntent.id,
    amountCents: paymentIntent.amount_received, currency: paymentIntent.currency,
    channel: paymentChannel(metadata), nowIso, livemode: paymentIntent.livemode,
    checkoutSessionId: paymentIntent.metadata.checkoutSessionId,
    receiptUrl: paymentIntent.latest_charge?.receipt_url,
    paymentCreatedAt: paymentIntent.created,
  });
  return { handled: true, ...result };
}

async function handleBookingCheckoutCompleted(session, { admin, nowIso, connectedAccountId }) {
  const metadata = session.metadata || {};
  if (!isBookingPaymentMetadata(metadata)) {
    return { handled: false };
  }

  if (session.payment_status !== 'paid') {
    return { handled: true, unpaid: true };
  }

  const paymentIntentId = typeof session.payment_intent === 'string'
    ? session.payment_intent : session.payment_intent?.id;
  if (!paymentIntentId || !Number.isSafeInteger(session.amount_total) || session.amount_total <= 0) {
    throw new Error('Paid booking Checkout session lacks canonical payment identity or amount');
  }
  await cutoverBooking({ admin, tenantId: metadata.tenantId, bookingId: metadata.bookingId,
    nowIso, connectedAccountId, requireConnectedAccount: true });
  const result = await reconcilePayment({
    admin, tenantId: metadata.tenantId, bookingId: metadata.bookingId,
    connectedAccountId, providerPaymentId: paymentIntentId, amountCents: session.amount_total,
    currency: session.currency, channel: paymentChannel(metadata), nowIso, livemode: session.livemode,
    checkoutSessionId: session.id,
    paymentCreatedAt: session.created,
  });
  return { handled: true, ...result };
}

async function handleBookingChargeRefunded(charge, { admin, stripe, connectedAccountId, nowIso }) {
  if (!connectedAccountId || !charge.payment_intent) return { handled: false };
  const paymentIntentId = typeof charge.payment_intent === 'string'
    ? charge.payment_intent : charge.payment_intent.id;
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, { stripeAccount: connectedAccountId });
  const metadata = paymentIntent.metadata || {};
  if (!isBookingPaymentMetadata(metadata)) return { handled: false };
  if (charge.currency !== DEFAULT_CURRENCY) throw new Error('Booking refund charge currency mismatch');
  if (paymentIntent.currency !== DEFAULT_CURRENCY) throw new Error('Booking refund payment currency mismatch');
  await cutoverBooking({ admin, tenantId: metadata.tenantId, bookingId: metadata.bookingId,
    nowIso, connectedAccountId, requireConnectedAccount: true });
  if (paymentIntent.status === 'succeeded' && Number.isSafeInteger(paymentIntent.amount_received) &&
      paymentIntent.amount_received > 0) {
    await reconcilePayment({
      admin, tenantId: metadata.tenantId, bookingId: metadata.bookingId,
      connectedAccountId, providerPaymentId: paymentIntentId,
      amountCents: paymentIntent.amount_received, currency: paymentIntent.currency,
      channel: paymentChannel(metadata), nowIso, livemode: paymentIntent.livemode,
      paymentCreatedAt: paymentIntent.created,
    });
  }
  const refunds = await stripe.refunds.list({ charge: charge.id, limit: 100 },
    { stripeAccount: connectedAccountId });
  if (refunds.has_more) throw new Error('Booking refund list is incomplete');
  for (const refund of refunds.data || []) {
    if (refund.status !== 'succeeded') continue;
    if (refund.charge && refund.charge !== charge.id) throw new Error('Refund charge mismatch');
    if (refund.currency !== DEFAULT_CURRENCY ||
        (refund.payment_intent && refund.payment_intent !== paymentIntentId)) {
      throw new Error('Booking refund payment context mismatch');
    }
    await reconcileReduction({
      admin, tenantId: metadata.tenantId, bookingId: metadata.bookingId,
      originalPaymentId: recordId('stripe_pi', paymentIntentId), reductionId: refund.id,
      amountCents: refund.amount, kind: 'refund', connectedAccountId, nowIso,
    });
  }
  return { handled: true };
}

module.exports = {
  BOOKING_PAYMENT_SOURCE,
  applyBookingCheckoutCors,
  bookingAmountCents,
  bookingPaymentMetadata,
  buildBookingCheckoutSessionParams,
  buildCheckoutCreatedPatch,
  createBookingCheckoutSessionCore,
  createBookingCheckoutSessionHandler,
  handleBookingCheckoutCompleted,
  handleBookingChargeRefunded,
  handleBookingPaymentSucceeded,
  isBookingPaymentMetadata,
  verifyRequestAuth,
};
