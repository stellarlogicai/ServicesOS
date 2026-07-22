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
  buildCommercialProductCreate,
  buildCommercialProductDetailsUpdate,
  buildCommercialProductReview,
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

export async function listTenantCommercialProducts(tenantId) {
  const snapshot = await getDocs(recordCollection(tenantId));
  return snapshot.docs
    .map(item => normalizeCleaningRecord({ id: item.id, ...item.data() }))
    .filter(item => item.recordType === 'commercial_product' && item.scope === 'tenant')
    .sort((left, right) => left.name.localeCompare(right.name));
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
