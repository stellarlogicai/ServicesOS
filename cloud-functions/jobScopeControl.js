const crypto = require('node:crypto');

const SCOPE_SCHEMA_VERSION = 1;
const MAX_SCOPE_ITEMS = 500;

function text(value, maximum = 1000) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function address(value) {
  if (typeof value === 'string') return text(value, 500);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  return ['street', 'address', 'city', 'state', 'zip', 'zipCode']
    .map(key => text(value[key], 160)).filter(Boolean).join(', ');
}

function checklistItems(booking) {
  const source = Array.isArray(booking.jobChecklistSnapshot?.items)
    ? booking.jobChecklistSnapshot.items : [];
  return source.slice(0, MAX_SCOPE_ITEMS).map(item => ({
    id: text(item?.id, 128),
    label: text(item?.label, 160),
    area: text(item?.area, 120),
    required: item?.required === true,
  })).filter(item => item.id && item.label);
}

function selectedAddOns(booking) {
  const scope = booking.requestSnapshot?.serviceScope || booking.formData?.serviceScope;
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) return [];
  return Object.keys(scope).filter(key => scope[key] === true).sort().slice(0, 100);
}

function canonicalJobScopeSnapshot(bookingId, booking = {}) {
  const customer = booking.customerSnapshot || {};
  const property = booking.propertySnapshot || {};
  return {
    schemaVersion: SCOPE_SCHEMA_VERSION,
    bookingId,
    bookingType: ['residential', 'commercial'].includes(booking.bookingType) ? booking.bookingType : 'legacy',
    customerName: text(booking.customerName || customer.fullName || customer.name, 160),
    serviceLocation: address(booking.address || property.address || property),
    serviceType: text(booking.serviceType || booking.requestSnapshot?.cleaningType, 160),
    schedule: {
      date: text(booking.date, 10),
      startTime: text(booking.startTime, 8),
      endTime: text(booking.endTime, 8),
      scheduledAt: text(booking.scheduledAt, 40),
    },
    serviceItems: checklistItems(booking),
    selectedAddOns: selectedAddOns(booking),
    price: Number.isFinite(Number(booking.agreedPrice)) ? Number(booking.agreedPrice) : null,
    estimatedDuration: Number.isFinite(Number(booking.estimatedDuration)) ? Number(booking.estimatedDuration) : null,
    accessInstructions: text(booking.accessInstructions || booking.requestSnapshot?.accessInstructions, 1000),
    scopeNotes: text(booking.requestSnapshot?.specialRequests || booking.commercialDetails?.areasToClean, 1000),
    exclusions: text(booking.scopeExclusions, 1000),
  };
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

function scopeHash(snapshot) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(snapshot))).digest('hex');
}

function scopeSummary(control, currentHash) {
  if (!control?.latestVersion) return { state: 'draft', version: 0, approvedVersion: null, approvedAt: null };
  const changed = Boolean(control.approvedVersion && control.approvedScopeHash !== currentHash);
  return {
    state: changed ? 'approval_required' : control.state,
    version: control.latestVersion,
    approvedVersion: control.approvedVersion || null,
    approvedAt: control.approvedAt || null,
  };
}

module.exports = { SCOPE_SCHEMA_VERSION, canonicalJobScopeSnapshot, scopeHash, scopeSummary };
