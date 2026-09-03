const {
  CHECKLIST_MAX_ITEMS,
  JOB_PACKET_SCHEMA_VERSION,
  bookingMatchesEmployeeJobVisibility,
  employeeJobPacket,
  isApprovedChecklistCurrent,
  localDateKey,
} = require('./employeeJobPacketProjection');

const FIELD_NOTES_MAX_LENGTH = 1000;
const FIELD_ISSUE_MAX_LENGTH = 750;
const CHECKLIST_LABEL_MAX_LENGTH = 120;
const CHECKLIST_AREA_MAX_LENGTH = 120;
const CHECKLIST_DETAIL_MAX_LENGTH = 500;
const CHECKLIST_MAX_JOB_AID_STEPS = 50;
const CHECKLIST_MAX_WARNINGS = 10;
const CHECKLIST_MAX_SOURCE_REFERENCES = 20;
const CHECKLIST_SOURCE_REFERENCE_MAX_LENGTH = 300;
const CHECKLIST_MAX_METHOD_IDS = 20;
const CHECKLIST_ID_MAX_LENGTH = 128;

class EmployeeFieldExecutionError extends Error {
  constructor(message, { code, status }) {
    super(message);
    this.name = 'EmployeeFieldExecutionError';
    this.code = code;
    this.status = status;
  }
}

function fail(code, status, message) {
  throw new EmployeeFieldExecutionError(message, { code, status });
}

function invalidRequest() {
  fail('invalid_request', 400, 'Invalid request');
}

function checklistUnavailable() {
  fail('checklist_unavailable', 409, 'Checklist unavailable');
}

function jobStateConflict() {
  fail('job_state_conflict', 409, 'Job state conflict');
}

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === [...expected].sort()[index]);
}

function bookingId(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (
    !normalized ||
    normalized.length > 128 ||
    normalized.includes('/') ||
    normalized === '.' ||
    normalized === '..'
  ) invalidRequest();
  return normalized;
}

function boundedNote(value, maxLength) {
  if (typeof value !== 'string') invalidRequest();
  const normalized = value.trim();
  if (normalized.length > maxLength) invalidRequest();
  return normalized;
}

function completionStates(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > CHECKLIST_MAX_ITEMS) invalidRequest();
  return value.map(item => {
    if (!exactKeys(item, ['completed', 'id'])) invalidRequest();
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    if (!id || id.length > CHECKLIST_ID_MAX_LENGTH || typeof item.completed !== 'boolean') invalidRequest();
    return { id, completed: item.completed };
  });
}

function parseEmployeeFieldExecutionRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalidRequest();

  if (body.action === 'start') {
    if (!exactKeys(body, ['action', 'bookingId'])) invalidRequest();
    return { action: 'start', bookingId: bookingId(body.bookingId) };
  }
  if (body.action === 'save_checklist') {
    if (!exactKeys(body, ['action', 'bookingId', 'checklist'])) invalidRequest();
    return {
      action: 'save_checklist',
      bookingId: bookingId(body.bookingId),
      checklist: completionStates(body.checklist),
    };
  }
  if (body.action === 'save_notes') {
    if (!exactKeys(body, ['action', 'bookingId', 'fieldIssue', 'fieldNotes'])) invalidRequest();
    return {
      action: 'save_notes',
      bookingId: bookingId(body.bookingId),
      fieldNotes: boundedNote(body.fieldNotes, FIELD_NOTES_MAX_LENGTH),
      fieldIssue: boundedNote(body.fieldIssue, FIELD_ISSUE_MAX_LENGTH),
    };
  }
  if (body.action === 'complete') {
    if (!exactKeys(body, ['action', 'bookingId', 'checklist', 'fieldIssue', 'fieldNotes'])) invalidRequest();
    return {
      action: 'complete',
      bookingId: bookingId(body.bookingId),
      checklist: completionStates(body.checklist),
      fieldNotes: boundedNote(body.fieldNotes, FIELD_NOTES_MAX_LENGTH),
      fieldIssue: boundedNote(body.fieldIssue, FIELD_ISSUE_MAX_LENGTH),
    };
  }
  invalidRequest();
}

function normalizedText(value, maxLength, { required = false, fallback = '' } = {}) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if ((required && !normalized) || normalized.length > maxLength) checklistUnavailable();
  return normalized || fallback;
}

function normalizedStringArray(value, { maxItems, maxLength, filterOversized = false }) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) checklistUnavailable();
  const result = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || !entry.trim()) continue;
    const normalized = entry.trim();
    if (normalized.length > maxLength) {
      if (filterOversized) continue;
      checklistUnavailable();
    }
    result.push(normalized);
    if (result.length === maxItems) break;
  }
  return result;
}

