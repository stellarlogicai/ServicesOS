/**
 * API Response Standard
 * 
 * Rules from FutureProofing.md:
 * - Every backend call should return consistent format
 * - Standard format: { success, data, message, error }
 * - Benefits: Predictable, easier UI, easier logging, easier debugging
 */

/**
 * Create a successful API response
 * @param {*} data - The response data
 * @param {string} message - Optional success message
 * @returns {object} - Standardized success response
 */
export function successResponse(data, message = '') {
  return {
    success: true,
    data,
    message,
    error: null
  };
}

/**
 * Create a failed API response
 * @param {string} message - Error message
 * @param {string} errorCode - Specific error code
 * @param {*} errorDetails - Additional error details
 * @returns {object} - Standardized error response
 */
export function errorResponse(message, errorCode = 'UNKNOWN_ERROR', errorDetails = null) {
  return {
    success: false,
    data: null,
    message,
    error: errorCode,
    errorDetails
  };
}

/**
 * Wrap an async function to return standardized responses
 * @param {Function} fn - Async function to wrap
 * @returns {Function} - Wrapped function with standardized error handling
 */
export function withStandardResponse(fn) {
  return async (...args) => {
    try {
      const result = await fn(...args);
      return successResponse(result);
    } catch (error) {
      return errorResponse(
        error.message || 'An error occurred',
        error.code || 'UNKNOWN_ERROR',
        error
      );
    }
  };
}

/**
 * Common error codes
 */
export const ERROR_CODES = {
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  TENANT_NOT_FOUND: 'TENANT_NOT_FOUND',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  STRIPE_ERROR: 'STRIPE_ERROR',
  FIRESTORE_ERROR: 'FIRESTORE_ERROR',
  AUTH_ERROR: 'AUTH_ERROR'
};
