# Customer Portal Quote Intake Review

## Current Customer Portal Behavior

`servicesos-web/src/components/CustomerPortal.jsx` currently behaves more like a quote viewer and appointment request page than a full quote intake.

Observed behavior:

- Shows tabs for Quotes, Booking, and Appointments.
- Loads quotes with `getQuotes()` but does not pass a tenant ID.
- Because `crmService.getQuotes(tenantId)` requires a tenant ID, Customer Portal currently receives an empty quote list in normal use.
- Shows an empty quote state: "No quotes yet".
- Booking form collects only:
  - Quote ID
  - Preferred date
  - Preferred time
  - Notes
- Appointment requests are stored in `localStorage` under `customer_appointments`.
- Appointment requests are not currently saved to Firestore by `CustomerPortal.jsx`.
- The booking flow depends on an existing quote and does not collect the detailed room/property data needed to create an accurate cleaning quote.

Important implementation gap:

- Customer Portal does not currently identify the signed-in customer's tenant/customer record.
- Customer Portal does not load saved customer profile data.
- Customer Portal does not load or save reusable property profile data.
- Customer Portal does not create a new quote request from detailed intake data.

## Existing Detailed Intake Components And Services Found

### `servicesos-web/src/AIPhotoEstimateSystem.jsx`

This appears to be the active admin-side quote intake in `App.jsx` under the `intake` page.

It includes detailed cleaning quote fields:

- First name
- Last name
- Email
- Phone
- Address
- City
- State
- ZIP
- Bedroom count
- Bathroom count
- Kitchen count
- Living room count
- Dining room count
- Office count
- Basement count
- Stairs and stair count
- Pet hair level
- Clutter level
- Last cleaned
- Cleaning type
- Frequency
- Market type
- Preferred date/time
- Add-ons such as oven, fridge, windows, baseboards, cabinet interiors, garage cleaning, closet organization, pantry organization, laundry room cleaning, basement cleaning, pet waste removal, blind cleaning, ceiling fan cleaning, and wall spot cleaning
- Photo upload and AI photo analysis

Save behavior:

- Calls `calculateEstimate(formData, aiAnalysis)`.
- Calls `saveQuote(tenantId, formData, result, aiAnalysis)`.
- `saveQuote` is an alias to `saveLead` in `servicesos-web/src/services/crmService.js`.
- `saveLead` writes to `tenants/{tenantId}/leads` through `core/leads/leadService.js`.

Important mismatch:

- `AIPhotoEstimateSystem.jsx` uses fields such as `firstName`, `lastName`, `bedroomCount`, and `bathroomCount`.
- `CustomerPortal.jsx` expects fields such as `fullName`, `bedrooms`, and `bathrooms`.
- This means even if Customer Portal loaded these leads, parts of the quote display would not map cleanly without normalization.

### `servicesos-web/src/modules/cleaning/IntakeForm.jsx`

This appears to be a refactored, cleaner 5-step production intake component.

It includes:

- Contact info
- Property details
- Cleaning needs and service scope
- Environmental factors and AI photo upload
- Schedule, review, and estimate

It uses fields such as:

- `fullName`
- `phone`
- `email`
- `address`
- `city`
- `state`
- `zipCode`
- `squareFootage`
- `bedrooms`
- `bathrooms`
- `halfBaths`
- `propertyType`
- `levels`
- `garage`
- `basement`
- `cleaningType`
- `frequency`
- `lastCleaningDate`
- `occupancyStatus`
- `priorityAreas`
- `serviceScope`
- `pets`
- `petCount`
- `petTypes`
- `children`
- `smokingInside`
- `allergies`
- `hazards`
- `condition`
- `preferredDate`
- `preferredTime`
- `flexibleSchedule`
- `budgetRange`
- `referralSource`

It accepts `onLeadSaved(formData, estimate, aiAnalysis)` and does not directly save to Firestore by itself.

This component seems better aligned with a reusable quote intake flow because it has a prop-based save boundary. However, it currently does not handle saved customer/property profile reuse.

### `servicesos-web/src/components/CustomerBookingPortal.jsx`

This is a separate self-booking prototype.

It collects:

- Service type
- Property type
- Property size bucket
- Address
- Date/time
- Frequency
- Contact info
- Notes

Limitations:

- It is not connected to `CustomerPortal.jsx`.
- It uses broad property size buckets instead of detailed cleaning fields.
- It calculates a simple starting price from static client-side values.
- It logs to console and shows an alert on submit.
- It does not save to Firestore.
- It is not sufficient for accurate cleaning quote intake.

## Existing Data/Service Models Found

### Leads / Quote Requests

`servicesos-web/src/core/leads/leadService.js`

- Uses `tenants/{tenantId}/leads`.
- Supports get, create, update, status update, delete, and convert-to-customer.
- `createLead` stores arbitrary `leadData` with schema version, `status: "new"`, `createdAt`, and `updatedAt`.

`servicesos-web/src/services/crmService.js`

