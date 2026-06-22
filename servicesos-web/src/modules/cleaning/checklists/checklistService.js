/**
 * Cleaning Module - Checklists Service
 * 
 * This service handles cleaning-specific checklists
 * that are unique to the cleaning vertical.
 * 
 * Checklists define standard cleaning procedures
 * for different service types (standard clean, deep clean, etc.)
 */

import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc, query, where, orderBy } from 'firebase/firestore';
import { db } from '../../../firebase';
import { addSchemaVersion } from '../../../shared/schemas/schemaVersioning';
import { successResponse, errorResponse } from '../../../shared/api/apiResponseStandard';
import { logError, ERROR_CODES, SEVERITY } from '../../../shared/logging/errorLoggingStandard';

const COLLECTION_NAME = 'cleaning_checklists';
const SCHEMA_TYPE = 'CHECKLIST';

/**
 * Get all cleaning checklists for a tenant
 * @param {string} tenantId - The tenant ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getChecklists(tenantId) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }

    const checklistsRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const q = query(checklistsRef, orderBy('name'));
    const snapshot = await getDocs(q);
    
    const checklistsData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return successResponse(checklistsData);
  } catch (error) {
    logError({
      message: 'Failed to load checklists',
      module: 'cleaning',
      feature: 'checklists',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load checklists', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get checklists by service type
 * @param {string} tenantId - The tenant ID
 * @param {string} serviceType - The service type
 * @returns {Promise<object>} - Standardized API response
 */
