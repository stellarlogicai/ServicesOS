import {
  CHECKLIST_TEMPLATE_IDS,
  getChecklistAddOnItems,
  getChecklistModifierItems,
  getChecklistTemplate,
  getRoomModuleItems,
} from './checklistTemplateRegistry.js';

export const CHECKLIST_SUGGESTED_LABEL = 'Suggested from booking details — owner review required.';
export const CHECKLIST_READINESS = Object.freeze({
  NOT_PREPARED: 'not_prepared',
  NEEDS_ATTENTION: 'needs_attention',
  READY: 'ready',
  COMPLETED: 'completed',
});

const ROOM_SCOPE = Object.freeze({
  bedroom: ['bedrooms'],
  bathroom: ['bathrooms', 'halfBaths'],
  kitchen: ['kitchens', 'kitchenCount'],
  livingRoom: ['livingRooms', 'livingRoomCount'],
  diningRoom: ['diningRooms', 'diningRoomCount'],
  office: ['offices', 'officeCount'],
  laundryRoom: ['laundryRooms', 'laundryRoomCount'],
  closet: ['closets', 'closetCount'],
});

const ADD_ON_ALIASES = Object.freeze({
  oven: ['oven', 'insideOven'],
  fridge: ['fridge', 'insideFridge'],
  insideCabinets: ['insideCabinets', 'cabinetsInside'],
  baseboards: ['baseboards'],
  windows: ['windows'],
  blindCleaning: ['blindCleaning'],
  wallSpotCleaning: ['wallSpotCleaning'],
  laundryRoomCleaning: ['laundryRoomCleaning', 'laundry'],
});

const MAPPED_ADD_ONS = new Set(['oven', 'fridge', 'insideCabinets', 'baseboards', 'windows', 'blindCleaning', 'wallSpotCleaning']);
const KNOWN_UNMAPPED_ADD_ONS = new Set([
  'garageCleaning',
  'closetOrganization',
  'pantryOrganization',
  'basementCleaning',
  'petWasteRemoval',
  'ceilingFanCleaning',
  'dishes',
  'organization',
]);

const normalizeToken = value => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[_\s]+/g, '-');

const numberValue = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const firstObject = (...values) => values.find(value => value && typeof value === 'object' && !Array.isArray(value)) || {};
const firstText = (...values) => values.find(value => typeof value === 'string' && value.trim())?.trim() || '';

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = stableObject(value[key]);
    return result;
  }, {});
}

export function checklistScopeSignature(sourceScopeSnapshot = {}) {
  return JSON.stringify(stableObject(sourceScopeSnapshot));
}

function roomCount(roomCounts, rawInput, aliases) {
  for (const key of aliases) {
    if (Object.hasOwn(roomCounts, key)) return numberValue(roomCounts[key]);
    if (Object.hasOwn(rawInput, key)) return numberValue(rawInput[key]);
  }
  return null;
}

function normalizedRoomCounts(propertySnapshot, requestSnapshot, formData) {
  const roomCounts = firstObject(propertySnapshot.roomCounts);
  const rawInput = firstObject(requestSnapshot.rawInput, formData);
  return Object.fromEntries(Object.entries(ROOM_SCOPE).map(([roomKey, aliases]) => [
    roomKey,
    roomCount(roomCounts, rawInput, aliases),
  ]));
}

function normalizedServiceScope(requestSnapshot, formData) {
  const primary = firstObject(requestSnapshot.serviceScope);
  const rawInput = firstObject(requestSnapshot.rawInput);
  const legacy = firstObject(formData.extras, formData.serviceScope);
  const merged = { ...legacy, ...firstObject(rawInput.extras), ...firstObject(rawInput.serviceScope), ...primary };
  const result = {};

  Object.entries(ADD_ON_ALIASES).forEach(([canonical, aliases]) => {
    const matchingKey = aliases.find(key => Object.hasOwn(merged, key));
    if (matchingKey) result[canonical] = merged[matchingKey] === true;
  });

  KNOWN_UNMAPPED_ADD_ONS.forEach(key => {
    if (merged[key] === true) result[key] = true;
  });
  return result;
}

