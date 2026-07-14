import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import {
  createLead,
  getCustomerOwnedQuoteRequests,
  getLeadById,
  getLeads,
  updateLead
} from '../core/leads/leadService';
import { buildCustomerPortalQuoteLeadPayload } from './customerPortalQuoteLeadPayloadBuilder';

export const CUSTOMER_ACCOUNT_NOT_CONNECTED_MESSAGE =
  "Your account is not connected to a service business yet. Please use the business's quote request link or contact the business directly.";

const REQUEST_SUBMISSION_FAILED_MESSAGE =
  'Your quote request could not be submitted. Please try again or contact the business directly.';

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isMeaningful = (value) => value !== undefined && value !== null && value !== '';

const validationFailure = (code, message) => ({
  success: false,
  code,
  error: message
});

const getQuoteRequestDraft = (quoteIntakeDraft) =>
  quoteIntakeDraft?.quoteRequestDraft ?? quoteIntakeDraft;

const CUSTOMER_REQUEST_STATUSES = new Set(['new', 'contacted', 'archived']);

const isCustomerPortalRequest = (lead) =>
  lead?.type === 'quote_request' && lead?.source === 'customer-portal';

const isUnavailableCustomer = (customer) =>
  customer?.isArchived === true || ['archived', 'disabled', 'inactive'].includes(customer?.status);

async function getTrustedCustomerProfile(requestedTenantId) {
  const authenticatedUser = auth.currentUser;

  if (!authenticatedUser?.uid) {
    return validationFailure('MISSING_AUTH_UID', 'Sign in before submitting a quote request.');
  }

  const userSnapshot = await getDoc(doc(db, 'users', authenticatedUser.uid));
  if (!userSnapshot.exists()) {
    return validationFailure('MISSING_USER_PROFILE', CUSTOMER_ACCOUNT_NOT_CONNECTED_MESSAGE);
  }

  const userProfile = userSnapshot.data();
  if (
    userProfile.role !== 'customer' ||
    userProfile.status !== 'active' ||
    !isMeaningful(userProfile.tenantId) ||
    userProfile.tenantId !== requestedTenantId
  ) {
    return validationFailure('INVALID_CUSTOMER_PROFILE', CUSTOMER_ACCOUNT_NOT_CONNECTED_MESSAGE);
  }

  return {
    success: true,
    authenticatedUser,
    userProfile,
    tenantId: userProfile.tenantId
  };
}

async function getTrustedLinkedCustomer({ tenantId, customerId, authUid }) {
  if (!isMeaningful(customerId)) {
    return validationFailure('MISSING_CUSTOMER_ID', CUSTOMER_ACCOUNT_NOT_CONNECTED_MESSAGE);
  }

  const customerSnapshot = await getDoc(doc(db, 'tenants', tenantId, 'customers', customerId));
  if (!customerSnapshot.exists()) {
    return validationFailure('CUSTOMER_NOT_FOUND', CUSTOMER_ACCOUNT_NOT_CONNECTED_MESSAGE);
  }

  const customer = { id: customerSnapshot.id, ...customerSnapshot.data() };
  if (customer.authUid !== authUid || isUnavailableCustomer(customer)) {
    return validationFailure('CUSTOMER_LINK_MISMATCH', CUSTOMER_ACCOUNT_NOT_CONNECTED_MESSAGE);
  }

  return { success: true, customer };
}

export async function getCustomerPortalQuoteRequests(tenantId) {
  if (!isMeaningful(tenantId)) {
    return validationFailure('MISSING_TENANT_ID', 'Tenant ID is required before loading customer requests.');
  }

  const result = await getLeads(tenantId);
  if (!result?.success) return result;

  return {
    success: true,
    data: (Array.isArray(result.data) ? result.data : []).filter(isCustomerPortalRequest)
  };
}

