import { beforeEach, describe, expect, it, vi } from 'vitest';

const leadServiceMock = vi.hoisted(() => ({
  createLead: vi.fn()
}));

vi.mock('../core/leads/leadService', () => ({
  createLead: leadServiceMock.createLead
}));

import { submitCustomerPortalQuoteRequest } from '../services/customerPortalQuoteRequestService';
import { buildCustomerPortalQuoteIntakeDraft } from '../services/customerPortalQuoteRequestMapper';

const submittedAt = '2026-06-22T19:00:00.000Z';

function buildFakeQuoteIntakeDraft(overrides = {}) {
  return buildCustomerPortalQuoteIntakeDraft({
    formData: {
      fullName: 'Riley Carter',
      email: 'riley.customer@example.com',
      phone: '555-0300',
      address: '90 Mockingbird Lane',
      city: 'Branson',
      state: 'MO',
      zipCode: '65616',
      bedrooms: 3,
      bathrooms: 2,
      squareFootage: '1600',
      cleaningType: 'standard',
      frequency: 'one-time',
      pets: true,
      petCount: 1,
      petTypes: ['dog'],
      petHairLevel: 'medium',
      clutterLevel: 'normal',
      lastCleaned: 'within-month',
      serviceScope: {
        baseboards: true,
        oven: false
      },
      preferredDate: '2026-07-20',
      preferredTime: '14:00',
      customerNotes: 'Please call when on the way.'
    },
    sourceFormat: 'intake-form',
    tenantId: 'draft-tenant',
    customerId: 'draft-customer',
    propertyId: 'property-test',
    authUid: 'draft-auth',
    submittedAt,
    ...overrides
  });
}

describe('Customer Portal quote request service', () => {
  beforeEach(() => {
    leadServiceMock.createLead.mockReset();
    leadServiceMock.createLead.mockResolvedValue({
      success: true,
      data: {
        id: 'lead-test',
        status: 'new'
      },
      message: 'Lead created successfully'
    });
  });

  it('blocks missing tenantId before createLead is called', async () => {
    const result = await submitCustomerPortalQuoteRequest({
      tenantId: '',
      user: { uid: 'auth-test' },
      customer: { id: 'customer-test' },
      quoteIntakeDraft: buildFakeQuoteIntakeDraft()
    });

    expect(result).toMatchObject({
      success: false,
      code: 'MISSING_TENANT_ID'
    });
    expect(leadServiceMock.createLead).not.toHaveBeenCalled();
  });

  it('blocks missing user before createLead is called', async () => {
    const result = await submitCustomerPortalQuoteRequest({
      tenantId: 'tenant-test',
      user: null,
      customer: { id: 'customer-test' },
      quoteIntakeDraft: buildFakeQuoteIntakeDraft()
    });

    expect(result).toMatchObject({
      success: false,
      code: 'MISSING_AUTH_UID'
    });
    expect(leadServiceMock.createLead).not.toHaveBeenCalled();
  });

  it('blocks missing customer before createLead is called', async () => {
    const result = await submitCustomerPortalQuoteRequest({
      tenantId: 'tenant-test',
      user: { uid: 'auth-test' },
      customer: null,
      quoteIntakeDraft: buildFakeQuoteIntakeDraft()
    });

    expect(result).toMatchObject({
      success: false,
      code: 'MISSING_CUSTOMER_ID'
    });
    expect(leadServiceMock.createLead).not.toHaveBeenCalled();
  });

  it('blocks missing quoteIntakeDraft before createLead is called', async () => {
    const result = await submitCustomerPortalQuoteRequest({
      tenantId: 'tenant-test',
      user: { uid: 'auth-test' },
      customer: { id: 'customer-test' },
      quoteIntakeDraft: null
    });

    expect(result).toMatchObject({
      success: false,
      code: 'MISSING_QUOTE_INTAKE_DRAFT'
    });
    expect(leadServiceMock.createLead).not.toHaveBeenCalled();
  });

  it('calls createLead with tenantId and a legacy-compatible payload for valid input', async () => {
    const result = await submitCustomerPortalQuoteRequest({
      tenantId: 'tenant-test',
      user: { uid: 'auth-test' },
      customer: { id: 'customer-test' },
      quoteIntakeDraft: buildFakeQuoteIntakeDraft()
    });

    expect(result).toMatchObject({
      success: true,
      leadId: 'lead-test',
      lead: {
        id: 'lead-test',
        status: 'new'
      }
    });
    expect(leadServiceMock.createLead).toHaveBeenCalledTimes(1);
    expect(leadServiceMock.createLead).toHaveBeenCalledWith(
      'tenant-test',
      expect.objectContaining({
        type: 'quote_request',
        source: 'customer-portal',
        status: 'new',
        tenantId: 'tenant-test',
        customerId: 'customer-test',
        createdByAuthUid: 'auth-test',
        formData: expect.objectContaining({
          fullName: 'Riley Carter',
          email: 'riley.customer@example.com',
          phone: '555-0300',
          cleaningType: 'standard',
          bedrooms: 3,
          bathrooms: 2,
          squareFootage: '1600'
        })
      })
    );
  });

  it('includes createdByAuthUid, customerId, and safe estimate defaults in the payload', async () => {
    await submitCustomerPortalQuoteRequest({
      tenantId: 'tenant-test',
      user: { uid: 'auth-test' },
      customer: { id: 'customer-test' },
      quoteIntakeDraft: buildFakeQuoteIntakeDraft({
        estimate: {
          priceLow: 100,
          priceHigh: 150,
          laborHours: 3,
          aiEnhanced: true
        }
      })
    });

    const [, payload] = leadServiceMock.createLead.mock.calls[0];

    expect(payload).toMatchObject({
      customerId: 'customer-test',
      createdByAuthUid: 'auth-test',
      estimate: {
        priceLow: 0,
        priceHigh: 0,
        laborHours: 0,
        appointmentDuration: null,
        aiEnhanced: false,
        requiresReview: true,
        status: 'pending_owner_review'
      }
    });
  });

  it('preserves appointment request fields in the lead payload', async () => {
    await submitCustomerPortalQuoteRequest({
      tenantId: 'tenant-test',
      user: { uid: 'auth-test' },
      customer: { id: 'customer-test' },
      quoteIntakeDraft: buildFakeQuoteIntakeDraft()
    });

    const [, payload] = leadServiceMock.createLead.mock.calls[0];

    expect(payload.appointmentRequest).toEqual({
      preferredDate: '2026-07-20',
      preferredTime: '14:00',
      flexibleSchedule: false,
      notes: 'Please call when on the way.',
      status: 'pending_review',
      requestedAt: submittedAt
    });
  });

  it('does not mutate the input draft', async () => {
    const quoteIntakeDraft = buildFakeQuoteIntakeDraft();
    const originalDraft = JSON.parse(JSON.stringify(quoteIntakeDraft));

    await submitCustomerPortalQuoteRequest({
      tenantId: 'tenant-test',
      user: { uid: 'auth-test' },
      customer: { id: 'customer-test' },
      quoteIntakeDraft
    });

    expect(quoteIntakeDraft).toEqual(originalDraft);
    expect(quoteIntakeDraft.quoteRequestDraft.tenantId).toBe('draft-tenant');
    expect(quoteIntakeDraft.quoteRequestDraft.customerId).toBe('draft-customer');
    expect(quoteIntakeDraft.quoteRequestDraft.createdByAuthUid).toBe('draft-auth');
  });
});
