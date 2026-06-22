// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const customerPortalMocks = vi.hoisted(() => ({
  authContext: {
    user: { uid: 'auth-test', email: 'customer@example.com' },
    userProfile: { email: 'customer@example.com' },
    tenantId: 'tenant-test',
    currentTenant: { id: 'tenant-test', businessName: 'Test Cleaning Co.' }
  },
  getQuotes: vi.fn(),
  resolveCustomerPortalCustomer: vi.fn(),
  submitCustomerPortalQuoteRequest: vi.fn()
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => customerPortalMocks.authContext
}));

vi.mock('../services/crmService', () => ({
  getQuotes: customerPortalMocks.getQuotes
}));

vi.mock('../services/pdfService', () => ({
  downloadQuotePDF: vi.fn()
}));

vi.mock('../services/customerPortalIdentityService', () => ({
  CUSTOMER_PORTAL_IDENTITY_STATUS: Object.freeze({
    FOUND: 'found',
    MISSING_TENANT: 'missing-tenant',
    MISSING_USER: 'missing-user',
    CUSTOMER_NOT_FOUND: 'customer-not-found',
    ERROR: 'error'
  }),
  resolveCustomerPortalCustomer: customerPortalMocks.resolveCustomerPortalCustomer
}));

vi.mock('../services/customerPortalQuoteRequestService', () => ({
  submitCustomerPortalQuoteRequest: customerPortalMocks.submitCustomerPortalQuoteRequest
}));

import CustomerPortal from '../components/CustomerPortal';

const linkedCustomer = {
  id: 'customer-test',
  name: 'Test Customer',
  email: 'customer@example.com',
  authUid: 'auth-test'
};

function setLinkedCustomerIdentity() {
  customerPortalMocks.resolveCustomerPortalCustomer.mockResolvedValue({
    status: 'found',
    customer: linkedCustomer,
    matchMethod: 'authUid',
    message: 'Customer profile linked. Saved quote request persistence is still disabled.'
  });
}

async function renderRequestQuotePreview() {
  render(<CustomerPortal />);

  await screen.findByText(/Customer identity resolved|Saved quote requests not enabled/);
  fireEvent.click(screen.getAllByRole('button', { name: 'Request Quote' })[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Review Quote Request Draft' }));

  await screen.findByRole('heading', { name: 'Quote request preview' });
}

describe('CustomerPortal quote request submit wiring', () => {
  beforeEach(() => {
    customerPortalMocks.authContext = {
      user: { uid: 'auth-test', email: 'customer@example.com' },
      userProfile: { email: 'customer@example.com' },
      tenantId: 'tenant-test',
      currentTenant: { id: 'tenant-test', businessName: 'Test Cleaning Co.' }
    };
    customerPortalMocks.getQuotes.mockReset();
    customerPortalMocks.getQuotes.mockResolvedValue([]);
    customerPortalMocks.resolveCustomerPortalCustomer.mockReset();
    customerPortalMocks.submitCustomerPortalQuoteRequest.mockReset();
    customerPortalMocks.submitCustomerPortalQuoteRequest.mockResolvedValue({
      success: true,
      leadId: 'lead-test',
      lead: { id: 'lead-test' }
    });
    setLinkedCustomerIdentity();
  });

  it('keeps submit disabled when tenantId is missing', async () => {
    customerPortalMocks.authContext = {
      user: { uid: 'auth-test', email: 'customer@example.com' },
      userProfile: { email: 'customer@example.com' },
      tenantId: null,
      currentTenant: null
    };
    customerPortalMocks.resolveCustomerPortalCustomer.mockResolvedValue({
      status: 'missing-tenant',
      customer: null,
      matchMethod: null,
      message: 'Your customer account is not linked to a business yet, so saved quote requests are not enabled.'
    });

    await renderRequestQuotePreview();

    expect(
      screen.getAllByText(
        'Your customer account is not linked to a business yet, so saved quote requests are not enabled.'
      ).length
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', { name: 'Submit Quote Request for Owner Review' })
    ).toBeDisabled();
    expect(customerPortalMocks.submitCustomerPortalQuoteRequest).not.toHaveBeenCalled();
  });

  it('keeps submit disabled when the linked customer record is missing', async () => {
    customerPortalMocks.resolveCustomerPortalCustomer.mockResolvedValue({
      status: 'customer-not-found',
      customer: null,
      matchMethod: null,
      message: 'Your customer profile needs to be linked before saved quote requests can be enabled.'
    });

    await renderRequestQuotePreview();

    expect(
      screen.getAllByText('Your customer profile needs to be linked before saved quote requests can be enabled.')
        .length
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', { name: 'Submit Quote Request for Owner Review' })
    ).toBeDisabled();
    expect(customerPortalMocks.submitCustomerPortalQuoteRequest).not.toHaveBeenCalled();
  });

  it('calls the persistence service when tenant, user, customer, and draft are valid', async () => {
    await renderRequestQuotePreview();

    fireEvent.click(screen.getByRole('button', { name: 'Submit Quote Request for Owner Review' }));

    await waitFor(() => {
      expect(customerPortalMocks.submitCustomerPortalQuoteRequest).toHaveBeenCalledTimes(1);
    });

    expect(customerPortalMocks.submitCustomerPortalQuoteRequest).toHaveBeenCalledWith({
      tenantId: 'tenant-test',
      user: { uid: 'auth-test', email: 'customer@example.com' },
      customer: linkedCustomer,
      quoteIntakeDraft: expect.objectContaining({
        quoteRequestDraft: expect.objectContaining({
          tenantId: 'tenant-test',
          customerId: 'customer-test',
          createdByAuthUid: 'auth-test'
        })
      })
    });
    await waitFor(() => {
      expect(screen.getAllByText('Quote request submitted for owner review.').length).toBeGreaterThan(0);
    });
  });

  it('shows an error message when persistence fails', async () => {
    customerPortalMocks.submitCustomerPortalQuoteRequest.mockResolvedValue({
      success: false,
      error: 'Failed to submit Customer Portal quote request.'
    });

    await renderRequestQuotePreview();

    fireEvent.click(screen.getByRole('button', { name: 'Submit Quote Request for Owner Review' }));

    expect(
      await screen.findByText('Failed to submit Customer Portal quote request.')
    ).toBeInTheDocument();
  });
});