export function extractBookingChecklistScope(booking = {}) {
  const requestSnapshot = firstObject(booking.requestSnapshot);
  const propertySnapshot = firstObject(booking.propertySnapshot);
  const formData = firstObject(booking.formData);
  const rawInput = firstObject(requestSnapshot.rawInput);
  const household = firstObject(propertySnapshot.household);
  const serviceType = firstText(
    booking.serviceType,
    requestSnapshot.cleaningType,
    formData._cleaningType,
    formData.cleaningType
  );
  const frequency = firstText(requestSnapshot.frequency, rawInput.frequency, formData.frequency);
  const surfaceNotes = firstText(requestSnapshot.surfaceNotes, rawInput.surfaceNotes);
  const accessInstructions = firstText(requestSnapshot.accessInstructions, rawInput.accessInstructions);
  const customerInstructions = firstText(
    requestSnapshot.specialRequests,
    requestSnapshot.customerNotes,
    rawInput.customerNotes,
    rawInput.specialRequests,
    formData.specialRequests
  );
  const hazards = Array.isArray(requestSnapshot.hazards)
    ? requestSnapshot.hazards.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim())
    : [];
  const roomCounts = normalizedRoomCounts(propertySnapshot, requestSnapshot, formData);
  const serviceScope = normalizedServiceScope(requestSnapshot, formData);
  const petCount = numberValue(household.petCount ?? rawInput.petCount ?? formData.petCount) || 0;
  const petHairLevel = normalizeToken(household.petHairLevel ?? rawInput.petHairLevel ?? formData.petHairLevel);

  return {
    serviceType,
    frequency,
    roomCounts,
    serviceScope,
    propertyType: firstText(propertySnapshot.propertyType, rawInput.propertyType, formData.propertyType),
    surfaceNotes,
    hazards,
    accessInstructions,
    customerInstructions,
    petCount,
    petHairLevel,
    serviceAddressPresent: Boolean(firstText(propertySnapshot.address, booking.address, formData.address)),
    sourceEstimateId: firstText(booking.sourceEstimateId, booking.estimateId) || null,
  };
}

export function resolveChecklistTemplateId(scope = {}) {
  const service = normalizeToken(scope.serviceType);
  const frequency = normalizeToken(scope.frequency);

  if (['deep', 'deep-clean', 'initial-deep', 'initial-deep-clean'].includes(service)) return { templateId: 'deep-clean' };
  if (['move-out', 'move-out-clean'].includes(service)) return { templateId: 'move-out-clean' };
  if (['bathroom', 'bathroom-focus'].includes(service)) return { templateId: 'bathroom-focus' };
  if (['kitchen', 'kitchen-focus'].includes(service)) return { templateId: 'kitchen-focus' };
  if (['maintenance', 'maintenance-clean', 'maintenance-cleaning'].includes(service)) return { templateId: 'maintenance' };
  if (['recurring', 'standard-recurring', 'recurring-clean'].includes(service)) return { templateId: 'standard-recurring' };
  if (service === 'standard') {
    return frequency && !['one-time', 'onetime'].includes(frequency)
      ? { templateId: 'standard-recurring' }
      : { templateId: 'standard-one-time' };
  }
  if (service === 'moveout') {
    return { templateId: null, warning: 'Legacy Move-In / Move-Out scope is ambiguous. Select a checklist manually.' };
  }
  if (!service) return { templateId: null, warning: 'No mapped service checklist. Service type is missing.' };
  return { templateId: null, warning: `No mapped service checklist for "${scope.serviceType}".` };
}

function areaRoomKey(area) {
  const normalized = area.toLowerCase();
  if (normalized.startsWith('bedroom')) return 'bedroom';
  if (normalized.startsWith('bathroom')) return 'bathroom';
  if (normalized.startsWith('kitchen')) return 'kitchen';
  if (normalized.startsWith('living room')) return 'livingRoom';
  if (normalized.startsWith('dining room')) return 'diningRoom';
  if (normalized.startsWith('office')) return 'office';
  if (normalized.startsWith('laundry room')) return 'laundryRoom';
  if (normalized.startsWith('closet')) return 'closet';
  return null;
}

function filterTemplateItemsByRooms(items, roomCounts) {
  const hasStructuredCounts = Object.values(roomCounts).some(value => value !== null);
  if (!hasStructuredCounts) return items;
  return items.filter(item => {
    const roomKey = areaRoomKey(item.area);
    return !roomKey || roomCounts[roomKey] === null || roomCounts[roomKey] > 0;
  });
}

function selectedRoomKeys(roomCounts) {
  return Object.entries(roomCounts)
    .filter(([, count]) => count === null || count > 0)
    .map(([key]) => key);
}

