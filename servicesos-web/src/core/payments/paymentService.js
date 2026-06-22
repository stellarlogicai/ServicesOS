/**
 * Core Payment Service
 * 
 * This service handles all payment-related business logic
 * that is shared across all service verticals.
 * 
 * Core features should never depend on vertical-specific logic.
 */

import { collection, getDocs, addDoc, updateDoc, doc, getDoc, query, where, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { addSchemaVersion } from '../../shared/schemas/schemaVersioning';
import { successResponse, errorResponse } from '../../shared/api/apiResponseStandard';
import { logError, ERROR_CODES, SEVERITY } from '../../shared/logging/errorLoggingStandard';

const COLLECTION_NAME = 'payments';
const SCHEMA_TYPE = 'PAYMENT';

/**
 * Get all payments for a tenant
 * @param {string} tenantId - The tenant ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getPayments(tenantId) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }

    const paymentsRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const q = query(paymentsRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    
    const paymentsData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return successResponse(paymentsData);
  } catch (error) {
    logError({
      message: 'Failed to load payments',
      module: 'core',
      feature: 'payments',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load payments', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get payments by status
 * @param {string} tenantId - The tenant ID
 * @param {string} status - The payment status
 * @returns {Promise<object>} - Standardized API response
 */
export async function getPaymentsByStatus(tenantId, status) {
  try {
    if (!tenantId || !status) {
      return errorResponse('Tenant ID and status are required', 'VALIDATION_ERROR');
    }

    const paymentsRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const q = query(paymentsRef, where('status', '==', status), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    
    const paymentsData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return successResponse(paymentsData);
  } catch (error) {
    logError({
      message: 'Failed to load payments by status',
      module: 'core',
      feature: 'payments',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load payments by status', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get a single payment by ID
 * @param {string} tenantId - The tenant ID
 * @param {string} paymentId - The payment ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getPaymentById(tenantId, paymentId) {
  try {
    if (!tenantId || !paymentId) {
      return errorResponse('Tenant ID and Payment ID are required', 'VALIDATION_ERROR');
    }

    const paymentRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, paymentId);
    const snapshot = await getDoc(paymentRef);
    
    if (!snapshot.exists()) {
      return errorResponse('Payment not found', ERROR_CODES.NOT_FOUND);
    }

    return successResponse({ id: snapshot.id, ...snapshot.data() });
  } catch (error) {
    logError({
      message: 'Failed to load payment',
      module: 'core',
      feature: 'payments',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load payment', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Create a new payment record
 * @param {string} tenantId - The tenant ID
 * @param {object} paymentData - The payment data
 * @returns {Promise<object>} - Standardized API response
 */
export async function createPayment(tenantId, paymentData) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }

    // Add schema version
    const paymentWithVersion = addSchemaVersion(paymentData, SCHEMA_TYPE);

    const paymentsRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const docRef = await addDoc(paymentsRef, {
      ...paymentWithVersion,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: docRef.id, ...paymentWithVersion }, 'Payment record created successfully');
  } catch (error) {
    logError({
      message: 'Failed to create payment record',
      module: 'core',
      feature: 'payments',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to create payment record', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Update payment status
 * @param {string} tenantId - The tenant ID
 * @param {string} paymentId - The payment ID
 * @param {string} status - The new status
 * @returns {Promise<object>} - Standardized API response
 */
export async function updatePaymentStatus(tenantId, paymentId, status) {
  try {
    if (!tenantId || !paymentId || !status) {
      return errorResponse('Tenant ID, Payment ID, and status are required', 'VALIDATION_ERROR');
    }

    const paymentRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, paymentId);
    await updateDoc(paymentRef, {
      status,
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: paymentId, status }, 'Payment status updated successfully');
  } catch (error) {
    logError({
      message: 'Failed to update payment status',
      module: 'core',
      feature: 'payments',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to update payment status', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Record successful payment
 * @param {string} tenantId - The tenant ID
 * @param {string} paymentId - The payment ID
 * @param {object} paymentDetails - Payment details from Stripe
 * @returns {Promise<object>} - Standardized API response
 */
export async function recordSuccessfulPayment(tenantId, paymentId, paymentDetails) {
  try {
    if (!tenantId || !paymentId) {
      return errorResponse('Tenant ID and Payment ID are required', 'VALIDATION_ERROR');
    }

    const paymentRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, paymentId);
    await updateDoc(paymentRef, {
      status: 'completed',
      paymentDetails,
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: paymentId, status: 'completed' }, 'Payment recorded successfully');
  } catch (error) {
    logError({
      message: 'Failed to record successful payment',
      module: 'core',
      feature: 'payments',
      severity: SEVERITY.CRITICAL,
      tenantId,
      error
    });
    return errorResponse('Failed to record successful payment', ERROR_CODES.PAYMENT_FAILED, error);
  }
}

/**
 * Record failed payment
 * @param {string} tenantId - The tenant ID
 * @param {string} paymentId - The payment ID
 * @param {string} failureReason - Reason for failure
 * @returns {Promise<object>} - Standardized API response
 */
export async function recordFailedPayment(tenantId, paymentId, failureReason) {
  try {
    if (!tenantId || !paymentId) {
      return errorResponse('Tenant ID and Payment ID are required', 'VALIDATION_ERROR');
    }

    const paymentRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, paymentId);
    await updateDoc(paymentRef, {
      status: 'failed',
      failureReason,
      failedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: paymentId, status: 'failed' }, 'Payment failure recorded');
  } catch (error) {
    logError({
      message: 'Failed to record payment failure',
      module: 'core',
      feature: 'payments',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to record payment failure', ERROR_CODES.PAYMENT_FAILED, error);
  }
}
