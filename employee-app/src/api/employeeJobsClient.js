const { buildEmployeeFunctionUrl } = require("./employeeSessionClient");

const EMPLOYEE_JOB_FUNCTION_NAME = "employeeJobPacketGateway";
const JOB_PACKET_SCHEMA_VERSION = 1;
const JOB_LIST_LIMIT = 50;
const CHECKLIST_ITEM_LIMIT = 500;

class EmployeeJobsClientError extends Error {
  constructor(message, code = "job_service_unavailable", status = 0) {
    super(message);
    this.name = "EmployeeJobsClientError";
    this.code = code;
    this.status = status;
  }
}

function malformedPayload() {
  throw new EmployeeJobsClientError("Your jobs could not be loaded. Try again.");
}

function objectValue(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) malformedPayload();
  return value;
}

function text(value) {
  if (typeof value !== "string") malformedPayload();
  return value;
}

function nullableText(value) {
  if (value !== null && typeof value !== "string") malformedPayload();
  return value;
}

function nonnegativeInteger(value) {
  if (!Number.isInteger(value) || value < 0) malformedPayload();
  return value;
}

function dateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) malformedPayload();
  return value;
}

function stringArray(value, limit) {
  if (!Array.isArray(value) || value.length > limit || value.some(item => typeof item !== "string")) {
    malformedPayload();
  }
  return value.map(item => item);
}

function safeSchedule(value) {
  const schedule = objectValue(value);
  return {
    date: nullableText(schedule.date),
    startTime: nullableText(schedule.startTime),
    endTime: nullableText(schedule.endTime),
    scheduledAt: nullableText(schedule.scheduledAt),
  };
}

function safeSafety(value) {
  const safety = objectValue(value);
  const pets = objectValue(safety.pets);
  if (typeof pets.present !== "boolean") malformedPayload();
  return {
    hazards: stringArray(safety.hazards, 30),
    surfaceNotes: text(safety.surfaceNotes),
    allergyOrProductRestrictions: text(safety.allergyOrProductRestrictions),
    pets: {
      present: pets.present,
      count: nonnegativeInteger(pets.count),
      types: stringArray(pets.types, 10),
      hairLevel: text(pets.hairLevel),
    },
  };
}

function safeAccessSecurity(value) {
  const accessSecurity = objectValue(value);
  return { instructions: text(accessSecurity.instructions) };
}

function safeJobAidStep(value) {
  const step = objectValue(value);
  return {
    label: text(step.label),
    note: text(step.note),
    condition: text(step.condition),
  };
}

function safeChecklistItem(value) {
  const item = objectValue(value);
  if (typeof item.required !== "boolean" || typeof item.completed !== "boolean") malformedPayload();
  if (!Array.isArray(item.jobAidSteps) || item.jobAidSteps.length > 50) malformedPayload();
  return {
    id: text(item.id),
    area: text(item.area),
    fixtureOrSurface: text(item.fixtureOrSurface),
    label: text(item.label),
    completionCriteria: text(item.completionCriteria),
    jobAidSteps: item.jobAidSteps.map(safeJobAidStep),
    warnings: stringArray(item.warnings, 10),
    note: text(item.note),
    condition: text(item.condition),
    required: item.required,
    completed: item.completed,
    approvedMethodIds: stringArray(item.approvedMethodIds, 20),
    preferredMethodId: nullableText(item.preferredMethodId),
  };
}

function safeBookingId(value) {
  const bookingId = typeof value === "string" ? value.trim() : "";
  if (!bookingId || bookingId.length > 128 || bookingId.includes("/") || bookingId === "." || bookingId === "..") {
    throw new EmployeeJobsClientError("This job could not be loaded. Try again.", "invalid_request", 400);
  }
  return bookingId;
}

function sanitizeEmployeeJobSummary(value) {
  const job = objectValue(value);
  return {
    id: safeBookingId(job.id),
    schedule: safeSchedule(job.schedule),
    serviceType: text(job.serviceType),
    customerName: text(job.customerName),
    address: text(job.address),
    status: text(job.status),
    fieldStatus: text(job.fieldStatus),
  };
}

