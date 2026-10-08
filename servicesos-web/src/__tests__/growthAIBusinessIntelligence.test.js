import { describe, expect, it } from 'vitest';
import { answerBusinessQuestion, formatBusinessAnswer, interpretBusinessQuestion, queryBusinessFacts } from '../modules/growthAI/growthAIBusinessIntelligence';
import { buildOwnerContext, resolveOwnerContext } from '../modules/growthAI/growthAIOwnerContext';
import { resolveOwnerContextRequest } from '../modules/growthAI/growthAIOwnerVocabulary';

const now = new Date('2026-10-04T12:00:00Z');
const data = overrides => buildOwnerContext({ tenantId: 'a', authorized: true, ready: true, catalogReady: true, timeZone: 'UTC', now,
  bookings: [
    { id: 'first', tenantId: 'a', customerId: 'person-a', customerName: 'Synthetic A', status: 'scheduled', serviceType: 'standard', agreedPrice: 180, date: '2026-10-04', startTime: '13:00', customerSnapshot: { phone: '555-0110', email: 'a@example.test' } },
    { id: 'second', tenantId: 'a', customerId: 'person-b', customerName: 'Synthetic B', status: 'scheduled', serviceType: 'deep', price: 250, date: '2026-10-05', startTime: '09:00' },
    { id: 'foreign', tenantId: 'b', customerName: 'Foreign', status: 'scheduled', date: '2026-10-04' },
  ], services: [{ id: 'standard', name: 'Canonical Standard', active: true, serviceType: 'standard', priceCents: 18500, durationMinutes: 90 }], leads: [], ...overrides });
const ask = (message, packet, context) => answerBusinessQuestion(message, packet, context, { now });

