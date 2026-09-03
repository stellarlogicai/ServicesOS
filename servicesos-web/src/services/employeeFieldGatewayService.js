import { auth } from '../firebase';

const EMPLOYEE_JOB_FUNCTION = 'employeeJobPacketGateway';
const EMPLOYEE_EXECUTION_FUNCTION = 'employeeFieldExecutionGateway';
const LOCAL_PROJECT_ID = 'demo-servicesos-v1-smoke-local';

export class EmployeeFieldGatewayError extends Error {
  constructor(message, { code = 'gateway_unavailable', status = 0 } = {}) {
    super(message);
    this.name = 'EmployeeFieldGatewayError';
    this.code = code;
    this.status = status;
  }
}

function normalizedBaseUrl(value) {
  return typeof value === 'string' ? value.trim().replace(/\/+$/, '') : '';
}

function localEndpointAllowed(value, projectId) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) &&
      ['127.0.0.1', 'localhost', '::1'].includes(url.hostname) &&
      url.pathname.split('/').includes(projectId);
  } catch {
    return false;
  }
}

function productionEndpointAllowed(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export function resolveEmployeeGatewayBaseUrl(env = import.meta.env) {
  const projectId = typeof env.VITE_FIREBASE_PROJECT_ID === 'string'
    ? env.VITE_FIREBASE_PROJECT_ID.trim()
    : '';
  const emulatorMode = env.VITE_USE_FIREBASE_EMULATORS === 'true';
  const configured = normalizedBaseUrl(env.VITE_FUNCTIONS_URL);

  if (emulatorMode) {
    if (projectId !== LOCAL_PROJECT_ID) {
      throw new EmployeeFieldGatewayError('Employee gateway configuration is unavailable.');
    }
    if (configured) {
      if (!localEndpointAllowed(configured, projectId)) {
        throw new EmployeeFieldGatewayError('Employee gateway emulator configuration is unsafe.');
      }
      return configured;
    }
    const host = typeof env.VITE_FIREBASE_FUNCTIONS_EMULATOR_HOST === 'string'
      ? env.VITE_FIREBASE_FUNCTIONS_EMULATOR_HOST.trim()
      : '';
    const port = Number(env.VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT || 5001);
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
      throw new EmployeeFieldGatewayError('Employee gateway emulator configuration is unavailable.');
    }
    return `http://${host}:${port}/${projectId}/us-central1`;
  }

  if (configured) {
    if (!productionEndpointAllowed(configured)) {
      throw new EmployeeFieldGatewayError('Employee gateway configuration is unavailable.');
    }
    return configured;
  }
  if (!projectId || projectId === LOCAL_PROJECT_ID) {
    throw new EmployeeFieldGatewayError('Employee gateway configuration is unavailable.');
  }
  return `https://us-central1-${projectId}.cloudfunctions.net`;
}

function text(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function nullableText(value) {
  return typeof value === 'string' ? value : null;
}

function safeSchedule(value) {
  const schedule = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    date: nullableText(schedule.date),
    startTime: nullableText(schedule.startTime),
    endTime: nullableText(schedule.endTime),
    scheduledAt: nullableText(schedule.scheduledAt),
  };
}

function safeJobAidStep(value) {
  const step = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    label: text(step.label),
    note: text(step.note),
    condition: text(step.condition),
  };
}

function safeChecklistItem(value) {
  const item = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    id: text(item.id),
    area: text(item.area),
    fixtureOrSurface: text(item.fixtureOrSurface),
    label: text(item.label),
    completionCriteria: text(item.completionCriteria),
    jobAidSteps: Array.isArray(item.jobAidSteps) ? item.jobAidSteps.map(safeJobAidStep) : [],
    warnings: Array.isArray(item.warnings) ? item.warnings.filter(entry => typeof entry === 'string') : [],
    note: text(item.note),
    condition: text(item.condition),
    required: item.required === true,
    completed: item.completed === true,
    approvedMethodIds: Array.isArray(item.approvedMethodIds)
      ? item.approvedMethodIds.filter(entry => typeof entry === 'string')
      : [],
    preferredMethodId: nullableText(item.preferredMethodId),
  };
}

