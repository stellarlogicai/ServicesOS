/**
 * Cleaning Module - Services Service
 * 
 * This service handles cleaning-specific service types
 * that are unique to the cleaning vertical.
 * 
 * Service types define the different cleaning services offered
 * (standard clean, deep clean, move-out clean, etc.)
 */

import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc, query, where, orderBy } from 'firebase/firestore';
import { db } from '../../../firebase';
import { addSchemaVersion } from '../../../shared/schemas/schemaVersioning';
import { successResponse, errorResponse } from '../../../shared/api/apiResponseStandard';
import { logError, ERROR_CODES, SEVERITY } from '../../../shared/logging/errorLoggingStandard';

const COLLECTION_NAME = 'cleaning_services';
const SCHEMA_TYPE = 'CLEANING_SERVICE';

/**
 * Get all cleaning services for a tenant
 * @param {string} tenantId - The tenant ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getCleaningServices(tenantId) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }

    const servicesRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const q = query(servicesRef, orderBy('name'));
    const snapshot = await getDocs(q);
    
    const servicesData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return successResponse(servicesData);
  } catch (error) {
    logError({
      message: 'Failed to load cleaning services',
      module: 'cleaning',
      feature: 'services',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load cleaning services', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get active cleaning services
 * @param {string} tenantId - The tenant ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getActiveCleaningServices(tenantId) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }

    const servicesRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const q = query(servicesRef, where('active', '==', true), orderBy('name'));
    const snapshot = await getDocs(q);
    
    const servicesData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return successResponse(servicesData);
  } catch (error) {
    logError({
      message: 'Failed to load active cleaning services',
      module: 'cleaning',
      feature: 'services',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load active cleaning services', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get a single cleaning service by ID
 * @param {string} tenantId - The tenant ID
 * @param {string} serviceId - The service ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getCleaningServiceById(tenantId, serviceId) {
  try {
    if (!tenantId || !serviceId) {
      return errorResponse('Tenant ID and Service ID are required', 'VALIDATION_ERROR');
    }

    const serviceRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, serviceId);
    const snapshot = await getDoc(serviceRef);
    
    if (!snapshot.exists()) {
      return errorResponse('Cleaning service not found', ERROR_CODES.NOT_FOUND);
    }

    return successResponse({ id: snapshot.id, ...snapshot.data() });
  } catch (error) {
    logError({
      message: 'Failed to load cleaning service',
      module: 'cleaning',
      feature: 'services',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load cleaning service', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Create a new cleaning service
 * @param {string} tenantId - The tenant ID
 * @param {object} serviceData - The service data
 * @returns {Promise<object>} - Standardized API response
 */
