import { expect, it } from 'vitest';
import { bookingPrice, bookingStillOwed } from '../components/bookingDisplay';

const booking = {
  agreedPrice: 200, amountReceived: 100,
  approvedJobScope: { version: 2, scopeHash: 'synthetic-hash', approvedAt: '2026-09-04T12:00:00Z',
    snapshot: { schemaVersion: 1, bookingId: 'synthetic-booking', price: 410, extraWork: [{ requestId: 'synthetic-request', priceDeltaCents: 21000 }] } },
  jobScopeControl: { approvedVersion: 2, approvedScopeHash: 'synthetic-hash' },
};
it('IW-02 owner payment total and remaining projection show the approved obligation, not the base price', () => {
  expect(bookingPrice(booking)).toBe('$410.00');
  expect(bookingStillOwed(booking)).toBe('$310.00');
  expect(booking.agreedPrice).toBe(200);
});
it('IW-02 pending new scope does not replace the last approved financial total', () => {
  expect(bookingPrice({ ...booking, jobScopeControl: { ...booking.jobScopeControl, state: 'awaiting_approval', latestVersion: 3 } })).toBe('$410.00');
});
it('IW-02 invalid approved metadata never silently falls back to an outdated base total', () => {
  const invalid = { ...booking, jobScopeControl: { approvedVersion: 1, approvedScopeHash: 'other' } };
  expect(bookingPrice(invalid)).toBe('Price not set');
  expect(bookingStillOwed(invalid)).toBe('Unavailable');
});
