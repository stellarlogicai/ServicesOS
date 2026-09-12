import { auth } from '../firebase';
import { OwnerOnboardingServiceError, resolveOwnerOnboardingGatewayUrl } from './ownerOnboardingService';

const FUNCTION_NAME = 'ownerOnboardingSaasAgreementGateway';
const AGREEMENT_ID = 'servicesos-saas-v1';
const VERSION_DATE = '2026-09-12';

function sanitizeAgreement(payload) {
  const value = payload?.success === true && payload.agreement && typeof payload.agreement === 'object'
    ? payload.agreement : null;
  if (!value || value.agreementId !== AGREEMENT_ID || value.agreementType !== 'servicesos_saas' ||
    value.agreementVersionDate !== VERSION_DATE || typeof value.termsMarkdown !== 'string' || !value.termsMarkdown ||
    typeof value.termsHash !== 'string' || !/^[a-f0-9]{64}$/.test(value.termsHash) ||
    value.termsFormat !== 'markdown' || typeof value.acceptanceLanguage !== 'string' || !value.acceptanceLanguage ||
    typeof value.accepted !== 'boolean' || !['agreement_required', 'billing_required'].includes(value.onboardingState)) {
    throw new OwnerOnboardingServiceError('SaaS agreement returned an invalid response.', { code: 'invalid_response' });
  }
  return {
    agreementType: value.agreementType, agreementId: value.agreementId,
    agreementVersionDate: value.agreementVersionDate,
    agreementVersionDateLabel: typeof value.agreementVersionDateLabel === 'string' ? value.agreementVersionDateLabel : '',
    termsMarkdown: value.termsMarkdown, termsHash: value.termsHash, termsFormat: value.termsFormat,
    acceptanceLanguage: value.acceptanceLanguage, accepted: value.accepted,
    onboardingState: value.onboardingState,
  };
}

async function requestAgreement({ method, body, user = auth.currentUser, fetchImpl = fetch }) {
  if (!user || typeof user.getIdToken !== 'function') {
    throw new OwnerOnboardingServiceError('Sign in to continue owner onboarding.', { code: 'unauthenticated', status: 401 });
  }
  const token = await user.getIdToken();
  const response = await fetchImpl(resolveOwnerOnboardingGatewayUrl(import.meta.env, FUNCTION_NAME), {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let payload;
  try { payload = await response.json(); }
  catch { throw new OwnerOnboardingServiceError('SaaS agreement is temporarily unavailable.'); }
  if (!response.ok) throw new OwnerOnboardingServiceError('SaaS agreement could not be processed.', { code: payload?.code || 'agreement_failed', status: response.status });
  return sanitizeAgreement(payload);
}

export const loadOwnerSaasAgreement = options => requestAgreement({ method: 'GET', ...options });
export const acceptOwnerSaasAgreement = ({ signerName, agreementId, termsHash }, options = {}) => requestAgreement({
  method: 'POST',
  body: { signerName, affirmativeAcceptance: true, agreementId, termsHash },
  ...options,
});
export { sanitizeAgreement };
