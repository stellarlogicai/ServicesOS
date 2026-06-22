// src/services/tenantAnalyticsService.js
/**
 * Tenant Analytics Service
 * Handles SaaS analytics: MRR, ARR, active tenants, churn rate, trial conversion, ARPT
 */

import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

// Subscription tier constants
export const SUBSCRIPTION_TIER = {
  TRIAL: 'trial',
  STARTER: 'starter',
  PROFESSIONAL: 'professional',
  ENTERPRISE: 'enterprise'
};

// Subscription status constants
export const SUBSCRIPTION_STATUS = {
  TRIAL: 'trial',
  ACTIVE: 'active',
  CANCELLED: 'cancelled',
  PAST_DUE: 'past_due'
};

/**
 * Calculate Monthly Recurring Revenue (MRR)
 * @returns {Promise<Object>}
 */
export async function calculateMRR() {
  const tenantsRef = collection(db, 'tenants');
  const snapshot = await getDocs(tenantsRef);
  const tenants = snapshot.docs.map(doc => doc.data());
  
  let mrr = 0;
  let tierBreakdown = {};
  
  for (const tenant of tenants) {
    if (tenant.subscriptionStatus === SUBSCRIPTION_STATUS.ACTIVE) {
      const monthlyPrice = getMonthlyPrice(tenant.subscriptionTier);
      mrr += monthlyPrice;
      
      if (!tierBreakdown[tenant.subscriptionTier]) {
        tierBreakdown[tenant.subscriptionTier] = { count: 0, mrr: 0 };
      }
      tierBreakdown[tenant.subscriptionTier].count += 1;
      tierBreakdown[tenant.subscriptionTier].mrr += monthlyPrice;
    }
  }
  
  return {
    mrr,
    tierBreakdown,
    activeTenants: Object.values(tierBreakdown).reduce((sum, t) => sum + t.count, 0)
  };
}

/**
 * Calculate Annual Recurring Revenue (ARR)
 * @returns {Promise<Object>}
 */
export async function calculateARR() {
  const mrrData = await calculateMRR();
  return {
    arr: mrrData.mrr * 12,
    tierBreakdown: mrrData.tierBreakdown,
    activeTenants: mrrData.activeTenants
  };
}

/**
 * Get active tenants count
 * @returns {Promise<Object>}
 */
export async function getActiveTenants() {
  const tenantsRef = collection(db, 'tenants');
  const snapshot = await getDocs(tenantsRef);
  const tenants = snapshot.docs.map(doc => doc.data());
  
  let active = 0;
  let trial = 0;
  let cancelled = 0;
  let pastDue = 0;
  
  for (const tenant of tenants) {
    if (tenant.subscriptionStatus === SUBSCRIPTION_STATUS.ACTIVE) {
      active++;
    } else if (tenant.subscriptionStatus === SUBSCRIPTION_STATUS.TRIAL) {
      trial++;
    } else if (tenant.subscriptionStatus === SUBSCRIPTION_STATUS.CANCELLED) {
      cancelled++;
    } else if (tenant.subscriptionStatus === SUBSCRIPTION_STATUS.PAST_DUE) {
      pastDue++;
    }
  }
  
  return {
    active,
    trial,
    cancelled,
    pastDue,
    total: tenants.length
  };
}

/**
 * Calculate churn rate
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Object>}
 */
export async function calculateChurnRate(startDate, endDate) {
  const tenantsRef = collection(db, 'tenants');
  const snapshot = await getDocs(tenantsRef);
  const tenants = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  // Count tenants at start of period
  let startActive = 0;
  let cancelledDuringPeriod = 0;
  
  for (const tenant of tenants) {
    if (tenant.createdAt < startDate) {
      if (tenant.subscriptionStatus === SUBSCRIPTION_STATUS.ACTIVE) {
        startActive++;
      }
    }
    
    // Check if cancelled during period
    if (tenant.cancelledAt && tenant.cancelledAt >= startDate && tenant.cancelledAt <= endDate) {
      cancelledDuringPeriod++;
    }
  }
  
  const churnRate = startActive > 0 ? (cancelledDuringPeriod / startActive) * 100 : 0;
  
  return {
    churnRate: Math.round(churnRate * 100) / 100,
    startActive,
    cancelledDuringPeriod,
    startDate,
    endDate
  };
}

