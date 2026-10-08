const { canonicalJobScopeSnapshot, scopeHash } = require('./jobScopeControl');
const { cents, canonicalTotalCents, summaryPatch, paymentCollectionLeaseRef } = require('./bookingPaymentAccounting');

class ExtraWorkApprovalError extends Error {
  constructor(message, code = 'request_unavailable', status = 409) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const fail = (message, code, status) => { throw new ExtraWorkApprovalError(message, code, status); };

function reviewedChange(record) {
  const submission = record?.submission || {};
  const review = record?.ownerReview || {};
  if (!['same_visit_fits', 'same_visit_additional_time', 'future_visit'].includes(review.disposition)) {
    fail('Extra-work review is invalid.', 'review_incomplete', 409);
  }
  const items = Array.isArray(submission.items) ? submission.items : [];
  if (!items.every(item => item && typeof item.id === 'string' && item.id &&
    typeof item.label === 'string' && item.label && Number.isInteger(item.quantity) && item.quantity > 0 &&
    Number.isInteger(item.lineTotalCents) && item.lineTotalCents >= 0 &&
    Number.isInteger(item.totalDurationMinutes) && item.totalDurationMinutes >= 0)) {
    fail('Extra-work request is invalid.', 'request_invalid', 409);
  }
  const custom = submission.customRequest;
  if (custom && (!Number.isInteger(review.customPriceCents) || review.customPriceCents < 0 ||
    !Number.isInteger(review.customDurationMinutes) || review.customDurationMinutes < 1)) {
    fail('Extra-work review is incomplete.', 'review_incomplete', 409);
  }
  const priceDeltaCents = items.reduce((sum, item) => sum + item.lineTotalCents, 0) +
    (custom ? review.customPriceCents : 0);
  const durationDeltaMinutes = items.reduce((sum, item) => sum + item.totalDurationMinutes, 0) +
    (custom ? review.customDurationMinutes : 0);
  if (!Number.isSafeInteger(priceDeltaCents) || !Number.isSafeInteger(durationDeltaMinutes)) {
    fail('Extra-work review is invalid.', 'request_invalid', 409);
  }
  const scopeItems = items.map(item => ({
    id: `extra-${record.id}-${item.id}`.slice(0, 128),
    label: `${item.label}${item.quantity > 1 ? ` x ${item.quantity}` : ''}`.slice(0, 160),
    area: 'Extra work',
    required: true,
  }));
  if (custom) scopeItems.push({
    id: `extra-${record.id}-custom`.slice(0, 128),
    label: String(custom.description || '').trim().slice(0, 160),
    area: 'Extra work',
    required: true,
  });
  if (scopeItems.some(item => !item.label)) fail('Extra-work request is invalid.', 'request_invalid', 409);
  return {
    requestId: record.id,
    disposition: review.disposition,
    addOnIds: items.map(item => item.id),
    scopeItems,
    priceDeltaCents,
    durationDeltaMinutes,
  };
}

function customerProjection(record) {
  const change = reviewedChange(record);
  return {
    id: record.id,
    bookingId: record.bookingId,
    status: record.status,
    scopeVersion: record.submission.scope.version,
    disposition: change.disposition,
    items: record.submission.items.map(item => ({
      id: item.id,
      label: item.label,
      quantity: item.quantity,
      lineTotalCents: item.lineTotalCents,
      totalDurationMinutes: item.totalDurationMinutes,
    })),
    customRequest: record.submission.customRequest ? {
      description: record.submission.customRequest.description,
      priceCents: record.ownerReview.customPriceCents,
      durationMinutes: record.ownerReview.customDurationMinutes,
    } : null,
    totalPriceCents: change.priceDeltaCents,
    totalDurationMinutes: change.durationDeltaMinutes,
    approvedRevisionVersion: record.customerApproval?.scopeVersion || null,
  };
}

async function listCustomerExtraWork({ admin, context, bookingId, customer }) {
  const bookingRef = admin.firestore().collection('tenants').doc(context.tenantId)
    .collection('bookings').doc(bookingId);
  const bookingSnap = await bookingRef.get();
  if (!bookingSnap.exists || bookingSnap.data()?.customerId !== customer.id) {
    fail('Extra-work request unavailable.', 'request_unavailable', 404);
  }
  const requests = await bookingRef.collection('extraWorkRequests').limit(50).get();
  return requests.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(record => ['approval_ready', 'customer_approved'].includes(record.status))
    .map(customerProjection);
}

async function approveCustomerExtraWork({ admin, context, bookingId, requestId, customer, now = new Date() }) {
  const db = admin.firestore();
  const bookingRef = db.collection('tenants').doc(context.tenantId).collection('bookings').doc(bookingId);
  const requestRef = bookingRef.collection('extraWorkRequests').doc(requestId);
  return db.runTransaction(async tx => {
    const [bookingSnap, requestSnap] = await Promise.all([tx.get(bookingRef), tx.get(requestRef)]);
    if (!bookingSnap.exists || bookingSnap.data()?.customerId !== customer.id || !requestSnap.exists) {
      fail('Extra-work request unavailable.', 'request_unavailable', 404);
    }
    const booking = bookingSnap.data() || {};
    const record = { id: requestId, ...requestSnap.data() };
    if (record.status === 'customer_approved') return { request: customerProjection(record) };
    if (record.status !== 'approval_ready') fail('Extra-work request is not approval-ready.', 'approval_conflict', 409);

    // Approval and every collector read the same booking/lease transaction boundary.
    // A provider-associated operation is unresolved even if its local expiry passed.
    const leaseSnap = await tx.get(paymentCollectionLeaseRef(db, context.tenantId, bookingId));
    const lease = leaseSnap.exists ? leaseSnap.data() : null;
    if (lease && (lease.version !== 1 || lease.tenantId !== context.tenantId || lease.bookingId !== bookingId ||
        !['completed', 'released'].includes(lease.status)) ||
        booking.stripePaymentStatus === 'checkout_created' || booking.stripeCheckoutReservation) {
      fail('Resolve the current payment collection before approving a financial scope change.', 'payment_collection_conflict', 409);
    }
    if (cents(booking.agreedPrice ?? booking.price) === null) {
      fail('Original booking price is invalid.', 'invalid_price', 409);
    }
    if (booking.paymentAccounting?.issues?.length) {
      fail('Payment history requires review before changing the financial scope.', 'payment_history_unavailable', 409);
    }

    const approved = booking.approvedJobScope;
    const control = booking.jobScopeControl || {};
    if (!approved || control.state !== 'approved' || control.latestVersion !== approved.version ||
      control.approvedVersion !== approved.version || control.approvedScopeHash !== approved.scopeHash ||
      record.submission?.scope?.version !== approved.version || record.submission?.scope?.scopeHash !== approved.scopeHash) {
      fail('Approved scope changed.', 'scope_changed', 409);
    }
    const currentSnapshot = canonicalJobScopeSnapshot(bookingId, booking);
    if (scopeHash(currentSnapshot) !== approved.scopeHash) fail('Approved scope changed.', 'scope_changed', 409);
    const priorVersionRef = bookingRef.collection('jobScopeVersions').doc(`v${approved.version}`);
    const priorVersionSnap = await tx.get(priorVersionRef);
    const priorVersion = priorVersionSnap.exists ? priorVersionSnap.data() || {} : {};
    if (priorVersion.version !== approved.version || priorVersion.state !== 'approved' || priorVersion.scopeHash !== approved.scopeHash ||
      scopeHash(priorVersion.snapshot) !== approved.scopeHash) {
      fail('Approved scope history is unavailable.', 'scope_history_unavailable', 409);
    }

    const change = reviewedChange(record);
    const existingChanges = Array.isArray(approved.snapshot.extraWork) ? approved.snapshot.extraWork : [];
    if (existingChanges.length >= 50 ||
      (Array.isArray(approved.snapshot.serviceItems) ? approved.snapshot.serviceItems.length : 0) + change.scopeItems.length > 500 ||
      new Set([...(approved.snapshot.selectedAddOns || []), ...change.addOnIds]).size > 100) {
      fail('Approved scope cannot accept more extra work.', 'scope_limit_reached', 409);
    }
    const revisedSnapshot = canonicalJobScopeSnapshot(bookingId, {
      ...booking,
      approvedJobScope: {
        ...approved,
        snapshot: { ...approved.snapshot, extraWork: [...existingChanges, change] },
      },
    });
    const version = approved.version + 1;
    const revisedHash = scopeHash(revisedSnapshot);
    const approvedAt = now.toISOString();
    const versionRef = bookingRef.collection('jobScopeVersions').doc(`v${version}`);
    const versionRecord = {
      version,
      state: 'approved',
      snapshot: revisedSnapshot,
      scopeHash: revisedHash,
      requestedAt: record.ownerReview.reviewedAt,
      requestedByUid: record.ownerReview.reviewedByUid,
      approvedAt,
      approvedByCustomerUid: context.uid,
      affirmativeAcceptance: true,
      source: 'extra_work',
      sourceRequestId: requestId,
      priorVersion: approved.version,
    };
    const revisedBooking = {
      ...booking,
      jobScopeControl: { ...control, approvedVersion: version, approvedScopeHash: revisedHash },
      approvedJobScope: { version, scopeHash: revisedHash, approvedAt, snapshot: revisedSnapshot },
    };
    if (canonicalTotalCents(revisedBooking) === null) fail('Approved financial scope is invalid.', 'invalid_price', 409);
    const paymentPatch = booking.paymentAccounting
      ? summaryPatch(revisedBooking, booking.paymentAccounting, approvedAt, 'customer_extra_work_approval') : {};
    tx.create(versionRef, versionRecord);
    tx.update(bookingRef, {
      ...paymentPatch,
      jobScopeControl: {
        ...control,
        state: 'approved',
        latestVersion: version,
        latestScopeHash: revisedHash,
        approvedVersion: version,
        approvedScopeHash: revisedHash,
        approvedAt,
      },
      approvedJobScope: { version, scopeHash: revisedHash, approvedAt, snapshot: revisedSnapshot },
    });
    const customerApproval = {
      approvedAt,
      approvedByCustomerUid: context.uid,
      affirmativeAcceptance: true,
      priorScopeVersion: approved.version,
      scopeVersion: version,
      scopeHash: revisedHash,
    };
    tx.update(requestRef, { status: 'customer_approved', customerApproval });
    return { request: customerProjection({ ...record, status: 'customer_approved', customerApproval }) };
  });
}

module.exports = {
  ExtraWorkApprovalError,
  approveCustomerExtraWork,
  customerProjection,
  listCustomerExtraWork,
  reviewedChange,
};
