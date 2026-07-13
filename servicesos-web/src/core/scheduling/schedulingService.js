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
const BOOKING_ADMIN_UPDATE_ALLOWED_FIELDS = new Set([
  'date',
  'startTime',
  'endTime',
  'scheduledAt',
  'status',
  'notes',
  'agreedPrice',
]);
const BOOKING_ADMIN_STATUS_VALUES = new Set(['scheduled', 'completed', 'cancelled']);
const BOOKING_ADMIN_NOTES_MAX_LENGTH = 1000;
const BOOKING_MANUAL_PAYMENT_STATUS_ALLOWED_FIELDS = new Set([
  'paymentStatus',
  'paymentMethod',
  'amountReceived',
  'receivedAt',
  'paymentNote',
  'paymentStatusUpdatedBy',
]);
const BOOKING_FIELD_EXECUTION_ALLOWED_FIELDS = new Set([
  'fieldStatus',
  'fieldChecklist',
  'fieldNotes',
  'fieldIssue',
]);
export const BOOKING_MANUAL_PAYMENT_STATUS_LABELS = {
  not_paid: 'Not paid',
  deposit_requested: 'Deposit requested',
  deposit_paid: 'Deposit paid',
  final_due: 'Final due',
  partial: 'Partial',
  paid_in_full: 'Paid in full',
  paid_cash: 'Paid cash',
  paid_check: 'Paid check',
  paid_external_app: 'Paid external app',
  waived_family_discount: 'Waived / family discount',
  payment_issue: 'Payment issue',
};
export const BOOKING_FIELD_STATUS_LABELS = {
  not_started: 'Scheduled / not started',
  in_progress: 'In progress',
  completed: 'Completed',
};
export const BOOKING_PAYMENT_METHOD_LABELS = {
  cash: 'Cash',
  check: 'Check',
  venmo: 'Venmo',
  cash_app: 'Cash App',
  zelle: 'Zelle',
  facebook_pay: 'Facebook Pay',
  paypal: 'PayPal',
  card: 'Card',
  stripe_manual_reference: 'Stripe manual reference',
  waived: 'Waived',
  other: 'Other',
};
const BOOKING_MANUAL_PAYMENT_STATUS_VALUES = new Set(Object.keys(BOOKING_MANUAL_PAYMENT_STATUS_LABELS));
const BOOKING_FIELD_STATUS_VALUES = new Set(Object.keys(BOOKING_FIELD_STATUS_LABELS));
const BOOKING_PAYMENT_METHOD_VALUES = new Set(Object.keys(BOOKING_PAYMENT_METHOD_LABELS));
const BOOKING_MANUAL_PAYMENT_UPDATED_BY_MAX_LENGTH = 128;
const BOOKING_PAYMENT_NOTE_MAX_LENGTH = 500;
const BOOKING_FIELD_NOTE_MAX_LENGTH = 1000;
const BOOKING_FIELD_ISSUE_MAX_LENGTH = 750;
const BOOKING_FIELD_CHECKLIST_MAX_ITEMS = 25;
const BOOKING_FIELD_CHECKLIST_LABEL_MAX_LENGTH = 120;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_ONLY_PATTERN = /^\d{2}:\d{2}$/;

