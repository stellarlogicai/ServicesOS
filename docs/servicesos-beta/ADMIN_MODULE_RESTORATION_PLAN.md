# ServicesOS Admin Module Restoration Plan

Date: June 23, 2026

## Purpose

This document defines the controlled restoration of hidden admin modules after wife-beta navigation was narrowed to the stable core. Modules return one at a time only after their tenant wiring, data contract, permission behavior, tests, and manual workflow pass.

This plan does not authorize changes to Stripe, payments, backend functions, Firebase rules, authentication, or routing architecture.

## Current Stable Baseline

The current business-admin sidebar contains:

1. Dashboard
2. Create estimate

Confirmed behavior:

- Admin authentication and tenant loading work.
- Completed onboarding persists and does not repeat after sign-in.
- Dashboard is the admin landing page.
- Customer Portal quote submission works.
- Quote requests are stored at `tenants/{tenantId}/leads/{leadId}`.
- Pending requests display snapshot-aware customer, property, and request data.
- Pending appointment preferences are not labeled as confirmed bookings.
- `Approve / Create Booking` creates `tenants/{tenantId}/bookings/{bookingId}` and updates the source lead atomically.
- Booking conversion does not create payment records or invoke Stripe.
- Deferred Insurance and AI-credit reads no longer run from Dashboard.
- Current baseline validation is lint, 89 tests, and production build passing.

Dashboard remains the combined lead and quote-request review surface. A separate Leads route is not required for the restoration sequence.

## Official Admin Data Contract

### User document

`users/{uid}` must contain:

```js
{
  role: "admin",
  tenantId: "<tenant-id>",
  status: "active",
  onboardingCompleted: true
}
```

The authenticated Firebase UID must match the user document ID.

### Tenant document

`tenants/{tenantId}` must contain:

```js
{
  users: ["<uid>"],
  adminUsers: ["<uid>"],
  ownerId: "<uid>" // where ownership metadata is used
}
```

Contract meaning:

- `users` grants tenant membership for tenant-scoped reads.
- `adminUsers` grants administrative writes under the intended strict rule model.
- `ownerId` identifies the primary business owner where applicable, but does not replace `users` or `adminUsers`.
- The active app and checked rules do not currently enforce `ownerId`; it is ownership metadata for future consistency.
- Module restoration must be tested as `role: admin`, not by relying on super-admin access.

The checked Firestore rules files still contain temporary broad authenticated-user access for some collections, including Customers. That is not the acceptance contract. Restoration testing must assume tenant isolation and tenant-admin writes even though rules are not changed in this plan.

## Final Intended Admin Sidebar

Core operational navigation:

1. Dashboard
2. Create estimate
3. Customers
4. Bookings
5. Calendar
6. Staff scheduling
7. Settings

Later operational tools:

8. Payment links
9. Route optimization
10. Data export
11. Backup
12. Insurance

Optional:

13. Customer Portal preview

Navigation principles:

- Dashboard continues to own leads and quote-request review.
- Bookings is an admin booking list/detail surface, not the customer booking form.
- Customer Portal remains customer-only unless a clearly labeled, read-only preview is added.
- Payment and future tools remain absent until explicitly resumed.
- Hiding a module is preferred to exposing a misleading or permission-noisy screen.

## Restoration Order

| Order | Module | Restoration gate |
| --- | --- | --- |
| 1 | Customers | Tenant-scoped list and CRUD pass with the official admin contract. |
| 2 | Bookings | A dedicated admin list/detail surface reads the booking records already created by quote conversion. |
| 3 | Calendar | Receives `tenantId` and accurately renders the same booking records as Bookings. |
| 4 | Settings | Reduced to verified company fields; payment, integration, and unsupported tabs remain hidden. |
| 5 | Staff scheduling | Employee CRUD and booking assignment pass without mixing jobs, shifts, and time-clock behavior. |
| 6 | Payment links | Deferred until payment and Stripe work is explicitly authorized. |
| 7 | Route optimization | Deferred until booking coordinates, employee assignment, and route-write behavior are verified. |
| 8 | Data export | Deferred until it is reduced to safe export-only behavior. |
| 9 | Backup | Deferred until it represents Firestore tenant data rather than browser localStorage. |
| 10 | Insurance | Deferred until an explicit data/rules contract exists. |
| 11 | Customer Portal preview | Optional, read-only, and clearly distinct from customer authentication. |

