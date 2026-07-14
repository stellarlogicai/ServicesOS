/**
 * Core Lead Service
 * 
 * This service handles all lead-related business logic
 * that is shared across all service verticals.
 * 
 * Core features should never depend on vertical-specific logic.
 */

import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc, query, where, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { addSchemaVersion, getSchemaVersion } from '../../shared/schemas/schemaVersioning';
import { successResponse, errorResponse } from '../../shared/api/apiResponseStandard';
import { logError, ERROR_CODES, SEVERITY } from '../../shared/logging/errorLoggingStandard';

const COLLECTION_NAME = 'leads';
const SCHEMA_TYPE = 'LEAD';

/**
 * Get all leads for a tenant
 * @param {string} tenantId - The tenant ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getLeads(tenantId) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }

    const leadsRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const q = query(leadsRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    
    const leadsData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return successResponse(leadsData);
  } catch (error) {
    logError({
      message: 'Failed to load leads',
      module: 'core',
      feature: 'leads',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load leads', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get only Customer Portal quote requests created by one authenticated customer.
 * Firestore rules independently enforce the same ownership boundary.
 */
export async function getCustomerOwnedQuoteRequests(tenantId, authUid) {
  try {
    if (!tenantId || !authUid) {
      return errorResponse('Tenant ID and authenticated user ID are required', 'VALIDATION_ERROR');
    }

    const leadsRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const customerRequestsQuery = query(
      leadsRef,
      where('tenantId', '==', tenantId),
      where('createdByAuthUid', '==', authUid),
      where('type', '==', 'quote_request'),
      where('source', '==', 'customer-portal')
    );
    const snapshot = await getDocs(customerRequestsQuery);
    const requests = snapshot.docs
      .map(leadDocument => ({ id: leadDocument.id, ...leadDocument.data() }))
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    return successResponse(requests);
  } catch (error) {
    logError({
      message: 'Failed to load customer quote requests',
      module: 'core',
      feature: 'leads',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load customer quote requests', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get leads by status
 * @param {string} tenantId - The tenant ID
 * @param {string} status - The lead status
 * @returns {Promise<object>} - Standardized API response
 */
export async function getLeadsByStatus(tenantId, status) {
  try {
    if (!tenantId || !status) {
      return errorResponse('Tenant ID and status are required', 'VALIDATION_ERROR');
    }

    const leadsRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const q = query(leadsRef, where('status', '==', status), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    
    const leadsData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return successResponse(leadsData);
  } catch (error) {
    logError({
      message: 'Failed to load leads by status',
      module: 'core',
      feature: 'leads',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load leads by status', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get a single lead by ID
 * @param {string} tenantId - The tenant ID
 * @param {string} leadId - The lead ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getLeadById(tenantId, leadId) {
  try {
    if (!tenantId || !leadId) {
      return errorResponse('Tenant ID and Lead ID are required', 'VALIDATION_ERROR');
    }

    const leadRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, leadId);
    const snapshot = await getDoc(leadRef);
    
    if (!snapshot.exists()) {
      return errorResponse('Lead not found', ERROR_CODES.NOT_FOUND);
    }

    return successResponse({ id: snapshot.id, ...snapshot.data() });
  } catch (error) {
    logError({
      message: 'Failed to load lead',
      module: 'core',
      feature: 'leads',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load lead', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Create a new lead
 * @param {string} tenantId - The tenant ID
 * @param {object} leadData - The lead data
 * @returns {Promise<object>} - Standardized API response
 */
export async function createLead(tenantId, leadData) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }

    // Add schema version
    const leadWithVersion = addSchemaVersion(leadData, SCHEMA_TYPE);

    const leadsRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const docRef = await addDoc(leadsRef, {
      ...leadWithVersion,
      status: 'new',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: docRef.id, ...leadWithVersion }, 'Lead created successfully');
  } catch (error) {
    logError({
      message: 'Failed to create lead',
      module: 'core',
      feature: 'leads',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to create lead', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Update an existing lead
 * @param {string} tenantId - The tenant ID
 * @param {string} leadId - The lead ID
 * @param {object} leadData - The updated lead data
 * @returns {Promise<object>} - Standardized API response
 */
export async function updateLead(tenantId, leadId, leadData) {
  try {
    if (!tenantId || !leadId) {
      return errorResponse('Tenant ID and Lead ID are required', 'VALIDATION_ERROR');
    }

    const leadRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, leadId);
    
    // Preserve schema version if it exists
    const existingDoc = await getDoc(leadRef);
    let leadWithVersion = leadData;
    
    if (existingDoc.exists()) {
      const existingData = existingDoc.data();
      leadWithVersion = {
        ...leadData,
        schemaVersion: existingData.schemaVersion || getSchemaVersion(SCHEMA_TYPE)
      };
    } else {
      leadWithVersion = addSchemaVersion(leadData, SCHEMA_TYPE);
    }

    await updateDoc(leadRef, {
      ...leadWithVersion,
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: leadId, ...leadWithVersion }, 'Lead updated successfully');
  } catch (error) {
    logError({
      message: 'Failed to update lead',
      module: 'core',
      feature: 'leads',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to update lead', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Update lead status
 * @param {string} tenantId - The tenant ID
 * @param {string} leadId - The lead ID
 * @param {string} status - The new status
 * @returns {Promise<object>} - Standardized API response
 */
export async function updateLeadStatus(tenantId, leadId, status) {
  try {
    if (!tenantId || !leadId || !status) {
      return errorResponse('Tenant ID, Lead ID, and status are required', 'VALIDATION_ERROR');
    }

    const leadRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, leadId);
    await updateDoc(leadRef, {
      status,
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: leadId, status }, 'Lead status updated successfully');
  } catch (error) {
    logError({
      message: 'Failed to update lead status',
      module: 'core',
      feature: 'leads',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to update lead status', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Delete a lead
 * @param {string} tenantId - The tenant ID
 * @param {string} leadId - The lead ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function deleteLead(tenantId, leadId) {
  try {
    if (!tenantId || !leadId) {
      return errorResponse('Tenant ID and Lead ID are required', 'VALIDATION_ERROR');
    }

    const leadRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, leadId);
    await deleteDoc(leadRef);

    return successResponse({ id: leadId }, 'Lead deleted successfully');
  } catch (error) {
    logError({
      message: 'Failed to delete lead',
      module: 'core',
      feature: 'leads',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to delete lead', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Convert lead to customer
 * @param {string} tenantId - The tenant ID
 * @param {string} leadId - The lead ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function convertLeadToCustomer(tenantId, leadId) {
  try {
    if (!tenantId || !leadId) {
      return errorResponse('Tenant ID and Lead ID are required', 'VALIDATION_ERROR');
    }

    const leadRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, leadId);
    await updateDoc(leadRef, {
      status: 'converted',
      convertedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: leadId, status: 'converted' }, 'Lead converted to customer successfully');
  } catch (error) {
    logError({
      message: 'Failed to convert lead to customer',
      module: 'core',
      feature: 'leads',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to convert lead to customer', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}