- `saveLead(tenantId, formData, estimate, aiAnalysis)` stores:
  - `formData`
  - `estimate`
  - `aiAnalysis`
- This effectively stores a snapshot of the submitted intake at lead creation time.

### Quotes / Estimates

`servicesos-web/src/core/estimates/estimateService.js`

- Uses `tenants/{tenantId}/quotes`.
- Supports estimate CRUD and status changes.
- The current active intake appears to save into `leads`, not this `quotes` collection.

### Customers

`servicesos-web/src/core/customers/customerService.js`

- Uses `tenants/{tenantId}/customers`.
- Stores general customer fields such as name, email, phone, address, city, state, ZIP, and notes through `CustomerManagement.jsx`.
- No dedicated reusable property profile model was found here.

### Customer Portal Service

`servicesos-web/src/services/customerPortalService.js`

- Can load a customer by `customerId`.
- Can load leads, jobs, invoices, and contracts for that customer.
- Uses `customerId` filtering.
- Not currently used by `CustomerPortal.jsx`.

### Pet Profiles

`servicesos-web/src/modules/cleaning/petProfiles/petProfileService.js`

- Supports reusable pet profiles by customer ID.
- This is useful for future saved-profile design, but it does not replace a property profile.

### Properties

Only limited references to `tenants/{tenantId}/properties` were found, mainly in usage/analytics code.

No clear dedicated property profile service was found for:

- Creating a customer property
- Updating a customer property
- Loading customer properties
- Reusing property details in future quote requests
- Storing quote-time property snapshots

## Whether The Old Detailed Intake Appears Disconnected

Yes.

Detailed intake exists, but it is not connected to Customer Portal:

- `AIPhotoEstimateSystem.jsx` is routed as the admin-side "New quote" page.
- `modules/cleaning/IntakeForm.jsx` exists as a refactored/prod-style component but does not appear wired into `App.jsx`.
- `CustomerPortal.jsx` does not render either detailed intake component.
- `CustomerPortal.jsx` does not create leads/quote requests.
- `CustomerPortal.jsx` only attempts to display existing quotes and create local appointment requests from a selected quote.

## Missing Fields Or Missing Flow Pieces

Customer Portal is missing:

- Request Quote entry point.
- Tenant/customer-aware quote loading.
- Current user's customer record lookup.
- Saved property profile loading.
- Saved property profile creation/update.
- Returning-customer prefill.
- Change notes for what is different this time.
- Quote request creation from Customer Portal.
- Snapshot of profile/property details used for each quote request.
- Admin review state for customer-submitted quote requests.
- Consistent field mapping between intake components and quote display.

Potential field mismatch to fix before wiring:

- `AIPhotoEstimateSystem`: `bedroomCount`, `bathroomCount`, `firstName`, `lastName`, `zip`
- `IntakeForm`: `bedrooms`, `bathrooms`, `fullName`, `zipCode`
- `CustomerPortal`: expects `fullName`, `bedrooms`, `bathrooms`, `squareFootage`
- `pdfService`: expects mixed fields, including `firstName`, `lastName`, `bedrooms`, `bathrooms`, and `hasPets`

## Recommended Implementation Options

### Option A: Reconnect Existing Detailed Intake

Use `modules/cleaning/IntakeForm.jsx` inside Customer Portal as the Request Quote flow.

Why this is attractive:

- It is already structured as a customer-friendly multi-step intake.
- It has a clean `onLeadSaved` boundary.
- It uses field names closer to what Customer Portal already displays.
- It avoids duplicating a large form.

Why this is not a tiny safe patch:

- It still needs tenant/customer identity.
- It still needs saved property profile support.
- It needs a safe Firestore write path from Customer Portal.
- It may use client-side AI photo analysis patterns that need review before customer exposure.
- It needs field normalization before quote display/PDF/payment flows.

### Option B: Reuse Existing Admin Estimate Form Inside Customer Portal

Expose `AIPhotoEstimateSystem.jsx` to customers.

Why this is risky:

- It is currently admin-oriented and internally saves quotes.
- It includes payment flow entry points.
- It uses a different field shape than Customer Portal expects.
- It ignores the `onLeadSaved` prop currently passed from `App.jsx`.
- It would likely need refactoring before it is appropriate as a customer-facing portal intake.

This is not recommended as the first Customer Portal fix.

### Option C: Create A New Customer/Property Profile Intake Flow

Create a Customer Portal quote request flow around reusable customer and property profiles, reusing pieces from `modules/cleaning/IntakeForm.jsx`.

Why this is most correct:

- Matches the product requirement that customers should not re-enter all details every time.
- Allows first-time customers to create a saved property profile.
- Allows returning customers to select a saved property.
- Allows new quote requests to store immutable snapshots.
- Avoids mutating old quote data when profile details are edited later.

Tradeoff:

- Requires a planned data model and likely a new property profile service.
- Should be implemented as a focused feature pass with tests, not as a quick UI patch.

