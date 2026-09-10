const JOB_PACKET_SCHEMA_VERSION = 1;
const JOB_LIST_LIMIT = 50;
const CHECKLIST_MAX_ITEMS = 500;
const CHECKLIST_MAX_JOB_AID_STEPS = 50;
const CHECKLIST_MAX_ITEM_WARNINGS = 10;
const CHECKLIST_MAX_PACKET_WARNINGS = 50;
const CHECKLIST_MAX_RESPONSE_BYTES = 512 * 1024;
const SAFETY_MAX_HAZARDS = 30;
const SAFETY_MAX_HAZARD_LENGTH = 500;
const SAFETY_MAX_PET_TYPES = 10;
const SAFETY_MAX_PET_TYPE_LENGTH = 80;

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

const ACTIVE_STATUSES = new Set(['scheduled', 'completed']);
const FIELD_STATUSES = new Set(['not_started', 'in_progress', 'completed']);

function boundedText(value, maxLength, fallback = '') {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return (normalized || fallback).slice(0, maxLength);
}

function checkedText(value, maxLength, { required = false, fallback = '' } = {}) {
  if (value !== undefined && typeof value !== 'string') return null;
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (normalized.length > maxLength || (required && !normalized)) return null;
  return normalized || fallback;
}

function firstText(...values) {
  return values.find(value => typeof value === 'string' && value.trim())?.trim() || '';
}

function firstObject(...values) {
  return values.find(value => value && typeof value === 'object' && !Array.isArray(value)) || {};
}

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = stableObject(value[key]);
    return result;
  }, {});
}

function checklistScopeSignature(sourceScopeSnapshot = {}) {
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
  const merged = {
    ...legacy,
    ...firstObject(rawInput.extras),
    ...firstObject(rawInput.serviceScope),
    ...primary,
  };
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

function extractBookingChecklistScope(booking = {}) {
  const requestSnapshot = firstObject(booking.requestSnapshot);
  const propertySnapshot = firstObject(booking.propertySnapshot);
  const formData = firstObject(booking.formData);
  const rawInput = firstObject(requestSnapshot.rawInput);
  const household = firstObject(propertySnapshot.household);
  const roomCounts = normalizedRoomCounts(propertySnapshot, requestSnapshot, formData);
  const serviceScope = normalizedServiceScope(requestSnapshot, formData);
  const hazards = Array.isArray(requestSnapshot.hazards)
    ? requestSnapshot.hazards.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim())
    : [];
  const petCount = numberValue(household.petCount ?? rawInput.petCount ?? formData.petCount) || 0;

  return {
    serviceType: firstText(
      booking.serviceType,
      requestSnapshot.cleaningType,
      formData._cleaningType,
      formData.cleaningType
    ),
    frequency: firstText(requestSnapshot.frequency, rawInput.frequency, formData.frequency),
    roomCounts,
    serviceScope,
    propertyType: firstText(propertySnapshot.propertyType, rawInput.propertyType, formData.propertyType),
    surfaceNotes: firstText(requestSnapshot.surfaceNotes, rawInput.surfaceNotes),
    hazards,
    accessInstructions: firstText(requestSnapshot.accessInstructions, rawInput.accessInstructions),
    customerInstructions: firstText(
      requestSnapshot.specialRequests,
      requestSnapshot.customerNotes,
      rawInput.customerNotes,
      rawInput.specialRequests,
      formData.specialRequests
    ),
    petCount,
    petHairLevel: String(household.petHairLevel ?? rawInput.petHairLevel ?? formData.petHairLevel ?? '')
      .trim()
      .toLowerCase()
      .replace(/[_\s]+/g, '-'),
    serviceAddressPresent: Boolean(firstText(propertySnapshot.address, booking.address, formData.address)),
    sourceEstimateId: firstText(booking.sourceEstimateId, booking.estimateId) || null,
  };
}

