const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const deepClone = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => deepClone(item));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, deepClone(item)])
    );
  }

  return value;
};

const objectValue = (value) => (isPlainObject(value) ? deepClone(value) : {});

const arrayValue = (value) => (Array.isArray(value) ? deepClone(value) : []);

const isMeaningful = (value) => value !== undefined && value !== null && value !== '';

const valueOrDefault = (value, fallback) => (isMeaningful(value) ? value : fallback);

const stringValue = (value, fallback = '') =>
  isMeaningful(value) ? String(value).trim() : fallback;

const numberValue = (value, fallback = 0) => {
  if (!isMeaningful(value)) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const booleanValue = (value, fallback = false) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  return fallback;
};

const splitFullName = (fullName) => {
  const normalizedName = stringValue(fullName);
  const [firstName = '', ...lastNameParts] = normalizedName.split(' ').filter(Boolean);

  return {
    firstName,
    lastName: lastNameParts.join(' ')
  };
};

const getQuoteRequestDraft = (quoteIntakeDraft) =>
  quoteIntakeDraft?.quoteRequestDraft ?? quoteIntakeDraft;

const assertRequired = (value, message) => {
  if (!isMeaningful(value)) {
    throw new Error(message);
  }
};

const buildPendingOwnerReviewEstimate = () => ({
  priceLow: 0,
  priceHigh: 0,
  laborHours: 0,
  appointmentDuration: null,
  aiEnhanced: false,
  requiresReview: true,
  status: 'pending_owner_review'
});

const normalizeAiAnalysis = (aiAnalysis) => {
  const normalizedAiAnalysis = objectValue(aiAnalysis);
  return Object.keys(normalizedAiAnalysis).length > 0 ? normalizedAiAnalysis : null;
};

function buildLegacyFormData({ customerSnapshot, propertySnapshot, requestSnapshot }) {
  const fullName = stringValue(customerSnapshot.fullName);
  const { firstName, lastName } = splitFullName(fullName);
  const roomCounts = objectValue(propertySnapshot.roomCounts);
  const household = objectValue(propertySnapshot.household);
  const serviceScope = objectValue(requestSnapshot.serviceScope);
  const cleaningType = stringValue(requestSnapshot.cleaningType, 'standard');
  const specialRequests = stringValue(
    valueOrDefault(requestSnapshot.specialRequests, requestSnapshot.customerNotes)
  );

  return deepClone({
    fullName,
    firstName,
    lastName,
    email: stringValue(customerSnapshot.email),
    phone: stringValue(customerSnapshot.phone),
    address: stringValue(propertySnapshot.address),
    city: stringValue(propertySnapshot.city),
    state: stringValue(propertySnapshot.state),
    zipCode: stringValue(propertySnapshot.zipCode),
    zip: stringValue(propertySnapshot.zipCode),
    propertyType: stringValue(propertySnapshot.propertyType, 'House'),
    squareFootage: stringValue(propertySnapshot.squareFootage),
    bedrooms: numberValue(valueOrDefault(propertySnapshot.bedrooms, roomCounts.bedrooms)),
    bathrooms: numberValue(valueOrDefault(propertySnapshot.bathrooms, roomCounts.bathrooms)),
    halfBaths: numberValue(valueOrDefault(propertySnapshot.halfBaths, roomCounts.halfBaths)),
    levels: numberValue(propertySnapshot.levels, 1),
    garage: booleanValue(propertySnapshot.garage),
    basement: booleanValue(propertySnapshot.basement),
    stairs: booleanValue(propertySnapshot.stairs),
    stairsCount: numberValue(propertySnapshot.stairsCount),
    roomCounts,
    cleaningType,
    serviceType: cleaningType,
    frequency: stringValue(requestSnapshot.frequency, 'one-time'),
    preferredDate: stringValue(requestSnapshot.preferredDate),
    preferredTime: stringValue(requestSnapshot.preferredTime),
    flexibleSchedule: booleanValue(requestSnapshot.flexibleSchedule),
    pets: booleanValue(household.pets),
    hasPets: booleanValue(household.pets),
    petCount: numberValue(household.petCount),
    petTypes: arrayValue(household.petTypes),
    petHairLevel: stringValue(household.petHairLevel, 'none'),
    children: booleanValue(household.children),
    smokingInside: booleanValue(household.smokingInside),
    allergies: stringValue(household.allergies),
    condition: stringValue(requestSnapshot.condition, 'moderate'),
    clutterLevel: stringValue(requestSnapshot.clutterLevel, 'normal'),
    lastCleaned: stringValue(requestSnapshot.lastCleaned),
    lastCleaningDate: stringValue(requestSnapshot.lastCleaningDate),
    occupancyStatus: stringValue(requestSnapshot.occupancyStatus),
    priorityAreas: arrayValue(requestSnapshot.priorityAreas),
    serviceScope,
    addOns: serviceScope,
    hazards: arrayValue(requestSnapshot.hazards),
    surfaceNotes: stringValue(requestSnapshot.surfaceNotes),
    accessInstructions: stringValue(requestSnapshot.accessInstructions),
    changeNotes: stringValue(requestSnapshot.changeNotes),
    specialRequests,
    customerNotes: stringValue(valueOrDefault(requestSnapshot.customerNotes, specialRequests)),
    notes: specialRequests
  });
}

