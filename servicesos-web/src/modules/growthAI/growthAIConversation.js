import { resolveOwnerVocabulary, resolveOwnerContextRequest } from './growthAIOwnerVocabulary';

export const GROWTH_AI_CONVERSATION_LIMIT = 24;
export const GROWTH_AI_ROUTER_CONFIDENCE_THRESHOLD = 0.72;

// This is intentionally a small, local allowlist. A route only opens an
// existing workflow; it never grants permission or carries out an action.
export const GROWTH_AI_SKILL_REGISTRY = Object.freeze([
  Object.freeze({
    id: 'business_briefing',
    workflowId: 'business_briefing',
    label: "Today's business briefing",
    description: 'Review deterministic work and growth priorities for today.',
    routing: 'deterministic',
    creditBehavior: 'free',
    producesDraft: false,
    externalAction: false,
  }),
  Object.freeze({
    id: 'estimate_assistance',
    workflowId: 'estimate_assistance',
    label: 'Estimate assistance',
    description: 'Review saved estimate pricing and optionally request an advisory draft.',
    routing: 'deterministic',
    creditBehavior: 'explicit_generation_only',
    producesDraft: true,
    externalAction: false,
  }),
  Object.freeze({
    id: 'marketing',
    workflowId: 'marketing',
    label: 'Marketing and content planning',
    description: 'Plan or prepare a marketing draft for owner review.',
    routing: 'deterministic',
    creditBehavior: 'explicit_generation_only',
    producesDraft: true,
    externalAction: false,
  }),
  Object.freeze({
    id: 'customer_response',
    workflowId: 'customer_response',
    label: 'Customer communication',
    description: 'Prepare a private customer message or response for human review.',
    routing: 'deterministic',
    creditBehavior: 'explicit_generation_only',
    producesDraft: true,
    externalAction: false,
  }),
  Object.freeze({
    id: 'retention',
    workflowId: 'opportunities',
    label: 'Retention and rebooking',
    description: 'Review deterministic rebooking opportunities before preparing a draft.',
    routing: 'deterministic',
    creditBehavior: 'free',
    producesDraft: false,
    externalAction: false,
  }),
  Object.freeze({
    id: 'reputation',
    workflowId: 'customer_response',
    label: 'Reputation response',
    description: 'Prepare a review response for human review. Nothing is posted automatically.',
    routing: 'deterministic',
    creditBehavior: 'explicit_generation_only',
    producesDraft: true,
    externalAction: false,
  }),
  Object.freeze({
    id: 'opportunities',
    workflowId: 'opportunities',
    label: 'Growth opportunities',
    description: 'Review current deterministic GrowthAI opportunities.',
    routing: 'deterministic',
    creditBehavior: 'free',
    producesDraft: false,
    externalAction: false,
  }),
  Object.freeze({
    id: 'brand',
    workflowId: 'brand',
    label: 'Brand preferences',
    description: 'Review GrowthAI writing preferences without changing business facts.',
    routing: 'deterministic',
    creditBehavior: 'free',
    producesDraft: false,
    externalAction: false,
  }),
]);

const SKILLS_BY_ID = new Map(GROWTH_AI_SKILL_REGISTRY.map(skill => [skill.id, skill]));

export function getGrowthAISkill(skillId) {
  return SKILLS_BY_ID.get(skillId) || null;
}

export function getGrowthAISkillForWorkflow(workflowId) {
  return GROWTH_AI_SKILL_REGISTRY.find(skill => skill.workflowId === workflowId) || null;
}

function deterministicSkillId(input) {
  const result = resolveOwnerVocabulary(input);
  return result.kind === 'match' ? result.intent.skillId || result.intent.id : null;
}

export function routeGrowthAIIntent(input) {
  const normalized = typeof input === 'string' ? input.trim() : '';
  if (!normalized) return 'empty';
  const skillId = deterministicSkillId(normalized);
  if (skillId === 'help') return 'help';
  if (skillId) return getGrowthAISkill(skillId)?.workflowId || skillId;
  return 'unknown';
}

export function routeGrowthAIConversation(input, { activeSkillId = '', hasVisibleOpportunity = false } = {}) {
  const normalized = typeof input === 'string' ? input.trim() : '';
  if (!normalized) return { kind: 'empty' };

  const contextRequest = resolveOwnerContextRequest(normalized);
  if (contextRequest) return { kind: 'owner_context', request: contextRequest };

  const vocabulary = resolveOwnerVocabulary(normalized);
  if (vocabulary.kind === 'clarify') return vocabulary;
  if (vocabulary.kind === 'match') {
    const { intent, timeContext } = vocabulary;
    if (intent.id === 'help') return { kind: 'help' };
    if (['drafts', 'activity'].includes(intent.id)) return { kind: 'navigate', view: intent.id };
    if (['credits', 'upcoming_bookings'].includes(intent.id)) return { kind: 'information', intentId: intent.id };
    return { kind: 'route', skillId: intent.skillId, workflowId: getGrowthAISkill(intent.skillId).workflowId,
      source: 'deterministic', category: intent.category, timeContext, filter: intent.filter };
  }

  if (activeSkillId === 'marketing' && /\b(make|keep|rewrite|change|sound|tone|it)\b.*\b(more professional|professional|shorter|friendlier|warmer|clearer|formal)\b/i.test(normalized)) {
    return { kind: 'contextual', skillId: 'marketing', workflowId: 'marketing', context: 'writing_refinement' };
  }
  if (hasVisibleOpportunity && ['business_briefing', 'opportunities', 'retention'].includes(activeSkillId) && /\b(help me with|work on|show me)\b.*\b(first one|first opportunity|the first)\b/i.test(normalized)) {
    return { kind: 'contextual', skillId: 'opportunities', workflowId: 'opportunities', context: 'first_opportunity' };
  }

  return { kind: 'ambiguous' };
}

export function normalizeGrowthAIRouterResult(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (Object.keys(value).some(key => key !== 'skillId' && key !== 'confidence')) return null;
  const skill = getGrowthAISkill(value.skillId);
  const confidence = value.confidence;
  if (!skill || typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < GROWTH_AI_ROUTER_CONFIDENCE_THRESHOLD || confidence > 1) {
    return null;
  }
  return { kind: 'route', skillId: skill.id, workflowId: skill.workflowId, confidence, source: 'provider' };
}

export function appendBoundedGrowthAIMessages(current, additions) {
  return [...current, ...additions].slice(-GROWTH_AI_CONVERSATION_LIMIT);
}
