// src/services/customerLifetimeValueService.js
/**
 * Customer Lifetime Value Service
 * Tracks and calculates customer lifetime metrics including total revenue, jobs, average ticket, and service dates
 */

import { doc, getDoc, getDocs, collection, query, where, orderBy, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Get customer lifetime value
 * @param {string} tenantId - Tenant ID
 * @param {string} customerId - Customer ID
 * @returns {Promise<Object>}
 */
export async function getCustomerLifetimeValue(tenantId, customerId) {
  // Get customer's jobs
  const jobsRef = collection(db, 'tenants', tenantId, 'jobs');
  const jobsQ = query(jobsRef, where('customerId', '==', customerId), orderBy('date', 'asc'));
  const jobsSnap = await getDocs(jobsQ);
  
  const jobs = jobsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  // Get customer's invoices
  const invoicesRef = collection(db, 'tenants', tenantId, 'invoices');
  const invoicesQ = query(invoicesRef, where('customerId', '==', customerId), orderBy('createdAt', 'asc'));
  const invoicesSnap = await getDocs(invoicesQ);
  
  const invoices = invoicesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  // Calculate metrics
  let totalRevenue = 0;
  let totalPaid = 0;
  let firstServiceDate = null;
  let lastServiceDate = null;
  
  for (const invoice of invoices) {
    totalRevenue += invoice.total || 0;
    totalPaid += invoice.balancePaid || 0;
  }
  
  if (jobs.length > 0) {
    firstServiceDate = jobs[0].date;
    lastServiceDate = jobs[jobs.length - 1].date;
  }
  
  const totalJobs = jobs.length;
  const averageTicket = totalJobs > 0 ? totalRevenue / totalJobs : 0;
  
  return {
    customerId,
    totalRevenue,
    totalPaid,
    totalJobs,
    averageTicket,
    firstServiceDate,
    lastServiceDate,
    jobsCompleted: jobs.filter(j => j.status === 'completed').length
  };
}

/**
 * Update customer lifetime value collection
 * @param {string} tenantId - Tenant ID
 * @param {string} customerId - Customer ID
 * @returns {Promise<Object>}
 */
export async function updateCustomerLifetimeValue(tenantId, customerId) {
  const clv = await getCustomerLifetimeValue(tenantId, customerId);
  
  const clvRef = doc(db, 'tenants', tenantId, 'customers', customerId, 'lifetime_value', 'current');
  const clvSnap = await getDoc(clvRef);
  
  const data = {
    ...clv,
    updatedAt: new Date().toISOString()
  };
  
  if (clvSnap.exists()) {
    await updateDoc(clvRef, data);
  } else {
    // Create the document if it doesn't exist
    await updateDoc(doc(db, 'tenants', tenantId, 'customers', customerId), {
      lifetimeValue: data
    });
  }
  
  return clv;
}

/**
 * Get all customers lifetime values
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>}
 */
export async function getAllCustomersLifetimeValue(tenantId) {
  const customersRef = collection(db, 'tenants', tenantId, 'customers');
  const customersSnap = await getDocs(customersRef);
  
  const clvData = [];
  
  for (const customerDoc of customersSnap.docs) {
    const customerId = customerDoc.id;
    const clv = await getCustomerLifetimeValue(tenantId, customerId);
    clvData.push({
      customerId,
      customerName: customerDoc.data().name || customerDoc.data().customerName,
      ...clv
    });
  }
  
  // Sort by total revenue descending
  clvData.sort((a, b) => b.totalRevenue - a.totalRevenue);
  
  return clvData;
}

/**
 * Get top customers by revenue
 * @param {string} tenantId - Tenant ID
 * @param {number} limit - Number of customers to return
 * @returns {Promise<Array>}
 */
export async function getTopCustomersByRevenue(tenantId, limit = 10) {
  const allClv = await getAllCustomersLifetimeValue(tenantId);
  return allClv.slice(0, limit);
}

/**
 * Get most loyal customers (by job count)
 * @param {string} tenantId - Tenant ID
 * @param {number} limit - Number of customers to return
 * @returns {Promise<Array>}
 */
export async function getMostLoyalCustomers(tenantId, limit = 10) {
  const allClv = await getAllCustomersLifetimeValue(tenantId);
  return allClv
    .filter(c => c.totalJobs > 0)
    .sort((a, b) => b.totalJobs - a.totalJobs)
    .slice(0, limit);
}

/**
 * Get customers at risk (no service in X days)
 * @param {string} tenantId - Tenant ID
 * @param {number} days - Days since last service
 * @returns {Promise<Array>}
 */
export async function getCustomersAtRisk(tenantId, days = 90) {
  const allClv = await getAllCustomersLifetimeValue(tenantId);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  return allClv.filter(customer => {
    if (!customer.lastServiceDate) return false;
    const lastService = new Date(customer.lastServiceDate);
    return lastService < cutoffDate;
  });
}

/**
 * Get customer lifetime value trends over time
 * @param {string} tenantId - Tenant ID
 * @param {string} customerId - Customer ID
 * @returns {Promise<Array>}
 */
export async function getCustomerLifetimeValueTrends(tenantId, customerId) {
  const invoicesRef = collection(db, 'tenants', tenantId, 'invoices');
  const invoicesQ = query(invoicesRef, where('customerId', '==', customerId), orderBy('createdAt', 'asc'));
  const invoicesSnap = await getDocs(invoicesQ);
  
  const invoices = invoicesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  const trends = [];
  let cumulativeRevenue = 0;
  let cumulativeJobs = 0;
  
  for (const invoice of invoices) {
    cumulativeRevenue += invoice.total || 0;
    cumulativeJobs += 1;
    
    trends.push({
      date: invoice.createdAt,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      amount: invoice.total,
      cumulativeRevenue,
      cumulativeJobs
    });
  }
  
  return trends;
}

/**
 * Calculate customer lifetime value prediction
 * @param {string} tenantId - Tenant ID
 * @param {string} customerId - Customer ID
 * @returns {Promise<Object>}
 */
export async function predictCustomerLifetimeValue(tenantId, customerId) {
  const clv = await getCustomerLifetimeValue(tenantId, customerId);
  
  if (clv.totalJobs === 0) {
    return {
      customerId,
      predictedLifetimeValue: 0,
      confidence: 'low'
    };
  }
  
  // Simple prediction based on average ticket and frequency
  const averageTicket = clv.averageTicket;
  const daysSinceFirstService = clv.firstServiceDate 
    ? (new Date() - new Date(clv.firstServiceDate)) / (1000 * 60 * 60 * 24)
    : 0;
  
  const jobsPerMonth = daysSinceFirstService > 0 
    ? (clv.totalJobs / (daysSinceFirstService / 30))
    : 0;
  
  // Predict 12 months of future value
  const predictedFutureRevenue = averageTicket * jobsPerMonth * 12;
  const predictedLifetimeValue = clv.totalRevenue + predictedFutureRevenue;
  
  return {
    customerId,
    averageTicket,
    jobsPerMonth,
    predictedFutureRevenue,
    predictedLifetimeValue,
    confidence: jobsPerMonth > 0 ? 'medium' : 'low'
  };
}
