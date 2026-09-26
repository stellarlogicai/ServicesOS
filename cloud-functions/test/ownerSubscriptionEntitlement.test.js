const assert = require('node:assert/strict');
const { test } = require('node:test');
const { ownerSubscriptionEntitlement } = require('../ownerSubscriptionEntitlement');

test('only valid current paid period is final-acceptance eligible', () => {
  const tenant = { id: 'tenant-a', status: 'active', subscriptionStatus: 'active', currentPeriodEnd: 200,
    stripeSubscriptionId: 'sub_a', stripeCustomerId: 'cus_a', subscriptionPriceId: 'price_a' };
  const provider = { id: 'sub_a', customer: 'cus_a', status: 'active', current_period_end: 200,
    metadata: { tenantId: 'tenant-a', billingPurpose: 'servicesos_owner_subscription', onboardingSchemaVersion: '1' },
    latest_invoice: { id: 'in_paid', status: 'paid' },
    items: { data: [{ price: 'price_a', quantity: 1 }] } };
  tenant.latestInvoiceId = 'in_paid';
  assert.deepEqual(ownerSubscriptionEntitlement(tenant, 100, provider), {
    state: 'active', paidAccess: true, inCure: false, cureDeadline: null, finalAcceptanceEligible: true,
  });
  assert.equal(ownerSubscriptionEntitlement(tenant, 100).finalAcceptanceEligible, false);
  assert.equal(ownerSubscriptionEntitlement(tenant, 100, { ...provider, status: 'canceled' }).finalAcceptanceEligible, false);
  assert.equal(ownerSubscriptionEntitlement(tenant, 100, { ...provider, customer: 'cus_other' }).finalAcceptanceEligible, false);
  assert.equal(ownerSubscriptionEntitlement(tenant, 100, { ...provider, metadata: { ...provider.metadata, tenantId: 'tenant-b' } }).finalAcceptanceEligible, false);
  assert.equal(ownerSubscriptionEntitlement(tenant, 100, { ...provider, latest_invoice: { id: 'in_paid', status: 'open' } }).finalAcceptanceEligible, false);
  assert.equal(ownerSubscriptionEntitlement(tenant, 100, { ...provider, latest_invoice: 'in_paid' }).finalAcceptanceEligible, false);
  assert.equal(ownerSubscriptionEntitlement({ subscriptionStatus: 'active', currentPeriodEnd: 99 }, 100).finalAcceptanceEligible, false);
  assert.equal(ownerSubscriptionEntitlement({ subscriptionStatus: 'active', currentPeriodEnd: 200, paymentFailureAt: 50 }, 100).finalAcceptanceEligible, false);
});

test('fresh final acceptance accepts either configured canonical interval Price only', () => {
  const prices = ['price_monthly', 'price_annual'];
  const tenant = { id: 'tenant-a', status: 'active', subscriptionStatus: 'active', currentPeriodEnd: 200,
    stripeSubscriptionId: 'sub_a', stripeCustomerId: 'cus_a', subscriptionPriceId: 'price_annual', latestInvoiceId: 'in_paid' };
  const provider = { id: 'sub_a', customer: 'cus_a', status: 'active', current_period_end: 200,
    metadata: { tenantId: 'tenant-a', billingPurpose: 'servicesos_owner_subscription', onboardingSchemaVersion: '1' },
    latest_invoice: { id: 'in_paid', status: 'paid' },
    items: { data: [{ price: 'price_annual', quantity: 1 }] } };
  assert.equal(ownerSubscriptionEntitlement(tenant, 100, provider, prices).finalAcceptanceEligible, true);
  assert.equal(ownerSubscriptionEntitlement(tenant, 100, { ...provider, items: { data: [{ price: 'price_unrelated', quantity: 1 }] } }, prices).finalAcceptanceEligible, false);
});

test('cure is access-valid only within seven-day deadline, never final-acceptance eligible', () => {
  const tenant = { subscriptionStatus: 'past_due', paymentFailureAt: 100, cureDeadline: 100 + 7 * 86400 };
  assert.equal(ownerSubscriptionEntitlement(tenant, 101).paidAccess, true);
  assert.equal(ownerSubscriptionEntitlement(tenant, 101).finalAcceptanceEligible, false);
  assert.equal(ownerSubscriptionEntitlement(tenant, tenant.cureDeadline).paidAccess, false);
});

test('canceled, malformed and client-only state fail closed', () => {
  for (const tenant of [{ subscriptionStatus: 'canceled', currentPeriodEnd: 200 },
    { subscriptionStatus: 'active' }, { subscriptionStatus: 'active', currentPeriodEnd: '200' },
    { billingEntitlement: 'active', finalAcceptanceEligible: true }]) {
    assert.equal(ownerSubscriptionEntitlement(tenant, 100).finalAcceptanceEligible, false);
  }
});
