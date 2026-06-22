/**
 * Core Permission Service
 * 
 * This service handles all permission-related business logic
 * that is shared across all service verticals.
 * 
 * Core features should never depend on vertical-specific logic.
 */

import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { successResponse, errorResponse } from '../../shared/api/apiResponseStandard';
import { logError, ERROR_CODES, SEVERITY } from '../../shared/logging/errorLoggingStandard';

/**
 * User roles and their permissions
 */
export const ROLES = {
  SUPER_ADMIN: 'super-admin',
  ADMIN: 'admin',
  EMPLOYEE: 'employee',
  CUSTOMER: 'customer'
};

/**
 * Role permissions
 */
export const ROLE_PERMISSIONS = {
  [ROLES.SUPER_ADMIN]: {
    canManageTenants: true,
    canManageUsers: true,
    canManageBilling: true,
    canViewAllData: true,
    canManageSettings: true
  },
  [ROLES.ADMIN]: {
    canManageTenants: false,
    canManageUsers: true,
    canManageBilling: true,
    canViewAllData: true,
    canManageSettings: true
  },
  [ROLES.EMPLOYEE]: {
    canManageTenants: false,
    canManageUsers: false,
    canManageBilling: false,
    canViewAllData: false,
    canManageSettings: false,
    canViewOwnJobs: true,
    canClockIn: true,
    canClockOut: true,
    canUploadPhotos: true,
    canCompleteJobs: true
  },
  [ROLES.CUSTOMER]: {
    canManageTenants: false,
    canManageUsers: false,
    canManageBilling: false,
    canViewAllData: false,
    canManageSettings: false,
    canViewOwnJobs: true,
    canViewOwnEstimates: true,
    canViewOwnInvoices: true,
    canRequestServices: true
  }
};

/**
 * Get user permissions
 * @param {string} userId - The user ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getUserPermissions(userId) {
  try {
    if (!userId) {
      return errorResponse('User ID is required', 'VALIDATION_ERROR');
    }

    const userRef = doc(db, 'users', userId);
    const snapshot = await getDoc(userRef);
    
    if (!snapshot.exists()) {
      return errorResponse('User not found', ERROR_CODES.NOT_FOUND);
    }

    const userData = snapshot.data();
    const role = userData.role || ROLES.CUSTOMER;
    const permissions = ROLE_PERMISSIONS[role] || {};

    return successResponse({
      userId,
      role,
      permissions,
      tenantId: userData.tenantId
    });
  } catch (error) {
    logError({
      message: 'Failed to get user permissions',
      module: 'core',
      feature: 'permissions',
      severity: SEVERITY.HIGH,
      error
    });
    return errorResponse('Failed to get user permissions', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Check if user has specific permission
 * @param {string} userId - The user ID
 * @param {string} permission - The permission to check
 * @returns {Promise<object>} - Standardized API response
 */
export async function hasPermission(userId, permission) {
  try {
    if (!userId || !permission) {
      return errorResponse('User ID and permission are required', 'VALIDATION_ERROR');
    }

    const result = await getUserPermissions(userId);
    
    if (!result.success) {
      return result;
    }

    const hasPermission = result.data.permissions[permission] === true;

    return successResponse({
      userId,
      permission,
      hasPermission
    });
  } catch (error) {
    logError({
      message: 'Failed to check permission',
      module: 'core',
      feature: 'permissions',
      severity: SEVERITY.MEDIUM,
      error
    });
    return errorResponse('Failed to check permission', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Update user role
 * @param {string} userId - The user ID
 * @param {string} newRole - The new role
 * @returns {Promise<object>} - Standardized API response
 */
export async function updateUserRole(userId, newRole) {
  try {
    if (!userId || !newRole) {
      return errorResponse('User ID and new role are required', 'VALIDATION_ERROR');
    }

    if (!Object.values(ROLES).includes(newRole)) {
      return errorResponse('Invalid role', 'VALIDATION_ERROR');
    }

    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      role: newRole,
      updatedAt: new Date().toISOString()
    });

    return successResponse({ userId, role: newRole }, 'User role updated successfully');
  } catch (error) {
    logError({
      message: 'Failed to update user role',
      module: 'core',
      feature: 'permissions',
      severity: SEVERITY.HIGH,
      error
    });
    return errorResponse('Failed to update user role', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Check if user is super admin
 * @param {string} userId - The user ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function isSuperAdmin(userId) {
  try {
    if (!userId) {
      return errorResponse('User ID is required', 'VALIDATION_ERROR');
    }

    const result = await getUserPermissions(userId);
    
    if (!result.success) {
      return result;
    }

    const isSuperAdmin = result.data.role === ROLES.SUPER_ADMIN;

    return successResponse({
      userId,
      isSuperAdmin
    });
  } catch (error) {
    logError({
      message: 'Failed to check super admin status',
      module: 'core',
      feature: 'permissions',
      severity: SEVERITY.MEDIUM,
      error
    });
    return errorResponse('Failed to check super admin status', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Check if user is tenant admin
 * @param {string} userId - The user ID
 * @param {string} tenantId - The tenant ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function isTenantAdmin(userId, tenantId) {
  try {
    if (!userId || !tenantId) {
      return errorResponse('User ID and Tenant ID are required', 'VALIDATION_ERROR');
    }

    const result = await getUserPermissions(userId);
    
    if (!result.success) {
      return result;
    }

    const isTenantAdmin = 
      (result.data.role === ROLES.ADMIN || result.data.role === ROLES.SUPER_ADMIN) &&
      result.data.tenantId === tenantId;

    return successResponse({
      userId,
      tenantId,
      isTenantAdmin
    });
  } catch (error) {
    logError({
      message: 'Failed to check tenant admin status',
      module: 'core',
      feature: 'permissions',
      severity: SEVERITY.MEDIUM,
      error
    });
    return errorResponse('Failed to check tenant admin status', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Check if user has tenant access
 * @param {string} userId - The user ID
 * @param {string} tenantId - The tenant ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function hasTenantAccess(userId, tenantId) {
  try {
    if (!userId || !tenantId) {
      return errorResponse('User ID and Tenant ID are required', 'VALIDATION_ERROR');
    }

    const result = await getUserPermissions(userId);
    
    if (!result.success) {
      return result;
    }

    const hasAccess = 
      result.data.role === ROLES.SUPER_ADMIN ||
      result.data.tenantId === tenantId;

    return successResponse({
      userId,
      tenantId,
      hasAccess
    });
  } catch (error) {
    logError({
      message: 'Failed to check tenant access',
      module: 'core',
      feature: 'permissions',
      severity: SEVERITY.MEDIUM,
      error
    });
    return errorResponse('Failed to check tenant access', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}
