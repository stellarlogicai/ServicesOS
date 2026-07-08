const BOOKING_PAYMENT_SOURCE = 'servicesos_booking_payment';
const DEFAULT_CURRENCY = 'usd';
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

function centsFromDollars(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

function dollarsFromCents(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return amount / 100;
}

function bookingAmountCents(booking = {}) {
  return centsFromDollars(booking.agreedPrice ?? booking.price);
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
  };
}

function isBookingPaymentMetadata(metadata = {}) {
  return metadata.source === BOOKING_PAYMENT_SOURCE
    && isNonEmptyString(metadata.tenantId)
    && isNonEmptyString(metadata.bookingId);
}

function buildCheckoutCreatedPatch(session, { nowIso }) {
  return {
    paymentStatus: 'final_due',
    stripeCheckoutSessionId: session.id,
    stripePaymentStatus: 'checkout_created',
    stripeMode: session.livemode ? 'live' : 'test',
    paymentStatusUpdatedAt: nowIso,
    paymentStatusUpdatedBy: 'stripe_checkout_created',
  };
}

function buildStripeConfirmedBookingPatch(paymentIntent, { nowIso }) {
  const amountReceived = dollarsFromCents(paymentIntent.amount_received ?? paymentIntent.amount);
  const paidAt = paymentIntent.created
    ? new Date(paymentIntent.created * 1000).toISOString()
    : nowIso;
  const latestCharge = typeof paymentIntent.latest_charge === 'object' && paymentIntent.latest_charge
    ? paymentIntent.latest_charge
    : null;

  const patch = {
    paymentStatus: 'paid_in_full',
    paymentMethod: 'stripe',
    amountReceived,
    receivedAt: paidAt,
    stripePaymentIntentId: paymentIntent.id,
    stripePaymentStatus: paymentIntent.status || 'succeeded',
    stripePaidAt: paidAt,
    stripeAmountReceived: paymentIntent.amount_received ?? paymentIntent.amount,
    stripeCurrency: paymentIntent.currency || DEFAULT_CURRENCY,
    stripeMode: paymentIntent.livemode ? 'live' : 'test',
    paymentStatusUpdatedAt: nowIso,
    paymentStatusUpdatedBy: 'stripe_webhook',
  };

  if (latestCharge.receipt_url) {
    patch.stripeReceiptUrl = latestCharge.receipt_url;
  }

  if (isNonEmptyString(paymentIntent.metadata?.checkoutSessionId)) {
    patch.stripeCheckoutSessionId = paymentIntent.metadata.checkoutSessionId;
  }

  return patch;
}

function buildStripeConfirmedCheckoutSessionPatch(session, { nowIso }) {
  const amountReceived = dollarsFromCents(session.amount_total ?? session.amount_subtotal);
  const paidAt = session.created
    ? new Date(session.created * 1000).toISOString()
    : nowIso;
  const paymentIntentId = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id;

  const patch = {
    paymentStatus: 'paid_in_full',
    paymentMethod: 'stripe',
    amountReceived,
    receivedAt: paidAt,
    stripeCheckoutSessionId: session.id,
    stripePaymentStatus: session.payment_status || 'paid',
    stripePaidAt: paidAt,
    stripeAmountReceived: session.amount_total ?? session.amount_subtotal,
    stripeCurrency: session.currency || DEFAULT_CURRENCY,
    stripeMode: session.livemode ? 'live' : 'test',
    paymentStatusUpdatedAt: nowIso,
    paymentStatusUpdatedBy: 'stripe_webhook',
  };

  if (paymentIntentId) {
    patch.stripePaymentIntentId = paymentIntentId;
  }

  return patch;
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
  if ((tenantData.adminUsers && !inAdminUsers) || (tenantData.users && !inUsers)) {
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

  const booking = bookingDoc.data() || {};
  const amountCents = bookingAmountCents(booking);
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

  const session = await stripe.checkout.sessions.create(
    sessionParams,
    { stripeAccount: stripeAccountId }
  );

  await bookingRef.update(buildCheckoutCreatedPatch(session, { nowIso }));

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

async function handleBookingPaymentSucceeded(paymentIntent, { admin, nowIso }) {
  const metadata = paymentIntent.metadata || {};
  if (!isBookingPaymentMetadata(metadata)) {
    return { handled: false };
  }

  const db = admin.firestore();
  const bookingRef = db.collection('tenants').doc(metadata.tenantId).collection('bookings').doc(metadata.bookingId);
  const bookingDoc = await bookingRef.get();
  if (!bookingDoc.exists) {
    console.log(`Booking payment succeeded for missing booking ${metadata.tenantId}/${metadata.bookingId}`);
    return { handled: true, missingBooking: true };
  }

  const patch = buildStripeConfirmedBookingPatch(paymentIntent, { nowIso });
  await bookingRef.update(patch);
  return { handled: true, patch };
}

async function handleBookingCheckoutCompleted(session, { admin, nowIso }) {
  const metadata = session.metadata || {};
  if (!isBookingPaymentMetadata(metadata)) {
    return { handled: false };
  }

  if (session.payment_status !== 'paid') {
    return { handled: true, unpaid: true };
  }

  const db = admin.firestore();
  const bookingRef = db.collection('tenants').doc(metadata.tenantId).collection('bookings').doc(metadata.bookingId);
  const bookingDoc = await bookingRef.get();
  if (!bookingDoc.exists) {
    console.log(`Booking checkout completed for missing booking ${metadata.tenantId}/${metadata.bookingId}`);
    return { handled: true, missingBooking: true };
  }

  const patch = buildStripeConfirmedCheckoutSessionPatch(session, { nowIso });
  await bookingRef.update(patch);
  return { handled: true, patch };
}

module.exports = {
  BOOKING_PAYMENT_SOURCE,
  applyBookingCheckoutCors,
  bookingAmountCents,
  bookingPaymentMetadata,
  buildBookingCheckoutSessionParams,
  buildCheckoutCreatedPatch,
  buildStripeConfirmedCheckoutSessionPatch,
  buildStripeConfirmedBookingPatch,
  createBookingCheckoutSessionCore,
  createBookingCheckoutSessionHandler,
  handleBookingCheckoutCompleted,
  handleBookingPaymentSucceeded,
  isBookingPaymentMetadata,
  verifyRequestAuth,
};
