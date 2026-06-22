// src/services/tenantHealthService.js
/**
 * Tenant Health Monitoring Service
 * Tracks last login, jobs this month, revenue processed, AI usage, storage
 */

import { collection, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Get tenant health metrics
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>}
 */
export async function getTenantHealth(tenantId) {
  const tenantRef = doc(db, 'tenants', tenantId);
  const tenantSnap = await getDoc(tenantRef);
  
  if (!tenantSnap.exists()) {
    return null;
  }
  
  const tenant = tenantSnap.data();
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  
  // Get jobs this month
  const jobsThisMonth = await getJobsCount(tenantId, currentMonth, currentYear);
  
  // Get revenue processed this month
  const revenueProcessed = await getRevenueProcessed(tenantId, currentMonth, currentYear);
  
  // Get AI usage this month
  const aiUsage = await getAIUsage(tenantId, currentMonth, currentYear);
  
  // Get storage usage
  const storageUsage = await getStorageUsage(tenantId);
  
  // Calculate health score
  const healthScore = calculateHealthScore({
    lastLogin: tenant.lastLoginAt,
    jobsThisMonth,
    revenueProcessed,
    aiUsage,
    storageUsage
  });
  
  return {
    tenantId,
    tenantName: tenant.companyName || tenant.name || 'Unknown',
    lastLogin: tenant.lastLoginAt,
    daysSinceLogin: tenant.lastLoginAt ? Math.floor((now - new Date(tenant.lastLoginAt)) / (1000 * 60 * 60 * 24)) : null,
    jobsThisMonth,
    revenueProcessed,
    aiUsage,
    storageUsage,
    healthScore,
    subscriptionTier: tenant.subscriptionTier,
    subscriptionStatus: tenant.subscriptionStatus,
    createdAt: tenant.createdAt
  };
}

/**
 * Get jobs count for a tenant in a specific month
 * @param {string} tenantId - Tenant ID
 * @param {number} month - Month (0-11)
 * @param {number} year - Year
 * @returns {Promise<number>}
 */
async function getJobsCount(tenantId, month, year) {
  const bookingsRef = collection(db, 'tenants', tenantId, 'bookings');
  const snapshot = await getDocs(bookingsRef);
  
  let count = 0;
  
  for (const doc of snapshot.docs) {
    const booking = doc.data();
    if (booking.date) {
      const bookingDate = new Date(booking.date);
      if (bookingDate.getMonth() === month && bookingDate.getFullYear() === year) {
        count++;
      }
    }
  }
  
  return count;
}

/**
 * Get revenue processed for a tenant in a specific month
 * @param {string} tenantId - Tenant ID
 * @param {number} month - Month (0-11)
 * @param {number} year - Year
 * @returns {Promise<number>}
 */
async function getRevenueProcessed(tenantId, month, year) {
  const paymentsRef = collection(db, 'tenants', tenantId, 'payments');
  const snapshot = await getDocs(paymentsRef);
  
  let total = 0;
  
  for (const doc of snapshot.docs) {
    const payment = doc.data();
    if (payment.status === 'completed' && payment.createdAt) {
      const paymentDate = new Date(payment.createdAt);
      if (paymentDate.getMonth() === month && paymentDate.getFullYear() === year) {
        total += payment.amount || 0;
      }
    }
  }
  
  return total;
}

/**
 * Get AI usage for a tenant in a specific month
 * @param {string} tenantId - Tenant ID
 * @param {number} month - Month (0-11)
 * @param {number} year - Year
 * @returns {Promise<Object>}
 */
async function getAIUsage(tenantId, month, year) {
  const aiLearningDataRef = collection(db, 'tenants', tenantId, 'ai_learning_data');
  const snapshot = await getDocs(aiLearningDataRef);
  
  let estimateCount = 0;
  let photoCount = 0;
  
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (data.createdAt) {
      const dataDate = new Date(data.createdAt);
      if (dataDate.getMonth() === month && dataDate.getFullYear() === year) {
        estimateCount++;
        if (data.photoUrls && Array.isArray(data.photoUrls)) {
          photoCount += data.photoUrls.length;
        }
      }
    }
  }
  
  return {
    estimateCount,
    photoCount
  };
}

/**
 * Get storage usage for a tenant
 * @returns {Promise<Object>}
 */
async function getStorageUsage() {
  // This would typically use Firebase Storage admin SDK
  // For now, we'll return a placeholder
  // In production, you would query Firebase Storage for actual usage
  
  return {
    totalSize: 0, // in bytes
    photosSize: 0,
    documentsSize: 0,
    lastCalculated: new Date().toISOString()
  };
}

/**
 * Calculate health score based on metrics
 * @param {Object} metrics - Health metrics
 * @returns {Object} Health score and status
 */
