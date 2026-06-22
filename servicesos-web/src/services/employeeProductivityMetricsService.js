// src/services/employeeProductivityMetricsService.js
/**
 * Employee Productivity Metrics Service
 * Tracks employee productivity metrics including jobs completed, average rating, callback rate, upsells sold, estimate accuracy
 */

import { getDocs, collection } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Get employee productivity metrics
 * @param {string} tenantId - Tenant ID
 * @param {string} employeeId - Employee ID
 * @returns {Promise<Object>}
 */
export async function getEmployeeProductivityMetrics(tenantId, employeeId) {
  // Get employee's jobs
  const jobsRef = collection(db, 'tenants', tenantId, 'jobs');
  const jobsSnap = await getDocs(jobsRef);
  
  const jobs = jobsSnap.docs.map(doc => doc.data())
    .filter(job => job.assignedEmployees && job.assignedEmployees.includes(employeeId));
  
  // Get job completions for ratings and upsells
  const completionsRef = collection(db, 'tenants', tenantId, 'job_completions');
  const completionsSnap = await getDocs(completionsRef);
  
  const completions = completionsSnap.docs.map(doc => doc.data())
    .filter(c => c.assignedEmployees && c.assignedEmployees.includes(employeeId));
  
  // Calculate metrics
  let jobsCompleted = jobs.filter(j => j.status === 'completed').length;
  let totalRating = 0;
  let ratingCount = 0;
  let upsellsSold = 0;
  let callbackCount = 0;
  
  for (const completion of completions) {
    if (completion.rating) {
      totalRating += completion.rating;
      ratingCount++;
    }
    
    if (completion.upsells) {
      upsellsSold += completion.upsells.length || 0;
    }
    
    // Check for callbacks (revisits within 7 days)
    if (completion.needsCallback || completion.callbackRequested) {
      callbackCount++;
    }
  }
  
  const averageRating = ratingCount > 0 ? (totalRating / ratingCount).toFixed(1) : 0;
  const callbackRate = jobsCompleted > 0 ? (callbackCount / jobsCompleted * 100).toFixed(1) : 0;
  const upsellsPerJob = jobsCompleted > 0 ? (upsellsSold / jobsCompleted).toFixed(2) : 0;
  
  // Calculate estimate accuracy (actual vs estimated hours)
  let estimateAccuracySum = 0;
  let estimateAccuracyCount = 0;
  
  for (const completion of completions) {
    if (completion.estimatedHours && completion.actualHours) {
      const accuracy = Math.abs(completion.estimatedHours - completion.actualHours) / completion.estimatedHours;
      estimateAccuracySum += (1 - accuracy) * 100; // Convert to percentage
      estimateAccuracyCount++;
    }
  }
  
  const estimateAccuracy = estimateAccuracyCount > 0 ? (estimateAccuracySum / estimateAccuracyCount).toFixed(1) : 0;
  
  return {
    employeeId,
    jobsCompleted,
    averageRating,
    callbackRate,
    upsellsSold,
    upsellsPerJob,
    estimateAccuracy
  };
}

/**
 * Get all employees productivity metrics
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>}
 */
export async function getAllEmployeesProductivityMetrics(tenantId) {
  const employeesRef = collection(db, 'tenants', tenantId, 'employees');
  const employeesSnap = await getDocs(employeesRef);
  
  const metricsData = [];
  
  for (const employeeDoc of employeesSnap.docs) {
    const employeeId = employeeDoc.id;
    const employeeData = employeeDoc.data();
    const metrics = await getEmployeeProductivityMetrics(tenantId, employeeId);
    
    metricsData.push({
      employeeId,
      employeeName: employeeData.name,
      ...metrics
    });
  }
  
  // Sort by jobs completed (highest first)
  metricsData.sort((a, b) => b.jobsCompleted - a.jobsCompleted);
  
  return metricsData;
}

/**
 * Get top productive employees
 * @param {string} tenantId - Tenant ID
 * @param {string} metric - Metric to sort by (jobs, rating, upsells, accuracy)
 * @param {number} limit - Number of employees to return
 * @returns {Promise<Array>}
 */
