/**
 * Core Training Service
 * 
 * This service handles all training-related business logic
 * that is shared across all service verticals.
 * 
 * Core features should never depend on vertical-specific logic.
 */

import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc, query, where, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { addSchemaVersion } from '../../shared/schemas/schemaVersioning';
import { successResponse, errorResponse } from '../../shared/api/apiResponseStandard';
import { logError, ERROR_CODES, SEVERITY } from '../../shared/logging/errorLoggingStandard';

const COLLECTION_NAME = 'training';
const SCHEMA_TYPE = 'TRAINING';

/**
 * Get all training modules for a tenant
 * @param {string} tenantId - The tenant ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getTrainingModules(tenantId) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }

    const trainingRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const q = query(trainingRef, orderBy('title'));
    const snapshot = await getDocs(q);
    
    const trainingData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return successResponse(trainingData);
  } catch (error) {
    logError({
      message: 'Failed to load training modules',
      module: 'core',
      feature: 'training',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load training modules', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get training modules by employee ID
 * @param {string} tenantId - The tenant ID
 * @param {string} employeeId - The employee ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getTrainingByEmployee(tenantId, employeeId) {
  try {
    if (!tenantId || !employeeId) {
      return errorResponse('Tenant ID and Employee ID are required', 'VALIDATION_ERROR');
    }

    const trainingRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const q = query(trainingRef, where('assignedEmployeeId', '==', employeeId), orderBy('assignedAt', 'desc'));
    const snapshot = await getDocs(q);
    
    const trainingData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return successResponse(trainingData);
  } catch (error) {
    logError({
      message: 'Failed to load training by employee',
      module: 'core',
      feature: 'training',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load training by employee', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get a single training module by ID
 * @param {string} tenantId - The tenant ID
 * @param {string} trainingId - The training ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getTrainingById(tenantId, trainingId) {
  try {
    if (!tenantId || !trainingId) {
      return errorResponse('Tenant ID and Training ID are required', 'VALIDATION_ERROR');
    }

    const trainingRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, trainingId);
    const snapshot = await getDoc(trainingRef);
    
    if (!snapshot.exists()) {
      return errorResponse('Training module not found', ERROR_CODES.NOT_FOUND);
    }

    return successResponse({ id: snapshot.id, ...snapshot.data() });
  } catch (error) {
    logError({
      message: 'Failed to load training module',
      module: 'core',
      feature: 'training',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load training module', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Create a new training module
 * @param {string} tenantId - The tenant ID
 * @param {object} trainingData - The training data
 * @returns {Promise<object>} - Standardized API response
 */
export async function createTraining(tenantId, trainingData) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }

    // Add schema version
    const trainingWithVersion = addSchemaVersion(trainingData, SCHEMA_TYPE);

    const trainingRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const docRef = await addDoc(trainingRef, {
      ...trainingWithVersion,
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: docRef.id, ...trainingWithVersion }, 'Training module created successfully');
  } catch (error) {
    logError({
      message: 'Failed to create training module',
      module: 'core',
      feature: 'training',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to create training module', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Update a training module
 * @param {string} tenantId - The tenant ID
 * @param {string} trainingId - The training ID
 * @param {object} trainingData - The updated training data
 * @returns {Promise<object>} - Standardized API response
 */
export async function updateTraining(tenantId, trainingId, trainingData) {
  try {
    if (!tenantId || !trainingId) {
      return errorResponse('Tenant ID and Training ID are required', 'VALIDATION_ERROR');
    }

    const trainingRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, trainingId);
    
    // Preserve schema version if it exists
    const existingDoc = await getDoc(trainingRef);
    let trainingWithVersion = trainingData;
    
    if (existingDoc.exists()) {
      const existingData = existingDoc.data();
      trainingWithVersion = {
        ...trainingData,
        schemaVersion: existingData.schemaVersion || 1
      };
    } else {
      trainingWithVersion = addSchemaVersion(trainingData, SCHEMA_TYPE);
    }

    await updateDoc(trainingRef, {
      ...trainingWithVersion,
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: trainingId, ...trainingWithVersion }, 'Training module updated successfully');
  } catch (error) {
    logError({
      message: 'Failed to update training module',
      module: 'core',
      feature: 'training',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to update training module', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Assign training to employee
 * @param {string} tenantId - The tenant ID
 * @param {string} trainingId - The training ID
 * @param {string} employeeId - The employee ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function assignTraining(tenantId, trainingId, employeeId) {
  try {
    if (!tenantId || !trainingId || !employeeId) {
      return errorResponse('Tenant ID, Training ID, and Employee ID are required', 'VALIDATION_ERROR');
    }

    const trainingRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, trainingId);
    await updateDoc(trainingRef, {
      assignedEmployeeId: employeeId,
      assignedAt: new Date().toISOString(),
      status: 'assigned',
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: trainingId, assignedEmployeeId: employeeId }, 'Training assigned successfully');
  } catch (error) {
    logError({
      message: 'Failed to assign training',
      module: 'core',
      feature: 'training',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to assign training', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Mark training as completed
 * @param {string} tenantId - The tenant ID
 * @param {string} trainingId - The training ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function completeTraining(tenantId, trainingId) {
  try {
    if (!tenantId || !trainingId) {
      return errorResponse('Tenant ID and Training ID are required', 'VALIDATION_ERROR');
    }

    const trainingRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, trainingId);
    await updateDoc(trainingRef, {
      status: 'completed',
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: trainingId, status: 'completed' }, 'Training completed successfully');
  } catch (error) {
    logError({
      message: 'Failed to complete training',
      module: 'core',
      feature: 'training',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to complete training', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Delete a training module
 * @param {string} tenantId - The tenant ID
 * @param {string} trainingId - The training ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function deleteTraining(tenantId, trainingId) {
  try {
    if (!tenantId || !trainingId) {
      return errorResponse('Tenant ID and Training ID are required', 'VALIDATION_ERROR');
    }

    const trainingRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, trainingId);
    await deleteDoc(trainingRef);

    return successResponse({ id: trainingId }, 'Training module deleted successfully');
  } catch (error) {
    logError({
      message: 'Failed to delete training module',
      module: 'core',
      feature: 'training',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to delete training module', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}
