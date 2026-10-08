const { createHash } = require('node:crypto');
const { scopeHash } = require('./jobScopeControl');
const { cents, bookingObligationCents } = require('./bookingFinancialAmount.mjs');

const CURRENCY = 'usd';
const VERSION = 1;
const PAYMENT_COLLECTION_LEASE_VERSION = 1;
const PAYMENT_COLLECTION_CHANNELS = new Set(['checkout', 'manual', 'terminal']);

class AccountingError extends Error {
  constructor(code, status = 409) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

function canonicalTotalCents(booking) {
  const total = bookingObligationCents(booking);
  if (total === null || booking.approvedJobScope &&
      scopeHash(booking.approvedJobScope.snapshot) !== booking.approvedJobScope.scopeHash) return null;
  return total;
}

function planCutover(booking, nowIso) {
  const totalCents = canonicalTotalCents(booking);
  const raw = booking.amountReceived;
  const legacyOpeningPaidCents = raw === undefined || raw === null || raw === '' ? 0 : cents(raw);
  const issues = [];
  if (totalCents === null) issues.push('invalid_total');
  if (legacyOpeningPaidCents === null) issues.push('invalid_legacy_amount');
  if ((raw === undefined || raw === null || raw === '') && booking.stripePaymentIntentId) {
    issues.push('stripe_reference_without_received_amount');
  }
  if (legacyOpeningPaidCents === 0 && booking.stripePaymentIntentId) {
    issues.push('stripe_reference_zero_received');
  }
  if (legacyOpeningPaidCents !== null && totalCents !== null && legacyOpeningPaidCents > totalCents) {
    issues.push('legacy_overpayment');
  }
  return {
    version: VERSION,
    cutoverAt: nowIso,
    currency: CURRENCY,
    legacyOpeningPaidCents,
    confirmedPaymentCents: 0,
    confirmedRefundCents: 0,
    confirmedManualReversalCents: 0,
    legacyStripePaymentIntentId: typeof booking.stripePaymentIntentId === 'string' ? booking.stripePaymentIntentId : null,
    legacyStripeCheckoutSessionId: ['paid', 'succeeded'].includes(booking.stripePaymentStatus) &&
      typeof booking.stripeCheckoutSessionId === 'string' ? booking.stripeCheckoutSessionId : null,
    issues,
  };
}

function balance(booking, accounting = booking.paymentAccounting) {
  const totalCents = canonicalTotalCents(booking);
  if (totalCents === null || !accounting || accounting.version !== VERSION ||
      accounting.currency !== CURRENCY ||
      ![accounting.legacyOpeningPaidCents, accounting.confirmedPaymentCents,
        accounting.confirmedRefundCents, accounting.confirmedManualReversalCents]
        .every(value => Number.isSafeInteger(value) && value >= 0)) {
    throw new AccountingError('invalid_accounting_state');
  }
  const grossCents = accounting.legacyOpeningPaidCents + accounting.confirmedPaymentCents;
  const reductionsCents = accounting.confirmedRefundCents + accounting.confirmedManualReversalCents;
  if (!Number.isSafeInteger(grossCents) || !Number.isSafeInteger(reductionsCents) ||
      reductionsCents > grossCents) {
    throw new AccountingError('invalid_accounting_state');
  }
  const netPaidCents = grossCents - reductionsCents;
  const remainingCents = Math.max(totalCents - netPaidCents, 0);
  const paymentStatus = totalCents > 0 && remainingCents === 0 ? 'paid_in_full'
    : netPaidCents > 0 ? 'partial' : 'not_paid';
  const issues = Array.isArray(accounting.issues) ? accounting.issues : [];
  return {
    totalCents,
    legacyOpeningPaidCents: accounting.legacyOpeningPaidCents,
    confirmedPaymentCents: accounting.confirmedPaymentCents,
    confirmedRefundCents: accounting.confirmedRefundCents,
    confirmedManualReversalCents: accounting.confirmedManualReversalCents,
    netPaidCents,
    remainingCents,
    paymentStatus,
    collectible: remainingCents > 0 && booking.status !== 'cancelled' &&
      booking.isArchived !== true && booking.isDeleted !== true && issues.length === 0,
  };
}

function summaryPatch(booking, accounting, nowIso, source) {
  const projected = balance(booking, accounting);
  return {
    paymentAccounting: accounting,
    amountReceived: projected.netPaidCents / 100,
    remainingBalanceCents: projected.remainingCents,
    paymentStatus: projected.paymentStatus,
    paymentStatusUpdatedAt: nowIso,
    paymentStatusUpdatedBy: source,
  };
}

function bookingRef(db, tenantId, bookingId) {
  if (typeof tenantId !== 'string' || !tenantId || tenantId === 'DEFAULT' || tenantId.includes('/') ||
      typeof bookingId !== 'string' || !bookingId || bookingId.includes('/')) {
    throw new AccountingError('invalid_booking_reference', 400);
  }
  return db.collection('tenants').doc(tenantId).collection('bookings').doc(bookingId);
}

function recordId(kind, providerId) {
  if (typeof providerId !== 'string' || !providerId || providerId.length > 255) {
    throw new AccountingError('invalid_provider_identity', 400);
  }
  return `${kind}_${createHash('sha256').update(providerId).digest('hex')}`;
}

function collectionOperationHash(operationId) {
  if (typeof operationId !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(operationId)) {
    throw new AccountingError('invalid_collection_operation', 400);
  }
  return createHash('sha256').update(operationId).digest('hex');
}

function paymentCollectionLeaseRef(db, tenantId, bookingId) {
  return bookingRef(db, tenantId, bookingId).collection('paymentCollectionControl').doc('current');
}

function isActivePaymentCollectionLease(lease) {
  if (!lease) return false;
  // Age is not evidence of noncollection. Unknown persisted states also fail closed.
  return lease.version !== PAYMENT_COLLECTION_LEASE_VERSION ||
    !['completed', 'released'].includes(lease.status);
}

function assertPaymentCollectionLeaseContext(lease, expected) {
  const operationHash = collectionOperationHash(expected.operationId);
  if (lease.tenantId !== expected.tenantId || lease.bookingId !== expected.bookingId ||
      lease.channel !== expected.channel || lease.operationHash !== operationHash ||
      lease.actorUid !== expected.actorUid || lease.amountCents !== expected.amountCents ||
      lease.currency !== CURRENCY ||
      (lease.connectedAccountId || null) !== (expected.connectedAccountId || null)) {
    throw new AccountingError('payment_collection_mismatch');
  }
  return operationHash;
}

function reservePaymentCollectionInTransaction({ tx, leaseRef, existingLease, tenantId, bookingId,
  channel, operationId, actorUid, amountCents, connectedAccountId = null, nowIso }) {
  if (!PAYMENT_COLLECTION_CHANNELS.has(channel) || typeof actorUid !== 'string' || !actorUid ||
      !Number.isSafeInteger(amountCents) || amountCents <= 0 || !Number.isFinite(Date.parse(nowIso))) {
    throw new AccountingError('invalid_payment_collection', 400);
  }
  const operationHash = collectionOperationHash(operationId);
  const nowMs = Date.parse(nowIso);
  if (isActivePaymentCollectionLease(existingLease, nowMs)) {
    if (existingLease.operationHash !== operationHash) {
      throw new AccountingError('payment_collection_conflict');
    }
    assertPaymentCollectionLeaseContext(existingLease, {
      tenantId, bookingId, channel, operationId, actorUid, amountCents, connectedAccountId,
    });
    return { reused: true, lease: existingLease };
  }
  const attempt = existingLease?.operationHash === operationHash && Number.isSafeInteger(existingLease.attempt)
    ? existingLease.attempt + 1 : 1;
  const lease = {
    version: PAYMENT_COLLECTION_LEASE_VERSION,
    tenantId,
    bookingId,
    channel,
    operationHash,
    attempt,
    actorUid,
    amountCents,
    currency: CURRENCY,
    connectedAccountId,
    status: 'reserved',
    provider: null,
    providerObjectId: null,
    providerExpiresAtMs: null,
    createdAt: nowIso,
    updatedAt: nowIso,
    closedAt: null,
  };
  tx.set(leaseRef, lease);
  return { reused: false, lease };
}

function paymentCollectionLeasePatch(lease, patch, nowIso) {
  return { ...lease, ...patch, updatedAt: nowIso };
}

async function acquirePaymentCollectionLease({ admin, tenantId, bookingId, channel, operationId,
  actorUid, connectedAccountId = null, nowIso }) {
  const db = admin.firestore();
  const ref = bookingRef(db, tenantId, bookingId);
  const leaseRef = paymentCollectionLeaseRef(db, tenantId, bookingId);
  return db.runTransaction(async tx => {
    const [bookingSnap, leaseSnap] = await Promise.all([tx.get(ref), tx.get(leaseRef)]);
    if (!bookingSnap.exists) throw new AccountingError('booking_not_found', 404);
    const booking = bookingSnap.data() || {};
    if (booking.paymentAccounting?.version !== VERSION) throw new AccountingError('accounting_cutover_required');
    const current = balance(booking);
    if (!current.collectible) throw new AccountingError('amount_exceeds_collectible');
    return reservePaymentCollectionInTransaction({
      tx, leaseRef, existingLease: leaseSnap.exists ? leaseSnap.data() : null,
      tenantId, bookingId, channel, operationId, actorUid,
      amountCents: current.remainingCents, connectedAccountId, nowIso,
    });
  });
}

async function readCanonicalBalance({ admin, tenantId, bookingId }) {
  const snap = await bookingRef(admin.firestore(), tenantId, bookingId).get();
  if (!snap.exists) throw new AccountingError('booking_not_found', 404);
  const booking = snap.data() || {};
  if (booking.paymentAccounting?.version !== VERSION) throw new AccountingError('accounting_cutover_required');
  return balance(booking);
}

async function cutoverBooking({ admin, tenantId, bookingId, nowIso,
  connectedAccountId, requireConnectedAccount = false }) {
  const db = admin.firestore();
  const ref = bookingRef(db, tenantId, bookingId);
  return db.runTransaction(async tx => {
    const [snap, tenantSnap] = await Promise.all([
      tx.get(ref), requireConnectedAccount ? tx.get(db.collection('tenants').doc(tenantId)) : null,
    ]);
    if (requireConnectedAccount && (!connectedAccountId || !tenantSnap.exists ||
        tenantSnap.data()?.stripeAccountId !== connectedAccountId)) {
      throw new AccountingError('connected_account_mismatch', 403);
    }
    if (!snap.exists) throw new AccountingError('booking_not_found', 404);
    const booking = snap.data() || {};
    if (booking.paymentAccounting?.version === VERSION) return balance(booking);
    if (booking.paymentAccounting) throw new AccountingError('unsupported_accounting_version');
    const accounting = planCutover(booking, nowIso);
    if (accounting.legacyOpeningPaidCents === null || canonicalTotalCents(booking) === null) {
      throw new AccountingError('ambiguous_legacy_balance');
    }
    const identityRef = accounting.legacyStripePaymentIntentId
      ? db.collection('tenants').doc(tenantId).collection('bookingPaymentIdentities')
        .doc(recordId('stripe_pi', accounting.legacyStripePaymentIntentId)) : null;
    if (identityRef) {
      const identitySnap = await tx.get(identityRef);
      if (identitySnap.exists && identitySnap.data()?.bookingId !== bookingId) {
        throw new AccountingError('legacy_payment_identity_conflict');
      }
      if (!identitySnap.exists) tx.create(identityRef, {
        tenantId, bookingId, provider: 'stripe', providerPaymentId: accounting.legacyStripePaymentIntentId,
        legacy: true, createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    tx.update(ref, summaryPatch(booking, accounting, nowIso, 'payment_cutover'));
    return balance(booking, accounting);
  });
}

async function reconcilePayment({ admin, tenantId, bookingId, connectedAccountId, providerPaymentId,
  amountCents, currency, channel, nowIso, checkoutSessionId, livemode, receiptUrl, paymentCreatedAt,
  collectionOperationHash: expectedOperationHash }) {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || currency !== CURRENCY ||
      !['online_checkout', 'card_present'].includes(channel)) throw new AccountingError('invalid_payment', 400);
  const db = admin.firestore();
  const ref = bookingRef(db, tenantId, bookingId);
  const tenantRef = db.collection('tenants').doc(tenantId);
  const id = recordId('stripe_pi', providerPaymentId);
  const paymentRef = ref.collection('paymentRecords').doc(id);
  const identityRef = tenantRef.collection('bookingPaymentIdentities').doc(id);
  const leaseRef = paymentCollectionLeaseRef(db, tenantId, bookingId);
  return db.runTransaction(async tx => {
    const [tenantSnap, bookingSnap, paymentSnap, identitySnap, leaseSnap] = await Promise.all([
      tx.get(tenantRef), tx.get(ref), tx.get(paymentRef), tx.get(identityRef), tx.get(leaseRef),
    ]);
    if (!tenantSnap.exists || !bookingSnap.exists) throw new AccountingError('payment_context_not_found', 404);
    const tenant = tenantSnap.data() || {};
    const booking = bookingSnap.data() || {};
    if (!connectedAccountId || tenant.stripeAccountId !== connectedAccountId) {
      throw new AccountingError('connected_account_mismatch', 403);
    }
    if (['test', 'live'].includes(tenant.stripeAccountMode) &&
        tenant.stripeAccountMode !== (livemode === true ? 'live' : 'test')) {
      throw new AccountingError('stripe_mode_mismatch', 403);
    }
    if (identitySnap.exists) {
      const identity = identitySnap.data() || {};
      if (identity.tenantId !== tenantId || identity.bookingId !== bookingId ||
          identity.providerPaymentId !== providerPaymentId ||
          (identity.connectedAccountId && identity.connectedAccountId !== connectedAccountId)) {
        throw new AccountingError('payment_identity_conflict');
      }
    }
    if (booking.paymentAccounting?.version !== VERSION) throw new AccountingError('accounting_cutover_required');
    const accounting = booking.paymentAccounting;
    const lease = leaseSnap.exists ? leaseSnap.data() : null;
    const leaseMatchesPayment = lease?.version === PAYMENT_COLLECTION_LEASE_VERSION &&
      isActivePaymentCollectionLease(lease) && lease.tenantId === tenantId && lease.bookingId === bookingId &&
      lease.amountCents === amountCents && lease.currency === currency && lease.connectedAccountId === connectedAccountId &&
      (lease.channel === 'checkout' && channel === 'online_checkout'
        ? lease.providerObjectId
          ? lease.provider === 'stripe_checkout_session' && lease.providerObjectId === checkoutSessionId
          : expectedOperationHash && lease.operationHash === expectedOperationHash
        : lease.channel === 'terminal' && channel === 'card_present' &&
          ((lease.provider === 'stripe_payment_intent' && lease.providerObjectId === providerPaymentId) ||
           (!lease.providerObjectId && expectedOperationHash && lease.operationHash === expectedOperationHash)));
    if (accounting.legacyStripePaymentIntentId === providerPaymentId ||
        (accounting.legacyOpeningPaidCents > 0 && checkoutSessionId &&
         accounting.legacyStripeCheckoutSessionId === checkoutSessionId)) {
      return { legacy: true, balance: balance(booking) };
    }
    if (paymentSnap.exists) {
      const existing = paymentSnap.data() || {};
      if (existing.tenantId !== tenantId || existing.bookingId !== bookingId ||
          existing.providerPaymentId !== providerPaymentId || existing.amountCents !== amountCents ||
          existing.connectedAccountId !== connectedAccountId || existing.currency !== currency) {
        throw new AccountingError('payment_identity_conflict');
      }
      if (existing.status === 'confirmed' && leaseMatchesPayment) {
        tx.set(leaseRef, paymentCollectionLeasePatch(lease, {
          status: 'completed', closedAt: nowIso, canonicalPaymentRecordId: id,
        }, nowIso));
      }
      return { duplicate: true, unresolvedLegacy: existing.status === 'unresolved_legacy',
        balance: balance(booking) };
    }
    if (identitySnap.exists) throw new AccountingError('payment_identity_conflict');
    if (!Number.isSafeInteger(paymentCreatedAt) || paymentCreatedAt <= 0) {
      throw new AccountingError('payment_time_unknown');
    }
    if (paymentCreatedAt * 1000 < Date.parse(accounting.cutoverAt)) {
      const updated = { ...accounting,
        issues: [...new Set([...(accounting.issues || []), 'unresolved_legacy_payment'])] };
      tx.create(paymentRef, {
        id, tenantId, bookingId, kind: 'payment', provider: 'stripe', providerPaymentId,
        connectedAccountId, channel, amountCents, currency, status: 'unresolved_legacy',
        createdAt: admin.firestore.FieldValue.serverTimestamp(), providerCreatedAt: paymentCreatedAt,
      });
      tx.create(identityRef, {
        tenantId, bookingId, provider: 'stripe', providerPaymentId,
        connectedAccountId, legacy: true, createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      tx.update(ref, summaryPatch(booking, updated, nowIso, 'unresolved_legacy_payment'));
      return { unresolvedLegacy: true, balance: balance(booking, updated) };
    }
    const updated = { ...accounting, confirmedPaymentCents: accounting.confirmedPaymentCents + amountCents };
    if (!Number.isSafeInteger(updated.confirmedPaymentCents)) throw new AccountingError('amount_overflow');
    const projected = balance(booking, updated);
    tx.create(paymentRef, {
      id, tenantId, bookingId, kind: 'payment', provider: 'stripe', providerPaymentId,
      connectedAccountId, channel, amountCents, currency, status: 'confirmed',
      checkoutSessionId: checkoutSessionId || null, livemode: livemode === true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(), confirmedAt: nowIso,
    });
    tx.create(identityRef, {
      tenantId, bookingId, provider: 'stripe', providerPaymentId,
      connectedAccountId, legacy: false, createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    tx.update(ref, {
      ...summaryPatch(booking, updated, nowIso, 'stripe_webhook'),
      paymentMethod: 'stripe',
      receivedAt: nowIso,
      stripePaymentIntentId: providerPaymentId,
      stripeAmountReceived: amountCents,
      stripeCurrency: currency,
      stripePaymentStatus: 'succeeded',
      stripePaidAt: nowIso,
      stripeMode: livemode ? 'live' : 'test',
      ...(receiptUrl ? { stripeReceiptUrl: receiptUrl } : {}),
      ...(checkoutSessionId ? { stripeCheckoutSessionId: checkoutSessionId } : {}),
    });
    if (leaseMatchesPayment) {
      tx.set(leaseRef, paymentCollectionLeasePatch(lease, {
        status: 'completed', closedAt: nowIso, canonicalPaymentRecordId: id,
      }, nowIso));
    }
    return { id, balance: projected };
  });
}

async function recordManualPayment({ admin, tenantId, bookingId, actorUid, clientPaymentId,
  amountCents, method, note, nowIso }) {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new AccountingError('invalid_payment_amount', 400);
  if (typeof clientPaymentId !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(clientPaymentId)) {
    throw new AccountingError('invalid_idempotency_key', 400);
  }
  if (!['cash', 'check', 'venmo', 'cash_app', 'zelle', 'facebook_pay', 'paypal', 'card', 'other'].includes(method)) {
    throw new AccountingError('invalid_payment_method', 400);
  }
  if (typeof note !== 'string' || note.length > 500) throw new AccountingError('invalid_payment_note', 400);
  const db = admin.firestore();
  const ref = bookingRef(db, tenantId, bookingId);
  const paymentRef = ref.collection('paymentRecords')
    .doc(recordId('manual', `${actorUid}\n${clientPaymentId}`));
  const leaseRef = paymentCollectionLeaseRef(db, tenantId, bookingId);
  return db.runTransaction(async tx => {
    const [snap, paymentSnap, leaseSnap] = await Promise.all([tx.get(ref), tx.get(paymentRef), tx.get(leaseRef)]);
    if (!snap.exists) throw new AccountingError('booking_not_found', 404);
    const booking = snap.data() || {};
    if (booking.paymentAccounting?.version !== VERSION) throw new AccountingError('accounting_cutover_required');
    if (paymentSnap.exists) {
      const existing = paymentSnap.data() || {};
      if (existing.tenantId !== tenantId || existing.bookingId !== bookingId ||
          existing.actorUid !== actorUid || existing.amountCents !== amountCents ||
          existing.method !== method || existing.note !== note) {
        throw new AccountingError('idempotency_conflict');
      }
      return { id: paymentRef.id, duplicate: true, balance: balance(booking) };
    }
    const current = balance(booking);
    if (!current.collectible || amountCents > current.remainingCents) throw new AccountingError('amount_exceeds_collectible');
    const nowMs = Date.parse(nowIso);
    if (!leaseSnap.exists && booking.stripePaymentStatus === 'checkout_created' &&
        booking.stripeCheckoutSessionId &&
        (!Number.isSafeInteger(booking.stripeCheckoutSessionExpiresAt) ||
         booking.stripeCheckoutSessionExpiresAt * 1000 > nowMs)) {
      throw new AccountingError('payment_collection_conflict');
    }
    const reservation = reservePaymentCollectionInTransaction({
      tx, leaseRef, existingLease: leaseSnap.exists ? leaseSnap.data() : null,
      tenantId, bookingId, channel: 'manual', operationId: clientPaymentId, actorUid,
      amountCents, nowIso,
    });
    const updated = {
      ...booking.paymentAccounting,
      confirmedPaymentCents: booking.paymentAccounting.confirmedPaymentCents + amountCents,
    };
    const projected = balance(booking, updated);
    tx.create(paymentRef, {
      id: paymentRef.id, tenantId, bookingId, kind: 'payment', provider: 'manual',
      channel: 'manual', method, note, amountCents, currency: CURRENCY, status: 'confirmed',
      actorUid, createdAt: admin.firestore.FieldValue.serverTimestamp(), confirmedAt: nowIso,
    });
    tx.update(ref, {
      ...summaryPatch(booking, updated, nowIso, 'manual_payment_gateway'),
      paymentMethod: method, paymentNote: note, receivedAt: nowIso,
    });
    tx.set(leaseRef, paymentCollectionLeasePatch(reservation.lease, {
      status: 'completed', closedAt: nowIso, canonicalPaymentRecordId: paymentRef.id,
    }, nowIso));
    return { id: paymentRef.id, balance: projected };
  });
}

async function reconcileReduction({ admin, tenantId, bookingId, originalPaymentId, reductionId,
  amountCents, kind, actorUid, connectedAccountId, nowIso }) {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || !['refund', 'manual_reversal'].includes(kind)) {
    throw new AccountingError('invalid_reduction', 400);
  }
  const db = admin.firestore();
  const ref = bookingRef(db, tenantId, bookingId);
  const sourceRef = ref.collection('paymentRecords').doc(originalPaymentId);
  const id = recordId(kind, reductionId);
  const reductionRef = ref.collection('paymentRecords').doc(id);
  const stateRef = ref.collection('paymentReductionState').doc(originalPaymentId);
  const tenantRef = db.collection('tenants').doc(tenantId);
  return db.runTransaction(async tx => {
    const [tenantSnap, bookingSnap, sourceSnap, reductionSnap, stateSnap] = await Promise.all([
      tx.get(tenantRef), tx.get(ref), tx.get(sourceRef), tx.get(reductionRef), tx.get(stateRef),
    ]);
    if (!tenantSnap.exists || !bookingSnap.exists) throw new AccountingError('payment_context_not_found', 404);
    const tenant = tenantSnap.data() || {};
    const booking = bookingSnap.data() || {};
    if (booking.paymentAccounting?.version !== VERSION) throw new AccountingError('accounting_cutover_required');
    if (kind === 'refund' && (!connectedAccountId || tenant.stripeAccountId !== connectedAccountId)) {
      throw new AccountingError('connected_account_mismatch', 403);
    }
    if (reductionSnap.exists) return { duplicate: true, balance: balance(booking) };
    if (!sourceSnap.exists || sourceSnap.data()?.status === 'unresolved_legacy') {
      if (kind !== 'refund') throw new AccountingError('original_payment_not_found', 404);
      tx.create(reductionRef, {
        id, tenantId, bookingId, kind, provider: 'stripe', providerRefundId: reductionId,
        originalPaymentId, connectedAccountId, amountCents, currency: CURRENCY,
        status: 'unresolved_legacy', createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      const updated = { ...booking.paymentAccounting,
        issues: [...new Set([...(booking.paymentAccounting.issues || []), 'unresolved_legacy_refund'])] };
      tx.update(ref, summaryPatch(booking, updated, nowIso, 'unresolved_legacy_refund'));
      return { unresolvedLegacy: true, balance: balance(booking, updated) };
    }
    const source = sourceSnap.data() || {};
    if (source.kind !== 'payment' || source.status !== 'confirmed' || source.tenantId !== tenantId ||
        source.bookingId !== bookingId || source.currency !== CURRENCY ||
        (kind === 'refund' && (source.provider !== 'stripe' || source.connectedAccountId !== connectedAccountId)) ||
        (kind === 'manual_reversal' && source.provider !== 'manual')) {
      throw new AccountingError('original_payment_mismatch');
    }
    const prior = stateSnap.exists ? stateSnap.data()?.reducedCents : 0;
    if (!Number.isSafeInteger(prior) || prior < 0 || prior + amountCents > source.amountCents) {
      throw new AccountingError('reduction_exceeds_payment');
    }
    const field = kind === 'refund' ? 'confirmedRefundCents' : 'confirmedManualReversalCents';
    const updated = { ...booking.paymentAccounting,
      [field]: booking.paymentAccounting[field] + amountCents };
    const projected = balance(booking, updated);
    tx.create(reductionRef, {
      id, tenantId, bookingId, kind, provider: kind === 'refund' ? 'stripe' : 'manual',
      ...(kind === 'refund' ? { providerRefundId: reductionId, connectedAccountId } : { actorUid }),
      originalPaymentId, amountCents, currency: CURRENCY, status: 'confirmed',
      createdAt: admin.firestore.FieldValue.serverTimestamp(), confirmedAt: nowIso,
    });
    tx.set(stateRef, { reducedCents: prior + amountCents });
    tx.update(ref, summaryPatch(booking, updated, nowIso, kind));
    return { id, balance: projected };
  });
}

module.exports = {
  AccountingError, CURRENCY, VERSION, PAYMENT_COLLECTION_LEASE_VERSION, PAYMENT_COLLECTION_CHANNELS,
  cents, canonicalTotalCents, planCutover, balance, summaryPatch, readCanonicalBalance, cutoverBooking,
  reconcilePayment, recordManualPayment, reconcileReduction, recordId, collectionOperationHash,
  paymentCollectionLeaseRef, isActivePaymentCollectionLease, assertPaymentCollectionLeaseContext,
  reservePaymentCollectionInTransaction, paymentCollectionLeasePatch, acquirePaymentCollectionLease,
};
