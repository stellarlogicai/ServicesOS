/**
 * Error Logging Standard
 * 
 * Rules from FutureProofing.md:
 * - Every error should include: timestamp, tenantId, userId, module, feature, severity, message, stack
 * - Structured logging enables better debugging and analytics
 * - Future dashboard can show top errors by module/feature
 */

/**
 * Log an error with standard format
 * @param {object} errorInfo - Error information
 * @param {string} errorInfo.message - Error message
 * @param {string} errorInfo.module - Module name (e.g., 'cleaning', 'core')
 * @param {string} errorInfo.feature - Feature name (e.g., 'estimate', 'scheduling')
 * @param {string} errorInfo.severity - Error severity ('critical', 'high', 'medium', 'low')
 * @param {string} errorInfo.tenantId - Tenant ID if available
 * @param {string} errorInfo.userId - User ID if available
 * @param {Error} errorInfo.error - Original error object
 */
export function logError(errorInfo) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    tenantId: errorInfo.tenantId || null,
    userId: errorInfo.userId || null,
    module: errorInfo.module || 'unknown',
    feature: errorInfo.feature || 'unknown',
    severity: errorInfo.severity || 'medium',
    message: errorInfo.message || 'Unknown error',
    stack: errorInfo.error?.stack || null,
    code: errorInfo.error?.code || null
  };

  // In development, log to console
  if (import.meta.env?.MODE === 'development' || !import.meta.env?.PROD) {
    console.error('[Error Log]', logEntry);
  }

  // In production, send to logging service
  // TODO: Integrate with error tracking service (e.g., Sentry, Firebase Crashlytics)
  if (import.meta.env?.PROD) {
    sendToLoggingService(logEntry);
  }

  return logEntry;
}

/**
 * Send error to logging service
 * @param {object} logEntry - Standardized log entry
 */
async function sendToLoggingService(logEntry) {
  try {
    // TODO: Implement actual logging service integration
    // This could be Firebase Crashlytics, Sentry, or custom solution
    console.log('Sending to logging service:', logEntry);
  } catch (error) {
    console.error('Failed to send error to logging service:', error);
  }
}

/**
 * Create a standardized error object
 * @param {string} message - Error message
 * @param {string} code - Error code
 * @param {object} details - Additional error details
 */
export function createError(message, code = 'UNKNOWN_ERROR', details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

/**
 * Error severity levels
 */
export const SEVERITY = {
  CRITICAL: 'critical', // Blocks business operation or risks data
  HIGH: 'high', // Major workflow problem but workaround exists
  MEDIUM: 'medium', // Annoying or confusing but not business-breaking
  LOW: 'low' // Polish issue
};

/**
 * Common error codes
 */
export const ERROR_CODES = {
  // Authentication
  AUTH_FAILED: 'AUTH_FAILED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  
  // Data
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  CONFLICT_ERROR: 'CONFLICT_ERROR',
  
  // External services
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  FIRESTORE_ERROR: 'FIRESTORE_ERROR',
  STRIPE_ERROR: 'STRIPE_ERROR',
  
  // Business logic
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  INSUFFICIENT_CREDITS: 'INSUFFICIENT_CREDITS',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  
  // System
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR'
};
