const { createHash } = require('node:crypto');
const BOOKING_PAYMENT_SOURCE = 'servicesos_booking_payment';
const DEFAULT_CURRENCY = 'usd';
const {
  AccountingError, balance, canonicalTotalCents, cutoverBooking, reconcilePayment, reconcileReduction, recordId,
  collectionOperationHash, paymentCollectionLeaseRef, isActivePaymentCollectionLease,
  reservePaymentCollectionInTransaction, paymentCollectionLeasePatch,
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

function bookingPaymentMetadata(tenantId, bookingId, operationHash) {
  return {
    source: BOOKING_PAYMENT_SOURCE,
    tenantId,
    bookingId,
    paymentChannel: 'online_checkout',
    ...(operationHash ? { paymentCollectionOperationHash: operationHash } : {}),
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
  clientCheckoutId,
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
  let operationHash;
  try { operationHash = collectionOperationHash(clientCheckoutId); }
  catch { return { success: false, status: 400, error: 'A valid checkout operation ID is required' }; }
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
  const leaseRef = paymentCollectionLeaseRef(db, tenantId, bookingId);
  let reservation;
  try { reservation = await db.runTransaction(async tx => {
    const [fresh, leaseSnap] = await Promise.all([tx.get(bookingRef), tx.get(leaseRef)]);
    const booking = fresh.data() || {};
    const currentBalance = balance(booking);
    if (!currentBalance.collectible) return { invalid: true };
    const amountCents = currentBalance.remainingCents;
    const existingLease = leaseSnap.exists ? leaseSnap.data() : null;
    if (isActivePaymentCollectionLease(existingLease, nowMs)) {
      const acquired = reservePaymentCollectionInTransaction({
        tx, leaseRef, existingLease, tenantId, bookingId, channel: 'checkout',
        operationId: clientCheckoutId, actorUid: uid, amountCents,
        connectedAccountId: stripeAccountId, nowIso,
      });
      if (acquired.lease.status === 'provider_pending') {
        if (acquired.lease.provider !== 'stripe_checkout_session' ||
            !acquired.lease.providerObjectId || !acquired.lease.providerUrl) {
          throw new AccountingError('payment_collection_mismatch');
        }
        return { reused: true, booking, amountCents, lease: acquired.lease,
          session: { id: acquired.lease.providerObjectId, url: acquired.lease.providerUrl } };
      }
      return { conflict: true };
    }
    if (!existingLease && booking.stripePaymentStatus === 'checkout_created' && booking.stripeCheckoutSessionId) {
      return { conflict: true };
    }
    if (booking.stripeCheckoutReservation) return { conflict: true };
    const acquired = reservePaymentCollectionInTransaction({
      tx, leaseRef, existingLease, tenantId, bookingId, channel: 'checkout',
      operationId: clientCheckoutId, actorUid: uid, amountCents,
      connectedAccountId: stripeAccountId, nowIso,
    });
    tx.update(bookingRef, { stripeCheckoutReservation: null });
    return { booking, amountCents, lease: acquired.lease };
  }); } catch (error) {
    if (error instanceof AccountingError &&
        ['payment_collection_conflict', 'payment_collection_mismatch'].includes(error.code)) {
      return { success: false, status: 409,
        error: 'Another payment collection is already in progress for this booking.' };
    }
    throw error;
  }
  if (reservation.conflict) return { success: false, status: 409,
    error: 'An unresolved collection requires recovery or reconciliation before another payment attempt.' };
  const { booking } = reservation;
  const amountCents = reservation.invalid ? 0 : reservation.amountCents;
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return { success: false, status: 400, error: 'Booking amount must be a positive number' };
  }

  const subscriptionTier = tenantData.subscriptionTier || 'professional';
  const platformFeePercentage = getPlatformFee(subscriptionTier);
  const platformFeeAmount = Math.round(amountCents * platformFeePercentage);
  const metadata = {
    ...bookingPaymentMetadata(tenantId, bookingId, operationHash),
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
  if (reservation.reused) {
    return recoverBookingCheckoutSessionCore({ admin, bookingId, nowIso, secretKey, stripe, tenantId, uid });
  }
  if (!reservation.reused) {
    try {
      const idempotencyKey = createHash('sha256')
        .update(`booking-checkout-v2:${tenantId}:${bookingId}:${operationHash}:${reservation.lease.attempt}`).digest('hex');
      session = await stripe.checkout.sessions.create(sessionParams,
        { stripeAccount: stripeAccountId, idempotencyKey });
      if (!Number.isSafeInteger(session.expires_at) || session.expires_at * 1000 <= nowMs || !session.url) {
        throw new AccountingError('invalid_checkout_session');
      }
      const finalized = await db.runTransaction(async tx => {
        const fresh = await tx.get(bookingRef);
        const current = fresh.data() || {};
        const currentLeaseSnap = await tx.get(leaseRef);
        const currentLease = currentLeaseSnap.exists ? currentLeaseSnap.data() : null;
        if (!currentLease || currentLease.operationHash !== operationHash ||
            currentLease.attempt !== reservation.lease.attempt ||
            currentLease.status !== 'reserved' || currentLease.actorUid !== uid ||
            currentLease.channel !== 'checkout' || currentLease.amountCents !== amountCents ||
            currentLease.connectedAccountId !== stripeAccountId ||
            balance(current).remainingCents !== amountCents) return false;
        const providerLease = paymentCollectionLeasePatch(currentLease, {
          status: 'provider_pending', provider: 'stripe_checkout_session',
          providerObjectId: session.id, providerUrl: session.url,
          providerExpiresAtMs: session.expires_at * 1000,
        }, nowIso);
        tx.update(bookingRef, { ...buildCheckoutCreatedPatch(session, { nowIso }),
          stripeCheckoutSessionUrl: session.url,
          stripeCheckoutSessionExpiresAt: session.expires_at,
          stripeCheckoutSessionAmountCents: amountCents,
          stripeCheckoutReservation: null });
        tx.set(leaseRef, providerLease);
        return true;
      });
      if (!finalized) throw new AccountingError('checkout_balance_changed');
    } catch (error) {
      const safeToRelease = !session && Number.isInteger(error?.statusCode) &&
        error.statusCode >= 400 && error.statusCode < 500 && ![408, 409, 429].includes(error.statusCode);
      // Never cancel a provider object as an error-handling side effect.
      if (session?.id) await db.runTransaction(async tx => {
        const snap = await tx.get(leaseRef);
        const lease = snap.exists ? snap.data() : null;
        if (lease?.operationHash === operationHash && lease.attempt === reservation.lease.attempt &&
            lease.status === 'reserved' && lease.actorUid === uid) {
          tx.set(leaseRef, paymentCollectionLeasePatch(lease, {
            provider: 'stripe_checkout_session', providerObjectId: session.id,
          }, nowIso));
        }
      });
      if (safeToRelease) await db.runTransaction(async tx => {
        const leaseSnap = await tx.get(leaseRef);
        const lease = leaseSnap.exists ? leaseSnap.data() : null;
        if (lease?.operationHash === operationHash && lease.attempt === reservation.lease.attempt &&
            lease.status === 'reserved' && lease.actorUid === uid) {
          tx.set(leaseRef, paymentCollectionLeasePatch(lease, { status: 'released', closedAt: nowIso }, nowIso));
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

async function recoverBookingCheckoutSessionCore({ admin, bookingId, nowIso, secretKey, stripe, tenantId, uid }) {
  if (![tenantId, bookingId].every(value => isNonEmptyString(value) && !value.includes('/')) || tenantId === 'DEFAULT') {
    return { success: false, status: 400, error: 'A valid tenant and booking are required' };
  }
  const db = admin.firestore();
  const access = await verifyTenantAdminAccess(db, uid, tenantId);
  if (!access.success) return access;
  const ref = db.collection('tenants').doc(tenantId).collection('bookings').doc(bookingId);
  const leaseRef = paymentCollectionLeaseRef(db, tenantId, bookingId);
  const [bookingSnap, leaseSnap] = await Promise.all([ref.get(), leaseRef.get()]);
  if (!bookingSnap.exists) return { success: false, status: 404, error: 'Booking not found' };
  const booking = bookingSnap.data();
  const lease = leaseSnap.exists ? leaseSnap.data() : null;
  const result = (state, message, fields = {}) => ({ success: true, data: { state, message, ...fields } });
  const blocked = () => result('blocked', 'Collection outcome is unresolved. Retry recovery or request payment reconciliation; do not collect again.');
  if (!lease) return booking.stripeCheckoutReservation || booking.stripePaymentStatus === 'checkout_created'
    ? blocked() : result('none', 'No unresolved collection.', { allowInitiation: true });
  if (lease.version !== 1 || lease.tenantId !== tenantId || lease.bookingId !== bookingId ||
      lease.channel !== 'checkout' || lease.actorUid !== uid ||
      lease.connectedAccountId !== access.tenantData.stripeAccountId || lease.currency !== DEFAULT_CURRENCY ||
      !/^[a-f0-9]{64}$/.test(lease.operationHash || '') || !Number.isSafeInteger(lease.attempt) || lease.attempt < 1 ||
      !Number.isSafeInteger(lease.amountCents) || lease.amountCents <= 0) return blocked();
  if (['completed', 'released'].includes(lease.status)) {
    try {
      const current = balance(booking);
      if (lease.status === 'completed') {
        if (!lease.canonicalPaymentRecordId) return blocked();
        const recordSnap = await ref.collection('paymentRecords').doc(lease.canonicalPaymentRecordId).get();
        const record = recordSnap.exists ? recordSnap.data() : null;
        if (!record || record.status !== 'confirmed' || record.tenantId !== tenantId || record.bookingId !== bookingId ||
            record.amountCents !== lease.amountCents || record.connectedAccountId !== lease.connectedAccountId ||
            record.currency !== lease.currency) return blocked();
      }
      return result(lease.status === 'completed' ? 'settled' : 'released',
        'Prior collection reconciled. Any new collection uses the current remaining balance.',
        { allowInitiation: current.collectible });
    } catch { return blocked(); }
  }
  if (!['reserved', 'provider_pending'].includes(lease.status) ||
      lease.provider !== 'stripe_checkout_session' || !lease.providerObjectId) return blocked();
  try {
    const session = await stripe.checkout.sessions.retrieve(lease.providerObjectId,
      { stripeAccount: lease.connectedAccountId });
    const mode = stripeModeFromKey(secretKey);
    const metadataMatches = metadata => metadata?.source === BOOKING_PAYMENT_SOURCE &&
      metadata.tenantId === tenantId && metadata.bookingId === bookingId &&
      metadata.paymentChannel === 'online_checkout' &&
      metadata.paymentCollectionOperationHash === lease.operationHash;
    if (!mode || session.id !== lease.providerObjectId || session.mode !== 'payment' ||
        session.currency !== lease.currency || session.amount_total !== lease.amountCents ||
        typeof session.livemode !== 'boolean' || session.livemode !== (mode === 'live') ||
        !metadataMatches(session.metadata)) return blocked();
    if (session.status === 'complete' && session.payment_status === 'paid') {
      const piId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
      if (!piId) return blocked();
      const pi = await stripe.paymentIntents.retrieve(piId, { stripeAccount: lease.connectedAccountId });
      if (pi.id !== piId || pi.status !== 'succeeded' || pi.amount_received !== lease.amountCents ||
          pi.currency !== lease.currency || pi.livemode !== session.livemode || !metadataMatches(pi.metadata)) return blocked();
      await handleBookingCheckoutCompleted(session, { admin, nowIso, connectedAccountId: lease.connectedAccountId });
      const current = await leaseRef.get();
      return current.data()?.operationHash === lease.operationHash && current.data()?.status === 'completed'
        ? result('settled', 'Stripe-confirmed payment reconciled. Refresh the booking balance.') : blocked();
    }
    if (session.payment_status !== 'unpaid') return blocked();
    if (session.status === 'expired' && session.payment_intent !== null && !session.payment_intent) return blocked();
    if (session.status === 'expired' && session.payment_intent) {
      const id = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent.id;
      const pi = await stripe.paymentIntents.retrieve(id, { stripeAccount: lease.connectedAccountId });
      if (pi.id !== id || pi.status !== 'canceled' || pi.amount_received !== 0 ||
          pi.currency !== lease.currency || pi.livemode !== session.livemode || !metadataMatches(pi.metadata)) return blocked();
    }
    if (!['open', 'expired'].includes(session.status)) return blocked();
    return await db.runTransaction(async tx => {
      const [freshBooking, freshLease] = await Promise.all([tx.get(ref), tx.get(leaseRef)]);
      const current = freshLease.data();
      if (!current || current.operationHash !== lease.operationHash || current.attempt !== lease.attempt ||
          current.status !== lease.status || current.providerObjectId !== lease.providerObjectId ||
          current.actorUid !== uid || current.amountCents !== lease.amountCents) return blocked();
      const b = freshBooking.data();
      const remaining = balance(b);
      if (!remaining.collectible || remaining.remainingCents !== lease.amountCents) return blocked();
      if (session.status === 'open') {
        if (typeof session.url !== 'string' || !session.url.startsWith('https://checkout.stripe.com/')) return blocked();
        return result('open', 'Existing unpaid Checkout session recovered.', {
          sessionId: session.id, url: session.url, amount: lease.amountCents, currency: lease.currency,
        });
      }
      tx.set(leaseRef, paymentCollectionLeasePatch(current, { status: 'released', closedAt: nowIso }, nowIso));
      tx.update(ref, { stripePaymentStatus: 'checkout_expired', stripeCheckoutReservation: null });
      return result('released', 'Stripe confirmed the prior session expired without payment. A new collection requires an explicit request.');
    });
  } catch {
    return blocked();
  }
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

      if (req.body?.action && req.body.action !== 'recover') {
        return res.status(400).json({ error: 'Unsupported Checkout action' });
      }
      const core = req.body?.action === 'recover' ? recoverBookingCheckoutSessionCore : createBookingCheckoutSessionCore;
      const result = await core({
        admin,
        appUrl,
        bookingId: req.body?.bookingId,
        clientCheckoutId: req.body?.clientCheckoutId,
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
    collectionOperationHash: metadata.paymentCollectionOperationHash,
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
    collectionOperationHash: metadata.paymentCollectionOperationHash,
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
  recoverBookingCheckoutSessionCore,
  createBookingCheckoutSessionHandler,
  handleBookingCheckoutCompleted,
  handleBookingChargeRefunded,
  handleBookingPaymentSucceeded,
  isBookingPaymentMetadata,
  verifyRequestAuth,
};
