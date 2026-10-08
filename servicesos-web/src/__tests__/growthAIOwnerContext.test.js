import { describe, expect, it } from 'vitest';
import { buildOwnerContext, resolveOwnerContext } from '../modules/growthAI/growthAIOwnerContext';
import { resolveOwnerContextRequest } from '../modules/growthAI/growthAIOwnerVocabulary';
import { answerBusinessQuestion } from '../modules/growthAI/growthAIBusinessIntelligence';
import { routeGrowthAIConversation } from '../modules/growthAI/growthAIConversation';

const now = new Date('2026-10-04T12:00:00Z');
const booking = (id, extra = {}) => ({ id, tenantId: 'a', customerId: 'customer-a', customerName: 'Synthetic A',
  serviceType: 'standard', status: 'scheduled', date: '2026-10-05', startTime: '10:00', agreedPrice: 180, ...extra });
const lead = (id, extra = {}) => ({ id, tenantId: 'a', customerId: 'customer-a', customerName: 'Synthetic A', status: 'quoted',
  createdAt: '2026-10-01T12:00:00Z', requestSnapshot: { cleaningType: 'standard' }, estimate: { priceLow: 170, priceHigh: 190 }, ...extra });
const service = (id, extra = {}) => ({ id, name: 'Standard Cleaning', serviceType: 'standard', active: true, priceCents: 18000, durationMinutes: 90, ...extra });
const packet = extra => buildOwnerContext({ tenantId: 'a', authorized: true, ready: true, catalogReady: true, timeZone: 'UTC', now,
  bookings: [booking('b1', { leadId: 'e1' }), booking('b2', { startTime: '12:00', customerId: 'customer-b', customerName: 'Synthetic B' }), booking('past', { date: '2026-09-01', status: 'completed' })],
  leads: [lead('e1'), lead('e2', { createdAt: '2026-10-02T12:00:00Z', customerId: 'customer-b' })], services: [service('s1'), service('s2', { name: 'Deep Cleaning', serviceType: 'deep' })], ...extra });
const ask = (input, data, context) => resolveOwnerContext(resolveOwnerContextRequest(input), data, context, { now });

describe('legacy explicit booking contact-info integrity', () => {
  const contactPacket = () => packet({ bookings: [booking('a', { customerSnapshot: { phone: '555-0110', email: 'a@example.test' } }),
    booking('b', { customerId: 'customer-b', customerName: 'Synthetic B', date: '2026-10-06', customerSnapshot: { phone: '555-0111', email: 'b@example.test' } })] });
  it('clarifies conflict, preserves clean contact output and returns coherent selected phone without mutation', () => {
    const data = contactPacket(); const original = JSON.stringify(data); const a = ask('What jobs do I have coming up?', data).context;
    const conflict = ask("What is Synthetic B's contact info for that job?", data, a);
    expect(conflict.kind).toBe('clarify'); expect(conflict.content).not.toContain('555-0110'); expect(conflict.content).not.toContain('Synthetic A:');
    const b = ask("What is Synthetic B's contact info?", data, a);
    expect(b.content).toContain('555-0111'); expect(b.content).toContain('b@example.test'); expect(b.context.selected.id).toBe('b');
    const coherent = ask("What is Synthetic B's contact info for that job?", data, b.context);
    expect(coherent.content).toContain('555-0111'); expect(coherent.content).not.toMatch(/555-0110|b@example.test/);
    expect(ask("What is Synthetic A's contact info for that job?", data, a).content).toContain('555-0110');
    const contextual = ask('What is their contact info for that job?', data, a);
    expect(contextual.context.selected.id).toBe('a'); expect(contextual.content).toContain('Synthetic A: Standard Cleaning');
    expect(contextual.content).not.toContain('555-0111'); expect(JSON.stringify(data)).toBe(original);
  });
  it.each(['reset', 'tenant', 'removed', 'missing', 'foreign', 'suspended'])('refuses %s legacy contextual contact-info reference', scenario => {
    const data = contactPacket(); const a = ask('What jobs do I have coming up?', data).context;
    const b = ask("What is Synthetic B's contact info?", data, a).context;
    const contexts = { reset: {}, tenant: { ...b, tenantId: 'other' }, removed: { ...b, selected: { type: 'booking', id: 'removed' } },
      missing: { ...b, selected: null }, foreign: { ...b, selected: { type: 'booking', id: 'foreign' } }, suspended: { ...b, suspended: true } };
    const result = ask("What is Synthetic B's contact info for that job?", data, contexts[scenario]);
    expect(result.kind).toBe('clarify'); expect(result.content).not.toMatch(/555-0110|555-0111/);
  });
  it('requires canonical identity and preserves selected booking for multiple same-customer bookings', () => {
    const data = contactPacket(); const a = ask('What jobs do I have coming up?', data).context;
    const b = ask("What is Synthetic B's contact info?", data, a).context;
    expect(ask("What is Unknown's contact info for that job?", data, a).kind).toBe('clarify');
    data.bookings.push({ ...data.bookings[1], id: 'duplicate', customerId: 'different' });
    expect(ask("What is Synthetic B's contact info for that job?", data, b).kind).toBe('clarify');
    data.bookings[2].customerId = 'customer-b';
    expect(ask("What is Synthetic B's contact info for that job?", data, b).content).toContain('555-0111');
    data.bookings[1].customerId = '';
    expect(ask("What is Synthetic B's contact info for that job?", data, b).kind).toBe('clarify');
  });
  it('reports missing selected phone rather than substituting A or email', () => {
    const data = contactPacket(); const a = ask('What jobs do I have coming up?', data).context;
    const b = ask("What is Synthetic B's contact info?", data, a).context;
    data.bookings[1].contact.phone = '';
    const result = ask("What is Synthetic B's contact info for that job?", data, b);
    expect(result.content).toContain('unavailable'); expect(result.content).not.toMatch(/555-0110|b@example.test/);
  });
});

describe('legacy explicit booking email integrity', () => {
  const emailPacket = () => packet({ bookings: [booking('a', { customerSnapshot: { email: 'a@example.test' } }),
    booking('b', { customerId: 'customer-b', customerName: 'Synthetic B', date: '2026-10-06', customerSnapshot: { email: 'b@example.test' } })] });
  it('clarifies conflicting B, preserves clean replacement and returns only coherent email without mutation', () => {
    const data = emailPacket(); const original = JSON.stringify(data); const a = ask('What jobs do I have coming up?', data).context;
    const conflict = ask("What is Synthetic B's email address for that job?", data, a);
    expect(conflict.kind).toBe('clarify'); expect(conflict.content).not.toContain('a@example.test'); expect(conflict.content).not.toContain('Synthetic A:');
    const b = ask("What is Synthetic B's email address?", data, a);
    expect(b.content).toContain('b@example.test'); expect(b.context.selected.id).toBe('b');
    expect(ask("What is Synthetic B's email address for that job?", data, b.context).content).toContain('b@example.test');
    expect(ask("What is Synthetic A's email address for that job?", data, a).content).toContain('a@example.test');
    const contextual = ask('What is their email address for that job?', data, a);
    expect(contextual.context.selected.id).toBe('a'); expect(contextual.content).toContain('Synthetic A: Standard Cleaning');
    expect(contextual.content).not.toContain('b@example.test'); expect(JSON.stringify(data)).toBe(original);
  });
  it.each(['reset', 'tenant', 'removed', 'missing', 'foreign', 'suspended'])('refuses %s legacy contextual email reference', scenario => {
    const data = emailPacket(); const a = ask('What jobs do I have coming up?', data).context;
    const b = ask("What is Synthetic B's email address?", data, a).context;
    const contexts = { reset: {}, tenant: { ...b, tenantId: 'other' }, removed: { ...b, selected: { type: 'booking', id: 'removed' } },
      missing: { ...b, selected: null }, foreign: { ...b, selected: { type: 'booking', id: 'foreign' } }, suspended: { ...b, suspended: true } };
    const result = ask("What is Synthetic B's email address for that job?", data, contexts[scenario]);
    expect(result.kind).toBe('clarify'); expect(result.content).not.toMatch(/a@example.test|b@example.test/);
  });
  it('requires canonical identity and preserves selected booking rather than rematching duplicate same-customer names', () => {
    const data = emailPacket(); const a = ask('What jobs do I have coming up?', data).context;
    const b = ask("What is Synthetic B's email address?", data, a).context;
    expect(ask("What is Unknown's email address for that job?", data, a).kind).toBe('clarify');
    data.bookings.push({ ...data.bookings[1], id: 'duplicate', customerId: 'different' });
    expect(ask("What is Synthetic B's email address for that job?", data, b).kind).toBe('clarify');
    data.bookings[2].customerId = 'customer-b';
    expect(ask("What is Synthetic B's email address for that job?", data, b).content).toContain('b@example.test');
    data.bookings[1].customerId = '';
    expect(ask("What is Synthetic B's email address for that job?", data, b).kind).toBe('clarify');
  });
  it('reports missing selected B email without substituting A', () => {
    const data = emailPacket(); const a = ask('What jobs do I have coming up?', data).context;
    const b = ask("What is Synthetic B's email address?", data, a).context;
    data.bookings[1].contact.email = '';
    const result = ask("What is Synthetic B's email address for that job?", data, b);
    expect(result.content).toContain('unavailable'); expect(result.content).not.toContain('a@example.test');
  });
});

