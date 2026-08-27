import { auth } from '../../firebase';

export const GROWTH_AI_ACTION_COSTS = Object.freeze({
  customer_response: 1,
  estimate_assistance: 1,
  estimate_followup: 1,
  marketing_post: 1,
});

function requireTenantId(tenantId) {
  const value = typeof tenantId === 'string' ? tenantId.trim() : '';
  if (!value || value === 'DEFAULT') throw new Error('Select a valid tenant before using GrowthAI.');
  return value;
}

function functionUrl(functionName) {
  const configuredBaseUrl = import.meta.env.VITE_FUNCTIONS_URL?.replace(/\/+$/, '');
  if (configuredBaseUrl) return `${configuredBaseUrl}/${functionName}`;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error('GrowthAI server configuration is unavailable.');
  return `https://us-central1-${projectId}.cloudfunctions.net/${functionName}`;
}

export function createGrowthAIIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `growthai-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function loadGrowthAICreditBalance(tenantId) {
  const resolvedTenantId = requireTenantId(tenantId);
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in before loading AI credits.');
  const token = await user.getIdToken();
  const response = await fetch(functionUrl('getGrowthAICreditBalance'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ tenantId: resolvedTenantId }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success !== true) {
    const error = new Error(payload.error || 'AI credit balance is temporarily unavailable.');
    error.code = payload.code || 'credit_balance_failed';
    throw error;
  }
  const buckets = payload.buckets;
  const validBuckets = buckets && typeof buckets === 'object' && !Array.isArray(buckets) &&
    ['monthly', 'promotional', 'purchased'].every(key => Number.isInteger(buckets[key]) && buckets[key] >= 0);
  const availableFromBuckets = validBuckets
    ? ['monthly', 'promotional', 'purchased'].reduce((total, key) => total + buckets[key], 0)
    : null;
  const periodStart = new Date(payload.periodStart);
  const nextResetAt = new Date(payload.nextResetAt);
  let validTimeZone;
  try {
    validTimeZone = typeof payload.timeZone === 'string' && Boolean(payload.timeZone.trim()) &&
      Boolean(new Intl.DateTimeFormat('en-US', { timeZone: payload.timeZone }).format(new Date(0)));
  } catch {
    validTimeZone = false;
  }
  if (!validBuckets || !Number.isInteger(payload.available) || payload.available < 0 ||
      payload.available !== availableFromBuckets ||
      !Number.isInteger(payload.reserved) || payload.reserved < 0 ||
      !Number.isInteger(payload.monthlyAllowance) || payload.monthlyAllowance < 0 ||
      Number.isNaN(periodStart.getTime()) || Number.isNaN(nextResetAt.getTime()) ||
      nextResetAt <= periodStart || !validTimeZone) {
    const error = new Error('AI credit balance is temporarily unavailable.');
    error.code = 'credit_balance_invalid';
    throw error;
  }
  return {
    available: payload.available,
    reserved: payload.reserved,
    buckets: Object.fromEntries(['monthly', 'promotional', 'purchased'].map(key => [key, buckets[key]])),
    monthlyAllowance: payload.monthlyAllowance,
    periodStart: payload.periodStart,
    nextResetAt: payload.nextResetAt,
    timeZone: payload.timeZone,
  };
}

export async function generateGrowthAIContent({ tenantId, actionType, sourceRefs = {}, input = {}, idempotencyKey }) {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in before using AI-assisted GrowthAI.');
  const token = await user.getIdToken();
  const response = await fetch(functionUrl('generateGrowthAIContent'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tenantId: requireTenantId(tenantId),
      actionType,
      sourceRefs,
      input,
      idempotencyKey,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success !== true) {
    const error = new Error(payload.error || 'AI-assisted generation failed.');
    error.code = payload.code || 'generation_failed';
    throw error;
  }
  return payload;
}

export async function routeGrowthAIConversation({ tenantId, message }) {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in before using GrowthAI.');
  const token = await user.getIdToken();
  const response = await fetch(functionUrl('routeGrowthAIConversation'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tenantId: requireTenantId(tenantId),
      message: typeof message === 'string' ? message.trim() : '',
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success !== true) {
    const error = new Error(payload.error || 'GrowthAI routing is temporarily unavailable.');
    error.code = payload.code || 'routing_failed';
    throw error;
  }
  return { skillId: payload.skillId, confidence: payload.confidence };
}
