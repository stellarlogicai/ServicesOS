export const CLEANING_RECORD_TYPES = Object.freeze(['company_mix', 'commercial_product']);
export const CLEANING_RECORD_SCOPES = Object.freeze(['system_default', 'tenant']);
export const CLEANING_CLASSIFICATIONS = Object.freeze(['cleaning', 'sanitizing', 'disinfecting']);
export const CLEANING_RECORD_STATUSES = Object.freeze([
  'candidate',
  'pending_review',
  'owner_tested',
  'approved',
  'restricted',
  'rejected',
  'expired',
  'retired',
]);

const EMPLOYEE_USABLE_STATUSES = new Set(['approved', 'restricted']);

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function boolean(value) {
  return value === true;
}

function stringList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(text).filter(Boolean))];
}

function objectList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(item => item && typeof item === 'object' && !Array.isArray(item))
    .map(item => ({ ...item }));
}

export function isEmployeeUsableCleaningRecord(record = {}) {
  return record.employeeVisible === true && EMPLOYEE_USABLE_STATUSES.has(record.status);
}

export function normalizeCleaningRecord(record = {}) {
  const recordType = text(record.recordType);
  const scope = text(record.scope);
  const status = text(record.status);
  const classification = text(record.classification);
  const normalized = {
    id: text(record.id),
    recordType,
    scope,
    tenantId: scope === 'tenant' ? text(record.tenantId) : '',
    name: text(record.name),
    category: text(record.category),
    classification,
    status,
    intendedUses: stringList(record.intendedUses),
    compatibleSurfaces: stringList(record.compatibleSurfaces),
    prohibitedSurfaces: stringList(record.prohibitedSurfaces),
    requiredTools: stringList(record.requiredTools),
    requiredPPE: stringList(record.requiredPPE),
    dwellTime: text(record.dwellTime),
    applicationInstructions: text(record.applicationInstructions),
    rinseInstructions: text(record.rinseInstructions),
    dryingInstructions: text(record.dryingInstructions),
    dangerousCombinations: stringList(record.dangerousCombinations),
    storageInstructions: text(record.storageInstructions),
    shelfLife: text(record.shelfLife),
    evidence: stringList(record.evidence),
    ownerReviewNotes: text(record.ownerReviewNotes),
    employeeVisible: isEmployeeUsableCleaningRecord(record),
    createdAt: record.createdAt ?? null,
    createdBy: text(record.createdBy),
    updatedAt: record.updatedAt ?? null,
    updatedBy: text(record.updatedBy),
    reviewedAt: record.reviewedAt ?? null,
    reviewedBy: text(record.reviewedBy),
    sourceDefaultId: text(record.sourceDefaultId),
    sourceDefaultName: text(record.sourceDefaultName),
    sourceDefaultVersion: text(record.sourceDefaultVersion),
    adoptedAt: record.adoptedAt ?? null,
    adoptedBy: text(record.adoptedBy),
  };

  if (recordType === 'company_mix') {
    return {
      ...normalized,
      ingredients: stringList(record.ingredients),
      measurements: stringList(record.measurements),
      formulaVariants: objectList(record.formulaVariants),
      expectedYield: text(record.expectedYield),
      bottleSize: text(record.bottleSize),
      approvedContainer: text(record.approvedContainer),
      mixingOrder: stringList(record.mixingOrder),
      preparationFrequency: text(record.preparationFrequency),
      mixedOnLabelRequired: boolean(record.mixedOnLabelRequired),
      discardDateLabelRequired: boolean(record.discardDateLabelRequired),
    };
  }

  return {
    ...normalized,
    brand: text(record.brand),
    productName: text(record.productName),
    variant: text(record.variant),
    manufacturer: text(record.manufacturer),
    containerSize: text(record.containerSize),
    UPC: text(record.UPC),
    productCategory: text(record.productCategory),
    donatedProduct: boolean(record.donatedProduct),
    containerCondition: text(record.containerCondition),
    labelInformationComplete: boolean(record.labelInformationComplete),
    labelDirections: text(record.labelDirections),
    dilutionInstructions: text(record.dilutionInstructions),
    requiresDilution: boolean(record.requiresDilution),
    contactTime: text(record.contactTime),
    rinseRequired: boolean(record.rinseRequired),
    epaRegistrationNumber: text(record.epaRegistrationNumber),
    sdsReference: text(record.sdsReference),
    expirationDate: text(record.expirationDate),
    dateCode: text(record.dateCode),
  };
}

