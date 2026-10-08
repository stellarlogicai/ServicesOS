import { cents, bookingObligationCents } from '../../../../cloud-functions/bookingFinancialAmount.mjs';

const verifiedObligation = Symbol('verifiedAssistantBookingObligation');
const stable = value => {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
};
const fingerprint = booking => JSON.stringify(stable({
  id: booking.id, tenantId: booking.tenantId, base: booking.agreedPrice ?? booking.price,
  approvedJobScope: booking.approvedJobScope, jobScopeControl: booking.jobScopeControl,
}));

// Match accounting's sorted-JSON SHA-256 contract without importing server crypto.
async function verifiedScopeHash(snapshot, expectedHash) {
  if (!/^[a-f0-9]{64}$/.test(expectedHash) || !globalThis.crypto?.subtle) return false;
  const serialized = JSON.stringify(stable(snapshot));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('') === expectedHash;
}

export async function prepareAssistantBookingFinancials(bookings, tenantId) {
  return Promise.all(bookings.map(async booking => {
    if (booking?.tenantId !== tenantId || !booking.approvedJobScope) return booking;
    try {
      const evidence = fingerprint(booking);
      const amountCents = bookingObligationCents(booking);
      if (amountCents === null || booking.approvedJobScope.snapshot.bookingId !== booking.id ||
          !await verifiedScopeHash(booking.approvedJobScope.snapshot, booking.approvedJobScope.scopeHash) ||
          evidence !== fingerprint(booking)) return booking;
      return { ...booking, [verifiedObligation]: Object.freeze({ amountCents, evidence }) };
    } catch {
      return booking;
    }
  }));
}

export function readAssistantBookingFinancials(booking) {
  const baseCents = cents(booking.agreedPrice ?? booking.price);
  if (booking.approvedJobScope === undefined || booking.approvedJobScope === null) {
    return { amount: baseCents === null ? null : baseCents / 100,
      baseAmount: baseCents === null ? null : baseCents / 100, amountBasis: 'original' };
  }
  let amountCents = null;
  try {
    const verified = booking[verifiedObligation];
    if (verified && verified.evidence === fingerprint(booking)) amountCents = verified.amountCents;
  } catch { /* Malformed financial evidence is unavailable, never the base fallback. */ }
  return { amount: amountCents === null ? null : amountCents / 100,
    baseAmount: baseCents === null ? null : baseCents / 100, amountBasis: 'approved_scope' };
}
