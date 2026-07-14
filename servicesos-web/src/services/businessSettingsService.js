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
    businessAddress: text(settings.businessAddress),
    websiteUrl: text(settings.websiteUrl),
    facebookUrl: text(settings.facebookUrl),
    defaultServiceNotes: text(settings.defaultServiceNotes),
    availability: { availableDays },
  };
}

function maskStripeAccountId(stripeAccountId) {
  const normalized = text(stripeAccountId);
  return normalized ? `...${normalized.slice(-6)}` : '';
}

function getStripeConnectionStatus(tenant = {}) {
  const stripeAccountId = text(tenant.stripeAccountId);
  const chargesEnabled = tenant.chargesEnabled === true;
  const payoutsEnabled = tenant.payoutsEnabled === true;
  const status = text(tenant.stripeStatus || tenant.stripeConnectStatus || tenant.stripeAccountStatus || tenant.stripeAccountMode);

  if (stripeAccountId && chargesEnabled && payoutsEnabled) {
    return {
      label: 'Connected',
      detail: 'Stripe is connected for booking payment links.',
      stripeAccountId: maskStripeAccountId(stripeAccountId),
      chargesEnabled,
      payoutsEnabled,
      status,
    };
  }

  if (stripeAccountId) {
    return {
      label: 'Needs setup',
      detail: 'Stripe account exists, but payments or payouts are not fully ready yet.',
      stripeAccountId: maskStripeAccountId(stripeAccountId),
      chargesEnabled,
      payoutsEnabled,
      status,
    };
  }

  return {
    label: 'Not connected',
    detail: 'Stripe is not connected yet.',
    stripeAccountId: '',
    chargesEnabled,
    payoutsEnabled,
    status: status || 'unknown',
  };
}

export async function getBusinessSettings(tenantId) {
  if (!tenantId) throw new Error('Tenant ID is required.');
  const snapshot = await getDoc(doc(db, 'tenants', tenantId));
  if (!snapshot.exists()) throw new Error('Tenant not found.');
  const tenant = snapshot.data();
  return {
    ...sanitizeBusinessSettings({
      businessName: tenant.businessSettings?.businessName ?? tenant.businessName,
      businessPhone: tenant.businessSettings?.businessPhone ?? tenant.businessPhone,
      businessEmail: tenant.businessSettings?.businessEmail ?? tenant.businessEmail,
      serviceArea: tenant.businessSettings?.serviceArea ?? tenant.serviceArea,
      businessAddress: tenant.businessSettings?.businessAddress ?? tenant.businessAddress,
      websiteUrl: tenant.businessSettings?.websiteUrl ?? tenant.websiteUrl,
      facebookUrl: tenant.businessSettings?.facebookUrl ?? tenant.facebookUrl,
      defaultServiceNotes: tenant.businessSettings?.defaultServiceNotes ?? tenant.defaultServiceNotes,
      availability: tenant.businessSettings?.availability,
    }),
    stripeConnection: getStripeConnectionStatus(tenant),
  };
}

export async function saveBusinessSettings(tenantId, proposedSettings, options = {}) {
  if (!tenantId) throw new Error('Tenant ID is required.');
  const businessSettings = sanitizeBusinessSettings(proposedSettings);
  if (businessSettings.availability.availableDays.length === 0) {
    throw new Error('Select at least one available day.');
  }
  const patch = {
    businessSettings,
    updatedAt: serverTimestamp(),
  };
  if (text(options.updatedByUid)) {
    patch.updatedByUid = text(options.updatedByUid);
  }
  await updateDoc(doc(db, 'tenants', tenantId), patch);
  return businessSettings;
}
