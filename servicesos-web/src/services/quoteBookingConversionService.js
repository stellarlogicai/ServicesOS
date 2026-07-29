import { collection, doc, runTransaction } from 'firebase/firestore';
import { db } from '../firebase';
import { addSchemaVersion } from '../shared/schemas/schemaVersioning';
import {
  buildQuoteRequestSnapshot,
  normalizeQuoteIntakeData,
} from './customerPortalQuoteRequestMapper';

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

const CONVERSION_ERROR_CODE = 'booking-conversion-inconsistent';

function conversionStateError(message) {
  const error = new Error(message);
  error.code = CONVERSION_ERROR_CODE;
  return error;
}

function bookingReference(lead) {
  const bookingId = firstText(lead?.booking?.bookingId);
  const approvedBookingId = firstText(lead?.appointmentRequest?.approvedBookingId);

  if (bookingId && approvedBookingId && bookingId !== approvedBookingId) {
    throw conversionStateError(
      'This request has conflicting booking references. Review the request before trying again.'
    );
  }

  const hasPartialBookingState = lead?.status === 'booked' || approvedBookingId || lead?.booking;
  if (!bookingId && hasPartialBookingState) {
    throw conversionStateError(
      'This request is marked as booked, but its booking reference is missing. Review the request before trying again.'
    );
  }

  return bookingId;
}

function validateStoredLead(lead, tenantId, leadId) {
  if (!lead || typeof lead !== 'object') {
    throw conversionStateError('This request no longer exists. Refresh the dashboard before trying again.');
  }
  const tenantIdIsMissing = lead.tenantId === undefined || lead.tenantId === null || lead.tenantId === '';
  if (!tenantIdIsMissing && lead.tenantId !== tenantId) {
    throw conversionStateError(
      'This request does not belong to the selected tenant. Refresh the dashboard before trying again.'
    );
  }
  if (!leadId || lead.id && lead.id !== leadId) {
    throw conversionStateError('This request has inconsistent identity data and cannot be booked safely.');
  }

  return tenantIdIsMissing;
}

function validateExistingBooking({ booking, bookingId, tenantId, leadId, lead }) {
  if (!booking) {
    throw conversionStateError(
      'This request references a booking that could not be found. Review the request before trying again.'
    );
  }
  const matchesLead = booking.leadId === leadId || booking.sourceLeadId === leadId;
  if (lead.status !== 'booked' || booking.tenantId !== tenantId || !matchesLead) {
    throw conversionStateError(
      'This request has an inconsistent booking relationship. Review it before trying again.'
    );
  }
  if (lead.appointmentRequest && firstText(lead.appointmentRequest.approvedBookingId) !== bookingId) {
    throw conversionStateError(
      'This request has an incomplete appointment-to-booking link. Review it before trying again.'
    );
  }
}

function existingLeadPatch(lead) {
  return {
    status: lead.status,
    booking: lead.booking || null,
    estimate: lead.estimate || null,
    review: lead.review || null,
    appointmentRequest: lead.appointmentRequest || null,
    updatedAt: lead.updatedAt || null,
  };
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
  const legacySnapshots = lead.formData && (!lead.propertySnapshot || !lead.requestSnapshot)
    ? buildQuoteRequestSnapshot({
        normalizedData: normalizeQuoteIntakeData(lead.formData),
        submittedAt: lead.createdAt || now,
      })
    : null;

  const booking = addSchemaVersion({
    tenantId: lead.tenantId || null,
    leadId: lead.id,
    sourceLeadId: lead.id,
    source: lead.source || 'admin',
    customerId: lead.customerId || null,
    propertyId: lead.propertyId || null,
    ...(customerDisplay.customerName ? { customerName: customerDisplay.customerName } : {}),
    customerSnapshot: customerDisplay.customerSnapshot,
    propertySnapshot: lead.propertySnapshot || legacySnapshots?.propertySnapshot || null,
    requestSnapshot: lead.requestSnapshot || legacySnapshots?.requestSnapshot || null,
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
  if (!lead?.id) throw new Error('Lead ID is required.');

  const bookingRef = doc(collection(db, 'tenants', tenantId, 'bookings'));
  const leadRef = doc(db, 'tenants', tenantId, 'leads', lead.id);
  const operationNow = new Date().toISOString();

  return runTransaction(db, async transaction => {
    const leadSnapshot = await transaction.get(leadRef);
    if (!leadSnapshot.exists()) {
      throw conversionStateError('This request no longer exists. Refresh the dashboard before trying again.');
    }

    const storedLead = { id: leadSnapshot.id, ...leadSnapshot.data() };
    const tenantIdRequiresNormalization = validateStoredLead(storedLead, tenantId, lead.id);
    const trustedStoredLead = tenantIdRequiresNormalization
      ? { ...storedLead, tenantId }
      : storedLead;
    const existingBookingId = bookingReference(trustedStoredLead);

    if (existingBookingId) {
      const existingBookingRef = doc(db, 'tenants', tenantId, 'bookings', existingBookingId);
      const existingBookingSnapshot = await transaction.get(existingBookingRef);
      const existingBooking = existingBookingSnapshot.exists()
        ? { id: existingBookingSnapshot.id, ...existingBookingSnapshot.data() }
        : null;
      validateExistingBooking({
        booking: existingBooking,
        bookingId: existingBookingId,
        tenantId,
        leadId: lead.id,
        lead: trustedStoredLead,
      });
      if (tenantIdRequiresNormalization) {
        transaction.update(leadRef, { tenantId });
      }
      return {
        bookingId: existingBookingId,
        booking: existingBooking,
        leadPatch: {
          ...existingLeadPatch(trustedStoredLead),
          ...(tenantIdRequiresNormalization ? { tenantId } : {}),
        },
        alreadyConverted: true,
      };
    }

    const conversion = buildQuoteBookingConversion({
      lead: trustedStoredLead,
      bookingData,
      reviewedBy,
      bookingId: bookingRef.id,
      now: operationNow,
    });
    const leadPatch = {
      ...conversion.leadPatch,
      ...(tenantIdRequiresNormalization ? { tenantId } : {}),
    };

    transaction.set(bookingRef, conversion.booking);
    transaction.update(leadRef, leadPatch);

    return {
      bookingId: bookingRef.id,
      ...conversion,
      leadPatch,
      alreadyConverted: false,
    };
  });
}
