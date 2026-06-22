/**
 * Subscription tier configuration
 * Defines pricing, features, and limits for each subscription tier
 */

export const SUBSCRIPTION_TIERS = {
  free: {
    name: 'Free',
    monthlyPrice: 0,
    transactionFee: 0.03, // 3% transaction fee
    limits: {
      quotesPerMonth: 10,
      paymentsPerMonth: 0, // No payment processing
      smsPerMonth: 0,
      aiAnalysisPerMonth: 5,
      users: 1,
      locations: 1
    },
    features: {
      quoteGeneration: true,
      paymentProcessing: false,
      appointmentScheduling: true,
      smsNotifications: false,
      emailNotifications: true,
      aiPhotoAnalysis: true,
      customBranding: false,
      analytics: false,
      apiAccess: false,
      multiLocation: false,
      prioritySupport: false
    }
  },
  pro: {
    name: 'Professional',
    monthlyPrice: 99,
    transactionFee: 0.01, // 1% transaction fee
    limits: {
      quotesPerMonth: -1, // Unlimited
      paymentsPerMonth: -1,
      smsPerMonth: 100,
      aiAnalysisPerMonth: -1,
      users: 3,
      locations: 1
    },
    features: {
      quoteGeneration: true,
      paymentProcessing: true,
      appointmentScheduling: true,
      smsNotifications: true,
      emailNotifications: true,
      aiPhotoAnalysis: true,
      customBranding: false,
      analytics: true,
      apiAccess: false,
      multiLocation: false,
      prioritySupport: false
    }
  },
  enterprise: {
    name: 'Enterprise',
    monthlyPrice: 299,
    transactionFee: 0.005, // 0.5% transaction fee
    limits: {
      quotesPerMonth: -1,
      paymentsPerMonth: -1,
      smsPerMonth: -1,
      aiAnalysisPerMonth: -1,
      users: -1,
      locations: -1
    },
    features: {
      quoteGeneration: true,
      paymentProcessing: true,
      appointmentScheduling: true,
      smsNotifications: true,
      emailNotifications: true,
      aiPhotoAnalysis: true,
      customBranding: true,
      analytics: true,
      apiAccess: true,
      multiLocation: true,
      prioritySupport: true
    }
  }
};

/**
 * Get subscription tier by name
 */
export function getSubscriptionTier(tierName) {
  return SUBSCRIPTION_TIERS[tierName] || SUBSCRIPTION_TIERS.free;
}

/**
 * Check if a feature is available for a subscription tier
 */
export function hasFeature(tierName, feature) {
  const tier = getSubscriptionTier(tierName);
  return tier.features[feature] || false;
}

/**
 * Check if usage is within limits for a subscription tier
 */
export function isWithinLimit(tierName, usageType, currentUsage) {
  const tier = getSubscriptionTier(tierName);
  const limit = tier.limits[usageType];
  
  if (limit === -1) return true; // Unlimited
  return currentUsage < limit;
}

/**
 * Calculate transaction fee based on subscription tier
 */
export function calculateTransactionFee(tierName, amount) {
  const tier = getSubscriptionTier(tierName);
  return amount * tier.transactionFee;
}

/**
 * Get pricing display information
 */
export function getPricingDisplay() {
  return Object.entries(SUBSCRIPTION_TIERS).map(([key, tier]) => ({
    key,
    name: tier.name,
    monthlyPrice: tier.monthlyPrice,
    transactionFee: `${(tier.transactionFee * 100).toFixed(1)}%`,
    features: Object.keys(tier.features).filter(feature => tier.features[feature])
  }));
}
