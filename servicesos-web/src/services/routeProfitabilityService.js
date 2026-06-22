// src/services/routeProfitabilityService.js
/**
 * Route Profitability Service
 * Tracks and calculates route profitability including revenue, drive time, labor cost, and profit per route
 */

import { getDocs, collection } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Get route profitability for a specific date
 * @param {string} tenantId - Tenant ID
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<Array>}
 */
export async function getRouteProfitabilityByDate(tenantId, date) {
  // Get jobs for the date
  const jobsRef = collection(db, 'tenants', tenantId, 'jobs');
  const jobsSnap = await getDocs(jobsRef);
  
  const jobs = jobsSnap.docs.map(doc => doc.data()).filter(job => job.date === date);
  
  // Group jobs by employee (each employee has their own route)
  const routes = {};
  
  for (const job of jobs) {
    if (!job.assignedEmployees || job.assignedEmployees.length === 0) continue;
    
    for (const employeeId of job.assignedEmployees) {
      if (!routes[employeeId]) {
        routes[employeeId] = {
          employeeId,
          jobs: [],
          totalRevenue: 0,
          totalDriveTime: 0,
          totalLaborCost: 0
        };
      }
      
      routes[employeeId].jobs.push(job);
      routes[employeeId].totalRevenue += job.finalPrice || job.estimatedPrice || 0;
      routes[employeeId].totalDriveTime += job.driveTime || 0;
      
      // Calculate labor cost (actual hours * hourly rate)
      const laborCost = (job.actualHours || job.estimatedHours || 0) * (job.hourlyRate || 25);
      routes[employeeId].totalLaborCost += laborCost;
    }
  }
  
  // Calculate profitability for each route
  const routeProfitability = Object.values(routes).map(route => {
    const laborCost = route.totalLaborCost;
    const driveCost = route.totalDriveTime * 0.5; // $0.50 per minute for drive time
    const totalCost = laborCost + driveCost;
    const profit = route.totalRevenue - totalCost;
    const margin = route.totalRevenue > 0 ? (profit / route.totalRevenue * 100) : 0;
    
    return {
      ...route,
      laborCost,
      driveCost,
      totalCost,
      profit,
      margin: margin.toFixed(1)
    };
  });
  
  // Sort by profit (highest first)
  routeProfitability.sort((a, b) => b.profit - a.profit);
  
  return routeProfitability;
}

/**
 * Get route profitability trends over time
 * @param {string} tenantId - Tenant ID
 * @param {number} days - Number of days to analyze
 * @returns {Promise<Array>}
 */
export async function getRouteProfitabilityTrends(tenantId, days = 30) {
  const jobsRef = collection(db, 'tenants', tenantId, 'jobs');
  const jobsSnap = await getDocs(jobsRef);
  
  const jobs = jobsSnap.docs.map(doc => doc.data());
  
  // Filter jobs by date range
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  const recentJobs = jobs.filter(job => {
    const jobDate = new Date(job.date);
    return jobDate >= cutoffDate;
  });
  
  // Group by date and employee
  const routeData = {};
  
  for (const job of recentJobs) {
    if (!job.assignedEmployees || job.assignedEmployees.length === 0) continue;
    
    for (const employeeId of job.assignedEmployees) {
      const key = `${job.date}-${employeeId}`;
      
      if (!routeData[key]) {
        routeData[key] = {
          date: job.date,
          employeeId,
          totalRevenue: 0,
          totalDriveTime: 0,
          totalLaborCost: 0
        };
      }
      
      routeData[key].totalRevenue += job.finalPrice || job.estimatedPrice || 0;
      routeData[key].totalDriveTime += job.driveTime || 0;
      
      const laborCost = (job.actualHours || job.estimatedHours || 0) * (job.hourlyRate || 25);
      routeData[key].totalLaborCost += laborCost;
    }
  }
  
  // Calculate profitability
  const trends = Object.values(routeData).map(data => {
    const laborCost = data.totalLaborCost;
    const driveCost = data.totalDriveTime * 0.5;
    const totalCost = laborCost + driveCost;
    const profit = data.totalRevenue - totalCost;
    const margin = data.totalRevenue > 0 ? (profit / data.totalRevenue * 100) : 0;
    
    return {
      ...data,
      laborCost,
      driveCost,
      totalCost,
      profit,
      margin: margin.toFixed(1)
    };
  });
  
  // Sort by date
  trends.sort((a, b) => a.date.localeCompare(b.date));
  
  return trends;
}