## Module Requirements

### Customers

**Purpose**

Provide the admin with a tenant-scoped customer directory and basic contact maintenance. It is also the future source of stable `customerId` identity for leads, bookings, properties, and Customer Portal linking.

**Required data**

- `tenants/{tenantId}/customers/{customerId}`
- Basic fields currently used by the page: `name`, `email`, `phone`, `address`, `city`, `state`, `zip`, `notes`
- `schemaVersion`, `createdAt`, and `updatedAt`
- Optional linking fields already used elsewhere: `authUid`
- Stable references used by current flows: `customerId` on leads and bookings
- Future property relationship: `propertyId` or tenant-scoped properties

**Known risks**

- Current UI does not expose or preserve `authUid`.
- Customer Portal identity resolves by `authUid`, then email; duplicate email records can create ambiguous linkage.
- Customer quote requests already reference a customer record and carry `customerSnapshot`; deleting that customer may orphan the live relationship while historical snapshots remain.
- Current manual admin-created leads do not automatically create or link customer records.
- The UI uses `name`, while quote snapshots primarily use `fullName`.
- The service orders by `name`; records without that field may sort or query inconsistently.
- Delete has no dependency check for leads, bookings, properties, or portal identity.
- Checked rules contain temporary broad customer access and do not represent the intended tenant-admin write policy.
- Load failures are logged but the page falls through to an empty-state presentation, which can misrepresent a permission error as “No customers found.”
- The page has no focused component or service tests.

**Acceptance criteria**

- Admin can list only the active tenant's customers.
- Loading, empty, permission/error, and populated states are distinct.
- Admin can add and edit a basic customer without losing existing linkage fields.
- Delete is either dependency-aware or disabled for linked customers in the first restored version.
- Search works for name, email, phone, and address.
- Existing linked customer records remain compatible with Customer Portal identity resolution.
- Existing quote requests and bookings remain unchanged.
- No customer from another tenant can be read or mutated.
- No payment, Stripe, invitation, or automatic account-linking behavior is added.

**Tests needed**

- Customer service path construction and tenant ID validation.
- Customer list render, empty state, and explicit error state.
- Add and edit submit the expected tenant-scoped payload.
- Edit preserves non-form linkage metadata such as `authUid`.
- Delete guard for linked records or confirmation of the chosen first-version policy.
- Search filtering.
- Admin navigation test showing Customers only after restoration.
- Customer Portal identity regression for `authUid` and email lookup.
- Manual CRUD test with a normal admin whose UID is in tenant `users` and `adminUsers`.

### Bookings

**Purpose**

Give admins a canonical list and detail view for approved appointments created by quote conversion.

**Required data**

- `tenants/{tenantId}/bookings/{bookingId}`
- `leadId`, `sourceLeadId`, `customerId`, `propertyId`
- Customer, property, request, and appointment snapshots
- `date`, `startTime`, `endTime`, `scheduledAt`
- `status`, `agreedPrice`, `notes`, `createdBy`, timestamps

**Known risks**

- No dedicated admin Bookings component currently exists.
- Dashboard exposes booking details only through the source lead.
- Existing scheduling code calls bookings “jobs” and uses the `JOB` schema version.
- Older booking records may lack snapshots, lead links, employee assignment, or consistent date fields.
- Mutating booking status can desynchronize the source lead unless a clear ownership rule is defined.

**Acceptance criteria**

- Read-only tenant-scoped booking list is restored first.
- Records created by quote conversion appear with correct customer, schedule, price, and status.
- Legacy records degrade cleanly when snapshot fields are missing.
- Detail view links back to source lead when available.
- No payment status is inferred from booking status.
- Mutating, cancellation, and assignment controls remain hidden until separately tested.

