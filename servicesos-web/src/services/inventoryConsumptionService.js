// src/services/inventoryConsumptionService.js
/**
 * Inventory Consumption Service
 * Tracks inventory consumption per job including cleaner used, trash bags used, microfiber cloths used
 */

import { getDocs, collection } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Get inventory consumption for a specific job
 * @param {string} tenantId - Tenant ID
 * @param {string} jobId - Job ID
 * @returns {Promise<Object>}
 */
export async function getJobInventoryConsumption(tenantId, jobId) {
  // Get job completions which may include inventory data
  const completionsRef = collection(db, 'tenants', tenantId, 'job_completions');
  const completionsSnap = await getDocs(completionsRef);
  
  const completions = completionsSnap.docs.map(doc => doc.data());
  const completion = completions.find(c => c.jobId === jobId);
  
  if (!completion || !completion.inventoryUsed) {
    return {
      jobId,
      items: []
    };
  }
  
  return {
    jobId,
    items: completion.inventoryUsed.map(item => ({
      itemName: item.itemName,
      quantityUsed: item.quantityUsed,
      unit: item.unit || 'units'
    }))
  };
}

/**
 * Get inventory consumption trends over time
 * @param {string} tenantId - Tenant ID
 * @param {number} days - Number of days to analyze
 * @returns {Promise<Array>}
 */
export async function getInventoryConsumptionTrends(tenantId, days = 30) {
  const completionsRef = collection(db, 'tenants', tenantId, 'job_completions');
  const completionsSnap = await getDocs(completionsRef);
  
  const completions = completionsSnap.docs.map(doc => doc.data());
  
  // Filter by date range
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  const recentCompletions = completions.filter(c => {
    const completionDate = new Date(c.date || c.createdAt);
    return completionDate >= cutoffDate;
  });
  
  // Group by item
  const itemUsage = {};
  
  for (const completion of recentCompletions) {
    if (!completion.inventoryUsed) continue;
    
    for (const item of completion.inventoryUsed) {
      const itemName = item.itemName;
      
      if (!itemUsage[itemName]) {
        itemUsage[itemName] = {
          itemName,
          totalQuantity: 0,
          jobCount: 0
        };
      }
      
      itemUsage[itemName].totalQuantity += item.quantityUsed || 0;
      itemUsage[itemName].jobCount++;
    }
  }
  
  // Calculate averages
  const trends = Object.values(itemUsage).map(data => ({
    ...data,
    averagePerJob: data.jobCount > 0 ? (data.totalQuantity / data.jobCount).toFixed(2) : 0
  }));
  
  // Sort by total quantity (highest first)
  trends.sort((a, b) => b.totalQuantity - a.totalQuantity);
  
  return trends;
}

/**
 * Get most consumed inventory items
 * @param {string} tenantId - Tenant ID
 * @param {number} days - Number of days to analyze
 * @param {number} limit - Number of items to return
 * @returns {Promise<Array>}
 */
export async function getMostConsumedItems(tenantId, days = 30, limit = 10) {
  const trends = await getInventoryConsumptionTrends(tenantId, days);
  return trends.slice(0, limit);
}

/**
 * Get inventory consumption by employee
 * @param {string} tenantId - Tenant ID
 * @param {string} employeeId - Employee ID
 * @returns {Promise<Object>}
 */
export async function getEmployeeInventoryConsumption(tenantId, employeeId) {
  const completionsRef = collection(db, 'tenants', tenantId, 'job_completions');
  const completionsSnap = await getDocs(completionsRef);
  
  const completions = completionsSnap.docs.map(doc => doc.data());
  
  // Filter by employee
  const employeeCompletions = completions.filter(c => 
    c.assignedEmployees && c.assignedEmployees.includes(employeeId)
  );
  
  // Group by item
  const itemUsage = {};
  
  for (const completion of employeeCompletions) {
    if (!completion.inventoryUsed) continue;
    
    for (const item of completion.inventoryUsed) {
      const itemName = item.itemName;
      
      if (!itemUsage[itemName]) {
        itemUsage[itemName] = {
          itemName,
          totalQuantity: 0,
          jobCount: 0
        };
      }
      
      itemUsage[itemName].totalQuantity += item.quantityUsed || 0;
      itemUsage[itemName].jobCount++;
    }
  }
  
  // Calculate averages
  const consumption = Object.values(itemUsage).map(data => ({
    ...data,
    averagePerJob: data.jobCount > 0 ? (data.totalQuantity / data.jobCount).toFixed(2) : 0
  }));
  
  // Sort by total quantity (highest first)
  consumption.sort((a, b) => b.totalQuantity - a.totalQuantity);
  
  return {
    employeeId,
    items: consumption
  };
}

/**
 * Get inventory consumption summary
 * @param {string} tenantId - Tenant ID
 * @param {number} days - Number of days to analyze
 * @returns {Promise<Object>}
 */
export async function getInventoryConsumptionSummary(tenantId, days = 30) {
  const trends = await getInventoryConsumptionTrends(tenantId, days);
  
  const totalItems = trends.length;
  const totalQuantity = trends.reduce((sum, t) => sum + t.totalQuantity, 0);
  
  return {
    totalItems,
    totalQuantity,
    topConsumed: trends.slice(0, 5),
    averageItemsPerJob: totalItems > 0 ? (totalQuantity / totalItems).toFixed(2) : 0
  };
}
