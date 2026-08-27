const INTENT_PATTERNS = Object.freeze({
  estimate_assistance: /\b(help me with (?:an |this )?estimate|follow[ -]?up on (?:this |an )?(?:estimate|quote)|review (?:an |this )?estimate|analy[sz]e (?:an |this )?estimate|estimate assistance|help price (?:this |a )?job)\b/i,
  marketing: /\b(marketing|make (?:me )?(?:a )?post|create (?:me )?(?:a )?post|facebook post|instagram post|social post|promote|promotion|availability|spring cleaning|cleaning tip|funny(?: (?:cleaning|to))? post|completed job|before(?:\s|\/)after|move[ -]?out cleaning|plan (?:my )?posts?(?: for (?:this )?week)?|what should i post(?: this week)?)\b/i,
  customer_response: /\b(follow[ -]?up(?: on (?:this |an )?(?:estimate|quote))?|respond to (?:a |the )?customer|customer response|help me (?:respond|reply)|reply to (?:a |the )?customer|(?:write|draft) (?:an? )?(?:scheduling|rebooking|review(?:[ -]?request)?|apology) message|help explain (?:this |the )?(?:quote|estimate)|answer a question about|help me word (?:this |a )?response|ask this customer (?:if they want to book again|for a review))\b/i,
  retention: /\b(who should i (?:try to )?(?:rebook|ask to book again)|who is due for another cleaning|any customers i should follow up with|who hasn'?t booked again|show me rebooking opportunities)\b/i,
  reputation: /\b(help me (?:respond|reply) to (?:this |a )?(?:review|feedback)|write a (?:response|reply) to (?:this |a )?(?:bad )?review|review response|reply to (?:this |a )?review)\b/i,
  business_briefing: /\b(what should i work on(?: today)?|how is (?:the )?business looking today|what needs (?:my )?attention|give me (?:my |the )?business briefing|anything i should know about today)\b/i,
  opportunities: /\b(show (?:me )?(?:the )?opportunities|growth opportunities|anything i should review|review opportunities|who should i ask for a review|any customers i should request a review from)\b/i,
  brand: /\b(brand preferences|brand settings|edit (?:my |the )?brand)\b/i,
  help: /^\s*(?:what can you do|what can you help me with|show me what growthai can do|capabilities|help)\??\s*$/i,
});

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
  if (INTENT_PATTERNS.estimate_assistance.test(input)) return 'estimate_assistance';
  if (INTENT_PATTERNS.marketing.test(input)) return 'marketing';
  if (INTENT_PATTERNS.retention.test(input)) return 'retention';
  if (INTENT_PATTERNS.reputation.test(input)) return 'reputation';
  if (INTENT_PATTERNS.customer_response.test(input)) return 'customer_response';
  if (INTENT_PATTERNS.business_briefing.test(input)) return 'business_briefing';
  if (INTENT_PATTERNS.opportunities.test(input)) return 'opportunities';
  if (INTENT_PATTERNS.brand.test(input)) return 'brand';
  if (INTENT_PATTERNS.help.test(input)) return 'help';
  return null;
}

export function routeGrowthAIIntent(input) {
  const normalized = typeof input === 'string' ? input.trim() : '';
  if (!normalized) return 'empty';
  const skillId = deterministicSkillId(normalized);
  if (skillId === 'help') return 'help';
  if (skillId) return getGrowthAISkill(skillId).workflowId;
  return 'unknown';
}

export function routeGrowthAIConversation(input, { activeSkillId = '', hasVisibleOpportunity = false } = {}) {
  const normalized = typeof input === 'string' ? input.trim() : '';
  if (!normalized) return { kind: 'empty' };

  if (activeSkillId === 'marketing' && /\b(make|keep|rewrite|change|sound|tone|it)\b.*\b(more professional|professional|shorter|friendlier|warmer|clearer|formal)\b/i.test(normalized)) {
    return { kind: 'contextual', skillId: 'marketing', workflowId: 'marketing', context: 'writing_refinement' };
  }
  if (hasVisibleOpportunity && ['business_briefing', 'opportunities', 'retention'].includes(activeSkillId) && /\b(help me with|work on|show me)\b.*\b(first one|first opportunity|the first)\b/i.test(normalized)) {
    return { kind: 'contextual', skillId: 'opportunities', workflowId: 'opportunities', context: 'first_opportunity' };
  }

  const skillId = deterministicSkillId(normalized);
  if (skillId === 'help') return { kind: 'help' };
  if (skillId) return { kind: 'route', skillId, workflowId: getGrowthAISkill(skillId).workflowId, source: 'deterministic' };
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
