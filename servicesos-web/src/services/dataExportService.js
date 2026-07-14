import { getCustomers } from '../core/customers/customerService';
import { getLeads } from '../core/leads/leadService';
import { getJobs } from '../core/scheduling/schedulingService';

const CUSTOMER_COLUMNS = [
  { key: 'customerId', label: 'customerId' },
  { key: 'name', label: 'name' },
  { key: 'phone', label: 'phone' },
  { key: 'email', label: 'email' },
  { key: 'address', label: 'address' },
  { key: 'serviceArea', label: 'serviceArea' },
  { key: 'status', label: 'status' },
  { key: 'isArchived', label: 'isArchived' },
  { key: 'createdAt', label: 'createdAt' },
  { key: 'updatedAt', label: 'updatedAt' },
];

const LEAD_COLUMNS = [
  { key: 'leadId', label: 'leadId' },
  { key: 'customerName', label: 'customerName' },
  { key: 'phone', label: 'phone' },
  { key: 'email', label: 'email' },
  { key: 'address', label: 'address' },
  { key: 'serviceType', label: 'serviceType' },
  { key: 'requestedDate', label: 'requestedDate' },
  { key: 'estimatedPriceLow', label: 'estimatedPriceLow' },
  { key: 'estimatedPriceHigh', label: 'estimatedPriceHigh' },
  { key: 'status', label: 'status' },
  { key: 'source', label: 'source' },
  { key: 'sourceDetail', label: 'sourceDetail' },
  { key: 'bookingId', label: 'bookingId' },
  { key: 'createdAt', label: 'createdAt' },
  { key: 'updatedAt', label: 'updatedAt' },
];

const BOOKING_COLUMNS = [
  { key: 'bookingId', label: 'bookingId' },
  { key: 'leadId', label: 'leadId' },
  { key: 'customerId', label: 'customerId' },
  { key: 'customerName', label: 'customerName' },
  { key: 'phone', label: 'phone' },
  { key: 'address', label: 'address' },
  { key: 'serviceType', label: 'serviceType' },
  { key: 'scheduledAt', label: 'scheduledAt' },
  { key: 'agreedPrice', label: 'agreedPrice' },
  { key: 'bookingStatus', label: 'bookingStatus' },
  { key: 'fieldStatus', label: 'fieldStatus' },
  { key: 'paymentStatus', label: 'paymentStatus' },
  { key: 'completedAt', label: 'completedAt' },
  { key: 'createdAt', label: 'createdAt' },
  { key: 'updatedAt', label: 'updatedAt' },
];

const PAYMENT_COLUMNS = [
  { key: 'bookingId', label: 'bookingId' },
  { key: 'customerName', label: 'customerName' },
  { key: 'scheduledAt', label: 'scheduledAt' },
  { key: 'agreedPrice', label: 'agreedPrice' },
  { key: 'paymentStatus', label: 'paymentStatus' },
  { key: 'paymentMethod', label: 'paymentMethod' },
  { key: 'amountReceived', label: 'amountReceived' },
  { key: 'amountStillOwed', label: 'amountStillOwed' },
  { key: 'paymentReceivedDate', label: 'paymentReceivedDate' },
  { key: 'manualPaymentNote', label: 'manualPaymentNote' },
  { key: 'paymentStatusUpdatedBy', label: 'paymentStatusUpdatedBy' },
  { key: 'stripeConfirmed', label: 'stripeConfirmed' },
  { key: 'createdAt', label: 'createdAt' },
  { key: 'updatedAt', label: 'updatedAt' },
];

