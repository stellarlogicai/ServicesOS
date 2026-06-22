# Customer Portal Identity Resolution Progress

## Purpose

This checkpoint adds read-only Customer Portal tenant/customer identity resolution before quote request persistence.

No quote requests are written in this pass. No Firebase rules, auth behavior, tenant data model, Stripe/payment behavior, Stripe Connect, backend/cloud functions, Tap to Pay, routing, or production data were changed.

## Files Changed

- `servicesos-web/src/components/CustomerPortal.jsx`
- `servicesos-web/src/components/CustomerPortal.css`
- `servicesos-web/src/services/customerPortalIdentityService.js`
- `servicesos-web/src/__tests__/customerPortalIdentityService.test.js`
- `docs/servicesos-beta/CUSTOMER_PORTAL_IDENTITY_RESOLUTION_PROGRESS.md`

## Identity Fields Read

`CustomerPortal.jsx` now reads these values from `useAuth()`:

- `user`
- `userProfile`
- `tenantId`
- `currentTenant`

The portal derives the active tenant ID from:

1. `tenantId`
2. `currentTenant.id`
3. `currentTenant` if it is already a string

The values are used only for read-only identity resolution and in-memory quote preview context.

## Customer Resolver Behavior

The new read-only helper is:

- `resolveCustomerPortalCustomer({ tenantId, user })`

It lives in:

- `servicesos-web/src/services/customerPortalIdentityService.js`

Resolver order:

1. If `tenantId` is missing, return `missing-tenant`.
2. If `user.uid` is missing, return `missing-user`.
3. Query `tenants/{tenantId}/customers` where `authUid == user.uid`.
4. If no match, query `tenants/{tenantId}/customers` where `email == user.email`.
5. If no match, return `customer-not-found`.
6. If Firestore read fails, return `error`.

The helper does not create or update customer records.

## Missing Tenant Behavior

If the signed-in customer account has no tenant ID, Customer Portal shows:

> Your customer account is not linked to a business yet, so saved quote requests are not enabled.

The Request Quote form remains usable as an in-memory preview only.

## Missing Customer Behavior

If a tenant ID exists but no matching customer record is found by `authUid` or email, Customer Portal shows:

> Your customer profile needs to be linked before saved quote requests can be enabled.

The Request Quote form remains usable as an in-memory preview only.

## Persistence Status

Persistence remains disabled.

This pass does not:

- Save quote requests.
- Create leads.
- Create customer records.
- Create property profiles.
- Update bookings.
- Write appointments to Firestore.
- Change the existing localStorage appointment behavior.

## Tests Added

`customerPortalIdentityService.test.js` covers:

- Missing tenant returns without querying Firestore.
- Customer resolves by `authUid`.
- Customer resolves by email fallback.
- Customer-not-found status after both lookups miss.

Firestore calls are mocked. No live Firebase service is used.

## Next Persistence Step

The next safe persistence step is to add a pure payload builder for saving quote requests as legacy-compatible leads.

Recommended next implementation order:

1. Keep Customer Portal preview in-memory.
2. Add a pure helper that converts `quoteRequestDraft` into a `tenants/{tenantId}/leads` payload.
3. Include legacy owner/admin fields: `formData`, `estimate`, `aiAnalysis`, `booking`, `status`.
4. Include new quote-intake fields: `type`, `source`, `customerId`, `propertyId`, `createdByAuthUid`, `customerSnapshot`, `propertySnapshot`, `requestSnapshot`, `review`, and `appointmentRequest`.
5. Add tests for missing tenant/customer/auth blocking before any Firestore call.
6. Only after tests pass, add a small persistence service that calls `createLead(tenantId, payload)`.

Do not harden or change Firebase rules in the same pass as the first client-side persistence service.
