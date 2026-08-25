const INTENT_PATTERNS = Object.freeze({
  marketing: /\b(marketing|make (?:me )?(?:a )?post|create (?:me )?(?:a )?post|facebook post|instagram post|social post)\b/i,
  customer_response: /\b(follow[ -]?up|respond to (?:a |the )?customer|customer response|help me (?:respond|reply)|reply to (?:a |the )?customer)\b/i,
  opportunities: /\b(show (?:me )?(?:the )?opportunities|growth opportunities|what needs attention|what should i work on|anything i should review|review opportunities)\b/i,
  brand: /\b(brand preferences|brand settings|edit (?:my |the )?brand)\b/i,
  help: /\b(what can you do|what can you help me with|show me what growthai can do|capabilities|help)\b/i,
});

export const GROWTH_AI_CONVERSATION_LIMIT = 24;

export function routeGrowthAIIntent(input) {
  const normalized = typeof input === 'string' ? input.trim() : '';
  if (!normalized) return 'empty';
  if (INTENT_PATTERNS.marketing.test(normalized)) return 'marketing';
  if (INTENT_PATTERNS.customer_response.test(normalized)) return 'customer_response';
  if (INTENT_PATTERNS.opportunities.test(normalized)) return 'opportunities';
  if (INTENT_PATTERNS.brand.test(normalized)) return 'brand';
  if (INTENT_PATTERNS.help.test(normalized)) return 'help';
  return 'unknown';
}

export function appendBoundedGrowthAIMessages(current, additions) {
  return [...current, ...additions].slice(-GROWTH_AI_CONVERSATION_LIMIT);
}