/**
 * Calculate trial conversion rate
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Object>}
 */
export async function calculateTrialConversion(startDate, endDate) {
  const tenantsRef = collection(db, 'tenants');
  const snapshot = await getDocs(tenantsRef);
  const tenants = snapshot.docs.map(doc => doc.data());
  
  let trialsStarted = 0;
  let trialsConverted = 0;
  let trialsExpired = 0;
  
  for (const tenant of tenants) {
    if (tenant.createdAt >= startDate && tenant.createdAt <= endDate) {
      trialsStarted++;
      
      if (tenant.subscriptionStatus === SUBSCRIPTION_STATUS.ACTIVE) {
        trialsConverted++;
      } else if (tenant.subscriptionStatus === SUBSCRIPTION_STATUS.CANCELLED) {
        trialsExpired++;
      }
    }
  }
  
  const conversionRate = trialsStarted > 0 ? (trialsConverted / trialsStarted) * 100 : 0;
  
  return {
    conversionRate: Math.round(conversionRate * 100) / 100,
    trialsStarted,
    trialsConverted,
    trialsExpired,
    startDate,
    endDate
  };
}

/**
 * Calculate Average Revenue Per Tenant (ARPT)
 * @returns {Promise<Object>}
 */
export async function calculateARPT() {
  const tenantsRef = collection(db, 'tenants');
  const snapshot = await getDocs(tenantsRef);
  const tenants = snapshot.docs.map(doc => doc.data());
  
  let totalRevenue = 0;
  let activeTenants = 0;
  
  for (const tenant of tenants) {
    if (tenant.subscriptionStatus === SUBSCRIPTION_STATUS.ACTIVE) {
      const monthlyPrice = getMonthlyPrice(tenant.subscriptionTier);
      totalRevenue += monthlyPrice;
      activeTenants++;
    }
  }
  
  const arpt = activeTenants > 0 ? totalRevenue / activeTenants : 0;
  
  return {
    arpt: Math.round(arpt * 100) / 100,
    totalRevenue,
    activeTenants
  };
}

/**
 * Get monthly revenue trends
 * @param {number} year - Year
 * @returns {Promise<Array>}
 */
