# Customer Portal Quote Persistence Diagnosis

## Purpose

This document diagnoses whether the Customer Portal Request Quote shell is ready for Firestore persistence.

No persistence was implemented in this pass. No UI, Firebase rules, auth behavior, tenant data model, Stripe/payment behavior, backend/cloud functions, Tap to Pay, routing, or production data were changed.

## Files Inspected

- `servicesos-web/src/components/CustomerPortal.jsx`
- `servicesos-web/src/components/LoginForm.jsx`
- `servicesos-web/src/contexts/AuthContext.jsx`
- `servicesos-web/src/contexts/ProtectedRoute.jsx`
- `servicesos-web/src/App.jsx`
- `servicesos-web/src/services/crmService.js`
- `servicesos-web/src/core/leads/leadService.js`
- `servicesos-web/src/core/customers/customerService.js`
- `servicesos-web/src/services/customerPortalService.js`
- `servicesos-web/src/services/tenantService.js`
- `servicesos-web/src/services/multiTenantService.js`
- `servicesos-web/src/pages/Dashboard.jsx`
- `servicesos-web/src/components/CRMDashboard.jsx`
- `servicesos-web/src/__tests__/workflow.test.js`
- `servicesos-web/src/__tests__/smoke.test.js`
- `servicesos-web/src/__tests__/login.test.js`
- `servicesos-web/src/__tests__/customerPortalQuoteRequestMapper.test.js`
- `cloud-functions/firebase.json`
- `cloud-functions/firestore.rules`
- `shared/firestore.rules`

## Current Identity Flow

`AuthContext.jsx` listens to Firebase Auth and then loads `users/{uid}`.

Expected user profile shape:

```js
{
  uid,
  role: "customer" | "admin" | "super-admin",
  tenantId,
  email,
  displayName,
  status
}
```

For existing user docs, `AuthContext` sets:

- `user`
- `userProfile`
- `role`
- `tenantId: userProfile?.tenantId || null`
- `currentTenant`, loaded from `getTenant(profile.tenantId)`

For first-time Google sign-in, `loginWithGoogle(tenantId = null)` creates `users/{uid}` with:

```js
{
  email,
  displayName,
  role: "customer",
  tenantId: tenantId || null,
  status: "active"
}
```

`LoginForm.jsx` calls `loginWithGoogle()` without a tenant ID. Email/password signup also calls:

```js
signup(email, password, null, "customer")
```

This means a normal customer login currently tends to create or load a customer-role user with `tenantId: null` unless another onboarding/invitation flow has already written a tenant ID.

## Current Tenant Lookup Flow

Tenant lookup is handled by `AuthContext.loadTenant(tenantId)`.

If `tenantId` is present on `users/{uid}`, `AuthContext` calls:

```js
getTenant(tenantId)
setCurrentTenantId(tenantId)
```

If `tenantId` is missing or null:

- `currentTenant` is set to `null`.
- `multiTenantService.clearCurrentTenantId()` is called.
- tenant-scoped services cannot safely write or read tenant subcollections.

`App.jsx` derives tenant ID for some admin pages like this:

```js
const tenantId = typeof currentTenant === "string" ? currentTenant : currentTenant?.id;
```

However, `App.jsx` renders Customer Portal as:

```js
case "customer-portal": return <CustomerPortal />;
```

No tenant ID or customer ID is passed into `CustomerPortal`.

## Current Customer Lookup Flow

`CustomerPortal.jsx` currently does not call `useAuth()`.

Current behavior:

- It does not read `user`.
- It does not read `userProfile`.
- It does not read `tenantId`.
- It does not read `currentTenant`.
- It does not resolve `customerId`.
- It calls `getQuotes()` with no tenant ID.

`crmService.getQuotes(tenantId)` aliases to `getLeads(tenantId)`, and `getLeads` returns an empty array if tenant ID is missing.

`customerPortalService.js` has a useful read model, but it requires both values up front:

```js
getCustomerPortalData(tenantId, customerId)
```

It loads:

- `tenants/{tenantId}/customers/{customerId}`
- matching leads by `customerId`
- matching jobs by `customerId`
- matching invoices by `customerId`
- matching contracts by `customerId`

There is no current service that resolves the signed-in Firebase auth user to a tenant customer record. Searches found no existing production code using `authUid` on customer records outside the new mapper.

## Existing Lead And Quote Services Found

### `crmService.js`

Existing compatibility API:

- `saveLead(tenantId, formData, estimate, aiAnalysis)`
- `saveQuote(tenantId, formData, estimate, aiAnalysis)`
- `getQuotes(tenantId)`
- `getLeads(tenantId)`
- `bookLead(tenantId, id, booking)`
- `setLeadStatus(tenantId, id, status)`
- `deleteLead(tenantId, id)`