export async function getTopProductiveEmployees(tenantId, metric = 'jobs', limit = 10) {
  const allMetrics = await getAllEmployeesProductivityMetrics(tenantId);
  
  const metricMap = {
    jobs: 'jobsCompleted',
    rating: 'averageRating',
    upsells: 'upsellsSold',
    accuracy: 'estimateAccuracy'
  };
  
  const sortField = metricMap[metric] || 'jobsCompleted';
  
  return allMetrics
    .sort((a, b) => b[sortField] - a[sortField])
    .slice(0, limit);
}

/**
 * Get employee productivity trends over time
 * @param {string} tenantId - Tenant ID
 * @param {string} employeeId - Employee ID
 * @param {number} days - Number of days to analyze
 * @returns {Promise<Array>}
 */
export async function getEmployeeProductivityTrends(tenantId, employeeId, days = 30) {
  const jobsRef = collection(db, 'tenants', tenantId, 'jobs');
  const jobsSnap = await getDocs(jobsRef);
  
  const jobs = jobsSnap.docs.map(doc => doc.data())
    .filter(job => job.assignedEmployees && job.assignedEmployees.includes(employeeId));
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  const recentJobs = jobs.filter(job => {
    const jobDate = new Date(job.date || job.createdAt);
    return jobDate >= cutoffDate;
  });
  
  const completionsRef = collection(db, 'tenants', tenantId, 'job_completions');
  const completionsSnap = await getDocs(completionsRef);
  
  const completions = completionsSnap.docs.map(doc => doc.data())
    .filter(c => c.assignedEmployees && c.assignedEmployees.includes(employeeId));
  
  const monthlyData = {};
  
  for (const job of recentJobs) {
    if (job.status !== 'completed') continue;
    
    const date = new Date(job.date || job.createdAt);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = {
        month: monthKey,
        jobsCompleted: 0,
        ratings: [],
        upsells: 0
      };
    }
    
    monthlyData[monthKey].jobsCompleted++;
  }
  
  for (const completion of completions) {
    const date = new Date(completion.date || completion.createdAt);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    if (monthlyData[monthKey]) {
      if (completion.rating) {
        monthlyData[monthKey].ratings.push(completion.rating);
      }
      
      if (completion.upsells) {
        monthlyData[monthKey].upsells += completion.upsells.length || 0;
      }
    }
  }
  
  const trends = Object.values(monthlyData).map(data => ({
    ...data,
    averageRating: data.ratings.length > 0 ? (data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length).toFixed(1) : 0,
    upsellsPerJob: data.jobsCompleted > 0 ? (data.upsells / data.jobsCompleted).toFixed(2) : 0
  }));
  
  trends.sort((a, b) => a.month.localeCompare(b.month));
  
  return trends;
}

/**
 * Get productivity summary
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>}
 */
export async function getProductivitySummary(tenantId) {
  const allMetrics = await getAllEmployeesProductivityMetrics(tenantId);
  
  const totalJobsCompleted = allMetrics.reduce((sum, e) => sum + e.jobsCompleted, 0);
  const averageRating = allMetrics.length > 0 
    ? (allMetrics.reduce((sum, e) => sum + parseFloat(e.averageRating), 0) / allMetrics.length).toFixed(1)
    : 0;
  const totalUpsells = allMetrics.reduce((sum, e) => sum + e.upsellsSold, 0);
  const averageCallbackRate = allMetrics.length > 0
    ? (allMetrics.reduce((sum, e) => sum + parseFloat(e.callbackRate), 0) / allMetrics.length).toFixed(1)
    : 0;
  const averageEstimateAccuracy = allMetrics.length > 0
    ? (allMetrics.reduce((sum, e) => sum + parseFloat(e.estimateAccuracy), 0) / allMetrics.length).toFixed(1)
    : 0;
  
  return {
    totalEmployees: allMetrics.length,
    totalJobsCompleted,
    averageRating,
    totalUpsells,
    averageCallbackRate,
    averageEstimateAccuracy,
    topPerformer: allMetrics.length > 0 ? allMetrics[0] : null
  };
}
