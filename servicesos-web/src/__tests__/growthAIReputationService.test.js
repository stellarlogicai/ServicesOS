import { describe, expect, it } from 'vitest';
import {
  buildDeterministicReviewResponseDraft,
  MAX_OWNER_REVIEW_TEXT_LENGTH,
  validateOwnerReviewText,
} from '../modules/growthAI/growthAIReputationService';

describe('GrowthAI reputation response helpers', () => {
  it('keeps positive, neutral, and sensitive responses as review-required drafts without invented facts', () => {
    const positive = buildDeterministicReviewResponseDraft({ businessName: 'Test Cleaning', toneId: 'positive' });
    const neutral = buildDeterministicReviewResponseDraft({ businessName: 'Test Cleaning', toneId: 'neutral_mixed' });
    const sensitive = buildDeterministicReviewResponseDraft({ businessName: 'Test Cleaning', toneId: 'sensitive_negative' });

    expect(positive.messageTemplate).toContain('Thank you');
    expect(neutral.messageTemplate).toContain('feedback');
    expect(sensitive.messageTemplate).toContain('discuss it directly');
    expect(JSON.stringify([positive, neutral, sensitive])).not.toMatch(/refund|compensation|liability|employee|address|booking|payment/i);
    expect(sensitive).toMatchObject({ pillar: 'reputation', actionType: 'review_response', sourceRefs: {} });
  });

  it('requires bounded owner-pasted review text', () => {
    expect(validateOwnerReviewText('')).toMatch(/Paste the review text/);
    expect(validateOwnerReviewText('Helpful feedback.')).toBe('');
    expect(validateOwnerReviewText('x'.repeat(MAX_OWNER_REVIEW_TEXT_LENGTH + 1))).toMatch(/characters or fewer/);
  });
});
