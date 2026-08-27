const { GrowthAIGatewayError, verifyGrowthAIActor } = require('./growthAIGateway');
const { GrowthAIProviderError, validateProviderOutput } = require('./growthAIProvider');

const ALLOWED_ORIGINS = new Set([
  'https://servicesos.netlify.app',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
]);
const MAX_MESSAGE_LENGTH = 600;
const ROUTER_SKILLS = Object.freeze([
  Object.freeze({ id: 'business_briefing', label: "Today's business briefing", description: 'Review deterministic work and growth priorities for today.' }),
  Object.freeze({ id: 'estimate_assistance', label: 'Estimate assistance', description: 'Review saved estimate pricing and prepare an advisory recommendation.' }),
  Object.freeze({ id: 'marketing', label: 'Marketing and content planning', description: 'Plan or prepare a marketing draft for owner review.' }),
  Object.freeze({ id: 'customer_response', label: 'Customer communication', description: 'Prepare a private customer message for human review.' }),
  Object.freeze({ id: 'retention', label: 'Retention and rebooking', description: 'Review deterministic rebooking opportunities.' }),
  Object.freeze({ id: 'reputation', label: 'Reputation response', description: 'Prepare a review response for human review.' }),
  Object.freeze({ id: 'opportunities', label: 'Growth opportunities', description: 'Review current deterministic GrowthAI opportunities.' }),
  Object.freeze({ id: 'brand', label: 'Brand preferences', description: 'Review GrowthAI writing preferences.' }),
]);
const ROUTER_SKILL_IDS = new Set(ROUTER_SKILLS.map(skill => skill.id));

function cleanString(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function exactKeys(value, allowed, required = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return required.every(key => keys.includes(key)) && keys.every(key => allowed.includes(key));
}

function normalizeRoutingRequest(body = {}) {
  if (!exactKeys(body, ['tenantId', 'message'], ['tenantId', 'message'])) {
    throw new GrowthAIGatewayError('The GrowthAI routing request is invalid.', { code: 'invalid_request' });
  }
  const tenantId = cleanString(body.tenantId, 128);
  const message = cleanString(body.message, MAX_MESSAGE_LENGTH + 1);
  if (!tenantId || tenantId === 'DEFAULT' || !message || message.length > MAX_MESSAGE_LENGTH) {
    throw new GrowthAIGatewayError('The GrowthAI routing request is invalid.', { code: 'invalid_request' });
  }
  // Do not send obvious pasted identifiers or contact details to the router.
  if (/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i.test(message) || /(?:\+?\d[\d .()-]{7,}\d)/.test(message) || /https?:\/\//i.test(message)) {
    throw new GrowthAIGatewayError('For privacy, choose a GrowthAI option instead of pasting customer details here.', { code: 'privacy_clarification' });
  }
  return { tenantId, message };
}

function routerPrompt(message) {
  const skills = ROUTER_SKILLS.map(skill => `- ${skill.id}: ${skill.label}. ${skill.description}`).join('\n');
  return {
    systemInstruction: [
      'Classify the owner request into exactly one listed GrowthAI skill.',
      'Return JSON only with exactly {"skillId":"...","confidence":0.0}.',
      'Never return an action, URL, code, identifiers, source references, or business data.',
      'Choose only a listed skill. Use confidence below 0.72 when clarification is safer.',
      'The router does not authorize sending, publishing, payments, scheduling, or record changes.',
      'Available skills:',
      skills,
    ].join('\n'),
    userPrompt: `Owner request:\n${message}`,
  };
}

function parseRouterResult(providerText) {
  const trimmed = cleanString(providerText, 1_100);
  const jsonText = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    : trimmed;
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new GrowthAIGatewayError('The GrowthAI router returned an invalid result.', { code: 'invalid_router_output', status: 502 });
  }
  if (!exactKeys(parsed, ['skillId', 'confidence'], ['skillId', 'confidence']) || !ROUTER_SKILL_IDS.has(parsed.skillId) ||
      typeof parsed.confidence !== 'number' || !Number.isFinite(parsed.confidence) || parsed.confidence < 0 || parsed.confidence > 1) {
    throw new GrowthAIGatewayError('The GrowthAI router returned an invalid result.', { code: 'invalid_router_output', status: 502 });
  }
  return { skillId: parsed.skillId, confidence: parsed.confidence };
}

async function routeGrowthAIConversation({ admin, provider, requestBody, uid }) {
  const request = normalizeRoutingRequest(requestBody);
  await verifyGrowthAIActor({ db: admin.firestore(), uid, tenantId: request.tenantId });
  const prompt = routerPrompt(request.message);
  const providerResult = validateProviderOutput(await provider.generateText({
    actionType: 'conversation_router',
    systemInstruction: prompt.systemInstruction,
    userPrompt: prompt.userPrompt,
  }), 1_024);
  return { success: true, ...parseRouterResult(providerResult.text) };
}

function applyCors(req, res) {
  const origin = req.headers?.origin;
  if (ALLOWED_ORIGINS.has(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
  }
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function createGrowthAIConversationRouterHandler({ admin, provider }) {
  return async (req, res) => {
    applyCors(req, res);
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed', code: 'method_not_allowed' });
    const authHeader = req.headers?.authorization || req.headers?.Authorization || '';
    if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required', code: 'unauthenticated' });
    let uid;
    try {
      uid = (await admin.auth().verifyIdToken(authHeader.slice('Bearer '.length).trim())).uid;
    } catch {
      return res.status(401).json({ error: 'Invalid authentication token', code: 'unauthenticated' });
    }
    try {
      return res.status(200).json(await routeGrowthAIConversation({ admin, provider, requestBody: req.body, uid }));
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : error instanceof GrowthAIProviderError ? 502 : 500;
      return res.status(status).json({
        error: status >= 500 ? 'GrowthAI routing is temporarily unavailable. Choose an option below.' : error.message,
        code: cleanString(error?.code, 64) || 'routing_failed',
      });
    }
  };
}

module.exports = {
  ROUTER_SKILLS,
  createGrowthAIConversationRouterHandler,
  normalizeRoutingRequest,
  parseRouterResult,
  routeGrowthAIConversation,
  routerPrompt,
};
