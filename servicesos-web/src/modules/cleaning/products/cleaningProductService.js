import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../../../firebase';
import {
  buildSystemDefaultAdoption,
  buildTenantCleaningRecordReview,
  buildCommercialProductCreate,
  buildCommercialProductDetailsUpdate,
  buildCommercialProductReview,
  isEmployeeUsableCleaningRecord,
  normalizeCleaningRecord,
} from './cleaningProductModel';

export const CLEANING_PRODUCTS_COLLECTION = 'cleaningProductsMethods';

function required(value, message) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(message);
  return value.trim();
}
function recordCollection(tenantId) {
  return collection(db, 'tenants', required(tenantId, 'Tenant ID is required.'), CLEANING_PRODUCTS_COLLECTION);
}

function recordReference(tenantId, recordId) {
  return doc(
    db,
    'tenants',
    required(tenantId, 'Tenant ID is required.'),
    CLEANING_PRODUCTS_COLLECTION,
    required(recordId, 'Record ID is required.'),
  );
}

export async function listTenantCleaningRecords(tenantId) {
  const snapshot = await getDocs(recordCollection(tenantId));
  return snapshot.docs
    .map(item => normalizeCleaningRecord({ id: item.id, ...item.data() }))
    .filter(item => item.scope === 'tenant')
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function listTenantCommercialProducts(tenantId) {
  return (await listTenantCleaningRecords(tenantId))
    .filter(item => item.recordType === 'commercial_product');
}

export async function getEmployeeUsableCleaningRecordsByIds(tenantId, recordIds = []) {
  const ids = [...new Set(recordIds.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()))];
  const records = await Promise.all(ids.map(async recordId => {
    try {
      const snapshot = await getDoc(recordReference(tenantId, recordId));
      if (!snapshot.exists()) return null;
      const record = normalizeCleaningRecord({ id: snapshot.id, ...snapshot.data() });
      return isEmployeeUsableCleaningRecord(record) ? record : null;
    } catch {
      return null;
    }
  }));
  return records.filter(Boolean);
}

export async function adoptSystemDefaultMethod(tenantId, systemDefault, { actorUid } = {}) {
  const actor = required(actorUid, 'Acting user is required.');
  const sourceId = required(systemDefault?.id, 'System-default method ID is required.');
  const recordId = `adopted-${sourceId}`;
  const target = recordReference(tenantId, recordId);
  const existing = await getDoc(target);
  if (existing.exists()) return normalizeCleaningRecord({ id: existing.id, ...existing.data() });

  const adopted = buildSystemDefaultAdoption(systemDefault, {
    id: recordId,
    tenantId: required(tenantId, 'Tenant ID is required.'),
    actorUid: actor,
  });
  await setDoc(target, {
    ...adopted,
    adoptedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return adopted;
}

export async function createTenantCommercialProduct(tenantId, proposed, { actorUid } = {}) {
  const target = doc(recordCollection(tenantId));
  const created = buildCommercialProductCreate(
    { ...proposed, id: target.id },
    { tenantId, actorUid: required(actorUid, 'Acting user is required.') },
  );
  await setDoc(target, {
    ...created,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return created;
}

export async function updateTenantCommercialProduct(tenantId, recordId, proposed, { actorUid } = {}) {
  const target = recordReference(tenantId, recordId);
  const snapshot = await getDoc(target);
  if (!snapshot.exists()) throw new Error('Cleaning product record was not found.');
  const existing = normalizeCleaningRecord({ id: snapshot.id, ...snapshot.data() });
  const updated = buildCommercialProductDetailsUpdate(existing, proposed, {
    actorUid: required(actorUid, 'Acting user is required.'),
  });
  await updateDoc(target, {
    ...updated,
    createdAt: existing.createdAt,
    updatedAt: serverTimestamp(),
  });
  return updated;
}

export async function reviewTenantCommercialProduct(
  tenantId,
  recordId,
  action,
  { actorUid, ownerReviewNotes } = {},
) {
  const target = recordReference(tenantId, recordId);
  const snapshot = await getDoc(target);
  if (!snapshot.exists()) throw new Error('Cleaning product record was not found.');
  const existing = normalizeCleaningRecord({ id: snapshot.id, ...snapshot.data() });
  const reviewed = buildCommercialProductReview(existing, action, {
    actorUid: required(actorUid, 'Acting user is required.'),
    ownerReviewNotes,
  });
  await updateDoc(target, {
    status: reviewed.status,
    ownerReviewNotes: reviewed.ownerReviewNotes,
    employeeVisible: reviewed.employeeVisible,
    reviewedAt: serverTimestamp(),
    reviewedBy: reviewed.reviewedBy,
    updatedAt: serverTimestamp(),
    updatedBy: reviewed.updatedBy,
  });
  return reviewed;
}

export async function reviewTenantCleaningRecord(
  tenantId,
  recordId,
  action,
  { actorUid, ownerReviewNotes } = {},
) {
  const target = recordReference(tenantId, recordId);
  const snapshot = await getDoc(target);
  if (!snapshot.exists()) throw new Error('Cleaning record was not found.');
  const existing = normalizeCleaningRecord({ id: snapshot.id, ...snapshot.data() });
  const reviewed = buildTenantCleaningRecordReview(existing, action, {
    actorUid: required(actorUid, 'Acting user is required.'),
    ownerReviewNotes,
  });
  await updateDoc(target, {
    status: reviewed.status,
    ownerReviewNotes: reviewed.ownerReviewNotes,
    employeeVisible: reviewed.employeeVisible,
    reviewedAt: serverTimestamp(),
    reviewedBy: reviewed.reviewedBy,
    updatedAt: serverTimestamp(),
    updatedBy: reviewed.updatedBy,
  });
  return reviewed;
}
