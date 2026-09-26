function ownerSubscriptionEntitlement(tenant, nowSeconds = Math.floor(Date.now() / 1000), providerSubscription = null, allowedPriceIds = null) {
  const status = tenant?.subscriptionStatus;
  const periodEnd = tenant?.currentPeriodEnd;
  const validPeriod = Number.isSafeInteger(periodEnd) && periodEnd > nowSeconds;
  const providerItem = providerSubscription?.items?.data;
  const providerPeriodEnd = Number.isSafeInteger(providerSubscription?.current_period_end)
    ? providerSubscription.current_period_end : providerItem?.[0]?.current_period_end;
  const latestInvoice = providerSubscription?.latest_invoice;
  const providerPriceId = typeof providerItem?.[0]?.price === 'string' ? providerItem[0].price : providerItem?.[0]?.price?.id;
  const configuredPriceAllowed = !Array.isArray(allowedPriceIds) || allowedPriceIds.includes(providerPriceId);
  const freshActive = providerSubscription?.status === 'active' &&
    providerSubscription.metadata?.tenantId === tenant?.id &&
    providerSubscription.metadata?.billingPurpose === 'servicesos_owner_subscription' &&
    providerSubscription.metadata?.onboardingSchemaVersion === '1' &&
    providerSubscription.id === tenant?.stripeSubscriptionId &&
    (typeof providerSubscription.customer === 'string' ? providerSubscription.customer : providerSubscription.customer?.id) === tenant?.stripeCustomerId &&
    Array.isArray(providerItem) && providerItem.length === 1 && providerItem[0]?.quantity === 1 &&
    providerPriceId === tenant?.subscriptionPriceId && configuredPriceAllowed &&
    latestInvoice?.id === tenant?.latestInvoiceId && latestInvoice.status === 'paid' &&
    providerPeriodEnd > nowSeconds;
  if (tenant?.status === 'active' && status === 'active' && validPeriod &&
    !tenant.paymentFailureAt && !tenant.cureDeadline) {
    return {
      state: 'active',
      paidAccess: true,
      inCure: false,
      cureDeadline: null,
      finalAcceptanceEligible: freshActive,
    };
  }
  const deadline = tenant?.cureDeadline;
  if (status === 'past_due' && Number.isSafeInteger(deadline)) {
    return {
      state: 'cure',
      paidAccess: deadline > nowSeconds,
      inCure: deadline > nowSeconds,
      cureDeadline: deadline,
      finalAcceptanceEligible: false,
    };
  }
  if (status === 'canceled') {
    return { state: 'canceled', paidAccess: false, inCure: false, cureDeadline: null, finalAcceptanceEligible: false };
  }
  return { state: 'unavailable', paidAccess: false, inCure: false, cureDeadline: null, finalAcceptanceEligible: false };
}

module.exports = { ownerSubscriptionEntitlement };