**Tests needed**

- Booking selectors for snapshot and legacy fields.
- Tenant-scoped list loading and error states.
- Converted booking render test.
- Missing-field fallback test.
- Cross-tenant service path test.
- Regression test for quote conversion document shape.

### Calendar

**Purpose**

Provide date-based visualization of tenant bookings.

**Required data**

- `tenants/{tenantId}/bookings`
- `date`, `startTime`, `endTime`, `status`
- Optional employee assignment from `tenants/{tenantId}/employees`

**Known risks**

- `App.jsx` currently renders `CalendarView` without its required `tenantId`.
- Calendar queries require compatible indexes for date and start-time ordering.
- Missing employee assignments currently render as `Unknown`.
- Date parsing and UTC/local-date behavior can move bookings to the wrong day.
- Calendar should not become a second booking mutation path in its first restoration.

**Acceptance criteria**

- `tenantId` is passed explicitly.
- Calendar and Bookings show the same records and dates.
- Empty and load-error states are distinct.
- Month/day/week views do not crash with zero bookings.
- Initial restoration is read-only.

**Tests needed**

- Route wiring test for `tenantId`.
- Date-bucket and timezone tests.
- Empty, populated, and query-error component tests.
- Manual comparison against a booking created from Dashboard.

### Settings

**Purpose**

Maintain a small set of verified business identity and operational preferences.

**Required data**

- Tenant document fields for verified company information
- Current branding path: `tenants/{tenantId}/branding/config`
- Storage path for branding assets if uploads are retained

**Known risks**

- Current component exposes eleven tabs and includes Stripe Connect, booking/payment, integrations, legal, reviews, and broad feature settings.
- Branding rules are not explicit in the checked rules files.
- `brandingConfig` defaults can look persisted when they are only local fallback data.
- File upload permissions and downstream use are unverified.
- One save action writes a large mixed settings object.

**Acceptance criteria**

- First restoration exposes only fields that persist and visibly affect the app.
- Payment, Stripe Connect, integrations, import/export, and unsupported tabs stay hidden.
- Load and save permission errors are explicit.
- Tenant isolation is maintained.

**Tests needed**

- Allowed-tab inventory test.
- Verified field load/save tests.
- Error-state tests.
- Manual persistence check after refresh and sign-in.

### Staff Scheduling

**Purpose**

Manage employees and assign staff to existing bookings.

**Required data**

- `tenants/{tenantId}/employees/{employeeId}`
- `tenants/{tenantId}/bookings/{bookingId}`
- Employee status and contact fields
- Booking employee assignment and schedule fields

**Known risks**

- Current `StaffScheduling` creates new booking documents while labeling them shifts.
- It mixes employee CRUD, job creation, scheduling, and check-in/check-out concepts.
- It can duplicate the approved booking path instead of assigning existing bookings.
- Employee and booking writes require tenant-admin authority under the intended contract.
- No conflict detection is enforced in the visible workflow.

**Acceptance criteria**

- Employee directory and booking assignment are separated.
- First restoration assigns active employees to existing bookings rather than creating duplicate jobs.
- Schedule conflicts and unassigned states are visible.
- Time-clock behavior is excluded.

**Tests needed**

- Employee CRUD service tests.
- Active employee filtering.
- Booking assignment tests.
- Conflict and missing-employee display tests.
- Manual create/edit/assign test as tenant admin.

### Payment Links

**Purpose**

Create customer payment links for approved charges.

**Required data**

- Leads or bookings with customer contact and approved amount
- `tenants/{tenantId}/payment_links`
- Explicit Stripe customer/session contract

**Known risks**

- Directly invokes Stripe checkout.
- `App.jsx` currently omits `tenantId`.
- Existing lead status query does not match the current lead status model.
- Payment-link rules and webhook reconciliation are unverified.

**Acceptance criteria**

- Not restored until payment work is explicitly authorized.
- Requires end-to-end Stripe, webhook, rules, idempotency, and reconciliation testing.

**Tests needed**

- Deferred to the payment-specific project.

### Route Optimization

**Purpose**

