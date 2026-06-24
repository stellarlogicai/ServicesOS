# ServicesOS Admin-Side Beta Readiness Audit

Date: June 23, 2026

## Wife-Beta Navigation Hardening Status

Implemented after the audit.

Visible to business admins:

1. Dashboard
2. Create estimate

Dashboard is now the default admin landing page and remains the combined leads/quote-request review surface.

Hidden from business-admin navigation without deleting route files:

- Customers: the page renders, but CRUD has not passed a manual test against the required `adminUsers` membership contract.
- Customer Portal: customer-only language and identity requirements are inappropriate for an admin tool.
- Staff Scheduling: the page renders, but employee/job writes are not manually verified for wife beta.
- Route Optimization: depends on employee, booking, coordinate, and route-write behavior that is not beta-ready.
- Calendar: was mounted without its required tenant ID and displayed a misleading empty calendar.
- Payment Links: was mounted without tenant ID and invokes unverified payment behavior.
- Insurance: currently fails to load under the tested rules/data contract.
- Data Export: was mounted without tenant ID and exposes broad unfinished import/operations tooling.
- Backup: only handles browser localStorage and does not represent Firestore business data.
- Settings: exposes broad unverified configuration, integration, Stripe Connect, booking, and payment surfaces.

The components remain available for focused future hardening. Customer-role access to Customer Portal is unchanged.

The Dashboard's fake SMS preview/send controls were removed. Booking behavior was not changed. `New today` was renamed to `New leads` because the value counts all records with `status === "new"`. The Create Estimate result keeps its existing payment implementation but hides the payment entry point for the wife-beta admin surface.

## Scope And Method

This audit covers the business admin/owner experience in `servicesos-web`.
It is an inspection and safety-net pass, not a broad implementation pass.

Evidence used:

- Clean Git worktree at audit start.
- Baseline lint, 85 tests, and production build passed.
- Static inspection of `App.jsx`, active `AuthContext`, admin components, services, and Firestore rules.
- Manual browser navigation through every admin-visible sidebar item using the current test business admin and tenant.
- No Stripe, payment, backend, cloud-function, Firebase-rule, customer quote submission, or broad routing changes were made.

## Current Confirmed Working Flows

- Test business admin authentication and tenant loading.
- Onboarding renders without a Router crash.
- Onboarding completion persists to `users/{uid}.onboardingCompleted`.
- Completed admin skips onboarding and reaches the authenticated app after reload/sign-in.
- Customer Portal quote requests submit and appear in admin-visible lead data.
- Quote requests do not create bookings or payments.
- Dashboard loads tenant-scoped leads and displays snapshot-aware quote-request data.
- Admin can open the lead table and the current test tenant's lead data is visible.
- Customer-side quote request regression tests remain green.

## Role Model

The official business owner role in the active code is currently:

```text
admin
```

The active runtime recognizes:

- `customer`
- `admin`
- `super-admin`

`owner` and `business_owner` are not recognized as business-account roles by active `App.jsx` or `AuthContext.jsx`. The word `owner` appears in workflow copy and employee-role options, but it is not an authenticated owner role. `ownerId` is not read by the active app or current rules.

For wife beta, use `role: "admin"` consistently. Introducing a renamed role now would be a broad auth/routing change and should be deferred.

## Admin Route Inventory

