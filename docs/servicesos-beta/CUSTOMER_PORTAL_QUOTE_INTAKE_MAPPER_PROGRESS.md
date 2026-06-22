# Customer Portal Quote Intake Mapper Progress

## Purpose

This document records the first implementation step for Customer Portal quote intake.

The work in this pass is intentionally limited to pure mapper/helper functions and tests. It does not change Customer Portal UI, IntakeForm UI, AIPhotoEstimateSystem UI, Firestore writes, Firebase rules, auth behavior, tenant data model, Stripe/payment behavior, backend/cloud functions, Tap to Pay, routing, or production data.

## Files Created

- `servicesos-web/src/services/customerPortalQuoteRequestMapper.js`
- `servicesos-web/src/__tests__/customerPortalQuoteRequestMapper.test.js`
- `docs/servicesos-beta/CUSTOMER_PORTAL_QUOTE_INTAKE_MAPPER_PROGRESS.md`

## Mapper Functions Added

The mapper service adds pure helper functions for quote-intake data normalization:

- `normalizeIntakeFormData(formData)`
  - Normalizes the existing `IntakeForm.jsx` field shape.
- `normalizeAIPhotoEstimateData(formData)`
  - Normalizes the existing `AIPhotoEstimateSystem.jsx` field shape.
- `normalizeQuoteIntakeData(formData, sourceFormat)`
  - Auto-detects or explicitly selects the intake source shape.
- `buildCustomerProfileDraft(options)`
  - Creates a customer profile draft without saving it.
- `buildPropertyProfileDraft(options)`
  - Creates or merges a reusable property profile draft without saving it.
- `buildQuoteRequestSnapshot(options)`
  - Creates immutable customer, property, and request snapshots by value.
- `buildQuoteRequestDraft(options)`
  - Creates a quote request draft compatible with the documented lead/quote-request strategy.
- `buildCustomerPortalQuoteIntakeDraft(options)`
  - Produces the normalized intake data, customer profile draft, property profile draft, and quote request draft together.

All helpers are pure functions. They do not call Firebase, localStorage, auth, Stripe, backend APIs, or browser APIs.

## Field Normalization Decisions

- `IntakeForm.jsx` naming is treated as the preferred customer-facing field base.
- `AIPhotoEstimateSystem.jsx` naming is normalized into the same shape.
- `firstName` and `lastName` are combined into `fullName`.
- `zip` is normalized to `zipCode`.
- `bedroomCount` and `bathroomCount` are normalized to `bedrooms` and `bathrooms`.
- Room-count fields are preserved under `property.roomCounts`.
- Pet data is normalized under `household`.
- `petHairLevel`, `clutterLevel`, and `lastCleaned` are preserved for estimate review.
- Add-ons from `extras` are normalized into `requestDetails.serviceScope`.
- Customer notes from `specialRequests`, `notes`, or `customerNotes` are normalized to `specialRequests`.
- Preferred date/time are preserved on both the quote request snapshot and the appointment request draft.
- Raw input is copied into `requestSnapshot.rawInput` to support audit/review during beta.
- Returning-customer saved property data is preserved unless changed fields are supplied in the new intake.

## Test Cases Added

The mapper tests cover:

1. `IntakeForm.jsx`-style data mapping to customer, property, and quote request drafts.
2. `AIPhotoEstimateSystem.jsx`-style data mapping to the normalized quote intake shape.
3. Safe defaults for missing optional fields.
4. Returning customer saved property data plus changed intake fields.
5. Snapshot immutability after saved property data changes later.
6. Preservation of pet, clutter, last-cleaned, add-on, and customer note fields.

## Known Limitations

- The mapper does not write to Firestore.
- The mapper does not validate Firebase security rules.
- The mapper does not resolve signed-in users to customer profiles.
- The mapper does not load saved properties.
- The mapper does not render intake UI in Customer Portal.
- The mapper does not decide whether changed property data should update the saved profile or apply only to a single quote request.
- The mapper does not create real bookings; booking creation should remain owner/admin approved.
- Quote request persistence still needs a careful implementation pass after tenant/customer context is confirmed.

## Next Safe UI Implementation Step

The next implementation step should be small and read-oriented:

1. Add a Customer Portal "Request Quote" entry point or tab.
2. Render a customer-safe version of the existing `IntakeForm.jsx`.
3. Use the mapper to preview/build drafts in memory only at first.
4. Do not write to Firestore until tenant ID, customer profile mapping, property profile reads, and Firebase rules are confirmed.
5. Keep appointment/booking creation separate from quote request submission.

Recommended next prompt:

> Add a Customer Portal Request Quote UI shell that renders existing intake fields and calls the quote intake mapper in memory only. Do not write to Firestore yet. Do not modify Firebase rules, auth behavior, Stripe/payment behavior, backend/cloud functions, routing, or production data.
