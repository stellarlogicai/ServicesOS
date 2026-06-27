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
});
