const { buildEmployeeFunctionUrl } = require("./employeeSessionClient");
const {
  EmployeeJobsClientError,
  validateEmployeeJobPayload,
} = require("./employeeJobsClient");

const EMPLOYEE_EXECUTION_FUNCTION_NAME = "employeeFieldExecutionGateway";
const CHECKLIST_ITEM_LIMIT = 500;
const FIELD_NOTES_MAX_LENGTH = 1000;
const FIELD_ISSUE_MAX_LENGTH = 750;

function invalidRequest() {
  throw new EmployeeJobsClientError("Your job update could not be saved. Try again.", "invalid_request", 400);
}

function bookingId(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > 128 || normalized.includes("/") || normalized === "." || normalized === "..") {
    invalidRequest();
  }
  return normalized;
}

function boundedText(value, maxLength) {
  if (typeof value !== "string" || value.length > maxLength) invalidRequest();
  return value;
}

function completionStates(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > CHECKLIST_ITEM_LIMIT) invalidRequest();
  const seen = new Set();
  return value.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) invalidRequest();
    const keys = Object.keys(item).sort();
    if (keys.length !== 2 || keys[0] !== "completed" || keys[1] !== "id") invalidRequest();
    const id = typeof item.id === "string" ? item.id.trim() : "";
    if (!id || id.length > 128 || seen.has(id) || typeof item.completed !== "boolean") invalidRequest();
    seen.add(id);
    return { id, completed: item.completed };
  });
}

function createEmployeeFieldExecutionClient({ auth, runtimeConfig, fetchImpl }) {
  async function mutate(body) {
    const user = auth.currentUser;
    if (!user || typeof user.getIdToken !== "function") {
      throw new EmployeeJobsClientError("Sign in to update this job.", "unauthenticated", 401);
    }

    let token;
    try {
      token = await user.getIdToken();
    } catch {
      throw new EmployeeJobsClientError("Your job update could not be saved. Try again.");
    }

    let response;
    try {
      response = await fetchImpl(
        buildEmployeeFunctionUrl(runtimeConfig, EMPLOYEE_EXECUTION_FUNCTION_NAME),
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
      throw new EmployeeJobsClientError("Your job update could not be saved. Try again.");
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success !== true) {
      const code = typeof payload.code === "string" ? payload.code : "field_execution_service_unavailable";
      throw new EmployeeJobsClientError("Your job update could not be saved. Try again.", code, response.status);
    }
    return validateEmployeeJobPayload(payload);
  }

  return {
    async startEmployeeJob(value) {
      return mutate({ action: "start", bookingId: bookingId(value) });
    },
    async saveEmployeeChecklist(value, checklist) {
      return mutate({
        action: "save_checklist",
        bookingId: bookingId(value),
        checklist: completionStates(checklist),
      });
    },
    async saveEmployeeNotes(value, fieldNotes, fieldIssue) {
      return mutate({
        action: "save_notes",
        bookingId: bookingId(value),
        fieldNotes: boundedText(fieldNotes, FIELD_NOTES_MAX_LENGTH),
        fieldIssue: boundedText(fieldIssue, FIELD_ISSUE_MAX_LENGTH),
      });
    },
    async completeEmployeeJob(value, checklist, fieldNotes, fieldIssue) {
      return mutate({
        action: "complete",
        bookingId: bookingId(value),
        checklist: completionStates(checklist),
        fieldNotes: boundedText(fieldNotes, FIELD_NOTES_MAX_LENGTH),
        fieldIssue: boundedText(fieldIssue, FIELD_ISSUE_MAX_LENGTH),
      });
    },
  };
}

module.exports = {
  FIELD_ISSUE_MAX_LENGTH,
  FIELD_NOTES_MAX_LENGTH,
  createEmployeeFieldExecutionClient,
};