function localDateParts(date) {
  const pad = value => String(value).padStart(2, '0');
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

function bookingAdminValidationError(message) {
  return errorResponse(message, 'VALIDATION_ERROR');
}

function isValidDateOnly(value) {
  if (typeof value !== 'string' || !DATE_ONLY_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00`);
  return !Number.isNaN(parsed.getTime()) && localDateParts(parsed).date === value;
}

function isValidTimeOnly(value) {
  if (typeof value !== 'string' || !TIME_ONLY_PATTERN.test(value)) return false;
  const [hours, minutes] = value.split(':').map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function parseValidIsoDate(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.toISOString() !== value) return null;
  return parsed;
}

function isValidPaymentDateString(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  if (DATE_ONLY_PATTERN.test(value)) return isValidDateOnly(value);
  return parseValidIsoDate(value) !== null;
}

function normalizeBookingAdminTimeFields(patch, payload) {
  const hasDate = Object.hasOwn(patch, 'date');
  const hasStartTime = Object.hasOwn(patch, 'startTime');
  const hasEndTime = Object.hasOwn(patch, 'endTime');
  const hasScheduledAt = Object.hasOwn(patch, 'scheduledAt');

  if (hasDate && !isValidDateOnly(patch.date)) {
    return bookingAdminValidationError('Booking date must use YYYY-MM-DD format.');
  }

  if (hasStartTime && !isValidTimeOnly(patch.startTime)) {
    return bookingAdminValidationError('Booking startTime must use HH:mm format.');
  }

  if (hasEndTime && !isValidTimeOnly(patch.endTime)) {
    return bookingAdminValidationError('Booking endTime must use HH:mm format.');
  }

  if (hasScheduledAt) {
    const scheduledDate = parseValidIsoDate(patch.scheduledAt);
    if (!scheduledDate) {
      return bookingAdminValidationError('Booking scheduledAt must be a valid ISO string.');
    }

    const derived = localDateParts(scheduledDate);
    if (hasDate && patch.date !== derived.date) {
      return bookingAdminValidationError('Booking date must match scheduledAt.');
    }
    if (hasStartTime && patch.startTime !== derived.time) {
      return bookingAdminValidationError('Booking startTime must match scheduledAt.');
    }

    payload.scheduledAt = patch.scheduledAt;
    payload.date = hasDate ? patch.date : derived.date;
    payload.startTime = hasStartTime ? patch.startTime : derived.time;
  } else if (hasDate || hasStartTime) {
    if (!hasDate || !hasStartTime) {
      return bookingAdminValidationError('Booking date and startTime must be supplied together.');
    }

    const scheduledDate = new Date(`${patch.date}T${patch.startTime}`);
    if (Number.isNaN(scheduledDate.getTime())) {
      return bookingAdminValidationError('Booking date and startTime must produce a valid scheduledAt value.');
    }

    payload.date = patch.date;
    payload.startTime = patch.startTime;
    payload.scheduledAt = scheduledDate.toISOString();
  }

  if (hasEndTime) {
    payload.endTime = patch.endTime;
  }

  return null;
}

export function buildBookingAdminUpdatePatch(proposedPatch, { now = new Date().toISOString() } = {}) {
  if (!proposedPatch || typeof proposedPatch !== 'object' || Array.isArray(proposedPatch)) {
    return bookingAdminValidationError('Booking update patch must be an object.');
  }

  const incomingFields = Object.keys(proposedPatch);
  const unknownFields = incomingFields.filter(field => !BOOKING_ADMIN_UPDATE_ALLOWED_FIELDS.has(field));
  if (unknownFields.length > 0) {
    return bookingAdminValidationError(`Unsupported booking update field: ${unknownFields[0]}.`);
  }

  const payload = {};
  const timeError = normalizeBookingAdminTimeFields(proposedPatch, payload);
  if (timeError) return timeError;

  if (Object.hasOwn(proposedPatch, 'status')) {
    if (!BOOKING_ADMIN_STATUS_VALUES.has(proposedPatch.status)) {
      return bookingAdminValidationError('Booking status is not allowed for owner/admin updates.');
    }
    payload.status = proposedPatch.status;
  }

  if (Object.hasOwn(proposedPatch, 'notes')) {
    if (typeof proposedPatch.notes !== 'string') {
      return bookingAdminValidationError('Booking notes must be a string.');
    }
    const notes = proposedPatch.notes.trim();
    if (notes.length > BOOKING_ADMIN_NOTES_MAX_LENGTH) {
      return bookingAdminValidationError(`Booking notes must be ${BOOKING_ADMIN_NOTES_MAX_LENGTH} characters or fewer.`);
    }
    payload.notes = notes;
  }

  if (Object.hasOwn(proposedPatch, 'agreedPrice')) {
    const agreedPrice = Number(proposedPatch.agreedPrice);
    if (!Number.isFinite(agreedPrice) || agreedPrice < 0) {
      return bookingAdminValidationError('Booking agreedPrice must be a non-negative number.');
    }
    payload.agreedPrice = agreedPrice;
  }

  if (Object.keys(payload).length === 0) {
    return bookingAdminValidationError('Booking update patch must include at least one supported field.');
  }

  payload.updatedAt = now;
  return successResponse(payload);
}

export function buildBookingManualPaymentStatusPatch(proposedPatch, { now = new Date().toISOString(), updatedBy } = {}) {
  if (!proposedPatch || typeof proposedPatch !== 'object' || Array.isArray(proposedPatch)) {
    return bookingAdminValidationError('Booking manual payment status patch must be an object.');
  }

  const incomingFields = Object.keys(proposedPatch);
  if (incomingFields.length === 0) {
    return bookingAdminValidationError('Booking manual payment status patch must include paymentStatus.');
  }

  const unknownFields = incomingFields.filter(field => !BOOKING_MANUAL_PAYMENT_STATUS_ALLOWED_FIELDS.has(field));
  if (unknownFields.length > 0) {
    return bookingAdminValidationError(`Unsupported booking manual payment status field: ${unknownFields[0]}.`);
  }

  if (!Object.hasOwn(proposedPatch, 'paymentStatus')) {
    return bookingAdminValidationError('Booking manual payment status patch must include paymentStatus.');
  }

  if (!BOOKING_MANUAL_PAYMENT_STATUS_VALUES.has(proposedPatch.paymentStatus)) {
    return bookingAdminValidationError('Booking manual payment status is not allowed.');
  }

  const proposedUpdatedBy = Object.hasOwn(proposedPatch, 'paymentStatusUpdatedBy')
    ? proposedPatch.paymentStatusUpdatedBy
    : updatedBy;
  const payload = {
    paymentStatus: proposedPatch.paymentStatus,
    paymentStatusUpdatedAt: now,
  };

  if (Object.hasOwn(proposedPatch, 'paymentMethod')) {
    if (proposedPatch.paymentMethod !== '' && proposedPatch.paymentMethod !== null && proposedPatch.paymentMethod !== undefined) {
      if (typeof proposedPatch.paymentMethod !== 'string' || !BOOKING_PAYMENT_METHOD_VALUES.has(proposedPatch.paymentMethod)) {
        return bookingAdminValidationError('Booking payment method is not allowed.');
      }
      payload.paymentMethod = proposedPatch.paymentMethod;
    } else {
      payload.paymentMethod = '';
    }
  }

  if (Object.hasOwn(proposedPatch, 'amountReceived')) {
    if (proposedPatch.amountReceived === '' || proposedPatch.amountReceived === null || proposedPatch.amountReceived === undefined) {
      payload.amountReceived = '';
    } else {
      const amountReceived = Number(proposedPatch.amountReceived);
      if (!Number.isFinite(amountReceived) || amountReceived < 0) {
        return bookingAdminValidationError('Booking amount received must be a non-negative number.');
      }
      payload.amountReceived = amountReceived;
    }
  }

  if (Object.hasOwn(proposedPatch, 'receivedAt')) {
    if (proposedPatch.receivedAt !== '' && proposedPatch.receivedAt !== null && proposedPatch.receivedAt !== undefined) {
      if (typeof proposedPatch.receivedAt !== 'string' || !isValidPaymentDateString(proposedPatch.receivedAt.trim())) {
        return bookingAdminValidationError('Booking receivedAt must be a valid date string.');
      }
      payload.receivedAt = proposedPatch.receivedAt.trim();
    } else {
      payload.receivedAt = '';
    }
  }

  if (Object.hasOwn(proposedPatch, 'paymentNote')) {
    if (proposedPatch.paymentNote !== '' && proposedPatch.paymentNote !== null && proposedPatch.paymentNote !== undefined) {
      if (typeof proposedPatch.paymentNote !== 'string') {
        return bookingAdminValidationError('Booking payment note must be a string.');
      }
      const paymentNote = proposedPatch.paymentNote.trim();
      if (paymentNote.length > BOOKING_PAYMENT_NOTE_MAX_LENGTH) {
        return bookingAdminValidationError(`Booking payment note must be ${BOOKING_PAYMENT_NOTE_MAX_LENGTH} characters or fewer.`);
      }
      if (paymentNote) {
        payload.paymentNote = paymentNote;
      }
    } else {
      payload.paymentNote = '';
    }
  }

  if (proposedUpdatedBy !== undefined) {
    if (typeof proposedUpdatedBy !== 'string') {
      return bookingAdminValidationError('Booking manual payment status updatedBy must be a string.');
    }
    const normalizedUpdatedBy = proposedUpdatedBy.trim();
    if (!normalizedUpdatedBy) {
      return bookingAdminValidationError('Booking manual payment status updatedBy must not be empty.');
    }
    if (normalizedUpdatedBy.length > BOOKING_MANUAL_PAYMENT_UPDATED_BY_MAX_LENGTH) {
      return bookingAdminValidationError(`Booking manual payment status updatedBy must be ${BOOKING_MANUAL_PAYMENT_UPDATED_BY_MAX_LENGTH} characters or fewer.`);
    }
    payload.paymentStatusUpdatedBy = normalizedUpdatedBy;
  }

  return successResponse(payload);
}

function normalizeFieldUpdatedBy(value, fieldLabel) {
  if (value === undefined || value === null || value === '') return { success: true, data: undefined };
  if (typeof value !== 'string') {
    return bookingAdminValidationError(`${fieldLabel} must be a string.`);
  }
  const normalized = value.trim();
  if (!normalized) {
    return bookingAdminValidationError(`${fieldLabel} must not be empty.`);
  }
  if (normalized.length > BOOKING_MANUAL_PAYMENT_UPDATED_BY_MAX_LENGTH) {
    return bookingAdminValidationError(`${fieldLabel} must be ${BOOKING_MANUAL_PAYMENT_UPDATED_BY_MAX_LENGTH} characters or fewer.`);
  }
  return successResponse(normalized);
}

function normalizeFieldChecklist(fieldChecklist) {
  if (!Array.isArray(fieldChecklist)) {
    return bookingAdminValidationError('Booking field checklist must be an array.');
  }
  if (fieldChecklist.length > BOOKING_FIELD_CHECKLIST_MAX_ITEMS) {
    return bookingAdminValidationError(`Booking field checklist must include ${BOOKING_FIELD_CHECKLIST_MAX_ITEMS} items or fewer.`);
  }

  const normalized = [];
  for (const item of fieldChecklist) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return bookingAdminValidationError('Booking field checklist items must be objects.');
    }
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const label = typeof item.label === 'string' ? item.label.trim() : '';
    if (!id || !label) {
      return bookingAdminValidationError('Booking field checklist items require id and label.');
    }
    if (label.length > BOOKING_FIELD_CHECKLIST_LABEL_MAX_LENGTH) {
      return bookingAdminValidationError(`Booking field checklist labels must be ${BOOKING_FIELD_CHECKLIST_LABEL_MAX_LENGTH} characters or fewer.`);
    }
    normalized.push({
      id,
      label,
      completed: item.completed === true,
    });
  }

  return successResponse(normalized);
}

export function buildBookingFieldExecutionPatch(proposedPatch, { now = new Date().toISOString(), updatedBy } = {}) {
  if (!proposedPatch || typeof proposedPatch !== 'object' || Array.isArray(proposedPatch)) {
    return bookingAdminValidationError('Booking field execution patch must be an object.');
  }

  const incomingFields = Object.keys(proposedPatch);
  if (incomingFields.length === 0) {
    return bookingAdminValidationError('Booking field execution patch must include at least one supported field.');
  }

  const unknownFields = incomingFields.filter(field => !BOOKING_FIELD_EXECUTION_ALLOWED_FIELDS.has(field));
  if (unknownFields.length > 0) {
    return bookingAdminValidationError(`Unsupported booking field execution field: ${unknownFields[0]}.`);
  }

  const payload = {};
  const normalizedUpdatedBy = normalizeFieldUpdatedBy(updatedBy, 'Booking field execution updatedBy');
  if (!normalizedUpdatedBy.success) return normalizedUpdatedBy;

  if (Object.hasOwn(proposedPatch, 'fieldStatus')) {
    if (!BOOKING_FIELD_STATUS_VALUES.has(proposedPatch.fieldStatus)) {
      return bookingAdminValidationError('Booking field status is not allowed.');
    }
    payload.fieldStatus = proposedPatch.fieldStatus;
    payload.fieldStatusUpdatedAt = now;
    if (proposedPatch.fieldStatus === 'in_progress') {
      payload.fieldStartedAt = now;
      if (normalizedUpdatedBy.data) payload.fieldStartedByUid = normalizedUpdatedBy.data;
    }
    if (proposedPatch.fieldStatus === 'completed') {
      payload.completedAt = now;
      if (normalizedUpdatedBy.data) payload.completedByUid = normalizedUpdatedBy.data;
    }
  }

  if (Object.hasOwn(proposedPatch, 'fieldChecklist')) {
    const checklist = normalizeFieldChecklist(proposedPatch.fieldChecklist);
    if (!checklist.success) return checklist;
    const completed = checklist.data.filter(item => item.completed).length;
    payload.fieldChecklist = checklist.data;
    payload.fieldChecklistSummary = {
      completed,
      total: checklist.data.length,
    };
  }

  if (Object.hasOwn(proposedPatch, 'fieldNotes')) {
    if (typeof proposedPatch.fieldNotes !== 'string') {
      return bookingAdminValidationError('Booking field notes must be a string.');
    }
    const fieldNotes = proposedPatch.fieldNotes.trim();
    if (fieldNotes.length > BOOKING_FIELD_NOTE_MAX_LENGTH) {
      return bookingAdminValidationError(`Booking field notes must be ${BOOKING_FIELD_NOTE_MAX_LENGTH} characters or fewer.`);
    }
    payload.fieldNotes = fieldNotes;
  }

  if (Object.hasOwn(proposedPatch, 'fieldIssue')) {
    if (typeof proposedPatch.fieldIssue !== 'string') {
      return bookingAdminValidationError('Booking field issue must be a string.');
    }
    const fieldIssue = proposedPatch.fieldIssue.trim();
    if (fieldIssue.length > BOOKING_FIELD_ISSUE_MAX_LENGTH) {
      return bookingAdminValidationError(`Booking field issue must be ${BOOKING_FIELD_ISSUE_MAX_LENGTH} characters or fewer.`);
    }
    payload.fieldIssue = fieldIssue;
  }

  payload.updatedAt = now;
  return successResponse(payload);
}

export async function updateBookingAdminFields(tenantId, bookingId, proposedPatch, options = {}) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }
    if (!bookingId) {
      return errorResponse('Booking ID is required', 'VALIDATION_ERROR');
    }

    const builtPatch = buildBookingAdminUpdatePatch(proposedPatch, options);
    if (!builtPatch.success) {
      return builtPatch;
    }

    const bookingRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, bookingId);
    await updateDoc(bookingRef, builtPatch.data);

    return successResponse(
      { id: bookingId, ...builtPatch.data },
      'Booking updated successfully'
    );
  } catch (error) {
    logError({
      message: 'Failed to update booking admin fields',
      module: 'core',
      feature: 'scheduling',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to update booking admin fields', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

export async function updateBookingFieldExecution(tenantId, bookingId, proposedPatch, options = {}) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }
    if (!bookingId) {
      return errorResponse('Booking ID is required', 'VALIDATION_ERROR');
    }

    const builtPatch = buildBookingFieldExecutionPatch(proposedPatch, options);
    if (!builtPatch.success) {
      return builtPatch;
    }

    const bookingRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, bookingId);
    await updateDoc(bookingRef, builtPatch.data);

    return successResponse(
      { id: bookingId, ...builtPatch.data },
      'Booking field execution updated successfully'
    );
  } catch (error) {
    logError({
      message: 'Failed to update booking field execution',
      module: 'core',
      feature: 'scheduling',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to update booking field execution', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

export async function updateBookingManualPaymentStatus(tenantId, bookingId, proposedPatch, options = {}) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }
    if (!bookingId) {
      return errorResponse('Booking ID is required', 'VALIDATION_ERROR');
    }

    const builtPatch = buildBookingManualPaymentStatusPatch(proposedPatch, options);
    if (!builtPatch.success) {
      return builtPatch;
    }

    const bookingRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, bookingId);
    await updateDoc(bookingRef, builtPatch.data);

    return successResponse(
      { id: bookingId, ...builtPatch.data },
      'Booking manual payment status updated successfully'
    );
  } catch (error) {
    logError({
      message: 'Failed to update booking manual payment status',
      module: 'core',
      feature: 'scheduling',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to update booking manual payment status', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

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