export const CSV_EXPORTS = [
  {
    id: 'customers',
    dataKey: 'customers',
    label: 'Customers',
    description: 'Download your active and archived customer records as a CSV file.',
    emptyMessage: 'No customer records to export.',
    filePrefix: 'customers',
    columns: CUSTOMER_COLUMNS,
  },
  {
    id: 'leads',
    dataKey: 'leads',
    label: 'Leads and quote requests',
    description: 'Download your leads and quote requests as a CSV file.',
    emptyMessage: 'No leads or quote requests to export.',
    filePrefix: 'leads',
    columns: LEAD_COLUMNS,
  },
  {
    id: 'bookings',
    dataKey: 'bookings',
    label: 'Bookings',
    description: 'Download your booking records, including schedule and status information.',
    emptyMessage: 'No booking records to export.',
    filePrefix: 'bookings',
    columns: BOOKING_COLUMNS,
  },
  {
    id: 'payments',
    dataKey: 'bookings',
    label: 'Payment records',
    description: 'Download booking payment status and owner-recorded payment details.',
    emptyMessage: 'No booking payment records to export.',
    filePrefix: 'payments',
    columns: PAYMENT_COLUMNS,
  },
];

function resultData(result, label) {
  if (!result?.success || !Array.isArray(result.data)) {
    throw new Error(`${label} could not be loaded.`);
  }
  return result.data;
}

function firstText(...values) {
  return values.find(value => typeof value === 'string' && value.trim())?.trim() || '';
}

function joinedName(source) {
  if (!source || typeof source !== 'object') return '';
  return firstText(
    source.fullName,
    source.displayName,
    source.name,
    [source.firstName, source.lastName].filter(Boolean).join(' '),
  );
}

function addressText(value) {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object') return '';
  return [value.street, value.address, value.city, value.state, value.zip || value.zipCode]
    .filter(Boolean)
    .join(', ');
}

function numberOrBlank(value) {
  if (value === null || value === undefined || value === '') return '';
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : '';
}

function bookingCustomerName(booking) {
  return firstText(
    booking.customerName,
    joinedName(booking.customer),
    joinedName(booking.customerSnapshot),
    joinedName(booking.formData),
  );
}

function bookingAddress(booking) {
  return firstText(
    addressText(booking.address),
    addressText(booking.propertySnapshot?.address),
    addressText(booking.customerSnapshot?.address),
    addressText(booking.formData?.address),
  );
}

function bookingPhone(booking) {
  return firstText(
    booking.customerPhone,
    booking.customer?.phone,
    booking.customerSnapshot?.phone,
    booking.formData?.phone,
  );
}

function bookingServiceType(booking) {
  return firstText(
    booking.serviceType,
    typeof booking.service === 'string' ? booking.service : booking.service?.name,
    booking.requestSnapshot?.cleaningType,
    booking.formData?._cleaningType,
    booking.formData?.cleaningType,
  );
}

function bookingSchedule(booking) {
  if (booking.scheduledAt !== null && booking.scheduledAt !== undefined && booking.scheduledAt !== '') {
    return booking.scheduledAt;
  }
  if (booking.date && booking.startTime) return `${booking.date}T${booking.startTime}`;
  return booking.date || '';
}

function stripeConfirmed(booking) {
  if (booking.paymentStatusUpdatedBy === 'stripe_webhook') return true;
  if (booking.paymentMethod && booking.paymentMethod !== 'stripe') return false;
  return '';
}

export async function loadTenantExportData(tenantId) {
  if (!tenantId) throw new Error('An active tenant is required.');

  const [customersResult, leadsResult, bookingsResult] = await Promise.all([
    getCustomers(tenantId),
    getLeads(tenantId),
    getJobs(tenantId),
  ]);

  return {
    customers: resultData(customersResult, 'Customer records'),
    leads: resultData(leadsResult, 'Lead records'),
    bookings: resultData(bookingsResult, 'Booking records'),
  };
}

export function buildCustomerRows(customers = []) {
  return customers.map(customer => ({
    customerId: customer.id || '',
    name: firstText(customer.name, customer.customerName, customer.fullName, joinedName(customer)),
    phone: firstText(customer.phone, customer.customerPhone),
    email: firstText(customer.email, customer.customerEmail),
    address: firstText(addressText(customer.address), addressText(customer.propertyAddress)),
    serviceArea: firstText(customer.serviceArea),
    status: firstText(customer.status),
    isArchived: customer.isArchived === true,
    createdAt: customer.createdAt || '',
    updatedAt: customer.updatedAt || '',
  }));
}

