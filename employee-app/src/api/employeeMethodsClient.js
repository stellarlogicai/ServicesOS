const EMPLOYEE_METHOD_LIMIT = 100;
const EMPLOYEE_METHOD_STATUSES = new Set(["approved", "restricted"]);
const EMPLOYEE_METHOD_CLASSIFICATIONS = new Set(["cleaning", "sanitizing", "disinfecting"]);

class EmployeeMethodsError extends Error {
  constructor() {
    super("Approved method guidance is currently unavailable.");
    this.name = "EmployeeMethodsError";
  }
}

function segment(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > 128 || normalized.includes("/") || normalized === "." || normalized === "..") {
    throw new EmployeeMethodsError();
  }
  return normalized;
}

function boundedText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function boundedList(value, maxItems, maxLength) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(item => typeof item === "string" && item.trim())
    .map(item => item.trim().slice(0, maxLength))
    .slice(0, maxItems);
}

function formulaVariants(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(item => item && typeof item === "object" && !Array.isArray(item))
    .slice(0, 10)
    .map(item => ({
      id: boundedText(item.id, 128),
      name: boundedText(item.name, 120),
      measurements: boundedList(item.measurements, 20, 200),
      expectedYield: boundedText(item.expectedYield, 200),
    }));
}

function sanitizeEmployeeMethodRecord(record, { tenantId, recordId } = {}) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;
  const expectedTenantId = segment(tenantId);
  const expectedRecordId = segment(recordId);
  if (
    record.id !== expectedRecordId ||
    record.tenantId !== expectedTenantId ||
    record.employeeVisible !== true ||
    !EMPLOYEE_METHOD_STATUSES.has(record.status) ||
    !EMPLOYEE_METHOD_CLASSIFICATIONS.has(record.classification)
  ) return null;

  const name = boundedText(record.name, 160);
  if (!name) return null;
  return {
    id: expectedRecordId,
    name,
    classification: record.classification,
    status: record.status,
    intendedUses: boundedList(record.intendedUses, 30, 200),
    compatibleSurfaces: boundedList(record.compatibleSurfaces, 30, 200),
    prohibitedSurfaces: boundedList(record.prohibitedSurfaces, 30, 200),
    requiredTools: boundedList(record.requiredTools, 30, 200),
    requiredPPE: boundedList(record.requiredPPE, 30, 200),
    dwellTime: boundedText(record.dwellTime, 200),
    contactTime: boundedText(record.contactTime, 200),
    applicationInstructions: boundedText(record.applicationInstructions, 1000),
    labelDirections: boundedText(record.labelDirections, 1000),
    rinseInstructions: boundedText(record.rinseInstructions, 500),
    dryingInstructions: boundedText(record.dryingInstructions, 500),
    ingredients: boundedList(record.ingredients, 30, 200),
    measurements: boundedList(record.measurements, 30, 200),
    formulaVariants: formulaVariants(record.formulaVariants),
    dilutionInstructions: boundedText(record.dilutionInstructions, 500),
    mixingOrder: boundedList(record.mixingOrder, 30, 500),
    dangerousCombinations: boundedList(record.dangerousCombinations, 30, 500),
  };
}

function createEmployeeMethodsClient({ getRecord }) {
  return {
    async getEmployeeMethodsByIds(tenantId, recordIds = []) {
      const safeTenantId = segment(tenantId);
      if (safeTenantId === "DEFAULT" || !Array.isArray(recordIds)) throw new EmployeeMethodsError();
      const ids = [...new Set(recordIds.map(segment))].slice(0, EMPLOYEE_METHOD_LIMIT);
      const records = await Promise.all(ids.map(async recordId => {
        try {
          const record = await getRecord(safeTenantId, recordId);
          return sanitizeEmployeeMethodRecord(record, { tenantId: safeTenantId, recordId });
        } catch {
          return null;
        }
      }));
      return records.filter(Boolean);
    },
  };
}

module.exports = {
  EMPLOYEE_METHOD_LIMIT,
  EmployeeMethodsError,
  createEmployeeMethodsClient,
  sanitizeEmployeeMethodRecord,
};
