import { describe, expect, it } from 'vitest';
import { answerBusinessQuestion, buildBusinessCapabilityPlan, formatBusinessAnswer } from '../modules/growthAI/growthAIBusinessIntelligence';
import { BUSINESS_EVIDENCE_PRIORITY, gateBusinessEvidence } from '../modules/growthAI/growthAIBusinessEvidence';
import { buildOwnerContext, resolveOwnerContext } from '../modules/growthAI/growthAIOwnerContext';

const now = new Date('2026-10-04T05:00:00Z');
const packet = overrides => buildOwnerContext({ tenantId: 'a', authorized: true, ready: true, catalogReady: true, timeZone: 'America/Chicago', now,
  bookings: [
    { id: 'john-job', tenantId: 'a', customerId: 'john-id', customerName: 'John', status: 'scheduled', date: '2026-10-05', startTime: '09:00',
      serviceType: 'standard', agreedPrice: 180, customerSnapshot: { phone: '555-0110' } },
    { id: 'sarah-job', tenantId: 'a', customerId: 'sarah-id', customerName: 'Sarah', status: 'scheduled', date: '2026-10-05', startTime: '10:00',
      serviceType: 'deep', agreedPrice: 250, customerSnapshot: { phone: '555-0111' } },
    { id: 'foreign-job', tenantId: 'b', customerId: 'foreign-id', customerName: 'Sarah', status: 'scheduled', date: '2026-10-05', agreedPrice: 999 },
  ], services: [
    { id: 'standard', name: 'Standard', serviceType: 'standard', active: true, priceCents: 10000, durationMinutes: 90 },
    { id: 'deep', name: 'Canonical Deep', serviceType: 'deep', active: true, priceCents: 15000, durationMinutes: 120 },
  ], ...overrides });
const ask = (message, data = packet(), session = {}) => answerBusinessQuestion(message, data, session, { now });
const selected = data => ask("Who's next?", data).context;

