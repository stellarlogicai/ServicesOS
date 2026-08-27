function formatRenewalDate(nextResetAt, timeZone) {
  const date = new Date(nextResetAt);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone,
    }).format(date);
  } catch {
    return '';
  }
}

export function getGrowthAICreditPresentation({ balance, error = '', loading = false }) {
  if (loading) {
    return { status: 'loading', available: null, renewalLabel: '' };
  }
  if (error) {
    return { status: 'unavailable', available: null, renewalLabel: '' };
  }

  const renewalLabel = formatRenewalDate(balance?.nextResetAt, balance?.timeZone);
  const valid = Number.isInteger(balance?.available) && balance.available >= 0 &&
    Number.isInteger(balance?.reserved) && balance.reserved >= 0 &&
    Number.isInteger(balance?.monthlyAllowance) && balance.monthlyAllowance >= 0 &&
    Boolean(renewalLabel);
  if (!valid) {
    return { status: 'unavailable', available: null, renewalLabel: '' };
  }

  return {
    status: 'ready',
    available: balance.available,
    reserved: balance.reserved,
    monthlyAllowance: balance.monthlyAllowance,
    renewalLabel,
  };
}