/**
 * Get most profitable routes
 * @param {string} tenantId - Tenant ID
 * @param {number} days - Number of days to analyze
 * @param {number} limit - Number of routes to return
 * @returns {Promise<Array>}
 */
export async function getMostProfitableRoutes(tenantId, days = 30, limit = 10) {
  const trends = await getRouteProfitabilityTrends(tenantId, days);
  
  // Aggregate by employee
  const employeeRoutes = {};
  
  for (const trend of trends) {
    if (!employeeRoutes[trend.employeeId]) {
      employeeRoutes[trend.employeeId] = {
        employeeId: trend.employeeId,
        totalRevenue: 0,
        totalDriveTime: 0,
        totalLaborCost: 0,
        totalCost: 0,
        totalProfit: 0,
        routeCount: 0
      };
    }
    
    employeeRoutes[trend.employeeId].totalRevenue += trend.totalRevenue;
    employeeRoutes[trend.employeeId].totalDriveTime += trend.totalDriveTime;
    employeeRoutes[trend.employeeId].totalLaborCost += trend.laborCost;
    employeeRoutes[trend.employeeId].totalCost += trend.totalCost;
    employeeRoutes[trend.employeeId].totalProfit += trend.profit;
    employeeRoutes[trend.employeeId].routeCount++;
  }
  
  // Calculate averages and margins
  const profitability = Object.values(employeeRoutes).map(data => {
    const avgRevenue = data.routeCount > 0 ? data.totalRevenue / data.routeCount : 0;
    const avgProfit = data.routeCount > 0 ? data.totalProfit / data.routeCount : 0;
    const avgMargin = data.totalRevenue > 0 ? (data.totalProfit / data.totalRevenue * 100) : 0;
    
    return {
      ...data,
      avgRevenue,
      avgProfit,
      avgMargin: avgMargin.toFixed(1)
    };
  });
  
  // Sort by total profit (highest first)
  profitability.sort((a, b) => b.totalProfit - a.totalProfit);
  
  return profitability.slice(0, limit);
}

/**
 * Get route efficiency metrics
 * @param {string} tenantId - Tenant ID
 * @param {number} days - Number of days to analyze
 * @returns {Promise<Object>}
 */
export async function getRouteEfficiencyMetrics(tenantId, days = 30) {
  const trends = await getRouteProfitabilityTrends(tenantId, days);
  
  if (trends.length === 0) {
    return {
      averageRevenuePerRoute: 0,
      averageProfitPerRoute: 0,
      averageMargin: 0,
      averageDriveTime: 0,
      averageLaborCost: 0,
      totalRoutes: 0
    };
  }
  
  const totalRevenue = trends.reduce((sum, t) => sum + t.totalRevenue, 0);
  const totalProfit = trends.reduce((sum, t) => sum + t.profit, 0);
  const totalDriveTime = trends.reduce((sum, t) => sum + t.totalDriveTime, 0);
  const totalLaborCost = trends.reduce((sum, t) => sum + t.laborCost, 0);
  
  return {
    averageRevenuePerRoute: totalRevenue / trends.length,
    averageProfitPerRoute: totalProfit / trends.length,
    averageMargin: totalRevenue > 0 ? (totalProfit / totalRevenue * 100).toFixed(1) : 0,
    averageDriveTime: totalDriveTime / trends.length,
    averageLaborCost: totalLaborCost / trends.length,
    totalRoutes: trends.length
  };
}

/**
 * Get unprofitable routes
 * @param {string} tenantId - Tenant ID
 * @param {number} days - Number of days to analyze
 * @returns {Promise<Array>}
 */
export async function getUnprofitableRoutes(tenantId, days = 30) {
  const trends = await getRouteProfitabilityTrends(tenantId, days);
  
  // Filter routes with negative profit
  const unprofitable = trends.filter(t => t.profit < 0);
  
  // Sort by loss (most negative first)
  unprofitable.sort((a, b) => a.profit - b.profit);
  
  return unprofitable;
}
