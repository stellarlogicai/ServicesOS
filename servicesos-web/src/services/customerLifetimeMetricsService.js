// src/services/customerLifetimeMetricsService.js
/**
 * Customer Lifetime Metrics Service
 * Tracks detailed lifetime metrics per customer including lifetime revenue, lifetime jobs, referral count, average ticket
 */

import { getDocs, collection } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Get customer lifetime metrics
 * @param {string} tenantId - Tenant ID
 * @param {string} customerId - Customer ID
 * @returns {Promise<Object>}
 */
export async function getCustomerLifetimeMetrics(tenantId, customerId) {
  // Get customer's jobs
  const jobsRef = collection(db, 'tenants', tenantId, 'jobs');
  const jobsSnap = await getDocs(jobsRef);
  
  const jobs = jobsSnap.docs.map(doc => doc.data())
    .filter(job => job.customerId === customerId);
  
  // Get customer's referrals
  const customersRef = collection(db, 'tenants', tenantId, 'customers');
  const customersSnap = await getDocs(customersRef);
  
  const customers = customersSnap.docs.map(doc => doc.data());
  const customer = customers.find(c => c.id === customerId);
  
  // Calculate metrics
  let lifetimeRevenue = 0;
  let completedJobs = 0;
  let totalJobs = jobs.length;
  let firstServiceDate = null;
  let lastServiceDate = null;
  
  for (const job of jobs) {
    if (job.status === 'completed') {
      completedJobs++;
      lifetimeRevenue += job.finalPrice || job.estimatedPrice || 0;
      
      const jobDate = new Date(job.date || job.createdAt);
      
      if (!firstServiceDate || jobDate < firstServiceDate) {
        firstServiceDate = jobDate;
      }
      
      if (!lastServiceDate || jobDate > lastServiceDate) {
        lastServiceDate = jobDate;
      }
    }
  }
  
  // Calculate average ticket
  const averageTicket = completedJobs > 0 ? (lifetimeRevenue / completedJobs).toFixed(2) : 0;
  
  // Get referral count
  const referralCount = customers.filter(c => c.referredBy === customerId).length;
  
  // Calculate customer lifetime value (CLV)
  const daysSinceFirstService = firstServiceDate 
    ? Math.floor((new Date() - firstServiceDate) / (1000 * 60 * 60 * 24))
    : 0;
  
  const monthlyRevenue = daysSinceFirstService > 0 
    ? (lifetimeRevenue / (daysSinceFirstService / 30)).toFixed(2)
    : 0;
  
  return {
    customerId,
    customerName: customer?.name || 'Unknown',
    lifetimeRevenue,
    lifetimeJobs: completedJobs,
    totalJobs,
    averageTicket,
    referralCount,
    firstServiceDate: firstServiceDate ? firstServiceDate.toISOString().split('T')[0] : null,
    lastServiceDate: lastServiceDate ? lastServiceDate.toISOString().split('T')[0] : null,
    daysSinceFirstService,
    monthlyRevenue,
    customerLifetimeValue: parseFloat(monthlyRevenue) * 12 // Annualized CLV
  };
}

/**
 * Get all customers lifetime metrics
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>}
 */
export async function getAllCustomersLifetimeMetrics(tenantId) {
  const customersRef = collection(db, 'tenants', tenantId, 'customers');
  const customersSnap = await getDocs(customersRef);
  
  const metricsData = [];
  
  for (const customerDoc of customersSnap.docs) {
    const customerId = customerDoc.id;
    const metrics = await getCustomerLifetimeMetrics(tenantId, customerId);
    metricsData.push(metrics);
  }
  
  // Sort by lifetime revenue (highest first)
  metricsData.sort((a, b) => b.lifetimeRevenue - a.lifetimeRevenue);
  
  return metricsData;
}

/**
 * Get top customers by lifetime value
 * @param {string} tenantId - Tenant ID
 * @param {number} limit - Number of customers to return
 * @returns {Promise<Array>}
 */
export async function getTopCustomersByLifetimeValue(tenantId, limit = 10) {
  const allMetrics = await getAllCustomersLifetimeMetrics(tenantId);
  return allMetrics.slice(0, limit);
}

/**
 * Get customer lifetime trends over time
 * @param {string} tenantId - Tenant ID
 * @param {string} customerId - Customer ID
 * @param {number} days - Number of days to analyze
 * @returns {Promise<Array>}
 */
export async function getCustomerLifetimeTrends(tenantId, customerId, days = 365) {
  const jobsRef = collection(db, 'tenants', tenantId, 'jobs');
  const jobsSnap = await getDocs(jobsRef);
  
  const jobs = jobsSnap.docs.map(doc => doc.data())
    .filter(job => job.customerId === customerId);
  
  // Filter by date range
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  const recentJobs = jobs.filter(job => {
    const jobDate = new Date(job.date || job.createdAt);
    return jobDate >= cutoffDate && job.status === 'completed';
  });
  
  // Group by month
  const monthlyData = {};
  
  for (const job of recentJobs) {
    const date = new Date(job.date || job.createdAt);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = {
        month: monthKey,
        jobsCompleted: 0,
        totalRevenue: 0
      };
    }
    
    monthlyData[monthKey].jobsCompleted++;
    monthlyData[monthKey].totalRevenue += job.finalPrice || job.estimatedPrice || 0;
  }
  
  // Calculate averages
  const trends = Object.values(monthlyData).map(data => ({
    ...data,
    averageTicket: data.jobsCompleted > 0 ? (data.totalRevenue / data.jobsCompleted).toFixed(2) : 0
  }));
  
  // Sort by month
  trends.sort((a, b) => a.month.localeCompare(b.month));
  
  return trends;
}

/**
 * Get customer segmentation by lifetime value
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>}
 */
export async function getCustomerSegmentation(tenantId) {
  const allMetrics = await getAllCustomersLifetimeMetrics(tenantId);
  
  const segments = {
    vip: [], // $5000+ lifetime revenue
    highValue: [], // $2000-$4999
    regular: [], // $500-$1999
    new: [], // <$500
    inactive: [] // No service in 90 days
  };
  
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  
  for (const customer of allMetrics) {
    const lastService = customer.lastServiceDate ? new Date(customer.lastServiceDate) : null;
    const isInactive = lastService && lastService < ninetyDaysAgo;
    
    if (isInactive) {
      segments.inactive.push(customer);
    } else if (customer.lifetimeRevenue >= 5000) {
      segments.vip.push(customer);
    } else if (customer.lifetimeRevenue >= 2000) {
      segments.highValue.push(customer);
    } else if (customer.lifetimeRevenue >= 500) {
      segments.regular.push(customer);
    } else {
      segments.new.push(customer);
    }
  }
  
  return {
    vip: segments.vip,
    highValue: segments.highValue,
    regular: segments.regular,
    new: segments.new,
    inactive: segments.inactive,
    totalCustomers: allMetrics.length,
    totalLifetimeRevenue: allMetrics.reduce((sum, c) => sum + c.lifetimeRevenue, 0)
  };
}
