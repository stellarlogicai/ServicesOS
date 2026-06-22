const DEFAULT_SOURCE = 'customer-portal';

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const hasOwn = (object, key) =>
  isPlainObject(object) && Object.prototype.hasOwnProperty.call(object, key);

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

const hasMeaningfulOwn = (object, key) => hasOwn(object, key) && isMeaningful(object[key]);

const hasAnyRawField = (rawInput, keys) => keys.some((key) => hasMeaningfulOwn(rawInput, key));

const hasAnySavedValue = (object) =>
  isPlainObject(object) && Object.values(object).some((value) => isMeaningful(value));

const chooseMergedValue = ({ rawInput, rawKeys, normalizedValue, savedValue, fallback }) => {
  if (hasAnySavedValue({ value: savedValue }) && !hasAnyRawField(rawInput, rawKeys)) {
    return deepClone(valueOrDefault(savedValue, fallback));
  }

  return deepClone(valueOrDefault(normalizedValue, valueOrDefault(savedValue, fallback)));
};

const buildFullName = (input) => {
  const fullName = stringValue(input.fullName);

  if (fullName) {
    return fullName;
  }

  return [input.firstName, input.lastName].map((name) => stringValue(name)).filter(Boolean).join(' ');
};

const normalizeServiceScope = (input) => {
  const serviceScope = objectValue(input.serviceScope);
  const extras = objectValue(input.extras);

  return {
    ...serviceScope,
    oven: booleanValue(extras.oven, booleanValue(serviceScope.oven)),
    fridge: booleanValue(extras.fridge, booleanValue(serviceScope.fridge)),
    windows: booleanValue(extras.windows, booleanValue(serviceScope.windows)),
    baseboards: booleanValue(extras.baseboards, booleanValue(serviceScope.baseboards)),
    insideCabinets: booleanValue(
      extras.cabinetsInside,
      booleanValue(serviceScope.insideCabinets)
    ),
    garageCleaning: booleanValue(
      extras.garageCleaning,
      booleanValue(serviceScope.garageCleaning)
    ),
    closetOrganization: booleanValue(
      extras.closetOrganization,
      booleanValue(serviceScope.closetOrganization)
    ),
    pantryOrganization: booleanValue(
      extras.pantryOrganization,
      booleanValue(serviceScope.pantryOrganization)
    ),
    laundryRoomCleaning: booleanValue(
      extras.laundryRoomCleaning,
      booleanValue(serviceScope.laundryRoomCleaning)
    ),
    basementCleaning: booleanValue(
      extras.basementCleaning,
      booleanValue(serviceScope.basementCleaning)
    ),
    petWasteRemoval: booleanValue(
      extras.petWasteRemoval,
      booleanValue(serviceScope.petWasteRemoval)
    ),
    blindCleaning: booleanValue(
      extras.blindCleaning,
      booleanValue(serviceScope.blindCleaning)
    ),
    ceilingFanCleaning: booleanValue(
      extras.ceilingFanCleaning,
      booleanValue(serviceScope.ceilingFanCleaning)
    ),
    wallSpotCleaning: booleanValue(
      extras.wallSpotCleaning,
      booleanValue(serviceScope.wallSpotCleaning)
    )
  };
};

const normalizeRoomCounts = (input) => ({
  bedrooms: numberValue(valueOrDefault(input.bedrooms, input.bedroomCount)),
  bathrooms: numberValue(valueOrDefault(input.bathrooms, input.bathroomCount)),
  halfBaths: numberValue(input.halfBaths),
  kitchens: numberValue(input.kitchenCount),
  livingRooms: numberValue(input.livingRoomCount),
  diningRooms: numberValue(input.diningRoomCount),
  offices: numberValue(input.officeCount),
  basements: numberValue(input.basementCount)
});

