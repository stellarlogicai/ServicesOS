import { describe, expect, it } from 'vitest';
import {
  appendBoundedGrowthAIMessages,
  getGrowthAISkill,
  GROWTH_AI_CONVERSATION_LIMIT,
  GROWTH_AI_SKILL_REGISTRY,
  normalizeGrowthAIRouterResult,
  routeGrowthAIConversation,
  routeGrowthAIIntent,
} from '../modules/growthAI/growthAIConversation';

describe('GrowthAI conversation routing', () => {
  it.each([
    ['help me with an estimate', 'estimate_assistance'],
    ['review this estimate', 'estimate_assistance'],
    ['analyze an estimate', 'estimate_assistance'],
    ['help price this job', 'estimate_assistance'],
    ['create a Facebook post', 'marketing'],
    ['Make me a post about deep cleaning.', 'marketing'],
    ['Give me something funny to post.', 'marketing'],
    ['Make a spring cleaning post.', 'marketing'],
    ['Create a cleaning tip post.', 'marketing'],
    ['Post that I have availability.', 'marketing'],
    ['Make something from this completed job.', 'marketing'],
    ['Help me promote move-out cleaning.', 'marketing'],
    ['help me reply to a customer', 'customer_response'],
    ['Follow up on this estimate.', 'estimate_assistance'],
    ['Write a scheduling message.', 'customer_response'],
    ['Help explain this quote.', 'customer_response'],
    ['Answer a question about deep cleaning.', 'customer_response'],
    ['Write an apology message.', 'customer_response'],
    ['Ask this customer if they want to book again.', 'customer_response'],
    ['Ask this customer for a review.', 'customer_response'],
    ['Help me respond to this review.', 'customer_response'],
    ['Write a response to this bad review.', 'customer_response'],
    ['Help me word this response.', 'customer_response'],
    ['Who should I try to rebook?', 'opportunities'],
    ['Who is due for another cleaning?', 'opportunities'],
    ['Any customers I should follow up with?', 'opportunities'],
    ["Who hasn't booked again?", 'opportunities'],
    ['Show me rebooking opportunities.', 'opportunities'],
    ['Who should I ask for a review?', 'opportunities'],
    ['Any customers I should request a review from?', 'opportunities'],
    ['what should I work on today?', 'business_briefing'],
    ['How is the business looking today?', 'business_briefing'],
    ['What needs my attention?', 'business_briefing'],
    ['Give me my business briefing.', 'business_briefing'],
    ['Anything I should know about today?', 'business_briefing'],
    ['show opportunities', 'opportunities'],
    ['edit my brand settings', 'brand'],
    ['what can you do?', 'help'],
    ['organize my filing cabinet', 'unknown'],
    ['   ', 'empty'],
  ])('routes %s to %s without an AI provider', (input, expected) => {
    expect(routeGrowthAIIntent(input)).toBe(expected);
  });

  it('keeps only the newest bounded session messages', () => {
    const messages = Array.from({ length: GROWTH_AI_CONVERSATION_LIMIT }, (_, index) => ({ id: `message-${index}` }));
    const next = appendBoundedGrowthAIMessages(messages, [{ id: 'new-a' }, { id: 'new-b' }]);

    expect(next).toHaveLength(GROWTH_AI_CONVERSATION_LIMIT);
    expect(next[0]).toEqual({ id: 'message-2' });
    expect(next.at(-1)).toEqual({ id: 'new-b' });
  });

  it('keeps the real V1 skill registry declarative and non-authorizing', () => {
    expect(GROWTH_AI_SKILL_REGISTRY.map(skill => skill.id)).toEqual([
      'business_briefing', 'estimate_assistance', 'marketing', 'customer_response',
      'retention', 'reputation', 'opportunities', 'brand',
    ]);
    expect(GROWTH_AI_SKILL_REGISTRY.every(skill => skill.externalAction === false)).toBe(true);
    expect(getGrowthAISkill('marketing')).toMatchObject({ workflowId: 'marketing', creditBehavior: 'explicit_generation_only' });
    expect(getGrowthAISkill('not-a-real-skill')).toBeNull();
  });

  it.each([
    ['What needs my attention today?', 'business_briefing'],
    ['Plan my posts this week.', 'marketing'],
    ['Help me follow up on this estimate.', 'estimate_assistance'],
    ['Who should I ask to book again?', 'retention'],
    ['Help me reply to this review.', 'reputation'],
    ['Create a Facebook post.', 'marketing'],
    ['Help me reply to this customer.', 'customer_response'],
  ])('returns a deterministic free fast-path for %s', (input, skillId) => {
    expect(routeGrowthAIConversation(input)).toMatchObject({ kind: 'route', skillId, source: 'deterministic' });
  });

  it('keeps a writing refinement in the active marketing workflow', () => {
    expect(routeGrowthAIConversation('Make it more professional.', { activeSkillId: 'marketing' }))
      .toEqual({ kind: 'contextual', skillId: 'marketing', workflowId: 'marketing', context: 'writing_refinement' });
  });

  it('uses only bounded visible opportunity context for the first-item follow-up', () => {
    expect(routeGrowthAIConversation('Help me with the first one.', { activeSkillId: 'business_briefing', hasVisibleOpportunity: true }))
      .toEqual({ kind: 'contextual', skillId: 'opportunities', workflowId: 'opportunities', context: 'first_opportunity' });
    expect(routeGrowthAIConversation('Help me with the first one.', { activeSkillId: 'business_briefing', hasVisibleOpportunity: false }))
      .toEqual({ kind: 'ambiguous' });
  });

  it('requires a registered, high-confidence router result', () => {
    expect(normalizeGrowthAIRouterResult({ skillId: 'marketing', confidence: 0.9 }))
      .toMatchObject({ kind: 'route', skillId: 'marketing', workflowId: 'marketing', source: 'provider' });
    expect(normalizeGrowthAIRouterResult({ skillId: 'delete_everything', confidence: 1 })).toBeNull();
    expect(normalizeGrowthAIRouterResult({ skillId: 'marketing', confidence: 0.2 })).toBeNull();
    expect(normalizeGrowthAIRouterResult({ skillId: 'marketing', confidence: 'high' })).toBeNull();
    expect(normalizeGrowthAIRouterResult({ action: 'send', skillId: 'marketing', confidence: 1 })).toBeNull();
  });
});
