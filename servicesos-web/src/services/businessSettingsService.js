import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

export const BUSINESS_DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

export const DEFAULT_AVAILABLE_DAYS = BUSINESS_DAYS.slice(0, 5);

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function sanitizeBusinessSettings(settings = {}) {
  const requestedDays = settings.availability?.availableDays;
  const availableDays = Array.isArray(requestedDays)
    ? BUSINESS_DAYS.filter(day => requestedDays.includes(day))
    : DEFAULT_AVAILABLE_DAYS;

  return {
    businessName: text(settings.businessName),
    businessPhone: text(settings.businessPhone),
    businessEmail: text(settings.businessEmail),
    serviceArea: text(settings.serviceArea),
    availability: { availableDays },
  };
}

export async function getBusinessSettings(tenantId) {
  if (!tenantId) throw new Error('Tenant ID is required.');
  const snapshot = await getDoc(doc(db, 'tenants', tenantId));
  if (!snapshot.exists()) throw new Error('Tenant not found.');
  const tenant = snapshot.data();
  return sanitizeBusinessSettings({
    businessName: tenant.businessSettings?.businessName ?? tenant.businessName,
    businessPhone: tenant.businessSettings?.businessPhone ?? tenant.businessPhone,
    businessEmail: tenant.businessSettings?.businessEmail ?? tenant.businessEmail,
    serviceArea: tenant.businessSettings?.serviceArea ?? tenant.serviceArea,
    availability: tenant.businessSettings?.availability,
  });
}

export async function saveBusinessSettings(tenantId, proposedSettings) {
  if (!tenantId) throw new Error('Tenant ID is required.');
  const businessSettings = sanitizeBusinessSettings(proposedSettings);
  if (businessSettings.availability.availableDays.length === 0) {
    throw new Error('Select at least one available day.');
  }
  await updateDoc(doc(db, 'tenants', tenantId), {
    businessSettings,
    updatedAt: serverTimestamp(),
  });
  return businessSettings;
}