Order assigned bookings into an efficient employee route.

**Required data**

- Tenant employees
- Assigned bookings
- Valid geocoded coordinates
- Business/service-area start location
- Route order fields on bookings

**Known risks**

- Current default start location is New York City.
- Applying or resetting a route writes booking records.
- Missing coordinates and employee assignment make output unreliable.
- External route/geocoding behavior is not production-verified.

**Acceptance criteria**

- Restore only after Staff Scheduling.
- No route write occurs without validated coordinates and explicit confirmation.
- Business start location is tenant-specific.

**Tests needed**

- Deterministic route calculation fixtures.
- Missing-coordinate handling.
- Tenant-scoped apply/reset tests.
- Manual route verification.

### Data Export

**Purpose**

Export tenant-owned operational data in a safe, understandable format.

**Required data**

- Explicitly selected tenant collections
- Stable export schema and timestamps

**Known risks**

- Current component combines export, imports, migrations, messaging, payments, invoices, time tracking, rewards, mileage, and live tracking.
- `App.jsx` currently omits `tenantId`.
- Several import handlers pass empty arrays.
- It can trigger writes and payment-related operations despite its label.

**Acceptance criteria**

- Reduce to read-only export before restoration.
- Pass `tenantId` explicitly.
- Remove or isolate every mutation/import/integration action.
- Export only documented collections.

**Tests needed**

- Collection selection and tenant-path tests.
- No-write guarantee.
- Export schema and filename tests.
- Large/empty dataset behavior.

### Backup

**Purpose**

Create and restore a recoverable tenant-data backup.

**Required data**

- Firestore tenant collections
- Backup version, manifest, checksum, and restore ownership metadata

**Known risks**

- Current implementation only backs up browser localStorage keys.
- It does not represent the Firestore data shown on Dashboard.
- Restore and clear language can mislead admins about business data.

**Acceptance criteria**

- Do not restore the current localStorage panel as an admin backup.
- Future implementation must be tenant-scoped, Firestore-backed, versioned, and restore-tested.
- Destructive restore requires explicit confirmation and auditability.

**Tests needed**

- Export/restore round trip in an isolated test tenant.
- Cross-tenant rejection.
- Version and checksum validation.
- Partial-failure recovery.

### Insurance

**Purpose**

Store business insurance policy metadata and expiration status.

**Required data**

- Current path: `tenants/{tenantId}/insurance/policy`
- Provider, policy number, coverage, expiration date, certificate URL

**Known risks**

- No explicit Insurance rule exists in the checked rules files.
- Dashboard reads were removed because they caused permission-denied noise.
- Certificate upload/storage behavior is placeholder-level.
- Insurance is not required for the current beta workflow.

**Acceptance criteria**

- Restore only after an explicit authorization and storage contract exists.
- No Dashboard eager read unless the module is enabled and authorized.
- Expiration status and persistence pass manually.

**Tests needed**

- Permission-aware load/save tests.
- Expiration date calculations.
- Missing-policy state.
- Storage upload validation if certificates are included.

### Customer Portal Preview

**Purpose**

Allow an admin to inspect customer-facing presentation without impersonating or linking the admin as a customer.

**Required data**

- A selected customer record
- Read-only quote and booking snapshots scoped to that customer and tenant

**Known risks**

- Current Customer Portal depends on authenticated customer identity.
- It contains customer actions and localStorage appointment behavior.
- Rendering it directly for admins produces misleading linking warnings.

**Acceptance criteria**

- Optional and last.
- Clearly labeled preview mode.
- Read-only by default.
- Requires explicit customer selection and cannot alter identity or submit customer actions.

**Tests needed**

- Admin preview cannot submit or mutate.
- Selected customer and tenant scoping.
- Customer-role Portal regression tests.

## First Module: Customers

### Current files

