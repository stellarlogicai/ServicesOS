import { describe, expect, it } from 'vitest';
import { buildOwnerContext, resolveOwnerContext } from '../modules/growthAI/growthAIOwnerContext';
import { resolveOwnerContextRequest } from '../modules/growthAI/growthAIOwnerVocabulary';
import { answerBusinessQuestion, formatBusinessAnswer } from '../modules/growthAI/growthAIBusinessIntelligence';
import { routeGrowthAIConversation } from '../modules/growthAI/growthAIConversation';

const now = new Date('2026-10-04T12:00:00Z');
const fixture = () => buildOwnerContext({ tenantId: 'audit', authorized: true, ready: true, catalogReady: true,
  timeZone: 'America/Chicago', now,
  bookings: ['A', 'B'].map((n, i) => ({ id: `job-${n}`, tenantId: 'audit', customerId: `person-${n}`,
    customerName: `Synthetic ${n}`, status: i ? 'confirmed' : 'scheduled', serviceType: i ? 'deep' : 'standard',
    agreedPrice: i ? 222.22 : 111.11, date: i ? '2026-10-06' : '2026-10-05', startTime: i ? '13:00' : '10:00', leadId: `estimate-${n}` })),
  leads: ['A', 'B'].map((n, i) => ({ id: `estimate-${n}`, tenantId: 'audit', customerId: `person-${n}`,
    customerName: `Synthetic ${n}`, status: 'quoted', createdAt: i ? '2026-10-03T05:30:00Z' : '2026-10-02T05:30:00Z',
    estimate: { priceLow: i ? 220 : 110, priceHigh: i ? 240 : 130 }, requestSnapshot: { cleaningType: i ? 'deep' : 'standard' } })),
});
const legacy = (input, data, context) => resolveOwnerContext(resolveOwnerContextRequest(input), data, context, { now });
const selected = (data, id) => ({ tenantId: data.tenantId, list: data.bookings.map(b => ({ type: 'booking', id: b.id })),
  selected: { type: 'booking', id } });
const questions = [
  ['summary', 'Tell me about Synthetic B for that job?', /Synthetic B: Deep Cleaning/],
  ['history', 'Has Synthetic B used us before for that job?', /0 completed bookings/],
  ['estimate date', "When was Synthetic B's estimate created for that job?", /Created 10\/3\/2026/],
  ['price', 'How much is Synthetic B paying for that job?', /\$222\.22/],
  ['service', 'What service is Synthetic B getting for that job?', /Deep Cleaning/],
  ['quote', 'What did we quote Synthetic B for that job?', /\$220\.00 to \$240\.00/],
];

