const COLLECTED_PAYMENT_STATUSES = new Set([
  'deposit_paid',
  'partial',
  'paid_in_full',
  'paid_cash',
  'paid_check',
  'paid_external_app',
]);

const UNCOLLECTED_PAYMENT_STATUSES = new Set([
  'not_paid',
  'deposit_requested',
  'final_due',
  'payment_issue',
]);

function numericAmount(...values) {
  return values
    .filter(value => value !== null && value !== undefined && value !== '')
    .map(Number)
    .find(Number.isFinite);
}

export function bookingExpectedAmount(booking = {}) {
  const amount = numericAmount(
    booking.agreedPrice,
    booking.price,
    booking.finalPrice,
    booking.totalAmount,
    booking.total
  );
  return amount && amount > 0 ? amount : 0;
}

export function bookingCollectedAmount(booking = {}) {
  const amountReceived = numericAmount(booking.amountReceived);
  if (!amountReceived || amountReceived <= 0) return 0;

  const status = typeof booking.paymentStatus === 'string' ? booking.paymentStatus : '';
  if (UNCOLLECTED_PAYMENT_STATUSES.has(status)) return 0;
  if (COLLECTED_PAYMENT_STATUSES.has(status)) return amountReceived;
  if (booking.paymentMethod) return amountReceived;
  if (booking.paymentStatusUpdatedBy === 'stripe_webhook') return amountReceived;
  return 0;
}

export function calculateDashboardRevenueSnapshot(bookings = []) {
  const safeBookings = Array.isArray(bookings) ? bookings : [];
  const expectedRevenue = safeBookings.reduce((sum, booking) => sum + bookingExpectedAmount(booking), 0);
  const collectedRevenue = safeBookings.reduce((sum, booking) => sum + bookingCollectedAmount(booking), 0);
  const outstandingBalance = Math.max(expectedRevenue - collectedRevenue, 0);

  return {
    expectedRevenue,
    collectedRevenue,
    outstandingBalance,
  };
}