`saveQuote` is an alias for `saveLead`.

### `core/leads/leadService.js`

Tenant-scoped core service:

- `getLeads(tenantId)`
- `getLeadsByStatus(tenantId, status)`
- `getLeadById(tenantId, leadId)`
- `createLead(tenantId, leadData)`
- `updateLead(tenantId, leadId, leadData)`
- `updateLeadStatus(tenantId, leadId, status)`
- `deleteLead(tenantId, leadId)`
- `convertLeadToCustomer(tenantId, leadId)`

`createLead` writes to:

```text
tenants/{tenantId}/leads/{leadId}
```

It adds schema version and sets:

```js
{
  ...leadWithVersion,
  status: "new",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
}
```

There is no separate `createQuoteRequest` service yet.

### Existing `quotes` collection

Firestore rules mention:

```text
tenants/{tenantId}/quotes/{quoteId}
```

The app currently treats quotes as leads in `crmService.getQuotes` and `crmService.saveQuote`. Owner/admin views are already wired around `leads`, not a separate quote request collection.

## Current Firestore Collection Patterns

Tenant-scoped collections in current services/rules include:

```text
tenants/{tenantId}/customers
tenants/{tenantId}/leads
tenants/{tenantId}/quotes
tenants/{tenantId}/bookings
tenants/{tenantId}/jobs
tenants/{tenantId}/properties
tenants/{tenantId}/payments
tenants/{tenantId}/employees
```

Indexes already mention collection groups for `properties` and `customers`, including `tenantId` and `customerId` fields.

## Firebase Rules Findings

There are two local Firestore rules files:

- `cloud-functions/firestore.rules`
- `shared/firestore.rules`

