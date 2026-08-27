const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const {
  DEFAULT_BUSINESS_TIME_ZONE,
  GrowthAICreditEntitlementError,
  MONTHLY_GROWTH_AI_ALLOWANCE,
  growthAICreditPeriodForTenant,
  isValidIanaTimeZone,
  resolveGrowthAICreditBalanceState,
  resolveTenantTimeZone,
} = require('../growthAICreditEntitlement');

function tenant(timeZone) {
  return { businessSettings: timeZone === undefined ? {} : { timeZone } };
}

function existingBalance(overrides = {}) {
  const period = growthAICreditPeriodForTenant(tenant('UTC'), new Date('2026-08-20T12:00:00.000Z'));
  return {
    schemaVersion: 2,
    tenantId: 'tenant-a',
    buckets: { monthly: 82, promotional: 7, purchased: 20 },
    reservedCredits: 0,
    monthlyAllowance: MONTHLY_GROWTH_AI_ALLOWANCE,
    ...period,
    ...overrides,
  };
}

describe('GrowthAI canonical tenant credit periods', () => {
  test('accepts IANA timezones and rejects invalid values', () => {
    for (const timeZone of ['America/Chicago', 'America/New_York', 'UTC']) {
      assert.equal(isValidIanaTimeZone(timeZone), true);
      assert.equal(resolveTenantTimeZone(tenant(timeZone)), timeZone);
    }
    assert.equal(isValidIanaTimeZone('Central-ish'), false);
  });

  test('uses UTC only when the canonical tenant timezone is missing or invalid', () => {
    assert.equal(resolveTenantTimeZone(tenant()), DEFAULT_BUSINESS_TIME_ZONE);
    assert.equal(resolveTenantTimeZone(tenant('Central-ish')), DEFAULT_BUSINESS_TIME_ZONE);
    assert.equal(resolveTenantTimeZone({ timeZone: 'America/Chicago' }), DEFAULT_BUSINESS_TIME_ZONE);
  });

  test('uses tenant-local calendar month boundaries across DST', () => {
    const august = growthAICreditPeriodForTenant(tenant('America/Chicago'), new Date('2026-08-20T12:00:00.000Z'));
    assert.equal(august.periodKey, '2026-08');
    assert.equal(august.periodStart.toISOString(), '2026-08-01T05:00:00.000Z');
    assert.equal(august.nextResetAt.toISOString(), '2026-09-01T05:00:00.000Z');

    const march = growthAICreditPeriodForTenant(tenant('America/Chicago'), new Date('2026-03-20T12:00:00.000Z'));
    assert.equal(march.periodStart.toISOString(), '2026-03-01T06:00:00.000Z');
    assert.equal(march.nextResetAt.toISOString(), '2026-04-01T05:00:00.000Z');
  });

  test('handles year rollover and UTC fallback without fixed-duration months', () => {
    const chicago = growthAICreditPeriodForTenant(tenant('America/Chicago'), new Date('2026-12-20T12:00:00.000Z'));
    assert.equal(chicago.periodKey, '2026-12');
    assert.equal(chicago.periodStart.toISOString(), '2026-12-01T06:00:00.000Z');
    assert.equal(chicago.nextResetAt.toISOString(), '2027-01-01T06:00:00.000Z');

    const utc = growthAICreditPeriodForTenant(tenant('invalid'), new Date('2026-02-15T12:00:00.000Z'));
    assert.equal(utc.periodStart.toISOString(), '2026-02-01T00:00:00.000Z');
    assert.equal(utc.nextResetAt.toISOString(), '2026-03-01T00:00:00.000Z');
  });

  test('provisions a first-time tenant with exactly 100 monthly credits', () => {
    const result = resolveGrowthAICreditBalanceState({
      existingBalance: null,
      tenant: tenant('UTC'),
      tenantId: 'tenant-a',
      now: new Date('2026-08-20T12:00:00.000Z'),
    });
    assert.equal(result.reason, 'provisioned');
    assert.deepEqual(result.balance.buckets, { monthly: 100, promotional: 0, purchased: 0 });
    assert.equal(result.balance.monthlyAllowance, 100);
    assert.equal(result.balance.periodKey, '2026-08');
  });

  test('normalizes a legacy canonical balance without changing any bucket', () => {
    const result = resolveGrowthAICreditBalanceState({
      existingBalance: {
        schemaVersion: 1,
        tenantId: 'tenant-a',
        buckets: { monthly: 23, promotional: 7, purchased: 20 },
        reservedCredits: 1,
      },
      tenant: tenant('America/New_York'),
      tenantId: 'tenant-a',
      now: new Date('2026-08-20T12:00:00.000Z'),
    });
    assert.equal(result.reason, 'normalized');
    assert.deepEqual(result.balance.buckets, { monthly: 23, promotional: 7, purchased: 20 });
    assert.equal(result.balance.reservedCredits, 1);
    assert.equal(result.balance.timeZone, 'America/New_York');
  });

  test('does not reprovision a current-period balance', () => {
    const current = existingBalance();
    const result = resolveGrowthAICreditBalanceState({
      existingBalance: current,
      tenant: tenant('UTC'),
      tenantId: 'tenant-a',
      now: new Date('2026-08-25T12:00:00.000Z'),
    });
    assert.equal(result.reason, 'current');
    assert.equal(result.changed, false);
    assert.equal(result.balance.buckets.monthly, 82);
  });

  test('renews monthly to exactly 100 without rollover and preserves durable buckets', () => {
    const result = resolveGrowthAICreditBalanceState({
      existingBalance: existingBalance(),
      tenant: tenant('UTC'),
      tenantId: 'tenant-a',
      now: new Date('2026-09-01T00:00:00.000Z'),
    });
    assert.equal(result.reason, 'renewed');
    assert.deepEqual(result.balance.buckets, { monthly: 100, promotional: 7, purchased: 20 });
    assert.equal(result.balance.periodKey, '2026-09');
  });

  test('defers renewal while an old-period reservation is active', () => {
    assert.throws(() => resolveGrowthAICreditBalanceState({
      existingBalance: existingBalance({ reservedCredits: 1 }),
      tenant: tenant('UTC'),
      tenantId: 'tenant-a',
      now: new Date('2026-09-01T00:00:00.000Z'),
    }), error => error instanceof GrowthAICreditEntitlementError && error.code === 'credit_period_pending');
  });

  test('rejects malformed or cross-tenant canonical balances rather than granting credits', () => {
    for (const balance of [
      existingBalance({ tenantId: 'tenant-b' }),
      existingBalance({ buckets: { monthly: -1, promotional: 0, purchased: 0 } }),
      existingBalance({ buckets: { monthly: 1, promotional: 0, purchased: 0, arbitrary: 999 } }),
      existingBalance({ reservedCredits: -1 }),
      existingBalance({ monthlyAllowance: 999 }),
      existingBalance({ periodKey: '2026-99' }),
      existingBalance({ periodStart: new Date('2026-08-02T00:00:00.000Z') }),
    ]) {
      assert.throws(() => resolveGrowthAICreditBalanceState({
        existingBalance: balance,
        tenant: tenant('UTC'),
        tenantId: 'tenant-a',
        now: new Date('2026-08-20T12:00:00.000Z'),
      }), error => error instanceof GrowthAICreditEntitlementError && error.code === 'credit_state_invalid');
    }
  });

  test('one tenant timezone never influences another tenant period', () => {
    const chicago = growthAICreditPeriodForTenant(tenant('America/Chicago'), new Date('2026-09-01T03:00:00.000Z'));
    const utc = growthAICreditPeriodForTenant(tenant('UTC'), new Date('2026-09-01T03:00:00.000Z'));
    assert.equal(chicago.periodKey, '2026-08');
    assert.equal(utc.periodKey, '2026-09');
  });
});
