# Customer Portal Quote Intake Data Contract

## Purpose

This document defines the proposed Customer Portal data contract before implementation.

The product requirement is:

- First-time customers complete detailed cleaning/property intake once.
- The system saves reusable customer and property profile data.
- Returning customers select a saved property, confirm or update what changed, and submit a new quote or booking request.
- Quote requests store an immutable snapshot of the details used at submission time.
- Editing a saved property later must not silently change old quotes.
- Owner/admin reviews the quote request and generates or approves the quote.

This is a planning document only. It does not change UI, Firestore writes, Firebase rules, auth behavior, Stripe, backend/cloud functions, or Tap to Pay.

## Existing Fields Found In `IntakeForm.jsx`

File:

- `servicesos-web/src/modules/cleaning/IntakeForm.jsx`

This appears to be the better foundation for a customer-facing quote intake because it is structured as a 5-step form and accepts `onLeadSaved(formData, estimate, aiAnalysis)`.

Fields found:

```js
{
  fullName: "",
  phone: "",
  email: "",
  preferredContactMethod: "",
  bestTimeToCall: "",

  address: "",
  city: "",
  state: "",
  zipCode: "",
  squareFootage: "",
  bedrooms: 3,
  bathrooms: 2,
  halfBaths: 0,
  propertyType: "House",
  levels: 1,
  garage: false,
  basement: false,

  cleaningType: "standard",
  frequency: "bi-weekly",
  lastCleaningDate: "",
  occupancyStatus: "",
  priorityAreas: [],
  serviceScope: {},

  pets: false,
  petCount: 0,
  petTypes: [],
  children: false,
  smokingInside: false,
  allergies: "",
  hazards: [],
  condition: "moderate",

  preferredDate: "",
  preferredTime: "",
  flexibleSchedule: false,
  budgetRange: "",
  referralSource: ""
}
```

Additional calculated estimate fields:

```js
{
  laborHours,
  appointmentDuration,
  priceLow,
  priceHigh,
  aiEnhanced,
  requiresReview,
  aiConfidence,
  breakdown: {
    baseLab,
    condMult,
    addOn
  }
}
```

Notes:

- It has useful review gating through `requiresReview`.
- It distinguishes reusable property details from request-specific details reasonably well.
- It does not currently handle saved property profile lookup or update.
- It does not directly save to Firestore; it calls `onLeadSaved`.

## Existing Fields Found In `AIPhotoEstimateSystem.jsx`

File:

- `servicesos-web/src/AIPhotoEstimateSystem.jsx`

This is the current admin-side quote intake routed in `App.jsx` as the `intake` page.

Fields found:

```js
{
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  state: "",
  zip: "",

  bedroomCount: 3,
  bathroomCount: 2,
  kitchenCount: 1,
  livingRoomCount: 1,
  diningRoomCount: 0,
  officeCount: 0,
  basementCount: 0,
  stairs: false,
  stairsCount: 0,

  petHairLevel: "none",
  clutterLevel: "normal",
  lastCleaned: "monthly",
  cleaningType: "standard",
  frequency: "one-time",
  marketType: "rural",
  preferredDate: "",
  preferredTime: "",

  extras: {
    oven: false,
    fridge: false,
    windows: false,
    baseboards: false,
    cabinetsInside: false,
    garageCleaning: false,
    closetOrganization: false,
    pantryOrganization: false,
    laundryRoomCleaning: false,
    basementCleaning: false,
    petWasteRemoval: false,
    blindCleaning: false,
    ceilingFanCleaning: false,
    wallSpotCleaning: false
  },

  levels: {
    garageLevel: "none",
    closetLevel: "none",
    organizationLevel: "none"
  },

  specialRequests: ""
}
```

Additional behavior:

- Runs `calculateEstimate(formData, aiAnalysis)`.
- Calls `saveQuote(tenantId, formData, result, aiAnalysis)`.
- `saveQuote` aliases to `saveLead` in `servicesos-web/src/services/crmService.js`.
- Includes payment flow entry points through `PaymentForm`.

