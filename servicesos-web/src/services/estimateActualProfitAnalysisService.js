// src/services/estimateActualProfitAnalysisService.js
/**
 * Estimate-to-Actual-to-Profit Analysis Service
 * Analyzes estimate vs actual costs and calculates profit and margin per job
 */

import { getDocs, collection } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Get estimate-to-actual-to-profit analysis for a specific job
 * @param {string} tenantId - Tenant ID
 * @param {string} jobId - Job ID
 * @returns {Promise<Object>}
 */
export async function getJobEstimateActualProfitAnalysis(tenantId, jobId) {
  // Get job details
  const jobsRef = collection(db, 'tenants', tenantId, 'jobs');
  const jobsSnap = await getDocs(jobsRef);
  
  const jobs = jobsSnap.docs.map(doc => doc.data());
  const job = jobs.find(j => j.jobId === jobId);
  
  if (!job) {
    return { jobId, error: 'Job not found' };
  }
  
  // Get job completion for actual data
  const completionsRef = collection(db, 'tenants', tenantId, 'job_completions');
  const completionsSnap = await getDocs(completionsRef);
  
  const completions = completionsSnap.docs.map(doc => doc.data());
  const completion = completions.find(c => c.jobId === jobId);
  
  if (!completion) {
    return { jobId, error: 'Job completion not found' };
  }
  
  // Estimate data
  const estimatedPrice = job.estimatedPrice || job.finalPrice || 0;
  const estimatedHours = job.estimatedHours || 0;
  const estimatedLaborCost = estimatedHours * (job.hourlyRate || 25);
  
  // Actual data
  const actualPrice = completion.finalPrice || estimatedPrice;
  const actualHours = completion.actualHours || estimatedHours;
  const actualLaborCost = actualHours * (job.hourlyRate || 25);
  
  // Mileage cost (assuming $0.65 per mile)
  const mileageCost = (completion.milesDriven || 0) * 0.65;
  
  // Supply cost from inventory used
  let supplyCost = 0;
  if (completion.inventoryUsed) {
    for (const item of completion.inventoryUsed) {
      supplyCost += (item.quantityUsed || 0) * (item.costPerUnit || 0);
    }
  }
  
  // Transaction fees (assuming 2.9% + $0.30)
  const transactionFees = actualPrice * 0.029 + 0.30;
  
  // Total costs
  const totalCosts = actualLaborCost + mileageCost + supplyCost + transactionFees;
  
  // Profit and margin
  const profit = actualPrice - totalCosts;
  const profitMargin = actualPrice > 0 ? (profit / actualPrice * 100).toFixed(1) : 0;
  
  // Variance analysis
  const priceVariance = actualPrice - estimatedPrice;
  const hoursVariance = actualHours - estimatedHours;
  const laborCostVariance = actualLaborCost - estimatedLaborCost;
  
  return {
    jobId,
    estimate: {
      price: estimatedPrice,
      hours: estimatedHours,
      laborCost: estimatedLaborCost
    },
    actual: {
      price: actualPrice,
      hours: actualHours,
      laborCost: actualLaborCost,
      mileageCost,
      supplyCost,
      transactionFees
    },
    profit: {
      totalCosts,
      profit,
      profitMargin
    },
    variance: {
      priceVariance,
      hoursVariance,
      laborCostVariance
    }
  };
}

/**
 * Get estimate-to-actual-to-profit analysis for all jobs
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>}
 */
export async function getAllJobsEstimateActualProfitAnalysis(tenantId) {
  const jobsRef = collection(db, 'tenants', tenantId, 'jobs');
  const jobsSnap = await getDocs(jobsRef);
  
  const jobs = jobsSnap.docs.map(doc => doc.data());
  
  const analyses = [];
  
  for (const job of jobs) {
    if (job.status !== 'completed') continue;
    
    const analysis = await getJobEstimateActualProfitAnalysis(tenantId, job.jobId);
    if (!analysis.error) {
      analyses.push(analysis);
    }
  }
  
  return analyses;
}

/**
 * Get estimate-to-actual-to-profit summary
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>}
 */
