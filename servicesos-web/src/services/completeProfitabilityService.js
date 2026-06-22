// src/services/completeProfitabilityService.js
/**
 * Complete Profitability Tracking Service
 * Tracks complete profitability including revenue, labor cost, mileage cost, supply cost, transaction fees, profit
 */

import { getDocs, collection } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Get complete profitability for a job
 * @param {string} tenantId - Tenant ID
 * @param {string} jobId - Job ID
 * @returns {Promise<Object>}
 */
export async function getJobCompleteProfitability(tenantId, jobId) {
  // Get job details
  const jobsRef = collection(db, 'tenants', tenantId, 'jobs');
  const jobsSnap = await getDocs(jobsRef);
  
  const jobs = jobsSnap.docs.map(doc => doc.data());
  const job = jobs.find(j => j.id === jobId);
  
  if (!job) {
    return null;
  }
  
  // Get job completion for actual hours and inventory
  const completionsRef = collection(db, 'tenants', tenantId, 'job_completions');
  const completionsSnap = await getDocs(completionsRef);
  
  const completions = completionsSnap.docs.map(doc => doc.data());
  const completion = completions.find(c => c.jobId === jobId);
  
  // Get employees for labor cost calculation
  const employeesRef = collection(db, 'tenants', tenantId, 'employees');
  const employeesSnap = await getDocs(employeesRef);
  
  const employees = employeesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  // Calculate revenue
  const revenue = job.finalPrice || job.estimatedPrice || 0;
  
  // Calculate labor cost
  let laborCost = 0;
  if (completion && completion.assignedEmployees && completion.actualHours) {
    for (const employeeId of completion.assignedEmployees) {
      const employee = employees.find(e => e.id === employeeId);
      if (employee) {
        laborCost += (employee.hourlyRate || 0) * completion.actualHours;
      }
    }
  }
  
  // Calculate mileage cost (assuming $0.65 per mile)
  const mileageCost = (job.milesDriven || 0) * 0.65;
  
  // Calculate supply cost from inventory used
  let supplyCost = 0;
  if (completion && completion.inventoryUsed) {
    for (const item of completion.inventoryUsed) {
      // Assuming cost per unit is stored or can be calculated
      supplyCost += (item.costPerUnit || 0) * (item.quantityUsed || 0);
    }
  }
  
  // Calculate transaction fees (assuming 2.9% + $0.30 for Stripe)
  const transactionFees = revenue * 0.029 + 0.30;
  
  // Calculate total costs and profit
  const totalCosts = laborCost + mileageCost + supplyCost + transactionFees;
  const profit = revenue - totalCosts;
  const profitMargin = revenue > 0 ? (profit / revenue * 100).toFixed(1) : 0;
  
  return {
    jobId,
    revenue,
    laborCost,
    mileageCost,
    supplyCost,
    transactionFees,
    totalCosts,
    profit,
    profitMargin
  };
}

/**
 * Get profitability summary for all jobs
 * @param {string} tenantId - Tenant ID
 * @param {number} days - Number of days to analyze
 * @returns {Promise<Object>}
 */
export async function getProfitabilitySummary(tenantId, days = 30) {
  const jobsRef = collection(db, 'tenants', tenantId, 'jobs');
  const jobsSnap = await getDocs(jobsRef);
  
  const jobs = jobsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  // Filter by date range
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  const recentJobs = jobs.filter(job => {
    const jobDate = new Date(job.date || job.createdAt);
    return jobDate >= cutoffDate && job.status === 'completed';
  });
  
  let totalRevenue = 0;
  let totalLaborCost = 0;
  let totalMileageCost = 0;
  let totalSupplyCost = 0;
  let totalTransactionFees = 0;
  let totalProfit = 0;
  
  for (const job of recentJobs) {
    const profitability = await getJobCompleteProfitability(tenantId, job.id);
    if (profitability) {
      totalRevenue += profitability.revenue;
      totalLaborCost += profitability.laborCost;
      totalMileageCost += profitability.mileageCost;
      totalSupplyCost += profitability.supplyCost;
      totalTransactionFees += profitability.transactionFees;
      totalProfit += profitability.profit;
    }
  }
  
  const totalCosts = totalLaborCost + totalMileageCost + totalSupplyCost + totalTransactionFees;
  const averageProfitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue * 100).toFixed(1) : 0;
  
  return {
    totalJobs: recentJobs.length,
    totalRevenue,
    totalLaborCost,
    totalMileageCost,
    totalSupplyCost,
    totalTransactionFees,
    totalCosts,
    totalProfit,
    averageProfitMargin,
    costBreakdown: {
      labor: totalRevenue > 0 ? (totalLaborCost / totalRevenue * 100).toFixed(1) : 0,
      mileage: totalRevenue > 0 ? (totalMileageCost / totalRevenue * 100).toFixed(1) : 0,
      supplies: totalRevenue > 0 ? (totalSupplyCost / totalRevenue * 100).toFixed(1) : 0,
      transaction: totalRevenue > 0 ? (totalTransactionFees / totalRevenue * 100).toFixed(1) : 0
    }
  };
}

