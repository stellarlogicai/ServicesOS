# Customer Portal Quote Persistence Service Progress

## Purpose

This checkpoint adds a small Customer Portal quote request persistence service that is ready for mocked validation, but it is not wired into the Customer Portal UI.

The service can call the existing tenant-scoped lead persistence path when invoked by future code:

```text
tenants/{tenantId}/leads/{leadId}
```

No Customer Portal submit behavior, Firebase rules, auth behavior, tenant data model, Stripe/payment behavior, Stripe Connect, backend/cloud functions, Tap to Pay, routing, or production data were changed.

## Files Changed

- `servicesos-web/src/services/customerPortalQuoteRequestService.js`
- `servicesos-web/src/__tests__/customerPortalQuoteRequestService.test.js`
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

No live Firebase service is used in these tests.

## What Is Still Not Wired To UI

Customer Portal still does not call `submitCustomerPortalQuoteRequest(...)`.

The Request Quote experience remains preview-only until the UI submit behavior is deliberately wired and manually tested.

## Firebase Rules Risk Note

Before wider beta or production use, Firebase rules still need review for customer-owned quote request writes.

The safe rule model should ensure:

- Customers can create quote requests only for their linked `customerId`.
- Customers cannot write admin-only review/status/payment fields.
- Customers cannot read or modify other tenant/customer leads.
- Admins retain owner review and status update access.

Do not rely on broad testing rules for production customer portal persistence.

## Next UI Wiring Step

The next safe implementation step is a small Customer Portal UI wiring pass:

1. Keep the preview step.
2. Enable a submit action only when `tenantId`, signed-in `user.uid`, and linked `customer.id` are present.
3. Call `submitCustomerPortalQuoteRequest(...)`.
4. Show a success state with the created lead ID or owner-review message.
5. Show a clear blocked state when tenant/customer identity is missing.
6. Do not create bookings, payments, customers, or properties in the UI wiring pass.
7. Add component or integration tests only if existing patterns support mocked service calls safely.
