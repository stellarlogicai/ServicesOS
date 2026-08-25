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
    ['help me reply to a customer', 'customer_response'],
    ['what should I work on', 'opportunities'],
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
