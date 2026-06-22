# Customer Portal Quote Intake Mapper Progress

## Purpose

This document records the first implementation step for Customer Portal quote intake.

The work in this pass is intentionally limited to pure mapper/helper functions and tests. It does not change Customer Portal UI, IntakeForm UI, AIPhotoEstimateSystem UI, Firestore writes, Firebase rules, auth behavior, tenant data model, Stripe/payment behavior, backend/cloud functions, Tap to Pay, routing, or production data.

## Files Created

- `servicesos-web/src/services/customerPortalQuoteRequestMapper.js`
- `servicesos-web/src/__tests__/customerPortalQuoteRequestMapper.test.js`
- `docs/servicesos-beta/CUSTOMER_PORTAL_QUOTE_INTAKE_MAPPER_PROGRESS.md`

## UI Shell Added

A Customer Portal "Request Quote" UI shell has been added in:

- `servicesos-web/src/components/CustomerPortal.jsx`
- `servicesos-web/src/components/CustomerPortal.css`

The UI shell:

- Adds a visible "Request Quote" tab without removing the existing Quotes, Booking, or Appointments tabs.
- Lets a customer enter cleaning/property details needed for quote review.
- Builds a quote request preview in memory only.
- Clearly labels the preview as not saved or persisted.
- Includes copy explaining that saved property profiles are planned for returning customers.
- Leaves the existing local appointment request behavior unchanged.

## No Persistence Yet

This pass intentionally does not save quote requests, property profiles, appointment requests, or customer profile drafts to Firestore.

No changes were made to:

- Firestore write logic
- Firebase rules
- Auth behavior
- Tenant data model
- Stripe/payment behavior
- Stripe Connect
- Backend/cloud functions
- Tap to Pay
- Routing
- Production data

## Data Collected By The UI Shell

The Request Quote shell collects:

- Service type
- Bedrooms
- Bathrooms
- Kitchens
- Living rooms
- Dining rooms
- Offices
- Closets
- Laundry room
- Garage
- Basement
- Stairs
- Approx square footage
- Pets
- Pet hair level
- Clutter level
- Last cleaned
- Add-ons
- Special surfaces/materials
- Access notes
- Preferred date
- Preferred time
- Customer notes

## Mapper Function Used By The UI Shell

The UI shell uses:

- `buildCustomerPortalQuoteIntakeDraft(...)`

The form passes `sourceFormat: "intake-form"` and receives:

- `normalizedData`
- `customerProfileDraft`
- `propertyProfileDraft`
- `quoteRequestDraft`

The resulting draft is shown as a local preview only.

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
- Closet count is preserved under `property.roomCounts.closets`.
- Pet data is normalized under `household`.
- `petHairLevel`, `clutterLevel`, and `lastCleaned` are preserved for estimate review.
- Add-ons from `extras` are normalized into `requestDetails.serviceScope`.
- Customer notes from `specialRequests`, `notes`, or `customerNotes` are normalized to `specialRequests`.
- Special surfaces/materials, access notes, and customer notes are preserved on the request details and raw snapshot.
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

The tests now also cover shell-specific fields such as closet count, special surfaces/materials, and access notes.

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

The next UI step should be small and read-oriented:

1. Confirm tenant ID and customer profile resolution for signed-in customer users.
2. Confirm whether customer users are allowed to create scoped lead/quote request records.
3. Confirm whether `tenants/{tenantId}/properties` is allowed and whether a property service should be added.
4. Keep appointment/booking creation separate from quote request submission.
5. Add persistence only after rules and ownership boundaries are clear.

## Next Persistence Step

The next persistence step should not write full profiles immediately. It should first confirm:

- How Customer Portal resolves `tenantId`.
- How signed-in users map to `customers/{customerId}`.
- Whether Firebase rules allow customer-owned reads/writes for quote requests.
- Whether saved property profiles should use `tenants/{tenantId}/properties/{propertyId}`.
- Whether quote requests should initially save to `tenants/{tenantId}/leads`.

Recommended next prompt:

> Diagnose Customer Portal tenant/customer identity and Firebase rule readiness for saving quote requests. Do not write quote requests yet. Confirm whether a signed-in customer can safely create a tenant-scoped lead/quote request and whether saved property profiles need a new service or rules update.
