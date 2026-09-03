const EMPLOYEE_SESSION_FUNCTION_NAME = "employeeSessionGateway";
const EMPLOYEE_SESSION_REGION = "us-central1";

class EmployeeSessionClientError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "EmployeeSessionClientError";
    this.code = code;
  }
}

function exactKeys(value, allowedKeys, requiredKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return requiredKeys.every((key) => keys.includes(key)) &&
    keys.every((key) => allowedKeys.includes(key));
}

function buildEmployeeSessionGatewayUrl(runtimeConfig) {
  const projectId = typeof runtimeConfig?.projectId === "string"
    ? runtimeConfig.projectId.trim()
    : "";
  if (!projectId || projectId === "DEFAULT") {
    throw new EmployeeSessionClientError(
      "ServicesOS could not verify your employee account. Try again.",
      "employee_verification_failed"
    );
  }

  if (runtimeConfig.mode === "local-emulator") {
    const host = runtimeConfig.emulator?.host;
    const port = runtimeConfig.emulator?.functionsPort;
    if (!host || !Number.isInteger(port)) {
      throw new EmployeeSessionClientError(
        "ServicesOS could not verify your employee account. Try again.",
        "employee_verification_failed"
      );
    }
    return `http://${host}:${port}/${projectId}/${EMPLOYEE_SESSION_REGION}/${EMPLOYEE_SESSION_FUNCTION_NAME}`;
  }

  if (runtimeConfig.mode === "production") {
    return `https://${EMPLOYEE_SESSION_REGION}-${projectId}.cloudfunctions.net/${EMPLOYEE_SESSION_FUNCTION_NAME}`;
  }

  throw new EmployeeSessionClientError(
    "ServicesOS could not verify your employee account. Try again.",
    "employee_verification_failed"
  );
}

function validateEmployeeSessionPayload(payload, expectedUid) {
  if (!exactKeys(payload, ["success", "employee"], ["success", "employee"]) || payload.success !== true) {
    throw new EmployeeSessionClientError(
      "ServicesOS could not verify your employee account. Try again.",
      "employee_verification_failed"
    );
  }

  const employee = payload.employee;
  const validShape = exactKeys(
    employee,
    ["uid", "tenantId", "role", "displayName", "email"],
    ["uid", "tenantId", "role"]
  );
  const tenantId = typeof employee?.tenantId === "string" ? employee.tenantId.trim() : "";
  if (
    !validShape ||
    employee.uid !== expectedUid ||
    employee.role !== "employee" ||
    !tenantId ||
    tenantId === "DEFAULT" ||
    ("displayName" in employee && typeof employee.displayName !== "string") ||
    ("email" in employee && typeof employee.email !== "string")
  ) {
    throw new EmployeeSessionClientError(
      "ServicesOS could not verify your employee account. Try again.",
      "employee_verification_failed"
    );
  }

  return { ...employee, tenantId };
}

function createEmployeeSessionClient({ auth, runtimeConfig, fetchImpl }) {
  return async function verifyEmployeeSession(firebaseUser = auth.currentUser) {
    if (!firebaseUser || typeof firebaseUser.getIdToken !== "function") {
      throw new EmployeeSessionClientError(
        "Your employee account is not available. Contact your business administrator.",
        "employee_access_denied"
      );
    }

    let token;
    try {
      token = await firebaseUser.getIdToken();
    } catch {
      throw new EmployeeSessionClientError(
        "ServicesOS could not verify your employee account. Try again.",
        "employee_verification_failed"
      );
    }

    let response;
    try {
      response = await fetchImpl(buildEmployeeSessionGatewayUrl(runtimeConfig), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      });
    } catch {
      throw new EmployeeSessionClientError(
        "ServicesOS could not verify your employee account. Try again.",
        "employee_verification_failed"
      );
    }

    const payload = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) {
      throw new EmployeeSessionClientError(
        "Your employee account is not available. Contact your business administrator.",
        "employee_access_denied"
      );
    }
    if (!response.ok) {
      throw new EmployeeSessionClientError(
        "ServicesOS could not verify your employee account. Try again.",
        "employee_verification_failed"
      );
    }

    return validateEmployeeSessionPayload(payload, firebaseUser.uid);
  };
}

module.exports = {
  EmployeeSessionClientError,
  buildEmployeeSessionGatewayUrl,
  createEmployeeSessionClient,
  validateEmployeeSessionPayload,
};