function composeRoomItems(template, scope, warnings, componentIds) {
  if (!template.roomMode) return filterTemplateItemsByRooms(template.items, scope.roomCounts);
  const supported = ['bathroom', 'kitchen', 'livingRoom', 'bedroom', 'laundryRoom', 'entryway', 'hallway', 'office'];
  const selected = selectedRoomKeys(scope.roomCounts);
  const items = filterTemplateItemsByRooms(template.items, scope.roomCounts);

  supported.forEach(roomKey => {
    const hasExplicitCount = scope.roomCounts[roomKey] !== null;
    const shouldInclude = roomKey === 'entryway' || roomKey === 'hallway' || !hasExplicitCount || selected.includes(roomKey);
    if (shouldInclude) {
      items.push(...getRoomModuleItems(roomKey, template.roomMode));
      componentIds.push(`room-${roomKey}-${template.roomMode}-v1`);
    }
  });

  if ((scope.roomCounts.diningRoom || 0) > 0) {
    warnings.push(`${template.templateName} has no approved canonical Dining Room module.`);
  }
  return items;
}

function dedupeItems(items) {
  const seen = new Set();
  const duplicatesRemoved = [];
  const result = [];
  items.forEach(item => {
    const key = `${item.area.trim().toLowerCase()}|${item.label.trim().toLowerCase()}`;
    if (seen.has(key)) {
      duplicatesRemoved.push({ area: item.area, label: item.label });
      return;
    }
    seen.add(key);
    result.push({
      ...item,
      jobAidSteps: (item.jobAidSteps || []).map(step => ({ ...step })),
      warnings: Array.isArray(item.warnings) ? [...item.warnings] : [],
      approvedMethodIds: [...(item.approvedMethodIds || [])],
      sourceReferences: [...(item.sourceReferences || [])],
    });
  });
  return { items: result, duplicatesRemoved };
}

function addScopeModules(items, scope, warnings, templateId, componentIds) {
  const additions = [];
  Object.entries(scope.serviceScope).forEach(([key, enabled]) => {
    if (!enabled) return;
    if (key === 'laundryRoomCleaning') {
      additions.push(...getRoomModuleItems('laundryRoom', templateId === 'deep-clean' ? 'deep' : 'core'));
      componentIds.push(`room-laundryRoom-${templateId === 'deep-clean' ? 'deep' : 'core'}-v1`);
    } else if (MAPPED_ADD_ONS.has(key)) {
      additions.push(...getChecklistAddOnItems(key));
      componentIds.push(`addon-${key}-v1`);
    } else {
      warnings.push(`Unknown add-on: ${key}. Owner mapping is required.`);
    }
  });

  if (scope.petCount > 0 || (scope.petHairLevel && scope.petHairLevel !== 'none')) {
    additions.push(...getChecklistModifierItems('pet-home'));
    componentIds.push('modifier-pet-home-v1');
  }
  items.push(...additions);
}

function sourceScopeSnapshot(scope) {
  return {
    serviceType: scope.serviceType || null,
    frequency: scope.frequency || null,
    roomCounts: { ...scope.roomCounts },
    serviceScope: { ...scope.serviceScope },
    propertyType: scope.propertyType || null,
    surfaceNotes: scope.surfaceNotes || null,
    hazards: [...scope.hazards],
    accessInstructions: scope.accessInstructions || null,
    customerInstructions: scope.customerInstructions || null,
    petCount: scope.petCount,
    petHairLevel: scope.petHairLevel || null,
    serviceAddressPresent: scope.serviceAddressPresent,
    sourceEstimateId: scope.sourceEstimateId || null,
  };
}

export function assembleBookingChecklist(booking = {}, options = {}) {
  const scope = extractBookingChecklistScope(booking);
  const resolved = options.templateId
    ? { templateId: CHECKLIST_TEMPLATE_IDS.includes(options.templateId) ? options.templateId : null }
    : resolveChecklistTemplateId(scope);
  const warnings = resolved.warning ? [resolved.warning] : [];
  const componentIds = [];
  const template = resolved.templateId ? getChecklistTemplate(resolved.templateId) : null;

  if (!template) {
    return {
      success: false,
      label: CHECKLIST_SUGGESTED_LABEL,
      readiness: CHECKLIST_READINESS.NOT_PREPARED,
      readinessReasons: warnings.length ? warnings : ['No mapped service checklist.'],
      warnings,
      items: [],
      template: null,
      sourceScopeSnapshot: sourceScopeSnapshot(scope),
      sourceScopeSignature: checklistScopeSignature(sourceScopeSnapshot(scope)),
      duplicatesRemoved: [],
    };
  }

  const items = composeRoomItems(template, scope, warnings, componentIds);
  addScopeModules(items, scope, warnings, template.templateId, componentIds);
  if (!scope.serviceAddressPresent) warnings.push('Missing service address.');
  if (scope.surfaceNotes) warnings.push(`Surface/material note: ${scope.surfaceNotes}`);
  scope.hazards.forEach(hazard => warnings.push(`Safety information: ${hazard}`));
  const deduped = dedupeItems(items);
  const snapshot = sourceScopeSnapshot(scope);

  return {
    success: deduped.items.length > 0,
    label: CHECKLIST_SUGGESTED_LABEL,
    readiness: CHECKLIST_READINESS.NEEDS_ATTENTION,
    readinessReasons: deduped.items.length > 0
      ? ['Checklist has not been reviewed.']
      : ['No valid checklist tasks.'],
    warnings,
    items: deduped.items,
    template,
    sourceScopeSnapshot: snapshot,
    sourceScopeSignature: checklistScopeSignature(snapshot),
    duplicatesRemoved: deduped.duplicatesRemoved,
    componentIds: [...new Set(componentIds)],
  };
}

