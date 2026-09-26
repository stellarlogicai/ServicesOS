// Emulator-only, one-booking-at-a-time cutover. Dry run is the default.
const admin = require('firebase-admin');
const { planCutover, canonicalTotalCents, cutoverBooking } = require('../bookingPaymentAccounting');

function buildCutoverReport({ booking, tenantId, bookingId, mode, nowIso }) {
  const alreadyCutOver = booking.paymentAccounting?.version === 1;
  const plan = alreadyCutOver ? booking.paymentAccounting : planCutover(booking, nowIso);
  return {
    bookingId,
    tenantId,
    mode: mode === '--apply' ? 'apply' : 'dry_run',
    alreadyCutOver,
    totalCents: canonicalTotalCents(booking),
    legacyOpeningPaidCents: plan.legacyOpeningPaidCents,
    issues: Array.isArray(plan.issues) ? plan.issues : [],
    storedStripeReferencePresent: Boolean(booking.stripePaymentIntentId),
  };
}

async function main(args = process.argv.slice(2)) {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST || '';
  if (!/^(localhost|127\.0\.0\.1):\d+$/.test(emulatorHost)) {
    throw new Error('A loopback Firestore emulator is required');
  }
  const [tenantId, bookingId, mode] = args;
  if (!tenantId || tenantId === 'DEFAULT' || tenantId.includes('/') ||
      !bookingId || bookingId.includes('/') || (mode && mode !== '--apply')) {
    throw new Error('Usage: node scripts/bookingPaymentCutover.js <tenantId> <bookingId> [--apply]');
  }
  admin.initializeApp({ projectId: 'demo-servicesos-payment-cutover' });
  const ref = admin.firestore().collection('tenants').doc(tenantId).collection('bookings').doc(bookingId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Booking not found');
  const booking = snap.data() || {};
  const nowIso = new Date().toISOString();
  const report = buildCutoverReport({ booking, tenantId, bookingId, mode, nowIso });
  if (mode === '--apply') {
    if (report.totalCents === null || report.legacyOpeningPaidCents === null) {
      throw new Error('Ambiguous booking balance requires review');
    }
    report.balance = await cutoverBooking({ admin, tenantId, bookingId, nowIso });
  }
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

if (require.main === module) main().catch(error => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});

module.exports = { buildCutoverReport, main };