export async function getChecklistsByServiceType(tenantId, serviceType) {
  try {
    if (!tenantId || !serviceType) {
      return errorResponse('Tenant ID and service type are required', 'VALIDATION_ERROR');
    }

    const checklistsRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const q = query(checklistsRef, where('serviceType', '==', serviceType), orderBy('name'));
    const snapshot = await getDocs(q);
    
    const checklistsData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return successResponse(checklistsData);
  } catch (error) {
    logError({
      message: 'Failed to load checklists by service type',
      module: 'cleaning',
      feature: 'checklists',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load checklists by service type', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get a single checklist by ID
 * @param {string} tenantId - The tenant ID
 * @param {string} checklistId - The checklist ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getChecklistById(tenantId, checklistId) {
  try {
    if (!tenantId || !checklistId) {
      return errorResponse('Tenant ID and Checklist ID are required', 'VALIDATION_ERROR');
    }

    const checklistRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, checklistId);
    const snapshot = await getDoc(checklistRef);
    
    if (!snapshot.exists()) {
      return errorResponse('Checklist not found', ERROR_CODES.NOT_FOUND);
    }

    return successResponse({ id: snapshot.id, ...snapshot.data() });
  } catch (error) {
    logError({
      message: 'Failed to load checklist',
      module: 'cleaning',
      feature: 'checklists',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load checklist', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Create a new checklist
 * @param {string} tenantId - The tenant ID
 * @param {object} checklistData - The checklist data
 * @returns {Promise<object>} - Standardized API response
 */
export async function createChecklist(tenantId, checklistData) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }

    // Add schema version
    const checklistWithVersion = addSchemaVersion(checklistData, SCHEMA_TYPE);

    const checklistsRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const docRef = await addDoc(checklistsRef, {
      ...checklistWithVersion,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: docRef.id, ...checklistWithVersion }, 'Checklist created successfully');
  } catch (error) {
    logError({
      message: 'Failed to create checklist',
      module: 'cleaning',
      feature: 'checklists',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to create checklist', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Update a checklist
 * @param {string} tenantId - The tenant ID
 * @param {string} checklistId - The checklist ID
 * @param {object} checklistData - The updated checklist data
 * @returns {Promise<object>} - Standardized API response
 */
export async function updateChecklist(tenantId, checklistId, checklistData) {
  try {
    if (!tenantId || !checklistId) {
      return errorResponse('Tenant ID and Checklist ID are required', 'VALIDATION_ERROR');
    }

    const checklistRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, checklistId);
    
    // Preserve schema version if it exists
    const existingDoc = await getDoc(checklistRef);
    let checklistWithVersion = checklistData;
    
    if (existingDoc.exists()) {
      const existingData = existingDoc.data();
      checklistWithVersion = {
        ...checklistData,
        schemaVersion: existingData.schemaVersion || 1
      };
    } else {
      checklistWithVersion = addSchemaVersion(checklistData, SCHEMA_TYPE);
    }

    await updateDoc(checklistRef, {
      ...checklistWithVersion,
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: checklistId, ...checklistWithVersion }, 'Checklist updated successfully');
  } catch (error) {
    logError({
      message: 'Failed to update checklist',
      module: 'cleaning',
      feature: 'checklists',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to update checklist', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Delete a checklist
 * @param {string} tenantId - The tenant ID
 * @param {string} checklistId - The checklist ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function deleteChecklist(tenantId, checklistId) {
  try {
    if (!tenantId || !checklistId) {
      return errorResponse('Tenant ID and Checklist ID are required', 'VALIDATION_ERROR');
    }

    const checklistRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, checklistId);
    await deleteDoc(checklistRef);

    return successResponse({ id: checklistId }, 'Checklist deleted successfully');
  } catch (error) {
    logError({
      message: 'Failed to delete checklist',
      module: 'cleaning',
      feature: 'checklists',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to delete checklist', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get default cleaning checklists for new tenants
 * @returns {object[]} - Array of default checklists
 */
export function getDefaultChecklists() {
  return [
    {
      name: 'Standard Clean',
      serviceType: 'standard_clean',
      items: [
        { id: 1, task: 'Dust all surfaces', category: 'general', required: true },
        { id: 2, task: 'Clean mirrors', category: 'bathroom', required: true },
        { id: 3, task: 'Vacuum carpets', category: 'floors', required: true },
        { id: 4, task: 'Mop floors', category: 'floors', required: true },
        { id: 5, task: 'Clean kitchen sink', category: 'kitchen', required: true },
        { id: 6, task: 'Wipe countertops', category: 'kitchen', required: true },
        { id: 7, task: 'Clean bathroom sink', category: 'bathroom', required: true },
        { id: 8, task: 'Clean toilet', category: 'bathroom', required: true },
        { id: 9, task: 'Empty trash', category: 'general', required: true }
      ],
      estimatedTime: 60, // minutes
      basePrice: 100.00
    },
    {
      name: 'Deep Clean',
      serviceType: 'deep_clean',
      items: [
        { id: 1, task: 'Dust all surfaces', category: 'general', required: true },
        { id: 2, task: 'Clean mirrors', category: 'bathroom', required: true },
        { id: 3, task: 'Vacuum carpets', category: 'floors', required: true },
        { id: 4, task: 'Mop floors', category: 'floors', required: true },
        { id: 5, task: 'Clean kitchen sink', category: 'kitchen', required: true },
        { id: 6, task: 'Wipe countertops', category: 'kitchen', required: true },
        { id: 7, task: 'Clean bathroom sink', category: 'bathroom', required: true },
        { id: 8, task: 'Clean toilet', category: 'bathroom', required: true },
        { id: 9, task: 'Empty trash', category: 'general', required: true },
        { id: 10, task: 'Clean inside oven', category: 'kitchen', required: false },
        { id: 11, task: 'Clean inside fridge', category: 'kitchen', required: false },
        { id: 12, task: 'Clean inside cabinets', category: 'kitchen', required: false },
        { id: 13, task: 'Clean baseboards', category: 'detail', required: false },
        { id: 14, task: 'Clean windows', category: 'detail', required: false }
      ],
      estimatedTime: 120,
      basePrice: 200.00
    },
    {
      name: 'Move Out Clean',
      serviceType: 'move_out_clean',
      items: [
        { id: 1, task: 'Dust all surfaces', category: 'general', required: true },
        { id: 2, task: 'Clean mirrors', category: 'bathroom', required: true },
        { id: 3, task: 'Vacuum carpets', category: 'floors', required: true },
        { id: 4, task: 'Mop floors', category: 'floors', required: true },
        { id: 5, task: 'Clean kitchen sink', category: 'kitchen', required: true },
        { id: 6, task: 'Wipe countertops', category: 'kitchen', required: true },
        { id: 7, task: 'Clean bathroom sink', category: 'bathroom', required: true },
        { id: 8, task: 'Clean toilet', category: 'bathroom', required: true },
        { id: 9, task: 'Empty trash', category: 'general', required: true },
        { id: 10, task: 'Clean inside oven', category: 'kitchen', required: true },
        { id: 11, task: 'Clean inside fridge', category: 'kitchen', required: true },
        { id: 12, task: 'Clean inside cabinets', category: 'kitchen', required: true },
        { id: 13, task: 'Clean baseboards', category: 'detail', required: true },
        { id: 14, task: 'Clean windows', category: 'detail', required: true },
        { id: 15, task: 'Clean light fixtures', category: 'detail', required: true },
        { id: 16, task: 'Clean vent covers', category: 'detail', required: true }
      ],
      estimatedTime: 180,
      basePrice: 300.00
    },
    {
      name: 'Post Construction Clean',
      serviceType: 'post_construction_clean',
      items: [
        { id: 1, task: 'Remove construction debris', category: 'debris', required: true },
        { id: 2, task: 'Dust all surfaces', category: 'general', required: true },
        { id: 3, task: 'Clean mirrors', category: 'bathroom', required: true },
        { id: 4, task: 'Vacuum carpets', category: 'floors', required: true },
        { id: 5, task: 'Mop floors', category: 'floors', required: true },
        { id: 6, task: 'Clean windows', category: 'detail', required: true },
        { id: 7, task: 'Clean light fixtures', category: 'detail', required: true },
        { id: 8, task: 'Clean vent covers', category: 'detail', required: true },
        { id: 9, task: 'Remove stickers/labels', category: 'detail', required: true },
        { id: 10, task: 'Clean baseboards', category: 'detail', required: true }
      ],
      estimatedTime: 150,
      basePrice: 250.00
    }
  ];
}
