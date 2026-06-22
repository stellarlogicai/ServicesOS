/**
 * Core Scheduling Service
 * 
 * This service handles all scheduling-related business logic
 * that is shared across all service verticals.
 * 
 * Core features should never depend on vertical-specific logic.
 */

import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc, query, where, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { addSchemaVersion, getSchemaVersion } from '../../shared/schemas/schemaVersioning';
import { successResponse, errorResponse } from '../../shared/api/apiResponseStandard';
import { logError, ERROR_CODES, SEVERITY } from '../../shared/logging/errorLoggingStandard';

const COLLECTION_NAME = 'bookings';
const SCHEMA_TYPE = 'JOB';

/**
 * Get all jobs/bookings for a tenant
 * @param {string} tenantId - The tenant ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getJobs(tenantId) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }

    const jobsRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const q = query(jobsRef, orderBy('date', 'desc'));
    const snapshot = await getDocs(q);
    
    const jobsData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return successResponse(jobsData);
  } catch (error) {
    logError({
      message: 'Failed to load jobs',
      module: 'core',
      feature: 'scheduling',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load jobs', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get jobs for a specific date
 * @param {string} tenantId - The tenant ID
 * @param {string} date - The date (YYYY-MM-DD format)
 * @returns {Promise<object>} - Standardized API response
 */
export async function getJobsByDate(tenantId, date) {
  try {
    if (!tenantId || !date) {
      return errorResponse('Tenant ID and date are required', 'VALIDATION_ERROR');
    }

    const jobsRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const q = query(jobsRef, where('date', '==', date), orderBy('startTime'));
    const snapshot = await getDocs(q);
    
    const jobsData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return successResponse(jobsData);
  } catch (error) {
    logError({
      message: 'Failed to load jobs by date',
      module: 'core',
      feature: 'scheduling',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load jobs by date', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get a single job by ID
 * @param {string} tenantId - The tenant ID
 * @param {string} jobId - The job ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getJobById(tenantId, jobId) {
  try {
    if (!tenantId || !jobId) {
      return errorResponse('Tenant ID and Job ID are required', 'VALIDATION_ERROR');
    }

    const jobRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, jobId);
    const snapshot = await getDoc(jobRef);
    
    if (!snapshot.exists()) {
      return errorResponse('Job not found', ERROR_CODES.NOT_FOUND);
    }

    return successResponse({ id: snapshot.id, ...snapshot.data() });
  } catch (error) {
    logError({
      message: 'Failed to load job',
      module: 'core',
      feature: 'scheduling',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load job', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Create a new job
 * @param {string} tenantId - The tenant ID
 * @param {object} jobData - The job data
 * @returns {Promise<object>} - Standardized API response
 */
export async function createJob(tenantId, jobData) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }

    // Add schema version
    const jobWithVersion = addSchemaVersion(jobData, SCHEMA_TYPE);

    const jobsRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const docRef = await addDoc(jobsRef, {
      ...jobWithVersion,
      status: 'scheduled',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: docRef.id, ...jobWithVersion }, 'Job created successfully');
  } catch (error) {
    logError({
      message: 'Failed to create job',
      module: 'core',
      feature: 'scheduling',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to create job', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Update an existing job
 * @param {string} tenantId - The tenant ID
 * @param {string} jobId - The job ID
 * @param {object} jobData - The updated job data
 * @returns {Promise<object>} - Standardized API response
 */
export async function updateJob(tenantId, jobId, jobData) {
  try {
    if (!tenantId || !jobId) {
      return errorResponse('Tenant ID and Job ID are required', 'VALIDATION_ERROR');
    }

    const jobRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, jobId);
    
    // Preserve schema version if it exists
    const existingDoc = await getDoc(jobRef);
    let jobWithVersion = jobData;
    
    if (existingDoc.exists()) {
      const existingData = existingDoc.data();
      jobWithVersion = {
        ...jobData,
        schemaVersion: existingData.schemaVersion || getSchemaVersion(SCHEMA_TYPE)
      };
    } else {
      jobWithVersion = addSchemaVersion(jobData, SCHEMA_TYPE);
    }

    await updateDoc(jobRef, {
      ...jobWithVersion,
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: jobId, ...jobWithVersion }, 'Job updated successfully');
  } catch (error) {
    logError({
      message: 'Failed to update job',
      module: 'core',
      feature: 'scheduling',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to update job', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Update job status
 * @param {string} tenantId - The tenant ID
 * @param {string} jobId - The job ID
 * @param {string} status - The new status
 * @returns {Promise<object>} - Standardized API response
 */
export async function updateJobStatus(tenantId, jobId, status) {
  try {
    if (!tenantId || !jobId || !status) {
      return errorResponse('Tenant ID, Job ID, and status are required', 'VALIDATION_ERROR');
    }

    const jobRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, jobId);
    await updateDoc(jobRef, {
      status,
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: jobId, status }, 'Job status updated successfully');
  } catch (error) {
    logError({
      message: 'Failed to update job status',
      module: 'core',
      feature: 'scheduling',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to update job status', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Delete a job
 * @param {string} tenantId - The tenant ID
 * @param {string} jobId - The job ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function deleteJob(tenantId, jobId) {
  try {
    if (!tenantId || !jobId) {
      return errorResponse('Tenant ID and Job ID are required', 'VALIDATION_ERROR');
    }

    const jobRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, jobId);
    await deleteDoc(jobRef);

    return successResponse({ id: jobId }, 'Job deleted successfully');
  } catch (error) {
    logError({
      message: 'Failed to delete job',
      module: 'core',
      feature: 'scheduling',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to delete job', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Assign employee to job
 * @param {string} tenantId - The tenant ID
 * @param {string} jobId - The job ID
 * @param {string} employeeId - The employee ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function assignEmployeeToJob(tenantId, jobId, employeeId) {
  try {
    if (!tenantId || !jobId || !employeeId) {
      return errorResponse('Tenant ID, Job ID, and Employee ID are required', 'VALIDATION_ERROR');
    }

    const jobRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, jobId);
    await updateDoc(jobRef, {
      assignedEmployeeId: employeeId,
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: jobId, assignedEmployeeId: employeeId }, 'Employee assigned successfully');
  } catch (error) {
    logError({
      message: 'Failed to assign employee to job',
      module: 'core',
      feature: 'scheduling',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to assign employee to job', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}
