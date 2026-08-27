const MONTHLY_GROWTH_AI_ALLOWANCE = 100;
const DEFAULT_BUSINESS_TIME_ZONE = 'UTC';
const CREDIT_BUCKETS = Object.freeze(['monthly', 'promotional', 'purchased']);

class GrowthAICreditEntitlementError extends Error {
  constructor(message, { code = 'credit_state_invalid', status = 409 } = {}) {
    super(message);
    this.name = 'GrowthAICreditEntitlementError';
    this.code = code;
    this.status = status;
  }
}

function isValidIanaTimeZone(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value.trim() }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

function resolveTenantTimeZone(tenant = {}) {
  const candidate = tenant?.businessSettings?.timeZone;
  return isValidIanaTimeZone(candidate) ? candidate.trim() : DEFAULT_BUSINESS_TIME_ZONE;
}

function zonedDateTimeParts(value, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  return Object.fromEntries(parts
    .filter(part => part.type !== 'literal')
    .map(part => [part.type, Number(part.value)]));
}

function sameLocalDateTime(parts, target) {
  return ['year', 'month', 'day', 'hour', 'minute', 'second']
    .every(key => parts[key] === target[key]);
}

function compareLocalDateTime(parts, target) {
  for (const key of ['year', 'month', 'day', 'hour', 'minute', 'second']) {
    if (parts[key] !== target[key]) return parts[key] < target[key] ? -1 : 1;
  }
  return 0;
}

function localMonthBoundaryToUtc(year, month, timeZone) {
  const target = { year, month, day: 1, hour: 0, minute: 0, second: 0 };
  const targetAsUtc = Date.UTC(year, month - 1, 1, 0, 0, 0, 0);
  let candidate = targetAsUtc;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const parts = zonedDateTimeParts(new Date(candidate), timeZone);
    const representedAsUtc = Date.UTC(
      parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, 0,
    );
    const adjustment = targetAsUtc - representedAsUtc;
    if (adjustment === 0 && sameLocalDateTime(parts, target)) return new Date(candidate);
    candidate += adjustment;
  }

  // Handles rare zones that transition at local midnight without approximating offsets.
  const searchStart = targetAsUtc - (48 * 60 * 60 * 1000);
  const searchEnd = targetAsUtc + (48 * 60 * 60 * 1000);
  for (let instant = searchStart; instant <= searchEnd; instant += 60 * 1000) {
    const parts = zonedDateTimeParts(new Date(instant), timeZone);
    if (compareLocalDateTime(parts, target) >= 0) return new Date(instant);
  }

  throw new GrowthAICreditEntitlementError('The tenant credit period could not be calculated.');
}

function nextMonth(year, month) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

function growthAICreditPeriodForTenant(tenant, now = new Date()) {
  const instant = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(instant.getTime())) {
    throw new GrowthAICreditEntitlementError('The credit period time is invalid.');
  }
  const timeZone = resolveTenantTimeZone(tenant);
  const current = zonedDateTimeParts(instant, timeZone);
  const following = nextMonth(current.year, current.month);
  return {
    periodKey: `${current.year}-${String(current.month).padStart(2, '0')}`,
    periodStart: localMonthBoundaryToUtc(current.year, current.month, timeZone),
    nextResetAt: localMonthBoundaryToUtc(following.year, following.month, timeZone),
    timeZone,
  };
}

function normalizeBuckets(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !CREDIT_BUCKETS.includes(key))) {
    throw new GrowthAICreditEntitlementError('The GrowthAI credit balance is malformed.');
  }
  const normalized = {};
  for (const bucket of CREDIT_BUCKETS) {
    if (!Number.isInteger(value[bucket]) || value[bucket] < 0) {
      throw new GrowthAICreditEntitlementError('The GrowthAI credit balance is malformed.');
    }
    normalized[bucket] = value[bucket];
  }
  return normalized;
}

function asDate(value) {
  if (value instanceof Date) return value;
  if (value && typeof value.toDate === 'function') return value.toDate();
  return null;
}

function sameInstant(left, right) {
  const leftDate = asDate(left);
  return leftDate != null && leftDate.getTime() === right.getTime();
}