describe('legacy explicit booking phone integrity', () => {
  const phonePacket = () => packet({ bookings: [booking('a', { customerSnapshot: { phone: '555-0110' } }),
    booking('b', { customerId: 'customer-b', customerName: 'Synthetic B', date: '2026-10-06', customerSnapshot: { phone: '555-0111' } })] });
  it('clarifies conflicting B, preserves clean replacement and returns only coherent phone without mutation', () => {
    const data = phonePacket(); const original = JSON.stringify(data); const a = ask('What jobs do I have coming up?', data).context;
    const conflict = ask("What is Synthetic B's phone number for that job?", data, a);
    expect(conflict.kind).toBe('clarify'); expect(conflict.content).not.toContain('555-0110'); expect(conflict.content).not.toContain('Synthetic A:');
    const b = ask("What is Synthetic B's phone number?", data, a);
    expect(b.content).toContain('555-0111'); expect(b.context.selected.id).toBe('b');
    expect(ask("What is Synthetic B's phone number for that job?", data, b.context).content).toContain('555-0111');
    expect(ask("What is Synthetic A's phone number for that job?", data, a).content).toContain('555-0110');
    const contextual = ask('What is their phone number for that job?', data, a);
    expect(contextual.context.selected.id).toBe('a'); expect(contextual.content).not.toContain('555-0111');
    expect(JSON.stringify(data)).toBe(original);
  });
  it.each(['reset', 'tenant', 'removed', 'missing', 'foreign', 'suspended'])('refuses %s legacy contextual phone reference', scenario => {
    const data = phonePacket(); const a = ask('What jobs do I have coming up?', data).context;
    const b = ask("What is Synthetic B's phone number?", data, a).context;
    const contexts = { reset: {}, tenant: { ...b, tenantId: 'other' }, removed: { ...b, selected: { type: 'booking', id: 'removed' } },
      missing: { ...b, selected: null }, foreign: { ...b, selected: { type: 'booking', id: 'foreign' } }, suspended: { ...b, suspended: true } };
    const result = ask("What is Synthetic B's phone number for that job?", data, contexts[scenario]);
    expect(result.kind).toBe('clarify'); expect(result.content).not.toMatch(/555-0110|555-0111/);
  });
  it('requires canonical identity but retains selected booking rather than rematching duplicate same-customer names', () => {
    const data = phonePacket(); const a = ask('What jobs do I have coming up?', data).context;
    const b = ask("What is Synthetic B's phone number?", data, a).context;
    expect(ask("What is Unknown's phone number for that job?", data, a).kind).toBe('clarify');
    data.bookings.push({ ...data.bookings[1], id: 'duplicate', customerId: 'different' });
    expect(ask("What is Synthetic B's phone number for that job?", data, b).kind).toBe('clarify');
    data.bookings[2].customerId = 'customer-b';
    expect(ask("What is Synthetic B's phone number for that job?", data, b).content).toContain('555-0111');
    data.bookings[1].customerId = '';
    expect(ask("What is Synthetic B's phone number for that job?", data, b).kind).toBe('clarify');
  });
  it('reports missing selected B phone without substituting A', () => {
    const data = phonePacket(); const a = ask('What jobs do I have coming up?', data).context;
    const b = ask("What is Synthetic B's phone number?", data, a).context;
    data.bookings[1].contact.phone = '';
    const result = ask("What is Synthetic B's phone number for that job?", data, b);
    expect(result.content).toContain('unavailable'); expect(result.content).not.toContain('555-0110');
  });
});

describe('legacy explicit booking service integrity', () => {
  const servicePacket = () => packet({ timeZone: 'America/Chicago', bookings: [booking('a'),
    booking('b', { customerId: 'customer-b', customerName: 'Synthetic B', serviceType: 'deep', date: '2026-10-06', startTime: '13:00' })] });
  it('clarifies conflicting B and returns only coherent service records without mutation', () => {
    const data = servicePacket(); const original = JSON.stringify(data); const a = ask('What jobs do I have coming up?', data).context;
    const conflict = ask("What is Synthetic B's service for that job?", data, a);
    expect(conflict.kind).toBe('clarify'); expect(conflict.content).not.toContain('Standard Cleaning');
    const b = ask("What is Synthetic B's service?", data, a);
    expect(b.content).toBe('Deep Cleaning'); expect(b.context.selected.id).toBe('b');
    expect(ask("What is Synthetic B's service for that job?", data, b.context).content).toBe('Deep Cleaning');
    for (const input of ["What is Synthetic A's service for that job?", 'What is their service for that job?']) {
      const result = ask(input, data, a);
      expect(result.content).toContain('Standard Cleaning'); expect(result.content).not.toContain('Deep Cleaning');
      expect(result.context.selected.id).toBe('a');
    }
    expect(JSON.stringify(data)).toBe(original);
  });
  it.each(['reset', 'tenant', 'removed', 'missing', 'foreign', 'suspended'])('refuses %s service context in legacy fallback', scenario => {
    const data = servicePacket(); const b = ask("What is Synthetic B's service?", data).context;
    const contexts = { reset: {}, tenant: { ...b, tenantId: 'other' }, removed: { ...b, selected: { type: 'booking', id: 'removed' } },
      missing: { ...b, selected: null }, foreign: { ...b, selected: { type: 'booking', id: 'foreign' } }, suspended: { ...b, suspended: true } };
    const result = ask("What is Synthetic B's service for that job?", data, contexts[scenario]);
    expect(result.kind).toBe('clarify'); expect(result.content).not.toMatch(/Standard Cleaning|Deep Cleaning/);
  });
  it('refuses unknown, ambiguous, missing-identity and multiple service bookings', () => {
    const data = servicePacket(); const a = ask('What jobs do I have coming up?', data).context;
    expect(ask("What is Synthetic Z's service for that job?", data, a).kind).toBe('clarify');
    data.bookings.push({ ...data.bookings[1], id: 'duplicate', customerId: 'different' });
    expect(ask("What is Synthetic B's service?", data, a).kind).toBe('clarify');
    data.bookings[2].customerId = 'customer-b';
    expect(ask("What is Synthetic B's service?", data, a).kind).toBe('clarify');
    const b = { ...a, selected: { type: 'booking', id: 'b' } };
    expect(ask("What is Synthetic B's service for that job?", data, b).content).toBe('Deep Cleaning');
    data.bookings[1].customerId = '';
    expect(ask("What is Synthetic B's service for that job?", data, b).kind).toBe('clarify');
  });
  it('reports missing B service instead of borrowing A service', () => {
    const data = servicePacket(); data.bookings[1].serviceType = '';
    const result = ask("What is Synthetic B's service?", data, ask('What jobs do I have coming up?', data).context);
    expect(result.content).toMatch(/unavailable/i); expect(result.content).not.toContain('Standard Cleaning');
  });
});

describe('legacy explicit appointment identity integrity', () => {
  const appointmentPacket = () => packet({ timeZone: 'America/Chicago', bookings: [booking('a'),
    booking('b', { customerId: 'customer-b', customerName: 'Synthetic B', date: '2026-10-06', startTime: '13:00' })] });
  it('clarifies explicit B with A job and preserves coherent B, same-customer A and contextual A', () => {
    const data = appointmentPacket(); const original = JSON.stringify(data);
    const a = ask('What jobs do I have coming up?', data).context;
    const conflict = ask("When is Synthetic B's appointment for that job?", data, a);
    expect(conflict.kind).toBe('clarify'); expect(conflict.content).not.toContain('2026-10-05');
    const b = ask("When is Synthetic B's appointment?", data, a);
    expect(b.content).toBe('2026-10-06 at 13:00.'); expect(b.context.selected.id).toBe('b');
    expect(ask("When is Synthetic B's appointment for that job?", data, b.context).content).toBe('2026-10-06 at 13:00.');
    for (const input of ["When is their appointment for that job?", "When is Synthetic A's appointment for that job?"]) expect(ask(input, data, a).content).toBe('2026-10-05 at 10:00.');
    expect(JSON.stringify(data)).toBe(original);
  });
  it.each(['reset', 'tenant', 'removed', 'missing', 'foreign', 'suspended'])('refuses %s appointment context in fallback', scenario => {
    const data = appointmentPacket(); const b = ask("When is Synthetic B's appointment?", data).context;
    const contexts = { reset: {}, tenant: { ...b, tenantId: 'other' }, removed: { ...b, selected: { type: 'booking', id: 'removed' } },
      missing: { ...b, selected: null }, foreign: { ...b, selected: { type: 'booking', id: 'foreign' } }, suspended: { ...b, suspended: true } };
    expect(ask("When is Synthetic B's appointment for that job?", data, contexts[scenario]).kind).toBe('clarify');
  });
  it('does not guess unknown, ambiguous, missing-identity or multiple appointment bookings', () => {
    const data = appointmentPacket(); const a = ask('What jobs do I have coming up?', data).context;
    expect(ask("When is Synthetic Z's appointment for that job?", data, a).kind).toBe('clarify');
    data.bookings.push({ ...data.bookings[1], id: 'duplicate', customerId: 'different' });
    expect(ask("When is Synthetic B's appointment?", data, a).kind).toBe('clarify');
    data.bookings[2].customerId = 'customer-b';
    expect(ask("When is Synthetic B's appointment?", data, a).kind).toBe('clarify');
    const b = { ...a, selected: { type: 'booking', id: 'b' } };
    expect(ask("When is Synthetic B's appointment for that job?", data, b).content).toBe('2026-10-06 at 13:00.');
    data.bookings[1].customerId = '';
    expect(ask("When is Synthetic B's appointment for that job?", data, b).kind).toBe('clarify');
  });
  it('retains scheduling refusal rather than exposing an invalid appointment date', () => {
    const data = appointmentPacket(); const b = ask("When is Synthetic B's appointment?", data).context;
    const invalid = packet({ timeZone: 'America/Chicago', bookings: [booking('b', { customerId: 'customer-b', customerName: 'Synthetic B', date: '2026-02-30' })] });
    expect(ask("When is Synthetic B's appointment for that job?", invalid, b)).toMatchObject({ kind: 'clarify', status: 'insufficient_evidence' });
  });
});

