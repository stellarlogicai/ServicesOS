const PRICE_ID_PATTERN = /^price_[A-Za-z0-9]+$/;

function configuredOwnerSubscriptionPrices(configuration = {}) {
  const monthlyValue = configuration.monthlyPriceId ?? configuration.monthly;
  const annualValue = configuration.annualPriceId ?? configuration.annual;
  const monthly = typeof monthlyValue === 'string' ? monthlyValue.trim() : '';
  const annual = typeof annualValue === 'string' ? annualValue.trim() : '';
  if (!PRICE_ID_PATTERN.test(monthly) || !PRICE_ID_PATTERN.test(annual) || monthly === annual) {
    throw new Error('Owner subscription Price configuration is invalid.');
  }
  return { monthly, annual };
}

function ownerSubscriptionIntervalForPrice(priceIds, priceId) {
  if (priceIds?.monthly === priceId) return 'monthly';
  if (priceIds?.annual === priceId) return 'annual';
  return null;
}

function ownerSubscriptionPriceForInterval(priceIds, interval) {
  if (interval === 'monthly') return priceIds.monthly;
  if (interval === 'annual') return priceIds.annual;
  return null;
}

module.exports = {
  configuredOwnerSubscriptionPrices,
  ownerSubscriptionIntervalForPrice,
  ownerSubscriptionPriceForInterval,
};