const normalizeCommonIntakeData = (input, sourceFormat) => {
  const rawInput = deepClone(input);
  const roomCounts = normalizeRoomCounts(input);
  const petTypes = arrayValue(input.petTypes);
  const petHairLevel = stringValue(input.petHairLevel, 'none');
  const serviceScope = normalizeServiceScope(input);
  const pets = booleanValue(
    input.pets,
    numberValue(input.petCount) > 0 || petTypes.length > 0 || petHairLevel !== 'none'
  );

  return {
    sourceFormat,
    rawInput,
    customer: {
      fullName: buildFullName(input),
      email: stringValue(input.email),
      phone: stringValue(input.phone),
      preferredContactMethod: stringValue(input.preferredContactMethod),
      bestTimeToCall: stringValue(input.bestTimeToCall)
    },
    property: {
      address: stringValue(input.address),
      city: stringValue(input.city),
      state: stringValue(input.state),
      zipCode: stringValue(valueOrDefault(input.zipCode, input.zip)),
      propertyType: stringValue(input.propertyType, 'House'),
      squareFootage: stringValue(input.squareFootage),
      bedrooms: roomCounts.bedrooms,
      bathrooms: roomCounts.bathrooms,
      halfBaths: roomCounts.halfBaths,
      levels: numberValue(Array.isArray(input.levels) ? undefined : input.levels, 1),
      garage: booleanValue(input.garage),
      basement: booleanValue(input.basement, roomCounts.basements > 0),
      stairs: booleanValue(input.stairs),
      stairsCount: numberValue(input.stairsCount),
      roomCounts
    },
    household: {
      pets,
      petCount: numberValue(input.petCount),
      petTypes,
      petHairLevel,
      children: booleanValue(input.children),
      smokingInside: booleanValue(input.smokingInside),
      allergies: stringValue(input.allergies)
    },
    requestDetails: {
      cleaningType: stringValue(valueOrDefault(input.cleaningType, input.serviceType), 'standard'),
      frequency: stringValue(input.frequency, 'one-time'),
      lastCleaningDate: stringValue(input.lastCleaningDate),
      occupancyStatus: stringValue(input.occupancyStatus),
      condition: stringValue(valueOrDefault(input.condition, input.clutterLevel), 'moderate'),
      clutterLevel: stringValue(input.clutterLevel, 'normal'),
      lastCleaned: stringValue(input.lastCleaned),
      priorityAreas: arrayValue(input.priorityAreas),
      serviceScope,
      hazards: arrayValue(input.hazards),
      preferredDate: stringValue(input.preferredDate),
      preferredTime: stringValue(input.preferredTime),
      flexibleSchedule: booleanValue(input.flexibleSchedule),
      budgetRange: stringValue(input.budgetRange),
      referralSource: stringValue(input.referralSource),
      changeNotes: stringValue(input.changeNotes),
      specialRequests: stringValue(
        valueOrDefault(input.specialRequests, valueOrDefault(input.notes, input.customerNotes))
      ),
      marketType: stringValue(input.marketType),
      addOnLevels: objectValue(input.levels)
    }
  };
};

export function normalizeIntakeFormData(formData = {}) {
  return normalizeCommonIntakeData(objectValue(formData), 'intake-form');
}

export function normalizeAIPhotoEstimateData(formData = {}) {
  return normalizeCommonIntakeData(objectValue(formData), 'ai-photo-estimate');
}

export function normalizeQuoteIntakeData(formData = {}, sourceFormat = 'auto') {
  if (sourceFormat === 'intake-form') {
    return normalizeIntakeFormData(formData);
  }

  if (sourceFormat === 'ai-photo-estimate') {
    return normalizeAIPhotoEstimateData(formData);
  }

  const input = objectValue(formData);
  const looksLikeAIPhotoEstimate =
    hasOwn(input, 'bedroomCount') || hasOwn(input, 'extras') || hasOwn(input, 'firstName');

  return looksLikeAIPhotoEstimate
    ? normalizeAIPhotoEstimateData(input)
    : normalizeIntakeFormData(input);
}

