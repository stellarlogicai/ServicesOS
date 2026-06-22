/**
 * Feature flag hook for subscription-based access control
 * Checks if current tenant has access to specific features based on subscription tier
 */

import { useState, useEffect } from 'react';
import { getTenantSubscription, tenantHasFeature } from '../services/tenantService';

export function useSubscriptionFeatures(tenantId) {
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadSubscription() {
      try {
        setLoading(true);
        const sub = await getTenantSubscription(tenantId);
        setSubscription(sub);
        setError(null);
      } catch (err) {
        console.error('[Subscription Features] Error loading subscription:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    if (tenantId) {
      loadSubscription();
    }
  }, [tenantId]);

  const hasFeature = async (feature) => {
    if (!tenantId) return false;
    return await tenantHasFeature(tenantId, feature);
  };

  const canUseFeature = (feature) => {
    if (!subscription) return false;
    return subscription.features[feature] || false;
  };

  const isWithinLimit = (limitType, currentUsage) => {
    if (!subscription) return false;
    const limit = subscription.limits[limitType];
    if (limit === -1) return true; // Unlimited
    return currentUsage < limit;
  };

  return {
    subscription,
    loading,
    error,
    hasFeature,
    canUseFeature,
    isWithinLimit,
    tier: subscription?.tier || 'free',
    tierName: subscription?.tierName || 'Free',
    transactionFee: subscription?.transactionFee || 0.03
  };
}

/**
 * Simple feature check hook for specific features
 */
export function useFeatureAccess(tenantId, feature) {
  const [hasAccess, setHasAccess] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAccess() {
      try {
        setLoading(true);
        const access = await tenantHasFeature(tenantId, feature);
        setHasAccess(access);
      } catch (err) {
        console.error('[Feature Access] Error checking access:', err);
        setHasAccess(false);
      } finally {
        setLoading(false);
      }
    }

    if (tenantId && feature) {
      checkAccess();
    }
  }, [tenantId, feature]);

  return { hasAccess, loading };
}