- `servicesos-web/src/components/CustomerManagement.jsx`
- `servicesos-web/src/core/customers/customerService.js`
- `servicesos-web/src/App.jsx`
- `servicesos-web/src/services/customerPortalIdentityService.js`
- `servicesos-web/src/services/customerPortalQuoteRequestMapper.js`
- `servicesos-web/src/services/customerPortalQuoteLeadPayloadBuilder.js`
- `servicesos-web/src/services/quoteBookingConversionService.js`
- `servicesos-web/src/components/CustomerPortal.jsx`
- `servicesos-web/src/services/customerPortalService.js`
- `shared/firestore.rules`
- `cloud-functions/firestore.rules`

### Current route

`App.jsx` already has:

- A `customers` navigation entry
- A `case "customers"` renderer for `CustomerManagement`

The navigation entry is currently restricted to `super-admin`, so normal business admins cannot see it. Restoration should change only that item to include `admin` after the module passes its tests and manual gate. No new router or route file is needed.

### Current data paths

Primary:

- `tenants/{tenantId}/customers/{customerId}`

Relationships:

- `tenants/{tenantId}/leads/{leadId}.customerId`
- `tenants/{tenantId}/bookings/{bookingId}.customerId`
- `customerSnapshot` retained on leads and bookings
- Customer Portal lookup by customer `authUid`, then `email`
- Future/adjacent property link through `propertyId`

The broad `customerPortalService` also references tenant leads, jobs, invoices, contracts, employees, and job completions. Those adjacent Portal features are not required to restore the admin Customers directory.

### Likely breakpoints

1. Permission failures may appear as an empty customer list because the component does not render a distinct load error.
2. Temporary broad customer rules can make CRUD appear successful without proving tenant isolation.
3. Editing through the current form can replace the service payload without preserving fields not represented by the form, including `authUid`.
4. Admin-created customer records cannot be intentionally linked to a Firebase customer account.
5. `name` and `fullName` conventions differ across customer documents and snapshots.
6. Deleting a customer does not check linked leads, bookings, properties, or Portal identity.
7. There is no duplicate email or phone handling.
8. The table is not optimized for narrow/mobile layouts.
9. There are no focused CustomerManagement or customer service tests.
10. Existing quote submission assumes a linked customer already exists; restoration must not silently invent a new invite/linking flow.

### Permission requirements

Restoration acceptance should use:

- Authenticated user profile with `role: admin`
- Matching `tenantId`
- `status: active`
- `onboardingCompleted: true`
- UID in tenant `users`
- UID in tenant `adminUsers`

Intended customer permissions:

- Read: tenant member or tenant admin
- Create/update/delete: tenant admin

The checked rule files do not currently express this safely for Customers. This pass documents the required contract only and does not modify or deploy rules.

### Smallest safe restoration plan

1. Add focused unit tests for `customerService` tenant paths and validation.
2. Add component tests for loading, populated, empty, and explicit error states.
3. Normalize display without migrating data: prefer `name`, fall back to `fullName`.
4. Preserve non-form metadata on edit, especially `authUid`, schema version, and existing linkage fields.
5. Keep account invitation/linking out of scope; display linked/unlinked status read-only if useful.
6. Disable destructive delete for any customer referenced by known leads/bookings, or defer delete entirely for the first restored version.
7. Manually test list/create/edit with the wife-beta admin and a fake customer record.
8. Verify the created customer remains after refresh and is not visible from another tenant.
9. Verify existing Customer Portal identity and quote-request tests remain green.
10. Only then add `admin` to the Customers navigation roles and update the navigation safety test.

The first restored version should be a trustworthy customer directory with safe add/edit behavior. It should not include invitations, payments, customer impersonation, bulk import, lifetime-value analytics, rewards, reviews, or automated lead-to-customer conversion.

## Definition Of Restored

A module is restored only when:

1. Its sidebar entry is intentionally enabled for `admin`.
2. It receives the correct tenant context.
3. Its data paths and write ownership are documented.
4. Error states do not masquerade as empty states.
5. Focused unit/component tests pass.
6. Existing quote submission and quote conversion regressions pass.
7. A normal tenant admin completes the manual acceptance workflow.
8. No unrelated deferred module becomes active.
9. Lint, full tests, and production build pass.
10. The restoration is committed separately for rollback clarity.