function approvedSnapshotValid(snapshot) {
  if (snapshot?.ownerApproved !== true || !Array.isArray(snapshot.items) || snapshot.items.length === 0) {
    return false;
  }
  const itemIds = snapshot.items.map(item => (
    typeof item?.id === 'string' ? item.id.trim() : ''
  ));
  return itemIds.every(Boolean) &&
    new Set(itemIds).size === itemIds.length &&
    snapshot.items.every(item => typeof item?.label === 'string' && item.label.trim()) &&
    snapshot.items.some(item => item?.required === true);
}

export function isApprovedChecklistCurrent(booking = {}) {
  const snapshot = booking.jobChecklistSnapshot;
  if (!approvedSnapshotValid(snapshot)) return false;
  const currentScope = sourceScopeSnapshot(extractBookingChecklistScope(booking));
  return snapshot.provenance?.sourceScopeSignature === checklistScopeSignature(currentScope);
}

export function findRecurringChecklistReuseCandidate(booking, allBookings = []) {
  const scope = extractBookingChecklistScope(booking);
  const resolved = resolveChecklistTemplateId(scope);
  if (resolved.templateId !== 'standard-recurring' && resolved.templateId !== 'maintenance') return null;
  const signature = checklistScopeSignature(sourceScopeSnapshot(scope));
  const candidates = allBookings
    .filter(candidate => candidate?.id !== booking?.id && approvedSnapshotValid(candidate?.jobChecklistSnapshot))
    .filter(candidate => {
      const sameCustomer = booking.customerId && candidate.customerId === booking.customerId;
      const sameProperty = booking.propertyId && candidate.propertyId === booking.propertyId;
      return sameCustomer || sameProperty;
    })
    .filter(candidate => candidate.jobChecklistSnapshot?.provenance?.sourceScopeSignature === signature)
    .sort((a, b) => String(b.jobChecklistSnapshot.reviewedAt || '').localeCompare(String(a.jobChecklistSnapshot.reviewedAt || '')));
  return candidates[0] || null;
}

export function bookingChecklistReadiness(booking = {}, allBookings = []) {
  if (booking.fieldStatus === 'completed' || booking.status === 'completed') {
    return { status: CHECKLIST_READINESS.COMPLETED, reasons: [] };
  }
  if (approvedSnapshotValid(booking.jobChecklistSnapshot) && !isApprovedChecklistCurrent(booking)) {
    return { status: CHECKLIST_READINESS.NEEDS_ATTENTION, reasons: ['Booking scope changed since prior approval.'] };
  }
  if (booking.jobChecklistSnapshot?.ownerApproved === true && !approvedSnapshotValid(booking.jobChecklistSnapshot)) {
    return { status: CHECKLIST_READINESS.NEEDS_ATTENTION, reasons: ['Approved checklist data is invalid. Owner review is required.'] };
  }
  if (isApprovedChecklistCurrent(booking)) {
    return { status: CHECKLIST_READINESS.READY, reasons: [] };
  }
  const assembly = assembleBookingChecklist(booking);
  const reuseCandidate = findRecurringChecklistReuseCandidate(booking, allBookings);
  if (reuseCandidate) {
    return {
      status: CHECKLIST_READINESS.NEEDS_ATTENTION,
      reasons: ['An unchanged approved recurring packet is ready to reuse. Confirm it for this job.'],
      reuseCandidate,
    };
  }
  return {
    status: assembly.success ? CHECKLIST_READINESS.NEEDS_ATTENTION : CHECKLIST_READINESS.NOT_PREPARED,
    reasons: [...new Set([...assembly.readinessReasons, ...assembly.warnings])],
  };
}