export async function getMonthlyRevenueTrends(year) {
  const trends = [];
  
  for (let month = 1; month <= 12; month++) {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-31`;
    
    const mrrData = await calculateMRR(startDate, endDate);
    
    trends.push({
      year,
      month,
      startDate,
      endDate,
      mrr: mrrData.mrr,
      activeTenants: mrrData.activeTenants,
      tierBreakdown: mrrData.tierBreakdown
    });
  }
  
  return trends;
}

/**
 * Get tenant growth metrics
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Object>}
 */
export async function getTenantGrowth(startDate, endDate) {
  const tenantsRef = collection(db, 'tenants');
  const snapshot = await getDocs(tenantsRef);
  const tenants = snapshot.docs.map(doc => doc.data());
  
  let newSignups = 0;
  let upgrades = 0;
  let downgrades = 0;
  
  for (const tenant of tenants) {
    if (tenant.createdAt >= startDate && tenant.createdAt <= endDate) {
      newSignups++;
    }
    
    // Check for tier changes (would need historical data in production)
    // For now, we'll track current tier distribution
  }
  
  const activeTenants = await getActiveTenants();
  
  return {
    newSignups,
    upgrades,
    downgrades,
    activeTenants: activeTenants.active,
    trialTenants: activeTenants.trial,
    startDate,
    endDate
  };
}

/**
 * Get comprehensive tenant analytics dashboard
 * @returns {Promise<Object>}
 */
export async function getTenantAnalyticsDashboard() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  
  // Current month MRR
  const startDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
  const endDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-31`;
  
  const [mrr, arr, activeTenants, churnRate, trialConversion, arpt, monthlyTrends, tenantGrowth] = await Promise.all([
    calculateMRR(startDate, endDate),
    calculateARR(),
    getActiveTenants(),
    calculateChurnRate(startDate, endDate),
    calculateTrialConversion(startDate, endDate),
    calculateARPT(),
    getMonthlyRevenueTrends(currentYear),
    getTenantGrowth(startDate, endDate)
  ]);
  
  return {
    mrr,
    arr,
    activeTenants,
    churnRate,
    trialConversion,
    arpt,
    monthlyTrends,
    tenantGrowth,
    period: {
      startDate,
      endDate,
      year: currentYear,
      month: currentMonth
    }
  };
}

/**
 * Get tier distribution
 * @returns {Promise<Object>}
 */
export async function getTierDistribution() {
  const tenantsRef = collection(db, 'tenants');
  const snapshot = await getDocs(tenantsRef);
  const tenants = snapshot.docs.map(doc => doc.data());
  
  const distribution = {};
  
  for (const tier of Object.values(SUBSCRIPTION_TIER)) {
    distribution[tier] = 0;
  }
  
  for (const tenant of tenants) {
    if (tenant.subscriptionTier) {
      distribution[tenant.subscriptionTier]++;
    }
  }
  
  return distribution;
}

/**
 * Get monthly price for subscription tier
 * @param {string} tier - Subscription tier
 * @returns {number} Monthly price
 */
function getMonthlyPrice(tier) {
  const prices = {
    [SUBSCRIPTION_TIER.TRIAL]: 0,
    [SUBSCRIPTION_TIER.STARTER]: 49,
    [SUBSCRIPTION_TIER.PROFESSIONAL]: 149,
    [SUBSCRIPTION_TIER.ENTERPRISE]: 399
  };
  
  return prices[tier] || 0;
}

/**
 * Get tenant leaderboard (by revenue)
 * @param {number} limit - Number of tenants to return
 * @returns {Promise<Array>}
 */
export async function getTenantLeaderboard(limit = 10) {
  const tenantsRef = collection(db, 'tenants');
  const snapshot = await getDocs(tenantsRef);
  const tenants = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  const leaderboard = [];
  
  for (const tenant of tenants) {
    // Get tenant's revenue (would need to aggregate from tenant's payments)
    // For now, use subscription tier as proxy
    const monthlyRevenue = getMonthlyPrice(tenant.subscriptionTier);
    
    leaderboard.push({
      tenantId: tenant.id,
      tenantName: tenant.companyName || tenant.name || 'Unknown',
      subscriptionTier: tenant.subscriptionTier,
      monthlyRevenue,
      subscriptionStatus: tenant.subscriptionStatus,
      createdAt: tenant.createdAt
    });
  }
  
  // Sort by revenue descending
  leaderboard.sort((a, b) => b.monthlyRevenue - a.monthlyRevenue);
  
  return leaderboard.slice(0, limit);
}

/**
 * Export tenant analytics as CSV
 * @returns {Promise<string>} CSV content
 */
export async function exportTenantAnalyticsCSV() {
  const dashboard = await getTenantAnalyticsDashboard();
  
  let csv = 'Metric,Value\n';
  csv += `MRR,${dashboard.mrr.mrr}\n`;
  csv += `ARR,${dashboard.arr.arr}\n`;
  csv += `Active Tenants,${dashboard.activeTenants.active}\n`;
  csv += `Trial Tenants,${dashboard.activeTenants.trial}\n`;
  csv += `Churn Rate,${dashboard.churnRate.churnRate}%\n`;
  csv += `Trial Conversion Rate,${dashboard.trialConversion.conversionRate}%\n`;
  csv += `ARPT,${dashboard.arpt.arpt}\n`;
  csv += `New Signups,${dashboard.tenantGrowth.newSignups}\n`;
  
  return csv;
}
