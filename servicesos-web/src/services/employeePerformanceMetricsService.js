// src/services/employeePerformanceMetricsService.js
/**
 * Employee Performance Metrics Service
 * Tracks detailed performance metrics per employee including avg job time, avg rating, revenue generated, upsells sold, repeat customer rate
 */

import { getDocs, collection } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Get employee performance metrics
 * @param {string} tenantId - Tenant ID
 * @param {string} employeeId - Employee ID
 * @returns {Promise<Object>}
 */
export async function getEmployeePerformanceMetrics(tenantId, employeeId) {
  // Get employee's jobs
  const jobsRef = collection(db, 'tenants', tenantId, 'jobs');
  const jobsSnap = await getDocs(jobsRef);
  
  const jobs = jobsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(job => job.assignedEmployees && job.assignedEmployees.includes(employeeId));
  
  // Get job completions for ratings and duration
  const completionsRef = collection(db, 'tenants', tenantId, 'job_completions');
  const completionsSnap = await getDocs(completionsRef);
  
  const completions = completionsSnap.docs.map(doc => doc.data())
    .filter(c => c.assignedEmployees && c.assignedEmployees.includes(employeeId));
  
  // Calculate metrics
  let totalJobs = jobs.length;
  let completedJobs = jobs.filter(j => j.status === 'completed').length;
  let totalRevenue = 0;
  let totalDuration = 0;
  let totalRating = 0;
  let ratingCount = 0;
  let upsellsSold = 0;
  
  for (const job of jobs) {
    if (job.status === 'completed') {
      totalRevenue += job.finalPrice || job.estimatedPrice || 0;
    }
  }
  
  for (const completion of completions) {
    totalDuration += completion.actualHours || 0;
    
    if (completion.rating) {
      totalRating += completion.rating;
      ratingCount++;
    }
    
    if (completion.upsells) {
      upsellsSold += completion.upsells.length || 0;
    }
  }
  
  const averageJobTime = completions.length > 0 ? (totalDuration / completions.length).toFixed(2) : 0;
  const averageRating = ratingCount > 0 ? (totalRating / ratingCount).toFixed(1) : 0;
  
  // Calculate repeat customer rate
  const customerJobs = {};
  for (const job of jobs) {
    if (job.customerId) {
      customerJobs[job.customerId] = (customerJobs[job.customerId] || 0) + 1;
    }
  }
  
  const repeatCustomers = Object.values(customerJobs).filter(count => count > 1).length;
  const uniqueCustomers = Object.keys(customerJobs).length;
  const repeatCustomerRate = uniqueCustomers > 0 ? (repeatCustomers / uniqueCustomers * 100).toFixed(1) : 0;
  
  return {
    employeeId,
    totalJobs,
    completedJobs,
    completionRate: totalJobs > 0 ? (completedJobs / totalJobs * 100).toFixed(1) : 0,
    averageJobTime,
    averageRating,
    totalRevenue,
    revenuePerJob: completedJobs > 0 ? (totalRevenue / completedJobs).toFixed(2) : 0,
    upsellsSold,
    upsellsPerJob: completedJobs > 0 ? (upsellsSold / completedJobs).toFixed(2) : 0,
    repeatCustomerRate
  };
}

/**
 * Get all employees performance metrics
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>}
 */
export async function getAllEmployeesPerformanceMetrics(tenantId) {
  const employeesRef = collection(db, 'tenants', tenantId, 'employees');
  const employeesSnap = await getDocs(employeesRef);
  
  const metricsData = [];
  
  for (const employeeDoc of employeesSnap.docs) {
    const employeeId = employeeDoc.id;
    const employeeData = employeeDoc.data();
    const metrics = await getEmployeePerformanceMetrics(tenantId, employeeId);
    
    metricsData.push({
      employeeId,
      employeeName: employeeData.name,
      employeePhone: employeeData.phone,
      hourlyRate: employeeData.hourlyRate,
      ...metrics
    });
  }
  
  // Sort by total revenue (highest first)
  metricsData.sort((a, b) => b.totalRevenue - a.totalRevenue);
  
  return metricsData;
}

/**
 * Get top performing employees by metric
 * @param {string} tenantId - Tenant ID
 * @param {string} metric - Metric to sort by (revenue, rating, jobs, upsells)
 * @param {number} limit - Number of employees to return
 * @returns {Promise<Array>}
 */
export async function getTopPerformingEmployeesByMetric(tenantId, metric = 'revenue', limit = 10) {
  const allMetrics = await getAllEmployeesPerformanceMetrics(tenantId);
  
  const metricMap = {
    revenue: 'totalRevenue',
    rating: 'averageRating',
    jobs: 'completedJobs',
    upsells: 'upsellsSold'
  };
  
  const sortField = metricMap[metric] || 'totalRevenue';
  
  return allMetrics
    .sort((a, b) => b[sortField] - a[sortField])
    .slice(0, limit);
}

/**
 * Get employee performance trends over time
 * @param {string} tenantId - Tenant ID
 * @param {string} employeeId - Employee ID
 * @param {number} days - Number of days to analyze
 * @returns {Promise<Array>}
 */
export async function getEmployeePerformanceTrends(tenantId, employeeId, days = 30) {
  const jobsRef = collection(db, 'tenants', tenantId, 'jobs');
  const jobsSnap = await getDocs(jobsRef);
  
  const jobs = jobsSnap.docs.map(doc => doc.data())
    .filter(job => job.assignedEmployees && job.assignedEmployees.includes(employeeId));
  
  // Filter by date range
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  const recentJobs = jobs.filter(job => {
    const jobDate = new Date(job.date || job.createdAt);
    return jobDate >= cutoffDate;
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
        totalRevenue: 0,
        totalDuration: 0,
        ratings: [],
        upsells: 0
      };
    }
    
    if (job.status === 'completed') {
      monthlyData[monthKey].jobsCompleted++;
      monthlyData[monthKey].totalRevenue += job.finalPrice || job.estimatedPrice || 0;
    }
  }
  
  // Get completions for duration and ratings
  const completionsRef = collection(db, 'tenants', tenantId, 'job_completions');
  const completionsSnap = await getDocs(completionsRef);
  
  const completions = completionsSnap.docs.map(doc => doc.data())
    .filter(c => c.assignedEmployees && c.assignedEmployees.includes(employeeId));
  
  for (const completion of completions) {
    const date = new Date(completion.date || completion.createdAt);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    if (monthlyData[monthKey]) {
      monthlyData[monthKey].totalDuration += completion.actualHours || 0;
      
      if (completion.rating) {
        monthlyData[monthKey].ratings.push(completion.rating);
      }
      
      if (completion.upsells) {
        monthlyData[monthKey].upsells += completion.upsells.length || 0;
      }
    }
  }
  
  // Calculate averages
  const trends = Object.values(monthlyData).map(data => ({
    ...data,
    averageDuration: data.jobsCompleted > 0 ? (data.totalDuration / data.jobsCompleted).toFixed(2) : 0,
    averageRating: data.ratings.length > 0 ? (data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length).toFixed(1) : 0,
    revenuePerJob: data.jobsCompleted > 0 ? (data.totalRevenue / data.jobsCompleted).toFixed(2) : 0
  }));
  
  // Sort by month
  trends.sort((a, b) => a.month.localeCompare(b.month));
  
  return trends;
}
