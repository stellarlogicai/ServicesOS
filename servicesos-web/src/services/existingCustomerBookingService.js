import { collection, doc, runTransaction } from 'firebase/firestore';
import { db } from '../firebase';
import { addSchemaVersion } from '../shared/schemas/schemaVersioning';
import { errorResponse, successResponse } from '../shared/api/apiResponseStandard';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const TIME_ONLY = /^\d{2}:\d{2}$/;

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function localDateParts(date) {
  const pad = value => String(value).padStart(2, '0');
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

function splitCustomerName(customer) {
  const structuredFirstName = text(customer?.firstName);
  const structuredLastName = text(customer?.lastName);
  if (structuredFirstName || structuredLastName) {
    return { firstName: structuredFirstName, lastName: structuredLastName };
  }

  const [firstName = '', ...lastNameParts] = text(customer?.name).split(/\s+/).filter(Boolean);
  return { firstName, lastName: lastNameParts.join(' ') };
}

function firstText(...values) {
  for (const value of values) {
    const normalized = text(value);
    if (normalized) return normalized;
  }
  return '';
}

function propertySource(customer) {
  return customer?.propertySnapshot && typeof customer.propertySnapshot === 'object'
    ? customer.propertySnapshot
    : {};
}

export function mapExistingCustomerProperty(customer) {
  const property = propertySource(customer);
  return {
    address: firstText(customer?.address, property.address),
    city: firstText(customer?.city, property.city),
    state: firstText(customer?.state, property.state),
    zip: firstText(customer?.zip, customer?.zipCode, property.zip, property.zipCode),
  };
}

export function mapExistingCustomerToEstimatePrefill(customer) {
  const { firstName, lastName } = splitCustomerName(customer);
  const property = mapExistingCustomerProperty(customer);
  return {
    firstName,
    lastName,
    email: text(customer?.email),
    phone: text(customer?.phone),
    ...property,
  };
}

function validDate(value) {
  if (!DATE_ONLY.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime()) && localDateParts(date).date === value;
}

function validTime(value) {
  if (!TIME_ONLY.test(value)) return false;
  const [hours, minutes] = value.split(':').map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function bookingValidationError(message) {
  return errorResponse(message, 'VALIDATION_ERROR');
}

export function buildExistingCustomerBooking({ tenantId, customer, bookingInput, createdBy, now }) {
  const serviceType = text(bookingInput?.serviceType);
  const date = text(bookingInput?.date);
  const startTime = text(bookingInput?.startTime);
  const notes = text(bookingInput?.notes);
  const agreedPrice = Number(bookingInput?.agreedPrice);

  if (!tenantId) return bookingValidationError('Tenant is unavailable. Select a tenant and try again.');
  if (!customer?.id) return bookingValidationError('Customer no longer exists. Refresh Customers and try again.');
  if (customer.tenantId && customer.tenantId !== tenantId) {
    return bookingValidationError('This customer does not belong to the selected tenant. Refresh Customers and try again.');
  }
  if (customer.isArchived === true) return bookingValidationError('Archived customers cannot be scheduled for a new job.');
  if (!serviceType) return bookingValidationError('A service type or job title is required.');
  if (!validDate(date)) return bookingValidationError('Choose a valid booking date.');
  if (!validTime(startTime)) return bookingValidationError('Choose a valid booking time.');
  if (!Number.isFinite(agreedPrice) || agreedPrice <= 0) {
    return bookingValidationError('Enter an approved price greater than zero.');
  }
  if (!text(createdBy)) return bookingValidationError('Your authenticated user ID is required to create a booking.');

  const scheduledDate = new Date(`${date}T${startTime}`);
  if (Number.isNaN(scheduledDate.getTime())) return bookingValidationError('Choose a valid booking date and time.');

  const name = text(customer.name) || [text(customer.firstName), text(customer.lastName)].filter(Boolean).join(' ');
  const customerSnapshot = {
    customerId: customer.id,
    name,
    fullName: name,
    email: text(customer.email),
    phone: text(customer.phone),
  };
  const property = mapExistingCustomerProperty(customer);
  const propertySnapshot = {
    address: property.address,
    city: property.city,
    state: property.state,
    zipCode: property.zip,
  };

  return successResponse(addSchemaVersion({
    tenantId,
    source: 'owner-existing-customer',
    customerId: customer.id,
    customerName: name,
    customerSnapshot,
    propertySnapshot,
    requestSnapshot: {
      cleaningType: serviceType,
      specialRequests: notes,
      submittedAt: now,
    },
    date,
    startTime,
    scheduledAt: scheduledDate.toISOString(),
    agreedPrice,
    status: 'scheduled',
    serviceType,
    address: propertySnapshot.address,
    notes,
    createdBy: text(createdBy),
    createdAt: now,
    updatedAt: now,
  }, 'JOB'));
}

export async function createExistingCustomerBooking({ tenantId, customerId, bookingInput, createdBy }) {
  if (!tenantId || !customerId) {
    return bookingValidationError('Tenant and customer are required to create a booking.');
  }

  const customerRef = doc(db, 'tenants', tenantId, 'customers', customerId);
  const bookingRef = doc(collection(db, 'tenants', tenantId, 'bookings'));
  const now = new Date().toISOString();

  try {
    return await runTransaction(db, async transaction => {
      const customerSnapshot = await transaction.get(customerRef);
      if (!customerSnapshot.exists()) {
        return bookingValidationError('Customer no longer exists. Refresh Customers and try again.');
      }

      const customer = { id: customerSnapshot.id, ...customerSnapshot.data() };
      if (customer.tenantId && customer.tenantId !== tenantId) {
        return bookingValidationError('This customer does not belong to the selected tenant. Refresh Customers and try again.');
      }
      const builtBooking = buildExistingCustomerBooking({ tenantId, customer, bookingInput, createdBy, now });
      if (!builtBooking.success) return builtBooking;

      transaction.set(bookingRef, builtBooking.data);
      return successResponse(
        { id: bookingRef.id, ...builtBooking.data },
        'Booking created successfully.'
      );
    });
  } catch (error) {
    console.error('Failed to create booking from an existing customer:', error);
    return errorResponse('Booking could not be created. Check your connection and try again.', 'FIRESTORE_ERROR', error);
  }
}