export function buildCustomerProfileDraft({
  normalizedData,
  existingCustomer = {},
  tenantId = null,
  authUid = null,
  customerId = null
} = {}) {
  const data = normalizedData ?? normalizeIntakeFormData();
  const customer = data.customer;
  const existing = objectValue(existingCustomer);

  return {
    schemaVersion: valueOrDefault(existing.schemaVersion, 1),
    tenantId: valueOrDefault(tenantId, valueOrDefault(existing.tenantId, null)),
    customerId: valueOrDefault(customerId, valueOrDefault(existing.customerId, valueOrDefault(existing.id, null))),
    authUid: valueOrDefault(authUid, valueOrDefault(existing.authUid, null)),
    name: valueOrDefault(customer.fullName, valueOrDefault(existing.name, '')),
    email: valueOrDefault(customer.email, valueOrDefault(existing.email, '')),
    phone: valueOrDefault(customer.phone, valueOrDefault(existing.phone, '')),
    preferredContactMethod: valueOrDefault(
      customer.preferredContactMethod,
      valueOrDefault(existing.preferredContactMethod, '')
    ),
    bestTimeToCall: valueOrDefault(customer.bestTimeToCall, valueOrDefault(existing.bestTimeToCall, '')),
    defaultPropertyId: valueOrDefault(existing.defaultPropertyId, null),
    status: valueOrDefault(existing.status, 'active'),
    source: valueOrDefault(existing.source, DEFAULT_SOURCE),
    notes: valueOrDefault(existing.notes, ''),
    createdAt: valueOrDefault(existing.createdAt, null),
    updatedAt: valueOrDefault(existing.updatedAt, null)
  };
}

export function buildPropertyProfileDraft({
  normalizedData,
  savedProperty = {},
  tenantId = null,
  customerId = null,
  propertyId = null
} = {}) {
  const data = normalizedData ?? normalizeIntakeFormData();
  const saved = objectValue(savedProperty);
  const rawInput = data.rawInput;
  const savedHousehold = objectValue(saved.household);
  const savedCleaningDefaults = objectValue(saved.cleaningDefaults);
  const savedRoomCounts = objectValue(saved.roomCounts);
  const property = data.property;
  const household = data.household;

  const mergeField = (normalizedValue, savedValue, fallback, rawKeys) =>
    chooseMergedValue({ rawInput, rawKeys, normalizedValue, savedValue, fallback });

  const mergedRoomCounts = {
    bedrooms: mergeField(property.roomCounts.bedrooms, savedRoomCounts.bedrooms, 0, [
      'bedrooms',
      'bedroomCount'
    ]),
    bathrooms: mergeField(property.roomCounts.bathrooms, savedRoomCounts.bathrooms, 0, [
      'bathrooms',
      'bathroomCount'
    ]),
    halfBaths: mergeField(property.roomCounts.halfBaths, savedRoomCounts.halfBaths, 0, ['halfBaths']),
    kitchens: mergeField(property.roomCounts.kitchens, savedRoomCounts.kitchens, 0, ['kitchenCount']),
    livingRooms: mergeField(property.roomCounts.livingRooms, savedRoomCounts.livingRooms, 0, [
      'livingRoomCount'
    ]),
    diningRooms: mergeField(property.roomCounts.diningRooms, savedRoomCounts.diningRooms, 0, [
      'diningRoomCount'
    ]),
    offices: mergeField(property.roomCounts.offices, savedRoomCounts.offices, 0, ['officeCount']),
    basements: mergeField(property.roomCounts.basements, savedRoomCounts.basements, 0, [
      'basementCount'
    ])
  };

  const mergedHousehold = {
    pets: mergeField(household.pets, savedHousehold.pets, false, [
      'pets',
      'petCount',
      'petTypes',
      'petHairLevel'
    ]),
    petCount: mergeField(household.petCount, savedHousehold.petCount, 0, ['petCount']),
    petTypes: mergeField(household.petTypes, savedHousehold.petTypes, [], ['petTypes']),
    petHairLevel: mergeField(household.petHairLevel, savedHousehold.petHairLevel, 'none', [
      'petHairLevel'
    ]),
    children: mergeField(household.children, savedHousehold.children, false, ['children']),
    smokingInside: mergeField(household.smokingInside, savedHousehold.smokingInside, false, [
      'smokingInside'
    ]),
    allergies: mergeField(household.allergies, savedHousehold.allergies, '', ['allergies'])
  };

  const serviceScope = hasAnyRawField(rawInput, ['serviceScope', 'extras'])
    ? data.requestDetails.serviceScope
    : valueOrDefault(savedCleaningDefaults.defaultServiceScope, {});

  return {
    schemaVersion: valueOrDefault(saved.schemaVersion, 1),
    tenantId: valueOrDefault(tenantId, valueOrDefault(saved.tenantId, null)),
    customerId: valueOrDefault(customerId, valueOrDefault(saved.customerId, null)),
    propertyId: valueOrDefault(propertyId, valueOrDefault(saved.propertyId, valueOrDefault(saved.id, null))),
    label: valueOrDefault(saved.label, 'Home'),
    isDefault: valueOrDefault(saved.isDefault, true),
    address: mergeField(property.address, saved.address, '', ['address']),
    city: mergeField(property.city, saved.city, '', ['city']),
    state: mergeField(property.state, saved.state, '', ['state']),
    zipCode: mergeField(property.zipCode, valueOrDefault(saved.zipCode, saved.zip), '', ['zipCode', 'zip']),
    propertyType: mergeField(property.propertyType, saved.propertyType, 'House', ['propertyType']),
    squareFootage: mergeField(property.squareFootage, saved.squareFootage, '', ['squareFootage']),
    bedrooms: mergedRoomCounts.bedrooms,
    bathrooms: mergedRoomCounts.bathrooms,
    halfBaths: mergedRoomCounts.halfBaths,
    levels: mergeField(property.levels, saved.levels, 1, ['levels']),
    garage: mergeField(property.garage, saved.garage, false, ['garage']),
    basement: mergeField(property.basement, saved.basement, false, ['basement', 'basementCount']),
    stairs: mergeField(property.stairs, saved.stairs, false, ['stairs']),
    stairsCount: mergeField(property.stairsCount, saved.stairsCount, 0, ['stairsCount']),
    roomCounts: mergedRoomCounts,
    household: mergedHousehold,
    access: objectValue(saved.access),
    cleaningDefaults: {
      ...savedCleaningDefaults,
      preferredFrequency: valueOrDefault(
        data.requestDetails.frequency,
        valueOrDefault(savedCleaningDefaults.preferredFrequency, '')
      ),
      defaultServiceScope: deepClone(serviceScope),
      priorityAreas: hasAnyRawField(rawInput, ['priorityAreas'])
        ? data.requestDetails.priorityAreas
        : valueOrDefault(savedCleaningDefaults.priorityAreas, []),
      surfaceNotes: valueOrDefault(savedCleaningDefaults.surfaceNotes, ''),
      specialInstructions: valueOrDefault(
        data.requestDetails.specialRequests,
        valueOrDefault(savedCleaningDefaults.specialInstructions, '')
      )
    },
    status: valueOrDefault(saved.status, 'active'),
    createdAt: valueOrDefault(saved.createdAt, null),
    updatedAt: valueOrDefault(saved.updatedAt, null)
  };
}

