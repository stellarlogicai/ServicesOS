import { beforeEach, describe, expect, it, vi } from 'vitest';

const leadServiceMocks = vi.hoisted(() => ({
  createLead: vi.fn(),
  getLeads: vi.fn(),
  updateLead: vi.fn(),
  deleteLead: vi.fn()
}));

vi.mock('../core/leads/leadService', () => ({
  createLead: leadServiceMocks.createLead,
  getLeads: leadServiceMocks.getLeads,
  updateLead: leadServiceMocks.updateLead,
  deleteLead: leadServiceMocks.deleteLead
}));

import { saveLead } from '../services/crmService';

describe('crmService manual estimate persistence', () => {
  beforeEach(() => {
    Object.values(leadServiceMocks).forEach(mock => mock.mockReset());
    leadServiceMocks.createLead.mockResolvedValue({
      success: true,
      data: {
        id: 'lead-manual',
        status: 'new',
        createdAt: '2026-06-27T12:00:00.000Z',
        updatedAt: '2026-06-27T12:00:00.000Z'
      }
    });
  });

  it('writes a Dashboard-compatible admin lead without booking or payment creation', async () => {
    const saved = await saveLead(
      'tenant-test',
      {
        firstName: 'Manual',
        lastName: 'Customer',
        email: 'manual@example.com',
        phone: '555-0199',
        bedroomCount: 3,
        bathroomCount: 2,
        clutterLevel: 'normal',
        cleaningType: 'standard',
        frequency: 'one-time'
      },
      { laborHours: 3, appointmentDuration: 3, priceLow: 120, priceHigh: 150 },
      null
    );

    expect(leadServiceMocks.createLead).toHaveBeenCalledWith(
      'tenant-test',
      expect.objectContaining({
        type: 'lead',
        source: 'admin',
        formData: expect.objectContaining({
          fullName: 'Manual Customer',
          bedrooms: 3,
          bathrooms: 2,
          condition: 'normal'
        }),
        estimate: expect.objectContaining({ priceLow: 120, priceHigh: 150, aiEnhanced: false }),
        aiAnalysis: null,
        booking: null
      })
    );
    const payload = leadServiceMocks.createLead.mock.calls[0][1];
    expect(payload).not.toHaveProperty('payment');
    expect(payload).not.toHaveProperty('paymentId');
    expect(saved).toMatchObject({ status: 'new', booking: null, source: 'admin' });
  });

  it('keeps a repeat estimate linked to the saved customer with fresh snapshots only', async () => {
    await saveLead(
      'tenant-test',
      {
        firstName: 'Repeat', lastName: 'Customer', email: 'repeat@example.com', phone: '555-0161',
        address: '16 Repeat Lane', city: 'Bolivar', state: 'MO', zip: '65613',
        bedroomCount: 3, bathroomCount: 2, clutterLevel: 'normal', cleaningType: 'deep', frequency: 'one-time'
      },
      { laborHours: 4, appointmentDuration: 4, priceLow: 200, priceHigh: 240 },
      null,
      { customerId: 'customer-existing' }
    );

    const payload = leadServiceMocks.createLead.mock.calls[0][1];
    expect(payload).toMatchObject({
      source: 'admin-existing-customer',
      customerId: 'customer-existing',
      customerSnapshot: { customerId: 'customer-existing', fullName: 'Repeat Customer', email: 'repeat@example.com' },
      propertySnapshot: { address: '16 Repeat Lane', city: 'Bolivar', zipCode: '65613' },
      requestSnapshot: { cleaningType: 'deep' },
      booking: null,
    });
    expect(JSON.stringify(payload)).not.toMatch(/payment|stripe|assignment|checklist|photo/i);
  });
});
