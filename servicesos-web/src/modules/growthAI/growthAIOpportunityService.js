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

export const GROWTH_AI_OPPORTUNITY_TYPES = Object.freeze([
  'estimate_followup',
  'rebooking_gap',
  'marketing_photo_review',
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
  if (!booking || booking.isArchived === true || booking.isDeleted === true || booking.status === 'cancelled') return false;
  return booking.status === 'completed' || booking.fieldStatus === 'completed';
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

  if (ids.length > 0) {
    await runTransaction(db, async transaction => {
      const references = ids.map(id => opportunityDocument(resolvedTenantId, id));
      const snapshots = [];
      for (const reference of references) snapshots.push(await transaction.get(reference));
      const currentById = new Map(snapshots.filter(item => item.exists()).map(item => [item.id, item.data()]));
      const detectedById = new Map(detections.map(item => [item.id, item]));

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
  const [leadResponse, bookingResponse] = await Promise.all([
    getLeads(resolvedTenantId),
    getJobs(resolvedTenantId),
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
  const detections = [
    ...detectEstimateFollowUpOpportunities({ leads, bookings, now }),
    ...detectMarketingPhotoReviewOpportunities({ bookings, photosByBookingId }),
  ];
  const opportunities = await reconcileGrowthAIOpportunities(resolvedTenantId, detections);
  return { opportunities, leads, bookings, rebookingImplemented: false };
}
