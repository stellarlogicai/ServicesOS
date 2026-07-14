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
  getOwnCustomerPortalQuoteRequests: vi.fn(),
  resolveCustomerPortalCustomer: vi.fn(),
  submitCustomerPortalQuoteRequest: vi.fn()
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => customerPortalMocks.authContext
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
  CUSTOMER_ACCOUNT_NOT_CONNECTED_MESSAGE: "Your account is not connected to a service business yet. Please use the business's quote request link or contact the business directly.",
  getOwnCustomerPortalQuoteRequests: customerPortalMocks.getOwnCustomerPortalQuoteRequests,
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
    message: 'Customer profile linked. You can submit quote requests for owner review.'
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
    customerPortalMocks.getOwnCustomerPortalQuoteRequests.mockReset();
    customerPortalMocks.getOwnCustomerPortalQuoteRequests.mockResolvedValue({ success: true, data: [] });
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
      message: "Your account is not connected to a service business yet. Please use the business's quote request link or contact the business directly."
    });

    await renderRequestQuotePreview();

    expect(
      screen.getAllByText(
        "Your account is not connected to a service business yet. Please use the business's quote request link or contact the business directly."
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
      message: "Your account is not connected to a service business yet. Please use the business's quote request link or contact the business directly."
    });

    await renderRequestQuotePreview();

    expect(
      screen.getAllByText("Your account is not connected to a service business yet. Please use the business's quote request link or contact the business directly.")
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
      expect(screen.getAllByText('Your quote request was submitted for owner review. This is not a confirmed booking yet.').length).toBeGreaterThan(0);
    });
  });

  it('loads only the authenticated customer request query and never renders a raw tenant id', async () => {
    customerPortalMocks.authContext = {
      user: { uid: 'auth-test', email: 'customer@example.com' },
      userProfile: { email: 'customer@example.com' },
      tenantId: 'tenant-secret-raw-id',
      currentTenant: null
    };

    render(<CustomerPortal />);

    await screen.findByText('Customer identity resolved');
    expect(customerPortalMocks.getOwnCustomerPortalQuoteRequests).toHaveBeenCalledWith('tenant-secret-raw-id');
    expect(screen.getByText('Your service business')).toBeInTheDocument();
    expect(screen.queryByText('tenant-secret-raw-id')).not.toBeInTheDocument();
  });

  it('preselects recommended options and submits only the options still selected', async () => {
    render(<CustomerPortal />);
    await screen.findByText('Customer identity resolved');
    fireEvent.click(screen.getAllByRole('button', { name: 'Request Quote' })[0]);

    expect(screen.getByText('We pre-selected common cleaning options to save time. Uncheck anything you do not need.')).toBeInTheDocument();
    const optionGroup = screen.getByRole('group', { name: 'Recommended cleaning options' });
    const oven = optionGroup.querySelector('input[type="checkbox"]');
    expect(oven).toBeChecked();
    fireEvent.click(oven);

    fireEvent.click(screen.getByRole('button', { name: 'Review Quote Request Draft' }));
    await screen.findByRole('heading', { name: 'Quote request preview' });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Quote Request for Owner Review' }));

    await waitFor(() => expect(customerPortalMocks.submitCustomerPortalQuoteRequest).toHaveBeenCalled());
    const submittedDraft = customerPortalMocks.submitCustomerPortalQuoteRequest.mock.calls[0][0].quoteIntakeDraft;
    expect(submittedDraft.quoteRequestDraft.requestSnapshot.serviceScope.oven).toBe(false);
    expect(submittedDraft.quoteRequestDraft.requestSnapshot.serviceScope.fridge).toBe(true);
    expect(submittedDraft.quoteRequestDraft.requestSnapshot.serviceScope.baseboards).toBe(true);
  });

  it('renders a pending quote request from snapshots without booking or zero-value placeholders', async () => {
    customerPortalMocks.getOwnCustomerPortalQuoteRequests.mockResolvedValue({ success: true, data: [
      {
        id: 'lead-snapshot',
        type: 'quote_request',
        status: 'new',
        customerSnapshot: {
          name: 'Snapshot Customer'
        },
        propertySnapshot: {
          bedrooms: 3,
          bathrooms: 2
        },
        requestSnapshot: {
          cleaningType: 'deep'
        },
        formData: {
          fullName: 'Legacy Customer',
          bedrooms: 0,
          bathrooms: 0,
          cleaningType: 'standard'
        },
        estimate: {
          priceLow: 0,
          priceHigh: 0,
          requiresReview: true,
          status: 'pending_owner_review'
        },
        review: {
          requiresOwnerReview: true
        },
        appointmentRequest: {
          status: 'pending_review'
        },
        booking: null,
        createdAt: '2026-06-22T12:00:00.000Z'
      }
    ] });

    render(<CustomerPortal />);

    expect(await screen.findByText('Snapshot Customer')).toBeInTheDocument();
    expect(screen.getByText('deep Cleaning · 3 bed, 2 bath')).toBeInTheDocument();
    expect(screen.getByText('Pending owner review.')).toBeInTheDocument();
    expect(screen.queryByText('$0 - $0')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Book Now' })).not.toBeInTheDocument();
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
    expect(screen.queryByText('Your quote request was submitted for owner review. This is not a confirmed booking yet.')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Quote request preview' })).toBeInTheDocument();
  });
});