## Saved Property Profile Strategy

Recommended collection:

- `tenants/{tenantId}/customers/{customerId}` for customer identity/contact profile.
- `tenants/{tenantId}/properties/{propertyId}` for reusable property profiles.

Recommended property fields:

- `customerId`
- `label` such as "Home", "Office", or address nickname
- `address`
- `city`
- `state`
- `zipCode`
- `propertyType`
- `squareFootage`
- `bedrooms`
- `bathrooms`
- `halfBaths`
- `levels`
- `garage`
- `basement`
- `pets`
- `petCount`
- `petTypes`
- `allergies`
- `accessInstructions`
- `parkingNotes`
- `surfaceNotes`
- `specialInstructions`
- `defaultServiceScope`
- `createdAt`
- `updatedAt`
- `schemaVersion`

Do not store every quote-specific detail only on the reusable property profile. Service type, selected add-ons, condition, hazards, timing, frequency, and change notes may vary by request.

## Returning Customer Prefill Strategy

Returning customer flow:

1. Load signed-in user's customer record.
2. Load saved properties where `property.customerId === customer.id`.
3. Customer selects a property.
4. Intake pre-fills stable property fields.
5. Customer confirms or edits current details.
6. Customer selects service type, scope, date/time, and frequency.
7. Customer adds change notes, such as "extra pet hair this week" or "guest room does not need service".
8. Submit creates a new quote request.
9. If stable property fields changed, ask whether to update the saved profile or use changes for this request only.

## Quote Snapshot Strategy

Each quote request should store an immutable snapshot of the data used at submit time.

Recommended lead/quote request shape:

```js
{
  customerId,
  propertyId,
  customerSnapshot: {
    name,
    email,
    phone
  },
  propertySnapshot: {
    address,
    propertyType,
    squareFootage,
    bedrooms,
    bathrooms,
    halfBaths,
    levels,
    garage,
    basement,
    pets,
    petCount,
    petTypes,
    accessInstructions,
    specialInstructions
  },
  requestDetails: {
    cleaningType,
    frequency,
    serviceScope,
    condition,
    hazards,
    preferredDate,
    preferredTime,
    flexibleSchedule,
    changeNotes
  },
  estimate,
  aiAnalysis,
  status: "new",
  source: "customer-portal",
  createdAt,
  updatedAt
}
```

Why snapshots matter:

- Old quotes stay accurate to what the customer submitted at that time.
- Editing a saved property later does not rewrite history.
- Owner can audit why a quote was priced a certain way.
- Employees can see job scope as approved for that job, not as later edited.

## Risks

- Wiring Customer Portal directly to the admin intake could expose payment buttons or admin-oriented behavior.
- Creating Firestore `properties` records requires schema and security-rule review.
- Customer identity currently appears incomplete for first-time Google sign-in because the fallback profile can have `tenantId: null`.
- Customer Portal currently does not pass tenant ID to quote loading.
- Customer Portal currently does not filter quotes by signed-in customer.
- Quote display expects field names that do not match every intake component.
- Customer Portal appointment requests currently use localStorage, so they do not appear in admin scheduling/workflow.
- Customer-facing AI photo analysis should be reviewed before exposure because it may call external AI services and consume tenant AI credits.

## Recommended Next Implementation Prompt

Use this as the next focused implementation task:

> You are working in `C:\Users\merce\Documents\SLAI_Real\ServicesOS\servicesos-web`.
>
> Goal: Add a safe Customer Portal "Request Quote" flow using the existing `modules/cleaning/IntakeForm.jsx` as the UI foundation, but do not expose payments or change Stripe/Firebase rules.
>
> Scope:
> - Do not touch Stripe/payment behavior.
> - Do not touch Firebase rules.
> - Do not change auth behavior.
> - Do not change tenant data model without stopping and reporting first.
> - Do not touch backend/cloud functions.
> - Do not touch Tap to Pay.
>
> First, design the data contract for `customerSnapshot`, `propertySnapshot`, and `requestDetails`.
> Then add a small provider/service layer for Customer Portal quote requests only if it can use existing `tenants/{tenantId}/leads` safely.
> If a new `properties` collection or security rule change is required, stop and report the required model/rule changes before implementation.
> Preserve the existing Quotes, Booking, and Appointments tabs.
> Add a "Request Quote" CTA in the Quotes tab.
> Ensure returning-customer prefill is planned around saved properties and quote snapshots rather than forcing full re-entry every time.
> Add tests for the new Customer Portal request quote path only after the data flow is safe.

## Recommendation

Do not implement the full Customer Portal detailed intake in a tiny patch.

The correct next move is a small planning/design pass for:

1. Signed-in customer to tenant/customer mapping.
2. Saved property profile model.
3. Quote request snapshot contract.
4. Field normalization between intake, quote display, PDF, and lead services.

After that, reconnect `modules/cleaning/IntakeForm.jsx` as the preferred customer-facing intake foundation.
