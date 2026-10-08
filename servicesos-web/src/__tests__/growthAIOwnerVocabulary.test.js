import { describe, expect, it } from 'vitest';
import { OWNER_VOCABULARY, resolveOwnerVocabulary, resolveOwnerContextRequest } from '../modules/growthAI/growthAIOwnerVocabulary';
import { routeGrowthAIConversation } from '../modules/growthAI/growthAIConversation';

const positiveCases = OWNER_VOCABULARY.flatMap(intent => intent.examples.map(input => [input, intent.id]));
const safeCases = [
  "What's coming up in my personal life?", 'Cancel my upcoming jobs',
  'Refund this customer', 'Delete my drafts', 'Charge Sarah',
  'Can you handle Sarah?', 'Take care of my customers.', 'Help with my bookings.',
  'Did anyone pay yet?', 'Show me recent customers',
  'How many upcoming jobs do I have tomorrow?', 'How many upcoming bookings next week?',
  'Who needs a follow-up last week?', 'What needs attention next month?',
  'Create a Facebook post and write a customer message',
  'Review this estimate and create a marketing post',
  'Show me my drafts and create a Facebook post',
  'Do I have any upcoming jobs? Cancel them.',
  'Do not create a marketing post', "Don't write a customer message", 'Never send Sarah a text',
  'Do not open drafts', 'Do not show me my activity', 'Do not edit brand settings',
  'Do not review this estimate', 'Do not show rebooking opportunities',
  'Do not give me a business briefing', 'Do not show me my credits',
  'Do not count upcoming bookings', 'Do not help me reply to this review',
];
const negativeCases = [
  ['Who should I follow up with?', 'customer_response'],
  ['Should I follow up with Sarah?', 'customer_response'],
  ['Are there customers I should follow up with?', 'customer_response'],
  ['Write a follow-up message for Sarah.', 'followup_review'],
  ['Send Sarah a message.', 'followup_review'],
  ['How are my reviews doing?', 'reputation'],
  ['Help me reply to this review.', 'opportunities'],
  ["What's on the books?", 'marketing'],
  ['What needs my attention?', 'customer_response'],
];

