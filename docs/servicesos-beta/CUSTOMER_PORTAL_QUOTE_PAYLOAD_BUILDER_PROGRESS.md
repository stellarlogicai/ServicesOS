# Customer Portal Quote Payload Builder Progress

## Purpose

This checkpoint adds a pure quote-request-to-lead payload builder for Customer Portal quote persistence preparation.

No Firestore writes were added. No Customer Portal submit behavior, Firebase rules, auth behavior, tenant data model, Stripe/payment behavior, Stripe Connect, backend/cloud functions, Tap to Pay, routing, or production data were changed.

## Files Changed

- `servicesos-web/src/services/customerPortalQuoteLeadPayloadBuilder.js`
- `servicesos-web/src/__tests__/customerPortalQuoteLeadPayloadBuilder.test.js`
- `docs/servicesos-beta/CUSTOMER_PORTAL_QUOTE_PAYLOAD_BUILDER_PROGRESS.md`

## Helper Function Added

The new pure helper is:

- `buildCustomerPortalQuoteLeadPayload(quoteIntakeDraft)`

It accepts either:

- the full mapper result from `buildCustomerPortalQuoteIntakeDraft(...)`, or
- the nested `quoteRequestDraft` object directly.

The helper is pure and does not call Firebase, localStorage, auth, Stripe, or any backend service.

## Payload Shape Summary

The helper converts the normalized Customer Portal quote request draft into a legacy-compatible tenant lead payload for the future path:

```text
tenants/{tenantId}/leads/{leadId}
```

Legacy-compatible fields included:

- `status: "new"`
- `formData`
- `estimate`
- `aiAnalysis`
- `booking`
- `createdAt`
- `updatedAt`

Quote-request-specific fields included:

- `type: "quote_request"`
- `source: "customer-portal"`
- `customerId`
- `propertyId`
- `createdByAuthUid`
- `customerSnapshot`
- `propertySnapshot`
- `requestSnapshot`
- `review`
- `appointmentRequest`

The estimate is intentionally a safe placeholder until owner review:

```js
{
  priceLow: 0,
  priceHigh: 0,
  laborHours: 0,
  appointmentDuration: null,
  aiEnhanced: false,
  requiresReview: true,
  status: "pending_owner_review"
}
```

## Validation Behavior

The helper throws before a persistence layer can use the payload if any of these are missing:

- `tenantId`
- `createdByAuthUid`
- `customerId`

This keeps the future persistence service from writing ambiguous customer quote requests.

## Tests Added

`customerPortalQuoteLeadPayloadBuilder.test.js` covers:

- Building a legacy-compatible lead payload from a quote intake draft.
- Required `formData` fields for dashboard/admin compatibility.
- Safe placeholder estimate values.
- Customer, property, and request snapshots.
- Clear errors for missing `tenantId`, auth UID, and `customerId`.
- Preferred date/time preservation in `appointmentRequest`.
- Add-ons, pets, clutter, pet hair, last-cleaned, and notes preservation.
- Input draft immutability.

## Known Limitations

- This does not save to Firestore.
- This does not enable the Customer Portal submit button.
- This does not create or update customer records.
- This does not create or update property profiles.
- This does not change customer-owned Firebase rules.
- This does not create bookings or payment records.

## Next Persistence-Service Step

The next safe step is to add a small persistence service with mocked tests.

Recommended next implementation:

1. Add `submitCustomerPortalQuoteRequest({ tenantId, user, customer, quoteRequestDraft })`.
2. Validate `tenantId`, `user.uid`, and `customer.id` before any Firestore call.
3. Use `buildCustomerPortalQuoteLeadPayload(...)` to build the payload.
4. Call the existing tenant-scoped `createLead(tenantId, payload)` service.
5. Return a standardized success/error result.
6. Keep Customer Portal UI submit behavior disabled until the persistence service and rule readiness are confirmed.

Do not change Firebase rules in the same pass as the first client-side persistence service.
