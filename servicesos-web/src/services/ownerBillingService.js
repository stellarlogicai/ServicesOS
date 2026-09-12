import { auth } from '../firebase';
import { OwnerOnboardingServiceError, resolveOwnerOnboardingGatewayUrl } from './ownerOnboardingService';

const FUNCTION_NAME = 'ownerOnboardingBillingGateway';

export function sanitizeOwnerCheckout(payload) {
  const value = payload?.success === true && payload.checkout && typeof payload.checkout === 'object'
    ? payload.checkout : null;
  if (!value || typeof value.sessionId !== 'string' || !value.sessionId.trim() ||
    typeof value.checkoutUrl !== 'string') {
    throw new OwnerOnboardingServiceError('Subscription checkout returned an invalid response.', { code: 'invalid_response' });
  }
  let url;
  try { url = new URL(value.checkoutUrl); } catch { throw new OwnerOnboardingServiceError('Subscription checkout returned an invalid response.', { code: 'invalid_response' }); }
  if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com') {
    throw new OwnerOnboardingServiceError('Subscription checkout returned an invalid response.', { code: 'invalid_response' });
  }
  return { sessionId: value.sessionId.trim(), checkoutUrl: url.toString() };
}

export async function createOwnerSubscriptionCheckout({ user = auth.currentUser, fetchImpl = fetch } = {}) {
  if (!user || typeof user.getIdToken !== 'function') {
    throw new OwnerOnboardingServiceError('Sign in to continue owner onboarding.', { code: 'unauthenticated', status: 401 });
  }
  const token = await user.getIdToken();
  const response = await fetchImpl(resolveOwnerOnboardingGatewayUrl(import.meta.env, FUNCTION_NAME), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  let payload;
  try { payload = await response.json(); }
  catch { throw new OwnerOnboardingServiceError('Subscription checkout is temporarily unavailable.'); }
  if (!response.ok) {
    throw new OwnerOnboardingServiceError('Subscription checkout could not be started.', {
      code: typeof payload?.code === 'string' ? payload.code : 'billing_unavailable',
      status: response.status,
    });
  }
  return sanitizeOwnerCheckout(payload);
}
