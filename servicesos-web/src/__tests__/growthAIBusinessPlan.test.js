import { describe, expect, it } from 'vitest';
import { buildBusinessCapabilityPlan, queryBusinessFacts } from '../modules/growthAI/growthAIBusinessIntelligence';
import { BUSINESS_PLAN_BOUNDS, normalizeBusinessCapabilityPlan } from '../modules/growthAI/growthAIBusinessPlan';
import { buildOwnerContext } from '../modules/growthAI/growthAIOwnerContext';

const now = new Date('2026-10-04T05:00:00Z');
const packet = overrides => buildOwnerContext({ tenantId: 'a', authorized: true, ready: true, catalogReady: true,
  timeZone: 'America/Chicago', now,
  bookings: [
    { id: 'sarah', tenantId: 'a', customerId: 'customer-a', customerName: 'Sarah', status: 'scheduled',
      date: '2026-10-05', startTime: '09:00', agreedPrice: 180, serviceType: 'standard', customerSnapshot: { phone: '555-0110' } },
    { id: 'jordan', tenantId: 'a', customerId: 'customer-b', customerName: 'Jordan', status: 'scheduled',
      date: '2026-10-05', startTime: '10:00', agreedPrice: 250, serviceType: 'deep' },
  ], services: [
    { id: 'standard', name: 'Standard', serviceType: 'standard', active: true, priceCents: 10000, durationMinutes: 90 },
    { id: 'deep', name: 'Deep', serviceType: 'deep', active: true, priceCents: 15000, durationMinutes: 120 },
  ], ...overrides });
const execute = (message, data = packet(), context = {}) => queryBusinessFacts(buildBusinessCapabilityPlan(message).plan, data, context, { now });