describe('SLAI owner vocabulary corpus', () => {
  it('retains explicit contact-info identity without changing clean or pronoun semantics', () => {
    const input = "What is Synthetic B's contact info for that job?";
    expect(resolveOwnerContextRequest(input)).toMatchObject({ domain: 'contact', explicitName: 'synthetic b', contactField: 'phone', reference: { kind: 'current' } });
    expect(routeGrowthAIConversation(input)).toMatchObject({ kind: 'owner_context', request: { explicitName: 'synthetic b', contactField: 'phone' } });
    expect(resolveOwnerContextRequest("What is Synthetic B's contact info?")).toMatchObject({ domain: 'contact', explicitName: 'synthetic b', contactField: null });
    expect(resolveOwnerContextRequest('What is their contact info for that job?')).toMatchObject({ domain: 'detail' });
    expect(resolveOwnerContextRequest('What is their contact info for that job?').explicitName).toBeUndefined();
    expect(resolveOwnerContextRequest("Do not show Synthetic B's contact info for that job")).toBeNull();
    expect(resolveOwnerContextRequest("What is Synthetic B's contact info for that job and delete it?")).toBeNull();
  });
  it('retains explicit email identity and contextual booking while preserving clean and pronoun requests', () => {
    const input = "What is Synthetic B's email address for that job?";
    expect(resolveOwnerContextRequest(input)).toMatchObject({ domain: 'contact', explicitName: 'synthetic b', contactField: 'email', reference: { kind: 'current' } });
    expect(routeGrowthAIConversation(input)).toMatchObject({ kind: 'owner_context', request: { explicitName: 'synthetic b', contactField: 'email' } });
    const clean = resolveOwnerContextRequest("What is Synthetic B's email address?");
    expect(clean).toMatchObject({ domain: 'contact', explicitName: 'synthetic b', contactField: 'email' });
    expect(clean.reference).toBeUndefined();
    expect(resolveOwnerContextRequest('What is their email address for that job?').explicitName).toBeUndefined();
    expect(resolveOwnerContextRequest("Do not show Synthetic B's email address for that job")).toBeNull();
    expect(resolveOwnerContextRequest("What is Synthetic B's email address for that job and delete it?")).toBeNull();
  });
  it('retains explicit phone identity and contextual booking without redesigning clean contact lookup', () => {
    const input = "What is Synthetic B's phone number for that job?";
    expect(resolveOwnerContextRequest(input)).toMatchObject({ domain: 'contact', explicitName: 'synthetic b', contactField: 'phone', reference: { kind: 'current' } });
    expect(routeGrowthAIConversation(input)).toMatchObject({ kind: 'owner_context', request: { explicitName: 'synthetic b', contactField: 'phone' } });
    const clean = resolveOwnerContextRequest("What is Synthetic B's phone number?");
    expect(clean).toMatchObject({ domain: 'contact', explicitName: 'synthetic b', contactField: 'phone' });
    expect(clean.reference).toBeUndefined();
    expect(resolveOwnerContextRequest('What is their phone number for that job?').explicitName).toBeUndefined();
    expect(resolveOwnerContextRequest("Do not show Synthetic B's phone number for that job")).toBeNull();
    expect(resolveOwnerContextRequest("What is Synthetic B's phone number for that job and delete it?")).toBeNull();
  });
  it.each(['', ' for that job'])('preserves explicit customer in service lookup%s', suffix => {
    const input = `What is Synthetic B's service${suffix}?`;
    expect(resolveOwnerContextRequest(input)).toMatchObject({ domain: 'service', explicitName: 'synthetic b', reference: { kind: suffix ? 'current' : 'none' } });
    expect(routeGrowthAIConversation(input)).toMatchObject({ kind: 'owner_context', request: { domain: 'service', explicitName: 'synthetic b' } });
  });
  it('keeps service pronouns contextual and rejects mixed or negated mutations', () => {
    expect(resolveOwnerContextRequest('What is their service for that job?').explicitName).toBeUndefined();
    expect(resolveOwnerContextRequest("Do not show Synthetic B's service for that job")).toBeNull();
    expect(resolveOwnerContextRequest("What is Synthetic B's service for that job and delete it?")).toBeNull();
  });
  it.each(['When is', 'What is'])('retains explicit appointment identity for %s', opening => {
    const input = `${opening} Synthetic B's appointment for that job?`;
    expect(resolveOwnerContextRequest(input)).toMatchObject({ domain: 'date', explicitName: 'synthetic b', reference: { kind: 'current' } });
    expect(routeGrowthAIConversation(input)).toMatchObject({ kind: 'owner_context', request: { explicitName: 'synthetic b', domain: 'date' } });
    expect(resolveOwnerContextRequest(`${opening} Synthetic B's appointment?`)).toMatchObject({ explicitName: 'synthetic b', reference: { kind: 'none' } });
  });
  it('keeps appointment pronouns contextual and refuses negated/mixed actions', () => {
    expect(resolveOwnerContextRequest('When is their appointment for that job?')).toMatchObject({ domain: 'date' });
    expect(resolveOwnerContextRequest('When is their appointment for that job?').explicitName).toBeUndefined();
    expect(resolveOwnerContextRequest("Do not show Synthetic B's appointment for that job")).toBeNull();
    expect(resolveOwnerContextRequest("When is Synthetic B's appointment for that job and delete it?")).toBeNull();
  });
  it.each(['that job', 'that booking', 'that appointment', 'their job'])('preserves explicit customer and status for %s', reference => {
    const input = `What's Synthetic B's status for ${reference}?`;
    expect(resolveOwnerContextRequest(input)).toMatchObject({ domain: 'status', explicitName: 'synthetic b', reference: { kind: 'current' } });
    expect(routeGrowthAIConversation(input)).toMatchObject({ kind: 'owner_context', request: { explicitName: 'synthetic b', domain: 'status' } });
  });
  it('distinguishes explicit status from pronoun-only status and rejects mixed actions', () => {
    expect(resolveOwnerContextRequest("What's Synthetic B's status?")).toMatchObject({ explicitName: 'synthetic b', reference: { kind: 'none' } });
    expect(resolveOwnerContextRequest("What's their status for that job?")).toMatchObject({ domain: 'status' });
    expect(resolveOwnerContextRequest("What's their status for that job?").explicitName).toBeUndefined();
    expect(resolveOwnerContextRequest("What's Synthetic B's status for that job and delete it?")).toBeNull();
  });
  it.each(['What did we quote Synthetic B for that job?', 'How much did I quote Synthetic B for that booking?'])('preserves the explicit quote customer: %s', input => {
    expect(resolveOwnerContextRequest(input)).toMatchObject({ domain: 'quote', explicitName: 'synthetic b' });
    expect(routeGrowthAIConversation(input)).toMatchObject({ kind: 'owner_context', request: { explicitName: 'synthetic b' } });
  });
  it.each(['What did we quote them for that job?', 'What did we quote them?', 'How much did I quote her?'])('keeps contextual quote references: %s', input => {
    const request = resolveOwnerContextRequest(input);
    expect(request.domain).toBe('quote');
    expect(request.explicitName).toBeUndefined();
  });
  it('marks opaque quote wording ambiguous rather than losing an explicit customer', () => {
    expect(resolveOwnerContextRequest('How much was Synthetic B quoted for that job?')).toMatchObject({ domain: 'quote', ambiguous: true });
  });
  it.each([
    "What's on my plate?", "Who's coming in next?", 'Anybody I need to get back with?',
    "What's still sitting out there?", "Who's waiting on an estimate?",
    'What do I need to take care of today?', 'Anything falling through the cracks?',
  ])('does not interpret negated or mixed-action repair wording: %s', input => {
    expect(resolveOwnerContextRequest(`Do not ${input}`)).toBeNull();
    expect(routeGrowthAIConversation(`Do not ${input}`).kind).toBe('clarify');
    expect(resolveOwnerContextRequest(`${input} and delete the booking`)).toBeNull();
    expect(routeGrowthAIConversation(`${input} and delete the booking`).kind).toBe('clarify');
  });
  it.each(positiveCases)('%s belongs to %s', (input, id) => {
    expect(resolveOwnerVocabulary(input)).toMatchObject({ kind: 'match', intent: { id } });
  });
  it.each(safeCases)('requires local clarification for %s', input => {
    expect(routeGrowthAIConversation(input).kind).toBe('clarify');
  });
  it.each(negativeCases)('%s does not collide with %s', (input, id) => {
    expect(resolveOwnerVocabulary(input).intent?.id).not.toBe(id);
  });
  it('normalizes curly contractions without interpreting an unknown capability', () => {
    expect(resolveOwnerVocabulary('Who hasn’t booked again?').intent.id).toBe('retention');
    expect(resolveOwnerVocabulary('Organize my filing cabinet').kind).toBe('unmatched');
  });
  it('retains time context without inventing time-filtered business data', () => {
    expect(resolveOwnerVocabulary('Plan my posts next week.')).toMatchObject({ timeContext: 'next week' });
    expect(resolveOwnerVocabulary('What should I work on today?')).toMatchObject({ timeContext: 'today' });
  });
});
