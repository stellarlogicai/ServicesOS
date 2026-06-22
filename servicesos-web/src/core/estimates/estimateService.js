/**
 * Core Estimate Service
 * 
 * This service handles all estimate-related business logic
 * that is shared across all service verticals.
 * 
 * Core features should never depend on vertical-specific logic.
 */

import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc, query, where, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { addSchemaVersion, getSchemaVersion } from '../../shared/schemas/schemaVersioning';
import { successResponse, errorResponse } from '../../shared/api/apiResponseStandard';
import { logError, ERROR_CODES, SEVERITY } from '../../shared/logging/errorLoggingStandard';

const COLLECTION_NAME = 'quotes';
const SCHEMA_TYPE = 'ESTIMATE';

/**
 * Get all estimates for a tenant
 * @param {string} tenantId - The tenant ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getEstimates(tenantId) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }

    const estimatesRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const q = query(estimatesRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    
    const estimatesData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return successResponse(estimatesData);
  } catch (error) {
    logError({
      message: 'Failed to load estimates',
      module: 'core',
      feature: 'estimates',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load estimates', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get estimates by status
 * @param {string} tenantId - The tenant ID
 * @param {string} status - The estimate status
 * @returns {Promise<object>} - Standardized API response
 */
export async function getEstimatesByStatus(tenantId, status) {
  try {
    if (!tenantId || !status) {
      return errorResponse('Tenant ID and status are required', 'VALIDATION_ERROR');
    }

    const estimatesRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const q = query(estimatesRef, where('status', '==', status), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    
    const estimatesData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return successResponse(estimatesData);
  } catch (error) {
    logError({
      message: 'Failed to load estimates by status',
      module: 'core',
      feature: 'estimates',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load estimates by status', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get a single estimate by ID
 * @param {string} tenantId - The tenant ID
 * @param {string} estimateId - The estimate ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getEstimateById(tenantId, estimateId) {
  try {
    if (!tenantId || !estimateId) {
      return errorResponse('Tenant ID and Estimate ID are required', 'VALIDATION_ERROR');
    }

    const estimateRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, estimateId);
    const snapshot = await getDoc(estimateRef);
    
    if (!snapshot.exists()) {
      return errorResponse('Estimate not found', ERROR_CODES.NOT_FOUND);
    }

    return successResponse({ id: snapshot.id, ...snapshot.data() });
  } catch (error) {
    logError({
      message: 'Failed to load estimate',
      module: 'core',
      feature: 'estimates',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load estimate', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Create a new estimate
 * @param {string} tenantId - The tenant ID
 * @param {object} estimateData - The estimate data
 * @returns {Promise<object>} - Standardized API response
 */
export async function createEstimate(tenantId, estimateData) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }

    // Add schema version
    const estimateWithVersion = addSchemaVersion(estimateData, SCHEMA_TYPE);

    const estimatesRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const docRef = await addDoc(estimatesRef, {
      ...estimateWithVersion,
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: docRef.id, ...estimateWithVersion }, 'Estimate created successfully');
  } catch (error) {
    logError({
      message: 'Failed to create estimate',
      module: 'core',
      feature: 'estimates',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to create estimate', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Update an existing estimate
 * @param {string} tenantId - The tenant ID
 * @param {string} estimateId - The estimate ID
 * @param {object} estimateData - The updated estimate data
 * @returns {Promise<object>} - Standardized API response
 */
export async function updateEstimate(tenantId, estimateId, estimateData) {
  try {
    if (!tenantId || !estimateId) {
      return errorResponse('Tenant ID and Estimate ID are required', 'VALIDATION_ERROR');
    }

    const estimateRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, estimateId);
    
    // Preserve schema version if it exists
    const existingDoc = await getDoc(estimateRef);
    let estimateWithVersion = estimateData;
    
    if (existingDoc.exists()) {
      const existingData = existingDoc.data();
      estimateWithVersion = {
        ...estimateData,
        schemaVersion: existingData.schemaVersion || getSchemaVersion(SCHEMA_TYPE)
      };
    } else {
      estimateWithVersion = addSchemaVersion(estimateData, SCHEMA_TYPE);
    }

    await updateDoc(estimateRef, {
      ...estimateWithVersion,
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: estimateId, ...estimateWithVersion }, 'Estimate updated successfully');
  } catch (error) {
    logError({
      message: 'Failed to update estimate',
      module: 'core',
      feature: 'estimates',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to update estimate', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Update estimate status
 * @param {string} tenantId - The tenant ID
 * @param {string} estimateId - The estimate ID
 * @param {string} status - The new status
 * @returns {Promise<object>} - Standardized API response
 */
export async function updateEstimateStatus(tenantId, estimateId, status) {
  try {
    if (!tenantId || !estimateId || !status) {
      return errorResponse('Tenant ID, Estimate ID, and status are required', 'VALIDATION_ERROR');
    }

    const estimateRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, estimateId);
    await updateDoc(estimateRef, {
      status,
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: estimateId, status }, 'Estimate status updated successfully');
  } catch (error) {
    logError({
      message: 'Failed to update estimate status',
      module: 'core',
      feature: 'estimates',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to update estimate status', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Delete an estimate
 * @param {string} tenantId - The tenant ID
 * @param {string} estimateId - The estimate ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function deleteEstimate(tenantId, estimateId) {
  try {
    if (!tenantId || !estimateId) {
      return errorResponse('Tenant ID and Estimate ID are required', 'VALIDATION_ERROR');
    }

    const estimateRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, estimateId);
    await deleteDoc(estimateRef);

    return successResponse({ id: estimateId }, 'Estimate deleted successfully');
  } catch (error) {
    logError({
      message: 'Failed to delete estimate',
      module: 'core',
      feature: 'estimates',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to delete estimate', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Send estimate to customer
 * @param {string} tenantId - The tenant ID
 * @param {string} estimateId - The estimate ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function sendEstimate(tenantId, estimateId) {
  try {
    if (!tenantId || !estimateId) {
      return errorResponse('Tenant ID and Estimate ID are required', 'VALIDATION_ERROR');
    }

    const estimateRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, estimateId);
    await updateDoc(estimateRef, {
      status: 'sent',
      sentAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: estimateId, status: 'sent' }, 'Estimate sent successfully');
  } catch (error) {
    logError({
      message: 'Failed to send estimate',
      module: 'core',
      feature: 'estimates',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to send estimate', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}
