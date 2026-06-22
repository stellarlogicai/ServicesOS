// src/services/estimateAccuracyDashboardService.js
/**
 * Estimate Accuracy Dashboard Service
 * Tracks predicted vs actual hours per cleaner/company/property
 */

import { collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Get estimate accuracy data for a specific cleaner
 * @param {string} tenantId - Tenant ID
 * @param {string} employeeId - Employee ID
 * @returns {Promise<Object>} Accuracy metrics for the cleaner
 */
export async function getEstimateAccuracyByCleaner(tenantId, employeeId) {
  const jobsRef = collection(db, 'tenants', tenantId, 'jobs');
  const q = query(jobsRef, where('assignedEmployees', 'array-contains', employeeId));
  const querySnap = await getDocs(q);
  
  const jobs = querySnap.docs.map(doc => doc.data());
  const completedJobs = jobs.filter(job => job.status === 'completed' && job.estimatedHours && job.actualHours);
  
  if (completedJobs.length === 0) {
    return {
      totalJobs: 0,
      avgEstimatedHours: 0,
      avgActualHours: 0,
      avgDifference: 0,
      avgAccuracy: 0,
      underestimates: 0,
      overestimates: 0,
      perfectEstimates: 0
    };
  }
  
  const totalEstimated = completedJobs.reduce((sum, job) => sum + (job.estimatedHours || 0), 0);
  const totalActual = completedJobs.reduce((sum, job) => sum + (job.actualHours || 0), 0);
  
  const differences = completedJobs.map(job => (job.actualHours || 0) - (job.estimatedHours || 0));
  const avgDifference = differences.reduce((sum, diff) => sum + diff, 0) / differences.length;
  
  const accuracies = completedJobs.map(job => {
    const est = job.estimatedHours || 0;
    const act = job.actualHours || 0;
    if (est === 0) return 0;
    return Math.max(0, 100 - (Math.abs(act - est) / est * 100));
  });
  const avgAccuracy = accuracies.reduce((sum, acc) => sum + acc, 0) / accuracies.length;
  
  const underestimates = differences.filter(d => d > 0.1).length;
  const overestimates = differences.filter(d => d < -0.1).length;
  const perfectEstimates = differences.filter(d => Math.abs(d) <= 0.1).length;
  
  return {
    totalJobs: completedJobs.length,
    avgEstimatedHours: totalEstimated / completedJobs.length,
    avgActualHours: totalActual / completedJobs.length,
    avgDifference,
    avgAccuracy,
    underestimates,
    overestimates,
    perfectEstimates
  };
}

/**
 * Get estimate accuracy data for the entire company
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Company-wide accuracy metrics
 */
export async function getCompanyEstimateAccuracy(tenantId) {
  const jobsRef = collection(db, 'tenants', tenantId, 'jobs');
  const querySnap = await getDocs(jobsRef);
  
  const jobs = querySnap.docs.map(doc => doc.data());
  const completedJobs = jobs.filter(job => job.status === 'completed' && job.estimatedHours && job.actualHours);
  
  if (completedJobs.length === 0) {
    return {
      totalJobs: 0,
      avgEstimatedHours: 0,
      avgActualHours: 0,
      avgDifference: 0,
      avgAccuracy: 0,
      underestimates: 0,
      overestimates: 0,
      perfectEstimates: 0,
      totalRevenue: 0,
      avgRevenuePerJob: 0
    };
  }
  
  const totalEstimated = completedJobs.reduce((sum, job) => sum + (job.estimatedHours || 0), 0);
  const totalActual = completedJobs.reduce((sum, job) => sum + (job.actualHours || 0), 0);
  
  const differences = completedJobs.map(job => (job.actualHours || 0) - (job.estimatedHours || 0));
  const avgDifference = differences.reduce((sum, diff) => sum + diff, 0) / differences.length;
  
  const accuracies = completedJobs.map(job => {
    const est = job.estimatedHours || 0;
    const act = job.actualHours || 0;
    if (est === 0) return 0;
    return Math.max(0, 100 - (Math.abs(act - est) / est * 100));
  });
  const avgAccuracy = accuracies.reduce((sum, acc) => sum + acc, 0) / accuracies.length;
  
  const underestimates = differences.filter(d => d > 0.1).length;
  const overestimates = differences.filter(d => d < -0.1).length;
  const perfectEstimates = differences.filter(d => Math.abs(d) <= 0.1).length;
  
  const totalRevenue = completedJobs.reduce((sum, job) => sum + (job.finalPrice || 0), 0);
  
  return {
    totalJobs: completedJobs.length,
    avgEstimatedHours: totalEstimated / completedJobs.length,
    avgActualHours: totalActual / completedJobs.length,
    avgDifference,
    avgAccuracy,
    underestimates,
    overestimates,
    perfectEstimates,
    totalRevenue,
    avgRevenuePerJob: totalRevenue / completedJobs.length
  };
}

/**
 * Get estimate accuracy data for a specific property
 * @param {string} tenantId - Tenant ID
 * @param {string} customerId - Customer ID
 * @returns {Promise<Object>} Accuracy metrics for the property
 */
export async function getEstimateAccuracyByProperty(tenantId, customerId) {
  const jobsRef = collection(db, 'tenants', tenantId, 'jobs');
  const q = query(jobsRef, where('customerId', '==', customerId));
  const querySnap = await getDocs(q);
  
  const jobs = querySnap.docs.map(doc => doc.data());
  const completedJobs = jobs.filter(job => job.status === 'completed' && job.estimatedHours && job.actualHours);
  
  if (completedJobs.length === 0) {
    return {
      totalJobs: 0,
      avgEstimatedHours: 0,
      avgActualHours: 0,
      avgDifference: 0,
      avgAccuracy: 0,
      underestimates: 0,
      overestimates: 0,
      perfectEstimates: 0
    };
  }
  
  const totalEstimated = completedJobs.reduce((sum, job) => sum + (job.estimatedHours || 0), 0);
  const totalActual = completedJobs.reduce((sum, job) => sum + (job.actualHours || 0), 0);
  
  const differences = completedJobs.map(job => (job.actualHours || 0) - (job.estimatedHours || 0));
  const avgDifference = differences.reduce((sum, diff) => sum + diff, 0) / differences.length;
  
  const accuracies = completedJobs.map(job => {
    const est = job.estimatedHours || 0;
    const act = job.actualHours || 0;
    if (est === 0) return 0;
    return Math.max(0, 100 - (Math.abs(act - est) / est * 100));
  });
  const avgAccuracy = accuracies.reduce((sum, acc) => sum + acc, 0) / accuracies.length;
  
  const underestimates = differences.filter(d => d > 0.1).length;
  const overestimates = differences.filter(d => d < -0.1).length;
  const perfectEstimates = differences.filter(d => Math.abs(d) <= 0.1).length;
  
  return {
    totalJobs: completedJobs.length,
    avgEstimatedHours: totalEstimated / completedJobs.length,
    avgActualHours: totalActual / completedJobs.length,
    avgDifference,
    avgAccuracy,
    underestimates,
    overestimates,
    perfectEstimates
  };
}

/**
 * Get estimate accuracy data for all cleaners
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>} Array of cleaner accuracy data
 */
export async function getAllCleanersAccuracy(tenantId) {
  const employeesRef = collection(db, 'tenants', tenantId, 'employees');
  const querySnap = await getDocs(employeesRef);
  
  const employees = querySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  const accuracyData = await Promise.all(
    employees.map(async (employee) => {
      const accuracy = await getEstimateAccuracyByCleaner(tenantId, employee.id);
      return {
        employeeId: employee.id,
        employeeName: employee.name,
        ...accuracy
      };
    })
  );
  
  return accuracyData.filter(data => data.totalJobs > 0);
}

/**
 * Get estimate accuracy trend over time
 * @param {string} tenantId - Tenant ID
 * @param {number} months - Number of months to look back
 * @returns {Promise<Array>} Monthly accuracy data
 */
export async function getEstimateAccuracyTrend(tenantId, months = 12) {
  const jobsRef = collection(db, 'tenants', tenantId, 'jobs');
  const querySnap = await getDocs(jobsRef);
  
  const jobs = querySnap.docs.map(doc => doc.data());
  const completedJobs = jobs.filter(job => 
    job.status === 'completed' && 
    job.estimatedHours && 
    job.actualHours &&
    job.date
  );
  
  const monthlyData = {};
  
  for (let i = 0; i < months; i++) {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    monthlyData[monthKey] = {
      month: monthKey,
      totalJobs: 0,
      avgEstimatedHours: 0,
      avgActualHours: 0,
      avgAccuracy: 0
    };
  }
  
  completedJobs.forEach(job => {
    const jobDate = new Date(job.date);
    const monthKey = `${jobDate.getFullYear()}-${String(jobDate.getMonth() + 1).padStart(2, '0')}`;
    
    if (monthlyData[monthKey]) {
      monthlyData[monthKey].totalJobs++;
      monthlyData[monthKey].avgEstimatedHours += job.estimatedHours || 0;
      monthlyData[monthKey].avgActualHours += job.actualHours || 0;
    }
  });
  
  Object.keys(monthlyData).forEach(monthKey => {
    const data = monthlyData[monthKey];
    if (data.totalJobs > 0) {
      data.avgEstimatedHours = data.avgEstimatedHours / data.totalJobs;
      data.avgActualHours = data.avgActualHours / data.totalJobs;
      data.avgAccuracy = Math.max(0, 100 - (Math.abs(data.avgActualHours - data.avgEstimatedHours) / data.avgEstimatedHours * 100));
    }
  });
  
  return Object.values(monthlyData).reverse();
}

/**
 * Record estimate accuracy for a completed job
 * @param {string} tenantId - Tenant ID
 * @param {string} jobId - Job ID
 * @param {number} estimatedHours - Estimated hours
 * @param {number} actualHours - Actual hours
 * @returns {Promise<void>}
 */
export async function recordEstimateAccuracy(tenantId, jobId, estimatedHours, actualHours) {
  const accuracyRef = collection(db, 'tenants', tenantId, 'estimate_accuracy');
  
  const difference = actualHours - estimatedHours;
  const accuracy = estimatedHours > 0 ? Math.max(0, 100 - (Math.abs(difference) / estimatedHours * 100)) : 0;
  
  await addDoc(accuracyRef, {
    jobId,
    estimatedHours,
    actualHours,
    difference,
    accuracy,
    recordedAt: new Date().toISOString()
  });
}

/**
 * Get jobs with poor estimate accuracy (accuracy < 70%)
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>} Jobs with poor accuracy
 */
export async function getPoorAccuracyJobs(tenantId) {
  const jobsRef = collection(db, 'tenants', tenantId, 'jobs');
  const querySnap = await getDocs(jobsRef);
  
  const jobs = querySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  return jobs
    .filter(job => 
      job.status === 'completed' && 
      job.estimatedHours && 
      job.actualHours
    )
    .map(job => {
      const est = job.estimatedHours || 0;
      const act = job.actualHours || 0;
      const accuracy = est > 0 ? Math.max(0, 100 - (Math.abs(act - est) / est * 100)) : 0;
      return { ...job, calculatedAccuracy: accuracy };
    })
    .filter(job => job.calculatedAccuracy < 70);
}
