import { growthAIStatusLabel } from './growthAIViewFormatters';

const ACTION_TYPE_LABELS = Object.freeze({
  customer_response: 'Customer Follow-up',
  estimate_assistance: 'Estimate Recommendation',
  estimate_followup: 'Estimate Follow-up',
  lead_response: 'Lead Follow-up',
  marketing_post: 'Marketing Post',
  outreach: 'Outreach Message',
  rebooking_message: 'Rebooking Message',
  review_response: 'Review Response',
});

const OPPORTUNITY_LABELS = Object.freeze({
  estimate_followup: 'Estimate follow-up',
  marketing_photo_review: 'Marketing photo opportunity',
  rebooking_gap: 'Rebooking opportunity',
  review_request: 'Review-request opportunity',
});

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isTenantRecord(record, tenantId) {
  return Boolean(record) && (!record.tenantId || record.tenantId === tenantId);
}

function findTenantRecord(records, id, tenantId) {
  if (!id || !Array.isArray(records)) return null;
  return records.find(record => record?.id === id && isTenantRecord(record, tenantId)) || null;
}

function serviceLabel(record) {
  const formData = record?.formData || {};
  const requestSnapshot = record?.requestSnapshot || {};
  return cleanText(record?.serviceType) || cleanText(requestSnapshot.cleaningType) ||
    cleanText(formData.cleaningType) || cleanText(formData.serviceType);
}

function hasReference(sourceRefs) {
  return Object.values(sourceRefs || {}).some(value => Array.isArray(value) ? value.length > 0 : Boolean(value));
}

export function growthAIDraftTypeLabel(draft = {}) {
  const actionType = cleanText(draft.actionType);
  const title = cleanText(draft.title).toLowerCase();
  if (actionType === 'customer_response' && title.includes('rebooking')) return 'Rebooking Message';
  if (actionType === 'customer_response' && title.includes('review request')) return 'Review Request';
  return ACTION_TYPE_LABELS[actionType] || 'Saved Draft';
}

export function describeGrowthAIDraftSource(draft = {}, context = {}) {
  const sourceRefs = draft?.sourceRefs && typeof draft.sourceRefs === 'object' ? draft.sourceRefs : {};
  const tenantId = cleanText(context.tenantId);
  const opportunity = findTenantRecord(context.opportunities, sourceRefs.opportunityId, tenantId);
  const lead = findTenantRecord(context.leads, sourceRefs.leadId, tenantId);
  const booking = findTenantRecord(context.bookings, sourceRefs.bookingId, tenantId);

  if (sourceRefs.opportunityId) {
    if (!opportunity) return { label: 'Source no longer available', unavailable: true };
    return { label: OPPORTUNITY_LABELS[opportunity.type] || 'Growth opportunity', detail: serviceLabel(booking) };
  }
  if (sourceRefs.leadId) {
    if (!lead) return { label: 'Source no longer available', unavailable: true };
    return { label: 'Estimate context', detail: serviceLabel(lead) };
  }
  if (sourceRefs.bookingId) {
    if (!booking) return { label: 'Source no longer available', unavailable: true };
    return { label: 'Completed service', detail: serviceLabel(booking) };
  }
  if (sourceRefs.estimateId) return { label: 'Saved estimate context' };
  if (sourceRefs.photoId || sourceRefs.photoIds?.length) return { label: 'Marketing photo context' };
  if (sourceRefs.reviewId) return { label: 'Review response context' };
  if (sourceRefs.customerId) return { label: 'Customer communication context' };
  if (hasReference(sourceRefs)) return { label: 'Source no longer available', unavailable: true };
  return { label: 'Owner-created draft' };
}

export function describeGrowthAIDraft(draft = {}, context = {}) {
  return {
    typeLabel: growthAIDraftTypeLabel(draft),
    statusLabel: growthAIStatusLabel(draft.status),
    source: describeGrowthAIDraftSource(draft, context),
  };
}

export function describeGrowthAIAuditEntry(entry = {}, { currentUserUid } = {}) {
  const isCurrentUser = Boolean(entry.actorUid && currentUserUid && entry.actorUid === currentUserUid);
  const owner = isCurrentUser ? 'You' : 'An owner';
  const action = cleanText(entry.action);
  const descriptions = {
    draft_created: { actor: 'System', headline: 'Draft prepared for review' },
    draft_edited: { actor: owner, headline: `${owner} updated the draft` },
    submitted_for_review: { actor: owner, headline: `${owner} marked this draft as needing review` },
    approved: { actor: owner, headline: `${owner} approved this draft for internal use` },
    approval_invalidated: { actor: 'System', headline: 'Approval cleared after content changed' },
    returned_to_draft: { actor: owner, headline: `${owner} returned this draft to Draft` },
  };
  return descriptions[action] || { actor: 'System', headline: 'Draft activity recorded' };
}
