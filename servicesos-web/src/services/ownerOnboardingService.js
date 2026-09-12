import { auth } from '../firebase';

const OWNER_BOOTSTRAP_FUNCTION = 'ownerOnboardingBootstrapGateway';
const LOCAL_PROJECT_ID = 'demo-servicesos-v1-smoke-local';
const ONBOARDING_STATES = new Set([
  'business_profile_required',
  'agreement_required',
  'billing_required',
  'active',
]);

export class OwnerOnboardingServiceError extends Error {
  constructor(message, { code = 'bootstrap_unavailable', status = 0 } = {}) {
    super(message);
    this.name = 'OwnerOnboardingServiceError';
    this.code = code;
    this.status = status;
  }
}

function normalizedBaseUrl(value) {
  return typeof value === 'string' ? value.trim().replace(/\/+$/, '') : '';
}

function localEndpointAllowed(value, projectId) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) &&
      ['127.0.0.1', 'localhost', '::1'].includes(url.hostname) &&
      url.pathname.split('/').includes(projectId);
  } catch {
    return false;
  }
}

export function resolveOwnerOnboardingGatewayUrl(env = import.meta.env) {
  const projectId = typeof env.VITE_FIREBASE_PROJECT_ID === 'string'
    ? env.VITE_FIREBASE_PROJECT_ID.trim()
    : '';
  const emulatorMode = env.VITE_USE_FIREBASE_EMULATORS === 'true';
  const configured = normalizedBaseUrl(env.VITE_FUNCTIONS_URL);

  if (emulatorMode) {
    if (projectId !== LOCAL_PROJECT_ID) {
      throw new OwnerOnboardingServiceError('Owner onboarding configuration is unavailable.');
    }
    if (configured) {
      if (!localEndpointAllowed(configured, projectId)) {
        throw new OwnerOnboardingServiceError('Owner onboarding emulator configuration is unsafe.');
      }
      return `${configured}/${OWNER_BOOTSTRAP_FUNCTION}`;
    }
    const host = typeof env.VITE_FIREBASE_FUNCTIONS_EMULATOR_HOST === 'string'
      ? env.VITE_FIREBASE_FUNCTIONS_EMULATOR_HOST.trim()
      : '';
    const port = Number(env.VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT || 5001);
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
      throw new OwnerOnboardingServiceError('Owner onboarding configuration is unavailable.');
    }
    return `http://${host}:${port}/${projectId}/us-central1/${OWNER_BOOTSTRAP_FUNCTION}`;
  }

  if (configured) {
    try {
      if (new URL(configured).protocol !== 'https:') throw new Error('unsafe protocol');
    } catch {
      throw new OwnerOnboardingServiceError('Owner onboarding configuration is unavailable.');
    }
    return `${configured}/${OWNER_BOOTSTRAP_FUNCTION}`;
  }
  if (!projectId || projectId === LOCAL_PROJECT_ID) {
    throw new OwnerOnboardingServiceError('Owner onboarding configuration is unavailable.');
  }
  return `https://us-central1-${projectId}.cloudfunctions.net/${OWNER_BOOTSTRAP_FUNCTION}`;
}

function optionalText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function sanitizeOwnerOnboardingProjection(payload) {
  const source = payload?.success === true && payload.onboarding &&
    typeof payload.onboarding === 'object' && !Array.isArray(payload.onboarding)
    ? payload.onboarding
    : null;
  const tenantId = optionalText(source?.tenantId);
  const onboardingState = source?.onboardingState === null ? null : optionalText(source?.onboardingState);
  if (
    !source || !tenantId || typeof source.lifecycleManaged !== 'boolean' ||
    typeof source.businessProfileComplete !== 'boolean' ||
    (source.lifecycleManaged && !ONBOARDING_STATES.has(onboardingState)) ||
    (!source.lifecycleManaged && onboardingState !== null)
  ) {
    throw new OwnerOnboardingServiceError('Owner onboarding returned an invalid response.', {
      code: 'invalid_response',
    });
  }

  const projection = {
    tenantId,
    onboardingState,
    lifecycleManaged: source.lifecycleManaged,
    businessProfileComplete: source.businessProfileComplete,
  };
  for (const field of ['businessName', 'businessEmail', 'businessPhone', 'businessAddress']) {
    const value = optionalText(source[field]);
    if (value !== undefined) projection[field] = value;
  }
  return projection;
}

export function ownerOnboardingFromTenant(tenant) {
  if (!tenant || typeof tenant !== 'object') return null;
  if (tenant.onboardingSchemaVersion !== 1) {
    return {
      tenantId: optionalText(tenant.id) || '',
      onboardingState: null,
      lifecycleManaged: false,
      businessProfileComplete: false,
    };
  }
  const onboardingState = optionalText(tenant.onboardingState);
  if (!ONBOARDING_STATES.has(onboardingState)) {
    throw new OwnerOnboardingServiceError('Owner onboarding state is unavailable.', {
      code: 'invalid_response',
    });
  }
  return {
    tenantId: optionalText(tenant.id) || '',
    onboardingState,
    lifecycleManaged: true,
    businessProfileComplete: Boolean(
      optionalText(tenant.businessName) &&
      optionalText(tenant.businessEmail) &&
      optionalText(tenant.businessPhone)
    ),
  };
}

export async function bootstrapOwnerOnboarding({ user = auth.currentUser, fetchImpl = fetch } = {}) {
  if (!user || typeof user.getIdToken !== 'function') {
    throw new OwnerOnboardingServiceError('Sign in to continue owner onboarding.', {
      code: 'unauthenticated',
      status: 401,
    });
  }
  const token = await user.getIdToken();
  const response = await fetchImpl(resolveOwnerOnboardingGatewayUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  let body;
  try {
    body = await response.json();
  } catch {
    throw new OwnerOnboardingServiceError('Owner onboarding is temporarily unavailable.');
  }
  if (!response.ok) {
    throw new OwnerOnboardingServiceError('Owner onboarding could not be resumed.', {
      code: typeof body?.code === 'string' ? body.code : 'bootstrap_unavailable',
      status: response.status,
    });
  }
  return sanitizeOwnerOnboardingProjection(body);
}