export function validateCleaningRecord(record = {}) {
  const normalized = normalizeCleaningRecord(record);
  const errors = [];

  if (!CLEANING_RECORD_TYPES.includes(normalized.recordType)) errors.push('Record type is invalid.');
  if (!CLEANING_RECORD_SCOPES.includes(normalized.scope)) errors.push('Record scope is invalid.');
  if (!CLEANING_CLASSIFICATIONS.includes(normalized.classification)) errors.push('Classification is invalid.');
  if (!CLEANING_RECORD_STATUSES.includes(normalized.status)) errors.push('Status is invalid.');
  if (!normalized.id) errors.push('Record ID is required.');
  if (!normalized.name) errors.push('Name is required.');
  if (!normalized.category) errors.push('Category is required.');
  if (normalized.scope === 'tenant' && !normalized.tenantId) errors.push('Tenant ID is required.');
  if (normalized.scope === 'system_default' && normalized.tenantId) errors.push('System defaults cannot have a tenant ID.');
  if (normalized.recordType === 'company_mix' && normalized.classification !== 'cleaning') {
    errors.push('Company-mixed records must be classified as cleaning only.');
  }
  if (normalized.employeeVisible && !EMPLOYEE_USABLE_STATUSES.has(normalized.status)) {
    errors.push('Only approved or restricted records may be employee-visible.');
  }

  return { valid: errors.length === 0, errors, record: normalized };
}

export function getCommercialApprovalIssues(record = {}) {
  const value = normalizeCleaningRecord({ ...record, recordType: 'commercial_product' });
  const issues = [];
  if (!value.brand || !value.productName || !value.variant || !value.manufacturer) {
    issues.push('Enter the exact brand, product, variant, and manufacturer.');
  }
  if (!value.containerSize || !value.productCategory) issues.push('Enter the container size and product category.');
  if (value.containerCondition !== 'good') issues.push('Confirm the container is in good condition.');
  if (!value.labelInformationComplete || !value.labelDirections) issues.push('Enter the complete readable label directions.');
  if (value.intendedUses.length === 0) issues.push('Enter at least one label-supported intended use.');
  if (value.compatibleSurfaces.length === 0 && value.prohibitedSurfaces.length === 0) {
    issues.push('Enter label-supported surface guidance.');
  }
  if (value.requiresDilution && !value.dilutionInstructions) issues.push('Enter the label dilution instructions.');
  if (['sanitizing', 'disinfecting'].includes(value.classification) && !value.contactTime) {
    issues.push('Enter the exact label contact time for sanitizing or disinfecting claims.');
  }
  if (value.classification === 'disinfecting' && !value.epaRegistrationNumber) {
    issues.push('Enter the EPA registration number for the disinfecting claim.');
  }
  if (value.requiredPPE.length === 0) issues.push('Enter the label PPE requirement, including none if the label says none.');
  if (value.dangerousCombinations.length === 0) issues.push('Enter the label warnings and dangerous combinations.');
  if (!value.ownerReviewNotes) issues.push('Add owner review notes.');
  return issues;
}

export function getCompanyMethodApprovalIssues(record = {}) {
  const value = normalizeCleaningRecord({ ...record, recordType: 'company_mix' });
  const issues = [];
  if (!value.sourceDefaultId || !value.sourceDefaultName || !value.sourceDefaultVersion) {
    issues.push('System-default provenance is required.');
  }
  if (value.classification !== 'cleaning') issues.push('Company methods must remain cleaning-only.');
  if (value.intendedUses.length === 0) issues.push('The method must include an approved intended use.');
  if (value.dangerousCombinations.length === 0) issues.push('The method must retain its safety warnings.');
  if (!value.applicationInstructions && value.measurements.length === 0 && value.formulaVariants.length === 0) {
    issues.push('The method must include application or formula instructions.');
  }
  if (!value.ownerReviewNotes) issues.push('Add owner review notes.');
  return issues;
}

export function getCleaningRecordApprovalIssues(record = {}) {
  return record.recordType === 'company_mix'
    ? getCompanyMethodApprovalIssues(record)
    : getCommercialApprovalIssues(record);
}