function normalizeApprovedChecklistItem(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) checklistUnavailable();
  if (item.jobAidSteps !== undefined && !Array.isArray(item.jobAidSteps)) checklistUnavailable();
  if ((item.jobAidSteps || []).length > CHECKLIST_MAX_JOB_AID_STEPS) checklistUnavailable();

  const jobAidSteps = (item.jobAidSteps || []).map(step => {
    if (!step || typeof step !== 'object' || Array.isArray(step)) checklistUnavailable();
    return {
      label: normalizedText(step.label, CHECKLIST_LABEL_MAX_LENGTH, { required: true }),
      note: normalizedText(step.note, CHECKLIST_DETAIL_MAX_LENGTH),
      condition: normalizedText(step.condition, CHECKLIST_DETAIL_MAX_LENGTH),
    };
  });

  const preferredMethodId = normalizedText(item.preferredMethodId, CHECKLIST_ID_MAX_LENGTH);
  return {
    id: normalizedText(item.id, CHECKLIST_ID_MAX_LENGTH, { required: true }),
    area: normalizedText(item.area, CHECKLIST_AREA_MAX_LENGTH, { fallback: 'General' }),
    fixtureOrSurface: normalizedText(item.fixtureOrSurface, CHECKLIST_AREA_MAX_LENGTH),
    label: normalizedText(item.label, CHECKLIST_LABEL_MAX_LENGTH, { required: true }),
    completionCriteria: normalizedText(item.completionCriteria, CHECKLIST_DETAIL_MAX_LENGTH),
    jobAidSteps,
    warnings: normalizedStringArray(item.warnings, {
      maxItems: CHECKLIST_MAX_WARNINGS,
      maxLength: CHECKLIST_DETAIL_MAX_LENGTH,
    }),
    note: normalizedText(item.note, CHECKLIST_DETAIL_MAX_LENGTH),
    condition: normalizedText(item.condition, CHECKLIST_DETAIL_MAX_LENGTH),
    required: item.required === true,
    completed: false,
    approvedMethodIds: normalizedStringArray(item.approvedMethodIds, {
      maxItems: CHECKLIST_MAX_METHOD_IDS,
      maxLength: CHECKLIST_ID_MAX_LENGTH,
    }),
    preferredMethodId: preferredMethodId || null,
    sourceReferences: normalizedStringArray(item.sourceReferences, {
      maxItems: CHECKLIST_MAX_SOURCE_REFERENCES,
      maxLength: CHECKLIST_SOURCE_REFERENCE_MAX_LENGTH,
      filterOversized: true,
    }),
  };
}

function currentApprovedChecklist(booking) {
  if (!isApprovedChecklistCurrent(booking)) checklistUnavailable();
  const sourceItems = booking.jobChecklistSnapshot?.items;
  if (!Array.isArray(sourceItems) || sourceItems.length === 0 || sourceItems.length > CHECKLIST_MAX_ITEMS) {
    checklistUnavailable();
  }
  const items = sourceItems.map(normalizeApprovedChecklistItem);
  if (new Set(items.map(item => item.id)).size !== items.length || !items.some(item => item.required)) {
    checklistUnavailable();
  }
  return items;
}

function reconstructChecklist(booking, submittedStates) {
  const approved = currentApprovedChecklist(booking);
  if (submittedStates.length !== approved.length) invalidRequest();
  const byId = new Map();
  for (const state of submittedStates) {
    if (byId.has(state.id)) invalidRequest();
    byId.set(state.id, state.completed);
  }
  if (approved.some(item => !byId.has(item.id)) || [...byId.keys()].some(id => !approved.some(item => item.id === id))) {
    invalidRequest();
  }
  return approved.map(item => ({ ...item, completed: byId.get(item.id) }));
}

function checklistPatch(booking, submittedStates) {
  const fieldChecklist = reconstructChecklist(booking, submittedStates);
  return {
    fieldChecklist,
    fieldChecklistSummary: {
      completed: fieldChecklist.filter(item => item.completed).length,
      total: fieldChecklist.length,
    },
  };
}

function buildEmployeeFieldExecutionMutation({ booking, request, uid, now }) {
  if (request.action === 'start') {
    if (booking.fieldStatus === 'completed') jobStateConflict();
    if (booking.fieldStatus === 'in_progress') return null;
    return {
      fieldStatus: 'in_progress',
      fieldStatusUpdatedAt: now,
      fieldStartedAt: now,
      fieldStartedByUid: uid,
      updatedAt: now,
    };
  }

  if (request.action === 'save_notes') {
    return {
      fieldNotes: request.fieldNotes,
      fieldIssue: request.fieldIssue,
      updatedAt: now,
    };
  }

  if (request.action === 'save_checklist') {
    return { ...checklistPatch(booking, request.checklist), updatedAt: now };
  }

  const patch = checklistPatch(booking, request.checklist);
  if (patch.fieldChecklist.some(item => item.required && !item.completed)) {
    fail('incomplete_required_checklist', 422, 'Required checklist items are incomplete');
  }
  if (booking.fieldStatus === 'completed') return null;
  return {
    fieldStatus: 'completed',
    fieldStatusUpdatedAt: now,
    completedAt: now,
    completedByUid: uid,
    ...patch,
    fieldNotes: request.fieldNotes,
    fieldIssue: request.fieldIssue,
    updatedAt: now,
  };
}

function assertEmployeeCanMutateBooking(booking, employee, now) {
  const today = localDateKey(now, employee.tenantTimeZone);
  if (!today || !bookingMatchesEmployeeJobVisibility(booking, {
    uid: employee.uid,
    today,
    timeZone: employee.tenantTimeZone,
  })) {
    fail('job_unavailable', 404, 'Job unavailable');
  }
}

function safeMutationResult(bookingIdValue, booking, employee) {
  return {
    success: true,
    schemaVersion: JOB_PACKET_SCHEMA_VERSION,
    job: employeeJobPacket(bookingIdValue, booking, employee.tenantTimeZone),
  };
}

module.exports = {
  CHECKLIST_MAX_JOB_AID_STEPS,
  EmployeeFieldExecutionError,
  FIELD_ISSUE_MAX_LENGTH,
  FIELD_NOTES_MAX_LENGTH,
  assertEmployeeCanMutateBooking,
  buildEmployeeFieldExecutionMutation,
  currentApprovedChecklist,
  parseEmployeeFieldExecutionRequest,
  reconstructChecklist,
  safeMutationResult,
};