function buildAppointmentRequest({ draftAppointmentRequest, requestSnapshot, submittedAt }) {
  return deepClone({
    preferredDate: stringValue(
      valueOrDefault(draftAppointmentRequest.preferredDate, requestSnapshot.preferredDate)
    ),
    preferredTime: stringValue(
      valueOrDefault(draftAppointmentRequest.preferredTime, requestSnapshot.preferredTime)
    ),
    flexibleSchedule: booleanValue(
      valueOrDefault(draftAppointmentRequest.flexibleSchedule, requestSnapshot.flexibleSchedule)
    ),
    notes: stringValue(
      valueOrDefault(
        draftAppointmentRequest.notes,
        valueOrDefault(requestSnapshot.specialRequests, requestSnapshot.customerNotes)
      )
    ),
    status: 'pending_review',
    requestedAt: valueOrDefault(draftAppointmentRequest.requestedAt, submittedAt)
  });
}

export function buildCustomerPortalQuoteLeadPayload(quoteIntakeDraft = {}) {
  const draft = objectValue(getQuoteRequestDraft(quoteIntakeDraft));
  const tenantId = valueOrDefault(draft.tenantId, null);
  const customerId = valueOrDefault(draft.customerId, null);
  const propertyId = valueOrDefault(draft.propertyId, null);
  const createdByAuthUid = valueOrDefault(draft.createdByAuthUid, null);

  assertRequired(tenantId, 'Customer Portal quote lead payload requires tenantId.');
  assertRequired(createdByAuthUid, 'Customer Portal quote lead payload requires auth uid.');
  assertRequired(customerId, 'Customer Portal quote lead payload requires customerId.');

  const customerSnapshot = objectValue(draft.customerSnapshot);
  const propertySnapshot = objectValue(draft.propertySnapshot);
  const requestSnapshot = objectValue(draft.requestSnapshot);
  const submittedAt = valueOrDefault(
    draft.createdAt,
    valueOrDefault(requestSnapshot.submittedAt, draft.updatedAt)
  );
  const formData = buildLegacyFormData({
    customerSnapshot,
    propertySnapshot,
    requestSnapshot
  });

  return deepClone({
    schemaVersion: valueOrDefault(draft.schemaVersion, 1),
    type: 'quote_request',
    source: 'customer-portal',
    status: 'new',
    tenantId,
    customerId,
    propertyId,
    createdByAuthUid,
    formData,
    estimate: buildPendingOwnerReviewEstimate(),
    aiAnalysis: normalizeAiAnalysis(draft.aiAnalysis),
    booking: null,
    customerSnapshot,
    propertySnapshot,
    requestSnapshot,
    review: {
      requiresOwnerReview: true,
      reviewReason: stringValue(
        draft.review?.reviewReason,
        'Customer Portal quote request needs owner review'
      ),
      reviewedBy: null,
      reviewedAt: null,
      ownerNotes: ''
    },
    appointmentRequest: buildAppointmentRequest({
      draftAppointmentRequest: objectValue(draft.appointmentRequest),
      requestSnapshot,
      submittedAt
    }),
    createdAt: submittedAt,
    updatedAt: submittedAt
  });
}
