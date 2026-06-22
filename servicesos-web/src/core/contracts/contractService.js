/**
 * Core Contract Service
 * 
 * This service handles all contract-related business logic
 * that is shared across all service verticals.
 * 
 * Core features should never depend on vertical-specific logic.
 */

import { collection, getDocs, addDoc, updateDoc, doc, getDoc, query, where, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { addSchemaVersion } from '../../shared/schemas/schemaVersioning';
import { successResponse, errorResponse } from '../../shared/api/apiResponseStandard';
import { logError, ERROR_CODES, SEVERITY } from '../../shared/logging/errorLoggingStandard';

const COLLECTION_NAME = 'contracts';
const SCHEMA_TYPE = 'CONTRACT';

/**
 * Get all contracts for a tenant
 * @param {string} tenantId - The tenant ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getContracts(tenantId) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }

    const contractsRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const q = query(contractsRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    
    const contractsData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return successResponse(contractsData);
  } catch (error) {
    logError({
      message: 'Failed to load contracts',
      module: 'core',
      feature: 'contracts',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load contracts', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get contracts by status
 * @param {string} tenantId - The tenant ID
 * @param {string} status - The contract status
 * @returns {Promise<object>} - Standardized API response
 */
export async function getContractsByStatus(tenantId, status) {
  try {
    if (!tenantId || !status) {
      return errorResponse('Tenant ID and status are required', 'VALIDATION_ERROR');
    }

    const contractsRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const q = query(contractsRef, where('status', '==', status), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    
    const contractsData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return successResponse(contractsData);
  } catch (error) {
    logError({
      message: 'Failed to load contracts by status',
      module: 'core',
      feature: 'contracts',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load contracts by status', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get a single contract by ID
 * @param {string} tenantId - The tenant ID
 * @param {string} contractId - The contract ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getContractById(tenantId, contractId) {
  try {
    if (!tenantId || !contractId) {
      return errorResponse('Tenant ID and Contract ID are required', 'VALIDATION_ERROR');
    }

    const contractRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, contractId);
    const snapshot = await getDoc(contractRef);
    
    if (!snapshot.exists()) {
      return errorResponse('Contract not found', ERROR_CODES.NOT_FOUND);
    }

    return successResponse({ id: snapshot.id, ...snapshot.data() });
  } catch (error) {
    logError({
      message: 'Failed to load contract',
      module: 'core',
      feature: 'contracts',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load contract', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Create a new contract
 * @param {string} tenantId - The tenant ID
 * @param {object} contractData - The contract data
 * @returns {Promise<object>} - Standardized API response
 */
export async function createContract(tenantId, contractData) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }

    // Add schema version
    const contractWithVersion = addSchemaVersion(contractData, SCHEMA_TYPE);

    const contractsRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const docRef = await addDoc(contractsRef, {
      ...contractWithVersion,
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: docRef.id, ...contractWithVersion }, 'Contract created successfully');
  } catch (error) {
    logError({
      message: 'Failed to create contract',
      module: 'core',
      feature: 'contracts',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to create contract', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Update an existing contract
 * @param {string} tenantId - The tenant ID
 * @param {string} contractId - The contract ID
 * @param {object} contractData - The updated contract data
 * @returns {Promise<object>} - Standardized API response
 */
export async function updateContract(tenantId, contractId, contractData) {
  try {
    if (!tenantId || !contractId) {
      return errorResponse('Tenant ID and Contract ID are required', 'VALIDATION_ERROR');
    }

    const contractRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, contractId);
    
    // Preserve schema version if it exists
    const existingDoc = await getDoc(contractRef);
    let contractWithVersion = contractData;
    
    if (existingDoc.exists()) {
      const existingData = existingDoc.data();
      contractWithVersion = {
        ...contractData,
        schemaVersion: existingData.schemaVersion || 1
      };
    } else {
      contractWithVersion = addSchemaVersion(contractData, SCHEMA_TYPE);
    }

    await updateDoc(contractRef, {
      ...contractWithVersion,
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: contractId, ...contractWithVersion }, 'Contract updated successfully');
  } catch (error) {
    logError({
      message: 'Failed to update contract',
      module: 'core',
      feature: 'contracts',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to update contract', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Update contract status
 * @param {string} tenantId - The tenant ID
 * @param {string} contractId - The contract ID
 * @param {string} status - The new status
 * @returns {Promise<object>} - Standardized API response
 */
export async function updateContractStatus(tenantId, contractId, status) {
  try {
    if (!tenantId || !contractId || !status) {
      return errorResponse('Tenant ID, Contract ID, and status are required', 'VALIDATION_ERROR');
    }

    const contractRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, contractId);
    await updateDoc(contractRef, {
      status,
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: contractId, status }, 'Contract status updated successfully');
  } catch (error) {
    logError({
      message: 'Failed to update contract status',
      module: 'core',
      feature: 'contracts',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to update contract status', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Send contract for signature
 * @param {string} tenantId - The tenant ID
 * @param {string} contractId - The contract ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function sendContract(tenantId, contractId) {
  try {
    if (!tenantId || !contractId) {
      return errorResponse('Tenant ID and Contract ID are required', 'VALIDATION_ERROR');
    }

    const contractRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, contractId);
    await updateDoc(contractRef, {
      status: 'sent',
      sentAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: contractId, status: 'sent' }, 'Contract sent successfully');
  } catch (error) {
    logError({
      message: 'Failed to send contract',
      module: 'core',
      feature: 'contracts',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to send contract', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Sign contract
 * @param {string} tenantId - The tenant ID
 * @param {string} contractId - The contract ID
 * @param {string} signatureData - The signature data
 * @returns {Promise<object>} - Standardized API response
 */
export async function signContract(tenantId, contractId, signatureData) {
  try {
    if (!tenantId || !contractId) {
      return errorResponse('Tenant ID and Contract ID are required', 'VALIDATION_ERROR');
    }

    const contractRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, contractId);
    await updateDoc(contractRef, {
      status: 'signed',
      signatureData,
      signedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: contractId, status: 'signed' }, 'Contract signed successfully');
  } catch (error) {
    logError({
      message: 'Failed to sign contract',
      module: 'core',
      feature: 'contracts',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to sign contract', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}
