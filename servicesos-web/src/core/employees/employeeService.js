/**
 * Core Employee Service
 * 
 * This service handles all employee-related business logic
 * that is shared across all service verticals.
 * 
 * Core features should never depend on vertical-specific logic.
 */

import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc, query, where, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { addSchemaVersion, getSchemaVersion } from '../../shared/schemas/schemaVersioning';
import { successResponse, errorResponse } from '../../shared/api/apiResponseStandard';
import { logError, ERROR_CODES, SEVERITY } from '../../shared/logging/errorLoggingStandard';

const COLLECTION_NAME = 'employees';
const SCHEMA_TYPE = 'EMPLOYEE';

/**
 * Get all employees for a tenant
 * @param {string} tenantId - The tenant ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getEmployees(tenantId) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }

    const employeesRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const q = query(employeesRef, orderBy('name'));
    const snapshot = await getDocs(q);
    
    const employeesData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return successResponse(employeesData);
  } catch (error) {
    logError({
      message: 'Failed to load employees',
      module: 'core',
      feature: 'employees',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load employees', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get active employees for a tenant
 * @param {string} tenantId - The tenant ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getActiveEmployees(tenantId) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }

    const employeesRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const q = query(employeesRef, where('status', '==', 'active'), orderBy('name'));
    const snapshot = await getDocs(q);
    
    const employeesData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return successResponse(employeesData);
  } catch (error) {
    logError({
      message: 'Failed to load active employees',
      module: 'core',
      feature: 'employees',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load active employees', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get a single employee by ID
 * @param {string} tenantId - The tenant ID
 * @param {string} employeeId - The employee ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getEmployeeById(tenantId, employeeId) {
  try {
    if (!tenantId || !employeeId) {
      return errorResponse('Tenant ID and Employee ID are required', 'VALIDATION_ERROR');
    }

    const employeeRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, employeeId);
    const snapshot = await getDoc(employeeRef);
    
    if (!snapshot.exists()) {
      return errorResponse('Employee not found', ERROR_CODES.NOT_FOUND);
    }

    return successResponse({ id: snapshot.id, ...snapshot.data() });
  } catch (error) {
    logError({
      message: 'Failed to load employee',
      module: 'core',
      feature: 'employees',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load employee', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Create a new employee
 * @param {string} tenantId - The tenant ID
 * @param {object} employeeData - The employee data
 * @returns {Promise<object>} - Standardized API response
 */
export async function createEmployee(tenantId, employeeData) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }

    // Add schema version
    const employeeWithVersion = addSchemaVersion(employeeData, SCHEMA_TYPE);

    const employeesRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const docRef = await addDoc(employeesRef, {
      ...employeeWithVersion,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: docRef.id, ...employeeWithVersion }, 'Employee created successfully');
  } catch (error) {
    logError({
      message: 'Failed to create employee',
      module: 'core',
      feature: 'employees',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to create employee', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Update an existing employee
 * @param {string} tenantId - The tenant ID
 * @param {string} employeeId - The employee ID
 * @param {object} employeeData - The updated employee data
 * @returns {Promise<object>} - Standardized API response
 */
export async function updateEmployee(tenantId, employeeId, employeeData) {
  try {
    if (!tenantId || !employeeId) {
      return errorResponse('Tenant ID and Employee ID are required', 'VALIDATION_ERROR');
    }

    const employeeRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, employeeId);
    
    // Preserve schema version if it exists
    const existingDoc = await getDoc(employeeRef);
    let employeeWithVersion = employeeData;
    
    if (existingDoc.exists()) {
      const existingData = existingDoc.data();
      employeeWithVersion = {
        ...employeeData,
        schemaVersion: existingData.schemaVersion || getSchemaVersion(SCHEMA_TYPE)
      };
    } else {
      employeeWithVersion = addSchemaVersion(employeeData, SCHEMA_TYPE);
    }

    await updateDoc(employeeRef, {
      ...employeeWithVersion,
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: employeeId, ...employeeWithVersion }, 'Employee updated successfully');
  } catch (error) {
    logError({
      message: 'Failed to update employee',
      module: 'core',
      feature: 'employees',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to update employee', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Delete an employee
 * @param {string} tenantId - The tenant ID
 * @param {string} employeeId - The employee ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function deleteEmployee(tenantId, employeeId) {
  try {
    if (!tenantId || !employeeId) {
      return errorResponse('Tenant ID and Employee ID are required', 'VALIDATION_ERROR');
    }

    const employeeRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, employeeId);
    await deleteDoc(employeeRef);

    return successResponse({ id: employeeId }, 'Employee deleted successfully');
  } catch (error) {
    logError({
      message: 'Failed to delete employee',
      module: 'core',
      feature: 'employees',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to delete employee', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Update employee status
 * @param {string} tenantId - The tenant ID
 * @param {string} employeeId - The employee ID
 * @param {string} status - The new status
 * @returns {Promise<object>} - Standardized API response
 */
export async function updateEmployeeStatus(tenantId, employeeId, status) {
  try {
    if (!tenantId || !employeeId || !status) {
      return errorResponse('Tenant ID, Employee ID, and status are required', 'VALIDATION_ERROR');
    }

    const employeeRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, employeeId);
    await updateDoc(employeeRef, {
      status,
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: employeeId, status }, 'Employee status updated successfully');
  } catch (error) {
    logError({
      message: 'Failed to update employee status',
      module: 'core',
      feature: 'employees',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to update employee status', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}