describe('legacy explicit booking status integrity', () => {
  const statusPacket = () => packet({ bookings: [booking('a'), booking('b', { customerId: 'customer-b', customerName: 'Synthetic B', status: 'completed', date: '2026-10-01' })] });
  it('clarifies explicit B with A current instead of returning scheduled', () => {
    const data = statusPacket(); const a = ask('What jobs do I have coming up?', data).context;
    const result = ask("What's Synthetic B's status for that job?", data, a);
    expect(result.kind).toBe('clarify'); expect(result.content).not.toContain('scheduled');
  });
  it('resolves clean B, coherent B, same-customer A and context-only A without mutation', () => {
    const data = statusPacket(); const original = JSON.stringify(data);
    const a = ask('What jobs do I have coming up?', data).context;
    const b = ask("What's Synthetic B's status?", data, a);
    expect(b.content).toBe('completed'); expect(b.context.selected.id).toBe('b');
    expect(ask("What's Synthetic B's status for that job?", data, b.context).content).toBe('completed');
    for (const input of ["What's Synthetic A's status for that job?", "What's their status for that job?"]) expect(ask(input, data, a).content).toBe('scheduled');
    expect(JSON.stringify(data)).toBe(original);
  });
  it.each(['reset', 'foreign-tenant', 'removed', 'missing', 'foreign-booking', 'suspended'])('refuses %s contextual status', scenario => {
    const data = statusPacket(); const b = ask("What's Synthetic B's status?", data).context;
    const contexts = { reset: {}, 'foreign-tenant': { ...b, tenantId: 'other' }, removed: { ...b, selected: { type: 'booking', id: 'removed' } },
      missing: { ...b, selected: null }, 'foreign-booking': { ...b, selected: { type: 'booking', id: 'foreign' } }, suspended: { ...b, suspended: true } };
    expect(ask("What's Synthetic B's status for that job?", data, contexts[scenario]).kind).toBe('clarify');
  });
  it('refuses unknown, ambiguous or multiple bookings rather than borrowing active A', () => {
    const data = statusPacket(); const a = ask('What jobs do I have coming up?', data).context;
    expect(ask("What's Synthetic Z's status for that job?", data, a).kind).toBe('clarify');
    data.bookings.push({ ...data.bookings[1], id: 'duplicate', customerId: 'different' });
    expect(ask("What's Synthetic B's status?", data, a).kind).toBe('clarify');
    data.bookings[2].customerId = 'customer-b';
    expect(ask("What's Synthetic B's status?", data, a).kind).toBe('clarify');
    const b = { ...a, selected: { type: 'booking', id: 'b' }, index: 1 };
    expect(ask("What's Synthetic B's status for that job?", data, b).content).toBe('completed');
    data.bookings[1].customerId = '';
    expect(ask("What's Synthetic B's status for that job?", data, b).kind).toBe('clarify');
  });
});

describe('legacy estimate tenant-local creation date', () => {
  const creationAnswer = (createdAt, timeZone = 'America/Chicago') => {
    const data = packet({ timeZone, bookings: [], leads: [lead('created', { createdAt })] });
    return ask('When did we create that estimate?', data, ask('Open estimates', data).context);
  };
  it.each([
    ['America/Chicago', '2026-10-04T04:59:59Z', '10/3/2026'],
    ['America/Chicago', '2026-10-04T05:00:00Z', '10/4/2026'],
    ['America/Chicago', '2026-10-04T05:00:01Z', '10/4/2026'],
    ['America/Los_Angeles', '2026-10-04T04:00:00Z', '10/3/2026'],
    ['UTC', '2026-10-04T04:00:00Z', '10/4/2026'],
    ['Asia/Tokyo', '2026-10-04T16:00:00Z', '10/5/2026'],
    ['Pacific/Kiritimati', '2026-10-04T12:00:00Z', '10/5/2026'],
  ])('uses %s calendar at %s', (timeZone, createdAt, date) => {
    expect(creationAnswer(createdAt, timeZone).content).toBe(`Created ${date}.`);
  });
  it.each([undefined, null, '', 'bad', '2026-02-30T04:00:00Z', '2026-10-04T04:00:00', '2026-10-04', new Date(NaN), NaN, Infinity, { seconds: Infinity }, { seconds: 1, nanoseconds: -1 }, { toMillis: () => { throw new Error('Invalid timestamp'); } }])('reports unusable absolute timestamp %j as unavailable', createdAt => {
    expect(creationAnswer(createdAt).content).toBe('The estimate creation date is unavailable.');
  });
  it.each(['', undefined, 'Not/AZone'])('fails closed for timezone %s', timeZone => {
    const data = packet({ timeZone, bookings: [], leads: [lead('created', { createdAt: '2026-10-04T04:00:00Z' })] });
    expect(ask('When did we create that estimate?', data, ask('Open estimates', data).context).content).toBe('The estimate creation date is unavailable.');
  });
  it.each([new Date('2026-10-04T04:00:00Z'), Date.parse('2026-10-04T04:00:00Z'), { seconds: 1791086400, nanoseconds: 0 }, { toMillis: () => 1791086400000 }, { toDate: () => new Date('2026-10-04T04:00:00Z') }])('preserves supported absolute representation %j', createdAt => {
    expect(creationAnswer(createdAt).content).toBe('Created 10/3/2026.');
  });
  it('uses the current packet zone and preserves selected estimate, pricing and customer without mutation', () => {
    const data = packet({ timeZone: 'America/Chicago', bookings: [], leads: [lead('created', { createdAt: '2026-10-04T04:00:00Z' })] });
    const context = ask('Open estimates', data).context;
    const before = JSON.stringify(data);
    const result = ask('When did we create that estimate?', data, context);
    expect(result.context.selected).toEqual(context.selected);
    expect(ask('What did we quote them?', data, result.context).content).toContain('$170.00 to $190.00');
    expect(ask('When did we create that estimate?', { ...data, timeZone: 'Pacific/Kiritimati' }, context).content).toBe('Created 10/4/2026.');
    for (const candidate of [undefined, { ...context, tenantId: 'foreign' }]) expect(ask('When did we create that estimate?', data, candidate).kind).toBe('clarify');
    expect(ask('When did we create that estimate?', { ...data, estimates: [] }, context).kind).toBe('clarify');
    expect(JSON.stringify(data)).toBe(before);
  });
  it('formats the actual selected estimate creation instant in Chicago, not the host zone', () => {
    const data = packet({ timeZone: 'America/Chicago', bookings: [], leads: [lead('created', { createdAt: '2026-10-04T04:00:00Z' })] });
    const context = ask('Open estimates', data).context;
    const input = 'When did we create that estimate?';
    expect(answerBusinessQuestion(input, data, context).status).toBe('unsupported');
    const route = routeGrowthAIConversation(input);
    expect(route).toMatchObject({ kind: 'owner_context', request: { domain: 'date' } });
    expect(resolveOwnerContext(route.request, data, context, { now }).content).toContain('Created 10/3/2026.');
  });
});