/**
 * Get profitability trends over time
 * @param {string} tenantId - Tenant ID
 * @param {number} days - Number of days to analyze
 * @returns {Promise<Array>}
 */
export async function getProfitabilityTrends(tenantId, days = 30) {
  const jobsRef = collection(db, 'tenants', tenantId, 'jobs');
  const jobsSnap = await getDocs(jobsRef);
  
  const jobs = jobsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  // Filter by date range
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  const recentJobs = jobs.filter(job => {
    const jobDate = new Date(job.date || job.createdAt);
    return jobDate >= cutoffDate && job.status === 'completed';
  });
  
  // Group by day
  const dailyData = {};
  
  for (const job of recentJobs) {
    const date = new Date(job.date || job.createdAt).toISOString().split('T')[0];
    
    if (!dailyData[date]) {
      dailyData[date] = {
        date,
        revenue: 0,
        laborCost: 0,
        mileageCost: 0,
        supplyCost: 0,
        transactionFees: 0,
        profit: 0,
        jobCount: 0
      };
    }
    
    const profitability = await getJobCompleteProfitability(tenantId, job.id);
    if (profitability) {
      dailyData[date].revenue += profitability.revenue;
      dailyData[date].laborCost += profitability.laborCost;
      dailyData[date].mileageCost += profitability.mileageCost;
      dailyData[date].supplyCost += profitability.supplyCost;
      dailyData[date].transactionFees += profitability.transactionFees;
      dailyData[date].profit += profitability.profit;
      dailyData[date].jobCount++;
    }
  }
  
  // Calculate profit margins
  const trends = Object.values(dailyData).map(data => ({
    ...data,
    profitMargin: data.revenue > 0 ? (data.profit / data.revenue * 100).toFixed(1) : 0
  }));
  
  // Sort by date
  trends.sort((a, b) => a.date.localeCompare(b.date));
  
  return trends;
}

/**
 * Get most profitable jobs
 * @param {string} tenantId - Tenant ID
 * @param {number} days - Number of days to analyze
 * @param {number} limit - Number of jobs to return
 * @returns {Promise<Array>}
 */
export async function getMostProfitableJobs(tenantId, days = 30, limit = 10) {
  const jobsRef = collection(db, 'tenants', tenantId, 'jobs');
  const jobsSnap = await getDocs(jobsRef);
  
  const jobs = jobsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  // Filter by date range
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  const recentJobs = jobs.filter(job => {
    const jobDate = new Date(job.date || job.createdAt);
    return jobDate >= cutoffDate && job.status === 'completed';
  });
  
  const profitabilityData = [];
  
  for (const job of recentJobs) {
    const profitability = await getJobCompleteProfitability(tenantId, job.id);
    if (profitability) {
      profitabilityData.push({
        jobId: job.id,
        customerName: job.customerName,
        date: job.date,
        ...profitability
      });
    }
  }
  
  // Sort by profit (highest first)
  profitabilityData.sort((a, b) => b.profit - a.profit);
  
  return profitabilityData.slice(0, limit);
}

/**
 * Get least profitable jobs
 * @param {string} tenantId - Tenant ID
 * @param {number} days - Number of days to analyze
 * @param {number} limit - Number of jobs to return
 * @returns {Promise<Array>}
 */
export async function getLeastProfitableJobs(tenantId, days = 30, limit = 10) {
  const jobsRef = collection(db, 'tenants', tenantId, 'jobs');
  const jobsSnap = await getDocs(jobsRef);
  
  const jobs = jobsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  // Filter by date range
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  const recentJobs = jobs.filter(job => {
    const jobDate = new Date(job.date || job.createdAt);
    return jobDate >= cutoffDate && job.status === 'completed';
  });
  
  const profitabilityData = [];
  
  for (const job of recentJobs) {
    const profitability = await getJobCompleteProfitability(tenantId, job.id);
    if (profitability) {
      profitabilityData.push({
        jobId: job.id,
        customerName: job.customerName,
        date: job.date,
        ...profitability
      });
    }
  }
  
  // Sort by profit (lowest first)
  profitabilityData.sort((a, b) => a.profit - b.profit);
  
  return profitabilityData.slice(0, limit);
}
