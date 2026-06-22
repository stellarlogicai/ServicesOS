// src/services/profitabilityService.js
/**
 * Profitability Per Job Report Service
 * Calculates revenue, labor cost, mileage cost, supply cost, and profit per job
 */

import { collection, doc, getDoc, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Calculate profitability for a job
 * @param {string} tenantId - Tenant ID
 * @param {string} jobId - Job ID
 * @returns {Promise<Object>}
 */
export async function calculateJobProfitability(tenantId, jobId) {
  // Get job details
  const jobRef = doc(db, 'tenants', tenantId, 'jobs', jobId);
  const jobSnap = await getDoc(jobRef);
  
  if (!jobSnap.exists()) {
    throw new Error('Job not found');
  }
  
  const job = jobSnap.data();
  
  // Get job completion data
  const completionRef = doc(db, 'tenants', tenantId, 'job_completions', jobId);
  const completionSnap = await getDoc(completionRef);
  
  const completion = completionSnap.exists() ? completionSnap.data() : null;
  
  // Get mileage data for job
  const mileageRef = collection(db, 'tenants', tenantId, 'mileage');
  const mileageQ = query(mileageRef, where('jobId', '==', jobId));
  const mileageSnap = await getDocs(mileageQ);
  
  const mileageRecords = mileageSnap.docs.map(doc => doc.data());
  const totalMiles = mileageRecords.reduce((sum, m) => sum + (m.miles || 0), 0);
  
  // Revenue
  const revenue = job.finalPrice || job.estimatedPrice || 0;
  
  // Labor cost
  let laborCost = 0;
  if (completion && completion.actualHours && completion.assignedEmployees) {
    for (const employee of completion.assignedEmployees) {
      const empRef = doc(db, 'tenants', tenantId, 'employees', employee.id);
      const empSnap = await getDoc(empRef);
      if (empSnap.exists()) {
        const emp = empSnap.data();
        const hourlyRate = emp.hourlyRate || 0;
        laborCost += hourlyRate * completion.actualHours;
      }
    }
  }
  
  // Mileage cost (assume $0.65 per mile)
  const mileageRate = 0.65;
  const mileageCost = totalMiles * mileageRate;
  
  // Supply cost (from job completion if available)
  const supplyCost = completion?.supplyCost || 0;
  
  // Total costs
  const totalCost = laborCost + mileageCost + supplyCost;
  
  // Profit
  const profit = revenue - totalCost;
  
  // Profit margin
  const profitMargin = revenue > 0 ? Math.round((profit / revenue) * 100) : 0;
  
  return {
    jobId,
    jobDate: job.date,
    customerName: job.customerName || '',
    revenue,
    costs: {
      labor: laborCost,
      mileage: mileageCost,
      supplies: supplyCost,
      total: totalCost
    },
    profit,
    profitMargin,
    details: {
      actualHours: completion?.actualHours || 0,
      totalMiles,
      crewSize: completion?.assignedEmployees?.length || 1
    }
  };
}

/**
 * Get profitability report for date range
 * @param {string} tenantId - Tenant ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Array>}
 */
export async function getProfitabilityReport(tenantId, startDate, endDate) {
  const jobsRef = collection(db, 'tenants', tenantId, 'jobs');
  const q = query(
    jobsRef,
    where('date', '>=', startDate),
    where('date', '<=', endDate),
    orderBy('date', 'desc')
  );
  const snapshot = await getDocs(q);
  
  const jobs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  const profitabilityData = [];
  
  for (const job of jobs) {
    try {
      const profitability = await calculateJobProfitability(tenantId, job.id);
      profitabilityData.push(profitability);
    } catch {
      // Skip jobs that can't be calculated
    }
  }
  
  return profitabilityData;
}

/**
 * Get profitability summary for date range
 * @param {string} tenantId - Tenant ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Object>}
 */
export async function getProfitabilitySummary(tenantId, startDate, endDate) {
  const report = await getProfitabilityReport(tenantId, startDate, endDate);
  
  let totalRevenue = 0;
  let totalLaborCost = 0;
  let totalMileageCost = 0;
  let totalSupplyCost = 0;
  let totalProfit = 0;
  
  let profitableJobs = 0;
  let unprofitableJobs = 0;
  
  for (const item of report) {
    totalRevenue += item.revenue;
    totalLaborCost += item.costs.labor;
    totalMileageCost += item.costs.mileage;
    totalSupplyCost += item.costs.supplies;
    totalProfit += item.profit;
    
    if (item.profit > 0) {
      profitableJobs++;
    } else {
      unprofitableJobs++;
    }
  }
  
  const totalCost = totalLaborCost + totalMileageCost + totalSupplyCost;
  const overallProfitMargin = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100) : 0;
  const profitabilityRate = report.length > 0 ? Math.round((profitableJobs / report.length) * 100) : 0;
  
  return {
    totalJobs: report.length,
    profitableJobs,
    unprofitableJobs,
    profitabilityRate,
    totalRevenue,
    totalCost,
    totalProfit,
    overallProfitMargin,
    costBreakdown: {
      labor: totalLaborCost,
      mileage: totalMileageCost,
      supplies: totalSupplyCost
    },
    averageProfitPerJob: report.length > 0 ? Math.round(totalProfit / report.length) : 0
  };
}

/**
 * Get least profitable jobs
 * @param {string} tenantId - Tenant ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @param {number} limit - Number of jobs to return
 * @returns {Promise<Array>}
 */
export async function getLeastProfitableJobs(tenantId, startDate, endDate, limit = 10) {
  const report = await getProfitabilityReport(tenantId, startDate, endDate);
  
  return report
    .sort((a, b) => a.profit - b.profit)
    .slice(0, limit);
}

/**
 * Get most profitable jobs
 * @param {string} tenantId - Tenant ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @param {number} limit - Number of jobs to return
 * @returns {Promise<Array>}
 */
export async function getMostProfitableJobs(tenantId, startDate, endDate, limit = 10) {
  const report = await getProfitabilityReport(tenantId, startDate, endDate);
  
  return report
    .sort((a, b) => b.profit - a.profit)
    .slice(0, limit);
}

/**
 * Export profitability report as CSV
 * @param {string} tenantId - Tenant ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<string>} CSV content
 */
export async function exportProfitabilityCSV(tenantId, startDate, endDate) {
  const report = await getProfitabilityReport(tenantId, startDate, endDate);
  
  let csv = 'Job ID,Date,Customer,Revenue,Labor Cost,Mileage Cost,Supply Cost,Total Cost,Profit,Profit Margin,Hours,Miles,Crew Size\n';
  
  for (const item of report) {
    csv += `"${item.jobId}","${item.jobDate}","${item.customerName}","${item.revenue}","${item.costs.labor}","${item.costs.mileage}","${item.costs.supplies}","${item.costs.total}","${item.profit}","${item.profitMargin}%","${item.details.actualHours}","${item.details.totalMiles}","${item.details.crewSize}"\n`;
  }
  
  return csv;
}