describe('bounded ServicesOS business capability plans', () => {
  it('keeps contact-info on the phone fact plan with explicit booking coherence', () => {
    const result = buildBusinessCapabilityPlan("What is Jordan's contact info for that job?");
    expect(result.status).toBe('planned');
    expect(result.plan).toMatchObject({ entity: 'booking', operation: 'lookup', field: 'phone', terminalFields: ['phone'], capabilities: ['fact_lookup'], reference: { kind: 'current' } });
    expect(result.plan.entities).toEqual([{ type: 'customer', name: 'jordan' }]);
    expect(result.plan.evidenceRequirements).toEqual(expect.arrayContaining(['explicit_customer_identity', 'canonical_customer_relationship', 'coherent_contextual_booking', 'saved_phone']));
    const clean = buildBusinessCapabilityPlan("What is Jordan's contact info?").plan;
    expect(clean).toMatchObject({ entity: 'customer', field: 'phone', reference: { kind: 'none' }, explicitName: 'jordan' });
    expect(clean.evidenceRequirements).not.toContain('coherent_contextual_booking');
  });
  it('requires explicit customer, coherent contextual booking and saved email evidence', () => {
    const result = buildBusinessCapabilityPlan("What is Jordan's email address for that job?");
    expect(result.status).toBe('planned');
    expect(result.plan).toMatchObject({ entity: 'booking', operation: 'lookup', field: 'email', terminalFields: ['email'], capabilities: ['fact_lookup'], reference: { kind: 'current' } });
    expect(result.plan.entities).toEqual([{ type: 'customer', name: 'jordan' }]);
    expect(result.plan.evidenceRequirements).toEqual(expect.arrayContaining(['explicit_customer_identity', 'canonical_customer_relationship', 'coherent_contextual_booking', 'saved_email']));
    const clean = buildBusinessCapabilityPlan("What is Jordan's email address?").plan;
    expect(clean).toMatchObject({ entity: 'customer', field: 'email', reference: { kind: 'none' } });
    expect(clean.evidenceRequirements).not.toContain('coherent_contextual_booking');
  });
  it('requires explicit customer, coherent contextual booking and saved phone evidence', () => {
    const result = buildBusinessCapabilityPlan("What is Jordan's phone number for that job?");
    expect(result.status).toBe('planned');
    expect(result.plan).toMatchObject({ entity: 'booking', operation: 'lookup', field: 'phone', terminalFields: ['phone'], capabilities: ['fact_lookup'], reference: { kind: 'current' } });
    expect(result.plan.entities).toEqual([{ type: 'customer', name: 'jordan' }]);
    expect(result.plan.evidenceRequirements).toEqual(expect.arrayContaining(['explicit_customer_identity', 'canonical_customer_relationship', 'coherent_contextual_booking', 'saved_phone']));
    const clean = buildBusinessCapabilityPlan("What is Jordan's phone number?").plan;
    expect(clean).toMatchObject({ entity: 'customer', field: 'phone', reference: { kind: 'none' } });
    expect(clean.evidenceRequirements).not.toContain('coherent_contextual_booking');
  });
  it.each(['', ' for that job'])('retains explicit service customer and booking coherence%s', suffix => {
    const result = buildBusinessCapabilityPlan(`What is Jordan's service${suffix}?`);
    expect(result.status).toBe('planned');
    expect(result.plan).toMatchObject({ operation: 'lookup', entity: 'booking', field: 'service', terminalFields: ['service'], capabilities: ['fact_lookup'] });
    expect(result.plan.entities).toEqual([{ type: 'customer', name: 'jordan' }]);
    expect(result.plan.reference.kind).toBe(suffix ? 'current' : 'none');
    expect(result.plan.evidenceRequirements).toEqual(expect.arrayContaining(['explicit_customer_identity', 'canonical_customer_relationship', 'unique_resolved_record', 'saved_service']));
    expect(result.plan.evidenceRequirements.includes('coherent_contextual_booking')).toBe(Boolean(suffix));
  });
  it.each(['', ' for that job'])('retains explicit appointment identity and canonical date evidence%s', suffix => {
    const result = buildBusinessCapabilityPlan(`When is Jordan's appointment${suffix}?`);
    expect(result.status).toBe('planned');
    expect(result.plan).toMatchObject({ operation: 'lookup', entity: 'booking', field: 'date', terminalFields: ['date'], capabilities: ['fact_lookup'] });
    expect(result.plan.entities).toEqual([{ type: 'customer', name: 'jordan' }]);
    expect(result.plan.reference.kind).toBe(suffix ? 'current' : 'none');
    expect(result.plan.evidenceRequirements).toEqual(expect.arrayContaining(['explicit_customer_identity', 'canonical_customer_relationship', 'unique_resolved_record', 'saved_date']));
    expect(result.plan.evidenceRequirements.includes('coherent_contextual_booking')).toBe(Boolean(suffix));
  });
  it.each(['', ' for that job'])('retains explicit customer and saved status plan%s', suffix => {
    const result = buildBusinessCapabilityPlan(`What's Jordan's status${suffix}?`);
    expect(result.status).toBe('planned');
    expect(result.plan).toMatchObject({ operation: 'lookup', entity: 'booking', field: 'status', terminalFields: ['status'], capabilities: ['fact_lookup'] });
    expect(result.plan.entities).toEqual([{ type: 'customer', name: 'jordan' }]);
    expect(result.plan.reference.kind).toBe(suffix ? 'current' : 'none');
    expect(result.plan.evidenceRequirements).toEqual(expect.arrayContaining(['explicit_customer_identity', 'canonical_customer_relationship', 'unique_resolved_record', 'saved_status']));
    expect(result.plan.evidenceRequirements.includes('coherent_contextual_booking')).toBe(Boolean(suffix));
  });
  it('retains explicit customer and contextual booking as separate plan constraints', () => {
    const result = buildBusinessCapabilityPlan('How much are we charging Jordan for that job?');
    expect(result.status).toBe('planned');
    expect(result.plan.entities).toEqual([{ type: 'customer', name: 'jordan' }]);
    expect(result.plan.contextReferences).toEqual([{ kind: 'current' }]);
    expect(result.plan.capabilities).toEqual(['fact_lookup']);
    expect(result.plan.evidenceRequirements).toEqual(expect.arrayContaining(['explicit_customer_identity', 'canonical_customer_relationship', 'coherent_contextual_booking', 'saved_price']));
  });
  it('does not require active context for clean explicit amount lookup', () => {
    const plan = buildBusinessCapabilityPlan('How much are we charging Jordan?').plan;
    expect(plan.entities).toEqual([{ type: 'customer', name: 'jordan' }]);
    expect(plan.contextReferences).toEqual([]);
    expect(plan.evidenceRequirements).not.toContain('coherent_contextual_booking');
  });
  it.each([
    ["What's their phone?", 'lookup', 'context', ['fact_lookup'], ['phone']],
    ['What is the cost of that booking?', 'lookup', 'booking', ['fact_lookup'], ['price']],
    ['List available services', 'list', 'service', ['fact_lookup'], ['summary']],
    ['What is the price of that service?', 'lookup', 'context', ['fact_lookup'], ['price']],
    ['How many bookings do I have tomorrow?', 'count', 'booking', ['temporal_constraint', 'fact_lookup'], ['count']],
    ["What's my first booking tomorrow?", 'identify', 'booking', ['temporal_constraint', 'fact_lookup'], ['summary']],
    ["Who's my next customer and what service are they getting?", 'traverse', 'booking', ['relationship_traversal', 'fact_lookup'], ['customer', 'service']],
    ['What service is Sarah getting and how much is it?', 'traverse', 'booking', ['relationship_traversal', 'fact_lookup'], ['service', 'price']],
    ['Who comes after Sarah and what service are they getting?', 'traverse', 'booking', ['relationship_traversal', 'fact_lookup'], ['customer', 'service']],
    ['Who is my customer tomorrow and what service are they getting?', 'traverse', 'booking', ['temporal_constraint', 'relationship_traversal', 'fact_lookup'], ['customer', 'service']],
    ['Compare deep clean and standard clean', 'compare', 'service', ['comparison'], ['configured_price']],
    ['Which is cheaper?', 'compare', 'service', ['comparison'], ['configured_price']],
    ['How much would deep clean and standard clean cost together?', 'calculate', 'service', ['calculation'], ['configured_price']],
    ["What's the total for those two services?", 'calculate', 'service', ['calculation'], ['configured_price']],
    ['What are my next 2 bookings worth?', 'calculate', 'booking', ['calculation'], ['booking_amount']],
    ['What is the average amount of my next 2 bookings?', 'calculate', 'booking', ['calculation'], ['booking_amount']],
    ['How much are my bookings tomorrow worth?', 'calculate', 'booking', ['temporal_constraint', 'calculation'], ['booking_amount']],
  ])('declares operation, subject, capabilities and terminal fields: %s', (message, operation, subject, capabilities, terminalFields) => {
    const result = buildBusinessCapabilityPlan(message);
    expect(result.status).toBe('planned');
    expect(result.plan).toMatchObject({ planningVersion: 1, operation, subject, capabilities, terminalFields });
    expect(result.plan.stages.at(-2)).toBe('validate_evidence');
    expect(result.plan.stages.at(-1)).toBe('format_answer');
    expect(result.plan.evidenceRequirements).toContain('current_canonical_references');
    expect(result.plan.stages.length).toBeLessThanOrEqual(BUSINESS_PLAN_BOUNDS.stages);
  });
  it('declares temporal execution order and every-operand evidence without claiming an answer', () => {
    const result = buildBusinessCapabilityPlan('How much are my bookings tomorrow worth?');
    expect(result.plan.constraints).toEqual({ temporal: { kind: 'tomorrow' } });
    expect(result.plan.stages).toEqual(['temporal_filter', 'resolve_entities', 'retrieve_facts', 'calculate', 'validate_evidence', 'format_answer']);
    expect(result.plan.evidenceRequirements).toEqual(expect.arrayContaining(['valid_business_timezone', 'valid_local_date_range', 'valid_integer_cents_for_every_operand']));
    expect(result).not.toHaveProperty('value');
    expect(execute('How much are my bookings tomorrow worth?').value.totalCents).toBe(43000);
    expect(execute('How much are my bookings tomorrow worth?', packet({ timeZone: '' })).status).toBe('insufficient_evidence');
  });
  it('requires intended named calculation selectors derived from the request, not caller-injected entities', () => {
    const explicit = buildBusinessCapabilityPlan('How much would Canonical Deep and Standard cost together?');
    expect(explicit.plan.selectors).toEqual(['canonical deep', 'standard']);
    expect(explicit.plan.entities).toEqual([{ type: 'service', name: 'canonical deep' }, { type: 'service', name: 'standard' }]);
    expect(explicit.plan.evidenceRequirements).toContain('intended_service_selectors');
    const normalized = normalizeBusinessCapabilityPlan({ ...explicit.plan, selectors: ['Other Deep'], entities: [{ type: 'service', name: 'Other Deep' }] });
    expect(normalized.plan.selectors).toEqual(explicit.plan.selectors);
    expect(normalized.plan.entities).toEqual(explicit.plan.entities);
    expect(normalized.plan.bounds.calculationOperands).toBe(5);
  });
  it('describes explicit service selectors and reuses only the existing comparison-pair context', () => {
    const explicit = buildBusinessCapabilityPlan('Compare deep clean and standard clean');
    expect(explicit.plan.entities).toEqual([{ type: 'service', name: 'deep clean' }, { type: 'service', name: 'standard clean' }]);
    const contextual = buildBusinessCapabilityPlan("What's the total for those two services?");
    expect(contextual.plan.contextReferences).toEqual([{ kind: 'context_services' }]);
    expect(execute("What's the total for those two services?").status).toBe('needs_clarification');
    const comparison = execute('Compare deep clean and standard clean');
    expect(execute("What's the total for those two services?", packet(), comparison.context).value.totalCents).toBe(25000);
  });
  it.each([
    'What should I prioritize today?', "Help me market tomorrow's openings.",
    'Which service should I promote?', 'Optimize my schedule.', 'How can I make more money?',
    'Compare service profit margins', 'What were my bookings last month worth?',
  ])('preserves fallback for unsupported advisory/workflow requests: %s', message => {
    expect(buildBusinessCapabilityPlan(message)).toEqual({ status: 'unsupported' });
  });
  it('rejects invented combinations, unbounded hops and caller-injected stages', () => {
    const traversal = buildBusinessCapabilityPlan("Who's my next customer and what service are they getting?").plan;
    expect(normalizeBusinessCapabilityPlan({ ...traversal, hops: Array(8).fill('booking.customer') }).status).toBe('unsupported');
    const calculation = buildBusinessCapabilityPlan('What are my next 2 bookings worth?').plan;
    expect(normalizeBusinessCapabilityPlan({ ...calculation, source: 'traversal_bookings' }).status).toBe('unsupported');
    const comparison = buildBusinessCapabilityPlan('Compare deep clean and standard clean').plan;
    expect(normalizeBusinessCapabilityPlan({ ...comparison, temporal: { kind: 'tomorrow' } }).status).toBe('unsupported');
    expect(normalizeBusinessCapabilityPlan({ ...comparison, capabilities: ['call_provider'], stages: ['mutate'] }).plan.capabilities).toEqual(['comparison']);
    expect(execute('What are my next 6 bookings worth?').status).toBe('needs_clarification');
  });
  it('distinguishes ambiguous customers, repeated bookings and missing canonical fields from valid plans', () => {
    const data = packet();
    data.bookings.push({ ...data.bookings[0], id: 'duplicate', customerId: 'another-customer' });
    expect(execute('What service is Sarah getting and how much is it?', data).status).toBe('needs_clarification');
    data.bookings[2].customerId = data.bookings[0].customerId;
    expect(execute('What service is Sarah getting and how much is it?', data).status).toBe('needs_clarification');
    data.bookings.pop(); data.bookings[0].amount = null;
    expect(execute('How much are my bookings tomorrow worth?', data).status).toBe('insufficient_evidence');
  });
  it('retains existing service ambiguity and stale evidence rejection', () => {
    const data = packet(); data.services.push({ ...data.services[1], id: 'other-deep' });
    expect(execute('Compare deep clean and standard clean', data).status).toBe('needs_clarification');
    const context = execute('Compare deep clean and standard clean').context;
    expect(execute("What's the total for those two services?", packet({ services: [] }), context).status).toBe('insufficient_evidence');
  });
  it('holds no context across reset, tenant or identity lifecycle changes', () => {
    const data = packet(); const before = JSON.stringify(data);
    const contactPlan = buildBusinessCapabilityPlan("What's their phone?").plan;
    const selected = execute("Who's next?", data).context;
    expect(queryBusinessFacts(contactPlan, data, selected, { now }).value).toBe('555-0110');
    for (const context of [{}, { ...selected, tenantId: 'b' }, { ...selected, suspended: true },
      { ...selected, selected: { type: 'booking', id: 'removed' } }]) {
      expect(queryBusinessFacts(contactPlan, data, context, { now }).status).toBe('needs_clarification');
    }
    expect(buildBusinessCapabilityPlan("What's their phone?").plan).toEqual(contactPlan);
    expect(contactPlan).not.toHaveProperty('context');
    expect(JSON.stringify(data)).toBe(before);
  });
});