describe('freeze-blocker shared customer/booking integrity', () => {
  it.each([
    'When is that appointment for Synthetic B?',
    'What service is that job for Synthetic B?',
    'What is the status of that job for Synthetic B?',
    'How much is that job for Synthetic B?',
    'How many times has Synthetic B booked for that job?',
    'When did we last work with Synthetic B for that job?',
    'What are we charging Synthetic B for that job?',
    "What time is Synthetic B's appointment for that job?",
  ])('does not discard a named suffix in legacy factual wording: %s', input => {
    const data = fixture(); const context = selected(data, 'job-A');
    if (input.startsWith('When did')) expect(resolveOwnerContextRequest(input)).toMatchObject({ domain: 'history', explicitName: 'synthetic b', reference: { kind: 'current' } });
    const result = legacy(input, data, context);
    expect(result.kind).toBe('clarify');
    expect(result.content).not.toMatch(/111\.11|10:00|Standard Cleaning/);
    const modern = answerBusinessQuestion(input, data, context, { now });
    expect(['needs_clarification', 'unsupported']).toContain(modern.status);
  });
  it.each(questions)('clarifies %s conflict in both factual paths', (_field, input) => {
    const data = fixture(); const before = JSON.stringify(data); const context = selected(data, 'job-A');
    const old = legacy(input, data, context);
    expect(old.kind).toBe('clarify'); expect(old.content).not.toMatch(/111\.11|10:00|Created|completed bookings are/);
    const modern = answerBusinessQuestion(input, data, context, { now });
    expect(['needs_clarification', 'unsupported']).toContain(modern.status);
    if (modern.status === 'unsupported') expect(routeGrowthAIConversation(input).kind).toBe('owner_context');
    expect(JSON.stringify(data)).toBe(before);
  });
  it.each([
    ['What are we charging Synthetic B?', /\$222\.22/],
    ["What time is Synthetic B's appointment?", /2026-10-06 at 13:00/],
    ['How many times has Synthetic B booked?', /0 completed bookings/],
    ['When did we last work with Synthetic B?', /0 completed bookings/],
  ])('retains independent explicit-customer wording: %s', (input, expected) => {
    const data = fixture(); const context = selected(data, 'job-A');
    const result = legacy(input, data, context);
    expect(result.content).toMatch(expected);
    expect(result.context.selected.id).toBe('job-B');
    const modern = answerBusinessQuestion(input, data, context, { now });
    if (modern.status !== 'unsupported') {
      expect(modern.status).toBe('answerable');
      expect(formatBusinessAnswer(modern)).toMatch(expected);
    }
  });
  it.each(questions)('answers coherent %s with the intended field', (_field, input, expected) => {
    const data = fixture(); const context = selected(data, 'job-B');
    expect(legacy(input, data, context).content).toMatch(expected);
    const modern = answerBusinessQuestion(input, data, context, { now });
    if (modern.status !== 'unsupported') { expect(modern.status).toBe('answerable'); expect(formatBusinessAnswer(modern)).toMatch(expected); }
  });
  it.each(questions)('refuses stale/foreign/reset/suspended %s references', (_field, input) => {
    const data = fixture(); const b = selected(data, 'job-B');
    for (const context of [{}, { ...b, tenantId: 'foreign' }, { ...b, selected: { type: 'booking', id: 'removed' } }, { ...b, suspended: true }]) {
      expect(legacy(input, data, context).kind).toBe('clarify');
      expect(['needs_clarification', 'unsupported']).toContain(answerBusinessQuestion(input, data, context, { now }).status);
    }
  });
  it.each(questions)('refuses ambiguous or missing canonical customer for %s', (_field, input) => {
    const data = fixture(); const b = selected(data, 'job-B');
    data.bookings.push({ ...data.bookings[1], id: 'ambiguous', customerId: 'different' });
    expect(legacy(input, data, b).kind).toBe('clarify');
    data.bookings.pop(); data.bookings[1].customerId = '';
    expect(legacy(input, data, b).kind).toBe('clarify');
  });
  it('retains independent explicit quotes and does not substitute appointment evidence for estimate creation', () => {
    const data = fixture(); const a = selected(data, 'job-A'); const b = selected(data, 'job-B');
    expect(legacy('What did we quote Synthetic B?', data, a).content).toContain('$220.00 to $240.00');
    for (const alteration of ['missing', 'wrong customer', 'missing creation']) {
      const changed = fixture();
      if (alteration === 'missing') changed.estimates = [];
      if (alteration === 'wrong customer') changed.estimates[1].customerId = 'person-A';
      if (alteration === 'missing creation') changed.estimates[1].createdMillis = null;
      const answer = legacy("When was Synthetic B's estimate created for that job?", changed, b);
      expect(answer.content).not.toMatch(/10:00|13:00|2026-10-06/);
      expect(answer.kind === 'clarify' || /unavailable/.test(answer.content)).toBe(true);
    }
  });
  it('retains explicit history identity without a contextual booking dependency', () => {
    const data = fixture(); data.bookings.push({ ...data.bookings[0], id: 'past-A', completed: true, upcoming: false });
    expect(legacy('Has Synthetic B used us before?', data, selected(data, 'job-A')).content).toContain('0 completed bookings');
    expect(legacy('Has Synthetic A used us before for that job?', data, selected(data, 'job-A')).content).toContain('1 completed bookings');
  });
  it('preserves the named customer when estimate creation uses an explicit suffix', () => {
    const data = fixture(); const input = 'When was that estimate created for Synthetic B?';
    const a = { tenantId: 'audit', selected: { type: 'estimate', id: 'estimate-A' }, list: [{ type: 'estimate', id: 'estimate-A' }] };
    expect(legacy(input, data, a).kind).toBe('clarify');
    const b = { ...a, selected: { type: 'estimate', id: 'estimate-B' }, list: [{ type: 'estimate', id: 'estimate-B' }] };
    expect(legacy(input, data, b).content).toBe('Created 10/3/2026.');
  });
  it.each(questions)('retains identity and booking dependency in interpreted %s slots', (_field, input) => {
    const request = resolveOwnerContextRequest(input);
    expect(request.explicitName).toBe('synthetic b'); expect(request.reference).toEqual({ kind: 'current' });
  });
  it('rejects sub-cent saved booking amounts rather than rounding or substituting price', () => {
    const data = buildOwnerContext({ tenantId: 'audit', authorized: true, ready: true, timeZone: 'UTC', now,
      bookings: [{ id: 'job-A', tenantId: 'audit', customerId: 'person-A', customerName: 'Synthetic A',
        status: 'scheduled', date: '2026-10-05', startTime: '10:00', agreedPrice: 111.111, price: 50 }] });
    const input = 'How much are we charging Synthetic A?';
    expect(legacy(input, data, {}).content).toMatch(/unavailable/);
    expect(legacy(input, data, {}).content).not.toMatch(/111\.11|50\.00/);
    expect(answerBusinessQuestion(input, data, {}, { now }).status).toBe('insufficient_evidence');
  });
});