export function buildQuoteRequestSnapshot({
  normalizedData,
  customerProfile = {},
  propertyProfile = {},
  submittedAt = null
} = {}) {
  const data = normalizedData ?? normalizeIntakeFormData();
  const customer = objectValue(customerProfile);
  const property = objectValue(propertyProfile);

  return deepClone({
    customerSnapshot: {
      customerId: valueOrDefault(customer.customerId, valueOrDefault(customer.id, null)),
      fullName: valueOrDefault(customer.name, data.customer.fullName),
      email: valueOrDefault(customer.email, data.customer.email),
      phone: valueOrDefault(customer.phone, data.customer.phone),
      preferredContactMethod: valueOrDefault(
        customer.preferredContactMethod,
        data.customer.preferredContactMethod
      ),
      bestTimeToCall: valueOrDefault(customer.bestTimeToCall, data.customer.bestTimeToCall)
    },
    propertySnapshot: {
      propertyId: valueOrDefault(property.propertyId, valueOrDefault(property.id, null)),
      label: valueOrDefault(property.label, 'Home'),
      address: valueOrDefault(property.address, data.property.address),
      city: valueOrDefault(property.city, data.property.city),
      state: valueOrDefault(property.state, data.property.state),
      zipCode: valueOrDefault(property.zipCode, data.property.zipCode),
      propertyType: valueOrDefault(property.propertyType, data.property.propertyType),
      squareFootage: valueOrDefault(property.squareFootage, data.property.squareFootage),
      bedrooms: valueOrDefault(property.bedrooms, data.property.bedrooms),
      bathrooms: valueOrDefault(property.bathrooms, data.property.bathrooms),
      halfBaths: valueOrDefault(property.halfBaths, data.property.halfBaths),
      levels: valueOrDefault(property.levels, data.property.levels),
      garage: valueOrDefault(property.garage, data.property.garage),
      basement: valueOrDefault(property.basement, data.property.basement),
      stairs: valueOrDefault(property.stairs, data.property.stairs),
      stairsCount: valueOrDefault(property.stairsCount, data.property.stairsCount),
      roomCounts: valueOrDefault(property.roomCounts, data.property.roomCounts),
      household: valueOrDefault(property.household, data.household),
      access: valueOrDefault(property.access, {}),
      cleaningDefaults: valueOrDefault(property.cleaningDefaults, {})
    },
    requestSnapshot: {
      ...data.requestDetails,
      submittedAt,
      rawInput: data.rawInput
    }
  });
}

