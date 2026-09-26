import { auth } from '../firebase';
import { OwnerOnboardingServiceError, resolveOwnerOnboardingGatewayUrl } from './ownerOnboardingService';

export async function openOwnerBillingPortal({ user = auth.currentUser, fetchImpl = fetch } = {}) {
  if (!user || typeof user.getIdToken !== 'function') {
    throw new OwnerOnboardingServiceError('Sign in to manage billing.', { code: 'unauthenticated', status: 401 });
  }
  const response = await fetchImpl(resolveOwnerOnboardingGatewayUrl(import.meta.env, 'ownerBillingPortalGateway'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  let payload;
  try { payload = await response.json(); } catch { throw new OwnerOnboardingServiceError('Billing management is unavailable. Try again.'); }
  if (!response.ok || payload?.success !== true || typeof payload.portalUrl !== 'string') {
    throw new OwnerOnboardingServiceError('Billing management is unavailable. Try again.');
  }
  let url;
  try { url = new URL(payload.portalUrl); } catch { throw new OwnerOnboardingServiceError('Billing management is unavailable. Try again.'); }
  if (url.protocol !== 'https:' || url.hostname !== 'billing.stripe.com' || url.username || url.password) {
    throw new OwnerOnboardingServiceError('Billing management is unavailable. Try again.');
  }
  return url.toString();
}
