// src/services/supplyTrackingService.js
/**
 * Supply Tracking Service
 * Tracks inventory with reorder alerts and consumption tracking
 */

import { collection, addDoc, doc, setDoc, query, where, getDocs, updateDoc, increment } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Add a new supply item to inventory
 * @param {string} tenantId - Tenant ID
 * @param {Object} supplyItem - Supply item data
 * @returns {Promise<string>} Document ID
 */
export async function addSupplyItem(tenantId, supplyItem) {
  const suppliesRef = collection(db, 'tenants', tenantId, 'supplies');
  const docRef = await addDoc(suppliesRef, {
    ...supplyItem,
    quantityOnHand: supplyItem.quantityOnHand || 0,
    reorderLevel: supplyItem.reorderLevel || 10,
    unit: supplyItem.unit || 'units',
    lastPurchaseDate: supplyItem.lastPurchaseDate || new Date().toISOString().split('T')[0],
    averageWeeklyUsage: supplyItem.averageWeeklyUsage || 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  return docRef.id;
}

/**
 * Update supply item quantity
 * @param {string} tenantId - Tenant ID
 * @param {string} supplyId - Supply item ID
 * @param {number} quantityChange - Quantity change (positive for addition, negative for usage)
 * @returns {Promise<void>}
 */
export async function updateSupplyQuantity(tenantId, supplyId, quantityChange) {
  const supplyRef = doc(db, 'tenants', tenantId, 'supplies', supplyId);
  await updateDoc(supplyRef, {
    quantityOnHand: increment(quantityChange),
    updatedAt: new Date().toISOString()
  });
}

/**
 * Record supply usage for a job
 * @param {string} tenantId - Tenant ID
 * @param {Object} usageData - Usage data
 * @returns {Promise<string>} Document ID
 */
export async function recordSupplyUsage(tenantId, usageData) {
  const usageRef = collection(db, 'tenants', tenantId, 'supply_usage');
  const docRef = await addDoc(usageRef, {
    ...usageData,
    quantityUsed: usageData.quantityUsed || 0,
    jobId: usageData.jobId || '',
    employeeId: usageData.employeeId || '',
    date: usageData.date || new Date().toISOString().split('T')[0],
    createdAt: new Date().toISOString()
  });
  
  // Update supply quantity
  if (usageData.supplyId && usageData.quantityUsed) {
    await updateSupplyQuantity(tenantId, usageData.supplyId, -usageData.quantityUsed);
  }
  
  return docRef.id;
}

/**
 * Get all supply items for a tenant
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>} Supply items
 */
export async function getSupplyItems(tenantId) {
  const suppliesRef = collection(db, 'tenants', tenantId, 'supplies');
  const querySnap = await getDocs(suppliesRef);
  return querySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get supply items that need reordering
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>} Supply items below reorder level
 */
export async function getLowStockAlerts(tenantId) {
  const suppliesRef = collection(db, 'tenants', tenantId, 'supplies');
  const querySnap = await getDocs(suppliesRef);
  
  return querySnap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(supply => supply.quantityOnHand <= supply.reorderLevel);
}

/**
 * Get supply usage history for a job
 * @param {string} tenantId - Tenant ID
 * @param {string} jobId - Job ID
 * @returns {Promise<Array>} Supply usage records
 */
export async function getSupplyUsageByJob(tenantId, jobId) {
  const usageRef = collection(db, 'tenants', tenantId, 'supply_usage');
  const q = query(usageRef, where('jobId', '==', jobId));
  const querySnap = await getDocs(q);
  return querySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get supply usage history for an employee
 * @param {string} tenantId - Tenant ID
 * @param {string} employeeId - Employee ID
 * @returns {Promise<Array>} Supply usage records
 */
export async function getSupplyUsageByEmployee(tenantId, employeeId) {
  const usageRef = collection(db, 'tenants', tenantId, 'supply_usage');
  const q = query(usageRef, where('employeeId', '==', employeeId));
  const querySnap = await getDocs(q);
  return querySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Calculate average weekly usage for a supply item
 * @param {string} tenantId - Tenant ID
 * @param {string} supplyId - Supply item ID
 * @returns {Promise<number>} Average weekly usage
 */
export async function calculateAverageWeeklyUsage(tenantId, supplyId) {
  const usageRef = collection(db, 'tenants', tenantId, 'supply_usage');
  const q = query(usageRef, where('supplyId', '==', supplyId));
  const querySnap = await getDocs(q);
  
  const usageRecords = querySnap.docs.map(doc => doc.data());
  
  if (usageRecords.length === 0) return 0;
  
  // Get date range
  const dates = usageRecords.map(r => new Date(r.date));
  const minDate = new Date(Math.min(...dates));
  const maxDate = new Date(Math.max(...dates));
  const weeks = Math.max(1, (maxDate - minDate) / (7 * 24 * 60 * 60 * 1000));
  
  const totalUsage = usageRecords.reduce((sum, r) => sum + (r.quantityUsed || 0), 0);
  
  return Math.round(totalUsage / weeks);
}

/**
 * Update average weekly usage for a supply item
 * @param {string} tenantId - Tenant ID
 * @param {string} supplyId - Supply item ID
 * @returns {Promise<void>}
 */
export async function updateAverageWeeklyUsage(tenantId, supplyId) {
  const avgUsage = await calculateAverageWeeklyUsage(tenantId, supplyId);
  const supplyRef = doc(db, 'tenants', tenantId, 'supplies', supplyId);
  await updateDoc(supplyRef, {
    averageWeeklyUsage: avgUsage,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Get supply inventory summary
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Inventory summary
 */
export async function getInventorySummary(tenantId) {
  const supplies = await getSupplyItems(tenantId);
  const lowStockAlerts = await getLowStockAlerts(tenantId);
  
  return {
    totalItems: supplies.length,
    lowStockCount: lowStockAlerts.length,
    lowStockItems: lowStockAlerts,
    totalValue: supplies.reduce((sum, s) => sum + ((s.quantityOnHand || 0) * (s.unitCost || 0)), 0)
  };
}

/**
 * Update supply item details
 * @param {string} tenantId - Tenant ID
 * @param {string} supplyId - Supply item ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<void>}
 */
export async function updateSupplyItem(tenantId, supplyId, updates) {
  const supplyRef = doc(db, 'tenants', tenantId, 'supplies', supplyId);
  await updateDoc(supplyRef, {
    ...updates,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Delete supply item
 * @param {string} tenantId - Tenant ID
 * @param {string} supplyId - Supply item ID
 * @returns {Promise<void>}
 */
export async function deleteSupplyItem(tenantId, supplyId) {
  const supplyRef = doc(db, 'tenants', tenantId, 'supplies', supplyId);
  await setDoc(supplyRef, { deleted: true, deletedAt: new Date().toISOString() }, { merge: true });
}

/**
 * Get supply usage report for date range
 * @param {string} tenantId - Tenant ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Array>} Supply usage records
 */
export async function getSupplyUsageReport(tenantId, startDate, endDate) {
  const usageRef = collection(db, 'tenants', tenantId, 'supply_usage');
  const querySnap = await getDocs(usageRef);
  
  return querySnap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(record => {
      const recordDate = record.date;
      return recordDate >= startDate && recordDate <= endDate;
    });
}
