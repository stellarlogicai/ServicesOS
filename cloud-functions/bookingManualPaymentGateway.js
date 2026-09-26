const {
  AccountingError, cents, cutoverBooking, readCanonicalBalance,
  recordManualPayment, reconcileReduction,
} = require('./bookingPaymentAccounting');

const ORIGINS = new Set(['https://servicesos.netlify.app', 'http://localhost:5173', 'http://127.0.0.1:5173']);

function member(list, uid) {
  return Array.isArray(list) ? list.includes(uid) : Boolean(list && typeof list === 'object' && list[uid]);
}

async function authorizeOwner(admin, req) {
  const header = req.headers?.authorization || '';
  if (!header.startsWith('Bearer ')) throw new AccountingError('unauthenticated', 401);
  let uid;
  try { uid = (await admin.auth().verifyIdToken(header.slice(7).trim())).uid; }
  catch { throw new AccountingError('unauthenticated', 401); }
  const db = admin.firestore();
  const profileSnap = await db.collection('users').doc(uid).get();
  const profile = profileSnap.data() || {};
  const tenantId = profile.tenantId;
  if (!profileSnap.exists || !['admin', 'owner'].includes(profile.role) || profile.status !== 'active' ||
      typeof tenantId !== 'string' || !tenantId || tenantId === 'DEFAULT') {
    throw new AccountingError('forbidden', 403);
  }
  const tenantSnap = await db.collection('tenants').doc(tenantId).get();
  const tenant = tenantSnap.data() || {};
  if (!tenantSnap.exists || !member(tenant.adminUsers, uid) || !member(tenant.users, uid)) {
    throw new AccountingError('forbidden', 403);
  }
  return { uid, tenantId };
}

function exactKeys(body, allowed, required) {
  return body && typeof body === 'object' && !Array.isArray(body) &&
    Object.keys(body).every(key => allowed.includes(key)) &&
    required.every(key => Object.hasOwn(body, key));
}

function createBookingManualPaymentGatewayHandler({ admin, now = () => new Date().toISOString() }) {
  return async (req, res) => {
    const origin = req.headers?.origin;
    if (ORIGINS.has(origin)) res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return res.status(405).json({ code: 'method_not_allowed' });
    try {
      const { uid, tenantId } = await authorizeOwner(admin, req);
      const body = req.body;
      const action = body?.action;
      if (action === 'record' && exactKeys(body,
        ['action', 'bookingId', 'clientPaymentId', 'amount', 'method', 'note'],
        ['bookingId', 'clientPaymentId', 'amount', 'method'])) {
        const amountCents = cents(body.amount, { allowZero: false });
        if (amountCents === null) throw new AccountingError('invalid_payment_amount', 400);
        await cutoverBooking({ admin, tenantId, bookingId: body.bookingId, nowIso: now() });
        return res.status(200).json(await recordManualPayment({
          admin, tenantId, bookingId: body.bookingId, actorUid: uid,
          clientPaymentId: body.clientPaymentId, amountCents, method: body.method,
          note: body.note === undefined ? '' : body.note, nowIso: now(),
        }));
      }
      if (action === 'reverse' && exactKeys(body,
        ['action', 'bookingId', 'paymentRecordId'], ['bookingId', 'paymentRecordId'])) {
        const bookingId = body.bookingId;
        const paymentRecordId = body.paymentRecordId;
        if (typeof paymentRecordId !== 'string' || !paymentRecordId || paymentRecordId.includes('/')) {
          throw new AccountingError('invalid_payment_reference', 400);
        }
        await cutoverBooking({ admin, tenantId, bookingId, nowIso: now() });
        const sourceSnap = await admin.firestore().collection('tenants').doc(tenantId)
          .collection('bookings').doc(bookingId).collection('paymentRecords').doc(paymentRecordId).get();
        const source = sourceSnap.data() || {};
        if (!sourceSnap.exists || source.provider !== 'manual' || source.kind !== 'payment') {
          throw new AccountingError('original_payment_not_found', 404);
        }
        return res.status(200).json(await reconcileReduction({
          admin, tenantId, bookingId, originalPaymentId: paymentRecordId,
          reductionId: paymentRecordId, amountCents: source.amountCents,
          kind: 'manual_reversal', actorUid: uid, nowIso: now(),
        }));
      }
      if (action === 'list' && exactKeys(body,
        ['action', 'bookingId'], ['bookingId'])) {
        const { bookingId } = body;
        await cutoverBooking({ admin, tenantId, bookingId, nowIso: now() });
        const [projection, records] = await Promise.all([
          readCanonicalBalance({ admin, tenantId, bookingId }),
          admin.firestore().collection('tenants').doc(tenantId).collection('bookings').doc(bookingId)
            .collection('paymentRecords').limit(100).get(),
        ]);
        return res.status(200).json({ balance: projection, records: records.docs.map(doc => {
          const entry = doc.data() || {};
          return {
            id: doc.id, kind: entry.kind, provider: entry.provider, channel: entry.channel,
            method: entry.method, amountCents: entry.amountCents, status: entry.status,
            originalPaymentId: entry.originalPaymentId || null, confirmedAt: entry.confirmedAt || null,
          };
        }) });
      }
      throw new AccountingError('invalid_request', 400);
    } catch (error) {
      if (error instanceof AccountingError) return res.status(error.status).json({ code: error.code });
      console.error('[Booking manual payment] Gateway error:', error);
      return res.status(503).json({ code: 'payment_unavailable' });
    }
  };
}

module.exports = { authorizeOwner, createBookingManualPaymentGatewayHandler };
