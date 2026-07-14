import { beforeEach, describe, expect, it, vi } from 'vitest';

const leadServiceMock = vi.hoisted(() => ({
  createLead: vi.fn(),
  getCustomerOwnedQuoteRequests: vi.fn(),
  getLeadById: vi.fn(),
  getLeads: vi.fn(),
  updateLead: vi.fn()
}));

const firebaseMock = vi.hoisted(() => ({
  auth: { currentUser: { uid: 'auth-test', email: 'customer@example.com' } },
  documents: new Map()
}));

vi.mock('../core/leads/leadService', () => leadServiceMock);
vi.mock('../firebase', () => ({
  auth: firebaseMock.auth,
  db: { mocked: true }
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, ...segments) => segments.join('/')),
  getDoc: vi.fn(async path => {
    const data = firebaseMock.documents.get(path);
    const segments = path.split('/');
    return {
      id: segments.at(-1),
      exists: () => data !== undefined,
      data: () => data
    };
  })
}));

import {
  getCustomerPortalQuoteRequests,
  getOwnCustomerPortalQuoteRequests,
  submitCustomerPortalQuoteRequest,
  updateCustomerPortalQuoteRequestStatus
} from '../services/customerPortalQuoteRequestService';
import { buildCustomerPortalQuoteIntakeDraft } from '../services/customerPortalQuoteRequestMapper';

const submittedAt = '2026-06-22T19:00:00.000Z';
const disconnectedMessage =
  "Your account is not connected to a service business yet. Please use the business's quote request link or contact the business directly.";

function setTrustedCustomerContext({
  uid = 'auth-test',
  tenantId = 'tenant-test',
  role = 'customer',
  status = 'active',
  customerId = 'customer-test',
  customerAuthUid = uid,
  customerStatus = 'active',
  isArchived = false
} = {}) {
  firebaseMock.auth.currentUser = { uid, email: 'customer@example.com' };
  firebaseMock.documents.set(`users/${uid}`, { role, status, tenantId });
  firebaseMock.documents.set(`tenants/${tenantId}/customers/${customerId}`, {
    name: 'Riley Carter',
    email: 'riley.customer@example.com',
    authUid: customerAuthUid,
    status: customerStatus,
    isArchived
  });
}

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
      serviceScope: { baseboards: true, oven: false },
      preferredDate: '2026-07-20',
      preferredTime: '14:00',
      customerNotes: 'Please call when on the way.'
    },
    sourceFormat: 'intake-form',
    tenantId: 'tenant-test',
    customerId: 'customer-test',
    propertyId: 'property-test',
    authUid: 'auth-test',
    submittedAt,
    ...overrides
  });
}

