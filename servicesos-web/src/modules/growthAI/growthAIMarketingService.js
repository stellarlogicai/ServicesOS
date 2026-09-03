export const MARKETING_CONTENT_TYPES = Object.freeze([
  { id: 'service_spotlight', label: 'Service spotlight' },
  { id: 'promotional', label: 'Promotional content' },
  { id: 'seasonal', label: 'Seasonal content' },
  { id: 'educational_tip', label: 'Educational / tip content' },
  { id: 'humor_engagement', label: 'Humor / engagement' },
  { id: 'availability', label: 'Availability content' },
  { id: 'local_community', label: 'Local / community content' },
  { id: 'completed_job', label: 'Completed-job content' },
  { id: 'before_after', label: 'Before / after content' },
  { id: 'testimonial', label: 'Testimonial / review content' },
]);

export const MARKETING_CONTENT_TYPE_IDS = Object.freeze(MARKETING_CONTENT_TYPES.map(item => item.id));
export const MARKETING_SOURCE_REQUIRED_TYPES = Object.freeze(['completed_job', 'before_after']);

const SERVICE_LABELS = Object.freeze({
  standard: 'Standard Cleaning',
  standard_clean: 'Standard Cleaning',
  'standard clean': 'Standard Cleaning',
  deep: 'Deep Cleaning',
  deep_clean: 'Deep Cleaning',
  'deep clean': 'Deep Cleaning',
  moveout: 'Move-Out Cleaning',
  move_out: 'Move-Out Cleaning',
  'move-out': 'Move-Out Cleaning',
  'move-out clean': 'Move-Out Cleaning',
  recurring: 'Recurring Cleaning',
  recurring_clean: 'Recurring Cleaning',
  maintenance: 'Maintenance Cleaning',
  commercial: 'Commercial Cleaning',
  airbnb: 'Airbnb / Turnover Cleaning',
});

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function bookingServiceType(booking = {}) {
  const formData = booking.formData || {};
  const requestSnapshot = booking.requestSnapshot || {};
  return text(booking.serviceType) || text(requestSnapshot.cleaningType) ||
    text(formData.cleaningType) || text(formData.serviceType);
}

export function formatMarketingServiceName(value) {
  const normalized = text(value);
  if (!normalized) return '';
  return SERVICE_LABELS[normalized.toLowerCase()] || normalized;
}

export function deriveTenantMarketingServices(bookings = []) {
  const seen = new Set();
  return bookings.flatMap(booking => {
    const value = bookingServiceType(booking);
    const id = value.toLowerCase();
    if (!value || seen.has(id)) return [];
    seen.add(id);
    return [{ id: value, label: formatMarketingServiceName(value) }];
  });
}

export function requiresMarketingService(contentTypeId) {
  return contentTypeId === 'service_spotlight';
}

export function requiresMarketingOpportunity(contentTypeId) {
  return MARKETING_SOURCE_REQUIRED_TYPES.includes(contentTypeId);
}

export function validateMarketingSelection({ contentTypeId, serviceType, sourceOpportunity } = {}) {
  if (!MARKETING_CONTENT_TYPE_IDS.includes(contentTypeId)) {
    return 'Choose a supported marketing content type.';
  }
  if (requiresMarketingService(contentTypeId) && !text(serviceType)) {
    return 'Choose one of this tenant\'s known services before creating a service spotlight.';
  }
  if (requiresMarketingOpportunity(contentTypeId) && !sourceOpportunity?.id) {
    return 'Choose an eligible completed-job opportunity before creating this content.';
  }
  if (contentTypeId === 'testimonial') {
    return 'Testimonial generation is unavailable until ServicesOS has a safe approved testimonial source.';
  }
  return '';
}

export function buildMarketingSourceRefs(sourceOpportunity, selectedPhotoIds = []) {
  if (!sourceOpportunity?.id) return {};
  const photoIds = Array.isArray(selectedPhotoIds)
    ? [...new Set(selectedPhotoIds
      .filter(value => typeof value === 'string')
      .map(value => value.trim())
      .filter(value => value && !value.includes('/')))]
    : [];
  return photoIds.length ? { opportunityId: sourceOpportunity.id, photoIds } : { opportunityId: sourceOpportunity.id };
}

export function buildMarketingContentPlan({ marketingServices = [], opportunities = [] } = {}) {
  const plan = [
    {
      id: 'educational-tip',
      label: 'Educational cleaning tip',
      description: 'Add a specific topic before generating.',
      postTypeId: 'educational_tip',
    },
  ];
  const service = marketingServices[0];
  if (service?.id) {
    plan.unshift({
      id: `service-spotlight-${service.id}`,
      label: `${service.label} spotlight`,
      description: 'Uses a known tenant service.',
      postTypeId: 'service_spotlight',
      serviceType: service.id,
    });
  }
  const opportunity = opportunities.find(item => item.type === 'marketing_photo_review' && item.status === 'open');
  if (opportunity?.id) {
    plan.push({
      id: `before-after-${opportunity.id}`,
      label: 'Completed-job before / after draft',
      description: 'Needs owner-selected approved photo context. No image analysis is performed.',
      postTypeId: 'before_after',
      opportunityId: opportunity.id,
      requiresPhotoSelection: true,
    });
  }
  return plan;
}