describe('structured deterministic business intelligence', () => {
  const contactPacket = () => data({ timeZone: 'America/Chicago', bookings: [
    { id: 'first', tenantId: 'a', customerId: 'person-a', customerName: 'Synthetic A', serviceType: 'standard', status: 'scheduled', date: '2026-10-05', startTime: '10:00', customerSnapshot: { phone: '555-0110', email: 'a@example.test' } },
    { id: 'second', tenantId: 'a', customerId: 'person-b', customerName: 'Synthetic B', serviceType: 'deep', status: 'scheduled', date: '2026-10-06', startTime: '13:00', customerSnapshot: { phone: '555-0111', email: 'b@example.test' } },
  ] });
  it('preserves clean contact-info replacement, coherent booking and contextual semantics without mutation', () => {
    const packet = contactPacket(); const original = JSON.stringify(packet); const a = ask('Who is next?', packet).context;
    const b = ask("What is Synthetic B's contact info?", packet, a);
    expect(b.status).toBe('answerable'); expect(formatBusinessAnswer(b)).toContain('555-0111');
    expect(formatBusinessAnswer(b)).not.toContain('b@example.test');
    const coherent = ask("What is Synthetic B's contact info for that job?", packet, b.context);
    expect(coherent.status).toBe('answerable'); expect(coherent.usedReferences).toEqual([{ type: 'booking', id: 'second' }]);
    expect(coherent.plan).toMatchObject({ explicitName: 'synthetic b', field: 'phone', reference: { kind: 'current' } });
    expect(formatBusinessAnswer(coherent)).toContain('555-0111'); expect(formatBusinessAnswer(coherent)).not.toContain('555-0110');
    for (const input of ['What is their contact info for that job?', "What is Synthetic A's contact info for that job?"]) {
      expect(formatBusinessAnswer(ask(input, packet, a))).toContain('555-0110');
    }
    expect(JSON.stringify(packet)).toBe(original);
  });
  it.each(['reset', 'tenant', 'removed', 'missing', 'foreign', 'suspended'])('refuses %s contextual contact-info reference', scenario => {
    const packet = contactPacket(); let context = ask("What is Synthetic B's contact info?", packet, ask('Who is next?', packet).context).context;
    if (scenario === 'reset') context = {};
    if (scenario === 'tenant') context = { ...context, tenantId: 'b' };
    if (scenario === 'removed') packet.bookings = packet.bookings.filter(item => item.id !== 'second');
    if (scenario === 'missing') context = { ...context, selected: null };
    if (scenario === 'foreign') context = { ...context, selected: { type: 'booking', id: 'foreign' } };
    if (scenario === 'suspended') context = { ...context, suspended: true };
    const result = ask("What is Synthetic B's contact info for that job?", packet, context);
    expect(result.status).not.toBe('answerable'); expect(formatBusinessAnswer(result)).not.toMatch(/555-0110|555-0111/);
  });
  it('refuses unknown, ambiguous, missing identity and missing contact-info value without substitution', () => {
    const packet = contactPacket(); const a = ask('Who is next?', packet).context;
    expect(ask("What is Unknown's contact info for that job?", packet, a).status).toBe('needs_clarification');
    const b = ask("What is Synthetic B's contact info?", packet, a).context;
    packet.bookings.push({ ...packet.bookings[1], id: 'duplicate', customerId: 'other-b' });
    expect(ask("What is Synthetic B's contact info for that job?", packet, b).status).toBe('needs_clarification');
    packet.bookings.pop(); packet.bookings[1].customerId = '';
    expect(ask("What is Synthetic B's contact info for that job?", packet, b).status).toBe('needs_clarification');
    packet.bookings[1].customerId = 'person-b'; packet.bookings[1].contact.phone = '';
    const missing = ask("What is Synthetic B's contact info for that job?", packet, b);
    expect(missing.status).toBe('insufficient_evidence'); expect(formatBusinessAnswer(missing)).toContain('unavailable');
    expect(formatBusinessAnswer(missing)).not.toMatch(/555-0110|b@example.test/);
  });
  it('does not substitute active A for explicit B contact info', () => {
    const packet = data(); const a = ask('Who is next?', packet).context;
    const input = "What is Synthetic B's contact info for that job?";
    const result = ask(input, packet, a);
    expect(result.status).toBe('needs_clarification');
    expect(formatBusinessAnswer(result)).not.toContain('555-0110');
    const legacy = resolveOwnerContext(resolveOwnerContextRequest(input), packet, a, { now });
    expect(legacy.kind).toBe('clarify'); expect(legacy.content).not.toContain('555-0110');
    expect(legacy.content).not.toContain('Synthetic A:');
  });
  const emailPacket = () => data({ timeZone: 'America/Chicago', bookings: [
    { id: 'first', tenantId: 'a', customerId: 'person-a', customerName: 'Synthetic A', serviceType: 'standard', status: 'scheduled', date: '2026-10-05', startTime: '10:00', customerSnapshot: { email: 'a@example.test' } },
    { id: 'second', tenantId: 'a', customerId: 'person-b', customerName: 'Synthetic B', serviceType: 'deep', status: 'scheduled', date: '2026-10-06', startTime: '13:00', customerSnapshot: { email: 'b@example.test' } },
  ] });
  it('preserves explicit B in contextual email lookup instead of answering A', () => {
    const packet = emailPacket(); const a = ask('Who is next?', packet).context;
    const input = "What is Synthetic B's email address for that job?";
    const result = ask(input, packet, a);
    expect(result.status).toBe('needs_clarification');
    expect(result.plan).toMatchObject({ explicitName: 'synthetic b', reference: { kind: 'current' }, field: 'email' });
    expect(formatBusinessAnswer(result)).not.toContain('a@example.test');
    const legacy = resolveOwnerContext(resolveOwnerContextRequest(input), packet, a, { now });
    expect(legacy.kind).toBe('clarify'); expect(legacy.content).not.toContain('Synthetic A:');
  });
  it('preserves clean email replacement, coherent booking and same-customer contact without mutation', () => {
    const packet = emailPacket(); const original = JSON.stringify(packet); const a = ask('Who is next?', packet).context;
    const b = ask("What is Synthetic B's email address?", packet, a);
    expect(b.status).toBe('answerable'); expect(formatBusinessAnswer(b)).toContain('b@example.test');
    const coherent = ask("What is Synthetic B's email address for that job?", packet, b.context);
    expect(coherent.status).toBe('answerable'); expect(coherent.usedReferences).toEqual([{ type: 'booking', id: 'second' }]);
    expect(formatBusinessAnswer(coherent)).toContain('b@example.test'); expect(formatBusinessAnswer(coherent)).not.toContain('a@example.test');
    for (const input of ['What is their email address for that job?', "What is Synthetic A's email address for that job?"]) {
      expect(formatBusinessAnswer(ask(input, packet, a))).toContain('a@example.test');
    }
    expect(JSON.stringify(packet)).toBe(original);
  });
  it.each(['reset', 'tenant', 'removed', 'missing', 'foreign', 'suspended'])('refuses %s contextual email reference', scenario => {
    const packet = emailPacket(); let context = ask("What is Synthetic B's email address?", packet, ask('Who is next?', packet).context).context;
    if (scenario === 'reset') context = {};
    if (scenario === 'tenant') context = { ...context, tenantId: 'b' };
    if (scenario === 'removed') packet.bookings = packet.bookings.filter(item => item.id !== 'second');
    if (scenario === 'missing') context = { ...context, selected: null };
    if (scenario === 'foreign') context = { ...context, selected: { type: 'booking', id: 'foreign' } };
    if (scenario === 'suspended') context = { ...context, suspended: true };
    const result = ask("What is Synthetic B's email address for that job?", packet, context);
    expect(result.status).not.toBe('answerable'); expect(formatBusinessAnswer(result)).not.toMatch(/a@example.test|b@example.test/);
  });
  it('rejects unknown, ambiguous and missing customer identity and never substitutes missing email', () => {
    const packet = emailPacket(); const a = ask('Who is next?', packet).context;
    expect(ask("What is Unknown's email address for that job?", packet, a).status).toBe('needs_clarification');
    const b = ask("What is Synthetic B's email address?", packet, a).context;
    packet.bookings.push({ ...packet.bookings[1], id: 'duplicate', customerId: 'other-b' });
    expect(ask("What is Synthetic B's email address for that job?", packet, b).status).toBe('needs_clarification');
    packet.bookings.pop(); packet.bookings[1].customerId = '';
    expect(ask("What is Synthetic B's email address for that job?", packet, b).status).toBe('needs_clarification');
    packet.bookings[1].customerId = 'person-b'; packet.bookings[1].contact.email = '';
    const missing = ask("What is Synthetic B's email address for that job?", packet, b);
    expect(missing.status).toBe('insufficient_evidence'); expect(formatBusinessAnswer(missing)).toContain('unavailable');
    expect(formatBusinessAnswer(missing)).not.toContain('a@example.test');
  });
  const phonePacket = () => data({ bookings: [
    { id: 'first', tenantId: 'a', customerId: 'person-a', customerName: 'Synthetic A', status: 'scheduled', date: '2026-10-05', startTime: '10:00', customerSnapshot: { phone: '555-0110' } },
    { id: 'second', tenantId: 'a', customerId: 'person-b', customerName: 'Synthetic B', status: 'scheduled', date: '2026-10-06', startTime: '13:00', customerSnapshot: { phone: '555-0111' } },
  ] });
  it('preserves explicit B in contextual phone lookup instead of answering A', () => {
    const packet = phonePacket(); const a = ask('Who is next?', packet).context;
    const input = "What is Synthetic B's phone number for that job?";
    const result = ask(input, packet, a);
    expect(result.status).toBe('needs_clarification');
    expect(result.plan).toMatchObject({ explicitName: 'synthetic b', reference: { kind: 'current' }, field: 'phone' });
    expect(formatBusinessAnswer(result)).not.toContain('555-0110');
    const legacy = resolveOwnerContext(resolveOwnerContextRequest(input), packet, a, { now });
    expect(legacy.kind).toBe('clarify'); expect(legacy.content).not.toContain('Synthetic A:');
  });
  it('preserves clean phone replacement, coherent booking and same-customer contact without mutation', () => {
    const packet = phonePacket(); const original = JSON.stringify(packet); const a = ask('Who is next?', packet).context;
    const b = ask("What is Synthetic B's phone number?", packet, a);
    expect(b.status).toBe('answerable'); expect(formatBusinessAnswer(b)).toContain('555-0111');
    const coherent = ask("What is Synthetic B's phone number for that job?", packet, b.context);
    expect(coherent.status).toBe('answerable'); expect(coherent.usedReferences).toEqual([{ type: 'booking', id: 'second' }]);
    expect(formatBusinessAnswer(coherent)).toContain('555-0111'); expect(formatBusinessAnswer(coherent)).not.toContain('555-0110');
    for (const input of ['What is their phone number for that job?', "What is Synthetic A's phone number for that job?"]) {
      expect(formatBusinessAnswer(ask(input, packet, a))).toContain('555-0110');
    }
    expect(JSON.stringify(packet)).toBe(original);
  });
  it.each(['reset', 'tenant', 'removed', 'missing', 'foreign', 'suspended'])('refuses %s contextual phone reference', scenario => {
    const packet = phonePacket(); let context = ask("What is Synthetic B's phone number?", packet, ask('Who is next?', packet).context).context;
    if (scenario === 'reset') context = {};
    if (scenario === 'tenant') context = { ...context, tenantId: 'b' };
    if (scenario === 'removed') packet.bookings = packet.bookings.filter(item => item.id !== 'second');
    if (scenario === 'missing') context = { ...context, selected: null };
    if (scenario === 'foreign') context = { ...context, selected: { type: 'booking', id: 'foreign' } };
    if (scenario === 'suspended') context = { ...context, suspended: true };
    const result = ask("What is Synthetic B's phone number for that job?", packet, context);
    expect(result.status).not.toBe('answerable'); expect(formatBusinessAnswer(result)).not.toContain('555-0110');
  });
  it('rejects unknown, ambiguous and missing customer identity and never substitutes missing phone', () => {
    const packet = phonePacket(); const a = ask('Who is next?', packet).context;
    expect(ask("What is Unknown's phone number for that job?", packet, a).status).toBe('needs_clarification');
    const b = ask("What is Synthetic B's phone number?", packet, a).context;
    packet.bookings.push({ ...packet.bookings[1], id: 'duplicate', customerId: 'other-b' });
    expect(ask("What is Synthetic B's phone number for that job?", packet, b).status).toBe('needs_clarification');
    packet.bookings.pop(); packet.bookings[1].customerId = '';
    expect(ask("What is Synthetic B's phone number for that job?", packet, b).status).toBe('needs_clarification');
    packet.bookings[1].customerId = 'person-b'; packet.bookings[1].contact.phone = '';
    const missing = ask("What is Synthetic B's phone number for that job?", packet, b);
    expect(missing.status).toBe('insufficient_evidence'); expect(formatBusinessAnswer(missing)).toContain('unavailable');
    expect(formatBusinessAnswer(missing)).not.toContain('555-0110');
  });
  const servicePacket = () => data({ timeZone: 'America/Chicago', bookings: [
    { id: 'first', tenantId: 'a', customerId: 'person-a', customerName: 'Synthetic A', serviceType: 'standard', status: 'scheduled', date: '2026-10-05', startTime: '10:00' },
    { id: 'second', tenantId: 'a', customerId: 'person-b', customerName: 'Synthetic B', serviceType: 'deep', status: 'scheduled', date: '2026-10-06', startTime: '13:00' },
  ] });
  it('preserves explicit B when service lookup references A current job', () => {
    const packet = servicePacket(); const a = ask('Who is next?', packet).context;
    const input = "What is Synthetic B's service for that job?";
    const result = ask(input, packet, a);
    expect(result.status).toBe('needs_clarification');
    expect(result.plan).toMatchObject({ explicitName: 'synthetic b', reference: { kind: 'current' }, field: 'service' });
    expect(formatBusinessAnswer(result)).not.toContain('Standard Cleaning');
    const legacy = resolveOwnerContext(resolveOwnerContextRequest(input), packet, a, { now });
    expect(legacy.kind).toBe('clarify'); expect(legacy.content).not.toContain('Standard Cleaning');
  });
  it('answers only coherent services and permits unique B-only replacement without mutation', () => {
    const packet = servicePacket(); const original = JSON.stringify(packet); const a = ask('Who is next?', packet).context;
    const b = ask("What is Synthetic B's service?", packet, a);
    expect(b.status).toBe('answerable'); expect(b.usedReferences).toEqual([{ type: 'booking', id: 'second' }]);
    expect(formatBusinessAnswer(b)).toBe('Deep Cleaning');
    expect(formatBusinessAnswer(ask("What is Synthetic B's service for that job?", packet, b.context))).toBe('Deep Cleaning');
    for (const input of ["What is their service for that job?", "What is Synthetic A's service for that job?"]) {
      expect(formatBusinessAnswer(ask(input, packet, a))).toBe('Standard Cleaning');
    }
    expect(JSON.stringify(packet)).toBe(original);
  });
  it.each(['reset', 'tenant', 'removed', 'missing', 'foreign', 'suspended'])('refuses %s service context rather than guessing a replacement', scenario => {
    const packet = servicePacket(); const b = ask("What is Synthetic B's service?", packet).context;
    const contexts = { reset: {}, tenant: { ...b, tenantId: 'other' }, removed: { ...b, selected: { type: 'booking', id: 'removed' } },
      missing: { ...b, selected: null }, foreign: { ...b, selected: { type: 'booking', id: 'foreign' } }, suspended: { ...b, suspended: true } };
    const result = ask("What is Synthetic B's service for that job?", packet, contexts[scenario]);
    expect(result.status).not.toBe('answerable'); expect(formatBusinessAnswer(result)).not.toMatch(/Standard Cleaning|Deep Cleaning/);
  });
  it('clarifies unknown, ambiguous, missing-identity and multiple service bookings', () => {
    const packet = servicePacket(); const a = ask('Who is next?', packet).context;
    expect(ask("What is Synthetic Z's service for that job?", packet, a).status).toBe('needs_clarification');
    packet.bookings[1].customerId = '';
    expect(ask("What is Synthetic B's service?", packet, a).status).toBe('needs_clarification');
    packet.bookings[1].customerId = 'person-b';
    packet.bookings.push({ ...packet.bookings[1], id: 'duplicate-b', customerId: 'other-b' });
    expect(ask("What is Synthetic B's service?", packet, a).status).toBe('needs_clarification');
    packet.bookings[2].customerId = 'person-b';
    expect(ask("What is Synthetic B's service?", packet, a).status).toBe('needs_clarification');
    const b = { ...a, selected: { type: 'booking', id: 'second' }, index: 1 };
    expect(formatBusinessAnswer(ask("What is Synthetic B's service for that job?", packet, b))).toBe('Deep Cleaning');
    packet.bookings[1].id = '';
    expect(ask("What is Synthetic B's service for that job?", packet, b).status).not.toBe('answerable');
  });
  it('does not substitute A service when B saved service is missing', () => {
    const packet = servicePacket(); packet.bookings[1].serviceType = '';
    const result = ask("What is Synthetic B's service?", packet, ask('Who is next?', packet).context);
    expect(result.status).toBe('insufficient_evidence'); expect(formatBusinessAnswer(result)).not.toContain('Standard Cleaning');
  });
  const appointmentPacket = () => data({ timeZone: 'America/Chicago', bookings: [
    { id: 'first', tenantId: 'a', customerId: 'person-a', customerName: 'Synthetic A', status: 'scheduled', date: '2026-10-05', startTime: '10:00' },
    { id: 'second', tenantId: 'a', customerId: 'person-b', customerName: 'Synthetic B', status: 'scheduled', date: '2026-10-06', startTime: '13:00' },
  ] });
  it.each([
    ["When is my next customer's appointment?", { operation: 'traverse', fields: ['customer', 'date'], start: { kind: 'next_booking' } }],
    ["When is the first customer's appointment?", { field: 'date', reference: { kind: 'position', position: 'first' } }],
  ])('keeps existing ordered appointment references instead of treating them as names: %s', (input, plan) => {
    const interpreted = interpretBusinessQuestion(input);
    expect(interpreted.plan).toMatchObject(plan);
    expect(interpreted.plan.explicitName).toBeUndefined();
    const packet = appointmentPacket();
    const context = ask('Who is next?', packet).context;
    const result = ask(input, packet, context);
    expect(result.status).toBe('answerable');
    expect(formatBusinessAnswer(result)).toContain('2026-10-05 at 10:00');
  });
  it('preserves explicit B when the appointment references active A job', () => {
    const packet = appointmentPacket(); const a = ask('Who is next?', packet).context;
    const input = "When is Synthetic B's appointment for that job?";
    const result = ask(input, packet, a);
    const legacy = resolveOwnerContext(resolveOwnerContextRequest(input), packet, a, { now });
    expect(result.status).toBe('needs_clarification');
    expect(result.plan).toMatchObject({ explicitName: 'synthetic b', reference: { kind: 'current' }, field: 'date' });
    expect(formatBusinessAnswer(result)).not.toContain('2026-10-05');
    expect(legacy.kind).toBe('clarify'); expect(legacy.content).not.toContain('2026-10-05');
  });
  it('answers only coherent appointment dates and allows explicit B to replace A without a contextual job', () => {
    const packet = appointmentPacket(); const original = JSON.stringify(packet); const a = ask('Who is next?', packet).context;
    const b = ask("When is Synthetic B's appointment?", packet, a);
    expect(b.status).toBe('answerable'); expect(b.usedReferences).toEqual([{ type: 'booking', id: 'second' }]);
    expect(formatBusinessAnswer(b)).toBe('2026-10-06 at 13:00.');
    expect(formatBusinessAnswer(ask("When is Synthetic B's appointment for that job?", packet, b.context))).toBe('2026-10-06 at 13:00.');
    for (const input of ["When is their appointment for that job?", "When is Synthetic A's appointment for that job?"]) {
      expect(formatBusinessAnswer(ask(input, packet, a))).toBe('2026-10-05 at 10:00.');
    }
    expect(JSON.stringify(packet)).toBe(original);
  });
  it.each(['reset', 'tenant', 'removed', 'missing', 'foreign', 'suspended'])('refuses %s appointment context instead of replacing the booking', scenario => {
    const packet = appointmentPacket(); const b = ask("When is Synthetic B's appointment?", packet).context;
    const contexts = { reset: {}, tenant: { ...b, tenantId: 'other' }, removed: { ...b, selected: { type: 'booking', id: 'removed' } },
      missing: { ...b, selected: null }, foreign: { ...b, selected: { type: 'booking', id: 'foreign' } }, suspended: { ...b, suspended: true } };
    const result = ask("When is Synthetic B's appointment for that job?", packet, contexts[scenario]);
    expect(result.status).not.toBe('answerable'); expect(formatBusinessAnswer(result)).not.toMatch(/2026-10-0[56]/);
  });
  it('clarifies unknown, ambiguous, missing-identity and unselected multiple appointment bookings', () => {
    const packet = appointmentPacket(); const a = ask('Who is next?', packet).context;
    expect(ask("When is Synthetic Z's appointment for that job?", packet, a).status).toBe('needs_clarification');
    packet.bookings[1].customerId = '';
    expect(ask("When is Synthetic B's appointment?", packet, a).status).toBe('needs_clarification');
    packet.bookings[1].customerId = 'person-b';
    packet.bookings.push({ ...packet.bookings[1], id: 'duplicate-b', customerId: 'other-b' });
    expect(ask("When is Synthetic B's appointment?", packet, a).status).toBe('needs_clarification');
    packet.bookings[2].customerId = 'person-b';
    expect(ask("When is Synthetic B's appointment?", packet, a).status).toBe('needs_clarification');
    const b = { ...a, selected: { type: 'booking', id: 'second' }, index: 1 };
    expect(formatBusinessAnswer(ask("When is Synthetic B's appointment for that job?", packet, b))).toBe('2026-10-06 at 13:00.');
    packet.bookings[1].id = '';
    expect(ask("When is Synthetic B's appointment for that job?", packet, b).status).not.toBe('answerable');
  });
  it('keeps invalid appointment scheduling and missing timezone insufficient', () => {
    const packet = appointmentPacket(); const b = ask("When is Synthetic B's appointment?", packet).context;
    for (const overrides of [{ date: '2026-02-30' }, { startTime: '' }, { scheduledAt: 'bad' }, { scheduledAt: '2026-10-06T13:00:00Z' }]) {
      const invalid = data({ timeZone: 'America/Chicago', bookings: [{ id: 'second', tenantId: 'a', customerId: 'person-b', customerName: 'Synthetic B', status: 'scheduled', date: '2026-10-06', startTime: '13:00', ...overrides }] });
      expect(ask("When is Synthetic B's appointment for that job?", invalid, b).status).toBe('insufficient_evidence');
    }
    const missingZone = data({ timeZone: '', bookings: [{ id: 'second', tenantId: 'a', customerId: 'person-b', customerName: 'Synthetic B', status: 'scheduled', date: '2026-10-06', startTime: '13:00' }] });
    expect(ask("When is Synthetic B's appointment?", missingZone).status).toBe('insufficient_evidence');
  });
  it('preserves explicit B and status when that job belongs to active A', () => {
    const packet = data({ bookings: [
      { id: 'first', tenantId: 'a', customerId: 'person-a', customerName: 'Synthetic A', status: 'scheduled', date: '2026-10-05', startTime: '10:00' },
      { id: 'second', tenantId: 'a', customerId: 'person-b', customerName: 'Synthetic B', status: 'completed', date: '2026-10-01', startTime: '12:00' },
    ] });
    const context = ask('Who is next?', packet).context;
    const input = "What's Synthetic B's status for that job?";
    const result = ask(input, packet, context);
    const legacy = resolveOwnerContext(resolveOwnerContextRequest(input), packet, context, { now });
    expect(result.status).toBe('needs_clarification');
    expect(result.plan).toMatchObject({ explicitName: 'synthetic b', field: 'status', reference: { kind: 'current' } });
    expect(formatBusinessAnswer(result)).not.toContain('scheduled');
    expect(legacy.kind).toBe('clarify');
    expect(legacy.content).not.toContain('scheduled');
  });
  it('returns B status only from B and preserves coherent or context-only A status', () => {
    const packet = data(); packet.bookings[1].status = 'completed'; packet.bookings[1].upcoming = false;
    const original = JSON.stringify(packet); const a = ask('Who is next?', packet).context;
    const b = ask("What's Synthetic B's status?", packet, a);
    expect(b.status).toBe('answerable'); expect(b.usedReferences).toEqual([{ type: 'booking', id: 'second' }]);
    expect(formatBusinessAnswer(b)).toBe('completed');
    expect(formatBusinessAnswer(ask("What's Synthetic B's status for that job?", packet, b.context))).toBe('completed');
    for (const input of ["What's their status for that job?", "What's Synthetic A's status for that job?"]) {
      expect(formatBusinessAnswer(ask(input, packet, a))).toBe('scheduled');
    }
    expect(JSON.stringify(packet)).toBe(original);
  });
  it.each(['reset', 'tenant', 'removed', 'missing', 'foreign', 'suspended'])('refuses explicit status with %s booking context', scenario => {
    const packet = data(); const b = ask("What's Synthetic B's status?", packet).context;
    const contexts = { reset: {}, tenant: { ...b, tenantId: 'foreign' }, removed: { ...b, selected: { type: 'booking', id: 'removed' } },
      missing: { ...b, selected: null }, foreign: { ...b, selected: { type: 'booking', id: 'foreign' } }, suspended: { ...b, suspended: true } };
    const result = ask("What's Synthetic B's status for that job?", packet, contexts[scenario]);
    expect(result.status).not.toBe('answerable'); expect(formatBusinessAnswer(result)).not.toContain('scheduled');
  });
  it('refuses unknown, ambiguous, missing-identity and multiple-booking status without guessing', () => {
    const packet = data(); const a = ask('Who is next?', packet).context;
    expect(ask("What's Synthetic Z's status for that job?", packet, a).status).toBe('needs_clarification');
    packet.bookings[1].customerId = '';
    expect(ask("What's Synthetic B's status?", packet, a).status).toBe('needs_clarification');
    packet.bookings[1].customerId = 'person-b';
    packet.bookings.push({ ...packet.bookings[1], id: 'another-b', customerId: 'other-person' });
    expect(ask("What's Synthetic B's status?", packet, a).status).toBe('needs_clarification');
    packet.bookings[2].customerId = 'person-b';
    expect(ask("What's Synthetic B's status?", packet, a).status).toBe('needs_clarification');
    const b = { ...a, selected: { type: 'booking', id: 'second' }, index: 1 };
    expect(formatBusinessAnswer(ask("What's Synthetic B's status for that job?", packet, b))).toBe('scheduled');
  });
  it('requires saved status and formats the gated value rather than a substituted summary', () => {
    const packet = data(); const b = ask("What's Synthetic B's status?", packet);
    expect(formatBusinessAnswer({ ...b, summary: 'unrelated' })).toBe('scheduled');
    packet.bookings[1].status = '';
    const result = ask("What's Synthetic B's status?", packet);
    expect(result.status).toBe('insufficient_evidence'); expect(formatBusinessAnswer(result)).toContain('unavailable');
  });
  it('resolves a clean explicit B amount without substituting active A', () => {
    const packet = data(); const original = JSON.stringify(packet);
    const result = ask('How much are we charging Synthetic B?', packet, ask('Who is next?', packet).context);
    expect(result.status).toBe('answerable');
    expect(result.usedReferences).toEqual([{ type: 'booking', id: 'second' }]);
    expect(formatBusinessAnswer(result)).toBe('Saved booking amount: $250.00.');
    expect(result.plan.reference).toEqual({ kind: 'none' });
    expect(JSON.stringify(packet)).toBe(original);
  });
  it.each(['that job', 'that booking', 'that appointment', 'their job'])('retains explicit B and contextual %s', reference => {
    const interpreted = interpretBusinessQuestion(`How much are we charging Synthetic B for ${reference}?`);
    expect(interpreted.plan).toMatchObject({ explicitName: 'synthetic b', reference: { kind: 'current' }, entity: 'booking', field: 'price' });
    const packet = data(); const context = ask('Who is next?', packet).context;
    expect(ask(interpreted.plan.input, packet, context).status).toBe('needs_clarification');
  });
  it.each(['them', 'Synthetic A'])('preserves coherent contextual %s amount', subject => {
    const packet = data();
    const result = ask(`How much are we charging ${subject} for that job?`, packet, ask('Who is next?', packet).context);
    expect(result.status).toBe('answerable');
    expect(formatBusinessAnswer(result)).toBe('Saved booking amount: $180.00.');
  });
  it('allows explicit B with B selected and rejects context after reset, tenant switch or removal', () => {
    const packet = data(); const initial = ask('Who is next?', packet).context;
    const b = ask('How much are we charging Synthetic B?', packet, initial).context;
    const input = 'How much are we charging Synthetic B for that job?';
    expect(formatBusinessAnswer(ask(input, packet, b))).toBe('Saved booking amount: $250.00.');
    for (const stale of [{}, { ...b, tenantId: 'foreign' }, { ...b, suspended: true }, { ...b, selected: { type: 'booking', id: 'removed' } }]) {
      const result = ask(input, packet, stale);
      expect(result.status).not.toBe('answerable');
      expect(formatBusinessAnswer(result)).not.toMatch(/\$180|\$250/);
    }
    expect(ask(input, packet, initial).status).toBe('needs_clarification');
  });
  it('rejects unknown, missing-identity and duplicate-name customers without active fallback', () => {
    const packet = data(); const context = ask('Who is next?', packet).context;
    expect(ask('How much are we charging Synthetic Z for that job?', packet, context).status).toBe('needs_clarification');
    packet.bookings[1].customerId = '';
    expect(ask('How much are we charging Synthetic B?', packet, context).status).toBe('needs_clarification');
    packet.bookings[1].customerId = 'person-b';
    packet.bookings.push({ ...packet.bookings[1], id: 'duplicate-b', customerId: 'another-b' });
    expect(ask('How much are we charging Synthetic B?', packet, context).status).toBe('needs_clarification');
  });
  it('requires a specific booking for multiple B bookings and honors coherent selection', () => {
    const packet = data(); const b = ask('How much are we charging Synthetic B?', packet).context;
    packet.bookings.push({ ...packet.bookings[1], id: 'another-job' });
    expect(ask('How much are we charging Synthetic B?', packet).status).toBe('needs_clarification');
    expect(formatBusinessAnswer(ask('How much are we charging Synthetic B for that job?', packet, b))).toBe('Saved booking amount: $250.00.');
  });
  it('does not discard explicit B when that job belongs to active A', () => {
    const packet = data();
    const context = ask('Who is next?', packet).context;
    const input = 'How much are we charging Synthetic B for that job?';
    const result = ask(input, packet, context);
    expect(context.selected.id).toBe('first');
    expect(result.status).toBe('needs_clarification');
    expect(formatBusinessAnswer(result)).not.toContain('$180.00');
    expect(result.plan.explicitName).toBe('synthetic b');
    expect(result.plan.entities).toEqual([{ type: 'customer', name: 'synthetic b' }]);
    expect(result.plan.reference).toEqual({ kind: 'current' });
  });
  const relationshipPacket = overrides => data({ bookings: [
    { id: 'sarah', tenantId: 'a', customerId: 'sarah-id', customerName: 'Sarah', status: 'scheduled', serviceType: 'standard', agreedPrice: 180, date: '2026-10-04', startTime: '13:00', customerSnapshot: { phone: '555-0110', email: 'sarah@example.test' } },
    { id: 'jordan', tenantId: 'a', customerId: 'jordan-id', customerName: 'Jordan', status: 'scheduled', serviceType: 'deep', agreedPrice: 250, date: '2026-10-05', startTime: '09:00', customerSnapshot: { phone: '555-0111' } },
    { id: 'foreign-sarah', tenantId: 'b', customerId: 'foreign', customerName: 'Sarah', status: 'scheduled', serviceType: 'moveout', agreedPrice: 400, date: '2026-10-05', startTime: '08:00' },
  ], ...overrides });
  it.each([
    ["Who's my next customer, what service are they getting, and how much are we charging them?", ['customer', 'service', 'price'], 'sarah'],
    ["What's the next job and what is the customer paying?", ['customer', 'price'], 'sarah'],
    ["Who is the customer for my next booking and what's their phone number?", ['customer', 'phone'], 'sarah'],
    ['What service is Sarah getting and how much is it?', ['service', 'price'], 'sarah'],
    ['Who comes after Sarah and what service are they getting?', ['customer', 'service'], 'jordan'],
  ])('traverses bounded canonical booking relationships: %s', (message, fields, id) => {
    const packet = relationshipPacket(); const result = ask(message, packet);
    expect(result.plan).toMatchObject({ entity: 'booking', operation: 'traverse', fields });
    expect(result.status).toBe('answerable'); expect(result.usedReferences).toEqual([{ type: 'booking', id }]);
    expect(result.evidence).toEqual([expect.objectContaining({ reference: { type: 'booking', id }, hops: expect.any(Array) })]);
  });
  it('renders multi-hop canonical fields and carries the selected booking into existing context', () => {
    const packet = relationshipPacket(); const result = ask("Who's my next customer, what service are they getting, and how much are we charging them?", packet);
    expect(formatBusinessAnswer(result)).toBe('Customer: Sarah. Service: Standard Cleaning. Saved booking amount: $180.00.');
    expect(result.context.selected).toEqual({ type: 'booking', id: 'sarah' });
    expect(formatBusinessAnswer(ask("What's their email?", packet, result.context))).toContain('sarah@example.test');
  });
  it('fails closed for ambiguous, missing, stale and incomplete relationship hops', () => {
    const packet = relationshipPacket();
    expect(ask('What service is Unknown getting and how much is it?', packet).status).toBe('needs_clarification');
    packet.bookings.push({ ...packet.bookings[1], id: 'sarah-second', customerId: 'sarah-2', customerName: 'Sarah' });
    expect(ask('What service is Sarah getting and how much is it?', packet).status).toBe('needs_clarification');
    const repeatedCustomer = relationshipPacket(); repeatedCustomer.bookings.push({ ...repeatedCustomer.bookings[0], id: 'sarah-repeat', date: '2026-10-05', startTime: '08:00' });
    expect(ask('Who comes after Sarah and what service are they getting?', repeatedCustomer).message).toContain('more than one current booking');
    const onlySarah = relationshipPacket(); onlySarah.bookings = onlySarah.bookings.slice(0, 1);
    expect(ask('Who comes after Sarah and what service are they getting?', onlySarah).status).toBe('insufficient_evidence');
    const noPhone = relationshipPacket(); noPhone.bookings[0].contact.phone = '';
    expect(ask("Who is the customer for my next booking and what's their phone number?", noPhone).status).toBe('insufficient_evidence');
    const result = ask("Who's my next customer, what service are they getting, and how much are we charging them?", relationshipPacket());
    expect(ask("What's their email?", relationshipPacket({ bookings: [] }), result.context).status).toBe('needs_clarification');
    expect(ask("Who's my next customer, what service are they getting, and how much are we charging them?", relationshipPacket({ authorized: false })).status).toBe('insufficient_evidence');
  });
  const comparisonPacket = overrides => data({ services: [
    { id: 'standard', name: 'Canonical Standard', active: true, serviceType: 'standard', priceCents: 10000, durationMinutes: 90 },
    { id: 'deep', name: 'Canonical Deep', active: true, serviceType: 'deep', priceCents: 15000, durationMinutes: 120 },
  ], ...overrides });
  it.each(['Compare deep clean and standard clean.', 'Which costs more, a deep clean or a standard clean?',
    "What's the price difference between deep clean and standard clean?", 'Compare Canonical Deep versus Canonical Standard'])('executes reusable configured-price comparison: %s', message => {
    const packet = comparisonPacket(); const before = JSON.stringify(packet);
    const result = ask(message, packet);
    expect(result.plan).toMatchObject({ entity: 'service', operation: 'compare', field: 'price' });
    expect(result.status).toBe('answerable');
    expect(result.value.differenceCents).toBe(5000);
    expect(result.value.cheaper).toEqual([{ type: 'service', id: 'standard' }]);
    expect(result.value.moreExpensive).toEqual([{ type: 'service', id: 'deep' }]);
    expect(formatBusinessAnswer(result)).toContain('Canonical Deep costs $50.00 more than Canonical Standard');
    expect(formatBusinessAnswer(result)).toContain('Canonical Deep is $150.00');
    expect(formatBusinessAnswer(result)).toContain('Canonical Standard is $100.00');
    expect(result.evidence.map(item => item.fields)).toEqual([['priceCents'], ['priceCents']]);
    expect(JSON.stringify(packet)).toBe(before);
  });
  it('reuses typed pair references and preserves the earlier booking/customer topic', () => {
    const packet = comparisonPacket(); let result = ask("Who's next?", packet);
    result = ask('Compare deep clean and standard clean', packet, result.context);
    const references = result.usedReferences;
    for (const message of ['Which one costs more?', 'Which is cheaper?', 'How much more is one than the other?',
      'Compare these two services.', "What's the difference between those two?"]) {
      result = ask(message, packet, result.context);
      expect(result.status).toBe('answerable'); expect(result.usedReferences).toEqual(references);
      expect(result.value.differenceCents).toBe(5000);
    }
    result = ask('Go back to that customer.', packet, result.context);
    expect(formatBusinessAnswer(ask("What's their email?", packet, result.context))).toContain('a@example.test');
  });
  it('calculates bounded canonical service totals and averages using integer cents', () => {
    const packet = comparisonPacket();
    let result = ask('How much would deep clean and standard clean cost together?', packet);
    expect(result.plan).toMatchObject({ entity: 'service', operation: 'calculate', calculation: 'sum', source: 'named_services' });
    expect(result.status).toBe('answerable'); expect(result.value.totalCents).toBe(25000);
    expect(formatBusinessAnswer(result)).toContain('Total: $250.00');
    expect(result.evidence.map(item => item.cents)).toEqual([15000, 10000]);
    result = ask('What is the average price of my services?', packet);
    expect(result.status).toBe('answerable'); expect(result.value.averageCents).toBe(12500);
    expect(formatBusinessAnswer(result)).toContain('Average: $125.00');
    packet.services[0].priceCents = 10000; packet.services[1].priceCents = 10001;
    result = ask('What is the average price of my services?', packet);
    expect(result.value.averageCents).toBe(10001);
    expect(formatBusinessAnswer(result)).toContain('Rounded to the nearest cent');
  });
  it('calculates only explicitly requested service operands despite overlapping classifications', () => {
    const packet = comparisonPacket();
    packet.services.push({ ...packet.services[1], id: 'other-deep', name: 'Other Deep', priceCents: 20000 });
    const result = ask('How much would Canonical Deep and Canonical Standard cost together?', packet);
    expect(result.status).toBe('answerable'); expect(result.confidence.state).toBe('sufficient');
    expect(result.value.totalCents).toBe(25000); expect(result.value.count).toBe(2);
    expect(result.usedReferences.map(ref => ref.id)).toEqual(['deep', 'standard']);
    expect(formatBusinessAnswer(result)).not.toContain('Other Deep');
    const three = ask('How much would Canonical Deep, Other Deep and Canonical Standard cost together?', packet);
    expect(three.value.totalCents).toBe(45000); expect(three.value.count).toBe(3);
    const context = ask('Compare Canonical Deep and Canonical Standard', packet).context;
    for (const message of ["What's the total together?", "What's the total for those two services?"]) {
      expect(ask(message, packet, context).value.totalCents).toBe(25000);
      expect(ask(message, packet, context).usedReferences.map(ref => ref.id)).toEqual(['deep', 'standard']);
    }
  });
  it('keeps named service operands inside the authorized packet and rejects stale pair references', () => {
    const services = [
      { id: 'standard', tenantId: 'a', name: 'Standard', serviceType: 'standard', active: true, priceCents: 10000, durationMinutes: 90 },
      { id: 'deep', tenantId: 'a', name: 'Canonical Deep', serviceType: 'deep', active: true, priceCents: 15000, durationMinutes: 120 },
      { id: 'foreign', tenantId: 'b', name: 'Canonical Deep', serviceType: 'deep', active: true, priceCents: 90000, durationMinutes: 120 },
    ];
    const packet = comparisonPacket({ services }); const before = structuredClone(packet);
    const question = 'How much would Canonical Deep and Standard cost together?';
    expect(ask(question, packet).value.totalCents).toBe(25000);
    expect(ask(question, comparisonPacket({ services, authorized: false })).status).toBe('insufficient_evidence');
    const pair = ask('Compare Canonical Deep and Standard', packet).context;
    expect(ask("What's the total together?", packet, { ...pair, tenantId: 'b' }).confidence.state).toBe('invalid_stale_evidence');
    expect(ask("What's the total together?", packet, {}).status).toBe('needs_clarification');
    expect(ask("What's the total together?", { ...packet, services: packet.services.slice(0, 1) }, pair).confidence.state).toBe('invalid_stale_evidence');
    expect(packet).toEqual(before);
  });
  it.each([
    ['deep clean and standard clean', 'needs_clarification'],
    ['Canonical Deep Deluxe and Canonical Standard', 'insufficient_evidence'],
    ['Canonical Deep and Canonical Deep', 'needs_clarification'],
  ])('fails closed for unresolved named calculation operands: %s', (names, status) => {
    const packet = comparisonPacket(); packet.services.push({ ...packet.services[1], id: 'other-deep', name: 'Other Deep' });
    const result = ask(`How much would ${names} cost together?`, packet);
    expect(result.status).toBe(status); expect(result.confidence.state).toBe(status);
    expect(result.value).toBeUndefined();
  });
  it('reuses the established comparison pair for a follow-up total without selecting services', () => {
    const packet = comparisonPacket(); const comparison = ask('Compare deep clean and standard clean', packet);
    const result = ask("What's the total together?", packet, comparison.context);
    expect(result.status).toBe('answerable'); expect(result.usedReferences).toEqual(comparison.usedReferences);
    expect(result.value.totalCents).toBe(25000);
    expect(formatBusinessAnswer(result)).toContain('Canonical Deep: $150.00');
  });
  it('calculates only an explicit bounded next-booking set from validated saved amounts', () => {
    const packet = relationshipPacket();
    let result = ask('What are my next 2 bookings worth?', packet);
    expect(result.plan).toMatchObject({ entity: 'booking', operation: 'calculate', calculation: 'sum', source: 'next_bookings', count: 2 });
    expect(result.status).toBe('answerable'); expect(result.value.totalCents).toBe(43000);
    expect(result.usedReferences).toEqual([{ type: 'booking', id: 'sarah' }, { type: 'booking', id: 'jordan' }]);
    result = ask('What is the average amount of my next 2 bookings?', packet);
    expect(result.status).toBe('answerable'); expect(result.value.averageCents).toBe(21500);
    expect(formatBusinessAnswer(result)).toContain('Average: $215.00');
  });
  it('fails closed for ambiguous context, invalid amounts, oversized sets and unavailable records', () => {
    const packet = comparisonPacket();
    expect(ask("What's the total together?", packet).status).toBe('needs_clarification');
    expect(ask('What are my next 6 bookings worth?', relationshipPacket()).status).toBe('needs_clarification');
    expect(ask('What are my next 3 bookings worth?', relationshipPacket()).status).toBe('insufficient_evidence');
    const invalidBooking = relationshipPacket(); invalidBooking.bookings[0].amount = 180.123;
    expect(ask('What are my next 2 bookings worth?', invalidBooking).status).toBe('insufficient_evidence');
    const zeroBooking = relationshipPacket(); zeroBooking.bookings[0].amount = 0;
    expect(ask('What are my next 2 bookings worth?', zeroBooking).value.totalCents).toBe(25000);
    const invalidPrice = comparisonPacket(); invalidPrice.services[1].priceCents = null;
    expect(ask('How much would deep clean and standard clean cost together?', invalidPrice).status).toBe('insufficient_evidence');
    const comparison = ask('Compare deep clean and standard clean', comparisonPacket());
    expect(ask("What's the total together?", comparisonPacket({ services: [comparisonPacket().services[0]] }), comparison.context).status).toBe('insufficient_evidence');
    const unavailableCatalog = comparisonPacket({ catalogReady: false });
    expect(ask('What is the average price of my services?', unavailableCatalog).status).toBe('insufficient_evidence');
    expect(ask('What are my next 2 bookings worth?', relationshipPacket({ authorized: false })).status).toBe('insufficient_evidence');
  });
  it('normalizes bounded tenant-local temporal constraints before existing booking queries', () => {
    const temporalNow = new Date('2026-10-04T05:00:00Z'); // Midnight October 4 in America/Chicago.
    const packet = data({ timeZone: 'America/Chicago', now: temporalNow, bookings: [
      { id: 'today-start', tenantId: 'a', customerId: 'today', customerName: 'Today', status: 'scheduled', serviceType: 'standard', agreedPrice: 100, date: '2026-10-04', startTime: '00:01' },
      { id: 'tomorrow-first', tenantId: 'a', customerId: 'tomorrow', customerName: 'Tomorrow', status: 'scheduled', serviceType: 'deep', agreedPrice: 200, date: '2026-10-05', startTime: '08:00' },
      { id: 'week-end', tenantId: 'a', customerId: 'week', customerName: 'Week', status: 'scheduled', serviceType: 'deep', agreedPrice: 300, date: '2026-10-10', startTime: '09:00' },
      { id: 'next-week', tenantId: 'a', customerId: 'next-week', customerName: 'Next week', status: 'scheduled', serviceType: 'deep', agreedPrice: 400, date: '2026-10-11', startTime: '09:00' },
      { id: 'cancelled', tenantId: 'a', customerId: 'cancelled', customerName: 'Cancelled', status: 'cancelled', serviceType: 'deep', agreedPrice: 500, date: '2026-10-05' },
      { id: 'foreign-temporal', tenantId: 'b', customerId: 'foreign', customerName: 'Foreign', status: 'scheduled', serviceType: 'deep', agreedPrice: 999, date: '2026-10-05' },
    ] });
    const options = { now: temporalNow };
    let result = answerBusinessQuestion('How many bookings do I have today?', packet, {}, options);
    expect(result.status).toBe('answerable'); expect(result.plan.temporal).toMatchObject({ kind: 'today' });
    expect(result.usedReferences).toEqual([{ type: 'booking', id: 'today-start' }]);
    result = answerBusinessQuestion("What's my first booking tomorrow?", packet, {}, options);
    expect(result.status).toBe('answerable'); expect(result.context.selected).toEqual({ type: 'booking', id: 'tomorrow-first' });
    result = answerBusinessQuestion('How many bookings do I have this week?', packet, {}, options);
    expect(result.usedReferences.map(reference => reference.id)).toEqual(['today-start']);
    result = answerBusinessQuestion('How many bookings do I have this week?', packet, {}, { now: new Date('2026-10-05T05:00:00Z') });
    expect(result.usedReferences.map(reference => reference.id)).toEqual(['tomorrow-first', 'week-end', 'next-week']);
    result = answerBusinessQuestion('Who do I have Sunday?', packet, {}, options);
    expect(result.usedReferences.map(reference => reference.id)).toEqual(['today-start']);
    result = answerBusinessQuestion('How many bookings are on 10/10?', packet, {}, options);
    expect(result.usedReferences.map(reference => reference.id)).toEqual(['week-end']);
    result = answerBusinessQuestion('How much are my bookings tomorrow worth?', packet, {}, options);
    expect(result.status).toBe('answerable'); expect(result.value.totalCents).toBe(20000);
    result = answerBusinessQuestion("What's the average booking amount this week?", packet, {}, { now: new Date('2026-10-05T05:00:00Z') });
    expect(result.value.averageCents).toBe(30000);
  });
  it('keeps temporal evidence bounded and fails closed without a valid timezone or date', () => {
    const temporalNow = new Date('2026-10-04T05:00:00Z');
    const packet = data({ timeZone: 'America/Chicago', now: temporalNow });
    expect(answerBusinessQuestion('How many bookings do I have tomorrow?', packet, {}, { now: temporalNow }).status).toBe('answerable');
    expect(answerBusinessQuestion('How many bookings do I have tomorrow?', { ...packet, timeZone: '' }, {}, { now: temporalNow }).status).toBe('insufficient_evidence');
    expect(answerBusinessQuestion('How many bookings are on 2/30?', packet, {}, { now: temporalNow }).status).toBe('insufficient_evidence');
    expect(answerBusinessQuestion('Optimize my schedule tomorrow', packet, {}, { now: temporalNow }).status).toBe('unsupported');
  });
  it('treats temporal language as a constraint rather than workflow-intent authority', () => {
    const packet = data({ timeZone: 'America/Chicago' });
    expect(answerBusinessQuestion('What should I work on today?', packet).status).toBe('unsupported');
    expect(answerBusinessQuestion("Help me market tomorrow's openings.", packet).status).toBe('unsupported');
    expect(answerBusinessQuestion('What do I have tomorrow?', packet).status).toBe('answerable');
  });
  it('reports equal prices without selecting a winner', () => {
    const packet = comparisonPacket(); packet.services[1].priceCents = 10000;
    const result = ask('Compare deep clean and standard clean', packet);
    expect(result.value.differenceCents).toBe(0); expect(result.value.cheaper).toHaveLength(2);
    expect(formatBusinessAnswer(result)).toContain('same configured price');
    expect(formatBusinessAnswer(result)).toContain('difference: $0.00');
  });
  it('supports an explicit multi-service price range but never guesses a pair from three', () => {
    const packet = comparisonPacket(); packet.services.push({ type: 'service', id: 'moveout', name: 'Moveout', serviceType: 'moveout', priceCents: 20000 });
    const result = ask('Compare deep clean, standard clean and moveout', packet);
    expect(result.status).toBe('answerable'); expect(result.evidence).toHaveLength(3);
    expect(result.value.differenceCents).toBe(10000);
    expect(ask('Which is cheaper?', packet, result.context).status).toBe('answerable');
    expect(ask('Compare those two', packet, result.context).status).toBe('needs_clarification');
  });
  it('fails closed for missing, duplicate, ambiguous and unpriced service identities', () => {
    const packet = comparisonPacket();
    expect(ask('Which is cheaper?', packet).status).toBe('needs_clarification');
    expect(ask('Compare deep clean', packet).status).toBe('needs_clarification');
    expect(ask('Compare deep clean and deep clean', packet).status).toBe('needs_clarification');
    expect(ask('Compare imaginary clean and standard clean', packet).status).toBe('insufficient_evidence');
    packet.services.push({ ...packet.services[1], id: 'deep-2', name: 'Other Deep' });
    expect(ask('Compare deep clean and standard clean', packet).status).toBe('needs_clarification');
    packet.services.pop(); packet.services[1].priceCents = null;
    expect(ask('Compare deep clean and standard clean', packet).status).toBe('insufficient_evidence');
    expect(formatBusinessAnswer(ask('Compare deep clean and standard clean', packet))).toContain('price is unavailable');
  });
  it('rejects stale, foreign, suspended and single-service context without borrowing a catalog default', () => {
    const packet = comparisonPacket(); const context = ask('Compare deep clean and standard clean', packet).context;
    for (const invalid of [{ ...context, tenantId: 'b' }, { ...context, suspended: true }, {},
      { ...context, list: [{ type: 'booking', id: 'first' }] }]) {
      expect(ask('Which is cheaper?', packet, invalid).status).toBe('needs_clarification');
    }
    expect(ask('Which is cheaper?', { ...packet, services: packet.services.slice(1) }, context).status).toBe('insufficient_evidence');
    expect(ask('Which is cheaper?', packet, ask('What services do we offer?', data()).context).status).toBe('needs_clarification');
    expect(ask('Compare deep clean and standard clean', data({ authorized: false })).status).toBe('insufficient_evidence');
    expect(ask('Compare deep clean and standard clean', comparisonPacket({ catalogReady: false })).status).toBe('insufficient_evidence');
  });
  it.each(['Compare service profit margins', 'Which service is best?', 'Compare customer quotes', 'Compare service durations',
    'Compare deep clean and standard clean and write a post', 'Do not compare these services'])('does not intercept unsupported comparison/workflow: %s', message => {
    expect(ask(message, comparisonPacket()).status).toBe('unsupported');
  });
  it.each(['How many bookings do I have coming up?', 'How many jobs are on my schedule?', 'Count upcoming appointments'])('converges booking counts: %s', message => {
    expect(interpretBusinessQuestion(message).plan).toMatchObject({ entity: 'booking', operation: 'count', field: null, temporal: 'upcoming' });
    const result = ask(message, data());
    expect(result.status).toBe('answerable'); expect(result.evidence).toHaveLength(2);
    expect(formatBusinessAnswer(result)).toContain('2 upcoming bookings');
  });
  it.each(["Who's coming up?", "Who's next?", 'Who is my next customer?'])('identifies upcoming booking and customer: %s', message => {
    const result = ask(message, data());
    expect(result.status).toBe('answerable'); expect(result.context.selected.id).toBe('first');
    expect(formatBusinessAnswer(result)).toContain('Synthetic A');
  });
  it.each([
    ["What's their number?", 'phone', '555-0110'], ['What is their phone?', 'phone', '555-0110'],
    ["What's their email?", 'email', 'a@example.test'], ['Show their email', 'email', 'a@example.test'],
    ['What service are they getting?', 'service', 'Standard Cleaning'], ['Tell me their service', 'service', 'Standard Cleaning'],
    ['What are we charging them?', 'price', '$180.00'], ['What is the cost of that job?', 'price', '$180.00'],
    ['When are they coming?', 'date', '2026-10-04 at 13:00'], ['What time is that booking?', 'date', '13:00'],
    ['Who is that customer?', 'customer', 'Synthetic A'],
  ])('maps lookup slots and validated values: %s', (message, field, expected) => {
    const packet = data(); const context = ask("Who's next?", packet).context;
    const result = ask(message, packet, context);
    expect(result.plan).toMatchObject({ operation: 'lookup', field });
    expect(result.status).toBe('answerable'); expect(result.usedReferences).toEqual([{ type: 'booking', id: 'first' }]);
    expect(formatBusinessAnswer(result)).toContain(expected);
  });
  it.each(['List available services', 'What services do we offer?', 'Show services we have'])('lists canonical catalog: %s', message => {
    const result = ask(message, data()); expect(result.plan).toMatchObject({ operation: 'list', entity: 'service' });
    expect(formatBusinessAnswer(result)).toContain('Canonical Standard: $185.00, 90 minutes');
  });
  it('consumes existing typed context through topic changes and canonical service selection', () => {
    const packet = data(); const before = JSON.stringify(packet);
    let result = ask("Who's next?", packet);
    result = ask('Who is that customer?', packet, result.context);
    result = ask('What services do we offer?', packet, result.context);
    result = ask('What is the price of that service?', packet, result.context);
    expect(formatBusinessAnswer(result)).toContain('$185.00');
    result = ask('Go back to that customer.', packet, result.context);
    result = ask("What's their email?", packet, result.context);
    expect(formatBusinessAnswer(result)).toContain('a@example.test');
    expect(result.context.selected.id).toBe('first'); expect(JSON.stringify(packet)).toBe(before);
  });
  it('distinguishes missing evidence from ambiguity, reset, foreign and stale references', () => {
    const packet = data(); const context = ask("Who's next?", packet).context;
    for (const invalid of [{}, { ...context, tenantId: 'b' }, { ...context, selected: { type: 'booking', id: 'removed' } }, { ...context, selected: null }, { ...context, suspended: true }]) {
      expect(ask("What's their email?", packet, invalid).status).toBe('needs_clarification');
    }
    const second = resolveOwnerContext({ domain: 'detail', input: 'second' }, packet, context).context;
    const missing = ask("What's their email?", packet, second);
    expect(missing.status).toBe('insufficient_evidence'); expect(formatBusinessAnswer(missing)).toContain('unavailable');
    expect(formatBusinessAnswer(missing)).not.toContain('Email: .');
    expect(ask("Who's next?", data({ authorized: false })).status).toBe('insufficient_evidence');
    expect(ask('What services do we offer?', data({ catalogReady: false })).status).toBe('insufficient_evidence');
  });
  it('keeps explicit replacement and bounded temporal queries canonical', () => {
    const packet = data(); const context = ask("Who's next?", packet).context;
    const nextDay = ask('How many jobs are scheduled tomorrow?', packet, context);
    expect(nextDay.evidence.map(item => item.reference.id)).toEqual(['second']);
    const second = ask('Who is the second customer?', packet, context);
    expect(second.context.selected.id).toBe('second');
    expect(ask("What's their email?", packet, second.context).status).toBe('insufficient_evidence');
    expect(ask('Go back to the first customer.', packet, second.context).context.selected.id).toBe('first');
    expect(formatBusinessAnswer(ask('What is the email of my next booking?', packet))).toContain('a@example.test');
  });
  it.each(['Create a marketing post', 'Write a message for them', 'Check my reputation', 'Review opportunities', 'Give me my business briefing', 'Review this estimate', 'Which estimates are still open?', 'Have they used us before?', 'Refund that customer', 'Show bookings next week', 'Do not show their email', 'Show their email and create a post'])('preserves existing routing for %s', message => {
    expect(ask(message, data()).status).toBe('unsupported');
  });
  it('rejects invalid plans and never includes raw documents in evidence', () => {
    expect(queryBusinessFacts({ version: 99 }, data()).status).toBe('unsupported');
    const result = ask("What's their email?", data(), ask("Who's next?", data()).context);
    expect(result.evidence).toEqual([{ reference: { type: 'booking', id: 'first' }, fields: ['email'] }]);
    expect(result.evidence[0]).not.toHaveProperty('contact');
  });
});