| Sidebar item | Component | Status | Audit notes |
| --- | --- | --- | --- |
| New quote | `AIPhotoEstimateSystem` | Partially working; dangerous before beta | Real intake and quote persistence exist. The result screen exposes `Proceed to Payment`, and generation calls email/SMS services. The label says "New quote" while the screen says "New Quote Request." Keep only after a narrow owner-estimate workflow review. |
| Dashboard | `Dashboard` | Partially working | Real leads load. Snapshot display works. Booking/status/delete actions mutate data. SMS is a preview stub that alerts "In production." "New today" counts all `status === "new"` records, not records created today. |
| Leads / quote review | Inside `Dashboard` | Partially working; beta-critical | Owner can see quote requests and lead detail. Pending requests are displayed correctly. The action model still mixes lead review, quoting, booking, delete, and fake SMS in one surface. |
| Customers | `CustomerManagement` | Partially working / possible access issue | CRUD code is tenant-scoped, but the current tenant displayed no customers. Leads do not automatically become customer records, and the form has no `authUid` linking field. Strict rules may require admin membership for writes depending on deployed rules. |
| Customer portal | `CustomerPortal` | Confusing/misleading; not needed for admin beta | Admin sees customer-only language, an unlinked customer warning, customer quote cards, booking, and appointments. This should not be presented as an admin tool for wife beta. |
| Staff scheduling | `StaffScheduling` | Partially working / permission-sensitive | Tenant ID is passed. Employees and jobs are Firestore-backed. The current tenant showed no employees/jobs. The UI calls jobs "shifts" and allows admin check-in/check-out. Strict writes require `adminUsers`. |
| Route optimization | `RouteOptimization` | Placeholder-like; dangerous to rely on | Firestore-backed but requires employee and booking coordinate data. Defaults the start location to New York City (`40.7128, -74.0060`), which is wrong for the current Missouri-oriented product. Applying a route writes booking documents. Defer. |
| Calendar | `CalendarView` | Broken wiring / misleading empty state | `App.jsx` renders it without the required `tenantId`, so loaders return early and the calendar silently appears empty. |
| Payment links | `PaymentLinks` | Broken wiring; dangerous; defer | `App.jsx` omits required `tenantId`. The page directly invokes Stripe checkout and writes `payment_links`. It should not be visible until payment testing is explicitly resumed. |
| Insurance | `InsuranceTracking` | Broken / permission issue | Tenant ID is passed, but the browser showed "Failed to load insurance information." Current rule files have no explicit `insurance` subcollection rule, so access is denied under those rules. |
| Data export | `DataExport` | Broken wiring; placeholder/toolbox; dangerous | `App.jsx` omits required `tenantId`. The page exposes many imports and operational actions, including payment/invoice creation, tracking, migrations, and integrations. Several import handlers pass empty arrays. This is not a beta-ready export screen. |
| Backup | `BackupPanel` | Misleading; dangerous | Backs up selected browser `localStorage` keys, not tenant Firestore data. It reported zero leads while Dashboard showed real leads. "Clear All Data" clears local browser data, not the business database. Remove from beta navigation. |
| Settings | `CompanySettings` | Partially working; confusing; permission-sensitive | Branding/config UI renders. It exposes 11 tabs, Stripe Connect, booking/payment, integrations, legal, reviews, and import/export. Branding is stored under a subcollection without an explicit rule in current rules files. Most settings are not confirmed to drive real workflows. |
| Onboarding | `ImprovedOnboarding` | Partially working | Progress and completion are stable. Completion persists. However, company, payment, branding, service, employee, and import choices collected by the wizard are not persisted by the final completion action. Treat the wizard as a completion gate, not a verified setup workflow. |

## Role And Permission Guards

- `NAV_ITEMS` checks both role membership and optional permission strings.
- `AuthenticatedApp.renderPage()` repeats the access check before rendering.
- Active admin permissions include lead, booking, staff, settings, and dashboard capabilities.
- `ProtectedRoute.jsx` exists but the current app uses an internal page-state router instead of route components.
- Super-admin-only Tenant Management and AI Training are correctly hidden from an `admin`.
- The current default admin page is `intake`, not Dashboard.

## Broken Items

1. Calendar is mounted without `tenantId` and silently shows no tenant bookings.
2. Payment Links is mounted without `tenantId`.
3. Data Export is mounted without `tenantId`.
4. Insurance load fails under the current test account/rule contract.
5. Settings branding persistence is likely denied under the checked rule files because no branding subcollection rule exists.
6. Dashboard insurance banner action writes `window.location.hash`, but app navigation is state-based, so it does not open the Insurance page.
7. Onboarding inputs are not persisted even though the UI implies full business setup.