describe('legacy contextual linked-estimate integrity', () => {
  it('does not let legacy amount fallback discard explicit B with current A', () => {
    const data = packet(); const context = ask('What jobs do I have coming up?', data).context;
    const result = ask('How much are we charging Synthetic B for that job?', data, context);
    expect(result.kind).toBe('clarify');
    expect(result.content).not.toContain('$180.00');
  });
  const linkedPacket = (bookingExtra = {}, estimateExtra = {}, extra = {}) => packet({
    bookings: [booking('a', { leadId: 'ea', ...bookingExtra })],
    leads: [lead('ea', estimateExtra)], ...extra,
  });
  it('rejects another customer estimate through actual contextual routing', () => {
    const data = packet({ bookings: [booking('a', { leadId: 'eb' })],
      leads: [lead('eb', { customerId: 'customer-b', customerName: 'Synthetic B', estimate: { priceLow: 240, priceHigh: 260 } })] });
    const context = ask('What jobs do I have coming up?', data).context;
    const input = 'What did we quote them for that job?';
    const route = routeGrowthAIConversation(input);
    expect(context.selected).toEqual({ type: 'booking', id: 'a' });
    expect(data.bookings[0].customerId).toBe('customer-a');
    expect(data.estimates[0].customerId).toBe('customer-b');
    expect(route.kind).toBe('owner_context');
    expect(route.request.explicitName).toBeUndefined();
    expect(answerBusinessQuestion(input, data, context).status).toBe('unsupported');
    const result = resolveOwnerContext(route.request, data, context, { now });
    expect(result.kind).toBe('clarify');
    expect(result.content).not.toContain('$240.00');
    expect(result.context).toBeUndefined();
    expect(context.selected).toEqual({ type: 'booking', id: 'a' });
  });
  it.each(['What did we quote them for that job?', 'What did we quote them?', 'What did we tell them?'])('preserves valid contextual quote: %s', input => {
    const data = linkedPacket();
    const context = ask('What jobs do I have coming up?', data).context;
    const before = JSON.stringify(data);
    const result = ask(input, data, context);
    expect(result.kind).toBe('answer');
    expect(result.content).toContain('$170.00 to $190.00');
    expect(result.context.selected).toEqual(context.selected);
    expect(JSON.stringify(data)).toBe(before);
  });
  it.each([
    [{ customerId: '' }, {}],
    [{ customerId: undefined }, {}],
    [{}, { customerId: '' }],
    [{}, { customerId: undefined }],
    [{ customerId: '' }, { customerId: '' }],
  ])('rejects missing canonical identity even with matching names', (bookingExtra, estimateExtra) => {
    const data = linkedPacket(bookingExtra, estimateExtra);
    const result = ask('What did we quote them for that job?', data, ask('What jobs do I have coming up?', data).context);
    expect(result.kind).toBe('clarify');
    expect(result.content).not.toContain('$170.00');
  });
  it('does not replace a mismatched link with another same-customer estimate', () => {
    const data = linkedPacket({ leadId: 'eb' }, {}, { leads: [lead('ea'), lead('eb', { customerId: 'customer-b', estimate: { priceLow: 240, priceHigh: 260 } })] });
    const context = ask('What jobs do I have coming up?', data).context;
    const result = ask('What did we quote them for that job?', data, context);
    expect(result.kind).toBe('clarify');
    expect(result.content).not.toMatch(/\$170|\$240/);
    expect(result.context).toBeUndefined();
  });
  it('keeps the selected booking anchor with multiple bookings for one customer', () => {
    const data = linkedPacket({}, {}, { bookings: [booking('a', { leadId: 'ea' }), booking('later', { leadId: 'eb', startTime: '12:00' })],
      leads: [lead('ea'), lead('eb', { estimate: { priceLow: 240, priceHigh: 260 } })] });
    const first = ask('What jobs do I have coming up?', data).context;
    expect(ask('What did we quote them for that job?', data, first).content).toContain('$170.00 to $190.00');
    const second = ask('Second one', data, first).context;
    const result = ask('What did we quote them for that job?', data, second);
    expect(result.content).toContain('$240.00 to $260.00');
    expect(result.context.selected.id).toBe('later');
    data.estimates[1].customerId = 'customer-b';
    expect(ask('What did we quote them for that job?', data, second).kind).toBe('clarify');
  });
  it('preserves unavailable linked estimates without substituting another estimate', () => {
    const data = linkedPacket({ leadId: 'removed' });
    const result = ask('What did we quote them for that job?', data, ask('What jobs do I have coming up?', data).context);
    expect(result.content).toContain('No linked open estimate is available.');
    expect(result.content).toContain('not evidence of a historical quote');
    expect(result.content).not.toContain('$170.00');
  });
  it('preserves canonical customer lookup without a lead link and rejects multiple candidates', () => {
    const data = linkedPacket({ leadId: undefined });
    const context = ask('What jobs do I have coming up?', data).context;
    expect(ask('What did we quote them for that job?', data, context).content).toContain('$170.00 to $190.00');
    data.estimates.push({ ...data.estimates[0], id: 'second' });
    expect(ask('What did we quote them for that job?', data, context).kind).toBe('clarify');
    data.estimates = [];
    expect(ask('What did we quote them for that job?', data, context).content).toContain('No linked open estimate is available.');
  });
  it('excludes a foreign linked estimate even with the same customer ID and name', () => {
    const data = linkedPacket({}, { tenantId: 'foreign' });
    expect(data.estimates).toEqual([]);
    const result = ask('What did we quote them for that job?', data, ask('What jobs do I have coming up?', data).context);
    expect(result.content).toContain('No linked open estimate is available.');
    expect(result.content).not.toContain('$170.00');
  });
  it('revalidates current relationships and rejects removed, reset and foreign contexts', () => {
    const data = linkedPacket();
    const context = ask('What jobs do I have coming up?', data).context;
    data.estimates[0].customerId = 'customer-b';
    expect(ask('What did we quote them for that job?', data, context).kind).toBe('clarify');
    data.bookings = [];
    expect(ask('What did we quote them for that job?', data, context).kind).toBe('clarify');
    for (const invalid of [undefined, { ...context, tenantId: 'foreign' }]) {
      expect(ask('What did we quote them for that job?', linkedPacket(), invalid).kind).toBe('clarify');
    }
  });
});

describe('legacy quote explicit customer integrity', () => {
  const quotes = extra => packet({ bookings: [booking('a', { leadId: 'ea' }), booking('b', { customerId: 'customer-b', customerName: 'Synthetic B', leadId: 'eb', startTime: '12:00' })],
    leads: [lead('ea'), lead('eb', { customerId: 'customer-b', customerName: 'Synthetic B', estimate: { priceLow: 240, priceHigh: 260 } })], ...extra });
  it('preserves explicit B through actual routing rather than quoting active A', () => {
    const data = quotes(); const context = ask('What jobs do I have coming up?', data).context;
    const input = 'What did we quote Synthetic B?';
    expect(context.selected.id).toBe('a');
    expect(answerBusinessQuestion(input, data, context).status).toBe('unsupported');
    const route = routeGrowthAIConversation(input);
    expect(route.kind).toBe('owner_context');
    const result = resolveOwnerContext(route.request, data, context, { now });
    expect(result.content).toContain('$240.00 to $260.00');
    expect(result.content).not.toContain('$170.00');
    expect(result.context.selected).toEqual({ type: 'booking', id: 'b' });
  });
  it.each(['What did we quote Synthetic A for that job?', 'What did we quote them for that job?'])('preserves active/same-customer quotes: %s', input => {
    const data = quotes(); const context = ask('What jobs do I have coming up?', data).context;
    expect(ask(input, data, context).content).toContain('$170.00 to $190.00');
  });
  it.each(['Synthetic Z', 'Foreign Person'])('does not fall back to A for unresolved explicit %s', customerName => {
    const data = quotes(); const context = ask('What jobs do I have coming up?', data).context;
    const before = JSON.stringify(data);
    const result = ask(`What did we quote ${customerName} for that job?`, data, context);
    expect(result.kind).toBe('clarify'); expect(result.content).not.toContain('$170.00');
    expect(JSON.stringify(data)).toBe(before);
  });
  it('rejects duplicate customer names rather than using the selected match', () => {
    const data = quotes();
    data.bookings[0].customerName = 'Synthetic B'; data.estimates[0].customerName = 'Synthetic B';
    const context = ask('What jobs do I have coming up?', data).context;
    expect(ask('What did we quote Synthetic B for that job?', data, context).kind).toBe('clarify');
  });
  it('rejects multiple bookings for the explicit customer', () => {
    const data = quotes(); data.bookings.push({ ...data.bookings[1], id: 'b-second' });
    expect(ask('What did we quote Synthetic B for that job?', data).kind).toBe('clarify');
  });
  it('keeps explicit resolution scoped to the current packet through reset, stale and foreign context', () => {
    const data = quotes();
    for (const context of [undefined, { tenantId: 'a', selected: { type: 'booking', id: 'removed' } }, { tenantId: 'foreign', selected: { type: 'booking', id: 'a' } }]) {
      const result = ask('What did we quote Synthetic B?', data, context);
      expect(result.content).toContain('$240.00 to $260.00');
      expect(result.context.tenantId).toBe('a');
    }
    const foreign = packet({ bookings: [booking('foreign', { tenantId: 'b', customerName: 'Synthetic B' })], leads: [] });
    expect(ask('What did we quote Synthetic B for that job?', foreign).kind).toBe('clarify');
  });
  it('excludes same-name foreign records during projection', () => {
    const data = quotes({ bookings: [booking('a', { leadId: 'ea' }), booking('b', { customerId: 'customer-b', customerName: 'Synthetic B', leadId: 'eb' }), booking('foreign', { tenantId: 'b', customerName: 'Synthetic B' })] });
    expect(ask('What did we quote Synthetic B?', data).content).toContain('$240.00 to $260.00');
  });
  it('does not bless an explicit customer with a mismatched linked estimate', () => {
    const data = quotes(); data.bookings[1].leadId = 'ea';
    const result = ask('What did we quote Synthetic B for that job?', data);
    expect(result.kind).toBe('clarify'); expect(result.content).not.toContain('$170.00');
  });
  it('clarifies opaque explicit quote wording instead of quoting active A', () => {
    const data = quotes(); const context = ask('What jobs do I have coming up?', data).context;
    expect(ask('How much was Synthetic B quoted for that job?', data, context).kind).toBe('clarify');
  });
});

