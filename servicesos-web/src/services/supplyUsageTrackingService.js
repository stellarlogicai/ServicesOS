// src/services/supplyUsageTrackingService.js
/**
 * Supply Usage Tracking Service
 * Tracks supply usage per job including supply item, quantity used, job ID, employee ID
 */

import { getDocs, collection } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Get supply usage for a specific job
 * @param {string} tenantId - Tenant ID
 * @param {string} jobId - Job ID
 * @returns {Promise<Object>}
 */
export async function getJobSupplyUsage(tenantId, jobId) {
  const completionsRef = collection(db, 'tenants', tenantId, 'job_completions');
  const completionsSnap = await getDocs(completionsRef);
  
  const completions = completionsSnap.docs.map(doc => doc.data());
  const completion = completions.find(c => c.jobId === jobId);
  
  if (!completion || !completion.inventoryUsed) {
    return {
      jobId,
      supplies: []
    };
  }
  
  return {
    jobId,
    supplies: completion.inventoryUsed.map(item => ({
      itemName: item.itemName,
      quantityUsed: item.quantityUsed,
      unit: item.unit || 'units',
      costPerUnit: item.costPerUnit || 0,
      totalCost: (item.quantityUsed || 0) * (item.costPerUnit || 0)
    }))
  };
}

/**
 * Get supply usage by employee
 * @param {string} tenantId - Tenant ID
 * @param {string} employeeId - Employee ID
 * @returns {Promise<Object>}
 */
export async function getEmployeeSupplyUsage(tenantId, employeeId) {
  const completionsRef = collection(db, 'tenants', tenantId, 'job_completions');
  const completionsSnap = await getDocs(completionsRef);
  
  const completions = completionsSnap.docs.map(doc => doc.data());
  
  const employeeCompletions = completions.filter(c => 
    c.assignedEmployees && c.assignedEmployees.includes(employeeId)
  );
  
  const supplyUsage = {};
  
  for (const completion of employeeCompletions) {
    if (!completion.inventoryUsed) continue;
    
    for (const item of completion.inventoryUsed) {
      const itemName = item.itemName;
      
      if (!supplyUsage[itemName]) {
        supplyUsage[itemName] = {
          itemName,
          totalQuantity: 0,
          jobCount: 0,
          totalCost: 0
        };
      }
      
      supplyUsage[itemName].totalQuantity += item.quantityUsed || 0;
      supplyUsage[itemName].jobCount++;
      supplyUsage[itemName].totalCost += (item.quantityUsed || 0) * (item.costPerUnit || 0);
    }
  }
  
  const usage = Object.values(supplyUsage).map(data => ({
    ...data,
    averagePerJob: data.jobCount > 0 ? (data.totalQuantity / data.jobCount).toFixed(2) : 0
  }));
  
  usage.sort((a, b) => b.totalQuantity - a.totalQuantity);
  
  return {
    employeeId,
    supplies: usage
  };
}

/**
 * Get supply usage summary
 * @param {string} tenantId - Tenant ID
 * @param {number} days - Number of days to analyze
 * @returns {Promise<Object>}
 */
export async function getSupplyUsageSummary(tenantId, days = 30) {
  const completionsRef = collection(db, 'tenants', tenantId, 'job_completions');
  const completionsSnap = await getDocs(completionsRef);
  
  const completions = completionsSnap.docs.map(doc => doc.data());
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  const recentCompletions = completions.filter(c => {
    const completionDate = new Date(c.date || c.createdAt);
    return completionDate >= cutoffDate;
  });
  
  const supplyUsage = {};
  
  for (const completion of recentCompletions) {
    if (!completion.inventoryUsed) continue;
    
    for (const item of completion.inventoryUsed) {
      const itemName = item.itemName;
      
      if (!supplyUsage[itemName]) {
        supplyUsage[itemName] = {
          itemName,
          totalQuantity: 0,
          jobCount: 0,
          totalCost: 0
        };
      }
      
      supplyUsage[itemName].totalQuantity += item.quantityUsed || 0;
      supplyUsage[itemName].jobCount++;
      supplyUsage[itemName].totalCost += (item.quantityUsed || 0) * (item.costPerUnit || 0);
    }
  }
  
  const usage = Object.values(supplyUsage).map(data => ({
    ...data,
    averagePerJob: data.jobCount > 0 ? (data.totalQuantity / data.jobCount).toFixed(2) : 0
  }));
  
  usage.sort((a, b) => b.totalQuantity - a.totalQuantity);
  
  const totalCost = usage.reduce((sum, u) => sum + u.totalCost, 0);
  
  return {
    totalSupplies: usage.length,
    totalCost,
    topSupplies: usage.slice(0, 10),
    averageCostPerJob: recentCompletions.length > 0 ? (totalCost / recentCompletions.length).toFixed(2) : 0
  };
}

/**
 * Get supply usage trends over time
 * @param {string} tenantId - Tenant ID
 * @param {number} days - Number of days to analyze
 * @returns {Promise<Array>}
 */
export async function getSupplyUsageTrends(tenantId, days = 30) {
  const completionsRef = collection(db, 'tenants', tenantId, 'job_completions');
  const completionsSnap = await getDocs(completionsRef);
  
  const completions = completionsSnap.docs.map(doc => doc.data());
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  const recentCompletions = completions.filter(c => {
    const completionDate = new Date(c.date || c.createdAt);
    return completionDate >= cutoffDate;
  });
  
  const dailyData = {};
  
  for (const completion of recentCompletions) {
    const date = new Date(completion.date || completion.createdAt).toISOString().split('T')[0];
    
    if (!dailyData[date]) {
      dailyData[date] = {
        date,
        totalCost: 0,
        jobCount: 0
      };
    }
    
    if (completion.inventoryUsed) {
      for (const item of completion.inventoryUsed) {
        dailyData[date].totalCost += (item.quantityUsed || 0) * (item.costPerUnit || 0);
      }
    }
    
    dailyData[date].jobCount++;
  }
  
  const trends = Object.values(dailyData).map(data => ({
    ...data,
    averageCostPerJob: data.jobCount > 0 ? (data.totalCost / data.jobCount).toFixed(2) : 0
  }));
  
  trends.sort((a, b) => a.date.localeCompare(b.date));
  
  return trends;
}

/**
 * Get most used supplies
 * @param {string} tenantId - Tenant ID
 * @param {number} days - Number of days to analyze
 * @param {number} limit - Number of items to return
 * @returns {Promise<Array>}
 */
export async function getMostUsedSupplies(tenantId, days = 30, limit = 10) {
  const summary = await getSupplyUsageSummary(tenantId, days);
  return summary.topSupplies.slice(0, limit);
}