export async function getEstimateActualProfitSummary(tenantId) {
  const analyses = await getAllJobsEstimateActualProfitAnalysis(tenantId);
  
  if (analyses.length === 0) {
    return {
      totalJobs: 0,
      totalRevenue: 0,
      totalCosts: 0,
      totalProfit: 0,
      averageProfitMargin: 0
    };
  }
  
  const totalRevenue = analyses.reduce((sum, a) => sum + a.actual.price, 0);
  const totalCosts = analyses.reduce((sum, a) => sum + a.profit.totalCosts, 0);
  const totalProfit = analyses.reduce((sum, a) => sum + a.profit.profit, 0);
  const averageProfitMargin = analyses.reduce((sum, a) => sum + parseFloat(a.profit.profitMargin), 0) / analyses.length;
  
  const profitableJobs = analyses.filter(a => a.profit.profit > 0).length;
  const unprofitableJobs = analyses.filter(a => a.profit.profit < 0).length;
  
  return {
    totalJobs: analyses.length,
    totalRevenue,
    totalCosts,
    totalProfit,
    averageProfitMargin: averageProfitMargin.toFixed(1),
    profitableJobs,
    unprofitableJobs,
    profitabilityRate: (profitableJobs / analyses.length * 100).toFixed(1)
  };
}

/**
 * Get estimate-to-actual-to-profit trends over time
 * @param {string} tenantId - Tenant ID
 * @param {number} days - Number of days to analyze
 * @returns {Promise<Array>}
 */
export async function getEstimateActualProfitTrends(tenantId, days = 30) {
  const analyses = await getAllJobsEstimateActualProfitAnalysis(tenantId);
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  const jobsRef = collection(db, 'tenants', tenantId, 'jobs');
  const jobsSnap = await getDocs(jobsRef);
  
  const jobs = jobsSnap.docs.map(doc => doc.data());
  
  // Filter analyses by date
  const recentAnalyses = analyses.filter(analysis => {
    const job = jobs.find(j => j.jobId === analysis.jobId);
    if (!job) return false;
    
    const jobDate = new Date(job.date || job.createdAt);
    return jobDate >= cutoffDate;
  });
  
  const weeklyData = {};
  
  for (const analysis of recentAnalyses) {
    const job = jobs.find(j => j.jobId === analysis.jobId);
    if (!job) continue;
    
    const date = new Date(job.date || job.createdAt);
    const weekKey = `${date.getFullYear()}-W${Math.ceil(date.getDate() / 7)}`;
    
    if (!weeklyData[weekKey]) {
      weeklyData[weekKey] = {
        week: weekKey,
        totalRevenue: 0,
        totalCosts: 0,
        totalProfit: 0,
        jobCount: 0
      };
    }
    
    weeklyData[weekKey].totalRevenue += analysis.actual.price;
    weeklyData[weekKey].totalCosts += analysis.profit.totalCosts;
    weeklyData[weekKey].totalProfit += analysis.profit.profit;
    weeklyData[weekKey].jobCount++;
  }
  
  const trends = Object.values(weeklyData).map(data => ({
    ...data,
    averageProfitMargin: data.totalRevenue > 0 ? (data.totalProfit / data.totalRevenue * 100).toFixed(1) : 0
  }));
  
  trends.sort((a, b) => a.week.localeCompare(b.week));
  
  return trends;
}

/**
 * Get most profitable jobs
 * @param {string} tenantId - Tenant ID
 * @param {number} limit - Number of jobs to return
 * @returns {Promise<Array>}
 */
export async function getMostProfitableJobs(tenantId, limit = 10) {
  const analyses = await getAllJobsEstimateActualProfitAnalysis(tenantId);
  return analyses
    .sort((a, b) => b.profit.profit - a.profit.profit)
    .slice(0, limit);
}

/**
 * Get least profitable jobs
 * @param {string} tenantId - Tenant ID
 * @param {number} limit - Number of jobs to return
 * @returns {Promise<Array>}
 */
export async function getLeastProfitableJobs(tenantId, limit = 10) {
  const analyses = await getAllJobsEstimateActualProfitAnalysis(tenantId);
  return analyses
    .sort((a, b) => a.profit.profit - b.profit.profit)
    .slice(0, limit);
}