Notes:

- This component should not be exposed directly in Customer Portal without refactoring because it is admin-oriented and includes payment entry points.
- It uses field names that differ from `IntakeForm.jsx` and `CustomerPortal.jsx`.

## Field Mismatches Between Existing Intake Forms

| Concept | `IntakeForm.jsx` | `AIPhotoEstimateSystem.jsx` | Customer Portal current expectation |
| --- | --- | --- | --- |
| Customer name | `fullName` | `firstName`, `lastName` | `formData.fullName` |
| ZIP | `zipCode` | `zip` | mixed |
| Bedrooms | `bedrooms` | `bedroomCount` | `formData.bedrooms` |
| Bathrooms | `bathrooms` | `bathroomCount` | `formData.bathrooms` |
| Half baths | `halfBaths` | not explicit | `formData.halfBaths` not used |
| Square footage | `squareFootage` | not in initial state | `formData.squareFootage` |
| Property type | `propertyType` | not in initial state | not used |
| Levels/floors | `levels` number | `levels` object for add-on levels | not used |
| Garage | `garage` boolean | `extras.garageCleaning` and `levels.garageLevel` | not used |
| Basement | `basement` boolean | `basementCount` and `extras.basementCleaning` | not used |
| Pets | `pets`, `petCount`, `petTypes` | `petHairLevel`, `petWasteRemoval` | not used |
| Condition | `condition` | `clutterLevel`, `lastCleaned`, `petHairLevel` | not used |
| Add-ons | `serviceScope` | `extras` | not used |
| Special notes | `allergies`, `hazards`, request fields | `specialRequests` | appointment `notes` |
| Preferred schedule | `preferredDate`, `preferredTime`, `flexibleSchedule` | `preferredDate`, `preferredTime` | `preferredDate`, `preferredTime` |

## Recommended Normalized Field Names

Use `IntakeForm.jsx` naming as the preferred base because it is closer to a reusable customer-facing intake.

Recommended normalized names:

```js
{
  customer: {
    fullName,
    email,
    phone,
    preferredContactMethod,
    bestTimeToCall
  },

  property: {
    address,
    city,
    state,
    zipCode,
    propertyType,
    squareFootage,
    bedrooms,
    bathrooms,
    halfBaths,
    levels,
    garage,
    basement,
    stairs,
    stairsCount
  },

  household: {
    pets,
    petCount,
    petTypes,
    petHairLevel,
    children,
    smokingInside,
    allergies
  },

  requestDetails: {
    cleaningType,
    frequency,
    lastCleaningDate,
    occupancyStatus,
    condition,
    clutterLevel,
    lastCleaned,
    priorityAreas,
    serviceScope,
    hazards,
    preferredDate,
    preferredTime,
    flexibleSchedule,
    budgetRange,
    referralSource,
    changeNotes,
    specialRequests
  }
}
```

Normalize legacy fields like this:

```js
{
  fullName: `${firstName} ${lastName}`.trim(),
  zipCode: zip,
  bedrooms: bedroomCount,
  bathrooms: bathroomCount,
  serviceScope: {
    insideOven: extras.oven,
    insideFridge: extras.fridge,
    windows: extras.windows,
    baseboards: extras.baseboards,
    insideCabinets: extras.cabinetsInside,
    laundry: extras.laundryRoomCleaning,
    organization: extras.closetOrganization || extras.pantryOrganization
  }
}
```

## Customer Profile Shape

Recommended collection:

- Existing: `tenants/{tenantId}/customers/{customerId}`

This aligns with `core/customers/customerService.js`.

Proposed shape:

```js
{
  schemaVersion: 1,
  tenantId,
  authUid,

  name,
  email,
  phone,

  preferredContactMethod,
  bestTimeToCall,

  defaultPropertyId,
  status: "active",
  source: "customer-portal",

  notes,
  createdAt,
  updatedAt
}
```

Notes:

