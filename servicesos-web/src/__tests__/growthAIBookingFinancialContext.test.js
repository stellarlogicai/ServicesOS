import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import { prepareAssistantBookingFinancials } from '../modules/growthAI/growthAIBookingFinancialContext';
import { buildOwnerContext, resolveOwnerContext } from '../modules/growthAI/growthAIOwnerContext';
import { resolveOwnerContextRequest } from '../modules/growthAI/growthAIOwnerVocabulary';
import { answerBusinessQuestion, formatBusinessAnswer } from '../modules/growthAI/growthAIBusinessIntelligence';
import { approvedBookingFixture } from '../test/approvedBookingFixture';

const require = createRequire(import.meta.url);
const { canonicalTotalCents, balance, planCutover } = require('../../../cloud-functions/bookingPaymentAccounting');
const { scopeHash } = require('../../../cloud-functions/jobScopeControl');
const now = new Date('2026-10-08T12:00:00Z');
const input = 'How much is Synthetic Financial paying?';
const packet = bookings => buildOwnerContext({ tenantId: 'tenant-a', authorized: true, ready: true,
  timeZone: 'America/Chicago', bookings, now });
const project = async booking => packet(await prepareAssistantBookingFinancials([booking], 'tenant-a'));

describe('Assistant canonical financial context handoff', () => {
  it('agrees with server accounting and preserves original base evidence without mutation', async () => {
    const booking = approvedBookingFixture(); const original = structuredClone(booking);
    expect(scopeHash(booking.approvedJobScope.snapshot)).toBe(booking.approvedJobScope.scopeHash);
    expect(canonicalTotalCents(booking)).toBe(41000);
    const data = await project(booking);
    expect(data.bookings[0]).toMatchObject({ amount: 410, baseAmount: 200, amountBasis: 'approved_scope' });
    const result = answerBusinessQuestion(input, data, {}, { now });
    expect(result.confidence.state).toBe('sufficient');
    expect(formatBusinessAnswer(result)).toBe('Saved booking amount: $410.00.');
    expect(resolveOwnerContext(resolveOwnerContextRequest(input), data, {}, { now }).content).toBe('Saved booking amount: $410.00.');
    expect(booking).toEqual(original);
  });

  it.each(['original', 'pending', 'rejected', 'expired'])('keeps the original obligation for %s unapproved work', async state => {
    const booking = approvedBookingFixture({ approvedJobScope: undefined,
      jobScopeControl: { state }, extraWorkRequests: [{ status: state, priceDeltaCents: 21000 }] });
    const data = await project(booking);
    expect(canonicalTotalCents(booking)).toBe(20000);
    expect(data.bookings[0]).toMatchObject({ amount: 200, baseAmount: 200, amountBasis: 'original' });
  });

  const invalid = {
    'stale version': b => { b.jobScopeControl.approvedVersion = 3; },
    'invalid hash binding': b => { b.jobScopeControl.approvedScopeHash = 'a'.repeat(64); },
    'tampered hash matching control': b => { b.approvedJobScope.scopeHash = 'a'.repeat(64); b.jobScopeControl.approvedScopeHash = 'a'.repeat(64); },
    'missing approval': b => { delete b.approvedJobScope.approvedAt; },
    'missing control': b => { delete b.jobScopeControl; },
    'contradictory additions': b => { b.approvedJobScope.snapshot.price = 620; },
    'tampered snapshot': b => { b.approvedJobScope.snapshot.extraWork[0].requestId = 'different'; },
    'wrong booking': b => { b.approvedJobScope.snapshot.bookingId = 'other-booking'; b.approvedJobScope.scopeHash = scopeHash(b.approvedJobScope.snapshot); b.jobScopeControl.approvedScopeHash = b.approvedJobScope.scopeHash; },
    'invalid base precision': b => { b.agreedPrice = 111.111; },
    'missing base': b => { delete b.agreedPrice; },
  };
  it.each(Object.entries(invalid))('fails closed for %s rather than returning the outdated base', async (_name, change) => {
    const booking = approvedBookingFixture(); change(booking);
    const data = await project(booking);
    expect(data.bookings[0].amount).toBeNull();
    const result = answerBusinessQuestion(input, data, {}, { now });
    expect(result.status).not.toBe('answerable');
    expect(formatBusinessAnswer(result)).not.toMatch(/\$200|\$410|\$620/);
    expect(resolveOwnerContext(resolveOwnerContextRequest(input), data, {}, { now }).content).toMatch(/unavailable/);
  });

  it('does not trust an unverified raw approved projection', () => {
    expect(packet([approvedBookingFixture()]).bookings[0].amount).toBeNull();
  });
  it('fails safely if browser hashing is unavailable', async () => {
    vi.stubGlobal('crypto', {});
    try { expect((await project(approvedBookingFixture())).bookings[0].amount).toBeNull(); }
    finally { vi.unstubAllGlobals(); }
  });
  it.each(['base', 'scope', 'tenant', 'identity'])('revalidates %s after preparation', async change => {
    const [booking] = await prepareAssistantBookingFinancials([approvedBookingFixture()], 'tenant-a');
    if (change === 'base') booking.agreedPrice = 300;
    if (change === 'scope') booking.approvedJobScope.snapshot.price = 620;
    if (change === 'tenant') booking.tenantId = 'tenant-b';
    if (change === 'identity') booking.id = 'other-booking';
    const data = packet([booking]);
    if (change === 'tenant') expect(data.bookings).toEqual([]);
    else expect(data.bookings[0].amount).toBeNull();
  });

  it.each([
    ['partial', 10000, 0, 0, 31000], ['refund', 10000, 2500, 0, 33500],
    ['reversal', 10000, 0, 10000, 41000],
  ])('keeps total separate from %s balance and preserves ledger authority', async (_state, paid, refunded, reversed, remaining) => {
    const booking = approvedBookingFixture();
    booking.paymentAccounting = { ...planCutover(booking, now.toISOString()), confirmedPaymentCents: paid,
      confirmedRefundCents: refunded, confirmedManualReversalCents: reversed };
    const original = structuredClone(booking);
    expect(balance(booking)).toMatchObject({ totalCents: 41000, remainingCents: remaining });
    const data = await project(booking);
    expect(data.bookings[0].amount).toBe(410);
    expect(formatBusinessAnswer(answerBusinessQuestion(input, data, {}, { now }))).toBe('Saved booking amount: $410.00.');
    expect(booking).toEqual(original);
  });

  it('retains the last approved obligation while a newer revision is pending', async () => {
    const booking = approvedBookingFixture();
    Object.assign(booking.jobScopeControl, { state: 'pending', latestVersion: 3, latestScopeHash: 'pending' });
    expect((await project(booking)).bookings[0].amount).toBe(410);
  });
  it('uses approved obligations as calculation operands without substituting paid or remaining amounts', async () => {
    const b = approvedBookingFixture({ id: 'b', customerId: 'b', customerName: 'Synthetic B',
      approvedJobScope: undefined, jobScopeControl: undefined, agreedPrice: 100 });
    const data = packet(await prepareAssistantBookingFinancials([approvedBookingFixture(), b], 'tenant-a'));
    const result = answerBusinessQuestion('What are my next 2 bookings worth?', data, {}, { now });
    expect(result.status).toBe('answerable');
    expect(formatBusinessAnswer(result)).toContain('Total: $510.00 across 2 canonical records');
  });
  it('retains explicit customer priority and refuses a conflicting contextual booking', async () => {
    const a = approvedBookingFixture({ id: 'a', customerId: 'a', customerName: 'Synthetic A', approvedJobScope: undefined, jobScopeControl: undefined });
    const data = packet(await prepareAssistantBookingFinancials([a, approvedBookingFixture()], 'tenant-a'));
    const active = answerBusinessQuestion('Who is my next customer?', data, {}, { now }).context;
    expect(formatBusinessAnswer(answerBusinessQuestion(input, data, active, { now }))).toBe('Saved booking amount: $410.00.');
    expect(answerBusinessQuestion('How much is Synthetic Financial paying for that job?', data, active, { now }).status).toBe('needs_clarification');
  });
  it('excludes foreign financial records before factual resolution', async () => {
    const booking = approvedBookingFixture({ tenantId: 'tenant-b' });
    const data = await project(booking);
    expect(data.bookings).toEqual([]);
    expect(formatBusinessAnswer(answerBusinessQuestion(input, data, {}, { now }))).not.toContain('$410');
  });
});