function sanitizeEmployeeJobPacket(value) {
  const job = objectValue(value);
  const customer = objectValue(job.customer);
  const location = objectValue(job.location);
  const checklist = objectValue(job.checklist);
  if (typeof checklist.ready !== "boolean" || !Array.isArray(checklist.items) || checklist.items.length > CHECKLIST_ITEM_LIMIT) {
    malformedPayload();
  }
  const items = checklist.ready ? checklist.items.map(safeChecklistItem) : [];
  const approvedScope = job.approvedScope == null ? null : objectValue(job.approvedScope);
  return {
    id: safeBookingId(job.id),
    schedule: safeSchedule(job.schedule),
    serviceType: text(job.serviceType),
    customer: {
      name: text(customer.name),
      phone: text(customer.phone),
    },
    location: { address: text(location.address) },
    status: text(job.status),
    fieldStatus: text(job.fieldStatus),
    instructions: text(job.instructions),
    safety: safeSafety(job.safety),
    accessSecurity: safeAccessSecurity(job.accessSecurity),
    checklist: {
      ready: checklist.ready,
      items,
      completed: nonnegativeInteger(checklist.completed),
      total: nonnegativeInteger(checklist.total),
      notes: text(checklist.notes),
      warnings: stringArray(checklist.warnings, 50),
    },
    fieldNotes: text(job.fieldNotes),
    fieldIssue: text(job.fieldIssue),
    ...(approvedScope ? { approvedScope: {
      version: approvedScope.version == null ? null : nonnegativeInteger(approvedScope.version),
      approvedAt: approvedScope.approvedAt == null ? null : text(approvedScope.approvedAt),
      serviceType: text(approvedScope.serviceType),
      serviceItems: Array.isArray(approvedScope.serviceItems) ? approvedScope.serviceItems.map(item => ({
        id: text(objectValue(item).id),
        label: text(objectValue(item).label),
        required: objectValue(item).required === true,
      })) : [],
      selectedAddOns: stringArray(approvedScope.selectedAddOns, 100),
    } } : {}),
  };
}

function validateEnvelope(payload) {
  const response = objectValue(payload);
  if (response.success !== true || response.schemaVersion !== JOB_PACKET_SCHEMA_VERSION) malformedPayload();
  return response;
}

function validateEmployeeJobListPayload(payload) {
  const response = validateEnvelope(payload);
  if (!Array.isArray(response.jobs) || response.jobs.length > JOB_LIST_LIMIT) malformedPayload();
  return {
    todayDate: dateKey(response.todayDate),
    jobs: response.jobs.map(sanitizeEmployeeJobSummary),
  };
}

function validateEmployeeJobPayload(payload) {
  return sanitizeEmployeeJobPacket(validateEnvelope(payload).job);
}

function isEmployeeJobAccessLossError(error) {
  return error instanceof EmployeeJobsClientError &&
    ([401, 403, 404].includes(error.status) ||
      ["unauthenticated", "forbidden", "job_unavailable"].includes(error.code));
}

function createEmployeeJobsClient({ auth, runtimeConfig, fetchImpl }) {
  async function request(body) {
    const user = auth.currentUser;
    if (!user || typeof user.getIdToken !== "function") {
      throw new EmployeeJobsClientError("Sign in to view your jobs.", "unauthenticated", 401);
    }

    let token;
    try {
      token = await user.getIdToken();
    } catch {
      throw new EmployeeJobsClientError("Your jobs could not be loaded. Try again.");
    }

    let response;
    try {
      response = await fetchImpl(
        buildEmployeeFunctionUrl(runtimeConfig, EMPLOYEE_JOB_FUNCTION_NAME),
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }
      );
    } catch {
      throw new EmployeeJobsClientError("Your jobs could not be loaded. Try again.");
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success !== true) {
      const code = typeof payload.code === "string" ? payload.code : "job_service_unavailable";
      const message = code === "job_unavailable"
        ? "This job is no longer available."
        : "Your jobs could not be loaded. Try again.";
      throw new EmployeeJobsClientError(message, code, response.status);
    }
    return payload;
  }

  return {
    async listEmployeeJobs() {
      return validateEmployeeJobListPayload(await request({ action: "list" }));
    },
    async getEmployeeJob(bookingId) {
      const id = safeBookingId(bookingId);
      return validateEmployeeJobPayload(await request({ action: "get", bookingId: id }));
    },
  };
}

module.exports = {
  EmployeeJobsClientError,
  createEmployeeJobsClient,
  isEmployeeJobAccessLossError,
  sanitizeEmployeeJobPacket,
  sanitizeEmployeeJobSummary,
  validateEmployeeJobListPayload,
  validateEmployeeJobPayload,
};
