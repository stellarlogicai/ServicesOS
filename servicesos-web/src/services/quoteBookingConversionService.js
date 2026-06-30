import { collection, doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { addSchemaVersion } from '../shared/schemas/schemaVersioning';

function localDateParts(date) {
  const pad = value => String(value).padStart(2, '0');
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`
  };
}

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

function buildCustomerDisplaySnapshot(lead) {
  const name = firstText(
    lead.customerName,
    joinedName(lead.customer),
    joinedName(lead.customerSnapshot),
    joinedName(lead.formData)
  );
  const email = firstText(
    lead.customer?.email,
    lead.customerSnapshot?.email,
    lead.formData?.email
  );
  const phone = firstText(
    lead.customer?.phone,
    lead.customerSnapshot?.phone,
    lead.formData?.phone
  );

  if (!name && !email && !phone) {
    return { customerName: '', customerSnapshot: lead.customerSnapshot || null };
  }

  return {
    customerName: name,
    customerSnapshot: {
      ...(lead.customerSnapshot || {}),
      ...(name ? { name } : {}),
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {})
    }
  };
}

export function buildQuoteBookingConversion({
  lead,
  bookingData,
  reviewedBy,
  bookingId,
  now = new Date().toISOString()
}) {
  if (!lead?.id) throw new Error('Lead ID is required.');
  if (!reviewedBy) throw new Error('Reviewing admin UID is required.');

  const scheduledDate = new Date(bookingData?.scheduledAt);
  const agreedPrice = Number(bookingData?.agreedPrice);
  if (Number.isNaN(scheduledDate.getTime())) throw new Error('A valid booking date is required.');
  if (!Number.isFinite(agreedPrice) || agreedPrice <= 0) {
    throw new Error('An approved price greater than zero is required.');
  }

  const durationHours = Math.max(Number(lead.estimate?.appointmentDuration) || 2, 0.5);
  const endDate = new Date(scheduledDate.getTime() + durationHours * 60 * 60 * 1000);
  const start = localDateParts(scheduledDate);
  const end = localDateParts(endDate);
  const notes = String(bookingData?.notes || '').trim();
  const customerDisplay = buildCustomerDisplaySnapshot(lead);

  const booking = addSchemaVersion({
    tenantId: lead.tenantId || null,
    leadId: lead.id,
    sourceLeadId: lead.id,
    source: lead.source || 'admin',
    customerId: lead.customerId || null,
    propertyId: lead.propertyId || null,
    ...(customerDisplay.customerName ? { customerName: customerDisplay.customerName } : {}),
    customerSnapshot: customerDisplay.customerSnapshot,
    propertySnapshot: lead.propertySnapshot || null,
    requestSnapshot: lead.requestSnapshot || null,
    appointmentRequest: lead.appointmentRequest || null,
    date: start.date,
    startTime: start.time,
    endTime: end.time,
    scheduledAt: scheduledDate.toISOString(),
    agreedPrice,
    status: 'scheduled',
    serviceType:
      lead.requestSnapshot?.cleaningType ||
      lead.formData?._cleaningType ||
      lead.formData?.cleaningType ||
      null,
    address: lead.propertySnapshot?.address || lead.formData?.address || '',
    notes,
    createdBy: reviewedBy,
    createdAt: now,
    updatedAt: now
  }, 'JOB');

  const leadPatch = {
    status: 'booked',
    booking: {
      bookingId,
      scheduledAt: booking.scheduledAt,
      agreedPrice,
      notes,
      status: booking.status
    },
    estimate: {
      ...(lead.estimate || {}),
      priceLow: agreedPrice,
      priceHigh: agreedPrice,
      requiresReview: false,
      status: 'approved'
    },
    review: {
      ...(lead.review || {}),
      requiresOwnerReview: false,
      status: 'approved',
      reviewedBy,
      reviewedAt: now,
      ownerNotes: notes
    },
    appointmentRequest: lead.appointmentRequest
      ? {
          ...lead.appointmentRequest,
          status: 'approved',
          approvedBookingId: bookingId,
          reviewedAt: now
        }
      : null,
    updatedAt: now
  };

  return { booking, leadPatch };
}

export async function approveQuoteRequestAndCreateBooking({
  tenantId,
  lead,
  bookingData,
  reviewedBy
}) {
  if (!tenantId) throw new Error('Tenant ID is required.');

  const bookingRef = doc(collection(db, 'tenants', tenantId, 'bookings'));
  const leadRef = doc(db, 'tenants', tenantId, 'leads', lead?.id);
  const conversion = buildQuoteBookingConversion({
    lead: { ...lead, tenantId },
    bookingData,
    reviewedBy,
    bookingId: bookingRef.id
  });

  const batch = writeBatch(db);
  batch.set(bookingRef, conversion.booking);
  batch.update(leadRef, conversion.leadPatch);
  await batch.commit();

  return {
    bookingId: bookingRef.id,
    ...conversion
  };
}