export function buildQuoteRequestDraft({
  normalizedData,
  customerProfile,
  propertyProfile,
  tenantId = null,
  customerId = null,
  propertyId = null,
  authUid = null,
  estimate = {},
  aiAnalysis = {},
  submittedAt = null,
  source = DEFAULT_SOURCE
} = {}) {
  const data = normalizedData ?? normalizeIntakeFormData();
  const customer = objectValue(customerProfile);
  const property = objectValue(propertyProfile);
  const finalCustomerId = valueOrDefault(customerId, valueOrDefault(customer.customerId, valueOrDefault(customer.id, null)));
  const finalPropertyId = valueOrDefault(propertyId, valueOrDefault(property.propertyId, valueOrDefault(property.id, null)));
  const snapshot = buildQuoteRequestSnapshot({
    normalizedData: data,
    customerProfile: customer,
    propertyProfile: property,
    submittedAt
  });
  const normalizedEstimate = objectValue(estimate);
  const requiresOwnerReview = Boolean(
    normalizedEstimate.requiresReview ||
      (isMeaningful(normalizedEstimate.aiConfidence) && Number(normalizedEstimate.aiConfidence) < 0.7)
  );

  return deepClone({
    schemaVersion: 1,
    type: 'quote_request',
    source,
    status: 'new',
    tenantId,
    customerId: finalCustomerId,
    propertyId: finalPropertyId,
    createdByAuthUid: authUid,
    ...snapshot,
    estimate: normalizedEstimate,
    aiAnalysis: objectValue(aiAnalysis),
    review: {
      requiresOwnerReview,
      reviewReason: requiresOwnerReview ? 'Low confidence or flagged intake details require owner review' : '',
      reviewedBy: null,
      reviewedAt: null,
      ownerNotes: ''
    },
    appointmentRequest: {
      preferredDate: data.requestDetails.preferredDate,
      preferredTime: data.requestDetails.preferredTime,
      flexibleSchedule: data.requestDetails.flexibleSchedule,
      notes: data.requestDetails.specialRequests,
      status: 'pending_review',
      requestedAt: submittedAt
    },
    createdAt: submittedAt,
    updatedAt: submittedAt
  });
}

export function buildCustomerPortalQuoteIntakeDraft({
  formData = {},
  sourceFormat = 'auto',
  existingCustomer = {},
  savedProperty = {},
  tenantId = null,
  customerId = null,
  propertyId = null,
  authUid = null,
  estimate = {},
  aiAnalysis = {},
  submittedAt = null
} = {}) {
  const normalizedData = normalizeQuoteIntakeData(formData, sourceFormat);
  const customerProfileDraft = buildCustomerProfileDraft({
    normalizedData,
    existingCustomer,
    tenantId,
    authUid,
    customerId
  });
  const propertyProfileDraft = buildPropertyProfileDraft({
    normalizedData,
    savedProperty,
    tenantId,
    customerId: customerProfileDraft.customerId,
    propertyId
  });
  const quoteRequestDraft = buildQuoteRequestDraft({
    normalizedData,
    customerProfile: customerProfileDraft,
    propertyProfile: propertyProfileDraft,
    tenantId,
    customerId: customerProfileDraft.customerId,
    propertyId: propertyProfileDraft.propertyId,
    authUid,
    estimate,
    aiAnalysis,
    submittedAt
  });

  return {
    normalizedData,
    customerProfileDraft,
    propertyProfileDraft,
    quoteRequestDraft
  };
}
