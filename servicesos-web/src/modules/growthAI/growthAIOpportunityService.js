import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { getLeads } from '../../core/leads/leadService';
import { getJobs } from '../../core/scheduling/schedulingService';
import { listFieldPhotos } from '../../services/fieldPhotoService';
import { getRecurringServices } from '../../services/recurringService';

export const GROWTH_AI_OPPORTUNITY_TYPES = Object.freeze([
  'estimate_followup',
  'rebooking_gap',
  'marketing_photo_review',
  'review_request',
]);

export const GROWTH_AI_OPPORTUNITY_STATUSES = Object.freeze([
  'open',
  'acted',
  'dismissed',
  'resolved',
]);

export const ESTIMATE_FOLLOW_UP_THRESHOLD_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;
const ESTIMATE_DETECTION_VERSION = 'estimate-followup-v1';
const MARKETING_DETECTION_VERSION = 'marketing-photo-review-v1';
const REBOOKING_DETECTION_VERSION = 'rebooking-gap-v1';
const REVIEW_REQUEST_DETECTION_VERSION = 'review-request-v1';
const RECONCILIATION_TRANSACTION_TARGET_LIMIT = 20;
const CLOSED_ESTIMATE_STATUSES = new Set([
  'accepted',
  'approved',
  'cancelled',
  'declined',
  'expired',
  'rejected',
]);

function requireTenantId(tenantId) {
  const value = typeof tenantId === 'string' ? tenantId.trim() : '';
  if (!value || value === 'DEFAULT') throw new Error('Select a valid tenant before loading GrowthAI opportunities.');
  return value;
}

function requireActorUid() {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in before managing GrowthAI opportunities.');
  return uid;
}

