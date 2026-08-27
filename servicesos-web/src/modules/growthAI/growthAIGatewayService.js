import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase';

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
  const snapshot = await getDoc(doc(db, 'tenants', resolvedTenantId, 'growthAICreditBalances', 'current'));
  if (!snapshot.exists()) return { available: 0, reserved: 0, buckets: { monthly: 0, promotional: 0, purchased: 0 } };
  const data = snapshot.data() || {};
  const buckets = data.buckets || {};
  const normalizedBuckets = Object.fromEntries(['monthly', 'promotional', 'purchased'].map(key => [
    key,
    Number.isInteger(buckets[key]) && buckets[key] >= 0 ? buckets[key] : 0,
  ]));
  return {
    available: Object.values(normalizedBuckets).reduce((total, value) => total + value, 0),
    reserved: Number.isInteger(data.reservedCredits) && data.reservedCredits >= 0 ? data.reservedCredits : 0,
    buckets: normalizedBuckets,
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
