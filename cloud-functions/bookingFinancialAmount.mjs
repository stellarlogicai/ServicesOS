// Pure amount/projection rules. Payment authorization and persistence stay server-side.
export function cents(value, { allowZero = true } = {}) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const text = String(value);
  if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(result) && (allowZero || result > 0) ? result : null;
}

export function bookingObligationCents(booking = {}) {
  const base = cents(booking.agreedPrice ?? booking.price);
  if (base === null) return null;
  const approved = booking.approvedJobScope;
  if (approved === undefined || approved === null) return base;
  const control = booking.jobScopeControl;
  if (!Number.isSafeInteger(approved.version) || approved.version < 1 ||
      !approved.scopeHash || !approved.approvedAt || control?.approvedVersion !== approved.version ||
      control?.approvedScopeHash !== approved.scopeHash || approved.snapshot?.schemaVersion !== 1 ||
      typeof approved.snapshot.bookingId !== 'string' || !approved.snapshot.bookingId) return null;
  const total = cents(approved.snapshot.price);
  const changes = approved.snapshot.extraWork;
  if (changes !== undefined) {
    if (!Array.isArray(changes) || changes.length > 50) return null;
    const ids = new Set();
    let expected = base;
    for (const change of changes) {
      if (typeof change?.requestId !== 'string' || !change.requestId || ids.has(change.requestId) ||
          !Number.isSafeInteger(change.priceDeltaCents) || change.priceDeltaCents < 0) return null;
      ids.add(change.requestId);
      expected += change.priceDeltaCents;
      if (!Number.isSafeInteger(expected)) return null;
    }
    if (expected !== total) return null;
  }
  return total;
}