function timestampMillis(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  const parsed = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function opportunityId(type, sourceId) {
  return `${type}__${encodeURIComponent(sourceId)}`;
}

function hasBookingRelationship(lead, bookingsByLeadId) {
  if (lead?.booking?.bookingId || lead?.appointmentRequest?.approvedBookingId) return true;
  return bookingsByLeadId.has(lead?.id);
}

function canonicalCustomerId(record) {
  return typeof record?.customerId === 'string' && record.customerId.trim()
    ? record.customerId.trim()
    : null;
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function bookingServiceType(booking = {}) {
  const requestSnapshot = booking.requestSnapshot || {};
  const formData = booking.formData || {};
  return text(booking.serviceType) || text(requestSnapshot.cleaningType) ||
    text(formData.cleaningType) || text(formData.serviceType);
}

function normalizedServiceType(booking) {
  return bookingServiceType(booking).toLowerCase().replace(/\s+/g, ' ');
}

function bookingFrequency(booking = {}) {
  const requestSnapshot = booking.requestSnapshot || {};
  const formData = booking.formData || {};
  return text(requestSnapshot.frequency) || text(formData.frequency) || text(booking.frequency);
}

function cadenceForFrequency(frequency) {
  switch (frequency.toLowerCase()) {
    case 'weekly':
      return { key: 'weekly', intervalDays: 7, label: 'weekly' };
    case 'biweekly':
    case 'bi-weekly':
      return { key: 'biweekly', intervalDays: 14, label: 'every two weeks' };
    case 'monthly':
      return { key: 'monthly', intervalMonths: 1, label: 'monthly' };
    default:
      return null;
  }
}

function cadenceForRecurringService(recurringService = {}) {
  const scheduleType = text(recurringService.scheduleType).toLowerCase();
  if (scheduleType === 'every_x_weeks') {
    const intervalWeeks = Number(recurringService.intervalWeeks);
    if (Number.isInteger(intervalWeeks) && intervalWeeks > 0) {
      return {
        key: `every-${intervalWeeks}-weeks`,
        intervalDays: intervalWeeks * 7,
        label: intervalWeeks === 1 ? 'weekly' : `every ${intervalWeeks} weeks`,
      };
    }
    return null;
  }
  return cadenceForFrequency(scheduleType || text(recurringService.frequency));
}

function rebookingServiceKey(serviceType, cadence) {
  return `booking-service:${serviceType}:${cadence.key}`;
}

function isActiveRecurringService(recurringService = {}) {
  return text(recurringService.status).toLowerCase() === 'active';
}

function recurringServiceIndex(recurringServices = [], tenantId) {
  const servicesById = new Map();
  if (!Array.isArray(recurringServices)) return servicesById;
  recurringServices.forEach(recurringService => {
    const id = text(recurringService?.id);
    const recordTenantId = text(recurringService?.tenantId);
    if (!id || (recordTenantId && tenantId && recordTenantId !== tenantId)) return;
    servicesById.set(id, recurringService);
  });
  return servicesById;
}

function resolveRebookingCadence(booking, servicesById) {
  const customerId = canonicalCustomerId(booking);
  const serviceType = normalizedServiceType(booking);
  if (!customerId || !serviceType) return null;

  const recurringServiceId = text(booking?.recurringServiceId);
  if (recurringServiceId) {
    const recurringService = servicesById.get(recurringServiceId);
    if (!recurringService) return null;
    const recurringCustomerId = canonicalCustomerId(recurringService);
    const recurringServiceType = normalizedServiceType(recurringService);
    const cadence = cadenceForRecurringService(recurringService);
    if (isActiveRecurringService(recurringService) && recurringCustomerId === customerId && recurringServiceType === serviceType && cadence) {
      return {
        customerId,
        serviceType,
        cadence,
        serviceKey: `recurring-service:${recurringServiceId}`,
      };
    }
    return null;
  }

  const cadence = cadenceForFrequency(bookingFrequency(booking));
  if (!cadence) return null;
  return { customerId, serviceType, cadence, serviceKey: rebookingServiceKey(serviceType, cadence) };
}

function bookingDateMillis(booking = {}) {
  const dateOnly = text(booking.date);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    return new Date(`${dateOnly}T12:00:00`).getTime();
  }
  return timestampMillis(booking.completedAt || booking.scheduledAt || booking.updatedAt || booking.createdAt);
}

function isEligibleBooking(booking) {
  return Boolean(booking?.id) && booking.isArchived !== true && booking.isDeleted !== true && booking.status !== 'cancelled';
}

function isUpcomingBooking(booking, nowMillis) {
  if (!isEligibleBooking(booking) || isCompletedBooking(booking)) return false;
  if (booking.status === 'in_progress' || booking.fieldStatus === 'in_progress') return true;
  const scheduledMillis = bookingDateMillis(booking);
  return Number.isFinite(scheduledMillis) && scheduledMillis >= nowMillis;
}

function formatServiceType(serviceType) {
  return serviceType.replace(/\b\w/g, character => character.toUpperCase());
}

function nextCadenceMillis(completedAtMillis, cadence) {
  const due = new Date(completedAtMillis);
  if (cadence.intervalMonths) {
    const day = due.getDate();
    due.setDate(1);
    due.setMonth(due.getMonth() + cadence.intervalMonths);
    due.setDate(Math.min(day, new Date(due.getFullYear(), due.getMonth() + 1, 0).getDate()));
  } else due.setDate(due.getDate() + cadence.intervalDays);
  return due.getTime();
}

export function detectEstimateFollowUpOpportunities({
  leads = [],
  bookings = [],
  now = new Date(),
  thresholdDays = ESTIMATE_FOLLOW_UP_THRESHOLD_DAYS,
} = {}) {
  const nowMillis = timestampMillis(now);
  if (!Number.isFinite(nowMillis)) throw new Error('A valid detection time is required.');

  const bookingsByLeadId = new Set();
  bookings.forEach(booking => {
    [booking?.leadId, booking?.sourceLeadId]
      .filter(value => typeof value === 'string' && value)
      .forEach(value => bookingsByLeadId.add(value));
  });

  return leads.flatMap(lead => {
    if (!lead?.id || lead.status !== 'quoted' || !lead.estimate) return [];
    if (hasBookingRelationship(lead, bookingsByLeadId)) return [];

    const estimateStatus = typeof lead.estimate.status === 'string'
      ? lead.estimate.status.trim().toLowerCase()
      : '';
    if (CLOSED_ESTIMATE_STATUSES.has(estimateStatus)) return [];
    if (lead.estimate.requiresReview === true || estimateStatus === 'pending_owner_review') return [];

    const quotedAtMillis = timestampMillis(lead.updatedAt || lead.createdAt);
    if (!Number.isFinite(quotedAtMillis) || quotedAtMillis > nowMillis) return [];
    const ageDays = Math.floor((nowMillis - quotedAtMillis) / DAY_MS);
    if (ageDays < thresholdDays) return [];

    const customerId = canonicalCustomerId(lead);
    return [{
      id: opportunityId('estimate_followup', lead.id),
      type: 'estimate_followup',
      pillar: 'convert',
      sourceRefs: {
        leadId: lead.id,
        ...(customerId ? { customerId } : {}),
      },
      detectionReason: `Estimate has been marked quoted for ${ageDays} ${ageDays === 1 ? 'day' : 'days'} and no booking is linked.`,
      detectionVersion: ESTIMATE_DETECTION_VERSION,
    }];
  });
}

function isCompletedBooking(booking) {
  if (!isEligibleBooking(booking)) return false;
  return booking.status === 'completed' || booking.fieldStatus === 'completed';
}

function hasRecordedReviewRequestConcern(booking = {}) {
  return text(booking.fieldIssue).length > 0 || booking.hasIncident === true ||
    (Array.isArray(booking.incidentIds) && booking.incidentIds.length > 0);
}

export function detectReviewRequestOpportunities({ bookings = [], tenantId } = {}) {
  const candidatesByCustomer = new Map();
  bookings.forEach(booking => {
    const customerId = canonicalCustomerId(booking);
    if ((tenantId && booking?.tenantId !== tenantId) || !isCompletedBooking(booking) || !customerId || hasRecordedReviewRequestConcern(booking)) return;
    const current = candidatesByCustomer.get(customerId);
    const completedAtMillis = bookingDateMillis(booking);
    const currentCompletedAtMillis = bookingDateMillis(current);
    const completedAtRank = Number.isFinite(completedAtMillis) ? completedAtMillis : Number.NEGATIVE_INFINITY;
    const currentCompletedAtRank = Number.isFinite(currentCompletedAtMillis) ? currentCompletedAtMillis : Number.NEGATIVE_INFINITY;
    if (!current || completedAtRank > currentCompletedAtRank ||
      (completedAtRank === currentCompletedAtRank && booking.id.localeCompare(current.id) > 0)) {
      candidatesByCustomer.set(customerId, booking);
    }
  });

  return [...candidatesByCustomer.entries()].map(([customerId, booking]) => ({
      id: opportunityId('review_request', customerId),
      type: 'review_request',
      pillar: 'reputation',
      sourceRefs: { bookingId: booking.id, customerId },
      detectionReason: 'Job completed - consider asking for feedback or a review.',
      detectionVersion: REVIEW_REQUEST_DETECTION_VERSION,
    }));
}

function listDueRebookingCandidates({ bookings = [], recurringServices = [], tenantId, now = new Date() } = {}) {
  const nowMillis = timestampMillis(now);
  if (!Number.isFinite(nowMillis)) throw new Error('A valid detection time is required.');

  const servicesById = recurringServiceIndex(recurringServices, tenantId);
  const candidatesByService = new Map();
  bookings.forEach(booking => {
    if (!isCompletedBooking(booking)) return;
    const recurrence = resolveRebookingCadence(booking, servicesById);
    const completedAtMillis = bookingDateMillis(booking);
    if (!recurrence || !Number.isFinite(completedAtMillis) || completedAtMillis > nowMillis) return;

    const candidate = { booking, ...recurrence, completedAtMillis };
    const candidateKey = `${candidate.customerId}::${candidate.serviceKey}`;
    const current = candidatesByService.get(candidateKey);
    if (!current || candidate.completedAtMillis > current.completedAtMillis ||
      (candidate.completedAtMillis === current.completedAtMillis && candidate.serviceType.localeCompare(current.serviceType) < 0)) {
      candidatesByService.set(candidateKey, candidate);
    }
  });

  const candidates = [];
  candidatesByService.forEach(candidate => {
    const hasUpcomingMatchingService = bookings.some(booking => {
      const recurrence = resolveRebookingCadence(booking, servicesById);
      return recurrence?.customerId === candidate.customerId &&
        recurrence.serviceKey === candidate.serviceKey &&
        isUpcomingBooking(booking, nowMillis);
    });
    if (hasUpcomingMatchingService) return;

    if (nowMillis < nextCadenceMillis(candidate.completedAtMillis, candidate.cadence)) return;

    const completedDate = text(candidate.booking.date) || 'a prior completed job';
    candidates.push({ ...candidate, completedDate });
  });

  return candidates;
}

export function detectRebookingOpportunities({ bookings = [], recurringServices = [], tenantId, now = new Date() } = {}) {
  return listDueRebookingCandidates({ bookings, recurringServices, tenantId, now }).map(candidate => ({
    id: opportunityId('rebooking_gap', `${candidate.customerId}__${candidate.serviceKey}`),
    type: 'rebooking_gap',
    pillar: 'retain',
    sourceRefs: { customerId: candidate.customerId, serviceKey: candidate.serviceKey },
    detectionReason: `${formatServiceType(candidate.serviceType)} was last completed on ${candidate.completedDate}. Its configured ${candidate.cadence.label} cadence is now due, and no upcoming matching booking is scheduled.`,
    detectionVersion: REBOOKING_DETECTION_VERSION,
  }));
}

export function listRebookingOpportunityCandidates({ bookings = [], recurringServices = [], tenantId, now = new Date() } = {}) {
  return listDueRebookingCandidates({ bookings, recurringServices, tenantId, now }).map(candidate => ({
    customerId: candidate.customerId,
    serviceKey: candidate.serviceKey,
    bookingId: candidate.booking.id,
  }));
}

function isLabeledPhoto(photo, phase) {
  return photo?.phase === phase && typeof photo.roomLabel === 'string' && photo.roomLabel.trim().length > 0;
}

export function detectMarketingPhotoReviewOpportunities({ bookings = [], photosByBookingId = {} } = {}) {
  return bookings.flatMap(booking => {
    if (!booking?.id || !isCompletedBooking(booking)) return [];
    const photos = photosByBookingId instanceof Map
      ? photosByBookingId.get(booking.id) || []
      : photosByBookingId[booking.id] || [];
    const before = photos.find(photo => isLabeledPhoto(photo, 'before'));
    const after = photos.find(photo => isLabeledPhoto(photo, 'after'));
    if (!before || !after) return [];

    const customerId = canonicalCustomerId(booking);
    return [{
      id: opportunityId('marketing_photo_review', booking.id),
      type: 'marketing_photo_review',
      pillar: 'attract',
      sourceRefs: {
        bookingId: booking.id,
        photoIds: [before.id, after.id],
        ...(customerId ? { customerId } : {}),
      },
      detectionReason: 'Completed job has labeled Before and After field photos. Review the job photos to decide whether they are appropriate for marketing.',
      detectionVersion: MARKETING_DETECTION_VERSION,
    }];
  });
}

export function planGrowthAIOpportunityReconciliation(existing = [], detections = []) {
  const existingById = new Map(existing.map(item => [item.id, item]));
  const detectionsById = new Map(detections.map(item => [item.id, item]));
  const create = [];
  const refresh = [];
  const resolve = [];

  detectionsById.forEach((detection, id) => {
    const current = existingById.get(id);
    if (!current) create.push(detection);
    else if (current.status === 'open' || current.status === 'acted') refresh.push({ current, detection });
  });

  existingById.forEach(current => {
    if (!detectionsById.has(current.id) && (current.status === 'open' || current.status === 'acted')) {
      resolve.push(current);
    }
  });

  return { create, refresh, resolve };
}

function opportunityCollection(tenantId) {
  return collection(db, 'tenants', requireTenantId(tenantId), 'growthAIOpportunities');
}

function opportunityDocument(tenantId, opportunityIdValue) {
  return doc(db, 'tenants', requireTenantId(tenantId), 'growthAIOpportunities', opportunityIdValue);
}

export async function listGrowthAIOpportunities(tenantId) {
  const snapshot = await getDocs(query(opportunityCollection(tenantId), orderBy('lastDetectedAt', 'desc')));
  return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
}

export async function reconcileGrowthAIOpportunities(tenantId, detections) {
  const resolvedTenantId = requireTenantId(tenantId);
  const actorUid = requireActorUid();
  const existing = await listGrowthAIOpportunities(resolvedTenantId);
  const plan = planGrowthAIOpportunityReconciliation(existing, detections);
  const ids = [...new Set([
    ...plan.create.map(item => item.id),
    ...plan.refresh.map(item => item.current.id),
    ...plan.resolve.map(item => item.id),
  ])];

  const detectedById = new Map(detections.map(item => [item.id, item]));
  for (let start = 0; start < ids.length; start += RECONCILIATION_TRANSACTION_TARGET_LIMIT) {
    const chunkIds = ids.slice(start, start + RECONCILIATION_TRANSACTION_TARGET_LIMIT);
    await runTransaction(db, async transaction => {
      const references = chunkIds.map(id => opportunityDocument(resolvedTenantId, id));
      const snapshots = [];
      for (const reference of references) snapshots.push(await transaction.get(reference));
      const currentById = new Map(snapshots.filter(item => item.exists()).map(item => [item.id, item.data()]));

      for (const reference of references) {
        const current = currentById.get(reference.id);
        const detection = detectedById.get(reference.id);
        if (!current && detection) {
          transaction.set(reference, {
            schemaVersion: 1,
            ...detection,
            tenantId: resolvedTenantId,
            status: 'open',
            firstDetectedAt: serverTimestamp(),
            lastDetectedAt: serverTimestamp(),
            createdByUid: actorUid,
            createdAt: serverTimestamp(),
            updatedByUid: actorUid,
            updatedAt: serverTimestamp(),
            actedAt: null,
            actedByUid: null,
            dismissedAt: null,
            dismissedByUid: null,
            resolvedAt: null,
          });
          continue;
        }
        if (!current) continue;
        if (detection && (current.status === 'open' || current.status === 'acted')) {
          transaction.update(reference, {
            detectionReason: detection.detectionReason,
            ...(current.type === 'review_request' ? { sourceRefs: detection.sourceRefs } : {}),
            lastDetectedAt: serverTimestamp(),
            updatedByUid: actorUid,
            updatedAt: serverTimestamp(),
          });
        } else if (!detection && (current.status === 'open' || current.status === 'acted')) {
          transaction.update(reference, {
            status: 'resolved',
            resolvedAt: serverTimestamp(),
            updatedByUid: actorUid,
            updatedAt: serverTimestamp(),
          });
        }
      }
    });
  }

  return listGrowthAIOpportunities(resolvedTenantId);
}

async function transitionOpportunity(tenantId, opportunityIdValue, nextStatus) {
  const resolvedTenantId = requireTenantId(tenantId);
  const actorUid = requireActorUid();
  const reference = opportunityDocument(resolvedTenantId, opportunityIdValue);
  return runTransaction(db, async transaction => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new Error('GrowthAI opportunity was not found.');
    const current = snapshot.data();
    const allowed = nextStatus === 'acted'
      ? current.status === 'open'
      : nextStatus === 'dismissed' && (current.status === 'open' || current.status === 'acted');
    if (!allowed) throw new Error(`This opportunity cannot move from ${current.status} to ${nextStatus}.`);

    const patch = {
      status: nextStatus,
      updatedByUid: actorUid,
      updatedAt: serverTimestamp(),
      ...(nextStatus === 'acted'
        ? { actedAt: serverTimestamp(), actedByUid: actorUid }
        : { dismissedAt: serverTimestamp(), dismissedByUid: actorUid }),
    };
    transaction.update(reference, patch);
    return { id: snapshot.id, ...current, ...patch };
  });
}

