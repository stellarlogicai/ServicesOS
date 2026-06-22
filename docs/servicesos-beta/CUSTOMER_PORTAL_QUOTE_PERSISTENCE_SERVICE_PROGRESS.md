# Customer Portal Quote Persistence Service Progress

## Purpose

This checkpoint adds a small Customer Portal quote request persistence service and wires the Customer Portal Request Quote preview to submit through that service.

The service can call the existing tenant-scoped lead persistence path when invoked by future code:

```text
tenants/{tenantId}/leads/{leadId}
```

Customer Portal submit behavior now calls the tested service only after a preview exists and tenant/customer identity is resolved.

No Firebase rules, auth behavior, tenant data model, Stripe/payment behavior, Stripe Connect, backend/cloud functions, Tap to Pay, routing, appointment/booking behavior, customer auto-creation, property persistence, or production data were changed.

## Files Changed

- `servicesos-web/src/services/customerPortalQuoteRequestService.js`
- `servicesos-web/src/__tests__/customerPortalQuoteRequestService.test.js`
- `servicesos-web/src/components/CustomerPortal.jsx`
- `servicesos-web/src/components/CustomerPortal.css`
- `servicesos-web/src/__tests__/CustomerPortalQuoteSubmit.test.jsx`
- `docs/servicesos-beta/CUSTOMER_PORTAL_QUOTE_PERSISTENCE_SERVICE_PROGRESS.md`

## Service Function Added

The new service function is:

- `submitCustomerPortalQuoteRequest({ tenantId, user, customer, quoteIntakeDraft })`

It validates identity and draft readiness, builds a legacy-compatible lead payload using:

- `buildCustomerPortalQuoteLeadPayload(quoteIntakeDraft)`

Then it calls:

- `createLead(tenantId, payload)`

## Validation Rules

The service returns a failure result before calling `createLead` when any of these are missing:

- `tenantId`
- `user.uid`
- `customer.id`
- `quoteIntakeDraft`

The service does not:

- Create bookings.
- Write payments.
- Write customers.
- Write properties.
- Auto-create customer profiles.
- Modify Firebase rules.

## UI Wiring Completed

`CustomerPortal.jsx` now keeps the preview-first flow:

1. Customer fills the Request Quote form.
2. Customer clicks `Review Quote Request Draft`.
3. The in-memory draft is shown for review.
4. Customer can click `Submit Quote Request for Owner Review` only when submission requirements are met.
5. The UI calls `submitCustomerPortalQuoteRequest(...)`.

The UI passes:

- `tenantId: resolvedTenantId`
- `user: { uid, email }`
- `customer: customerIdentity.customer`
- `quoteIntakeDraft: quoteRequestPreview`

## Submit Requirements

Submit stays disabled until:

- `tenantId` is resolved.
- Signed-in `user.uid` exists.
- Linked customer record is resolved.
- Quote request preview exists.
- A submission is not already in progress.

If tenant or customer linkage is missing, Customer Portal keeps showing the existing customer-facing linkage messages.

## Success And Error Behavior

On success, Customer Portal shows:

> Quote request submitted for owner review.

On failure, Customer Portal shows a clear error message and keeps the in-memory form and preview data available.

The UI does not:

- Create bookings.
- Create payments.
- Create or update customers.
- Create or update property profiles.
- Clear customer identity state.

## Tests Added

`customerPortalQuoteRequestService.test.js` uses mocked `createLead` calls and fake quote intake data.

Tests cover:

- Missing `tenantId` blocks before `createLead`.
- Missing user blocks before `createLead`.
- Missing customer blocks before `createLead`.
- Missing quote intake draft blocks before `createLead`.
- Valid input calls `createLead` with `tenantId` and a legacy-compatible payload.
- Returned lead ID/result is passed through.
- Input draft is not mutated.
- Payload includes `createdByAuthUid` and `customerId`.
- Payload preserves pending owner review estimate defaults.
- Payload preserves appointment request fields.

`CustomerPortalQuoteSubmit.test.jsx` uses mocked auth, quote loading, identity resolution, and persistence service calls.

Tests cover:

- Submit disabled when `tenantId` is missing.
- Submit disabled when the linked customer record is missing.
- Valid preview submit calls `submitCustomerPortalQuoteRequest(...)`.
- Success message appears after mocked successful submission.
- Error message appears after mocked failed submission.

No live Firebase service is used in these tests.

## Firebase Rules Risk Note

Before wider beta or production use, Firebase rules still need review for customer-owned quote request writes.

The safe rule model should ensure:

- Customers can create quote requests only for their linked `customerId`.
- Customers cannot write admin-only review/status/payment fields.
- Customers cannot read or modify other tenant/customer leads.
- Admins retain owner review and status update access.

Do not rely on broad testing rules for production customer portal persistence.

## Manual Test Steps

Recommended manual beta check:

1. Sign in as a customer user linked to a tenant and customer record.
2. Open Customer Portal.
3. Open Request Quote.
4. Fill or adjust the quote intake fields.
5. Click `Review Quote Request Draft`.
6. Confirm the preview reflects the requested service, room counts, pets, add-ons, notes, and preferred timing.
7. Click `Submit Quote Request for Owner Review`.
8. Confirm the success message appears.
9. Confirm the owner/admin lead list can see the new quote request.
10. Confirm no booking or payment was created automatically.

Also test blocked states:

- Customer account has no tenant ID.
- Customer account has tenant ID but no linked customer record.

## Next Beta Check

The next safe step is manual Customer Portal beta testing with a linked test customer:

1. Verify a test customer user has `tenantId`.
2. Verify `tenants/{tenantId}/customers/{customerId}` has either `authUid` or matching email.
3. Submit one quote request.
4. Confirm owner/admin views can review the generated lead payload.
5. Document any Firebase rule or owner dashboard compatibility issue before widening testing.