- `authUid` is needed to connect the signed-in Firebase user to the customer record.
- Existing `CustomerManagement.jsx` already uses general fields such as `name`, `email`, `phone`, `address`, `city`, `state`, `zip`, and `notes`.
- The customer profile should not be the only place property details live, because a customer may have multiple properties.

## Property Profile Shape

Recommended collection:

- Proposed: `tenants/{tenantId}/properties/{propertyId}`

Why:

- Existing ServicesOS collection style uses tenant subcollections.
- `services/saasFeatureUsageService.js` already references `tenants/{tenantId}/properties`.
- A `properties` collection avoids overloading `customers`.
- It supports multiple properties per customer.

Proposed shape:

```js
{
  schemaVersion: 1,
  tenantId,
  customerId,

  label: "Home",
  isDefault: true,

  address,
  city,
  state,
  zipCode,
  propertyType,
  squareFootage,
  bedrooms,
  bathrooms,
  halfBaths,
  levels,
  garage,
  basement,
  stairs,
  stairsCount,

  household: {
    pets,
    petCount,
    petTypes,
    petHairLevel,
    children,
    smokingInside,
    allergies
  },

  access: {
    accessInstructions,
    parkingNotes,
    gateCode,
    entryNotes
  },

  cleaningDefaults: {
    preferredFrequency,
    defaultServiceScope,
    priorityAreas,
    surfaceNotes,
    specialInstructions
  },

  status: "active",
  createdAt,
  updatedAt
}
```

Reusable profile rules:

- Store stable home/property facts here.
- Do not store every one-time service request detail here.
- Allow customer to update profile after review.
- Keep old quote snapshots unchanged.

## Quote Request Shape

Recommended collection:

- Existing: `tenants/{tenantId}/leads/{leadId}`

Why:

- `crmService.saveLead` already writes quote/intake submissions to `leads`.
- `CRMDashboard` and admin workflow already read leads.
- This avoids creating a parallel quote request collection before the beta flow is stable.

Proposed quote request shape:

```js
{
  schemaVersion: 1,
  type: "quote_request",
  source: "customer-portal",
  status: "new",

  customerId,
  propertyId,
  createdByAuthUid,

  customerSnapshot,
  propertySnapshot,
  requestSnapshot,

  estimate: {
    laborHours,
    appointmentDuration,
    priceLow,
    priceHigh,
    aiEnhanced,
    requiresReview,
    aiConfidence,
    breakdown
  },

  aiAnalysis,

  review: {
    requiresOwnerReview,
    reviewReason,
    reviewedBy,
    reviewedAt,
    ownerNotes
  },

  createdAt,
  updatedAt
}
```

Status values should stay compatible with existing lead status concepts where possible:

```js
["new", "quoted", "estimate_sent", "follow_up", "booked", "lost", "converted"]
```

## Quote Request Snapshot Shape

Each quote request must store immutable details used at submission.

Recommended nested snapshot shape:

```js
{
  customerSnapshot: {
    customerId,
    fullName,
    email,
    phone,
    preferredContactMethod,
    bestTimeToCall
  },

  propertySnapshot: {
    propertyId,
    label,
    address,
    city,
    state,
    zipCode,
    propertyType,
    squareFootage,
    bedrooms,
    bathrooms,
    halfBaths,
    levels,
    garage,
    basement,
    stairs,
    stairsCount,
    household,
    access,
    cleaningDefaults
  },

  requestSnapshot: {
    cleaningType,
    frequency,
    lastCleaningDate,
    occupancyStatus,
    condition,
    clutterLevel,
    lastCleaned,
    priorityAreas,
    serviceScope,
    hazards,
    preferredDate,
    preferredTime,
    flexibleSchedule,
    budgetRange,
    referralSource,
    changeNotes,
    specialRequests,
    submittedAt
  }
}
```

Snapshot rules:

- Snapshots are copied into each quote request at submit time.
- Admin quote generation should use the snapshot, not live property profile data.
- Editing `properties/{propertyId}` later should not mutate existing quote requests.
- If a customer changes stable property details during intake, let them choose:
  - "Use for this request only"
  - "Also update saved property profile"

