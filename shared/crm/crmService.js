// src/shared/crm/crmService.js
/**
 * CRM Service
 * Customer Relationship Management - Shared across all platforms
 * 
 * Generic customer/lead management that can be extended for specific industries
 * 
 * DATA SHAPE:
 * {
 *   id:        string
 *   tenantId:  string
 *   createdAt: ISO string
 *   updatedAt: ISO string
 *   status:    "new" | "active" | "inactive" | "lost"
 *   customerData: { name, email, phone, address, ... }
 *   customFields: { ... } // Industry-specific fields
 *   notes: string
 *   tags: string[]
 * }
 */

import { collection, addDoc, doc, getDoc, getDocs, updateDoc, query, where, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';

const CUSTOMERS_COLLECTION = 'customers';

/**
 * Create new customer/lead
 * @param {string} tenantId - Tenant ID
 * @param {object} customerData - Customer data
 * @returns {Promise<DocumentReference>}
 */
export async function createCustomer(tenantId, customerData) {
  const customerRef = collection(db, 'tenants', tenantId, CUSTOMERS_COLLECTION);
  
  const data = {
    tenantId,
    status: customerData.status || 'new',
    customerData: customerData.customerData || {},
    customFields: customerData.customFields || {},
    notes: customerData.notes || '',
    tags: customerData.tags || [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  return await addDoc(customerRef, data);
}

/**
 * Get customer by ID
 * @param {string} tenantId - Tenant ID
 * @param {string} customerId - Customer ID
 * @returns {Promise<Object|null>}
 */
export async function getCustomer(tenantId, customerId) {
  const customerRef = doc(db, 'tenants', tenantId, CUSTOMERS_COLLECTION, customerId);
  const snapshot = await getDoc(customerRef);
  
  if (snapshot.exists()) {
    return { id: snapshot.id, ...snapshot.data() };
  }
  return null;
}

/**
 * Get all customers for tenant
 * @param {string} tenantId - Tenant ID
 * @param {string} status - Optional status filter
 * @returns {Promise<Array>}
 */
export async function getCustomers(tenantId, status = null) {
  const customerRef = collection(db, 'tenants', tenantId, CUSTOMERS_COLLECTION);
  let q;
  
  if (status) {
    q = query(customerRef, where('status', '==', status), orderBy('createdAt', 'desc'));
  } else {
    q = query(customerRef, orderBy('createdAt', 'desc'));
  }
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Update customer
 * @param {string} tenantId - Tenant ID
 * @param {string} customerId - Customer ID
 * @param {object} updates - Fields to update
 * @returns {Promise<void>}
 */
export async function updateCustomer(tenantId, customerId, updates) {
  const customerRef = doc(db, 'tenants', tenantId, CUSTOMERS_COLLECTION, customerId);
  await updateDoc(customerRef, {
    ...updates,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Update customer status
 * @param {string} tenantId - Tenant ID
 * @param {string} customerId - Customer ID
 * @param {string} status - New status
 * @returns {Promise<void>}
 */
export async function updateCustomerStatus(tenantId, customerId, status) {
  return await updateCustomer(tenantId, customerId, { status });
}

/**
 * Add note to customer
 * @param {string} tenantId - Tenant ID
 * @param {string} customerId - Customer ID
 * @param {string} note - Note content
 * @returns {Promise<void>}
 */
export async function addCustomerNote(tenantId, customerId, note) {
  const customer = await getCustomer(tenantId, customerId);
  const existingNotes = customer.notes || '';
  const newNotes = existingNotes ? `${existingNotes}\n\n${new Date().toISOString()}: ${note}` : `${new Date().toISOString()}: ${note}`;
  
  return await updateCustomer(tenantId, customerId, { notes: newNotes });
}

/**
 * Add tag to customer
 * @param {string} tenantId - Tenant ID
 * @param {string} customerId - Customer ID
 * @param {string} tag - Tag to add
 * @returns {Promise<void>}
 */
export async function addCustomerTag(tenantId, customerId, tag) {
  const customer = await getCustomer(tenantId, customerId);
  const existingTags = customer.tags || [];
  
  if (!existingTags.includes(tag)) {
    return await updateCustomer(tenantId, customerId, { tags: [...existingTags, tag] });
  }
}

/**
 * Remove tag from customer
 * @param {string} tenantId - Tenant ID
 * @param {string} customerId - Customer ID
 * @param {string} tag - Tag to remove
 * @returns {Promise<void>}
 */
export async function removeCustomerTag(tenantId, customerId, tag) {
  const customer = await getCustomer(tenantId, customerId);
  const existingTags = customer.tags || [];
  
  return await updateCustomer(tenantId, customerId, { 
    tags: existingTags.filter(t => t !== tag) 
  });
}

/**
 * Search customers by name or email
 * @param {string} tenantId - Tenant ID
 * @param {string} searchTerm - Search term
 * @returns {Promise<Array>}
 */
export async function searchCustomers(tenantId, searchTerm) {
  const customers = await getCustomers(tenantId);
  const term = searchTerm.toLowerCase();
  
  return customers.filter(customer => {
    const name = customer.customerData.name || '';
    const email = customer.customerData.email || '';
    return name.toLowerCase().includes(term) || email.toLowerCase().includes(term);
  });
}

/**
 * Get customer stats
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>}
 */
export async function getCustomerStats(tenantId) {
  const customers = await getCustomers(tenantId);
  
  const statusCounts = {
    new: 0,
    active: 0,
    inactive: 0,
    lost: 0
  };
  
  customers.forEach(customer => {
    if (statusCounts[customer.status] !== undefined) {
      statusCounts[customer.status]++;
    }
  });
  
  return {
    total: customers.length,
    byStatus: statusCounts,
    withTags: customers.filter(c => c.tags && c.tags.length > 0).length,
    withNotes: customers.filter(c => c.notes && c.notes.length > 0).length
  };
}

/**
 * Delete customer
 * @param {string} tenantId - Tenant ID
 * @param {string} customerId - Customer ID
 * @returns {Promise<void>}
 */
export async function deleteCustomer(tenantId, customerId) {
  // In production, this would be a real delete or soft delete
  const customerRef = doc(db, 'tenants', tenantId, CUSTOMERS_COLLECTION, customerId);
  await updateDoc(customerRef, {
    status: 'deleted',
    deletedAt: new Date().toISOString()
  });
}