export function sanitizeEmployeeJobSummary(value) {
  const job = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    id: text(job.id),
    schedule: safeSchedule(job.schedule),
    serviceType: text(job.serviceType, 'Service not specified'),
    customerName: text(job.customerName, 'Unknown customer'),
    address: text(job.address, 'Address not provided'),
    status: text(job.status),
    fieldStatus: text(job.fieldStatus, 'not_started'),
  };
}

export function sanitizeEmployeeJobPacket(value) {
  const job = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const customer = job.customer && typeof job.customer === 'object' && !Array.isArray(job.customer)
    ? job.customer
    : {};
  const location = job.location && typeof job.location === 'object' && !Array.isArray(job.location)
    ? job.location
    : {};
  const checklist = job.checklist && typeof job.checklist === 'object' && !Array.isArray(job.checklist)
    ? job.checklist
    : {};
  const items = Array.isArray(checklist.items) ? checklist.items.map(safeChecklistItem) : [];
  return {
    id: text(job.id),
    schedule: safeSchedule(job.schedule),
    serviceType: text(job.serviceType, 'Service not specified'),
    customer: {
      name: text(customer.name, 'Unknown customer'),
      phone: text(customer.phone, 'Phone not provided'),
    },
    location: { address: text(location.address, 'Address not provided') },
    status: text(job.status),
    fieldStatus: text(job.fieldStatus, 'not_started'),
    instructions: text(job.instructions, 'No field instructions provided'),
    checklist: {
      ready: checklist.ready === true,
      items: checklist.ready === true ? items : [],
      completed: Number.isInteger(checklist.completed) && checklist.completed >= 0 ? checklist.completed : 0,
      total: Number.isInteger(checklist.total) && checklist.total >= 0 ? checklist.total : items.length,
      notes: text(checklist.notes),
      warnings: Array.isArray(checklist.warnings)
        ? checklist.warnings.filter(entry => typeof entry === 'string')
        : [],
    },
    fieldNotes: text(job.fieldNotes),
    fieldIssue: text(job.fieldIssue),
  };
}

async function employeeGatewayRequest(functionName, body) {
  const user = auth.currentUser;
  if (!user) {
    throw new EmployeeFieldGatewayError('Sign in before using Field Mode.', {
      code: 'unauthenticated',
      status: 401,
    });
  }
  let response;
  try {
    const token = await user.getIdToken();
    response = await fetch(`${resolveEmployeeGatewayBaseUrl()}/${functionName}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new EmployeeFieldGatewayError('Field Mode could not reach the employee service.');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success !== true) {
    throw new EmployeeFieldGatewayError('Field Mode could not complete that request.', {
      code: typeof payload.code === 'string' ? payload.code : 'gateway_unavailable',
      status: response.status,
    });
  }
  return payload;
}

export function isEmployeeFieldAccessLossError(error) {
  return error instanceof EmployeeFieldGatewayError &&
    ([401, 403, 404].includes(error.status) || ['unauthenticated', 'forbidden', 'job_unavailable'].includes(error.code));
}

export async function listEmployeeJobs() {
  const payload = await employeeGatewayRequest(EMPLOYEE_JOB_FUNCTION, { action: 'list' });
  return Array.isArray(payload.jobs) ? payload.jobs.map(sanitizeEmployeeJobSummary).filter(job => job.id) : [];
}

export async function loadEmployeeJobPacket(bookingId) {
  const payload = await employeeGatewayRequest(EMPLOYEE_JOB_FUNCTION, { action: 'get', bookingId });
  return sanitizeEmployeeJobPacket(payload.job);
}

async function mutateEmployeeJob(body) {
  const payload = await employeeGatewayRequest(EMPLOYEE_EXECUTION_FUNCTION, body);
  return sanitizeEmployeeJobPacket(payload.job);
}

export function startEmployeeJob(bookingId) {
  return mutateEmployeeJob({ action: 'start', bookingId });
}

export function saveEmployeeChecklist(bookingId, checklist) {
  return mutateEmployeeJob({ action: 'save_checklist', bookingId, checklist });
}

export function saveEmployeeNotes(bookingId, fieldNotes, fieldIssue) {
  return mutateEmployeeJob({ action: 'save_notes', bookingId, fieldNotes, fieldIssue });
}

export function completeEmployeeJob(bookingId, checklist, fieldNotes, fieldIssue) {
  return mutateEmployeeJob({ action: 'complete', bookingId, checklist, fieldNotes, fieldIssue });
}
