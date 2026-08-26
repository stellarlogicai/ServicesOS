import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { normalizeGrowthAIBrandProfile } from './growthAIBrandContext';

export const GROWTH_AI_PILLARS = ['find', 'attract', 'convert', 'retain', 'reputation'];
export const GROWTH_AI_STATUSES = ['draft', 'needs_review', 'approved'];
export const GROWTH_AI_ACTION_TYPES = [
  'marketing_post',
  'customer_response',
  'lead_response',
  'estimate_assistance',
  'estimate_followup',
  'rebooking_message',
  'review_response',
  'outreach',
];

const SOURCE_REF_KEYS = [
  'leadId',
  'customerId',
  'estimateId',
  'bookingId',
  'photoId',
  'photoIds',
  'reviewId',
  'opportunityId',
];

const CONTENT_KEYS = ['fullCaption', 'shortCaption', 'callToAction', 'hashtags', 'imagePrompt'];

function requireTenantId(tenantId) {
  const value = typeof tenantId === 'string' ? tenantId.trim() : '';
  if (!value || value === 'DEFAULT') {
    throw new Error('Select a valid tenant before using GrowthAI.');
  }
  return value;
}

function requireActorUid() {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in before using GrowthAI.');
  return uid;
}

function cleanString(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

export function normalizeGrowthAIContent(content = {}) {
  return Object.fromEntries(CONTENT_KEYS.map(key => [key, cleanString(content[key], key === 'fullCaption' ? 5000 : 1200)]));
}

export function normalizeGrowthAISourceRefs(sourceRefs = {}) {
  const normalized = {};
  SOURCE_REF_KEYS.forEach(key => {
    if (key === 'photoIds') {
      if (Array.isArray(sourceRefs.photoIds)) {
        normalized.photoIds = sourceRefs.photoIds
          .filter(value => typeof value === 'string' && value.trim())
          .slice(0, 8)
          .map(value => value.trim().slice(0, 128));
      }
      return;
    }
    const value = cleanString(sourceRefs[key], 128);
    if (value) normalized[key] = value;
  });
  return normalized;
}

function normalizeDraftInput(input = {}) {
  const pillar = GROWTH_AI_PILLARS.includes(input.pillar) ? input.pillar : 'attract';
  const actionType = GROWTH_AI_ACTION_TYPES.includes(input.actionType) ? input.actionType : 'marketing_post';
  const title = cleanString(input.title, 180) || 'Untitled draft';
  return {
    pillar,
    actionType,
    title,
    content: normalizeGrowthAIContent(input.content),
    sourceRefs: normalizeGrowthAISourceRefs(input.sourceRefs),
  };
}

function draftCollection(tenantId) {
  return collection(db, 'tenants', requireTenantId(tenantId), 'growthAIDrafts');
}

function draftDocument(tenantId, draftId) {
  return doc(db, 'tenants', requireTenantId(tenantId), 'growthAIDrafts', draftId);
}

function auditCollection(tenantId, draftId) {
  return collection(draftDocument(tenantId, draftId), 'audit');
}

function brandProfileDocument(tenantId) {
  return doc(db, 'tenants', requireTenantId(tenantId), 'growthAI', 'config');
}

export async function loadGrowthAIBrandProfile(tenantId) {
  const snapshot = await getDoc(brandProfileDocument(tenantId));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

export async function saveGrowthAIBrandProfile(tenantId, values) {
  const resolvedTenantId = requireTenantId(tenantId);
  const actorUid = requireActorUid();
  const profileRef = brandProfileDocument(resolvedTenantId);
  const existing = await getDoc(profileRef);
  const shared = {
    schemaVersion: 1,
    tenantId: resolvedTenantId,
    ...normalizeGrowthAIBrandProfile(values),
    updatedByUid: actorUid,
    updatedAt: serverTimestamp(),
  };
  const payload = existing.exists()
    ? { ...shared, createdByUid: existing.data().createdByUid, createdAt: existing.data().createdAt }
    : { ...shared, createdByUid: actorUid, createdAt: serverTimestamp() };
  await setDoc(profileRef, payload);
  return payload;
}

export async function listGrowthAIDrafts(tenantId) {
  const snapshot = await getDocs(query(draftCollection(tenantId), orderBy('updatedAt', 'desc')));
  return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
}

export async function listGrowthAIDraftAudit(tenantId, draftId) {
  const snapshot = await getDocs(query(auditCollection(tenantId, draftId), orderBy('timestamp', 'desc')));
  return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
}

function auditPayload({ auditId, tenantId, draftId, version, action, actorUid, fromStatus, toStatus }) {
  return {
    schemaVersion: 1,
    id: auditId,
    tenantId,
    draftId,
    draftVersion: version,
    action,
    actorUid,
    timestamp: serverTimestamp(),
    fromStatus,
    toStatus,
  };
}

export async function createGrowthAIDraft(tenantId, input) {
  const resolvedTenantId = requireTenantId(tenantId);
  const actorUid = requireActorUid();
  const normalized = normalizeDraftInput(input);
  const draftRef = doc(draftCollection(resolvedTenantId));
  const auditRef = doc(auditCollection(resolvedTenantId, draftRef.id));
  const payload = {
    schemaVersion: 1,
    id: draftRef.id,
    tenantId: resolvedTenantId,
    ...normalized,
    status: 'draft',
    createdByUid: actorUid,
    createdAt: serverTimestamp(),
    updatedByUid: actorUid,
    updatedAt: serverTimestamp(),
    approvedByUid: null,
    approvedAt: null,
    version: 1,
    lastAuditId: auditRef.id,
  };
  await runTransaction(db, async transaction => {
    transaction.set(draftRef, payload);
    transaction.set(auditRef, auditPayload({
      auditId: auditRef.id,
      tenantId: resolvedTenantId,
      draftId: draftRef.id,
      version: 1,
      action: 'draft_created',
      actorUid,
      fromStatus: null,
      toStatus: 'draft',
    }));
  });
  return { ...payload, id: draftRef.id };
}

async function mutateDraft(tenantId, draftId, mutate) {
  const resolvedTenantId = requireTenantId(tenantId);
  const actorUid = requireActorUid();
  const draftRef = draftDocument(resolvedTenantId, draftId);
  const auditRef = doc(auditCollection(resolvedTenantId, draftId));
  return runTransaction(db, async transaction => {
    const snapshot = await transaction.get(draftRef);
    if (!snapshot.exists()) throw new Error('GrowthAI draft was not found.');
    const current = { id: snapshot.id, ...snapshot.data() };
    const result = mutate(current);
    const version = current.version + 1;
    const next = {
      ...current,
      ...result.changes,
      id: current.id,
      tenantId: current.tenantId,
      createdByUid: current.createdByUid,
      createdAt: current.createdAt,
      updatedByUid: actorUid,
      updatedAt: serverTimestamp(),
      version,
      lastAuditId: auditRef.id,
    };
    transaction.set(draftRef, next);
    transaction.set(auditRef, auditPayload({
      auditId: auditRef.id,
      tenantId: resolvedTenantId,
      draftId,
      version,
      action: result.action,
      actorUid,
      fromStatus: current.status,
      toStatus: next.status,
    }));
    return next;
  });
}

export function updateGrowthAIDraftContent(tenantId, draftId, input) {
  const normalized = normalizeDraftInput(input);
  return mutateDraft(tenantId, draftId, current => ({
    action: current.status === 'approved' ? 'approval_invalidated' : 'draft_edited',
    changes: {
      ...normalized,
      status: current.status === 'approved' ? 'needs_review' : current.status,
      approvedByUid: current.status === 'approved' ? null : current.approvedByUid,
      approvedAt: current.status === 'approved' ? null : current.approvedAt,
    },
  }));
}

export function submitGrowthAIDraftForReview(tenantId, draftId) {
  return mutateDraft(tenantId, draftId, current => {
    if (current.status !== 'draft') throw new Error('Only draft content can be submitted for review.');
    return { action: 'submitted_for_review', changes: { status: 'needs_review', approvedByUid: null, approvedAt: null } };
  });
}

export function approveGrowthAIDraft(tenantId, draftId) {
  const actorUid = requireActorUid();
  return mutateDraft(tenantId, draftId, current => {
    if (current.status !== 'needs_review') throw new Error('Only content needing review can be approved.');
    return { action: 'approved', changes: { status: 'approved', approvedByUid: actorUid, approvedAt: serverTimestamp() } };
  });
}

export function returnGrowthAIDraftToDraft(tenantId, draftId) {
  return mutateDraft(tenantId, draftId, current => {
    if (!['needs_review', 'approved'].includes(current.status)) throw new Error('This draft cannot be returned to draft status.');
    return { action: 'returned_to_draft', changes: { status: 'draft', approvedByUid: null, approvedAt: null } };
  });
}
