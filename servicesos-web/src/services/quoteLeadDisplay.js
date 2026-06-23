const hasValue = (value) => value !== undefined && value !== null && value !== '';

const firstValue = (...values) => values.find(hasValue);

const numberOrNull = (...values) => {
  const value = firstValue(...values);
  if (!hasValue(value)) return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function isPendingOwnerReview(lead = {}) {
  return Boolean(
    lead.type === 'quote_request' &&
      !lead.booking &&
      (lead.review?.requiresOwnerReview ||
        lead.estimate?.requiresReview ||
        lead.estimate?.status === 'pending_owner_review')
  );
}

export function getQuoteLeadDisplayData(lead = {}) {
  const customerSnapshot = lead.customerSnapshot || {};
  const propertySnapshot = lead.propertySnapshot || {};
  const requestSnapshot = lead.requestSnapshot || {};
  const formData = lead.formData || lead;
  const snapshotRoomCounts = propertySnapshot.roomCounts || {};
  const legacyRoomCounts = formData.roomCounts || {};

  return {
    fullName: firstValue(
      customerSnapshot.fullName,
      customerSnapshot.displayName,
      customerSnapshot.name,
      formData.fullName,
      [formData.firstName, formData.lastName].filter(Boolean).join(' ').trim()
    ) || 'Customer',
    email: firstValue(customerSnapshot.email, formData.email) || '',
    phone: firstValue(customerSnapshot.phone, formData.phone) || '',
    address: firstValue(propertySnapshot.address, formData.address) || '',
    cleaningType:
      firstValue(requestSnapshot.cleaningType, formData._cleaningType, formData.cleaningType) ||
      'standard',
    frequency: firstValue(requestSnapshot.frequency, formData.frequency) || 'one-time',
    bedrooms: numberOrNull(
      propertySnapshot.bedrooms,
      snapshotRoomCounts.bedrooms,
      formData.bedrooms,
      formData.bedroomCount,
      legacyRoomCounts.bedrooms
    ),
    bathrooms: numberOrNull(
      propertySnapshot.bathrooms,
      snapshotRoomCounts.bathrooms,
      formData.bathrooms,
      formData.bathroomCount,
      legacyRoomCounts.bathrooms
    ),
    halfBaths: numberOrNull(
      propertySnapshot.halfBaths,
      snapshotRoomCounts.halfBaths,
      formData.halfBaths,
      legacyRoomCounts.halfBaths
    ),
    squareFootage: numberOrNull(propertySnapshot.squareFootage, formData.squareFootage),
    condition: firstValue(requestSnapshot.condition, formData.condition) || '',
    pets: firstValue(propertySnapshot.household?.pets, formData.pets, formData.hasPets) || false,
    petCount: numberOrNull(propertySnapshot.household?.petCount, formData.petCount) || 0,
    children: firstValue(propertySnapshot.household?.children, formData.children) || false,
    preferredDate: firstValue(
      lead.appointmentRequest?.preferredDate,
      requestSnapshot.preferredDate,
      formData.preferredDate
    ) || '',
    preferredTime: firstValue(
      lead.appointmentRequest?.preferredTime,
      requestSnapshot.preferredTime,
      formData.preferredTime
    ) || ''
  };
}

export function getQuoteLeadPriceDisplay(lead = {}) {
  if (lead.booking?.agreedPrice !== undefined && lead.booking?.agreedPrice !== null) {
    return {
      label: 'Agreed price',
      text: `$${Number(lead.booking.agreedPrice).toLocaleString()}`,
      pending: false
    };
  }

  if (isPendingOwnerReview(lead)) {
    return {
      label: 'Quote status',
      text: 'Pending owner review.',
      pending: true
    };
  }

  const priceLow = numberOrNull(lead.estimate?.priceLow);
  const priceHigh = numberOrNull(lead.estimate?.priceHigh);

  if (priceLow === null && priceHigh === null) {
    return {
      label: 'Estimate',
      text: 'No estimate',
      pending: false
    };
  }

  return {
    label: 'Estimate range',
    text: `$${(priceLow || 0).toLocaleString()} - $${(priceHigh || 0).toLocaleString()}`,
    pending: false
  };
}

export function getRoomSummary(displayData = {}) {
  const parts = [];

  if (displayData.bedrooms !== null && displayData.bedrooms !== undefined) {
    parts.push(`${displayData.bedrooms} bed`);
  }

  if (displayData.bathrooms !== null && displayData.bathrooms !== undefined) {
    parts.push(`${displayData.bathrooms} bath`);
  }

  return parts.length ? parts.join(', ') : 'Property details pending';
}
