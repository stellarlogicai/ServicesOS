// src/services/inventoryConsumptionTrackingService.js
/**
 * Inventory Consumption Tracking Service
 * Tracks inventory consumption including item, quantity on hand, reorder level, last purchase date, average weekly usage
 */

import { getDocs, collection } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Get inventory consumption tracking for a tenant
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>}
 */
export async function getInventoryConsumptionTracking(tenantId) {
  const inventoryRef = collection(db, 'tenants', tenantId, 'inventory');
  const inventorySnap = await getDocs(inventoryRef);
  
  const inventory = inventorySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  // Get job completions to calculate usage
  const completionsRef = collection(db, 'tenants', tenantId, 'job_completions');
  const completionsSnap = await getDocs(completionsRef);
  
  const completions = completionsSnap.docs.map(doc => doc.data());
  
  // Calculate usage per item
  const usageData = {};
  
  for (const completion of completions) {
    if (!completion.inventoryUsed) continue;
    
    for (const item of completion.inventoryUsed) {
      const itemName = item.itemName;
      
      if (!usageData[itemName]) {
        usageData[itemName] = {
          itemName,
          totalQuantityUsed: 0,
          jobCount: 0
        };
      }
      
      usageData[itemName].totalQuantityUsed += item.quantityUsed || 0;
      usageData[itemName].jobCount++;
    }
  }
  
  // Merge with inventory data
  const trackingData = inventory.map(item => {
    const usage = usageData[item.name] || { totalQuantityUsed: 0, jobCount: 0 };
    
    // Calculate average weekly usage (assuming 4 weeks per month for simplicity)
    const weeksSincePurchase = item.lastPurchaseDate 
      ? Math.max(1, Math.floor((new Date() - new Date(item.lastPurchaseDate)) / (1000 * 60 * 60 * 24 * 7)))
      : 4;
    
    const averageWeeklyUsage = usage.totalQuantityUsed / weeksSincePurchase;
    
    // Calculate weeks of stock remaining
    const weeksRemaining = item.quantityOnHand > 0 && averageWeeklyUsage > 0
      ? item.quantityOnHand / averageWeeklyUsage
      : 0;
    
    // Check if reorder needed
    const reorderNeeded = item.quantityOnHand <= item.reorderLevel;
    
    return {
      itemId: item.id,
      itemName: item.name,
      quantityOnHand: item.quantityOnHand,
      reorderLevel: item.reorderLevel,
      lastPurchaseDate: item.lastPurchaseDate,
      totalQuantityUsed: usage.totalQuantityUsed,
      jobCount: usage.jobCount,
      averageWeeklyUsage: averageWeeklyUsage.toFixed(2),
      weeksRemaining: weeksRemaining.toFixed(1),
      reorderNeeded
    };
  });
  
  // Sort by reorder needed first, then by weeks remaining
  trackingData.sort((a, b) => {
    if (a.reorderNeeded && !b.reorderNeeded) return -1;
    if (!a.reorderNeeded && b.reorderNeeded) return 1;
    return parseFloat(a.weeksRemaining) - parseFloat(b.weeksRemaining);
  });
  
  return trackingData;
}

/**
 * Get items needing reorder
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>}
 */
export async function getItemsNeedingReorder(tenantId) {
  const trackingData = await getInventoryConsumptionTracking(tenantId);
  return trackingData.filter(item => item.reorderNeeded);
}

/**
 * Get inventory consumption trends
 * @param {string} tenantId - Tenant ID
 * @param {number} days - Number of days to analyze
 * @returns {Promise<Array>}
 */
export async function getInventoryConsumptionTrends(tenantId, days = 30) {
  const completionsRef = collection(db, 'tenants', tenantId, 'job_completions');
  const completionsSnap = await getDocs(completionsRef);
  
  const completions = completionsSnap.docs.map(doc => doc.data());
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  const recentCompletions = completions.filter(c => {
    const completionDate = new Date(c.date || c.createdAt);
    return completionDate >= cutoffDate;
  });
  
  const weeklyData = {};
  
  for (const completion of recentCompletions) {
    if (!completion.inventoryUsed) continue;
    
    const date = new Date(completion.date || completion.createdAt);
    const weekKey = `${date.getFullYear()}-W${Math.ceil(date.getDate() / 7)}`;
    
    if (!weeklyData[weekKey]) {
      weeklyData[weekKey] = {
        week: weekKey,
        totalUsage: 0,
        jobCount: 0
      };
    }
    
    for (const item of completion.inventoryUsed) {
      weeklyData[weekKey].totalUsage += item.quantityUsed || 0;
    }
    
    weeklyData[weekKey].jobCount++;
  }
  
  const trends = Object.values(weeklyData).map(data => ({
    ...data,
    averageUsagePerJob: data.jobCount > 0 ? (data.totalUsage / data.jobCount).toFixed(2) : 0
  }));
  
  trends.sort((a, b) => a.week.localeCompare(b.week));
  
  return trends;
}

/**
 * Get inventory summary
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>}
 */
export async function getInventorySummary(tenantId) {
  const trackingData = await getInventoryConsumptionTracking(tenantId);
  
  const totalItems = trackingData.length;
  const itemsNeedingReorder = trackingData.filter(i => i.reorderNeeded).length;
  const totalQuantityOnHand = trackingData.reduce((sum, i) => sum + i.quantityOnHand, 0);
  const totalWeeklyUsage = trackingData.reduce((sum, i) => sum + parseFloat(i.averageWeeklyUsage), 0);
  
  // Calculate total value (assuming cost per unit is stored or can be calculated)
  const totalValue = trackingData.reduce((sum, i) => sum + (i.quantityOnHand * (i.costPerUnit || 0)), 0);
  
  return {
    totalItems,
    itemsNeedingReorder,
    totalQuantityOnHand,
    totalWeeklyUsage,
    totalValue,
    reorderRate: totalItems > 0 ? (itemsNeedingReorder / totalItems * 100).toFixed(1) : 0
  };
}

/**
 * Get most consumed items
 * @param {string} tenantId - Tenant ID
 * @param {number} limit - Number of items to return
 * @returns {Promise<Array>}
 */
export async function getMostConsumedItems(tenantId, limit = 10) {
  const trackingData = await getInventoryConsumptionTracking(tenantId);
  return trackingData
    .sort((a, b) => b.totalQuantityUsed - a.totalQuantityUsed)
    .slice(0, limit);
}