export function markGrowthAIOpportunityActed(tenantId, opportunityIdValue) {
  return transitionOpportunity(tenantId, opportunityIdValue, 'acted');
}

export function dismissGrowthAIOpportunity(tenantId, opportunityIdValue) {
  return transitionOpportunity(tenantId, opportunityIdValue, 'dismissed');
}

export async function refreshGrowthAIOpportunityFeed(tenantId, { now = new Date() } = {}) {
  const resolvedTenantId = requireTenantId(tenantId);
  const [leadResponse, bookingResponse, recurringServices] = await Promise.all([
    getLeads(resolvedTenantId),
    getJobs(resolvedTenantId),
    getRecurringServices(resolvedTenantId),
  ]);
  if (!leadResponse?.success) throw new Error(leadResponse?.error || 'GrowthAI could not load estimates.');
  if (!bookingResponse?.success) throw new Error(bookingResponse?.error || 'GrowthAI could not load bookings.');

  const leads = Array.isArray(leadResponse.data) ? leadResponse.data : [];
  const bookings = Array.isArray(bookingResponse.data) ? bookingResponse.data : [];
  const completedBookings = bookings.filter(isCompletedBooking);
  const photosByBookingId = new Map(await Promise.all(completedBookings.map(async booking => [
    booking.id,
    await listFieldPhotos(resolvedTenantId, booking.id),
  ])));
  const rebookingCandidates = listRebookingOpportunityCandidates({
    bookings, recurringServices, tenantId: resolvedTenantId, now,
  });
  const detections = [
    ...detectEstimateFollowUpOpportunities({ leads, bookings, now }),
    ...detectRebookingOpportunities({ bookings, recurringServices, tenantId: resolvedTenantId, now }),
    ...detectMarketingPhotoReviewOpportunities({ bookings, photosByBookingId }),
    ...detectReviewRequestOpportunities({ bookings, tenantId: resolvedTenantId }),
  ];
  const opportunities = await reconcileGrowthAIOpportunities(resolvedTenantId, detections);
  return { opportunities, leads, bookings, rebookingCandidates, rebookingImplemented: true };
}
