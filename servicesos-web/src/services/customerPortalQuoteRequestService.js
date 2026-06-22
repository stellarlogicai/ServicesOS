import { createLead } from '../core/leads/leadService';
import { buildCustomerPortalQuoteLeadPayload } from './customerPortalQuoteLeadPayloadBuilder';

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
  user,
  customer,
  quoteIntakeDraft
} = {}) {
  if (!isMeaningful(tenantId)) {
    return validationFailure(
      'MISSING_TENANT_ID',
      'Tenant ID is required before submitting a Customer Portal quote request.'
    );
  }

  if (!isMeaningful(user?.uid)) {
    return validationFailure(
      'MISSING_AUTH_UID',
      'Signed-in user ID is required before submitting a Customer Portal quote request.'
    );
  }

  if (!isMeaningful(customer?.id)) {
    return validationFailure(
      'MISSING_CUSTOMER_ID',
      'Linked customer ID is required before submitting a Customer Portal quote request.'
    );
  }

  const quoteRequestDraft = getQuoteRequestDraft(quoteIntakeDraft);

  if (!isPlainObject(quoteRequestDraft) || Object.keys(quoteRequestDraft).length === 0) {
    return validationFailure(
      'MISSING_QUOTE_INTAKE_DRAFT',
      'Quote intake draft is required before submitting a Customer Portal quote request.'
    );
  }

  try {
    const payload = buildCustomerPortalQuoteLeadPayload(
      buildDraftWithIdentity({ quoteIntakeDraft, tenantId, user, customer })
    );
    const result = await createLead(tenantId, payload);

    if (!result?.success) {
      return {
        success: false,
        code: 'CREATE_LEAD_FAILED',
        error: result?.error || 'Failed to submit Customer Portal quote request.',
        result
      };
    }

    return {
      success: true,
      leadId: result.data?.id || null,
      lead: result.data || null,
      result
    };
  } catch (error) {
    return {
      success: false,
      code: 'QUOTE_REQUEST_SUBMIT_FAILED',
      error: error instanceof Error ? error.message : 'Failed to submit Customer Portal quote request.'
    };
  }
}