function calculateHealthScore(metrics) {
  let score = 100;
  const issues = [];
  
  // Check last login (within 7 days is healthy)
  if (metrics.lastLogin) {
    const daysSinceLogin = Math.floor((new Date() - new Date(metrics.lastLogin)) / (1000 * 60 * 60 * 24));
    if (daysSinceLogin > 30) {
      score -= 30;
      issues.push('No login in 30+ days');
    } else if (daysSinceLogin > 14) {
      score -= 15;
      issues.push('No login in 14+ days');
    } else if (daysSinceLogin > 7) {
      score -= 5;
      issues.push('No login in 7+ days');
    }
  } else {
    score -= 50;
    issues.push('Never logged in');
  }
  
  // Check job activity (at least 1 job per week is healthy)
  if (metrics.jobsThisMonth < 4) {
    score -= 20;
    issues.push('Low job activity');
  }
  
  // Check revenue (at least $500/month is healthy)
  if (metrics.revenueProcessed < 500) {
    score -= 15;
    issues.push('Low revenue');
  }
  
  // Check AI usage (using AI features is healthy)
  if (metrics.aiUsage.estimateCount < 1) {
    score -= 10;
    issues.push('Not using AI features');
  }
  
  // Determine health status
  let status = 'healthy';
  if (score < 50) {
    status = 'critical';
  } else if (score < 75) {
    status = 'warning';
  } else if (score < 90) {
    status = 'good';
  }
  
  return {
    score: Math.max(0, score),
    status,
    issues
  };
}

/**
 * Get all tenants health
 * @returns {Promise<Array>}
 */
export async function getAllTenantsHealth() {
  const tenantsRef = collection(db, 'tenants');
  const snapshot = await getDocs(tenantsRef);
  const tenants = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  const healthData = [];
  
  for (const tenant of tenants) {
    const health = await getTenantHealth(tenant.id);
    if (health) {
      healthData.push(health);
    }
  }
  
  // Sort by health score
  healthData.sort((a, b) => b.healthScore.score - a.healthScore.score);
  
  return healthData;
}

/**
 * Get at-risk tenants (health score < 50)
 * @returns {Promise<Array>}
 */
export async function getAtRiskTenants() {
  const allHealth = await getAllTenantsHealth();
  return allHealth.filter(t => t.healthScore.score < 50);
}

/**
 * Get inactive tenants (no login in 30+ days)
 * @returns {Promise<Array>}
 */
export async function getInactiveTenants() {
  const allHealth = await getAllTenantsHealth();
  return allHealth.filter(t => t.daysSinceLogin >= 30);
}

/**
 * Update tenant last login timestamp
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<void>}
 */
export async function updateLastLogin(tenantId) {
  const tenantRef = doc(db, 'tenants', tenantId);
  await updateDoc(tenantRef, {
    lastLoginAt: new Date().toISOString()
  });
}

/**
 * Get tenant health trends over time
 * @param {string} tenantId - Tenant ID
 * @param {number} months - Number of months to look back
 * @returns {Promise<Array>}
 */
export async function getTenantHealthTrends(tenantId, months = 6) {
  const trends = [];
  const now = new Date();
  
  for (let i = 0; i < months; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = date.getMonth();
    const year = date.getFullYear();
    
    const jobsCount = await getJobsCount(tenantId, month, year);
    const revenueProcessed = await getRevenueProcessed(tenantId, month, year);
    const aiUsage = await getAIUsage(tenantId, month, year);
    
    trends.push({
      year,
      month,
      jobsCount,
      revenueProcessed,
      aiUsage
    });
  }
  
  return trends.reverse();
}

/**
 * Get health summary for dashboard
 * @returns {Promise<Object>}
 */
export async function getHealthSummary() {
  const allHealth = await getAllTenantsHealth();
  
  const healthy = allHealth.filter(t => t.healthScore.status === 'healthy').length;
  const good = allHealth.filter(t => t.healthScore.status === 'good').length;
  const warning = allHealth.filter(t => t.healthScore.status === 'warning').length;
  const critical = allHealth.filter(t => t.healthScore.status === 'critical').length;
  
  const totalJobs = allHealth.reduce((sum, t) => sum + t.jobsThisMonth, 0);
  const totalRevenue = allHealth.reduce((sum, t) => sum + t.revenueProcessed, 0);
  const totalAIUsage = allHealth.reduce((sum, t) => sum + t.aiUsage.estimateCount, 0);
  
  return {
    totalTenants: allHealth.length,
    healthy,
    good,
    warning,
    critical,
    totalJobs,
    totalRevenue,
    totalAIUsage,
    averageHealthScore: allHealth.length > 0 
      ? allHealth.reduce((sum, t) => sum + t.healthScore.score, 0) / allHealth.length 
      : 0
  };
}

/**
 * Export tenant health data as CSV
 * @returns {Promise<string>} CSV content
 */
export async function exportTenantHealthCSV() {
  const allHealth = await getAllTenantsHealth();
  
  let csv = 'Tenant ID,Tenant Name,Last Login,Days Since Login,Jobs This Month,Revenue Processed,AI Estimates,AI Photos,Health Score,Health Status,Subscription Tier,Subscription Status\n';
  
  for (const health of allHealth) {
    csv += `"${health.tenantId}","${health.tenantName}","${health.lastLogin || ''}",${health.daysSinceLogin || 0},${health.jobsThisMonth},${health.revenueProcessed},${health.aiUsage.estimateCount},${health.aiUsage.photoCount},${health.healthScore.score},"${health.healthScore.status}","${health.subscriptionTier}","${health.subscriptionStatus}"\n`;
  }
  
  return csv;
}