export function buildLeadRows(leads = []) {
  return leads.map(lead => {
    const customerSnapshot = lead.customerSnapshot || {};
    const propertySnapshot = lead.propertySnapshot || {};
    const requestSnapshot = lead.requestSnapshot || {};
    const formData = lead.formData || lead;

    return {
      leadId: lead.id || '',
      customerName: firstText(lead.customerName, joinedName(customerSnapshot), joinedName(formData)),
      phone: firstText(customerSnapshot.phone, formData.phone),
      email: firstText(customerSnapshot.email, formData.email),
      address: firstText(addressText(propertySnapshot.address), addressText(formData.address)),
      serviceType: firstText(requestSnapshot.cleaningType, formData._cleaningType, formData.cleaningType),
      requestedDate: firstText(lead.appointmentRequest?.preferredDate, requestSnapshot.preferredDate, formData.preferredDate),
      estimatedPriceLow: numberOrBlank(lead.estimate?.priceLow),
      estimatedPriceHigh: numberOrBlank(lead.estimate?.priceHigh),
      status: firstText(lead.status),
      source: firstText(lead.source),
      sourceDetail: firstText(lead.sourceDetail),
      bookingId: firstText(lead.booking?.bookingId, lead.appointmentRequest?.approvedBookingId),
      createdAt: lead.createdAt || '',
      updatedAt: lead.updatedAt || '',
    };
  });
}

export function buildBookingRows(bookings = []) {
  return bookings.map(booking => ({
    bookingId: booking.id || '',
    leadId: firstText(booking.leadId, booking.sourceLeadId),
    customerId: firstText(booking.customerId),
    customerName: bookingCustomerName(booking),
    phone: bookingPhone(booking),
    address: bookingAddress(booking),
    serviceType: bookingServiceType(booking),
    scheduledAt: bookingSchedule(booking),
    agreedPrice: numberOrBlank(booking.agreedPrice ?? booking.price),
    bookingStatus: firstText(booking.status),
    fieldStatus: firstText(booking.fieldStatus),
    paymentStatus: firstText(booking.paymentStatus),
    completedAt: booking.completedAt || '',
    createdAt: booking.createdAt || '',
    updatedAt: booking.updatedAt || '',
  }));
}

export function buildPaymentRows(bookings = []) {
  return bookings.map(booking => {
    const agreedPrice = numberOrBlank(booking.agreedPrice ?? booking.price);
    const amountReceived = numberOrBlank(booking.amountReceived);
    const amountStillOwed = agreedPrice === ''
      ? ''
      : Math.max(agreedPrice - (amountReceived === '' ? 0 : amountReceived), 0);
    const manuallyRecorded = booking.paymentStatusUpdatedBy !== 'stripe_webhook';

    return {
      bookingId: booking.id || '',
      customerName: bookingCustomerName(booking),
      scheduledAt: bookingSchedule(booking),
      agreedPrice,
      paymentStatus: firstText(booking.paymentStatus),
      paymentMethod: firstText(booking.paymentMethod),
      amountReceived,
      amountStillOwed,
      paymentReceivedDate: booking.receivedAt || booking.stripePaidAt || '',
      manualPaymentNote: manuallyRecorded ? firstText(booking.paymentNote) : '',
      paymentStatusUpdatedBy: firstText(booking.paymentStatusUpdatedBy),
      stripeConfirmed: stripeConfirmed(booking),
      createdAt: booking.createdAt || '',
      updatedAt: booking.updatedAt || '',
    };
  });
}

export function buildExportRows(exportId, records = []) {
  switch (exportId) {
    case 'customers': return buildCustomerRows(records);
    case 'leads': return buildLeadRows(records);
    case 'bookings': return buildBookingRows(records);
    case 'payments': return buildPaymentRows(records);
    default: throw new Error('Unsupported export type.');
  }
}