function checklistSourceScopeSnapshot(scope) {
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

function currentChecklistScopeSignature(booking) {
  return checklistScopeSignature(checklistSourceScopeSnapshot(extractBookingChecklistScope(booking)));
}

function approvedSnapshotValid(snapshot) {
  if (snapshot?.ownerApproved !== true || !Array.isArray(snapshot.items) || snapshot.items.length === 0) {
    return false;
  }
  const itemIds = snapshot.items.map(item => typeof item?.id === 'string' ? item.id.trim() : '');
  return itemIds.every(Boolean) &&
    new Set(itemIds).size === itemIds.length &&
    snapshot.items.every(item => typeof item?.label === 'string' && item.label.trim()) &&
    snapshot.items.some(item => item?.required === true);
}

function isApprovedChecklistCurrent(booking = {}) {
  const snapshot = booking.jobChecklistSnapshot;
  return approvedSnapshotValid(snapshot) &&
    snapshot.provenance?.sourceScopeSignature === currentChecklistScopeSignature(booking);
}

function asDate(value) {
  if (!value) return null;
  try {
    const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  } catch {
    return null;
  }
}

function localDateKey(value, timeZone = 'UTC') {
  const date = asDate(value);
  if (!date) return '';
  const parts = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return values.year && values.month && values.day ? `${values.year}-${values.month}-${values.day}` : '';
}

function bookingDateKey(booking = {}, timeZone = 'UTC') {
  const scheduledDate = localDateKey(booking.scheduledAt, timeZone);
  if (scheduledDate) return scheduledDate;
  const stored = booking.date || booking.appointmentDate;
  return typeof stored === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(stored) ? stored : '';
}

function scheduleProjection(booking, timeZone) {
  const scheduledAt = asDate(booking.scheduledAt);
  return {
    date: bookingDateKey(booking, timeZone) || null,
    startTime: boundedText(firstText(booking.startTime, booking.time, booking.appointmentTime), 32) || null,
    endTime: boundedText(booking.endTime, 32) || null,
    scheduledAt: scheduledAt ? scheduledAt.toISOString() : null,
  };
}

function joinedName(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return '';
  return firstText(source.fullName, source.name, [source.firstName, source.lastName].filter(Boolean).join(' '));
}

function customerName(booking) {
  return boundedText(firstText(
    booking.customerName,
    joinedName(booking.customer),
    joinedName(booking.customerSnapshot),
    joinedName(booking.formData)
  ), 160, 'Unknown customer');
}

function customerPhone(booking) {
  return boundedText(firstText(
    booking.customerPhone,
    booking.customer?.phone,
    booking.customerSnapshot?.phone,
    booking.formData?.phone
  ), 64, 'Phone not provided');
}

function addressText(value) {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  return [value.street, value.address, value.city, value.state, value.zip || value.zipCode]
    .filter(part => typeof part === 'string' || typeof part === 'number')
    .map(part => String(part).trim())
    .filter(Boolean)
    .join(', ');
}

function serviceAddress(booking) {
  return boundedText(firstText(
    addressText(booking.address),
    addressText(booking.propertySnapshot?.address),
    addressText(booking.customerSnapshot?.address),
    addressText(booking.formData?.address)
  ), 500, 'Address not provided');
}

function serviceType(booking) {
  return boundedText(firstText(
    booking.serviceType,
    typeof booking.service === 'string' ? booking.service : booking.service?.name,
    booking.requestSnapshot?.cleaningType,
    booking.formData?._cleaningType,
    booking.formData?.cleaningType
  ), 120, 'Service not specified');
}

function fieldInstructions(booking) {
  return boundedText(firstText(
    booking.fieldInstructions,
    booking.technicianNotes,
    booking.accessInstructions,
    booking.requestSnapshot?.accessInstructions,
    booking.requestSnapshot?.rawInput?.accessInstructions,
    booking.requestSnapshot?.specialRequests,
    booking.formData?.specialRequests
  ), 1000, 'No field instructions provided');
}

function safetyProjection(booking) {
  const requestSnapshot = firstObject(booking.requestSnapshot);
  const propertySnapshot = firstObject(booking.propertySnapshot);
  const household = firstObject(propertySnapshot.household);
  const hazards = boundedStringArray(requestSnapshot.hazards, {
    maxItems: SAFETY_MAX_HAZARDS,
    maxLength: SAFETY_MAX_HAZARD_LENGTH,
  }) || [];
  const petTypes = boundedStringArray(household.petTypes, {
    maxItems: SAFETY_MAX_PET_TYPES,
    maxLength: SAFETY_MAX_PET_TYPE_LENGTH,
  }) || [];
  const rawPetCount = numberValue(household.petCount);
  const count = Number.isInteger(rawPetCount) && rawPetCount <= 100 ? rawPetCount : 0;
  const hairLevel = checkedText(household.petHairLevel, 80) || '';
  const recordedPresent = household.pets === true;

  return {
    hazards,
    surfaceNotes: checkedText(requestSnapshot.surfaceNotes, 1000) || '',
    allergyOrProductRestrictions: checkedText(household.allergies, 1000) || '',
    pets: {
      present: recordedPresent || count > 0 || petTypes.length > 0 || Boolean(hairLevel && hairLevel.toLowerCase() !== 'none'),
      count,
      types: petTypes,
      hairLevel,
    },
  };
}

function accessSecurityProjection(booking) {
  return {
    instructions: boundedText(firstText(
      booking.accessInstructions,
      booking.requestSnapshot?.accessInstructions
    ), 1000),
  };
}

function boundedStringArray(value, { maxItems, maxLength }) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  return value
    .filter(item => typeof item === 'string' && item.trim())
    .map(item => item.trim().slice(0, maxLength))
    .slice(0, maxItems);
}