describe('legacy historical scheduling integrity', () => {
  const historical = (id, date, extra = {}) => booking(id, { date, status: 'completed', ...extra });
  const historyPacket = history => packet({ bookings: [booking('current'), ...history] });
  const historyAnswer = data => ask('Have they worked with us before?', data, ask('What jobs do I have coming up?', data).context);
  it.each(['2026-02-30', '2026-02-31', '2026-04-31', '2026-06-31', '2026-09-31', '2026-13-01', '2026-00-01', '2026-02-29', '2025-02-29'])('rejects invalid calendar date %s', date => {
    const result = historyAnswer(historyPacket([historical('invalid', date)]));
    expect(result.content).toContain('most recent work date cannot be established');
    expect(result.content).not.toContain('Most recent:');
    expect(result.content).not.toContain(date);
  });
  it.each(['2024-02-29', '2026-02-28', '2026-09-15'])('retains valid historical date %s', date => {
    expect(historyAnswer(historyPacket([historical('valid', date)])).content).toContain(`Most recent: ${date}.`);
  });
  it.each([{ startTime: undefined }, { scheduledAt: 'bad' }, { scheduledAt: '2026-09-15T15:00:00Z' }])('rejects unusable projected scheduling: %j', extra => {
    expect(historyAnswer(historyPacket([historical('invalid', '2026-09-15', extra)])).content).not.toContain('Most recent:');
  });
  it('requires both projected instant and strict calendar evidence independently', () => {
    for (const extra of [{ scheduledMillis: null }, { scheduledMillis: NaN }, { scheduleError: 'Invalid schedule' }, { date: '2026-02-30' }]) {
      const data = historyPacket([historical('valid', '2026-09-15')]);
      Object.assign(data.bookings[1], extra);
      expect(historyAnswer(data).content).not.toContain('Most recent:');
    }
  });
  it('selects the latest valid completed record from mixed history without mutating the packet', () => {
    const data = historyPacket([historical('older', '2026-08-15'), historical('bad', '2026-09-31'), historical('latest', '2026-09-15'), historical('feb', '2026-02-30')]);
    const before = JSON.stringify(data);
    const result = historyAnswer(data);
    expect(result.content).toContain('4 completed bookings');
    expect(result.content).toContain('Most recent: 2026-09-15.');
    expect(result.content).not.toContain('2026-09-31');
    expect(JSON.stringify(data)).toBe(before);
  });
  it('keeps completed eligibility and canonical tenant/customer boundaries', () => {
    const data = historyPacket([
      historical('completed', '2026-08-15'), historical('field', '2026-09-15', { status: 'scheduled', fieldStatus: 'completed' }),
      historical('cancelled', '2026-09-25', { status: 'cancelled' }), historical('other', '2026-09-26', { customerId: 'customer-b' }),
      historical('foreign', '2026-09-27', { tenantId: 'b' }), historical('deleted', '2026-09-28', { isDeleted: true }),
      historical('archived', '2026-09-29', { isArchived: true }),
    ]);
    const result = historyAnswer(data);
    expect(result.content).toContain('2 completed bookings');
    expect(result.content).toContain('Most recent: 2026-09-15.');
  });
  it('uses tenant-local timestamp-only history without a host calendar fallback', () => {
    const rows = [booking('current'), historical('timestamp', undefined, { startTime: undefined, scheduledAt: '2026-09-16T01:00:00Z' })];
    const data = packet({ timeZone: 'America/Chicago', bookings: rows });
    expect(historyAnswer(data).content).toContain('Most recent: 2026-09-15.');
    const missing = packet({ timeZone: undefined, bookings: rows });
    const result = ask('Have they worked with us before?', missing, { tenantId: 'a', selected: { type: 'booking', id: 'timestamp' } });
    expect(result.content).not.toContain('Most recent:');
  });
  it('revalidates history context after reset, tenant switch and reference removal', () => {
    const data = historyPacket([historical('valid', '2026-09-15')]);
    const context = ask('What jobs do I have coming up?', data).context;
    for (const candidate of [undefined, { ...context, tenantId: 'foreign' }, { ...context, suspended: true }]) {
      expect(ask('Have they worked with us before?', data, candidate).kind).toBe('clarify');
    }
    expect(ask('Have they worked with us before?', { ...data, bookings: [] }, context).kind).toBe('clarify');
  });
  it('uses an explicitly selected current-list customer instead of prior customer history', () => {
    const data = packet({ bookings: [booking('current'), booking('second', { customerId: 'customer-b', customerName: 'Synthetic B', startTime: '12:00' }),
      historical('a-past', '2026-09-15'), historical('b-past', '2026-08-15', { customerId: 'customer-b', customerName: 'Synthetic B' })] });
    const initial = ask('What jobs do I have coming up?', data).context;
    const explicit = ask('Tell me about Synthetic B.', data, initial).context;
    const result = ask('Have they worked with us before?', data, explicit);
    expect(result.content).toContain('Most recent: 2026-08-15.');
    expect(result.content).not.toContain('2026-09-15');
  });
  it('rejects the reproduced invalid completed date rather than reporting it as most recent', () => {
    const data = historyPacket([historical('invalid', '2026-02-30')]);
    expect(data.bookings[1]).toMatchObject({ date: '2026-02-30', scheduledMillis: null, scheduleError: expect.any(String) });
    expect(answerBusinessQuestion('Have they worked with us before?', data).status).toBe('unsupported');
    expect(routeGrowthAIConversation('Have they worked with us before?').kind).toBe('owner_context');
    const result = historyAnswer(data);
    expect(result.content).toContain('1 completed bookings');
    expect(result.content).toContain('most recent work date cannot be established');
    expect(result.content).not.toContain('2026-02-30');
    expect(result.content).not.toContain('Most recent:');
  });
});

describe('legacy tenant-local temporal boundary', () => {
  it('uses one current Chicago instant for eligibility, ordering, traversal and both response routes', () => {
    const reference = new Date('2026-10-04T16:30:00Z');
    const data = packet({ timeZone: 'America/Chicago', now: reference, bookings: ['16:00', '10:00', '13:00'].map(startTime =>
      booking(startTime, { date: '2026-10-04', startTime, customerId: startTime, customerName: `Synthetic ${startTime}`, agreedPrice: 180 })) });
    const before = JSON.stringify(data); const options = { now: reference };
    expect(data.bookings.map(item => [item.id, item.scheduledMillis, item.upcoming])).toEqual([
      ['16:00', Date.parse('2026-10-04T21:00:00Z'), true], ['10:00', Date.parse('2026-10-04T15:00:00Z'), false],
      ['13:00', Date.parse('2026-10-04T18:00:00Z'), true],
    ]);
    const modern = answerBusinessQuestion('What do I have today?', data, {}, options);
    const legacy = resolveOwnerContext(resolveOwnerContextRequest('What am I doing today?'), data, {}, options);
    expect(modern.context.list).toEqual([{ type: 'booking', id: '13:00' }, { type: 'booking', id: '16:00' }]);
    expect(legacy.context.list).toEqual(modern.context.list);
    for (const question of ["Who's next?", 'Who is my next customer?', "Who's my next customer, what service are they getting, and how much are we charging them?"]) {
      const answer = answerBusinessQuestion(question, data, {}, options);
      expect(answer.status).toBe('answerable'); expect(answer.confidence.state).toBe('sufficient');
      expect(answer.context.selected).toEqual({ type: 'booking', id: '13:00' });
    }
    const next = answerBusinessQuestion("Who's next?", data, {}, options).context;
    for (const question of ['What service are they getting?', 'How much are they paying?']) {
      expect(answerBusinessQuestion(question, data, next, options).usedReferences).toEqual([{ type: 'booking', id: '13:00' }]);
    }
    expect(JSON.stringify(data)).toBe(before);
  });
  it.each(['America/Chicago', 'Asia/Tokyo', 'Pacific/Kiritimati', 'America/Los_Angeles'])('composes calendar selection with actual local start in %s', timeZone => {
    const reference = new Date('2026-10-04T04:00:00Z');
    const dates = { 'America/Chicago': '2026-10-03', 'Asia/Tokyo': '2026-10-04', 'Pacific/Kiritimati': '2026-10-04', 'America/Los_Angeles': '2026-10-03' };
    const date = dates[timeZone];
    const data = packet({ timeZone, now: reference, bookings: [booking('past', { date, startTime: '01:00' }), booking('future', { date, startTime: '23:30' })] });
    const modern = answerBusinessQuestion('What do I have today?', data, {}, { now: reference });
    const legacy = resolveOwnerContext(resolveOwnerContextRequest('What am I doing today?'), data, {}, { now: reference });
    expect(modern.context.list).toEqual([{ type: 'booking', id: 'future' }]);
    expect(legacy.context.list).toEqual(modern.context.list);
  });
  it.each([{ startTime: undefined }, { scheduledAt: 'bad' }, { scheduledAt: '2026-10-05T15:00:00Z' }])('does not bless invalid scheduling as an empty sufficient result: %j', extra => {
    const data = packet({ bookings: [booking('invalid', extra)] });
    const modern = answerBusinessQuestion('What do I have tomorrow?', data, {}, { now });
    const legacy = ask('What am I doing tomorrow?', data);
    expect(modern.status).toBe('insufficient_evidence'); expect(modern.confidence.state).toBe('insufficient_evidence');
    expect(legacy.status).toBe('insufficient_evidence'); expect(legacy.context).toBeUndefined();
    expect(legacy.content).not.toContain('No eligible upcoming');
    for (const domain of ['overview', 'priority_review', 'review_choices']) {
      expect(resolveOwnerContext({ domain, input: '' }, data, {}, { now }).status).toBe('insufficient_evidence');
    }
  });
  it.each([
    ['America/Chicago', '2026-10-04T04:00:00Z', 'today', '2026-10-03'],
    ['America/Chicago', '2026-10-04T04:00:00Z', 'tomorrow', '2026-10-04'],
    ['Asia/Tokyo', '2026-10-04T23:30:00Z', 'today', '2026-10-05'],
    ['Asia/Tokyo', '2026-10-04T23:30:00Z', 'tomorrow', '2026-10-06'],
    ['America/Chicago', '2026-10-04T04:59:59Z', 'today', '2026-10-03'],
    ['America/Chicago', '2026-10-04T05:00:00Z', 'today', '2026-10-04'],
    ['America/Chicago', '2026-10-04T04:59:59Z', 'tomorrow', '2026-10-04'],
    ['America/Chicago', '2026-10-04T05:00:00Z', 'tomorrow', '2026-10-05'],
  ])('selects %s %s %s from current packet dates', (timeZone, instant, relative, expected) => {
    const reference = new Date(instant);
    const data = packet({ now: reference, timeZone, bookings: ['2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06'].map(date =>
      booking(date, { date, status: 'in_progress' })) });
    const before = JSON.stringify(data);
    const legacy = resolveOwnerContext(resolveOwnerContextRequest(`What am I doing ${relative}?`), data, {}, { now: reference });
    const modern = answerBusinessQuestion(`What do I have ${relative}?`, data, {}, { now: reference });
    expect(legacy.context.list).toEqual([{ type: 'booking', id: expected }]);
    expect(legacy.context.list).toEqual(modern.context.list);
    expect(legacy.content).toContain(expected);
    expect(JSON.stringify(data)).toBe(before);
  });
  it.each(['', 'Not/A_Timezone'])('fails closed with unavailable timezone %s without affecting service context', timeZone => {
    const data = packet({ timeZone });
    for (const input of ['What am I doing today?', 'What am I doing tomorrow?', "What's on the books this week?"]) {
      const result = ask(input, data);
      expect(result.kind).toBe('clarify');
      expect(result.status).toBe('insufficient_evidence');
      expect(result.context).toBeUndefined();
    }
    expect(ask('What jobs do I have coming up?', data).status).toBe('insufficient_evidence');
    expect(ask('What services do I offer?', data).kind).toBe('answer');
  });
  it('uses the Monday-start tenant week rather than a host-timestamp window', () => {
    const reference = new Date('2026-10-05T04:30:00Z'); // Still Sunday in Chicago.
    const data = packet({ now: reference, timeZone: 'America/Chicago', bookings: [
      booking('sunday', { date: '2026-10-04', status: 'in_progress' }),
      booking('monday', { date: '2026-10-05' }),
    ] });
    const legacy = resolveOwnerContext(resolveOwnerContextRequest("What's on the books this week?"), data, {}, { now: reference });
    const modern = answerBusinessQuestion('What bookings do I have this week?', data, {}, { now: reference });
    expect(legacy.context.list).toEqual([{ type: 'booking', id: 'sunday' }]);
    expect(legacy.context.list).toEqual(modern.context.list);
  });
  it('uses the current tenant timezone and packet despite a foreign prior session', () => {
    const reference = new Date('2026-10-04T23:30:00Z');
    const data = packet({ tenantId: 'b', timeZone: 'Asia/Tokyo', now: reference, bookings: [
      booking('own-tomorrow', { tenantId: 'b', date: '2026-10-06' }),
      booking('foreign-tomorrow', { tenantId: 'a', date: '2026-10-05' }),
    ] });
    const stale = { tenantId: 'a', timeZone: 'America/Chicago', selected: { type: 'booking', id: 'foreign-tomorrow' } };
    const legacy = resolveOwnerContext(resolveOwnerContextRequest('What am I doing tomorrow?'), data, stale, { now: reference });
    expect(legacy.context.tenantId).toBe('b');
    expect(legacy.context.list).toEqual([{ type: 'booking', id: 'own-tomorrow' }]);
    expect(legacy.content).not.toContain('2026-10-05');
    expect(resolveOwnerContext(resolveOwnerContextRequest('What am I doing tomorrow?'), { ...data, timeZone: '' }, stale, { now: reference }).kind).toBe('clarify');
  });
  it('agrees with modern tomorrow selection at the discovered UTC/Chicago boundary', () => {
    const reference = new Date('2026-10-04T04:00:00Z');
    const data = packet({ now: reference, timeZone: 'America/Chicago', bookings: [
      booking('tenant-tomorrow', { date: '2026-10-04' }),
      booking('machine-tomorrow', { date: '2026-10-05' }),
    ] });
    const options = { now: reference };
    const modern = answerBusinessQuestion('What do I have tomorrow?', data, {}, options);
    expect(modern.context.selected.id).toBe('tenant-tomorrow');
    expect(answerBusinessQuestion('What am I doing tomorrow?', data, {}, options).status).toBe('unsupported');
    const route = routeGrowthAIConversation('What am I doing tomorrow?');
    expect(route.kind).toBe('owner_context');
    const legacy = resolveOwnerContext(route.request, data, {}, options);
    expect(legacy.context.list).toEqual(modern.context.list);
    expect(legacy.content).toContain('2026-10-04');
    expect(legacy.content).not.toContain('2026-10-05');
  });
});