## Appointment / Booking Request Shape

There are two different concepts:

1. Appointment request: customer asks for a date/time before admin confirms.
2. Booking/job: admin-approved scheduled work item.

Current scheduling collection:

- Existing: `tenants/{tenantId}/bookings/{bookingId}`
- Used by `core/scheduling/schedulingService.js` and `CalendarView.jsx`.

Recommended beta approach:

- Store customer-submitted appointment requests in the quote request first.
- Create `bookings` only after owner/admin approves or schedules the work.

Appointment request nested on lead/quote request:

```js
{
  appointmentRequest: {
    preferredDate,
    preferredTime,
    flexibleSchedule,
    notes,
    status: "pending_review",
    requestedAt
  }
}
```

Approved booking/job shape, compatible with existing `bookings` collection:

```js
{
  schemaVersion: 1,
  source: "quote_request",
  quoteRequestId,
  customerId,
  propertyId,

  customerName,
  customerEmail,
  customerPhone,
  customerAddress,

  date,
  startTime,
  endTime,
  employeeId,
  assignedEmployees,

  serviceType,
  frequency,
  estimatedHours,
  estimatedPriceLow,
  estimatedPriceHigh,

  jobSnapshot: {
    customerSnapshot,
    propertySnapshot,
    requestSnapshot,
    estimate
  },

  notes,
  status: "scheduled",
  createdAt,
  updatedAt
}
```

Do not write customer appointment requests only to `localStorage` after implementation. That is acceptable for the current prototype but not for beta workflow.

## Firestore Collection Recommendation

Use existing tenant-scoped patterns:

```text
tenants/{tenantId}/customers/{customerId}
tenants/{tenantId}/properties/{propertyId}
tenants/{tenantId}/leads/{leadId}
tenants/{tenantId}/quotes/{quoteId}
tenants/{tenantId}/bookings/{bookingId}
tenants/{tenantId}/pet_profiles/{profileId}
```

Recommended roles:

- `customers`: saved customer identity/contact profile.
- `properties`: reusable property/home profiles.
- `leads`: customer quote requests and intake snapshots during review.
- `quotes`: finalized owner/admin estimate records if/when separated from leads.
- `bookings`: scheduled jobs only after approval.
- `pet_profiles`: optional detailed pet profiles if the cleaning module needs more than basic `household` fields.

Schema note:

- `SCHEMA_VERSIONS` currently has no `PROPERTY` or `PET_PROFILE` entry.
- `petProfileService` uses `PET_PROFILE`, but `schemaVersioning.js` does not define it; `addSchemaVersion` falls back to `1`.
- Adding `PROPERTY` to schema version constants is a small future schema task, not part of this doc-only pass.

## First-Time Customer Flow

1. Customer signs in.
2. Customer opens Customer Portal.
3. Customer clicks "Request Quote".
4. App resolves tenant/customer context.
5. If no customer profile exists, create or prompt for customer profile fields.
6. Customer completes detailed property intake.
7. App creates or updates customer profile.
8. App creates a saved property profile.
9. App creates a quote request in `leads` with customer/property/request snapshots.
10. Owner/admin reviews the quote request.
11. Owner/admin generates or approves quote.
12. Customer can view the quote in Customer Portal.
13. Customer can request appointment/booking from the approved quote.
14. Owner/admin confirms and creates a booking/job.

## Returning Customer Flow

1. Customer signs in.
2. Customer opens Customer Portal.
3. Customer clicks "Request Quote".
4. App loads customer profile by `authUid`.
5. App loads saved properties by `customerId`.
6. Customer selects saved property.
7. Intake pre-fills stable property details.
8. Customer confirms details or updates changed fields.
9. Customer selects service type, add-ons/scope, condition, schedule preference, and change notes.
10. App asks whether changed stable property fields should update the saved property profile.
11. App creates a new quote request with a fresh immutable snapshot.
12. Old quote requests remain unchanged.

## Required Implementation Phases

