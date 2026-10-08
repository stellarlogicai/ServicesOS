import {
  BOOKING_MANUAL_PAYMENT_STATUS_LABELS,
  BOOKING_PAYMENT_METHOD_LABELS,
} from '../core/scheduling/schedulingService';
import { formatDateOnly } from '../utils/dateOnly';
import { cents, bookingObligationCents } from '../../../cloud-functions/bookingFinancialAmount.mjs';

export const bookingOriginalPrice = booking => {
  const base = cents(booking.agreedPrice ?? booking.price);
  return base === null ? 'Price not set' : currency(base / 100);
};
export const bookingObligationAmount = booking => {
  const total = bookingObligationCents(booking);
  return total === null ? null : total / 100;
};

function firstText(...values) {
  return values.find(value => typeof value === 'string' && value.trim())?.trim() || '';
}

function joinedName(source) {
  if (!source || typeof source !== 'object') return '';
  return firstText(
    source.fullName,
    source.name,
    [source.firstName, source.lastName].filter(Boolean).join(' ')
  );
}

export function bookingCustomerName(booking = {}) {
  return firstText(
    booking.customerName,
    joinedName(booking.customer),
    joinedName(booking.customerSnapshot),
    joinedName(booking.formData)
  ) || 'Unknown customer';
}

export function bookingServiceType(booking = {}) {
  return firstText(
    booking.serviceType,
    typeof booking.service === 'string' ? booking.service : booking.service?.name,
    booking.requestSnapshot?.cleaningType,
    booking.formData?._cleaningType,
    booking.formData?.cleaningType
  ) || 'Service not specified';
}

export function bookingTypeLabel(booking = {}) {
  if (booking.bookingType === 'commercial') return 'Commercial';
  if (booking.bookingType === 'residential') return 'Residential';
  return 'Booking';
}

function addressText(value) {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object') return '';
  return [value.street, value.address, value.city, value.state, value.zip || value.zipCode]
    .filter(Boolean)
    .join(', ');
}

export function bookingAddress(booking = {}) {
  return firstText(
    addressText(booking.address),
    addressText(booking.propertySnapshot?.address),
    addressText(booking.customerSnapshot?.address),
    addressText(booking.formData?.address)
  ) || 'Address not provided';
}

function toDate(value) {
  if (!value) return null;
  const converted = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
  return Number.isNaN(converted.getTime()) ? null : converted;
}

export function bookingSchedule(booking = {}) {
  const scheduledAt = toDate(booking.scheduledAt);
  if (scheduledAt) {
    return scheduledAt.toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }

  const dateValue = booking.date || booking.appointmentDate;
  const timeValue = firstText(booking.startTime, booking.time, booking.appointmentTime);
  if (!dateValue) return 'Not scheduled';

  const date = toDate(`${dateValue}T00:00:00`);
  const displayDate = date
    ? date.toLocaleDateString('en-US', { dateStyle: 'medium' })
    : String(dateValue);
  return timeValue ? `${displayDate} at ${timeValue}` : displayDate;
}

export function bookingPrice(booking = {}) {
  const total = bookingObligationAmount(booking);
  if (total !== null) return currency(total);
  if (booking.approvedJobScope) return 'Price not set';

  if (Number.isFinite(Number(booking.estimate?.priceLow))) {
    const low = Number(booking.estimate.priceLow);
    const high = Number(booking.estimate.priceHigh);
    return Number.isFinite(high) && high !== low
      ? `$${low.toFixed(2)} - $${high.toFixed(2)}`
      : `$${low.toFixed(2)}`;
  }

  return 'Price not set';
}

export function bookingStatus(booking = {}) {
  return firstText(booking.status) || 'Booked';
}

export function bookingPaymentStatus(booking = {}) {
  return BOOKING_MANUAL_PAYMENT_STATUS_LABELS[firstText(booking.paymentStatus)] || 'Payment status not set';
}

export function bookingPaymentMethod(booking = {}) {
  const method = firstText(booking.paymentMethod);
  if (!method) return '';
  if (method === 'stripe') return 'Stripe (confirmed by Stripe)';
  const label = BOOKING_PAYMENT_METHOD_LABELS[method];
  if (!label) return '';
  return method === 'stripe_manual_reference'
    ? `${label} (owner-entered reference)`
    : `${label} (manual/outside ServicesOS)`;
}

function currency(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '';
  return `$${amount.toFixed(2)}`;
}

export function bookingAmountReceived(booking = {}) {
  if (booking.amountReceived === null || booking.amountReceived === undefined || booking.amountReceived === '') {
    return '';
  }
  return currency(booking.amountReceived);
}

export function bookingStillOwed(booking = {}) {
  if (booking.paymentAccounting?.version === 1 &&
      Number.isSafeInteger(booking.remainingBalanceCents) && booking.remainingBalanceCents >= 0) {
    return currency(booking.remainingBalanceCents / 100);
  }
  const agreedPrice = bookingObligationAmount(booking);
  if (agreedPrice === null) return 'Unavailable';

  const amountReceived = Number(booking.amountReceived);
  if (!Number.isFinite(amountReceived)) return currency(agreedPrice);

  return currency(Math.max(agreedPrice - amountReceived, 0));
}

export function bookingReceivedDate(booking = {}) {
  const receivedAt = firstText(booking.receivedAt);
  if (!receivedAt) return '';
  const dateOnly = formatDateOnly(receivedAt);
  if (dateOnly) return dateOnly;
  const date = toDate(receivedAt);
  return date
    ? date.toLocaleDateString('en-US', { dateStyle: 'medium' })
    : '';
}

export function bookingPaymentNote(booking = {}) {
  return firstText(booking.paymentNote);
}

export function bookingCustomerEmail(booking = {}) {
  return firstText(
    booking.customerEmail,
    booking.customer?.email,
    booking.customerSnapshot?.email,
    booking.formData?.email
  ) || 'Email not provided';
}

export function bookingCustomerPhone(booking = {}) {
  return firstText(
    booking.customerPhone,
    booking.customer?.phone,
    booking.customerSnapshot?.phone,
    booking.formData?.phone
  ) || 'Phone not provided';
}

export function bookingNotes(booking = {}) {
  return firstText(
    booking.notes,
    booking.technicianNotes,
    booking.internalNotes,
    booking.formData?.specialRequests,
    booking.requestSnapshot?.specialRequests
  ) || 'No notes provided';
}

export function bookingReference(booking = {}) {
  return firstText(booking.leadId, booking.requestId, booking.id);
}