function periodMetadataState(balance) {
  const keys = ['monthlyAllowance', 'periodKey', 'periodStart', 'nextResetAt', 'timeZone'];
  const present = keys.filter(key => balance[key] !== undefined);
  if (present.length === 0) return 'legacy';
  const periodMatch = typeof balance.periodKey === 'string'
    ? /^(\d{4})-(0[1-9]|1[0-2])$/.exec(balance.periodKey)
    : null;
  if (present.length !== keys.length || balance.monthlyAllowance !== MONTHLY_GROWTH_AI_ALLOWANCE ||
      !periodMatch ||
      !asDate(balance.periodStart) || !asDate(balance.nextResetAt) || !isValidIanaTimeZone(balance.timeZone)) {
    throw new GrowthAICreditEntitlementError('The GrowthAI credit period is malformed.');
  }
  const year = Number(periodMatch[1]);
  const month = Number(periodMatch[2]);
  const following = nextMonth(year, month);
  const expectedStart = localMonthBoundaryToUtc(year, month, balance.timeZone);
  const expectedReset = localMonthBoundaryToUtc(following.year, following.month, balance.timeZone);
  if (!sameInstant(balance.periodStart, expectedStart) || !sameInstant(balance.nextResetAt, expectedReset)) {
    throw new GrowthAICreditEntitlementError('The GrowthAI credit period is malformed.');
  }
  return 'current';
}

function resolveGrowthAICreditBalanceState({ existingBalance, tenant, tenantId, now = new Date() }) {
  const period = growthAICreditPeriodForTenant(tenant, now);
  if (existingBalance == null) {
    return {
      changed: true,
      reason: 'provisioned',
      balance: {
        schemaVersion: 2,
        tenantId,
        buckets: { monthly: MONTHLY_GROWTH_AI_ALLOWANCE, promotional: 0, purchased: 0 },
        reservedCredits: 0,
        monthlyAllowance: MONTHLY_GROWTH_AI_ALLOWANCE,
        ...period,
      },
    };
  }

  if (!existingBalance || typeof existingBalance !== 'object' || Array.isArray(existingBalance) ||
      existingBalance.tenantId !== tenantId || !Number.isInteger(existingBalance.reservedCredits) ||
      existingBalance.reservedCredits < 0) {
    throw new GrowthAICreditEntitlementError('The GrowthAI credit balance is malformed.');
  }

  const buckets = normalizeBuckets(existingBalance.buckets);
  const metadataState = periodMetadataState(existingBalance);
  if (metadataState === 'legacy') {
    return {
      changed: true,
      reason: 'normalized',
      balance: {
        ...existingBalance,
        schemaVersion: 2,
        tenantId,
        buckets,
        reservedCredits: existingBalance.reservedCredits,
        monthlyAllowance: MONTHLY_GROWTH_AI_ALLOWANCE,
        ...period,
      },
    };
  }

  if (period.periodKey < existingBalance.periodKey) {
    throw new GrowthAICreditEntitlementError('The GrowthAI credit period cannot move backward.');
  }

  if (period.periodKey > existingBalance.periodKey) {
    if (existingBalance.reservedCredits > 0) {
      throw new GrowthAICreditEntitlementError(
        'The monthly AI credit renewal is waiting for an active request to finish.',
        { code: 'credit_period_pending', status: 409 },
      );
    }
    return {
      changed: true,
      reason: 'renewed',
      balance: {
        ...existingBalance,
        schemaVersion: 2,
        tenantId,
        buckets: { ...buckets, monthly: MONTHLY_GROWTH_AI_ALLOWANCE },
        reservedCredits: 0,
        monthlyAllowance: MONTHLY_GROWTH_AI_ALLOWANCE,
        ...period,
      },
    };
  }

  const metadataChanged = existingBalance.schemaVersion !== 2 ||
    existingBalance.timeZone !== period.timeZone ||
    !sameInstant(existingBalance.periodStart, period.periodStart) ||
    !sameInstant(existingBalance.nextResetAt, period.nextResetAt);
  return {
    changed: metadataChanged,
    reason: metadataChanged ? 'normalized' : 'current',
    balance: metadataChanged ? {
      ...existingBalance,
      schemaVersion: 2,
      tenantId,
      buckets,
      monthlyAllowance: MONTHLY_GROWTH_AI_ALLOWANCE,
      ...period,
    } : { ...existingBalance, buckets },
  };
}

module.exports = {
  CREDIT_BUCKETS,
  DEFAULT_BUSINESS_TIME_ZONE,
  GrowthAICreditEntitlementError,
  MONTHLY_GROWTH_AI_ALLOWANCE,
  growthAICreditPeriodForTenant,
  isValidIanaTimeZone,
  resolveGrowthAICreditBalanceState,
  resolveTenantTimeZone,
};
