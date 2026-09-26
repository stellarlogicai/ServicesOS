import { auth } from '../firebase';
import { getFirebaseFunctionUrl } from './stripeService';

async function callBookingPaymentGateway(body) {
  const user = auth.currentUser;
  if (!user) throw new Error('Authentication required');
  const token = await user.getIdToken();
  const response = await fetch(getFirebaseFunctionUrl('bookingManualPaymentGateway'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) {
    const messages = {
      amount_exceeds_collectible: 'Payment exceeds the remaining balance or this booking is not collectible.',
      checkout_link_active: 'A Stripe payment link is still open. Record a manual payment after that link expires.',
      ambiguous_legacy_balance: 'This booking needs payment review before another payment can be recorded.',
    };
    throw new Error(messages[result.code] || result.code || 'Payment request failed');
  }
  return result;
}

export function recordBookingManualPayment(bookingId, { clientPaymentId, amount, method, note }) {
  return callBookingPaymentGateway({ action: 'record', bookingId, clientPaymentId, amount, method, note });
}

export function reverseBookingManualPayment(bookingId, paymentRecordId) {
  return callBookingPaymentGateway({ action: 'reverse', bookingId, paymentRecordId });
}

export function listBookingPayments(bookingId) {
  return callBookingPaymentGateway({ action: 'list', bookingId });
}
