// src/services/employeePerformanceService.js
/**
 * Employee Performance Service
 * Tracks employee performance metrics including jobs completed, ratings, job duration, upsells, and incidents
 */

import { getDocs, collection, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Get employee performance data
 * @param {string} tenantId - Tenant ID
 * @param {string} employeeId - Employee ID
 * @returns {Promise<Object>}
 */
export async function getEmployeePerformance(tenantId, employeeId) {
  // Get employee's jobs
  const jobsRef = collection(db, 'tenants', tenantId, 'jobs');
  const jobsQ = query(jobsRef, where('assignedEmployees', 'array-contains', employeeId), orderBy('date', 'desc'));
  const jobsSnap = await getDocs(jobsQ);
  
  const jobs = jobsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  // Get job completions for ratings and duration
  const completionsRef = collection(db, 'tenants', tenantId, 'job_completions');
  const completionsSnap = await getDocs(query(completionsRef, where('assignedEmployees', 'array-contains', employeeId)));
  
  const completions = completionsSnap.docs.map(doc => doc.data());
  
  // Get incidents
  const incidentsRef = collection(db, 'tenants', tenantId, 'incidents');
  const incidentsSnap = await getDocs(query(incidentsRef, where('employeeId', '==', employeeId)));
  
  const incidents = incidentsSnap.docs.map(doc => doc.data());
  
  // Calculate metrics
  let totalJobsCompleted = jobs.filter(j => j.status === 'completed').length;
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
  
  const averageRating = ratingCount > 0 ? totalRating / ratingCount : 0;
  const averageJobDuration = completions.length > 0 ? totalDuration / completions.length : 0;
  
  // Calculate repeat customer rate
  const customerJobs = {};
  for (const job of jobs) {
    if (job.customerId) {
      customerJobs[job.customerId] = (customerJobs[job.customerId] || 0) + 1;
    }
  }
  
  const repeatCustomers = Object.values(customerJobs).filter(count => count > 1).length;
  const uniqueCustomers = Object.keys(customerJobs).length;
  const repeatCustomerRate = uniqueCustomers > 0 ? (repeatCustomers / uniqueCustomers * 100) : 0;
  
  return {
    employeeId,
    jobsCompleted: totalJobsCompleted,
    totalJobs: jobs.length,
    totalRevenue,
    averageRating,
    averageJobDuration,
    upsellsSold,
    incidents: incidents.length,
    repeatCustomerRate: repeatCustomerRate.toFixed(1)
  };
}

/**
 * Get all employees performance data
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>}
 */
export async function getAllEmployeesPerformance(tenantId) {
  const employeesRef = collection(db, 'tenants', tenantId, 'employees');
  const employeesSnap = await getDocs(employeesRef);
  
  const performanceData = [];
  
  for (const employeeDoc of employeesSnap.docs) {
    const employeeId = employeeDoc.id;
    const employeeData = employeeDoc.data();
    const performance = await getEmployeePerformance(tenantId, employeeId);
    
    performanceData.push({
      employeeId,
      employeeName: employeeData.name,
      employeePhone: employeeData.phone,
      hourlyRate: employeeData.hourlyRate,
      ...performance
    });
  }
  
  // Sort by total revenue (highest first)
  performanceData.sort((a, b) => b.totalRevenue - a.totalRevenue);
  
  return performanceData;
}

/**
 * Get top performing employees
 * @param {string} tenantId - Tenant ID
 * @param {string} metric - Metric to sort by (revenue, rating, jobs, upsells)
 * @param {number} limit - Number of employees to return
 * @returns {Promise<Array>}
 */
export async function getTopPerformingEmployees(tenantId, metric = 'revenue', limit = 10) {
  const allPerformance = await getAllEmployeesPerformance(tenantId);
  
  const metricMap = {
    revenue: 'totalRevenue',
    rating: 'averageRating',
    jobs: 'jobsCompleted',
    upsells: 'upsellsSold'
  };
  
  const sortField = metricMap[metric] || 'totalRevenue';
  
  return allPerformance
    .sort((a, b) => b[sortField] - a[sortField])
    .slice(0, limit);
}

/**
 * Get employee performance trends over time
 * @param {string} tenantId - Tenant ID
 * @param {string} employeeId - Employee ID
 * @returns {Promise<Array>}
 */
export async function getEmployeePerformanceTrends(tenantId, employeeId) {
  const jobsRef = collection(db, 'tenants', tenantId, 'jobs');
  const jobsQ = query(jobsRef, where('assignedEmployees', 'array-contains', employeeId), orderBy('date', 'asc'));
  const jobsSnap = await getDocs(jobsQ);
  
  const jobs = jobsSnap.docs.map(doc => doc.data());
  
  // Group by month
  const monthlyData = {};
  
  for (const job of jobs) {
    const date = new Date(job.date);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = {
        month: monthKey,
        jobsCompleted: 0,
        totalRevenue: 0,
        totalDuration: 0,
        ratings: []
      };
    }
    
    if (job.status === 'completed') {
      monthlyData[monthKey].jobsCompleted++;
      monthlyData[monthKey].totalRevenue += job.finalPrice || job.estimatedPrice || 0;
    }
  }
  
  // Get completions for duration and ratings
  const completionsRef = collection(db, 'tenants', tenantId, 'job_completions');
  const completionsSnap = await getDocs(query(completionsRef, where('assignedEmployees', 'array-contains', employeeId)));
  
  const completions = completionsSnap.docs.map(doc => doc.data());
  
  for (const completion of completions) {
    const date = new Date(completion.date || completion.createdAt);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    if (monthlyData[monthKey]) {
      monthlyData[monthKey].totalDuration += completion.actualHours || 0;
      
      if (completion.rating) {
        monthlyData[monthKey].ratings.push(completion.rating);
      }
    }
  }
  
  // Calculate averages
  const trends = Object.values(monthlyData).map(data => ({
    ...data,
    averageDuration: data.jobsCompleted > 0 ? data.totalDuration / data.jobsCompleted : 0,
    averageRating: data.ratings.length > 0 ? data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length : 0
  }));
  
  return trends;
}

