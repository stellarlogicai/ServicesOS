import { describe, expect, it } from 'vitest';
import {
  appendBoundedGrowthAIMessages,
  GROWTH_AI_CONVERSATION_LIMIT,
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
    ['Follow up on this estimate.', 'customer_response'],
    ['Write a scheduling message.', 'customer_response'],
    ['Help explain this quote.', 'customer_response'],
    ['Answer a question about deep cleaning.', 'customer_response'],
    ['Write an apology message.', 'customer_response'],
    ['Ask this customer if they want to book again.', 'customer_response'],
    ['Ask this customer for a review.', 'customer_response'],
    ['Help me word this response.', 'customer_response'],
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
});