## Confusing Or Misleading Content

- Admin sidebar includes `Customer portal`, but that component is written for customers.
- Admin Customer Portal reports the owner account is not linked as a customer.
- `New quote` navigation opens a screen titled `New Quote Request`.
- Dashboard says `New today`, but the value is all new-status leads.
- Dashboard SMS action is a nonfunctional production placeholder.
- Calendar looks valid while receiving no tenant ID.
- Backup claims to back up business data but only handles browser localStorage.
- Data Export is labeled as a focused utility but contains migrations, AI imports, payments, invoices, messaging, mileage, rewards, and live tracking.
- Settings presents configuration as operational even when persistence or downstream usage is unverified.
- Staff Scheduling mixes jobs, shifts, and employee time-status actions.

## Placeholder Or Defer Items

Defer from wife beta navigation:

- Customer Portal for admins
- Route Optimization
- Payment Links
- Insurance until rules/data contract are confirmed
- Data Export
- Backup
- Most Settings tabs
- SMS send action
- Onboarding payment/import steps as functional setup

Dangerous to touch before beta without a dedicated task:

- Stripe/Stripe Connect/payment surfaces
- Booking mutation behavior
- Broad Firebase rules
- Backup restore/clear behavior
- Data import/migration operations
- Route writes to booking documents

## Beta Blockers

1. Establish a valid test admin membership contract: the admin UID must be in `tenants/{tenantId}.adminUsers`.
2. Reduce the admin sidebar to verified core workflows so placeholder and payment surfaces cannot be mistaken for production-ready tools.
3. Make Dashboard the admin landing page and clarify owner quote-request review terminology.
4. Separate pending quote review from confirmed booking actions and remove fake SMS affordances from the beta surface.
5. Decide whether wife beta includes Customers and Scheduling. If yes, verify CRUD with the real test tenant and deployed rules.
6. Fix or hide Calendar until it receives tenant context and displays real bookings.
7. Hide Insurance, Data Export, Backup, Settings integrations, and payment surfaces until each has an explicit data/rules/manual-test contract.

## Safe Quick Fixes

These are narrow, low-risk candidates for the next implementation pass:

- Change the admin default page from New Quote to Dashboard.
- Hide Customer Portal from admin/super-admin navigation while preserving it for customers.
- Hide Payment Links, Route Optimization, Data Export, Backup, and Insurance from wife-beta admin navigation.
- Rename `New quote` to `Create estimate` or another agreed owner-facing term.
- Rename `New today` to `New leads`, unless date filtering is implemented.
- Hide or label the SMS preview as unavailable.
- Pass `tenantId` into Calendar only if Calendar remains in the beta sidebar.
- Add an admin route-inventory test matching the approved beta sidebar.

## Fix Later

- Formal owner/customer invitation and linking.
- Persist onboarding business configuration or replace the wizard with a truthful checklist.
- Real messaging integration.
- Route geocoding, service-area start location, and route validation.
- Firestore-backed backup and restore with tenant isolation.
- Production-grade data import/export.
- Insurance and branding rules/data contracts.
- Settings decomposition into verified operational sections.
- Role-name migration from `admin` to another term, if ever desired.

## Original Recommended Wife-Beta Sidebar

Recommended initial sidebar:

1. Dashboard
2. Quote Requests / Leads
3. Create Estimate
4. Customers, only after tenant CRUD passes manually
5. Schedule, only after employee/job CRUD passes manually
6. Calendar, only after tenant wiring and booking display pass
7. Business Settings, limited to verified fields
8. Sign out

Hide for wife beta:

- Customer Portal
- Route Optimization
- Payment Links
- Insurance
- Data Export
- Backup
- Unverified Settings tabs

