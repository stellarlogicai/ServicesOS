export const REVIEW_RESPONSE_TONES = Object.freeze([
  { id: 'positive', label: 'Positive' },
  { id: 'neutral_mixed', label: 'Neutral or mixed' },
  { id: 'sensitive_negative', label: 'Sensitive or negative' },
]);

export const MAX_OWNER_REVIEW_TEXT_LENGTH = 1200;

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function reviewResponseToneById(toneId) {
  return REVIEW_RESPONSE_TONES.find(item => item.id === toneId) || REVIEW_RESPONSE_TONES[0];
}

export function validateOwnerReviewText(value) {
  const reviewText = text(value);
  if (!reviewText) return 'Paste the review text before preparing a response.';
  if (reviewText.length > MAX_OWNER_REVIEW_TEXT_LENGTH) {
    return `Keep the pasted review to ${MAX_OWNER_REVIEW_TEXT_LENGTH} characters or fewer.`;
  }
  return '';
}

export function buildDeterministicReviewResponseDraft({ businessName, toneId }) {
  const tone = reviewResponseToneById(toneId);
  const messages = {
    positive: `Thank you for taking the time to share your feedback about ${businessName}. We appreciate it and hope to help again.`,
    neutral_mixed: `Thank you for sharing your feedback about ${businessName}. We appreciate your time and will keep it in mind as we continue serving customers.`,
    sensitive_negative: `Thank you for sharing this feedback about ${businessName}. We take concerns seriously and would welcome the chance to discuss it directly. Please contact us so we can review the details.`,
  };
  return {
    id: `review-response-${tone.id}`,
    pillar: 'reputation',
    actionType: 'review_response',
    title: `[Review response] ${tone.label}`,
    subjectLine: '',
    messageTemplate: messages[tone.id],
    notes: 'Draft only. Review before posting or sending manually. The pasted review text is not saved as a ServicesOS review record.',
    sourceRefs: {},
  };
}