function normalizeJobAidSteps(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > CHECKLIST_MAX_JOB_AID_STEPS) return null;
  const steps = [];
  for (const step of value) {
    if (!step || typeof step !== 'object' || Array.isArray(step)) return null;
    const label = checkedText(step.label, 120, { required: true });
    const note = checkedText(step.note, 500);
    const condition = checkedText(step.condition, 500);
    if (label === null || note === null || condition === null) return null;
    steps.push({
      label,
      note,
      condition,
    });
  }
  return steps;
}

function normalizeChecklistItem(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const id = checkedText(item.id, 128, { required: true });
  const label = checkedText(item.label, 120, { required: true });
  const area = checkedText(item.area, 120, { fallback: 'General' });
  const fixtureOrSurface = checkedText(item.fixtureOrSurface, 120);
  const completionCriteria = checkedText(item.completionCriteria, 500);
  const note = checkedText(item.note, 500);
  const condition = checkedText(item.condition, 500);
  const preferredMethodId = checkedText(item.preferredMethodId, 128);
  if ([id, label, area, fixtureOrSurface, completionCriteria, note, condition, preferredMethodId].includes(null)) {
    return null;
  }
  const jobAidSteps = normalizeJobAidSteps(item.jobAidSteps);
  const warnings = boundedStringArray(item.warnings, {
    maxItems: CHECKLIST_MAX_ITEM_WARNINGS,
    maxLength: 500,
  });
  if (!jobAidSteps || !warnings) return null;
  const approvedMethodIds = boundedStringArray(item.approvedMethodIds, { maxItems: 20, maxLength: 128 });
  if (!approvedMethodIds) return null;
  return {
    id,
    area,
    fixtureOrSurface,
    label,
    completionCriteria,
    jobAidSteps,
    warnings,
    note,
    condition,
    required: item.required === true,
    completed: item.completed === true,
    approvedMethodIds,
    preferredMethodId: preferredMethodId || null,
  };
}

function normalizeChecklistItems(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > CHECKLIST_MAX_ITEMS) return null;
  const items = value.map(normalizeChecklistItem);
  if (items.some(item => !item) || new Set(items.map(item => item.id)).size !== items.length) return null;
  return items;
}

function sameChecklistStructure(left, right) {
  if (left.length !== right.length) return false;
  const rightById = new Map(right.map(item => [item.id, item]));
  return left.every(item => {
    const matching = rightById.get(item.id);
    if (!matching) return false;
    const leftStructure = { ...item, completed: false };
    const rightStructure = { ...matching, completed: false };
    return JSON.stringify(leftStructure) === JSON.stringify(rightStructure);
  });
}

