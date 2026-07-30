import { describe, expect, it } from 'vitest';
import {
  buildExistingCustomerBooking,
  mapExistingCustomerProperty,
  mapExistingCustomerToEstimatePrefill,
} from '../services/existingCustomerBookingService';

const customer = {
  id: 'customer-a',
  name: 'Ada Marie De La Cruz',
  email: 'ada@example.com',
  phone: '555-0100',
  address: '10 Main Street',
  city: 'Bolivar',
  state: 'MO',
  zip: '65613',
};

describe('existing customer repeat workflow service', () => {
  it('maps a saved full name deterministically without changing the customer', () => {
    expect(mapExistingCustomerToEstimatePrefill(customer)).toEqual({
      firstName: 'Ada',
      lastName: 'Marie De La Cruz',
      email: 'ada@example.com',
      phone: '555-0100',
      address: '10 Main Street',
      city: 'Bolivar',
      state: 'MO',
      zip: '65613',
    });
    expect(customer).toEqual(expect.objectContaining({ name: 'Ada Marie De La Cruz' }));
  });

  it('prefers structured names and permits a single-word saved name', () => {
    expect(mapExistingCustomerToEstimatePrefill({ ...customer, firstName: 'Ada', lastName: 'Cruz', name: 'Ignored' }))
      .toMatchObject({ firstName: 'Ada', lastName: 'Cruz' });
    expect(mapExistingCustomerToEstimatePrefill({ ...customer, name: 'Cher', firstName: '', lastName: '' }))
      .toMatchObject({ firstName: 'Cher', lastName: '' });
  });

  it('keeps structured property values separate and ignores formatted display text', () => {
    const customerWithDisplayAddress = {
      ...customer,
      address: '110 Example Lane',
      city: 'Test City',
      state: 'TX',
      zip: '00000',
      formattedAddress: '110 Example Lane, Test City, TX 00000',
    };
    const customerBeforePrefill = structuredClone(customerWithDisplayAddress);

    expect(mapExistingCustomerToEstimatePrefill(customerWithDisplayAddress)).toMatchObject({
      address: '110 Example Lane',
      city: 'Test City',
      state: 'TX',
      zip: '00000',
    });
    expect(customerWithDisplayAddress).toEqual(customerBeforePrefill);
  });

  it('uses existing structured property snapshot aliases before any legacy combined address', () => {
    expect(mapExistingCustomerProperty({
      ...customer,
      address: '110 Example Lane',
      city: 'Test City',
      state: 'TX',
      zip: '',
      zipCode: '00000',
      propertySnapshot: {
        address: 'Legacy display address, Other City, MO 99999',
        city: 'Other City',
        state: 'MO',
        zipCode: '99999',
      },
    })).toEqual({
      address: '110 Example Lane',
      city: 'Test City',
      state: 'TX',
      zip: '00000',
    });
  });

  it('keeps a genuine legacy combined address in the street field without guessing components', () => {
    expect(mapExistingCustomerToEstimatePrefill({
      id: 'legacy-customer',
      name: 'Legacy Customer',
      email: 'legacy@example.com',
      phone: '555-0101',
      address: '110 Example Lane, Test City, TX 00000',
    })).toMatchObject({
      address: '110 Example Lane, Test City, TX 00000',
      city: '',
      state: '',
      zip: '',
    });
  });

  it('builds a fresh scheduled booking with customer/property snapshots and no payment, Stripe, or old-job state', () => {
    const result = buildExistingCustomerBooking({
      tenantId: 'tenant-a',
      customer,
      createdBy: 'admin-a',
      now: '2026-07-29T12:00:00.000Z',
      bookingInput: {
        serviceType: 'Deep clean',
        date: '2026-08-12',
        startTime: '09:30',
        agreedPrice: '240',
        notes: 'Kitchen focus',
      },
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      tenantId: 'tenant-a',
      source: 'owner-existing-customer',
      customerId: 'customer-a',
      status: 'scheduled',
      serviceType: 'Deep clean',
      date: '2026-08-12',
      startTime: '09:30',
      agreedPrice: 240,
      customerSnapshot: { name: 'Ada Marie De La Cruz', email: 'ada@example.com' },
      propertySnapshot: { address: '10 Main Street', city: 'Bolivar', zipCode: '65613' },
      requestSnapshot: { cleaningType: 'Deep clean', specialRequests: 'Kitchen focus' },
    });
    expect(JSON.stringify(result.data)).not.toMatch(/payment|stripe|assignment|checklist|photo/i);
    expect(result.data).not.toHaveProperty('leadId');
  });

  it('uses the same structured property mapping for a direct booking snapshot', () => {
    const result = buildExistingCustomerBooking({
      tenantId: 'tenant-a',
      customer: {
        ...customer,
        address: '110 Example Lane',
        city: 'Test City',
        state: 'TX',
        zip: '00000',
        formattedAddress: '110 Example Lane, Test City, TX 00000',
      },
      createdBy: 'admin-a',
      now: '2026-07-29T12:00:00.000Z',
      bookingInput: {
        serviceType: 'Standard clean', date: '2026-08-12', startTime: '09:00', agreedPrice: '185',
      },
    });

    expect(result.success).toBe(true);
    expect(result.data.propertySnapshot).toEqual({
      address: '110 Example Lane', city: 'Test City', state: 'TX', zipCode: '00000',
    });
  });

  it('rejects archived customers and missing new job fields before any write', () => {
    expect(buildExistingCustomerBooking({
      tenantId: 'tenant-a', customer: { ...customer, isArchived: true }, createdBy: 'admin-a', now: '2026-07-29T12:00:00.000Z', bookingInput: {}
    })).toMatchObject({ success: false, message: 'Archived customers cannot be scheduled for a new job.' });
    expect(buildExistingCustomerBooking({
      tenantId: 'tenant-a', customer, createdBy: 'admin-a', now: '2026-07-29T12:00:00.000Z', bookingInput: {
        serviceType: 'Standard clean', date: '2026-08-12', startTime: '', agreedPrice: '0'
      }
    })).toMatchObject({ success: false, message: 'Choose a valid booking time.' });
    expect(buildExistingCustomerBooking({
      tenantId: 'tenant-a', customer: { ...customer, tenantId: 'tenant-b' }, createdBy: 'admin-a', now: '2026-07-29T12:00:00.000Z', bookingInput: {
        serviceType: 'Standard clean', date: '2026-08-12', startTime: '09:00', agreedPrice: '200'
      }
    })).toMatchObject({ success: false, message: 'This customer does not belong to the selected tenant. Refresh Customers and try again.' });
  });
});