export function buildApprovedChecklistSnapshot({
  booking,
  assembly,
  items,
  notes = '',
  reviewedBy,
  now = new Date().toISOString(),
  reuseSource = null,
}) {
  if (!booking?.id || !reviewedBy || !assembly?.template || !Array.isArray(items) || items.length === 0) {
    return { success: false, message: 'A booking, reviewer, template, and valid checklist tasks are required.' };
  }
  const normalizedItems = items.map((item, index) => ({
    id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `owner-task-${index + 1}`,
    area: typeof item.area === 'string' && item.area.trim() ? item.area.trim() : 'Booking-specific',
    fixtureOrSurface: typeof item.fixtureOrSurface === 'string' ? item.fixtureOrSurface.trim() : '',
    label: typeof item.label === 'string' ? item.label.trim() : '',
    completionCriteria: typeof item.completionCriteria === 'string' ? item.completionCriteria.trim() : '',
    jobAidSteps: normalizeJobAidSteps(item.jobAidSteps),
    warnings: Array.isArray(item.warnings)
      ? item.warnings.filter(warning => typeof warning === 'string' && warning.trim()).map(warning => warning.trim())
      : [],
    note: typeof item.note === 'string' ? item.note.trim() : '',
    condition: typeof item.condition === 'string' ? item.condition.trim() : '',
    required: item.required === true,
    completed: false,
    approvedMethodIds: Array.isArray(item.approvedMethodIds) ? [...item.approvedMethodIds] : [],
    preferredMethodId: item.preferredMethodId || null,
    sourceReferences: Array.isArray(item.sourceReferences)
      ? item.sourceReferences.filter(reference => typeof reference === 'string' && reference.trim()).map(reference => reference.trim())
      : [],
  })).filter(item => item.label);
  if (!normalizedItems.some(item => item.required)) {
    return { success: false, message: 'The approved checklist must contain at least one required task.' };
  }

  const provenance = {
    assemblyMethod: reuseSource ? 'recurring_reuse' : 'booking_scope',
    sourceBookingId: booking.id,
    sourceEstimateId: assembly.sourceScopeSnapshot?.sourceEstimateId || null,
    sourceServiceType: assembly.sourceScopeSnapshot?.serviceType || null,
    sourceScopeSnapshot: { ...assembly.sourceScopeSnapshot },
    sourceScopeSignature: assembly.sourceScopeSignature,
    templateIds: [assembly.template.templateId, ...(assembly.componentIds || [])],
    templateVersions: [assembly.template.templateVersion, ...(assembly.componentIds || []).map(() => '2.0.0')],
    assembledAt: now,
    assembledBy: reviewedBy,
    reviewedAt: now,
    reviewedBy,
    ownerApproved: true,
    ...(reuseSource ? {
      reusedFromBookingId: reuseSource.id,
      reusedFromReviewedAt: reuseSource.jobChecklistSnapshot?.reviewedAt || null,
    } : {}),
  };

  return {
    success: true,
    data: {
      snapshotVersion: 1,
      label: assembly.template.templateName,
      notes: String(notes || '').trim(),
      warnings: [...(assembly.warnings || [])],
      items: normalizedItems,
      ownerApproved: true,
      reviewedAt: now,
      reviewedBy,
      sourceRepository: assembly.template.sourceRepository,
      sourceFiles: [...assembly.template.sourceFiles],
      sourceVersionOrDate: assembly.template.sourceVersionOrDate,
      importedAt: assembly.template.importedAt,
      templateId: assembly.template.templateId,
      templateName: assembly.template.templateName,
      templateVersion: assembly.template.templateVersion,
      provenance,
    },
  };
}

export function checklistExecutionCopy(snapshot) {
  if (!approvedSnapshotValid(snapshot)) return [];
  return snapshot.items.map(item => ({
    ...item,
    jobAidSteps: normalizeJobAidSteps(item.jobAidSteps),
    warnings: Array.isArray(item.warnings) ? [...item.warnings] : [],
    approvedMethodIds: [...(item.approvedMethodIds || [])],
    sourceReferences: [...(item.sourceReferences || [])],
    completed: false,
  }));
}

function normalizeJobAidSteps(steps) {
  if (!Array.isArray(steps)) return [];
  return steps.map(step => {
    if (typeof step === 'string') return { label: step.trim(), note: '', condition: '' };
    if (!step || typeof step !== 'object') return null;
    return {
      label: typeof step.label === 'string' ? step.label.trim() : '',
      note: typeof step.note === 'string' ? step.note.trim() : '',
      condition: typeof step.condition === 'string' ? step.condition.trim() : '',
    };
  }).filter(step => step?.label);
}