### Phase 1: Data Normalization Helpers

- Add mapping helpers from `IntakeForm` data to normalized customer/profile/request/snapshot shapes.
- Add legacy mapping helpers for `AIPhotoEstimateSystem` data if needed.
- Add unit tests for mapping helpers.
- No Firestore writes yet.

### Phase 2: Customer Context And Property Read Plan

- Resolve signed-in user to tenant/customer profile.
- Confirm whether customer users reliably have `tenantId`.
- If missing, stop and define onboarding/invitation behavior.
- Add read-only property profile loading if safe.

### Phase 3: Customer Portal Request Quote UI

- Add a "Request Quote" CTA/tab.
- Render a customer-safe version of `IntakeForm.jsx`.
- Do not expose payment buttons.
- Prefill from saved profile/property.

### Phase 4: Quote Request Save

- Write quote request to existing `leads` collection if rules and permissions support it.
- Include snapshots.
- Keep `bookings` untouched until admin approval.

### Phase 5: Returning Customer Profile Updates

- Add "use once" vs "update saved property" behavior.
- Add property profile update path.
- Add tests for snapshot immutability.

### Phase 6: Admin Review And Booking Conversion

- Owner/admin reviews quote request.
- Owner/admin generates/approves quote.
- Booking/job is created only after approval.

## Risks

- Customer Portal currently calls `getQuotes()` without tenant ID.
- Customer Portal currently does not filter quotes by signed-in customer.
- Customer Portal currently stores appointment requests in `localStorage`.
- Full saved-property behavior likely needs a new `properties` service.
- Firebase rules may need review before customer users can create leads/properties safely.
- Customer users may not always have `tenantId`, especially first-time Google sign-ins.
- Field mismatches can break quote display, PDF generation, or scheduling if not normalized.
- `AIPhotoEstimateSystem.jsx` includes payment entry points and should not be exposed directly.
- AI photo analysis in customer-facing intake may consume credits or call external APIs; expose carefully.
- Creating bookings immediately from customer requests could bypass owner review.

## Is Implementation Safe Without Backend Or Schema Changes?

Partial implementation may be safe without backend changes only if it writes customer quote requests to the existing `tenants/{tenantId}/leads` collection and Firebase rules already allow the signed-in customer to create scoped lead records.

The full product requirement is not safe to implement blindly without schema/security review because it needs:

- Reliable `authUid` to customer profile mapping.
- A reusable `properties` collection or equivalent embedded customer profile strategy.
- Permission rules for customer users to read/write only their own profile/property/quote request data.
- Snapshot contract enforcement.

Do not implement saved property profiles until Firebase rules and customer tenant mapping are confirmed.

## Recommended Next Implementation Prompt

Use this as the next focused implementation task:

> You are working in `C:\Users\merce\Documents\SLAI_Real\ServicesOS\servicesos-web`.
>
> Goal: Add data normalization helpers and tests for Customer Portal quote intake without changing UI or Firestore writes.
>
> Scope:
> - Do not modify CustomerPortal UI yet.
> - Do not modify IntakeForm UI yet.
> - Do not write to Firestore yet.
> - Do not touch Stripe/payment behavior.
> - Do not touch Firebase rules or auth behavior.
>
> Create a small helper such as `src/services/customerPortalQuoteRequestMapper.js` or a shared utility under an existing appropriate services/shared folder.
> It should convert `IntakeForm.jsx` form data plus estimate/AI analysis into:
> - customerSnapshot
> - propertySnapshot
> - requestSnapshot
> - lead/quote request payload
>
> Add Vitest tests for:
> - First-time intake payload mapping.
> - Returning customer property prefill mapping.
> - Snapshot immutability by value copy.
> - Legacy AIPhotoEstimateSystem field normalization if needed.
>
> Run `npm run lint`, `npm run test -- --run`, and `npm run build`.

## Recommendation

Start with pure mapping helpers and tests. That creates a safe foundation before touching Customer Portal, Firestore writes, Firebase rules, or the detailed intake UI.