export async function getOwnCustomerPortalQuoteRequests(tenantId) {
  if (!isMeaningful(tenantId)) {
    return validationFailure('MISSING_TENANT_ID', CUSTOMER_ACCOUNT_NOT_CONNECTED_MESSAGE);
  }

  try {
    const trustedProfile = await getTrustedCustomerProfile(tenantId);
    if (!trustedProfile.success) return trustedProfile;

    return getCustomerOwnedQuoteRequests(trustedProfile.tenantId, trustedProfile.authenticatedUser.uid);
  } catch {
    return validationFailure('CUSTOMER_REQUEST_LOAD_FAILED', 'Your quote requests could not be loaded. Please try again.');
  }
}

export async function updateCustomerPortalQuoteRequestStatus(tenantId, requestId, requestStatus) {
  if (!isMeaningful(tenantId) || !isMeaningful(requestId)) {
    return validationFailure('MISSING_REQUEST_IDENTITY', 'Tenant ID and request ID are required.');
  }

  if (!CUSTOMER_REQUEST_STATUSES.has(requestStatus)) {
    return validationFailure('INVALID_REQUEST_STATUS', 'Customer request status is invalid.');
  }

  const existing = await getLeadById(tenantId, requestId);
  if (!existing?.success || !isCustomerPortalRequest(existing.data)) {
    return validationFailure('INVALID_CUSTOMER_REQUEST', 'Customer request could not be updated.');
  }

  return updateLead(tenantId, requestId, { requestStatus });
}

function buildDraftWithIdentity({ quoteIntakeDraft, tenantId, user, customer }) {
  const quoteRequestDraft = getQuoteRequestDraft(quoteIntakeDraft);

  return {
    ...quoteRequestDraft,
    tenantId,
    customerId: customer.id,
    createdByAuthUid: user.uid
  };
}

export async function submitCustomerPortalQuoteRequest({
  tenantId,
  customer,
  quoteIntakeDraft
} = {}) {
  if (!isMeaningful(tenantId)) {
    return validationFailure(
      'MISSING_TENANT_ID',
      'Tenant ID is required before submitting a Customer Portal quote request.'
    );
  }

  if (!isMeaningful(customer?.id)) {
    return validationFailure('MISSING_CUSTOMER_ID', CUSTOMER_ACCOUNT_NOT_CONNECTED_MESSAGE);
  }

  const quoteRequestDraft = getQuoteRequestDraft(quoteIntakeDraft);

  if (!isPlainObject(quoteRequestDraft) || Object.keys(quoteRequestDraft).length === 0) {
    return validationFailure(
      'MISSING_QUOTE_INTAKE_DRAFT',
      'Quote intake draft is required before submitting a Customer Portal quote request.'
    );
  }

  try {
    const trustedProfile = await getTrustedCustomerProfile(tenantId);
    if (!trustedProfile.success) return trustedProfile;

    const trustedCustomer = await getTrustedLinkedCustomer({
      tenantId: trustedProfile.tenantId,
      customerId: customer.id,
      authUid: trustedProfile.authenticatedUser.uid
    });
    if (!trustedCustomer.success) return trustedCustomer;

    if (
      quoteRequestDraft.tenantId !== trustedProfile.tenantId ||
      quoteRequestDraft.customerId !== trustedCustomer.customer.id ||
      quoteRequestDraft.createdByAuthUid !== trustedProfile.authenticatedUser.uid
    ) {
      return validationFailure('REQUEST_IDENTITY_MISMATCH', CUSTOMER_ACCOUNT_NOT_CONNECTED_MESSAGE);
    }

    const payload = buildCustomerPortalQuoteLeadPayload(
      buildDraftWithIdentity({
        quoteIntakeDraft,
        tenantId: trustedProfile.tenantId,
        user: trustedProfile.authenticatedUser,
        customer: trustedCustomer.customer
      })
    );
    const result = await createLead(trustedProfile.tenantId, payload);

    if (!result?.success) {
      return {
        success: false,
        code: 'CREATE_LEAD_FAILED',
        error: REQUEST_SUBMISSION_FAILED_MESSAGE,
        result
      };
    }

    return {
      success: true,
      leadId: result.data?.id || null,
      lead: result.data || null,
      result
    };
  } catch {
    return {
      success: false,
      code: 'QUOTE_REQUEST_SUBMIT_FAILED',
      error: REQUEST_SUBMISSION_FAILED_MESSAGE
    };
  }
}