The current app combines Dashboard and Leads. For the smallest beta change, keep one `Dashboard` item and make lead review its primary content instead of adding a new route.

The implemented sidebar is narrower than this original recommendation. Customers, Scheduling, Calendar, and Settings remain hidden until their tenant wiring, permission contract, and manual workflows pass.

## Required Firestore Test Admin Fields

### `users/{uid}`

Required:

```js
{
  uid: "<firebase-auth-uid>",
  email: "fake-owner@example.test",
  displayName: "Beta Business Owner",
  role: "admin",
  tenantId: "<test-tenant-id>",
  status: "active",
  onboardingCompleted: true
}
```

Notes:

- `role` must currently be `admin`.
- `tenantId` must exactly match the tenant document ID.
- `status: "suspended"` forces sign-out.
- `onboardingCompleted` is read from the user profile, with tenant-level completion retained as a compatibility fallback.

### `tenants/{tenantId}`

Minimum useful tenant document:

```js
{
  id: "<test-tenant-id>",
  businessName: "ServicesOS Beta Cleaning Test",
  businessEmail: "fake-owner@example.test",
  businessPhone: "555-0100",
  status: "active",
  subscriptionTier: "free",
  users: ["<admin-auth-uid>"],
  adminUsers: ["<admin-auth-uid>"]
}
```

Notes:

- `users` permits tenant reads through `isTenantUser`.
- `adminUsers` is required for tenant-admin updates and many strict-rule writes.
- Include the admin UID in both arrays for the current rule helpers.
- `ownerId` is not currently required or read by the active app/rules. It may be recorded for future ownership semantics, but it does not replace `adminUsers`.
- Current `tenantService.createTenant()` does not initialize the membership arrays; manual beta setup must verify them.

### Tenant subcollections

Depending on enabled beta features:

- `tenants/{tenantId}/leads`
- `tenants/{tenantId}/customers`
- `tenants/{tenantId}/employees`
- `tenants/{tenantId}/jobs`
- `tenants/{tenantId}/bookings`

Avoid creating payment data for this audit.

## Actions Likely To Fail Without `adminUsers`

Under the stricter checked rules, missing `adminUsers` can block:

- Updating or deleting leads and quotes
- Creating, updating, or deleting bookings
- Creating, updating, or deleting jobs
- Employee writes
- Appointment writes
- Route Optimization apply/reset writes
- Tenant document updates
- White-label and upsell administration

Read-only pages may still work when the UID is in `users`, which can make the account look healthy until the first write.

Additional current rule gaps:

- No explicit rules were found for `insurance`, `branding`, or `payment_links` subcollections.
- The two checked rules files differ in permissiveness, so deployed-rule identity must be confirmed before relying on either one.

## Completed First Actual Fix

The narrow wife-beta admin navigation and terminology pass is complete:

1. Dashboard is the default admin page.
2. Customer Portal and unverified/deferred tools are hidden from admin navigation.
3. Customer-role access to Customer Portal is unchanged.
4. The owner intake item is labeled `Create estimate`.
5. Focused tests protect the approved admin sidebar and Dashboard landing page.

No payment service, backend, rule, tenant-loading, or customer quote-submission behavior was changed.

## Recommended Next Codex Fix Prompt

```text
You are working in ServicesOS.

Use docs/servicesos-beta/ADMIN_SIDE_DEBUG_AUDIT.md as the source of truth.

Perform only the wife-beta Dashboard and quote-request review hardening:
- Verify the test admin UID exists in both tenants/{tenantId}.users and adminUsers.
- Do not change Firebase rules.
- Manually test lead status updates and booking conversion with fake data.
- Make pending quote-request review actions explicit and distinct from confirmed booking actions.
- Preserve Customer Portal quote submission.
- Do not touch Stripe, payments, backend functions, hidden routes, or customer linking.
- Add focused tests for pending quote review and approved booking conversion behavior.

Run lint, tests, and build. Commit only if all pass.
```