describe('deterministic owner context bridge', () => {
  it('answers conversational schedule and service checks without suspending the selected booking', () => {
    const data = packet();
    expect(ask('Morning, what are we doing today?', data).content).toContain('No eligible upcoming');
    let current = ask('What jobs do I have coming up?', data);
    current = ask('Is that a deep clean?', data, current.context);
    expect(current.content).toBe('Standard Cleaning');
    expect(current.context.selected.id).toBe('b1');
    expect(ask('How much are they paying?', data, current.context).content).toContain('$180.00');
    expect(ask('Is that a deep clean?', data).kind).toBe('clarify');
  });
  it('uses bounded correction aliases without changing authority or inferring urgency', () => {
    const data = packet(); let current = ask('What jobs do I have coming up?', data);
    current = ask('No, the second one.', data, current.context);
    expect(current.context.selected.id).toBe('b2');
    current = ask('Actually, go back to the first.', data, current.context);
    expect(current.context.selected.id).toBe('b1');
    expect(ask('Go back to the first customer.', data, current.context).context.selected.id).toBe('b1');
    expect(ask('What was their email again?', data, current.context).content).toContain('unavailable');
    expect(ask('Who am I dealing with?', data, current.context).content).toContain('Synthetic A');
    expect(ask('What do we charge?', data, current.context).content).toContain('$180.00');
    expect(ask('How long do our services take?', data, current.context).content).toContain('90 minutes');
    expect(ask('What should I take care of?', data, current.context).content).toContain('cannot determine urgency');
    expect(ask('Forget that and tell me what\'s coming up.', data, current.context).context.selected.id).toBe('b1');
    expect(resolveOwnerContextRequest('Never mind that.')).toBeNull();
    expect(resolveOwnerContextRequest('Forget that and delete the booking.')).toBeNull();
  });
  it('lets explicit positions replace suspended context without restoring implicit pronouns', () => {
    const data = packet(); const context = { ...ask('What jobs do I have coming up?', data).context, suspended: true };
    expect(ask('Tell me about them.', data, context).kind).toBe('clarify');
    const second = ask('Go back to the second.', data, context);
    expect(second.context.selected.id).toBe('b2');
    expect(ask('What about their service?', data, second.context).content).toBe('Standard Cleaning');
    expect(ask('Go back to the one before that.', data, second.context).context.selected.id).toBe('b1');
    const estimates = ask('Open estimates', data).context;
    expect(ask('Which one should I contact?', data, estimates).content).toContain('Synthetic A');
    expect(ask('Go back to the second.', data, { ...context, tenantId: 'foreign' }).kind).toBe('clarify');
  });
  it('keeps natural payment and contact-review questions on the established record', () => {
    const data = packet(); let current = ask('What jobs do I have coming up?', data);
    current = ask('How much are they paying?', data, current.context);
    expect(current.content).toContain('$180.00');
    for (const phrase of ['Should I contact them?', 'Should I reach back out?']) {
      current = ask(phrase, data, current.context);
      expect(current.content).toContain('Nothing has been drafted or sent');
      expect(current.context.selected.id).toBe('b1');
    }
    current = ask('What about the next customer?', data, current.context);
    expect(current.context.selected.id).toBe('b2');
    expect(ask('Who is that?', data, current.context).content).toContain('Synthetic B');
    expect(ask('How much are they paying?', data).kind).toBe('clarify');
    expect(ask('Should I contact them?', data, { ...current.context, tenantId: 'foreign' }).kind).toBe('clarify');
  });
  it.each(['customer', 'booking'])('restores %s after service topic without losing ordered booking context', type => {
    const data = packet(); const bookingContext = ask('What jobs do I have coming up?', data).context;
    const services = ask('What services do we offer?', data, bookingContext).context;
    expect(services.selected).toBeNull(); expect(services.topics.booking.selected.id).toBe('b1');
    const restored = ask(`Go back to that ${type}.`, data, services);
    expect(restored.context.selected.id).toBe('b1');
    expect(ask('What about the next one?', data, restored.context).context.selected.id).toBe('b2');
    expect(ask('What was their email?', data, restored.context).content).toContain('unavailable');
  });
  it('restores estimate and service independently and replaces explicit current records', () => {
    const data = packet(); let context = ask('Open estimates', data).context;
    context = ask('First.', data, context).context;
    context = ask('What services do we offer?', data, context).context;
    context = ask('First.', data, context).context;
    context = ask('Go back to the estimate.', data, context).context;
    expect(context.selected.id).toBe('e1');
    context = ask('Go back to that service.', data, context).context;
    expect(context.selected.id).toBe('s1');
    context = ask('What jobs do I have coming up?', data, context).context;
    context = ask('Tell me about Synthetic B.', data, context).context;
    expect(context.selected.id).toBe('b2');
    expect(ask("What's their number?", data, context).content).toContain('Synthetic B');
    const explicitService = ask('How much do we charge for deep cleaning?', data, context).context;
    expect(explicitService.list).toEqual([{ type: 'service', id: 's2' }]);
    expect(ask('Go back to the booking.', data, explicitService).context.selected.id).toBe('b2');
    expect(ask('Tell me about the first booking.', data, context).context.selected.id).toBe('b1');
  });
  it('bounds recent references, clears foreign/reset history and rejects removed entities', () => {
    const data = packet({ bookings: Array.from({ length: 9 }, (_, index) => booking(`b${index + 1}`, { customerId: `person-${index + 1}`, customerName: `Person ${index + 1}` })) });
    let context = ask('What jobs do I have coming up?', data).context;
    for (let i = 1; i <= 9; i += 1) context = ask(`Tell me about Person ${i}.`, data, context).context;
    expect(context.recent).toHaveLength(6);
    for (let i = 0; i < 20; i += 1) context = ask(i % 2 ? 'First.' : 'Second.', data, context).context;
    expect(context.recent.length).toBeLessThanOrEqual(6);
    const services = ask('What services do we offer?', data, context).context;
    expect(ask('Go back to that customer.', { ...data, bookings: [] }, services).kind).toBe('clarify');
    expect(ask('Go back to that customer.', data, { ...services, tenantId: 'foreign' }).kind).toBe('clarify');
    expect(ask('Go back to that customer.', data).kind).toBe('clarify');
    expect(ask("What's their number?", data, { ...context, suspended: true }).kind).toBe('clarify');
    expect(ask('Go back to the booking.', data, { ...context, suspended: true }).context.selected.id).toBe('b1');
    const review = ask('Open estimates', data, context).context;
    expect(ask('What was their email?', data, review).kind).toBe('clarify');
    expect(ask('What about the other one?', data, review).kind).toBe('clarify');
  });
  it.each(["What's their number?", 'What is their phone number?', 'How do I get ahold of them?', 'How can I reach them?', "What's their contact info?", 'Can I get their email?', "What's their email address?", 'How do I contact them?', 'Can you give me their info?'])('reads only saved selected-record contact: %s', input => {
    const data = packet({ bookings: [booking('b1', { customerSnapshot: { name: 'Synthetic A', phone: '555-0110', email: 'synthetic@example.test', token: 'never-project' } })] });
    const before = JSON.stringify(data);
    const selected = ask('What jobs do I have coming up?', data).context;
    expect(ask(input, data, selected).content).toContain(/email/.test(input) ? 'synthetic@example.test' : '555-0110');
    expect(JSON.stringify(data)).not.toContain('never-project');
    expect(JSON.stringify(data)).toBe(before);
    expect(ask(input, data, { ...selected, tenantId: 'foreign' }).kind).toBe('clarify');
    expect(ask(input, { ...data, bookings: [] }, selected).kind).toBe('clarify');
  });
  it('uses talk-to context without guessing a person from an unselected review', () => {
    const data = packet();
    const selected = ask('What jobs do I have coming up?', data).context;
    expect(ask('Who do I need to talk to?', data, selected).content).toContain('Synthetic A');
    expect(ask('Who do I need to talk to?', data).content).toContain('upcoming schedule');
    expect(ask('Who do I need to talk to?', data, ask('Who should I reach back out to?', data).context).content).toContain('Choose the intended position');
    expect(ask('Who do I need to talk to about my estimate?', data, selected).kind).toBe('clarify');
    expect(ask("What's their number?", data, selected).content).toContain('unavailable');
    expect(ask('Who needs my attention?', data, selected).content).toContain('cannot infer urgency');
    expect(ask('Who else is coming?', data, selected).content).toContain('2. Synthetic B');
    expect(ask('Who else is coming?', data, selected).content).not.toContain('Synthetic A');
    expect(ask('Who else is coming?', data).kind).toBe('clarify');
  });
  it('lets an exact unique name in the current list override selection without global lookup', () => {
    const data = packet(); const selected = ask('What jobs do I have coming up?', data).context;
    expect(ask("What's Synthetic B's number?", data, selected).context.selected.id).toBe('b2');
    expect(ask("What's Foreign Person's number?", data, selected).kind).toBe('clarify');
    expect(ask("What's the other customer's number?", data, selected).context.selected.id).toBe('b2');
    expect(ask("What's Synthetic B's number?", data).kind).toBe('clarify');
  });
  it('preserves estimate/customer context and rejects malformed or ambiguous contact targets', () => {
    const data = packet({ leads: [lead('e1', { customerSnapshot: { name: 'Synthetic A', email: 'estimate@example.test', phone: '555-0110' } })] });
    const selected = ask('Open estimates', data).context;
    expect(ask('Who do I need to talk to?', data, selected).content).toContain('selected estimate is Synthetic A');
    expect(ask('How do I get ahold of them?', data, selected).content).toContain('estimate@example.test');
    expect(ask('Who do I need to talk to about my estimate?', data, selected).kind).toBe('answer');
    expect(ask('Who do I need to talk to about my booking?', data, selected).kind).toBe('clarify');
    const customer = { tenantId: 'a', list: [{ type: 'customer', id: 'customer-a' }], selected: { type: 'customer', id: 'customer-a' }, index: 0 };
    expect(ask('Who do I need to talk to?', data, customer).content).toContain('Synthetic A');
    const malformed = packet({ bookings: [booking('b1', { customerSnapshot: { phone: '<script>secret</script>', email: 'bad-email', authToken: 'secret' } })] });
    expect(ask("What's their contact info?", malformed, ask('What jobs do I have coming up?', malformed).context).content).toContain('unavailable');
    expect(JSON.stringify(malformed)).not.toContain('secret');
    expect(ask('What is unrelated number?', data, selected).kind).toBe('clarify');
    const duplicate = packet({ bookings: [booking('b1'), booking('b2')] });
    expect(ask("What's Synthetic A's number?", duplicate, ask('What jobs do I have coming up?', duplicate).context).kind).toBe('clarify');
  });
  it.each([
    ["What's going on?", 'clarify', '2 upcoming bookings'], ['What is happening?', 'clarify', '2 upcoming bookings'],
    ['What should I worry about today?', 'answer', 'cannot determine urgency'], ['Is there anything urgent?', 'answer', 'cannot determine urgency'],
    ["Who's coming up?", 'answer', 'Next: Synthetic A'], ['Who is scheduled next?', 'answer', 'Next: Synthetic A'],
    ['Who am I working with?', 'answer', 'Synthetic A'], ['Who is this for?', 'answer', 'Synthetic A'],
    ['What are we charging them?', 'answer', '$180.00'], ['How much are we getting for this?', 'answer', '$180.00'],
    ['Have they worked with us before?', 'answer', '1 completed bookings'], ['Have they hired us before?', 'answer', '1 completed bookings'],
    ['Who should I reach back out to?', 'handoff', 'estimate-review candidates'], ['Who should I contact again?', 'handoff', 'estimate-review candidates'],
    ["What's the most important thing today?", 'answer', 'cannot determine urgency'], ['What should I handle first?', 'answer', 'cannot determine urgency'],
    ['What about the other one?', 'answer', 'Synthetic B'], ['Tell me about the other one.', 'answer', 'Synthetic B'],
    ['Go back to the first one.', 'answer', 'Synthetic A'], ['Take me back to the first.', 'answer', 'Synthetic A'],
    ['How much was that?', 'answer', '$180.00'], ["What's the price on this one?", 'answer', '$180.00'],
  ])('supports classified natural wording and continuation: %s', (input, kind, expected) => {
    const data = packet(); const before = JSON.stringify(data);
    const initial = ask('What jobs do I have coming up?', data).context;
    const answer = ask(input, data, initial);
    expect(answer.kind).toBe(kind); expect(answer.content).toContain(expected);
    let context = answer.context || initial;
    context = ask('Go back to the first.', data, context).context;
    expect(ask('Tell me about that one.', data, context).content).toContain('Synthetic A');
    expect(ask('Write something for them.', data, context)).toMatchObject({ kind: 'handoff', communication: context.selected.type === 'booking' ? { bookingId: 'b1' } : { leadId: 'e1' } });
    expect(JSON.stringify(data)).toBe(before);
    expect(ask(input, { ...data, ready: false }, initial).kind).toBe('clarify');
    expect(resolveOwnerContextRequest(`Do not ${input}`)).toBeNull();
  });
  it('resolves other only with two live distinct records and a valid selection', () => {
    const data = packet(); const initial = ask('What jobs do I have coming up?', data).context;
    expect(ask('What about the other one?', data, initial).context.selected.id).toBe('b2');
    for (const context of [{ ...initial, selected: null }, { ...initial, tenantId: 'b' },
      { ...initial, list: [...initial.list, { type: 'booking', id: 'past' }] },
      { ...initial, list: [initial.list[0], { type: 'booking', id: 'missing' }] },
      { ...initial, list: [initial.list[0], initial.list[0]] }]) {
      expect(ask('What about the other one?', data, context).kind).toBe('clarify');
    }
  });
  it('does not substitute a booking for an explicitly requested estimate or another record type', () => {
    const data = packet(); const current = ask('What jobs do I have coming up?', data).context;
    expect(ask('Tell me about that estimate.', data, current).content).toContain('question asks about an estimate');
    const estimate = ask('Go back to the first.', data, ask('Open estimates', data).context).context;
    expect(ask('Tell me about that booking.', data, estimate).kind).toBe('clarify');
    expect(ask('Tell me about that job.', data, estimate).kind).toBe('clarify');
    expect(ask('Tell me about that estimate.', data, estimate).content).toContain('$170.00 to $190.00');
    expect(ask('What did we quote them?', data, current).content).toContain('$170.00 to $190.00');
  });
  it('preserves original positions on previous/first/last traversal and denies stale tenant context', () => {
    const data = packet(); let answer = ask('What jobs do I have coming up?', data);
    for (const [input, id] of [['Second.', 'b2'], ['Previous.', 'b1'], ['Last.', 'b2'], ['Go back to that one.', 'b2'], ['First.', 'b1']]) {
      answer = ask(input, data, answer.context); expect(answer.context.selected.id).toBe(id);
    }
    expect(ask('Previous.', data, answer.context).kind).toBe('clarify');
    expect(ask('Go back to the first.', data, { ...answer.context, tenantId: 'b' }).content).not.toContain('Synthetic A');
    expect(ask('How much was that?', data).kind).toBe('clarify');
  });
  it.each(["What's on my plate?", 'Who is waiting on me?', "What's still sitting out there?", 'What work is outstanding?', 'Anything falling through the cracks?', 'Anything slipping through the cracks?'])(
    'clarifies the business domain without changing an established selection: %s', input => {
      const data = packet(); const selected = ask('What jobs do I have coming up?', data).context;
      const answer = ask(input, data, selected);
      expect(answer.kind).toBe('clarify'); expect(answer.context).toBeUndefined();
      expect(answer.content).toContain("today's bookings, open estimates, or follow-up opportunities");
      expect(answer.content).toContain('2 upcoming bookings and 2 eligible open estimates');
      expect(ask('Who is that customer?', data, selected).content).toContain('Synthetic A');
      expect(ask(input, { ...data, ready: false }, selected).content).toContain('unavailable');
    });
  it('briefs known work without inventing urgency and keeps the next booking addressable', () => {
    const data = packet(); const answer = resolveOwnerContext({ domain: 'overview', input: 'Who needs my attention?' }, data, {}, { now });
    expect(answer.content).toContain('Next: Synthetic A');
    expect(answer.content).toContain('2 eligible open estimates');
    expect(answer.content).toContain('not an urgency ranking');
    expect(ask('Who is the first one?', data, answer.context).content).toContain('Synthetic A');
  });
  it('keeps an empty booking briefing honest and exposes only available estimate references', () => {
    const data = packet({ bookings: [] });
    const answer = resolveOwnerContext({ domain: 'overview', input: '' }, data, {}, { now });
    expect(answer.content).toContain('No eligible upcoming bookings');
    expect(answer.context.list.map(item => item.type)).toEqual(['estimate', 'estimate']);
    expect(answer.context.selected).toBeNull();
  });
  it('keeps quote reads anchored to the booking result set for subsequent traversal', () => {
    const data = packet();
    let current = ask('What jobs do I have coming up?', data);
    current = ask('What did we quote them?', data, current.context);
    expect(current.content).toContain('$170.00 to $190.00');
    expect(current.context.selected).toEqual({ type: 'booking', id: 'b1' });
    expect(ask('Who do I have after that?', data, current.context).context.selected.id).toBe('b2');
    expect(ask('Show the one after that.', data, current.context).context.selected.id).toBe('b2');
  });
  it('does not reindex stale list positions after resolving a surviving result', () => {
    const data = packet();
    const initial = ask('What jobs do I have coming up?', data).context;
    const stale = { ...initial, list: [{ type: 'booking', id: 'missing' }, ...initial.list], selected: { type: 'booking', id: 'b1' }, index: 1 };
    const answer = ask('Who is that customer?', data, stale);
    expect(answer.context.list).toEqual(stale.list);
    expect(answer.context.index).toBe(1);
    expect(ask('Who is the first one?', data, answer.context).kind).toBe('clarify');
    expect(ask('Who do I have after that?', data, answer.context).context.selected.id).toBe('b2');
  });
  it('projects only allowlisted own-tenant values with no credentials or raw documents', () => {
    const data = packet({ bookings: [booking('b1', { privateNotes: 'secret', stripeAccountId: 'secret', token: 'secret' }), booking('foreign', { tenantId: 'b' })] });
    expect(data.bookings.map(item => item.id)).toEqual(['b1']);
    expect(JSON.stringify(data)).not.toContain('secret');
    expect(packet({ authorized: false }).bookings).toEqual([]);
    expect(packet({ tenantId: 'DEFAULT' }).ready).toBe(false);
  });
  it('shares booking eligibility and deterministic date/time/ID ordering', () => {
    const data = packet({ bookings: [booking('z', { startTime: '11:00' }), booking('b'), booking('a'),
      booking('cancelled', { status: 'cancelled' }), booking('archived', { isArchived: true }), booking('deleted', { isDeleted: true }), booking('completed', { status: 'completed' })] });
    const answer = ask('What jobs do I have coming up?', data);
    expect(answer.context.list.map(item => item.id)).toEqual(['a', 'b', 'z']);
  });
  it('follows booking to customer, service, explicit linked estimate and canonical history', () => {
    const data = packet(); let answer = ask('What jobs do I have coming up?', data);
    for (const [input, expected] of [['Who is the first one?', 'Synthetic A'], ['What service am I doing for them?', 'Standard Cleaning'], ['How much did I quote them?', '$170.00 to $190.00'], ['Have they booked with me before?', '1 completed bookings']]) {
      answer = ask(input, data, answer.context); expect(answer.content).toContain(expected);
    }
  });
  it('supports first/second/next/last and fails safely outside the current result list', () => {
    const data = packet(); const initial = ask('What jobs do I have coming up?', data);
    for (const phrase of ['Who is the second one?', 'What about the next one?', 'What about the last one?']) expect(ask(phrase, data, initial.context).context.selected.id).toBe('b2');
    expect(ask('Who is the second one?', data, { ...initial.context, tenantId: 'b' }).kind).toBe('clarify');
    expect(ask('Who is that customer?', data, { tenantId: 'a', selected: { type: 'booking', id: 'foreign' } }).kind).toBe('clarify');
  });
  it('does not guess an estimate or service after multi-record results', () => {
    const data = packet();
    for (const first of ['Which estimates are still open?', 'What services do I offer?']) {
      const initial = ask(first, data); expect(initial.context.selected).toBe(null);
      expect(ask('Who is that customer?', data, initial.context).kind).toBe('clarify');
    }
    expect(ask('How much do I charge for that one?', data).kind).toBe('clarify');
  });
  it.each(['Tell me about them.', 'Tell me about her.', 'Who is that customer?', 'What about that job?', 'What is that one?', 'Show the one we were talking about.'])(
    'resolves only an established own-tenant reference: %s', input => {
      const data = packet(); const current = ask('What jobs do I have coming up?', data).context;
      expect(ask(input, data, current).kind).toBe('answer');
      expect(ask(input, data, { ...current, tenantId: 'b' }).kind).toBe('clarify');
    });
  it('does not collapse a plural group into the selected first customer', () => {
    const data = packet(); const current = ask('What jobs do I have coming up?', data).context;
    expect(ask('Tell me about those customers.', data, current).kind).toBe('clarify');
  });
  it('keeps unsupported named/foreign factual lookup deterministic and refuses name-based identity', () => {
    const data = packet(); const current = ask('What jobs do I have coming up?', data).context;
    expect(ask('Who is Tenant B Example Customer?', data, current).kind).toBe('clarify');
    expect(ask('Who is Synthetic A customer?', data, current).kind).toBe('clarify');
  });
  it('uses actual dates for tomorrow/this-week windows, never future client balance or provider inference', () => {
    const data = packet();
    expect(ask('What am I doing tomorrow?', data).context.list).toHaveLength(2);
    expect(ask("What's on the books this week?", data).context.list).toHaveLength(0);
  });
  it('never interprets an estimate creation date as an appointment date', () => {
    const data = packet(); const current = ask('Which one has been waiting the longest?', data).context;
    expect(ask('When is their appointment?', data, current).kind).toBe('clarify');
  });
  it('orders estimates by actual creation date, never updated time or invented dates', () => {
    const data = packet(); expect(ask('Which one has been waiting the longest?', data).context.selected.id).toBe('e1');
    expect(ask('Which one has been waiting the longest?', packet({ leads: [lead('unknown', { createdAt: null })] })).kind).toBe('clarify');
  });
  it('uses canonical prices, not booking amounts, and admits unavailable scope/catalog/history', () => {
    expect(ask('How much do I charge for a standard cleaning?', packet()).content).toContain('$180.00');
    expect(ask('How much do I charge for a standard cleaning?', packet({ services: [service('s1'), service('s2')] })).kind).toBe('clarify');
    expect(ask('What services do I offer?', packet({ catalogReady: false })).content).toContain('unavailable');
    const initial = ask('What services do I offer?', packet({ services: [service('s1')] }));
    expect(ask('What does that service include?', packet(), initial.context).content).toContain('not an included-work description');
  });
  it('only prepares guarded handoff instructions and never mutates the packet', () => {
    const data = packet(); const before = JSON.stringify(data); const initial = ask('Which estimates are still open?', data);
    const selected = ask('Who is the first one?', data, initial.context);
    const action = ask('Write them a follow-up.', data, selected.context);
    expect(action.kind).toBe('handoff'); expect(action.communication).toEqual({ type: 'estimate_followup', leadId: 'e1' });
    expect(JSON.stringify(data)).toBe(before);
    expect(ask('Which customers should I follow up with?', data)).toBe(null);
  });
  it.each(['Delete that job', 'Refund that customer', 'Charge that customer', 'Send that message and delete the booking', 'What is in my personal schedule?'])(
    'does not claim unsupported authority for %s', input => expect(resolveOwnerContextRequest(input)).toBe(null));
});