/**
 * Get employee leaderboard
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>}
 */
export async function getEmployeeLeaderboard(tenantId) {
  const allPerformance = await getAllEmployeesPerformance(tenantId);
  
  return {
    byRevenue: [...allPerformance].sort((a, b) => b.totalRevenue - a.totalRevenue),
    byRating: [...allPerformance].sort((a, b) => b.averageRating - a.averageRating),
    byJobs: [...allPerformance].sort((a, b) => b.jobsCompleted - a.jobsCompleted),
    byUpsells: [...allPerformance].sort((a, b) => b.upsellsSold - a.upsellsSold)
  };
}

/**
 * Calculate employee scorecard
 * @param {string} tenantId - Tenant ID
 * @param {string} employeeId - Employee ID
 * @returns {Promise<Object>}
 */
export async function getEmployeeScorecard(tenantId, employeeId) {
  const performance = await getEmployeePerformance(tenantId, employeeId);
  
  let score = 0;
  const factors = {};
  
  // Revenue score (max 25 points)
  const revenueScore = Math.min(25, performance.totalRevenue / 100);
  score += revenueScore;
  factors.revenueScore = revenueScore;
  
  // Rating score (max 25 points)
  const ratingScore = (performance.averageRating / 5) * 25;
  score += ratingScore;
  factors.ratingScore = ratingScore;
  
  // Job completion score (max 20 points)
  const completionRate = performance.totalJobs > 0 
    ? (performance.jobsCompleted / performance.totalJobs) * 100 
    : 0;
  const completionScore = (completionRate / 100) * 20;
  score += completionScore;
  factors.completionScore = completionScore;
  
  // Upsell score (max 15 points)
  const upsellScore = Math.min(15, performance.upsellsSold * 2);
  score += upsellScore;
  factors.upsellScore = upsellScore;
  
  // Repeat customer score (max 15 points)
  const repeatScore = (performance.repeatCustomerRate / 100) * 15;
  score += repeatScore;
  factors.repeatScore = repeatScore;
  
  // Deduct for incidents (max -10 points)
  const incidentPenalty = Math.min(10, performance.incidents * 2);
  score -= incidentPenalty;
  factors.incidentPenalty = incidentPenalty;
  
  // Normalize to 0-100
  score = Math.max(0, Math.min(100, score));
  
  return {
    employeeId,
    score: Math.round(score),
    factors,
    grade: score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F'
  };
}

/**
 * Get all employees scorecards
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>}
 */
export async function getAllEmployeesScorecards(tenantId) {
  const employeesRef = collection(db, 'tenants', tenantId, 'employees');
  const employeesSnap = await getDocs(employeesRef);
  
  const scorecards = [];
  
  for (const employeeDoc of employeesSnap.docs) {
    const employeeId = employeeDoc.id;
    const employeeData = employeeDoc.data();
    const scorecard = await getEmployeeScorecard(tenantId, employeeId);
    
    scorecards.push({
      employeeId,
      employeeName: employeeData.name,
      ...scorecard
    });
  }
  
  // Sort by score (highest first)
  scorecards.sort((a, b) => b.score - a.score);
  
  return scorecards;
}