export function buildSystemDefaultAdoption(systemDefault, { id, tenantId, actorUid, now = null } = {}) {
  const source = normalizeCleaningRecord(systemDefault);
  if (source.scope !== 'system_default' || source.recordType !== 'company_mix') {
    throw new Error('Only immutable system-default company methods can be adopted.');
  }
  const normalized = normalizeCleaningRecord({
    ...source,
    id,
    scope: 'tenant',
    tenantId,
    status: 'pending_review',
    employeeVisible: false,
    ownerReviewNotes: '',
    sourceDefaultId: source.id,
    sourceDefaultName: source.name,
    sourceDefaultVersion: text(source.updatedAt) || 'unknown',
    adoptedAt: now,
    adoptedBy: actorUid,
    createdAt: now,
    createdBy: actorUid,
    updatedAt: now,
    updatedBy: actorUid,
    reviewedAt: null,
    reviewedBy: '',
  });
  const result = validateCleaningRecord(normalized);
  if (!result.valid) throw new Error(result.errors.join(' '));
  return result.record;
}

export function buildCommercialProductCreate(record, { tenantId, actorUid, now = null } = {}) {
  const normalized = normalizeCleaningRecord({
    ...record,
    recordType: 'commercial_product',
    scope: 'tenant',
    tenantId,
    status: 'pending_review',
    employeeVisible: false,
    createdAt: now,
    createdBy: actorUid,
    updatedAt: now,
    updatedBy: actorUid,
    reviewedAt: null,
    reviewedBy: '',
  });
  const result = validateCleaningRecord(normalized);
  if (!result.valid) throw new Error(result.errors.join(' '));
  return result.record;
}

export function buildCommercialProductDetailsUpdate(existing, proposed, { actorUid, now = null } = {}) {
  if (existing.recordType !== 'commercial_product' || existing.scope !== 'tenant') {
    throw new Error('Only tenant commercial products can be updated.');
  }
  const next = normalizeCleaningRecord({
    ...existing,
    ...proposed,
    id: existing.id,
    recordType: existing.recordType,
    scope: existing.scope,
    tenantId: existing.tenantId,
    status: existing.status,
    employeeVisible: existing.employeeVisible,
    createdAt: existing.createdAt,
    createdBy: existing.createdBy,
    updatedAt: now,
    updatedBy: actorUid,
    reviewedAt: existing.reviewedAt,
    reviewedBy: existing.reviewedBy,
  });
  const result = validateCleaningRecord(next);
  if (!result.valid) throw new Error(result.errors.join(' '));
  return result.record;
}

export function buildTenantCleaningRecordReview(record, action, { actorUid, ownerReviewNotes, now = null } = {}) {
  const allowedActions = new Set(['approved', 'restricted', 'rejected', 'expired', 'retired']);
  if (!allowedActions.has(action)) throw new Error('Review action is invalid.');
  if (!CLEANING_RECORD_TYPES.includes(record.recordType) || record.scope !== 'tenant') {
    throw new Error('Only tenant cleaning records can be reviewed.');
  }

  const next = normalizeCleaningRecord({
    ...record,
    status: action,
    ownerReviewNotes: ownerReviewNotes ?? record.ownerReviewNotes,
    employeeVisible: action === 'approved' || action === 'restricted',
    reviewedAt: now,
    reviewedBy: actorUid,
    updatedAt: now,
    updatedBy: actorUid,
  });

  if (action === 'approved' || action === 'restricted') {
    const issues = getCleaningRecordApprovalIssues(next);
    if (issues.length > 0) throw new Error(issues.join(' '));
  }
  if (action === 'restricted' && !next.ownerReviewNotes && next.prohibitedSurfaces.length === 0) {
    throw new Error('Restricted products require visible restriction details.');
  }

  const result = validateCleaningRecord(next);
  if (!result.valid) throw new Error(result.errors.join(' '));
  return result.record;
}

export function buildCommercialProductReview(record, action, options = {}) {
  if (record.recordType !== 'commercial_product') {
    throw new Error('Only tenant commercial products can use the commercial product review helper.');
  }
  return buildTenantCleaningRecordReview(record, action, options);
}