`cloud-functions/firebase.json` references:

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  }
}
```

That means deployments from `cloud-functions` would use `cloud-functions/firestore.rules`.

### `cloud-functions/firestore.rules`

This file is very permissive for beta/testing:

- `leads`: any authenticated user can read/create/update/delete.
- `quotes`: any authenticated user can read/create/update/delete.
- `customers`: any authenticated user can read/create/update/delete.
- `properties`: any authenticated user can read/create/update/delete.

It is marked with temporary testing comments.

### `shared/firestore.rules`

This file is more restrictive for leads and properties:

- `leads` create requires `hasTenantAccess(tenantId)`.
- `quotes` create requires `hasTenantAccess(tenantId)`.
- `properties` create requires tenant admin.
- `customers` still allows any authenticated user to read/write, with a temporary testing comment.

### Rule mismatch risk

Both rules files rely on helper functions that check tenant documents:

```js
request.auth.uid in tenants/{tenantId}.adminUsers
request.auth.uid in tenants/{tenantId}.users
```

But `tenantService.createTenant` did not show `adminUsers` or `users` arrays being created. It stores a `limits.users` number, not a membership list.

That means `hasTenantAccess(tenantId)` may fail unless some other setup path writes those arrays.

## Answers To The Readiness Questions

### 1. How does CustomerPortal know the current customer?

It currently does not. `CustomerPortal.jsx` does not call `useAuth`, does not receive a `customerId` prop, and does not load a customer record.

### 2. How does CustomerPortal know the current tenant?

It currently does not. `App.jsx` renders `<CustomerPortal />` without passing tenant ID. `CustomerPortal.jsx` calls `getQuotes()` without tenant ID, so tenant-scoped quote loading cannot work correctly.

### 3. Does a customer login map to a customer record?

Not reliably today. Firebase Auth maps to `users/{uid}`, but there is no implemented resolver from `users/{uid}` to `tenants/{tenantId}/customers/{customerId}`.

The new mapper supports an `authUid` field, but no existing customer service currently queries customers by `authUid`.

### 4. Is there an existing tenant-scoped lead or quote request collection?

Yes, tenant-scoped leads exist:

```text
tenants/{tenantId}/leads/{leadId}
```

There is also a `quotes` collection in rules, but existing app services treat quotes as leads.

### 5. Is there an existing createLead/createQuote/createQuoteRequest service?

Yes for leads:

- `core/leads/leadService.createLead(tenantId, leadData)`
- `crmService.saveLead(tenantId, formData, estimate, aiAnalysis)`
- `crmService.saveQuote(...)`, aliasing `saveLead(...)`

No dedicated `createQuoteRequest` service exists yet.

### 6. Are customer portal users allowed to write quote requests under current rules?

It depends which local rules file is deployed.

If `cloud-functions/firestore.rules` is deployed, any authenticated user can currently write to `leads`; this is permissive and not ownership-safe.

If `shared/firestore.rules` is deployed, the user must pass `hasTenantAccess(tenantId)` for leads. Customer users created by the current login flow may not have `tenantId`, and tenant documents may not include the `users` membership array expected by rules.

Either way, rules are not ready for a production-safe Customer Portal quote write because they do not clearly enforce "customer can create/read only their own quote requests."

### 7. Should quote requests save to `tenants/{tenantId}/leads`, `tenants/{tenantId}/quoteRequests`, or another collection?

Recommended beta path:

```text
tenants/{tenantId}/leads/{leadId}
```

Reason:

- Existing admin dashboard and CRM flows already read leads.
- `crmService.saveQuote` already aliases to `saveLead`.
- `leadService.createLead` is already tenant-scoped.
- It avoids adding a new collection before beta workflow is stable.

Do not use a new `quoteRequests` collection yet unless admin review UI is also updated to read it.

### 8. What fields are required to avoid breaking owner/admin views?

Owner/admin views expect the legacy lead shape to exist.

Required compatibility fields:

```js
{
  status: "new",
  formData: {
    fullName,
    phone,
    email,
    address,
    cleaningType,
    frequency,
    bedrooms,
    bathrooms,
    squareFootage
  },
  estimate: {
    priceLow,
    priceHigh,
    laborHours
  },
  aiAnalysis: null,
  booking: null,
  createdAt,
  updatedAt
}
```

Recommended additional quote-intake fields:

```js
{
  type: "quote_request",
  source: "customer-portal",
  customerId,
  propertyId,
  createdByAuthUid,
  customerSnapshot,
  propertySnapshot,
  requestSnapshot,
  review: {
    requiresOwnerReview: true,
    reviewReason,
    reviewedBy: null,
    reviewedAt: null,
    ownerNotes: ""
  },
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

Avoid saving a quote request with `estimate` missing entirely. `Dashboard.jsx` directly reads `lead.estimate.priceLow`, `lead.estimate.priceHigh`, and `lead.estimate.laborHours`.

Safe placeholder estimate for request-only records:

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

### 9. What security/rule concerns exist?

Main concerns:

- Customer Portal cannot safely write without a reliable `tenantId`.
- Customer Portal cannot safely write without a reliable `customerId`.
- First-time customer auth currently creates `tenantId: null`.
- No customer record lookup by `authUid` exists.
- Deployed rule source should be confirmed because `cloud-functions` and `shared` rules differ.
- Current permissive rules are useful for testing but too broad for production.
- Existing tenant rule helpers expect `tenant.adminUsers` and `tenant.users` arrays, but tenant creation does not clearly populate them.
- Customers should not be able to update/delete arbitrary leads.
- Customers should not be able to read all tenant leads.
- Customers should not be able to write admin-only fields such as `status`, `booking`, `reviewedBy`, final estimate approval, or payment status.
- Saved property profile writes need ownership rules before enabling them.

### 10. What is the safest persistence implementation plan?

Use a staged plan.

## Recommended Persistence Path

For the first persistence pass, save quote requests to:

```text
tenants/{tenantId}/leads/{leadId}
```

Do not create real bookings yet. Do not write to payments. Do not write to Stripe. Do not create a new `quoteRequests` collection yet.

## Recommended Write Shape

Use the mapper output to build both legacy-compatible and new snapshot fields:

```js
{
  type: "quote_request",
  source: "customer-portal",
  status: "new",

  customerId,
  propertyId: null,
  createdByAuthUid: user.uid,

  formData: {
    fullName,
    email,
    phone,
    address,
    cleaningType,
    frequency,
    bedrooms,
    bathrooms,
    squareFootage,
    preferredDate,
    preferredTime
  },

  estimate: {
    priceLow: 0,
    priceHigh: 0,
    laborHours: 0,
    appointmentDuration: null,
    aiEnhanced: false,
    requiresReview: true,
    status: "pending_owner_review"
  },

  aiAnalysis: null,
  booking: null,

  customerSnapshot,
  propertySnapshot,
  requestSnapshot,

  review: {
    requiresOwnerReview: true,
    reviewReason: "Customer Portal quote request needs owner review",
    reviewedBy: null,
    reviewedAt: null,
    ownerNotes: ""
  },

  appointmentRequest,

  createdAt,
  updatedAt
}
```

## Required Fields

Before writing:

- `tenantId`
- `user.uid`
- `customerId`
- `formData.fullName` or at least email/name fallback
- `formData.email`
- `formData.phone` if available
- `formData.cleaningType`
- `formData.bedrooms`
- `formData.bathrooms`
- `formData.squareFootage`
- `estimate.priceLow`
- `estimate.priceHigh`
- `estimate.laborHours`
- `customerSnapshot`
- `propertySnapshot`
- `requestSnapshot`

## Recommended Tests

Add tests before or with persistence:

1. Service payload builder creates a legacy-compatible lead shape.
2. Missing tenant ID blocks persistence before calling Firestore.
3. Missing customer ID blocks persistence before calling Firestore.
4. Missing auth user blocks persistence before calling Firestore.
5. Customer Portal passes mapper output into the persistence payload builder.
6. Persistence service calls `createLead(tenantId, payload)` with a mocked Firestore path.
7. Existing mapper snapshot immutability tests remain passing.
8. Dashboard compatibility test confirms quote-request leads include `formData` and `estimate` defaults.

Do not make tests depend on live Firebase.

## Required Implementation Phases

### Phase 1: Identity diagnosis cleanup

Do not write data yet.

- Update Customer Portal to call `useAuth`.
- Display or log no sensitive data.
- Confirm the visible user has `tenantId`.
- Confirm whether a matching customer record exists.

### Phase 2: Customer resolver

Add a pure/read-only resolver service:

- Inputs: `tenantId`, `user.uid`, `user.email`.
- Preferred lookup: customer where `authUid == user.uid`.
- Fallback lookup: customer where `email == user.email`.
- If no match, return a clear "customer profile required" result.

Do not create customer records automatically yet unless rules and UX are approved.

### Phase 3: Persistence payload builder

Add a pure helper that converts `quoteRequestDraft` to a legacy-compatible lead payload.

No Firestore writes in this phase.

### Phase 4: Persistence service

Add a small service like:

```js
submitCustomerPortalQuoteRequest({ tenantId, user, customer, quoteRequestDraft })
```

This should:

- Validate tenant/customer/auth inputs.
- Build the lead payload.
- Call `createLead(tenantId, payload)`.
- Return a standardized result.

### Phase 5: UI submit

Only after the above:

- Enable a real submit button.
- Keep preview step.
- Show success/error.
- Do not create bookings.

### Phase 6: Rules hardening

Before production:

- Customers can create quote requests only for their own `customerId`.
- Customers can read only their own quote requests.
- Customers cannot update admin-only fields.
- Customers cannot delete quote requests.
- Admins can review/update status.
- Property profile writes are scoped to owned customer/property records.

## Whether Firebase Rules Must Change

Yes before production-safe persistence.

For local/beta testing, the currently referenced `cloud-functions/firestore.rules` may allow authenticated users to write leads, but it is too broad and temporary. The stricter `shared/firestore.rules` may block customer writes unless tenant membership arrays exist and are populated.

Before enabling persistence broadly, rules need an ownership model for:

- `users/{uid}.tenantId`
- `tenants/{tenantId}/customers/{customerId}.authUid`
- customer-owned lead/quote request creation
- admin-only lead status/review updates

## Whether Backend Changes Are Needed

Not necessarily for the first beta persistence write if:

- Customer identity is resolved client-side.
- Firebase rules safely allow customer-owned lead creation.
- The app writes only tenant-scoped `leads`.

Backend/cloud function changes may be safer later for:

- Customer invitation/onboarding.
- Assigning `tenantId` to customer users.
- Creating customer records with `authUid`.
- Enforcing immutable quote snapshots server-side.
- Preventing clients from spoofing customer/tenant ownership.

## Exact Next Implementation Prompt

Use this as the next focused task:

> You are working in `C:\Users\merce\Documents\SLAI_Real\ServicesOS\servicesos-web`.
>
> Goal: Add read-only Customer Portal tenant/customer identity resolution before quote request persistence.
>
> Scope:
> - Do not write quote requests yet.
> - Do not change Firebase rules yet.
> - Do not change auth behavior.
> - Do not touch Stripe, backend/cloud functions, routing, tenant data model, or Tap to Pay.
>
> Tasks:
> 1. Update `CustomerPortal.jsx` to read `user`, `userProfile`, `tenantId`, and `currentTenant` from `useAuth`.
> 2. Add or use a read-only helper that attempts to resolve the signed-in customer by `authUid` first, then email, within `tenants/{tenantId}/customers`.
> 3. If `tenantId` is missing, show a clear non-blocking message that quote persistence needs a tenant-linked customer account.
> 4. If no customer record is found, show a clear message that a customer profile must be linked before saved quote requests can be enabled.
> 5. Keep the Request Quote preview in memory only.
> 6. Add tests for the resolver with mocked Firestore calls if existing test patterns support it safely.
> 7. Run `npm run lint`, `npm run test -- --run`, and `npm run build`.

## Summary Recommendation

Do not add Firestore writes yet.

The safest next step is read-only identity resolution in Customer Portal. Persistence should wait until the app can reliably answer:

- Which tenant is this customer attached to?
- Which `customers/{customerId}` record belongs to this auth user?
- Which rules file is deployed?
- Do rules enforce own-customer quote request creation only?