export async function createCleaningService(tenantId, serviceData) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }

    // Add schema version
    const serviceWithVersion = addSchemaVersion(serviceData, SCHEMA_TYPE);

    const servicesRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const docRef = await addDoc(servicesRef, {
      ...serviceWithVersion,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: docRef.id, ...serviceWithVersion }, 'Cleaning service created successfully');
  } catch (error) {
    logError({
      message: 'Failed to create cleaning service',
      module: 'cleaning',
      feature: 'services',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to create cleaning service', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Update a cleaning service
 * @param {string} tenantId - The tenant ID
 * @param {string} serviceId - The service ID
 * @param {object} serviceData - The updated service data
 * @returns {Promise<object>} - Standardized API response
 */
export async function updateCleaningService(tenantId, serviceId, serviceData) {
  try {
    if (!tenantId || !serviceId) {
      return errorResponse('Tenant ID and Service ID are required', 'VALIDATION_ERROR');
    }

    const serviceRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, serviceId);
    
    // Preserve schema version if it exists
    const existingDoc = await getDoc(serviceRef);
    let serviceWithVersion = serviceData;
    
    if (existingDoc.exists()) {
      const existingData = existingDoc.data();
      serviceWithVersion = {
        ...serviceData,
        schemaVersion: existingData.schemaVersion || 1
      };
    } else {
      serviceWithVersion = addSchemaVersion(serviceData, SCHEMA_TYPE);
    }

    await updateDoc(serviceRef, {
      ...serviceWithVersion,
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: serviceId, ...serviceWithVersion }, 'Cleaning service updated successfully');
  } catch (error) {
    logError({
      message: 'Failed to update cleaning service',
      module: 'cleaning',
      feature: 'services',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to update cleaning service', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Activate a cleaning service
 * @param {string} tenantId - The tenant ID
 * @param {string} serviceId - The service ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function activateCleaningService(tenantId, serviceId) {
  try {
    if (!tenantId || !serviceId) {
      return errorResponse('Tenant ID and Service ID are required', 'VALIDATION_ERROR');
    }

    const serviceRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, serviceId);
    await updateDoc(serviceRef, {
      active: true,
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: serviceId, active: true }, 'Cleaning service activated');
  } catch (error) {
    logError({
      message: 'Failed to activate cleaning service',
      module: 'cleaning',
      feature: 'services',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to activate cleaning service', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Deactivate a cleaning service
 * @param {string} tenantId - The tenant ID
 * @param {string} serviceId - The service ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function deactivateCleaningService(tenantId, serviceId) {
  try {
    if (!tenantId || !serviceId) {
      return errorResponse('Tenant ID and Service ID are required', 'VALIDATION_ERROR');
    }

    const serviceRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, serviceId);
    await updateDoc(serviceRef, {
      active: false,
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: serviceId, active: false }, 'Cleaning service deactivated');
  } catch (error) {
    logError({
      message: 'Failed to deactivate cleaning service',
      module: 'cleaning',
      feature: 'services',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to deactivate cleaning service', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Delete a cleaning service
 * @param {string} tenantId - The tenant ID
 * @param {string} serviceId - The service ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function deleteCleaningService(tenantId, serviceId) {
  try {
    if (!tenantId || !serviceId) {
      return errorResponse('Tenant ID and Service ID are required', 'VALIDATION_ERROR');
    }

    const serviceRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, serviceId);
    await deleteDoc(serviceRef);

    return successResponse({ id: serviceId }, 'Cleaning service deleted successfully');
  } catch (error) {
    logError({
      message: 'Failed to delete cleaning service',
      module: 'cleaning',
      feature: 'services',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to delete cleaning service', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get default cleaning services for new tenants
 * @returns {object[]} - Array of default cleaning services
 */
export function getDefaultCleaningServices() {
  return [
    {
      name: 'Standard Clean',
      code: 'standard_clean',
      description: 'Regular cleaning service for maintenance',
      basePrice: 100.00,
      baseTime: 60, // minutes
      includes: [
        'Dust all surfaces',
        'Clean mirrors',
        'Vacuum carpets',
        'Mop floors',
        'Clean kitchen sink',
        'Wipe countertops',
        'Clean bathroom sink',
        'Clean toilet',
        'Empty trash'
      ],
      active: true
    },
    {
      name: 'Deep Clean',
      code: 'deep_clean',
      description: 'Thorough cleaning service for neglected areas',
      basePrice: 200.00,
      baseTime: 120,
      includes: [
        'All standard clean tasks',
        'Clean inside oven',
        'Clean inside fridge',
        'Clean inside cabinets',
        'Clean baseboards',
        'Clean windows'
      ],
      active: true
    },
    {
      name: 'Move Out Clean',
      code: 'move_out_clean',
      description: 'Comprehensive cleaning for move-out situations',
      basePrice: 300.00,
      baseTime: 180,
      includes: [
        'All deep clean tasks',
        'Clean light fixtures',
        'Clean vent covers',
        'Remove stickers/labels'
      ],
      active: true
    },
    {
      name: 'Post Construction Clean',
      code: 'post_construction_clean',
      description: 'Specialized cleaning after construction work',
      basePrice: 250.00,
      baseTime: 150,
      includes: [
        'Remove construction debris',
        'Dust all surfaces',
        'Clean mirrors',
        'Vacuum carpets',
        'Mop floors',
        'Clean windows',
        'Clean light fixtures',
        'Clean vent covers',
        'Remove stickers/labels',
        'Clean baseboards'
      ],
      active: true
    },
    {
      name: 'Office Cleaning',
      code: 'office_clean',
      description: 'Regular cleaning for office spaces',
      basePrice: 150.00,
      baseTime: 90,
      includes: [
        'Dust all surfaces',
        'Clean mirrors',
        'Vacuum carpets',
        'Mop floors',
        'Empty trash',
        'Clean break area',
        'Clean restrooms'
      ],
      active: true
    },
    {
      name: 'Airbnb/VRBO Clean',
      code: 'short_term_rental_clean',
      description: 'Quick turnover cleaning for short-term rentals',
      basePrice: 120.00,
      baseTime: 75,
      includes: [
        'Change linens',
        'Dust all surfaces',
        'Clean mirrors',
        'Vacuum carpets',
        'Mop floors',
        'Clean kitchen',
        'Clean bathroom',
        'Empty trash',
        'Restock supplies'
      ],
      active: true
    }
  ];
}