describe('deterministic canonical evidence gate', () => {
  it('rejects wrong-customer contact-info operands, conflicting context and substituted values', () => {
    const data = packet(); const a = selected(data);
    const plan = buildBusinessCapabilityPlan("What is Sarah's contact info for that job?").plan;
    const john = ask('What is their contact info for that job?', data, a);
    expect(gateBusinessEvidence({ ...john, plan }, data, a).confidence.reason).toBe('explicit_customer_mismatch');
    const sarah = ask("What is Sarah's contact info?", data, a);
    expect(gateBusinessEvidence({ ...sarah, plan }, data, a).confidence.reason).toBe('explicit_context_conflict');
    const coherent = ask("What is Sarah's contact info for that job?", data, sarah.context);
    expect(coherent.confidence.state).toBe('sufficient');
    expect(coherent.evidenceDescriptors).toContainEqual(expect.objectContaining({ field: 'phone', value: '555-0111', reference: { type: 'booking', id: 'sarah-job' } }));
    expect(gateBusinessEvidence({ ...coherent, value: john.value }, data, sarah.context).confidence.reason).toBe('field_output_mismatch');
    expect(gateBusinessEvidence(coherent, data, { ...sarah.context, tenantId: 'other' }).status).not.toBe('answerable');
  });
  it('rejects substituted email identity, conflicting booking and forged email values independently', () => {
    const data = packet(); data.bookings[0].contact.email = 'a@example.test'; data.bookings[1].contact.email = 'b@example.test';
    const a = selected(data); const plan = buildBusinessCapabilityPlan("What is Sarah's email address for that job?").plan;
    const john = ask('What is their email address for that job?', data, a);
    expect(gateBusinessEvidence({ ...john, plan }, data, a).confidence.reason).toBe('explicit_customer_mismatch');
    const sarah = ask("What is Sarah's email address?", data, a);
    expect(gateBusinessEvidence({ ...sarah, plan }, data, a).confidence.reason).toBe('explicit_context_conflict');
    const coherent = ask("What is Sarah's email address for that job?", data, sarah.context);
    expect(coherent.confidence.state).toBe('sufficient');
    expect(coherent.evidenceDescriptors).toContainEqual(expect.objectContaining({ field: 'email', value: 'b@example.test', reference: { type: 'booking', id: 'sarah-job' } }));
    expect(gateBusinessEvidence({ ...coherent, value: john.value }, data, sarah.context).confidence.reason).toBe('field_output_mismatch');
    expect(gateBusinessEvidence(coherent, data, { ...sarah.context, tenantId: 'other' }).status).not.toBe('answerable');
  });
  it('rejects substituted phone identity, conflicting booking and forged phone values independently', () => {
    const data = packet(); const a = selected(data);
    const plan = buildBusinessCapabilityPlan("What is Sarah's phone number for that job?").plan;
    const john = ask('What is their phone number for that job?', data, a);
    expect(gateBusinessEvidence({ ...john, plan }, data, a).confidence.reason).toBe('explicit_customer_mismatch');
    const sarah = ask("What is Sarah's phone number?", data, a);
    expect(gateBusinessEvidence({ ...sarah, plan }, data, a).confidence.reason).toBe('explicit_context_conflict');
    const coherent = ask("What is Sarah's phone number for that job?", data, sarah.context);
    expect(coherent.confidence.state).toBe('sufficient');
    expect(coherent.evidenceDescriptors).toContainEqual(expect.objectContaining({ field: 'phone', value: '555-0111', reference: { type: 'booking', id: 'sarah-job' } }));
    expect(gateBusinessEvidence({ ...coherent, value: john.value }, data, sarah.context).confidence.reason).toBe('field_output_mismatch');
    expect(gateBusinessEvidence(coherent, data, { ...sarah.context, tenantId: 'other' }).status).not.toBe('answerable');
  });
  it('rejects wrong-customer service operands, conflicting context and substituted service output', () => {
    const data = packet(); const a = selected(data);
    const plan = buildBusinessCapabilityPlan("What is Sarah's service for that job?").plan;
    const john = ask('What is their service for that job?', data, a);
    expect(gateBusinessEvidence({ ...john, plan }, data, a).confidence.reason).toBe('explicit_customer_mismatch');
    const sarah = ask("What is Sarah's service?", data);
    expect(gateBusinessEvidence({ ...sarah, plan }, data, a).confidence.reason).toBe('explicit_context_conflict');
    const coherent = ask("What is Sarah's service for that job?", data, sarah.context);
    expect(coherent.confidence.state).toBe('sufficient');
    expect(coherent.evidenceDescriptors).toContainEqual(expect.objectContaining({ field: 'service', value: 'Deep Cleaning', reference: { type: 'booking', id: 'sarah-job' } }));
    expect(gateBusinessEvidence({ ...coherent, value: john.value }, data, sarah.context).confidence.reason).toBe('field_output_mismatch');
    expect(gateBusinessEvidence(coherent, data, { ...sarah.context, tenantId: 'other' }).status).not.toBe('answerable');
  });
  it('independently rejects wrong-customer appointment operands, incoherent context and substituted dates', () => {
    const data = packet(); const a = selected(data);
    const plan = buildBusinessCapabilityPlan("When is Sarah's appointment for that job?").plan;
    const john = ask('When is their appointment for that job?', data, a);
    expect(gateBusinessEvidence({ ...john, plan }, data, a).confidence.reason).toBe('explicit_customer_mismatch');
    const sarah = ask("When is Sarah's appointment?", data);
    expect(gateBusinessEvidence({ ...sarah, plan }, data, a).confidence.reason).toBe('explicit_context_conflict');
    const coherent = ask("When is Sarah's appointment for that job?", data, sarah.context);
    expect(coherent.confidence.state).toBe('sufficient');
    expect(coherent.evidenceDescriptors).toContainEqual(expect.objectContaining({ field: 'date', value: { date: '2026-10-05', time: '10:00' }, reference: { type: 'booking', id: 'sarah-job' } }));
    expect(gateBusinessEvidence({ ...coherent, value: john.value }, data, sarah.context).confidence.reason).toBe('field_output_mismatch');
    expect(gateBusinessEvidence(coherent, data, { ...sarah.context, tenantId: 'other' }).status).not.toBe('answerable');
  });
  it('rejects wrong-customer status and conflicting context even for supplied executor results', () => {
    const data = packet(); data.bookings[1].status = 'completed'; const a = selected(data);
    const plan = buildBusinessCapabilityPlan("What's Sarah's status for that job?").plan;
    const john = ask("What's their status for that job?", data, a);
    expect(gateBusinessEvidence({ ...john, plan }, data, a).confidence.reason).toBe('explicit_customer_mismatch');
    const sarah = ask("What's Sarah's status?", data);
    expect(sarah.confidence.state).toBe('sufficient');
    expect(gateBusinessEvidence({ ...sarah, plan }, data, a).confidence.reason).toBe('explicit_context_conflict');
    const coherent = ask("What's Sarah's status for that job?", data, sarah.context);
    expect(coherent.evidenceDescriptors).toContainEqual(expect.objectContaining({ sourceType: 'canonical_field', field: 'status', value: 'completed', reference: { type: 'booking', id: 'sarah-job' } }));
    expect(gateBusinessEvidence({ ...coherent, value: 'scheduled' }, data, sarah.context).confidence.reason).toBe('field_output_mismatch');
    data.bookings[1].status = '';
    expect(gateBusinessEvidence(coherent, data, sarah.context).confidence.reason).toBe('missing_status');
  });
  it('rejects active A evidence forged into an explicit B amount plan', () => {
    const data = packet(); const context = selected(data);
    const a = ask('How much are we charging them for that job?', data, context);
    const plan = buildBusinessCapabilityPlan('How much are we charging Sarah for that job?').plan;
    const result = gateBusinessEvidence({ ...a, plan }, data, context);
    expect(result.status).not.toBe('answerable');
    expect(result.confidence.reason).toBe('explicit_customer_mismatch');
    expect(result.evidenceDescriptors).toEqual([]);
  });
  it('refuses coherent B values if the retained contextual booking is A', () => {
    const data = packet(); const context = selected(data);
    const b = ask('How much are we charging Sarah?', data, context);
    expect(b.confidence.state).toBe('sufficient');
    const plan = buildBusinessCapabilityPlan('How much are we charging Sarah for that job?').plan;
    const result = gateBusinessEvidence({ ...b, plan }, data, context);
    expect(result.status).toBe('needs_clarification');
    expect(result.confidence.reason).toBe('explicit_context_conflict');
  });
  it('validates both references for selected B and rejects foreign context', () => {
    const data = packet(); const b = ask('How much are we charging Sarah?', data);
    const result = ask('How much are we charging Sarah for that job?', data, b.context);
    expect(result.confidence.state).toBe('sufficient');
    expect(result.evidenceDescriptors).toContainEqual(expect.objectContaining({ reference: { type: 'booking', id: 'sarah-job' }, field: 'price', value: { amount: 250 } }));
    expect(gateBusinessEvidence(result, data, { ...b.context, tenantId: 'foreign' }).status).not.toBe('answerable');
  });
  it('makes priority explicit without numeric confidence', () => {
    expect(BUSINESS_EVIDENCE_PRIORITY).toEqual(['explicit_canonical_selector', 'canonical_id_relationship', 'current_typed_context', 'interpretation_only']);
    const result = ask("Who's next?");
    expect(result.confidence.state).toBe('sufficient');
    expect(result.confidence).not.toHaveProperty('score');
    expect(result.confidence).not.toHaveProperty('percentage');
    expect(result.confidence.requirementsChecked).toEqual(result.plan.evidenceRequirements);
  });
  it('lets a safely resolved explicit customer replace another active customer', () => {
    const data = packet(); const context = selected(data);
    const result = ask("What's Sarah's phone number?", data, context);
    expect(result.plan.entities).toEqual([{ type: 'customer', name: 'sarah' }]);
    expect(result.value).toBe('555-0111');
    expect(result.confidence).toMatchObject({ state: 'sufficient', resolution: 'explicit_canonical_selector', explicitReplacement: true });
    expect(formatBusinessAnswer(result)).toContain('Sarah - saved booking contact');
    expect(formatBusinessAnswer(result)).not.toContain('555-0110');
  });
  it('uses customer ID relationship provenance rather than a same-name rematch', () => {
    const data = packet(); data.customers.push({ type: 'customer', id: 'unrelated-id', name: 'Sarah' });
    const result = ask('What service is Sarah getting and how much is it?', data);
    const relationship = result.evidenceDescriptors.find(item => item.sourceType === 'canonical_relationship');
    expect(relationship).toMatchObject({ reference: { type: 'booking', id: 'sarah-job' }, field: 'customerId', value: 'sarah-id',
      provenance: { target: { type: 'customer', id: 'sarah-id' }, hops: ['booking.customer', 'booking.service', 'booking.price'] } });
    expect(result.confidence.state).toBe('sufficient');
  });
  it('prefers an exact unique service name over an ambiguous classification', () => {
    const data = packet(); data.services.push({ ...data.services[1], id: 'other-deep', name: 'Other Deep' });
    const exact = ask('Compare Canonical Deep and Standard', data);
    expect(exact.confidence.state).toBe('sufficient');
    expect(exact.usedReferences).toEqual([{ type: 'service', id: 'deep' }, { type: 'service', id: 'standard' }]);
    expect(ask('Compare deep clean and standard clean', data).confidence.state).toBe('needs_clarification');
  });
  it.each(['phone', 'email'])('uses context as a reference, never as a cached %s field', field => {
    const data = packet(); data.bookings[0].contact.email = 'john@example.test';
    const context = { ...selected(data), value: 'invented', phone: '555-0199', email: 'invented@example.test' };
    const result = ask(`What's their ${field}?`, data, context);
    expect(result.value).toBe(data.bookings[0].contact[field]);
    expect(result.evidenceDescriptors).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceType: 'canonical_field', reference: { type: 'booking', id: 'john-job' }, field,
        value: data.bookings[0].contact[field], scope: { tenantId: 'a', validated: true, freshness: 'current_packet' } }),
      expect.objectContaining({ sourceType: 'context_reference', provenance: { factualAuthority: false } }),
    ]));
  });
  it('invalidates stale selected context against the current packet', () => {
    const data = packet(); const context = selected(data); data.bookings.shift();
    const result = ask("What's their phone?", data, context);
    expect(result.status).toBe('needs_clarification');
    expect(result.confidence.state).toBe('invalid_stale_evidence');
    expect(result.evidenceDescriptors).toEqual([]);
  });
  it('invalidates foreign tenant context without borrowing same-ID records', () => {
    const data = packet(); const result = ask("What's their phone?", data, { ...selected(data), tenantId: 'b' });
    expect(result.confidence.state).toBe('invalid_stale_evidence');
    expect(result.value).toBeUndefined();
    expect(formatBusinessAnswer(result)).not.toContain('555-0110');
  });
  it.each(['another-customer', 'sarah-id'])('clarifies multiple candidate Sarah bookings (%s)', customerId => {
    const data = packet(); data.bookings.push({ ...data.bookings[1], id: 'another-job', customerId });
    const result = ask('What service is Sarah getting and how much is it?', data);
    expect(result.confidence.state).toBe('needs_clarification');
    expect(result.evidenceDescriptors).toEqual([]);
  });
  it('clarifies an invalid contextual comparison pair and permits an explicit valid replacement', () => {
    const data = packet(); const pair = ask('Compare deep clean and standard clean', data).context;
    const duplicate = { ...pair, list: [pair.list[0], pair.list[0]] };
    expect(ask('Which is cheaper?', data, duplicate).confidence.state).toBe('needs_clarification');
    data.services.push({ ...data.services[1], id: 'premium', name: 'Premium', priceCents: 20000 });
    const replacement = ask('Compare Premium and Standard', data, pair);
    expect(replacement.confidence).toMatchObject({ state: 'sufficient', explicitReplacement: true });
    expect(replacement.value.differenceCents).toBe(10000);
  });
  it('retains exact operand provenance for a bounded calculation', () => {
    const result = ask('What are my next 2 bookings worth?');
    const derived = result.evidenceDescriptors.find(item => item.sourceType === 'derived_deterministic');
    expect(derived).toMatchObject({ field: 'sum', value: { totalCents: 43000, count: 2 }, provenance: { operands: [
      { reference: { type: 'booking', id: 'john-job' }, cents: 18000 },
      { reference: { type: 'booking', id: 'sarah-job' }, cents: 25000 },
    ] } });
  });
  it('records exact named selector provenance for only the intended service operands', () => {
    const data = packet(); data.services.push({ ...data.services[1], id: 'other-deep', name: 'Other Deep', priceCents: 20000 });
    const result = ask('How much would Canonical Deep and Standard cost together?', data);
    expect(result.value.totalCents).toBe(25000);
    expect(result.evidenceDescriptors.filter(item => item.sourceType === 'canonical_field').map(item => [item.provenance.selector, item.reference.id, item.value])).toEqual([
      ['canonical deep', 'deep', 15000], ['standard', 'standard', 10000],
    ]);
    expect(result.evidenceDescriptors.find(item => item.sourceType === 'derived_deterministic').provenance.operands.map(item => item.reference.id)).toEqual(['deep', 'standard']);
  });
  it.each(['extra', 'substitute', 'omitted'])('rejects a %s named-service operand set with otherwise valid arithmetic and provenance', change => {
    const data = packet(); data.services.push({ ...data.services[1], id: 'other-deep', name: 'Other Deep', priceCents: 20000 });
    const result = structuredClone(ask('How much would Canonical Deep and Standard cost together?', data));
    let operands = [data.services[1], data.services[0]];
    if (change === 'extra') operands.splice(1, 0, data.services[2]);
    if (change === 'substitute') operands[0] = data.services[2];
    if (change === 'omitted') operands.pop();
    result.evidence = operands.map(item => ({ reference: { type: 'service', id: item.id }, fields: ['priceCents'], cents: item.priceCents }));
    result.usedReferences = result.evidence.map(item => item.reference);
    result.value = { totalCents: operands.reduce((sum, item) => sum + item.priceCents, 0), count: operands.length,
      records: operands.map(item => ({ reference: { type: 'service', id: item.id }, label: item.name, cents: item.priceCents })) };
    const gated = gateBusinessEvidence(result, data);
    expect(gated.confidence).toMatchObject({ state: 'invalid_stale_evidence', reason: 'intended_selection_mismatch' });
    expect(gated.status).toBe('insufficient_evidence'); expect(gated.value).toBeUndefined();
    expect(gated.evidenceDescriptors).toEqual([]);
  });
  it('retains configured price operands for comparison provenance', () => {
    const result = ask('Compare deep clean and standard clean');
    const derived = result.evidenceDescriptors.find(item => item.sourceType === 'derived_deterministic');
    expect(derived.value).toEqual({ differenceCents: 5000 });
    expect(derived.provenance.operands.map(item => item.priceCents)).toEqual([15000, 10000]);
  });
  it('retains normalized temporal constraints without treating them as booking evidence', () => {
    const result = ask('How many bookings do I have tomorrow?');
    expect(result.confidence.state).toBe('sufficient');
    expect(result.evidenceDescriptors.find(item => item.sourceType === 'temporal_constraint')).toMatchObject({
      value: { kind: 'tomorrow', timeZone: 'America/Chicago', startDate: '2026-10-05', endDate: '2026-10-06' },
      provenance: { factualAuthority: false },
    });
    const empty = ask('How many bookings do I have tomorrow?', packet({ bookings: [] }));
    expect(empty.confidence.state).toBe('sufficient');
    expect(empty.evidenceDescriptors.filter(item => item.sourceType === 'canonical_field')).toEqual([]);
    expect(empty.evidenceDescriptors.find(item => item.field === 'loaded_record_count').value).toBe(0);
  });
  it.each([
    ['lookup', "What's their phone?", result => { result.value = '555-0199'; }],
    ['compound', "Who's my next customer and what service are they getting?", result => { result.value.service = 'Deep Cleaning'; }],
    ['calculation', 'What are my next 2 bookings worth?', result => { result.value.totalCents += 1; }],
    ['comparison', 'Compare deep clean and standard clean', result => { result.value.differenceCents += 1; }],
  ])('rejects inconsistent %s output instead of presenting partial evidence', (_, question, tamper) => {
    const data = packet(); const context = selected(data); const result = structuredClone(ask(question, data, context));
    tamper(result);
    const gated = gateBusinessEvidence(result, data, context);
    expect(gated.confidence.state).toBe('invalid_stale_evidence');
    expect(gated.status).toBe('insufficient_evidence');
    expect(gated.value).toBeUndefined();
    expect(gated.evidenceDescriptors).toEqual([]);
  });
  it('rejects a compound answer whose customer, service and amount do not share one booking', () => {
    const data = packet(); const result = structuredClone(ask("Who's my next customer, what service are they getting, and how much are we charging them?", data));
    result.usedReferences.push({ type: 'booking', id: 'sarah-job' });
    expect(gateBusinessEvidence(result, data).confidence.state).toBe('invalid_stale_evidence');
  });
  it('rejects incomplete intended calculation operands even if the subtotal is internally consistent', () => {
    const data = packet(); const result = structuredClone(ask('What are my next 2 bookings worth?', data));
    result.evidence.pop(); result.usedReferences.pop(); result.value.records.pop(); result.value.totalCents = 18000; result.value.count = 1;
    expect(gateBusinessEvidence(result, data).confidence.reason).toBe('intended_selection_mismatch');
  });
  it.each(['phone', 'amount', 'priceCents', 'date', 'time', 'timeZone'])('fails honestly for missing %s evidence', field => {
    const data = packet(); const context = selected(data); let question;
    if (field === 'phone') { data.bookings[0].contact.phone = ''; question = "What's their phone?"; }
    if (field === 'amount') { data.bookings[0].amount = null; question = 'What are my next 2 bookings worth?'; }
    if (field === 'priceCents') { data.services[1].priceCents = null; question = 'Compare deep clean and standard clean'; }
    if (field === 'date') { data.bookings[0].date = ''; question = 'What time is that booking?'; }
    if (field === 'time') { data.bookings[0].time = ''; question = 'What time is that booking?'; }
    if (field === 'timeZone') { data.timeZone = ''; question = 'How many bookings do I have tomorrow?'; }
    const result = ask(question, data, context);
    expect(result.confidence.state).toBe('insufficient_evidence');
    expect(result.status).toBe('insufficient_evidence');
  });
  it.each([180.123, '180', NaN])('never coerces invalid booking money (%s)', amount => {
    const data = packet(); data.bookings[0].amount = amount;
    expect(ask('What are my next 2 bookings worth?', data).confidence.state).toBe('insufficient_evidence');
  });
  it('validates customer ID target existence instead of inventing a relationship', () => {
    const data = packet(); data.customers = [];
    expect(ask('What service is Sarah getting and how much is it?', data).confidence.state).toBe('insufficient_evidence');
  });
  it('holds no evidence state through new-conversation or identity reset', () => {
    const data = packet(); const before = structuredClone(data); const context = selected(data);
    expect(ask("What's their phone?", data, context).confidence.state).toBe('sufficient');
    expect(ask("What's their phone?", data, {}).confidence.state).toBe('needs_clarification');
    expect(data).toEqual(before);
    expect(buildBusinessCapabilityPlan("What's their phone?").plan).not.toHaveProperty('evidenceDescriptors');
  });
  it('keeps unsupported/advisory requests available to existing fallback', () => {
    for (const message of ['What should I prioritize today?', "Help me market tomorrow's openings.", 'Optimize my schedule']) {
      const result = ask(message); expect(result.status).toBe('unsupported'); expect(result.confidence.state).toBe('unsupported');
      expect(formatBusinessAnswer(result)).toBeNull();
    }
  });
  it('requires a confidence gate before formatting a nominally answerable result', () => {
    const result = ask('Compare deep clean and standard clean'); delete result.confidence;
    expect(formatBusinessAnswer(result)).toContain('has not been validated');
  });
  it('keeps internal identifiers out of visible canonical answers', () => {
    const result = ask('What are my next 2 bookings worth?');
    expect(formatBusinessAnswer(result)).toContain('$430.00');
    for (const ref of result.usedReferences) expect(formatBusinessAnswer(result)).not.toContain(ref.id);
  });
  it('uses position replacement through existing context without a second state system', () => {
    const data = packet(); const context = selected(data);
    const second = resolveOwnerContext({ domain: 'detail', input: 'second' }, data, context).context;
    expect(ask("What's their phone?", data, second).value).toBe('555-0111');
  });
});
