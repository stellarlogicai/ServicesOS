/**
 * Core Photo Service
 * 
 * This service handles all photo-related business logic
 * that is shared across all service verticals.
 * 
 * Core features should never depend on vertical-specific logic.
 */

import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc, query, where, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { addSchemaVersion } from '../../shared/schemas/schemaVersioning';
import { successResponse, errorResponse } from '../../shared/api/apiResponseStandard';
import { logError, ERROR_CODES, SEVERITY } from '../../shared/logging/errorLoggingStandard';

const COLLECTION_NAME = 'photos';
const SCHEMA_TYPE = 'PHOTO';

/**
 * Get all photos for a tenant
 * @param {string} tenantId - The tenant ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getPhotos(tenantId) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }

    const photosRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const q = query(photosRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    
    const photosData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return successResponse(photosData);
  } catch (error) {
    logError({
      message: 'Failed to load photos',
      module: 'core',
      feature: 'photos',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load photos', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get photos by job ID
 * @param {string} tenantId - The tenant ID
 * @param {string} jobId - The job ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getPhotosByJob(tenantId, jobId) {
  try {
    if (!tenantId || !jobId) {
      return errorResponse('Tenant ID and Job ID are required', 'VALIDATION_ERROR');
    }

    const photosRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const q = query(photosRef, where('jobId', '==', jobId), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    
    const photosData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return successResponse(photosData);
  } catch (error) {
    logError({
      message: 'Failed to load photos by job',
      module: 'core',
      feature: 'photos',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load photos by job', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get a single photo by ID
 * @param {string} tenantId - The tenant ID
 * @param {string} photoId - The photo ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getPhotoById(tenantId, photoId) {
  try {
    if (!tenantId || !photoId) {
      return errorResponse('Tenant ID and Photo ID are required', 'VALIDATION_ERROR');
    }

    const photoRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, photoId);
    const snapshot = await getDoc(photoRef);
    
    if (!snapshot.exists()) {
      return errorResponse('Photo not found', ERROR_CODES.NOT_FOUND);
    }

    return successResponse({ id: snapshot.id, ...snapshot.data() });
  } catch (error) {
    logError({
      message: 'Failed to load photo',
      module: 'core',
      feature: 'photos',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load photo', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Create a new photo record
 * @param {string} tenantId - The tenant ID
 * @param {object} photoData - The photo data
 * @returns {Promise<object>} - Standardized API response
 */
export async function createPhoto(tenantId, photoData) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }

    // Add schema version
    const photoWithVersion = addSchemaVersion(photoData, SCHEMA_TYPE);

    const photosRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const docRef = await addDoc(photosRef, {
      ...photoWithVersion,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: docRef.id, ...photoWithVersion }, 'Photo created successfully');
  } catch (error) {
    logError({
      message: 'Failed to create photo',
      module: 'core',
      feature: 'photos',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to create photo', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Update photo metadata
 * @param {string} tenantId - The tenant ID
 * @param {string} photoId - The photo ID
 * @param {object} photoData - The updated photo data
 * @returns {Promise<object>} - Standardized API response
 */
export async function updatePhoto(tenantId, photoId, photoData) {
  try {
    if (!tenantId || !photoId) {
      return errorResponse('Tenant ID and Photo ID are required', 'VALIDATION_ERROR');
    }

    const photoRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, photoId);
    
    // Preserve schema version if it exists
    const existingDoc = await getDoc(photoRef);
    let photoWithVersion = photoData;
    
    if (existingDoc.exists()) {
      const existingData = existingDoc.data();
      photoWithVersion = {
        ...photoData,
        schemaVersion: existingData.schemaVersion || 1
      };
    } else {
      photoWithVersion = addSchemaVersion(photoData, SCHEMA_TYPE);
    }

    await updateDoc(photoRef, {
      ...photoWithVersion,
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: photoId, ...photoWithVersion }, 'Photo updated successfully');
  } catch (error) {
    logError({
      message: 'Failed to update photo',
      module: 'core',
      feature: 'photos',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to update photo', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Delete a photo
 * @param {string} tenantId - The tenant ID
 * @param {string} photoId - The photo ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function deletePhoto(tenantId, photoId) {
  try {
    if (!tenantId || !photoId) {
      return errorResponse('Tenant ID and Photo ID are required', 'VALIDATION_ERROR');
    }

    const photoRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, photoId);
    await deleteDoc(photoRef);

    return successResponse({ id: photoId }, 'Photo deleted successfully');
  } catch (error) {
    logError({
      message: 'Failed to delete photo',
      module: 'core',
      feature: 'photos',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to delete photo', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get before/after photos for a job
 * @param {string} tenantId - The tenant ID
 * @param {string} jobId - The job ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getBeforeAfterPhotos(tenantId, jobId) {
  try {
    if (!tenantId || !jobId) {
      return errorResponse('Tenant ID and Job ID are required', 'VALIDATION_ERROR');
    }

    const photosRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const q = query(photosRef, where('jobId', '==', jobId), orderBy('photoType'), orderBy('createdAt'));
    const snapshot = await getDocs(q);
    
    const photosData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return successResponse(photosData);
  } catch (error) {
    logError({
      message: 'Failed to load before/after photos',
      module: 'core',
      feature: 'photos',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load before/after photos', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}
