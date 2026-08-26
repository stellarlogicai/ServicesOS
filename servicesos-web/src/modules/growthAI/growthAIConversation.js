const INTENT_PATTERNS = Object.freeze({
  estimate_assistance: /\b(help me with (?:an |this )?estimate|review (?:an |this )?estimate|analy[sz]e (?:an |this )?estimate|estimate assistance|help price (?:this |a )?job)\b/i,
  marketing: /\b(marketing|make (?:me )?(?:a )?post|create (?:me )?(?:a )?post|facebook post|instagram post|social post)\b/i,
  customer_response: /\b(follow[ -]?up|respond to (?:a |the )?customer|customer response|help me (?:respond|reply)|reply to (?:a |the )?customer)\b/i,
  business_briefing: /\b(what should i work on(?: today)?|how is (?:the )?business looking today|what needs (?:my )?attention|give me (?:my |the )?business briefing|anything i should know about today)\b/i,
  opportunities: /\b(show (?:me )?(?:the )?opportunities|growth opportunities|anything i should review|review opportunities)\b/i,
  brand: /\b(brand preferences|brand settings|edit (?:my |the )?brand)\b/i,
  help: /\b(what can you do|what can you help me with|show me what growthai can do|capabilities|help)\b/i,
});

export const GROWTH_AI_CONVERSATION_LIMIT = 24;

export function routeGrowthAIIntent(input) {
  const normalized = typeof input === 'string' ? input.trim() : '';
  if (!normalized) return 'empty';
  if (INTENT_PATTERNS.estimate_assistance.test(normalized)) return 'estimate_assistance';
  if (INTENT_PATTERNS.marketing.test(normalized)) return 'marketing';
  if (INTENT_PATTERNS.customer_response.test(normalized)) return 'customer_response';
  if (INTENT_PATTERNS.business_briefing.test(normalized)) return 'business_briefing';
  if (INTENT_PATTERNS.opportunities.test(normalized)) return 'opportunities';
  if (INTENT_PATTERNS.brand.test(normalized)) return 'brand';
  if (INTENT_PATTERNS.help.test(normalized)) return 'help';
  return 'unknown';
}

export function appendBoundedGrowthAIMessages(current, additions) {
  return [...current, ...additions].slice(-GROWTH_AI_CONVERSATION_LIMIT);
}