describe('Customer Portal quote request service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firebaseMock.documents.clear();
    setTrustedCustomerContext();
    leadServiceMock.createLead.mockResolvedValue({
      success: true,
      data: { id: 'lead-test', status: 'new' },
      message: 'Lead created successfully'
    });
    leadServiceMock.getCustomerOwnedQuoteRequests.mockResolvedValue({ success: true, data: [] });
  });

  it('loads all active-tenant Customer Portal requests only for the admin review service', async () => {
    leadServiceMock.getLeads.mockResolvedValue({ success: true, data: [
      { id: 'request-a', type: 'quote_request', source: 'customer-portal' },
      { id: 'admin-lead', type: 'lead', source: 'admin' }
    ] });

    const result = await getCustomerPortalQuoteRequests('tenant-a');

    expect(leadServiceMock.getLeads).toHaveBeenCalledWith('tenant-a');
    expect(result.data).toEqual([{ id: 'request-a', type: 'quote_request', source: 'customer-portal' }]);
  });

  it('loads only the authenticated customer own-request query', async () => {
    await getOwnCustomerPortalQuoteRequests('tenant-test');

    expect(leadServiceMock.getCustomerOwnedQuoteRequests).toHaveBeenCalledWith('tenant-test', 'auth-test');
    expect(leadServiceMock.getLeads).not.toHaveBeenCalled();
  });

  it('blocks an own-request query for another tenant', async () => {
    const result = await getOwnCustomerPortalQuoteRequests('tenant-other');

    expect(result).toMatchObject({ success: false, code: 'INVALID_CUSTOMER_PROFILE' });
    expect(leadServiceMock.getCustomerOwnedQuoteRequests).not.toHaveBeenCalled();
  });

  it('updates only the allowed customer request status field for admin review', async () => {
    leadServiceMock.getLeadById.mockResolvedValue({
      success: true,
      data: { id: 'request-a', type: 'quote_request', source: 'customer-portal' }
    });
    leadServiceMock.updateLead.mockResolvedValue({ success: true });

    await updateCustomerPortalQuoteRequestStatus('tenant-a', 'request-a', 'contacted');

    expect(leadServiceMock.updateLead).toHaveBeenCalledWith('tenant-a', 'request-a', {
      requestStatus: 'contacted'
    });
  });

  it('rejects invalid request statuses without writing', async () => {
    const result = await updateCustomerPortalQuoteRequestStatus('tenant-a', 'request-a', 'paid');
    expect(result).toMatchObject({ success: false, code: 'INVALID_REQUEST_STATUS' });
    expect(leadServiceMock.updateLead).not.toHaveBeenCalled();
  });

  it('blocks missing tenantId before createLead is called', async () => {
    const result = await submitCustomerPortalQuoteRequest({
      tenantId: '',
      customer: { id: 'customer-test' },
      quoteIntakeDraft: buildFakeQuoteIntakeDraft()
    });

    expect(result).toMatchObject({ success: false, code: 'MISSING_TENANT_ID' });
    expect(leadServiceMock.createLead).not.toHaveBeenCalled();
  });

  it('derives auth internally and blocks a missing authenticated user', async () => {
    firebaseMock.auth.currentUser = null;

    const result = await submitCustomerPortalQuoteRequest({
      tenantId: 'tenant-test',
      customer: { id: 'customer-test' },
      quoteIntakeDraft: buildFakeQuoteIntakeDraft()
    });

    expect(result).toMatchObject({ success: false, code: 'MISSING_AUTH_UID' });
    expect(leadServiceMock.createLead).not.toHaveBeenCalled();
  });

  it('blocks tenant, role, status, linked-customer, and draft identity mismatches without writing', async () => {
    const cases = [
      { setup: () => setTrustedCustomerContext({ tenantId: 'tenant-other' }), draft: buildFakeQuoteIntakeDraft(), code: 'INVALID_CUSTOMER_PROFILE' },
      { setup: () => setTrustedCustomerContext({ role: 'admin' }), draft: buildFakeQuoteIntakeDraft(), code: 'INVALID_CUSTOMER_PROFILE' },
      { setup: () => setTrustedCustomerContext({ status: 'suspended' }), draft: buildFakeQuoteIntakeDraft(), code: 'INVALID_CUSTOMER_PROFILE' },
      { setup: () => setTrustedCustomerContext({ customerAuthUid: 'another-user' }), draft: buildFakeQuoteIntakeDraft(), code: 'CUSTOMER_LINK_MISMATCH' },
      { setup: () => setTrustedCustomerContext({ isArchived: true }), draft: buildFakeQuoteIntakeDraft(), code: 'CUSTOMER_LINK_MISMATCH' },
      { setup: () => setTrustedCustomerContext(), draft: buildFakeQuoteIntakeDraft({ authUid: 'spoofed-user' }), code: 'REQUEST_IDENTITY_MISMATCH' },
      { setup: () => setTrustedCustomerContext(), draft: buildFakeQuoteIntakeDraft({ tenantId: 'tenant-other' }), code: 'REQUEST_IDENTITY_MISMATCH' }
    ];

    for (const testCase of cases) {
      firebaseMock.documents.clear();
      testCase.setup();
      const result = await submitCustomerPortalQuoteRequest({
        tenantId: 'tenant-test',
        customer: { id: 'customer-test' },
        quoteIntakeDraft: testCase.draft
      });
      expect(result).toMatchObject({ success: false, code: testCase.code, error: disconnectedMessage });
    }

    expect(leadServiceMock.createLead).not.toHaveBeenCalled();
  });

  it('creates a tenant-scoped pending owner-review lead from trusted identity only', async () => {
    const result = await submitCustomerPortalQuoteRequest({
      tenantId: 'tenant-test',
      customer: { id: 'customer-test', authUid: 'spoofed-ui-value' },
      quoteIntakeDraft: buildFakeQuoteIntakeDraft({
        estimate: { priceLow: 100, priceHigh: 150, aiEnhanced: true }
      })
    });

    expect(result).toMatchObject({ success: true, leadId: 'lead-test' });
    expect(leadServiceMock.createLead).toHaveBeenCalledWith(
      'tenant-test',
      expect.objectContaining({
        type: 'quote_request',
        source: 'customer-portal',
        status: 'new',
        tenantId: 'tenant-test',
        customerId: 'customer-test',
        createdByAuthUid: 'auth-test',
        booking: null,
        estimate: expect.objectContaining({
          priceLow: 0,
          priceHigh: 0,
          requiresReview: true,
          status: 'pending_owner_review'
        }),
        appointmentRequest: expect.objectContaining({ status: 'pending_review' })
      })
    );
  });

  it('preserves the input draft and creates no booking or payment side effects', async () => {
    const quoteIntakeDraft = buildFakeQuoteIntakeDraft();
    const originalDraft = structuredClone(quoteIntakeDraft);

    await submitCustomerPortalQuoteRequest({
      tenantId: 'tenant-test',
      customer: { id: 'customer-test' },
      quoteIntakeDraft
    });

    expect(quoteIntakeDraft).toEqual(originalDraft);
    const [, payload] = leadServiceMock.createLead.mock.calls[0];
    expect(payload.booking).toBeNull();
    expect(payload).not.toHaveProperty('payment');
    expect(payload).not.toHaveProperty('paymentStatus');
  });
});
