export const GROWTH_AI_ONBOARDING_VERSION = 1;
export const GROWTH_AI_ONBOARDING_LAST_STEP = 5;

const STORAGE_PREFIX = 'servicesos:growthai-onboarding';
const VALID_STATUSES = new Set(['not_started', 'in_progress', 'completed', 'skipped']);

export function growthAIOnboardingStorageKey(tenantId, userId) {
  const tenant = typeof tenantId === 'string' ? tenantId.trim() : '';
  const user = typeof userId === 'string' ? userId.trim() : '';
  if (!tenant || !user) return null;
  return `${STORAGE_PREFIX}:v${GROWTH_AI_ONBOARDING_VERSION}:${encodeURIComponent(tenant)}:${encodeURIComponent(user)}`;
}

export function defaultGrowthAIOnboardingState() {
  return {
    version: GROWTH_AI_ONBOARDING_VERSION,
    status: 'not_started',
    step: 0,
  };
}

function normalizeState(value) {
  const fallback = defaultGrowthAIOnboardingState();
  if (!value || typeof value !== 'object') return fallback;

  const status = VALID_STATUSES.has(value.status) ? value.status : fallback.status;
  const numericStep = Number.isInteger(value.step) ? value.step : fallback.step;
  const step = Math.min(Math.max(numericStep, 0), GROWTH_AI_ONBOARDING_LAST_STEP);

  if (value.version !== GROWTH_AI_ONBOARDING_VERSION) return fallback;
  return { version: GROWTH_AI_ONBOARDING_VERSION, status, step };
}

function resolveStorage(storage) {
  if (storage) return storage;
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

export function loadGrowthAIOnboardingState({ tenantId, userId, storage } = {}) {
  const key = growthAIOnboardingStorageKey(tenantId, userId);
  const target = resolveStorage(storage);
  if (!key || !target) return defaultGrowthAIOnboardingState();

  try {
    const stored = target.getItem(key);
    return stored ? normalizeState(JSON.parse(stored)) : defaultGrowthAIOnboardingState();
  } catch {
    return defaultGrowthAIOnboardingState();
  }
}

export function saveGrowthAIOnboardingState({ tenantId, userId, state, storage } = {}) {
  const next = normalizeState({
    ...state,
    version: GROWTH_AI_ONBOARDING_VERSION,
  });
  const key = growthAIOnboardingStorageKey(tenantId, userId);
  const target = resolveStorage(storage);
  if (!key || !target) return next;

  try {
    target.setItem(key, JSON.stringify(next));
  } catch {
    // Onboarding remains usable for the current session when storage is unavailable.
  }
  return next;
}