function unavailableChecklist() {
  return {
    ready: false,
    items: [],
    completed: 0,
    total: 0,
    notes: '',
    warnings: ['Owner review is required before this checklist can be used.'],
  };
}

function checklistProjection(booking) {
  if (!isApprovedChecklistCurrent(booking)) return unavailableChecklist();
  const approvedItems = normalizeChecklistItems(booking.jobChecklistSnapshot.items);
  if (!approvedItems) return unavailableChecklist();

  const fieldItems = Array.isArray(booking.fieldChecklist) && booking.fieldChecklist.length > 0
    ? normalizeChecklistItems(booking.fieldChecklist)
    : null;
  const items = fieldItems && sameChecklistStructure(fieldItems, approvedItems)
    ? fieldItems
    : approvedItems.map(item => ({ ...item, completed: false }));
  const warnings = boundedStringArray(booking.jobChecklistSnapshot.warnings, {
    maxItems: CHECKLIST_MAX_PACKET_WARNINGS,
    maxLength: 500,
  });
  if (!warnings) return unavailableChecklist();

  const result = {
    ready: true,
    items,
    completed: items.filter(item => item.completed).length,
    total: items.length,
    notes: boundedText(booking.jobChecklistSnapshot.notes, 1000),
    warnings,
  };
  return Buffer.byteLength(JSON.stringify(result), 'utf8') <= CHECKLIST_MAX_RESPONSE_BYTES
    ? result
    : unavailableChecklist();
}

function normalizedFieldStatus(value) {
  return FIELD_STATUSES.has(value) ? value : 'not_started';
}

function safeJobId(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  return id && id.length <= 128 && !id.includes('/') ? id : '';
}

function bookingMatchesEmployeeJobVisibility(booking, { uid, today, timeZone }) {
  return Boolean(
    booking &&
    booking.assignedEmployeeAuthUid === uid &&
    ACTIVE_STATUSES.has(booking.status) &&
    booking.isArchived !== true &&
    booking.isDeleted !== true &&
    bookingDateKey(booking, timeZone) >= today
  );
}

function employeeJobSummary(id, booking, timeZone) {
  return {
    id: safeJobId(id),
    schedule: scheduleProjection(booking, timeZone),
    serviceType: serviceType(booking),
    customerName: customerName(booking),
    address: serviceAddress(booking),
    status: booking.status,
    fieldStatus: normalizedFieldStatus(booking.fieldStatus),
  };
}

function employeeJobPacket(id, booking, timeZone) {
  return {
    id: safeJobId(id),
    schedule: scheduleProjection(booking, timeZone),
    serviceType: serviceType(booking),
    customer: {
      name: customerName(booking),
      phone: customerPhone(booking),
    },
    location: { address: serviceAddress(booking) },
    status: booking.status,
    fieldStatus: normalizedFieldStatus(booking.fieldStatus),
    instructions: fieldInstructions(booking),
    safety: safetyProjection(booking),
    accessSecurity: accessSecurityProjection(booking),
    checklist: checklistProjection(booking),
    fieldNotes: boundedText(booking.fieldNotes, 1000),
    fieldIssue: boundedText(booking.fieldIssue, 750),
  };
}

function employeeJobSortValue(job) {
  return `${job.schedule.date || '9999-12-31'}T${job.schedule.startTime || '23:59'}T${job.id}`;
}

module.exports = {
  CHECKLIST_MAX_ITEMS,
  CHECKLIST_MAX_RESPONSE_BYTES,
  JOB_LIST_LIMIT,
  JOB_PACKET_SCHEMA_VERSION,
  bookingDateKey,
  bookingMatchesEmployeeJobVisibility,
  checklistProjection,
  currentChecklistScopeSignature,
  employeeJobPacket,
  employeeJobSortValue,
  employeeJobSummary,
  accessSecurityProjection,
  isApprovedChecklistCurrent,
  localDateKey,
  safetyProjection,
};
