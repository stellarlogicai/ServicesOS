/**
 * Core Time Tracking Service
 * 
 * This service handles all time tracking-related business logic
 * that is shared across all service verticals.
 * 
 * Core features should never depend on vertical-specific logic.
 */

import { collection, getDocs, addDoc, updateDoc, doc, getDoc, query, where, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { addSchemaVersion } from '../../shared/schemas/schemaVersioning';
import { successResponse, errorResponse } from '../../shared/api/apiResponseStandard';
import { logError, ERROR_CODES, SEVERITY } from '../../shared/logging/errorLoggingStandard';

const COLLECTION_NAME = 'time_clock';
const SCHEMA_TYPE = 'TIME_ENTRY';

/**
 * Get all time entries for a tenant
 * @param {string} tenantId - The tenant ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getTimeEntries(tenantId) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }

    const timeEntriesRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const q = query(timeEntriesRef, orderBy('clockIn', 'desc'));
    const snapshot = await getDocs(q);
    
    const timeEntriesData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return successResponse(timeEntriesData);
  } catch (error) {
    logError({
      message: 'Failed to load time entries',
      module: 'core',
      feature: 'timeTracking',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load time entries', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get time entries by employee ID
 * @param {string} tenantId - The tenant ID
 * @param {string} employeeId - The employee ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getTimeEntriesByEmployee(tenantId, employeeId) {
  try {
    if (!tenantId || !employeeId) {
      return errorResponse('Tenant ID and Employee ID are required', 'VALIDATION_ERROR');
    }

    const timeEntriesRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const q = query(timeEntriesRef, where('employeeId', '==', employeeId), orderBy('clockIn', 'desc'));
    const snapshot = await getDocs(q);
    
    const timeEntriesData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return successResponse(timeEntriesData);
  } catch (error) {
    logError({
      message: 'Failed to load time entries by employee',
      module: 'core',
      feature: 'timeTracking',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load time entries by employee', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get time entries by job ID
 * @param {string} tenantId - The tenant ID
 * @param {string} jobId - The job ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getTimeEntriesByJob(tenantId, jobId) {
  try {
    if (!tenantId || !jobId) {
      return errorResponse('Tenant ID and Job ID are required', 'VALIDATION_ERROR');
    }

    const timeEntriesRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const q = query(timeEntriesRef, where('jobId', '==', jobId), orderBy('clockIn', 'desc'));
    const snapshot = await getDocs(q);
    
    const timeEntriesData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return successResponse(timeEntriesData);
  } catch (error) {
    logError({
      message: 'Failed to load time entries by job',
      module: 'core',
      feature: 'timeTracking',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load time entries by job', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get a single time entry by ID
 * @param {string} tenantId - The tenant ID
 * @param {string} timeEntryId - The time entry ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getTimeEntryById(tenantId, timeEntryId) {
  try {
    if (!tenantId || !timeEntryId) {
      return errorResponse('Tenant ID and Time Entry ID are required', 'VALIDATION_ERROR');
    }

    const timeEntryRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, timeEntryId);
    const snapshot = await getDoc(timeEntryRef);
    
    if (!snapshot.exists()) {
      return errorResponse('Time entry not found', ERROR_CODES.NOT_FOUND);
    }

    return successResponse({ id: snapshot.id, ...snapshot.data() });
  } catch (error) {
    logError({
      message: 'Failed to load time entry',
      module: 'core',
      feature: 'timeTracking',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load time entry', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Clock in an employee
 * @param {string} tenantId - The tenant ID
 * @param {object} timeEntryData - The time entry data
 * @returns {Promise<object>} - Standardized API response
 */
export async function clockIn(tenantId, timeEntryData) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }

    // Add schema version
    const timeEntryWithVersion = addSchemaVersion(timeEntryData, SCHEMA_TYPE);

    const timeEntriesRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const docRef = await addDoc(timeEntriesRef, {
      ...timeEntryWithVersion,
      status: 'clocked_in',
      clockIn: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: docRef.id, ...timeEntryWithVersion }, 'Clocked in successfully');
  } catch (error) {
    logError({
      message: 'Failed to clock in',
      module: 'core',
      feature: 'timeTracking',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to clock in', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Clock out an employee
 * @param {string} tenantId - The tenant ID
 * @param {string} timeEntryId - The time entry ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function clockOut(tenantId, timeEntryId) {
  try {
    if (!tenantId || !timeEntryId) {
      return errorResponse('Tenant ID and Time Entry ID are required', 'VALIDATION_ERROR');
    }

    const timeEntryRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, timeEntryId);
    const clockOutTime = new Date().toISOString();
    
    await updateDoc(timeEntryRef, {
      status: 'clocked_out',
      clockOut: clockOutTime,
      updatedAt: clockOutTime
    });

    return successResponse({ id: timeEntryId, status: 'clocked_out' }, 'Clocked out successfully');
  } catch (error) {
    logError({
      message: 'Failed to clock out',
      module: 'core',
      feature: 'timeTracking',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to clock out', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get active time entry for an employee
 * @param {string} tenantId - The tenant ID
 * @param {string} employeeId - The employee ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getActiveTimeEntry(tenantId, employeeId) {
  try {
    if (!tenantId || !employeeId) {
      return errorResponse('Tenant ID and Employee ID are required', 'VALIDATION_ERROR');
    }

    const timeEntriesRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const q = query(
      timeEntriesRef, 
      where('employeeId', '==', employeeId), 
      where('status', '==', 'clocked_in')
    );
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      return successResponse(null);
    }
    
    const timeEntryData = {
      id: snapshot.docs[0].id,
      ...snapshot.docs[0].data()
    };

    return successResponse(timeEntryData);
  } catch (error) {
    logError({
      message: 'Failed to get active time entry',
      module: 'core',
      feature: 'timeTracking',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to get active time entry', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Calculate total hours for a job
 * @param {string} tenantId - The tenant ID
 * @param {string} jobId - The job ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function calculateJobHours(tenantId, jobId) {
  try {
    if (!tenantId || !jobId) {
      return errorResponse('Tenant ID and Job ID are required', 'VALIDATION_ERROR');
    }

    const timeEntriesRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const q = query(timeEntriesRef, where('jobId', '==', jobId), where('status', '==', 'clocked_out'));
    const snapshot = await getDocs(q);
    
    let totalMinutes = 0;
    
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.clockIn && data.clockOut) {
        const clockIn = new Date(data.clockIn);
        const clockOut = new Date(data.clockOut);
        const diffMs = clockOut - clockIn;
        totalMinutes += diffMs / (1000 * 60);
      }
    });
    
    const totalHours = Math.round((totalMinutes / 60) * 100) / 100; // Round to 2 decimal places

    return successResponse({ totalHours, totalMinutes, entryCount: snapshot.size });
  } catch (error) {
    logError({
      message: 'Failed to calculate job hours',
      module: 'core',
      feature: 'timeTracking',
      severity: SEVERITY.MEDIUM,
      tenantId,
      error
    });
    return errorResponse('Failed to calculate job hours', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}
