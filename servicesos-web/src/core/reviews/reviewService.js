/**
 * Core Review Service
 * 
 * This service handles all review-related business logic
 * that is shared across all service verticals.
 * 
 * Core features should never depend on vertical-specific logic.
 */

import { collection, getDocs, addDoc, updateDoc, doc, getDoc, query, where, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { addSchemaVersion } from '../../shared/schemas/schemaVersioning';
import { successResponse, errorResponse } from '../../shared/api/apiResponseStandard';
import { logError, ERROR_CODES, SEVERITY } from '../../shared/logging/errorLoggingStandard';

const COLLECTION_NAME = 'customer_reviews';
const SCHEMA_TYPE = 'REVIEW';

/**
 * Get all reviews for a tenant
 * @param {string} tenantId - The tenant ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getReviews(tenantId) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }

    const reviewsRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const q = query(reviewsRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    
    const reviewsData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return successResponse(reviewsData);
  } catch (error) {
    logError({
      message: 'Failed to load reviews',
      module: 'core',
      feature: 'reviews',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load reviews', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get reviews by customer ID
 * @param {string} tenantId - The tenant ID
 * @param {string} customerId - The customer ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getReviewsByCustomer(tenantId, customerId) {
  try {
    if (!tenantId || !customerId) {
      return errorResponse('Tenant ID and Customer ID are required', 'VALIDATION_ERROR');
    }

    const reviewsRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const q = query(reviewsRef, where('customerId', '==', customerId), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    
    const reviewsData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return successResponse(reviewsData);
  } catch (error) {
    logError({
      message: 'Failed to load reviews by customer',
      module: 'core',
      feature: 'reviews',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load reviews by customer', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get a single review by ID
 * @param {string} tenantId - The tenant ID
 * @param {string} reviewId - The review ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getReviewById(tenantId, reviewId) {
  try {
    if (!tenantId || !reviewId) {
      return errorResponse('Tenant ID and Review ID are required', 'VALIDATION_ERROR');
    }

    const reviewRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, reviewId);
    const snapshot = await getDoc(reviewRef);
    
    if (!snapshot.exists()) {
      return errorResponse('Review not found', ERROR_CODES.NOT_FOUND);
    }

    return successResponse({ id: snapshot.id, ...snapshot.data() });
  } catch (error) {
    logError({
      message: 'Failed to load review',
      module: 'core',
      feature: 'reviews',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load review', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Create a new review
 * @param {string} tenantId - The tenant ID
 * @param {object} reviewData - The review data
 * @returns {Promise<object>} - Standardized API response
 */
export async function createReview(tenantId, reviewData) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }

    // Add schema version
    const reviewWithVersion = addSchemaVersion(reviewData, SCHEMA_TYPE);

    const reviewsRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const docRef = await addDoc(reviewsRef, {
      ...reviewWithVersion,
      status: 'published',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: docRef.id, ...reviewWithVersion }, 'Review created successfully');
  } catch (error) {
    logError({
      message: 'Failed to create review',
      module: 'core',
      feature: 'reviews',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to create review', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Update a review
 * @param {string} tenantId - The tenant ID
 * @param {string} reviewId - The review ID
 * @param {object} reviewData - The updated review data
 * @returns {Promise<object>} - Standardized API response
 */
export async function updateReview(tenantId, reviewId, reviewData) {
  try {
    if (!tenantId || !reviewId) {
      return errorResponse('Tenant ID and Review ID are required', 'VALIDATION_ERROR');
    }

    const reviewRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, reviewId);
    
    // Preserve schema version if it exists
    const existingDoc = await getDoc(reviewRef);
    let reviewWithVersion = reviewData;
    
    if (existingDoc.exists()) {
      const existingData = existingDoc.data();
      reviewWithVersion = {
        ...reviewData,
        schemaVersion: existingData.schemaVersion || 1
      };
    } else {
      reviewWithVersion = addSchemaVersion(reviewData, SCHEMA_TYPE);
    }

    await updateDoc(reviewRef, {
      ...reviewWithVersion,
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: reviewId, ...reviewWithVersion }, 'Review updated successfully');
  } catch (error) {
    logError({
      message: 'Failed to update review',
      module: 'core',
      feature: 'reviews',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to update review', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Request a review from a customer
 * @param {string} tenantId - The tenant ID
 * @param {string} customerId - The customer ID
 * @param {string} jobId - The job ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function requestReview(tenantId, customerId, jobId) {
  try {
    if (!tenantId || !customerId || !jobId) {
      return errorResponse('Tenant ID, Customer ID, and Job ID are required', 'VALIDATION_ERROR');
    }

    const reviewRequestData = {
      customerId,
      jobId,
      status: 'requested',
      requestedAt: new Date().toISOString()
    };

    const reviewWithVersion = addSchemaVersion(reviewRequestData, SCHEMA_TYPE);

    const reviewsRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const docRef = await addDoc(reviewsRef, {
      ...reviewWithVersion,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: docRef.id, ...reviewWithVersion }, 'Review request sent successfully');
  } catch (error) {
    logError({
      message: 'Failed to request review',
      module: 'core',
      feature: 'reviews',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to request review', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get average rating for a tenant
 * @param {string} tenantId - The tenant ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getAverageRating(tenantId) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }

    const reviewsRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const q = query(reviewsRef, where('status', '==', 'published'));
    const snapshot = await getDocs(q);
    
    const reviewsData = snapshot.docs.map(doc => doc.data());
    
    if (reviewsData.length === 0) {
      return successResponse({ average: 0, count: 0 });
    }

    const totalRating = reviewsData.reduce((sum, review) => sum + (review.rating || 0), 0);
    const average = totalRating / reviewsData.length;

    return successResponse({
      average: Math.round(average * 10) / 10, // Round to 1 decimal
      count: reviewsData.length
    });
  } catch (error) {
    logError({
      message: 'Failed to calculate average rating',
      module: 'core',
      feature: 'reviews',
      severity: SEVERITY.MEDIUM,
      tenantId,
      error
    });
    return errorResponse('Failed to calculate average rating', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}
