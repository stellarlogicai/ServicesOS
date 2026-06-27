/**
 * Core Customer Service
 * 
 * This service handles all customer-related business logic
 * that is shared across all service verticals.
 * 
 * Core features should never depend on vertical-specific logic.
 */

import { collection, getDocs, addDoc, updateDoc, doc, getDoc, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { addSchemaVersion, getSchemaVersion } from '../../shared/schemas/schemaVersioning';
import { successResponse, errorResponse } from '../../shared/api/apiResponseStandard';
import { logError, ERROR_CODES, SEVERITY } from '../../shared/logging/errorLoggingStandard';

const COLLECTION_NAME = 'customers';
const SCHEMA_TYPE = 'CUSTOMER';

/**
 * Get all customers for a tenant
 * @param {string} tenantId - The tenant ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getCustomers(tenantId) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }

    const customersRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const q = query(customersRef, orderBy('name'));
    const snapshot = await getDocs(q);
    
    const customersData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return successResponse(customersData);
  } catch (error) {
    logError({
      message: 'Failed to load customers',
      module: 'core',
      feature: 'customers',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load customers', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get a single customer by ID
 * @param {string} tenantId - The tenant ID
 * @param {string} customerId - The customer ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getCustomerById(tenantId, customerId) {
  try {
    if (!tenantId || !customerId) {
      return errorResponse('Tenant ID and Customer ID are required', 'VALIDATION_ERROR');
    }

    const customerRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, customerId);
    const snapshot = await getDoc(customerRef);
    
    if (!snapshot.exists()) {
      return errorResponse('Customer not found', ERROR_CODES.NOT_FOUND);
    }

    return successResponse({ id: snapshot.id, ...snapshot.data() });
  } catch (error) {
    logError({
      message: 'Failed to load customer',
      module: 'core',
      feature: 'customers',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load customer', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Create a new customer
 * @param {string} tenantId - The tenant ID
 * @param {object} customerData - The customer data
 * @returns {Promise<object>} - Standardized API response
 */
export async function createCustomer(tenantId, customerData) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }

    // Add schema version
    const customerWithVersion = addSchemaVersion(customerData, SCHEMA_TYPE);

    const customersRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const docRef = await addDoc(customersRef, {
      ...customerWithVersion,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: docRef.id, ...customerWithVersion }, 'Customer created successfully');
  } catch (error) {
    logError({
      message: 'Failed to create customer',
      module: 'core',
      feature: 'customers',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to create customer', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Update an existing customer
 * @param {string} tenantId - The tenant ID
 * @param {string} customerId - The customer ID
 * @param {object} customerData - The updated customer data
 * @returns {Promise<object>} - Standardized API response
 */
export async function updateCustomer(tenantId, customerId, customerData) {
  try {
    if (!tenantId || !customerId) {
      return errorResponse('Tenant ID and Customer ID are required', 'VALIDATION_ERROR');
    }

    const customerRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, customerId);
    
    // Preserve schema version if it exists, otherwise add it
    const existingDoc = await getDoc(customerRef);
    let customerWithVersion = customerData;
    
    if (existingDoc.exists()) {
      const existingData = existingDoc.data();
      customerWithVersion = {
        ...existingData,
        ...customerData,
        schemaVersion: existingData.schemaVersion || getSchemaVersion(SCHEMA_TYPE)
      };
    } else {
      customerWithVersion = addSchemaVersion(customerData, SCHEMA_TYPE);
    }

    await updateDoc(customerRef, {
      ...customerWithVersion,
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: customerId, ...customerWithVersion }, 'Customer updated successfully');
  } catch (error) {
    logError({
      message: 'Failed to update customer',
      module: 'core',
      feature: 'customers',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to update customer', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Delete a customer
 * @param {string} tenantId - The tenant ID
 * @param {string} customerId - The customer ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function deleteCustomer(tenantId, customerId) {
  if (!tenantId || !customerId) {
    return errorResponse('Tenant ID and Customer ID are required', 'VALIDATION_ERROR');
  }

  return errorResponse(
    'Customer deletion is disabled until linked leads, bookings, properties, and portal identity can be verified.',
    'CUSTOMER_DELETE_BLOCKED'
  );
}

/**
 * Search customers by term
 * @param {string} tenantId - The tenant ID
 * @param {string} searchTerm - The search term
 * @returns {Promise<object>} - Standardized API response
 */
export async function searchCustomers(tenantId, searchTerm) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }

    const customersRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const q = query(customersRef, orderBy('name'));
    const snapshot = await getDocs(q);
    
    const allCustomers = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Client-side filtering (for now - could be improved with Firestore composite indexes)
    const filteredCustomers = searchTerm
      ? allCustomers.filter(customer => {
          const searchLower = searchTerm.toLowerCase();
          return (
            (customer.name || '').toLowerCase().includes(searchLower) ||
            (customer.email || '').toLowerCase().includes(searchLower) ||
            (customer.phone || '').toLowerCase().includes(searchLower) ||
            (customer.address || '').toLowerCase().includes(searchLower) ||
            (customer.city || '').toLowerCase().includes(searchLower) ||
            (customer.state || '').toLowerCase().includes(searchLower) ||
            (customer.zip || '').toLowerCase().includes(searchLower)
          );
        })
      : allCustomers;

    return successResponse(filteredCustomers);
  } catch (error) {
    logError({
      message: 'Failed to search customers',
      module: 'core',
      feature: 'customers',
      severity: SEVERITY.MEDIUM,
      tenantId,
      error
    });
    return errorResponse('Failed to search customers', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}
