/**
 * Cleaning Module - Pet Profiles Service
 * 
 * This service handles cleaning-specific pet profiles
 * that are unique to the cleaning vertical.
 * 
 * Pet profiles track customer pets for cleaning considerations
 * (allergies, special handling, etc.)
 */

import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc, query, where, orderBy } from 'firebase/firestore';
import { db } from '../../../firebase';
import { addSchemaVersion } from '../../../shared/schemas/schemaVersioning';
import { successResponse, errorResponse } from '../../../shared/api/apiResponseStandard';
import { logError, ERROR_CODES, SEVERITY } from '../../../shared/logging/errorLoggingStandard';

const COLLECTION_NAME = 'pet_profiles';
const SCHEMA_TYPE = 'PET_PROFILE';

/**
 * Get all pet profiles for a tenant
 * @param {string} tenantId - The tenant ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getPetProfiles(tenantId) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }

    const profilesRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const q = query(profilesRef, orderBy('name'));
    const snapshot = await getDocs(q);
    
    const profilesData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return successResponse(profilesData);
  } catch (error) {
    logError({
      message: 'Failed to load pet profiles',
      module: 'cleaning',
      feature: 'petProfiles',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load pet profiles', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get pet profiles by customer ID
 * @param {string} tenantId - The tenant ID
 * @param {string} customerId - The customer ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getPetProfilesByCustomer(tenantId, customerId) {
  try {
    if (!tenantId || !customerId) {
      return errorResponse('Tenant ID and Customer ID are required', 'VALIDATION_ERROR');
    }

    const profilesRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const q = query(profilesRef, where('customerId', '==', customerId), orderBy('name'));
    const snapshot = await getDocs(q);
    
    const profilesData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return successResponse(profilesData);
  } catch (error) {
    logError({
      message: 'Failed to load pet profiles by customer',
      module: 'cleaning',
      feature: 'petProfiles',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load pet profiles by customer', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get a single pet profile by ID
 * @param {string} tenantId - The tenant ID
 * @param {string} profileId - The profile ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getPetProfileById(tenantId, profileId) {
  try {
    if (!tenantId || !profileId) {
      return errorResponse('Tenant ID and Profile ID are required', 'VALIDATION_ERROR');
    }

    const profileRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, profileId);
    const snapshot = await getDoc(profileRef);
    
    if (!snapshot.exists()) {
      return errorResponse('Pet profile not found', ERROR_CODES.NOT_FOUND);
    }

    return successResponse({ id: snapshot.id, ...snapshot.data() });
  } catch (error) {
    logError({
      message: 'Failed to load pet profile',
      module: 'cleaning',
      feature: 'petProfiles',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load pet profile', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Create a new pet profile
 * @param {string} tenantId - The tenant ID
 * @param {object} profileData - The profile data
 * @returns {Promise<object>} - Standardized API response
 */
export async function createPetProfile(tenantId, profileData) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }

    // Add schema version
    const profileWithVersion = addSchemaVersion(profileData, SCHEMA_TYPE);

    const profilesRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const docRef = await addDoc(profilesRef, {
      ...profileWithVersion,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: docRef.id, ...profileWithVersion }, 'Pet profile created successfully');
  } catch (error) {
    logError({
      message: 'Failed to create pet profile',
      module: 'cleaning',
      feature: 'petProfiles',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to create pet profile', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Update a pet profile
 * @param {string} tenantId - The tenant ID
 * @param {string} profileId - The profile ID
 * @param {object} profileData - The updated profile data
 * @returns {Promise<object>} - Standardized API response
 */
export async function updatePetProfile(tenantId, profileId, profileData) {
  try {
    if (!tenantId || !profileId) {
      return errorResponse('Tenant ID and Profile ID are required', 'VALIDATION_ERROR');
    }

    const profileRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, profileId);
    
    // Preserve schema version if it exists
    const existingDoc = await getDoc(profileRef);
    let profileWithVersion = profileData;
    
    if (existingDoc.exists()) {
      const existingData = existingDoc.data();
      profileWithVersion = {
        ...profileData,
        schemaVersion: existingData.schemaVersion || 1
      };
    } else {
      profileWithVersion = addSchemaVersion(profileData, SCHEMA_TYPE);
    }

    await updateDoc(profileRef, {
      ...profileWithVersion,
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: profileId, ...profileWithVersion }, 'Pet profile updated successfully');
  } catch (error) {
    logError({
      message: 'Failed to update pet profile',
      module: 'cleaning',
      feature: 'petProfiles',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to update pet profile', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Delete a pet profile
 * @param {string} tenantId - The tenant ID
 * @param {string} profileId - The profile ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function deletePetProfile(tenantId, profileId) {
  try {
    if (!tenantId || !profileId) {
      return errorResponse('Tenant ID and Profile ID are required', 'VALIDATION_ERROR');
    }

    const profileRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, profileId);
    await deleteDoc(profileRef);

    return successResponse({ id: profileId }, 'Pet profile deleted successfully');
  } catch (error) {
    logError({
      message: 'Failed to delete pet profile',
      module: 'cleaning',
      feature: 'petProfiles',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to delete pet profile', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get pet considerations for cleaning
 * @param {string} tenantId - The tenant ID
 * @param {string} customerId - The customer ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getPetConsiderations(tenantId, customerId) {
  try {
    if (!tenantId || !customerId) {
      return errorResponse('Tenant ID and Customer ID are required', 'VALIDATION_ERROR');
    }

    const result = await getPetProfilesByCustomer(tenantId, customerId);
    
    if (!result.success) {
      return result;
    }

    const considerations = {
      hasPets: result.data.length > 0,
      petCount: result.data.length,
      petTypes: result.data.map(p => p.type),
      specialInstructions: result.data
        .filter(p => p.specialInstructions)
        .map(p => `${p.name}: ${p.specialInstructions}`),
      allergenWarnings: result.data
        .filter(p => p.allergies)
        .map(p => `${p.name}: ${p.allergies}`),
      confinementNeeded: result.data.some(p => p.needsConfinement),
      additionalTime: result.data.reduce((total, p) => total + (p.additionalTime || 0), 0)
    };

    return successResponse(considerations);
  } catch (error) {
    logError({
      message: 'Failed to get pet considerations',
      module: 'cleaning',
      feature: 'petProfiles',
      severity: SEVERITY.MEDIUM,
      tenantId,
      error
    });
    return errorResponse('Failed to get pet considerations', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}
