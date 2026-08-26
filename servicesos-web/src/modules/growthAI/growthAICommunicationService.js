import { formatEstimateCurrency, readSavedEstimatePricing } from './growthAIEstimateAssistance';
import { formatMarketingServiceName } from './growthAIMarketingService';

export const CUSTOMER_COMMUNICATION_TYPES = Object.freeze([
  { id: 'estimate_followup', label: 'Estimate follow-up', source: 'lead', pillar: 'convert' },
  { id: 'scheduling', label: 'Scheduling coordination', source: 'booking', pillar: 'convert' },
  { id: 'quote_question', label: 'Quote or estimate question', source: 'lead', pillar: 'convert' },
  { id: 'service_question', label: 'Service question', source: 'booking', pillar: 'convert' },
  { id: 'problem_resolution', label: 'Problem resolution', source: 'booking', pillar: 'convert' },
  { id: 'rebooking', label: 'Rebooking request', source: 'completed_booking', pillar: 'retain' },
  { id: 'review_request', label: 'Review request', source: 'completed_booking', pillar: 'reputation' },
]);

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function leadServiceType(lead = {}) {
  const formData = lead.formData || {};
  const requestSnapshot = lead.requestSnapshot || {};
  return text(requestSnapshot.cleaningType) || text(formData.cleaningType) || text(formData.serviceType);
}

function bookingServiceType(booking = {}) {
  const formData = booking.formData || {};
  const requestSnapshot = booking.requestSnapshot || {};
  return text(booking.serviceType) || text(requestSnapshot.cleaningType) ||
    text(formData.cleaningType) || text(formData.serviceType);
}

function displayName(record = {}, fallback) {
  const customer = record.customerSnapshot || record.customer || {};
  const formData = record.formData || {};
  return text(customer.fullName) || text(customer.displayName) || text(customer.name) ||
    text(record.customerName) || text(formData.fullName) ||
    [text(formData.firstName), text(formData.lastName)].filter(Boolean).join(' ') || fallback;
}

function isCompleted(booking = {}) {
  return booking.status === 'completed' || booking.fieldStatus === 'completed';
}

function isEligibleBooking(booking = {}, tenantId) {
  return Boolean(booking.id) && booking.tenantId === tenantId && booking.isArchived !== true &&
    booking.isDeleted !== true && booking.status !== 'cancelled';
}

export function listCommunicationLeads(leads = [], tenantId) {
  if (!Array.isArray(leads) || !text(tenantId)) return [];
  return leads.flatMap(lead => {
    const serviceType = leadServiceType(lead);
    if (!lead?.id || lead.tenantId !== tenantId || !['new', 'quoted'].includes(lead.status) ||
        lead.booking != null || !lead.estimate || !serviceType) return [];
    return [{
      id: lead.id,
      label: `${displayName(lead, 'Estimate customer')} - ${formatMarketingServiceName(serviceType)}`,
      serviceType,
      pricing: readSavedEstimatePricing(lead.estimate || {}),
    }];
  });
}

export function listCommunicationBookings(bookings = [], tenantId, { completedOnly = false } = {}) {
  if (!Array.isArray(bookings) || !text(tenantId)) return [];
  return bookings.flatMap(booking => {
    const serviceType = bookingServiceType(booking);
    if (!isEligibleBooking(booking, tenantId) || (completedOnly && !isCompleted(booking)) || !serviceType) return [];
    return [{
      id: booking.id,
      label: `${displayName(booking, 'Customer')} - ${formatMarketingServiceName(serviceType)}`,
      serviceType,
      completed: isCompleted(booking),
    }];
  });
}

export function communicationTypeById(typeId) {
  return CUSTOMER_COMMUNICATION_TYPES.find(item => item.id === typeId) || CUSTOMER_COMMUNICATION_TYPES[0];
}

export function buildCommunicationSourceRefs({ typeId, selectedLeadId, selectedBookingId }) {
  const type = communicationTypeById(typeId);
  if (type.source === 'lead' && text(selectedLeadId)) return { leadId: selectedLeadId };
  if ((type.source === 'booking' || type.source === 'completed_booking') && text(selectedBookingId)) {
    return { bookingId: selectedBookingId };
  }
  return {};
}

export function buildDeterministicCommunicationDraft({
  businessName,
  channelId,
  typeId,
  source,
  serviceType,
}) {
  const type = communicationTypeById(typeId);
  const service = formatMarketingServiceName(serviceType || source?.serviceType || 'cleaning service');
  const pricing = source?.pricing;
  const range = pricing
    ? `${formatEstimateCurrency(pricing.low, pricing.currency)} to ${formatEstimateCurrency(pricing.high, pricing.currency)}`
    : '';
  const messages = {
    estimate_followup: `Hi, I wanted to follow up about your ${service} estimate. Please let us know if you have any questions or would like to discuss next steps.`,
    scheduling: `Hi, I would like to coordinate the timing for your ${service}. Please let us know what works best, and we will confirm the schedule with you.`,
    quote_question: range
      ? `Hi, I am happy to clarify your ${service} estimate. The saved estimate range is ${range}. Please let us know what part of the scope or next steps you would like to review.`
      : `Hi, I am happy to clarify your ${service} estimate. Please let us know what part of the scope or next steps you would like to review.`,
    service_question: `Hi, I would be happy to help with your question about ${service}. We will review the details of your request and confirm what is supported before making any promises.`,
    problem_resolution: `Hi, I am sorry to hear there may be a concern with the service. Please share the details that need attention so we can review them and follow up with you.`,
    rebooking: `Hi, we would be glad to help with another ${service}. Please let us know if you would like to coordinate your next cleaning.`,
    review_request: `Thank you for choosing ${businessName}. If you have a moment, we would appreciate an honest review about your experience.`,
  };
  const message = messages[type.id];
  const subject = type.id === 'review_request'
    ? `Thank you for choosing ${businessName}`
    : `${type.label} from ${businessName}`;
  return {
    id: `communication-${type.id}-${channelId}`,
    channel: channelId,
    communicationType: type.id,
    title: `[Customer communication] ${type.label}`,
    subjectLine: channelId === 'email' ? subject : '',
    messageTemplate: channelId === 'email' ? `Hi,\n\n${message}\n\nThanks,` : message,
    notes: 'Draft only. Review before sending manually. No customer was contacted.',
    sourceRefs: buildCommunicationSourceRefs({ typeId: type.id, selectedLeadId: source?.leadId, selectedBookingId: source?.bookingId }),
    pillar: type.pillar,
  };
}

export function validateCommunicationSelection({ typeId, selectedLeadId, selectedBookingId } = {}) {
  const type = communicationTypeById(typeId);
  if (type.source === 'lead' && !text(selectedLeadId)) return 'Choose an eligible estimate before preparing this draft.';
  if ((type.source === 'booking' || type.source === 'completed_booking') && !text(selectedBookingId)) {
    return type.source === 'completed_booking'
      ? 'Choose a completed job before preparing this draft.'
      : 'Choose a booking before preparing this draft.';
  }
  return '';
}
