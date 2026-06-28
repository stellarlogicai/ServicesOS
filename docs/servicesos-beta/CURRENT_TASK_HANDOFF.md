# Current Task Handoff

## Create Estimate Wife-Beta Readiness

**Status:** Code-complete; full validation passed
**Branch:** `master`
**Date:** June 27, 2026

### What Was Tested

- Authenticated admin route renders Create Estimate with payments disabled.
- Required contact fields allow the admin to reach review.
- Manual estimate calculation and save work without photos or AI.
- Optional AI rejection displays a non-blocking fallback and leaves manual save enabled.
- The admin-route save adapter passes `formData`, `estimate`, and `aiAnalysis` in the expected order.
- Manual save persists a tenant-scoped `lead` with `source: admin`, normalized Dashboard fields, an estimate range, `booking: null`, and no payment fields.
- Dashboard displays the saved manual estimate as a new lead with its price range and an explicit later Create Booking action.
- Existing pending quote review and quote-to-booking conversion regression tests remain covered.

### Beta Blockers Fixed

1. The component called the injected admin save adapter with `tenantId` as the first argument, shifting all payload arguments and risking malformed saved estimates. The adapter contract now uses `(formData, estimate, aiAnalysis)`; the default direct save path still supplies the current tenant ID internally.
2. Manual estimate saving no longer depends on successful AI/photo analysis.
3. AI failures no longer leave the UI stuck or block manual saving.
4. Missing or failed AI configuration no longer substitutes fabricated analysis that changes real estimate totals. It now enters the visible manual fallback state.
5. Required contact labels are explicitly marked and associated with their inputs.
6. Persisted manual estimates use Dashboard-compatible normalized fields and explicitly remain unbooked.

### Beta Blockers Remaining

- None found in the tested Create Estimate path.

### Beta Annoyances

- The form is long and uses dense inline styling; this is usable but not optimized for mobile or rapid owner entry.
- Estimate save triggers existing quote email/SMS notification helpers automatically. During the live walkthrough, the estimate persisted but the email request logged `[EMAIL] sendQuoteEmail failed: Failed to fetch`. This is non-blocking for estimate creation, but notification status is not visible to the admin and should be addressed before relying on automatic delivery.
- Address and appointment preference are optional, so a saved estimate may have limited operational detail.

### Future Polish / Deferred Features

- Photo upload progress, retries, richer AI diagnostics, AI-credit UX, and model/provider improvements.
- Form section compaction, responsive layout polish, draft saving, and explicit notification controls.
- Payments, Stripe, Tap to Pay, route optimization, GPS, payroll, training, React Native employee workflows, and other deferred modules remain out of scope and untouched.

### Firestore / Side-Effect Contract

- Write target: `tenants/{tenantId}/leads/{leadId}` through the existing core lead service.
- Manual records use `type: lead`, `source: admin`, `status: new`, normalized `formData`, calculated `estimate`, optional `aiAnalysis`, and `booking: null`.
- Create Estimate does not write a booking or payment. Booking remains an explicit Dashboard action.

### Exact Next Recommended Step

Begin the separately scoped Customers restoration gate: add focused tenant-path and component error-state tests, preserve non-form linkage metadata on edit, and define a safe delete policy. Keep Customers hidden from normal admins until list/add/edit pass against the wife-beta tenant and Customer Portal regressions remain green.

### Validation Results

- Focused Create Estimate, persistence, Dashboard, and booking-conversion coverage passed (12 tests across the focused files in the final full run).
- Full Vitest suite: 97 passed across 17 files.
- Scoped ESLint for all changed source/test files: passed.
- Production build: passed.
- Full `npm run lint`: passed. The tenant migration was preserved as the Node-only script `scripts/migrations/migrate-add-tenant-ids.cjs`; byte-identical duplicate copies were removed.
- Known unrelated warnings: Vitest local-storage path warning; existing Vite ineffective dynamic-import and large-chunk warnings.
- In-app browser QA completed against the tenant-scoped `test.owner@gmail.com` admin account.

### Live Walkthrough Attempt — June 27, 2026

- Local URL loaded successfully with no framework error overlay.
- Signed in as the tenant-scoped admin for `Test Cleaning Services`.
- Dashboard loaded 6 leads, 2 booked jobs, and $495 confirmed revenue.
- Created a no-photo/no-AI manual estimate for `Live Beta 0627` using realistic Bolivar, Missouri contact/address data and the default 3-bedroom/2-bath standard-clean inputs.
- Save succeeded with a calculated range of `$180 - $225` and 4.5 labor hours.
- Dashboard then showed 7 leads and the new record as `New`, with `$180 - $225` and an explicit `Create Booking` action.
- Booked jobs remained 2 and confirmed revenue remained $495, so the estimate was not converted into a booking.
- The Create Estimate save path and focused persistence tests contain no booking or payment write; no payment UI/action was exposed. Direct collection inspection was not available in the browser session.
- Reload preserved the exact lead row and estimate range.
- No new page, Firestore-permission, or framework errors occurred under the tenant admin. One non-blocking email delivery error occurred after save: `[EMAIL] sendQuoteEmail failed: Failed to fetch`.

### Customers Audit Started — June 27, 2026

- Customers remains intentionally hidden from normal admins (`roles: ["super-admin"]`) while its renderer still exists.
- Primary CRUD path is `tenants/{tenantId}/customers/{customerId}` through `core/customers/customerService.js`.
- The component is tenant-scoped and has list/add/edit/delete/search behavior.
- Customers remains hidden from normal admins while the restoration gate is validated.

### Customers Restoration Safety Gate — June 27, 2026

**Status:** Safety gate and live list/add/edit verification passed; Customers restored to normal admin navigation.

#### Confirmed data path

- Customer collection: `tenants/{tenantId}/customers`
- Customer document: `tenants/{tenantId}/customers/{customerId}`
- Reads, creates, and updates are tested against those tenant-scoped paths.

#### Metadata preservation

Updates merge visible form edits over the existing customer document before writing. This preserves non-form fields including:

- `authUid`
- customer profile/link identifiers
- `propertyId` / `propertyIds`
- `leadId` / `leadIds`
- `bookingId` / `bookingIds`
- `createdAt`
- schema version and other existing linkage metadata

#### Safe delete policy

Hard delete is disabled for the first restoration version. The current schema cannot reliably prove that a customer has no linked leads, bookings, properties, or Customer Portal identity. Delete therefore returns `CUSTOMER_DELETE_BLOCKED`, performs no Firestore mutation, and shows a clear admin message. No cascade delete or soft-delete schema was introduced.

#### Beta blockers fixed

- Permission/load failures now render an explicit `Customers could not be loaded` alert with retry instead of a misleading empty directory.
- Editing no longer risks dropping hidden Portal/relationship metadata.
- Customer hard deletion cannot orphan linked operational records.

#### Beta blockers remaining

- None found in the tested wife-beta tenant. A second-tenant isolation walkthrough remains a deployment verification item; Firebase rules were unchanged in this pass.

#### Beta annoyances / future polish

- Form labels are not consistently associated with controls.
- The table is not optimized for narrow/mobile layouts.
- Duplicate email/phone detection, linked-status display, and a future archive/soft-delete workflow are deferred.
- Invitations, customer impersonation, bulk import, analytics, rewards, reviews, and automated lead-to-customer conversion remain deferred.

#### Tests added

- Tenant-scoped customer collection/document paths.
- Metadata-preserving edit writes.
- Hard-delete blocking with no Firestore delete.
- Explicit component permission/load error state.
- Component edit submission and blocked-delete messaging.
- Customer Portal identity/quote submission plus Dashboard/Create Estimate regressions.

#### Exact next step

Run a second-tenant read-isolation check when a safe second beta tenant/account is available. Then begin a separately scoped Bookings admin-list audit without changing quote-to-booking conversion behavior.

### Customers Live Verification And Navigation Restoration — June 27, 2026

- Temporarily exposed the existing Customers renderer locally to the tenant-scoped `test.owner@gmail.com` admin for verification.
- Customer list loaded without crash or permission errors from `tenants/{tenantId}/customers`.
- The tenant initially had no customer records, so no existing linked customer was available for live metadata inspection.
- Added `Beta Customer 0627` with realistic Bolivar, Missouri contact/address data.
- Reload confirmed the new customer persisted.
- Edited the visible name to `Beta Customer 0627 Edited`; reload confirmed the edit persisted.
- Existing email, phone, address, city, state, ZIP, and notes remained intact after edit. Hidden linkage preservation remains covered by the focused service test using `authUid`, profile, property, lead, booking, `createdAt`, and schema metadata.
- Triggering Delete did not remove the customer. The service returns `CUSTOMER_DELETE_BLOCKED`; the focused component test verifies the clear admin message.
- Dashboard still showed 7 leads, 2 booked jobs, $495 confirmed revenue, and the persisted `Live Beta 0627` estimate.
- Create Estimate still loaded after Customers verification.
- Current-session console was clean after the final Dashboard/Create Estimate checks. Earlier retained logs from prior sessions were unrelated to this Customers flow.
- Customer Portal identity and quote-request behavior were not mutated; focused regressions remain required in validation.
- Customers navigation now permits `admin` and `super-admin`. Other deferred navigation remains unchanged.
- `AppOnboardingRouter.test.jsx` explicitly proves Customers is visible for the completed admin while Customer Portal, Scheduling, Calendar, payments, Settings, and other deferred modules remain hidden.

### Customers Second-Tenant Isolation Verification — June 27, 2026

**Status:** Manually blocked because no working second tenant admin account is available.

#### What was verified

- Local `master` matched `origin/master` at `d46cec7` and the worktree was clean before this documentation update.
- Tenant A (`Test Cleaning Services`) loaded Customers successfully and showed only its expected persisted customer, `Beta Customer 0627 Edited`.
- The tenant-A customer remained intact with its expected email, phone, and Bolivar address.
- Existing focused service coverage proves customer reads, creates, and updates receive the active tenant ID and use `tenants/{tenantId}/customers/{customerId}` paths.
- No Firebase rules, auth/profile code, tenant/security logic, backend functions, or customer behavior was changed.

#### What remains blocked

- The only repository-documented candidate second admin (`admin@example.com`, intended for `test_tenant_001`) is not a working configured beta account; its documented login was previously rejected. No other safe tenant-B admin was found.
- Sign out did not transition away from tenant A in either the original session or a newly opened browser tab. The fresh tab otherwise loaded the tenant-A Dashboard correctly and produced no console warnings or errors. Because auth/profile work is explicitly out of scope, sign-out was not modified; it should be diagnosed as a separately scoped blocker before or alongside provisioning tenant B.
- Therefore tenant-B list/add/edit/reload and the final return-to-tenant-A leakage check could not be completed live. No live cross-tenant leakage conclusion is claimed.

#### Exact tenant-B setup required

1. Create a non-production Firebase Auth user with a unique tenant-B admin email.
2. Create `tenants/{tenantBId}` with the minimum valid ServicesOS tenant fields and add the new UID to the tenant's `users` and `adminUsers` membership arrays used by the deployed rules.
3. Create `users/{tenantBAdminUid}` with `role: admin`, `status: active`, `onboardingCompleted: true`, and `tenantId: tenantBId`.
4. Seed one uniquely named customer at `tenants/{tenantBId}/customers/{customerId}`. Do not use a super-admin or a tenant-null profile for this check.
5. In a fresh browser session, run the complete A → B → A walkthrough: verify each tenant's initial list, add/edit/reload a tenant-B customer, confirm tenant A never appears in B, and confirm the new B customer never appears in A.
6. Capture current-session console output and recheck Dashboard and Create Estimate under both tenant admins.

#### Beta annoyances / future polish

- Test-account provisioning and ownership are not documented in one authoritative beta-operations location.
- A repeatable two-tenant smoke-test fixture would make deployment verification less dependent on manually maintained credentials. This remains future test infrastructure, not a product feature.
- Bookings, Schedule, Settings, payments, and all other deferred modules remain untouched.

#### Exact next step

Diagnose the reproducible sign-out transition failure in a separately scoped auth task, provision the narrowly scoped tenant-B admin fixture above, and rerun the Customers A → B → A isolation walkthrough. Only after that check passes should a separately scoped Bookings admin-list audit begin; do not implement Bookings as part of this Customers pass.

#### Validation for this pass

- Focused Customers, Customer Portal, Dashboard, Create Estimate, and admin-router coverage: 21/21 passed across 6 files.
- Full ESLint: passed.
- Production build: passed with the existing ineffective dynamic-import and large-chunk warnings.
- The legacy smoke test now awaits every dynamic import. This preserves its module-load coverage and prevents imports from continuing after jsdom teardown.
- Full Vitest: 103/103 passed across 19 files with exit code 0. The existing local-storage path warning remains non-blocking.

### Sign-Out Transition Hardening — June 27, 2026

**Cause:** The shell invoked the asynchronous logout action without awaiting it, and `AuthContext.logout()` cleared only the persisted tenant ID. React's authenticated `user`, `userProfile`, and `currentTenant` state depended entirely on a later `onAuthStateChanged(null)` callback. If that callback was delayed or absent, tenant A remained rendered after Firebase sign-out resolved.

**Fix:** The shell now awaits logout. After `firebaseSignOut(auth)` resolves, AuthContext immediately clears the authenticated user, profile, tenant, tenant-loading state, and the scoped `current_tenant_id`, then leaves loading false so `AppContent` renders the login form. Firebase failures still return an error and do not falsely present a completed sign-out.

**Beta impact:** Tenant data is removed from the React tree immediately after successful sign-out instead of remaining visible while the app waits for a secondary auth-listener notification. Login, tenant loading, Firebase rules, and product workflows were not changed.

**Verification:** Focused provider coverage proves Firebase sign-out is called with the active auth instance and that the login state replaces tenant A even when the mocked auth listener does not emit a second callback. Router coverage proves the authenticated shell invokes logout. Live browser automation continued to display the pre-sign-out shell after its synthetic click, without console errors; therefore the focused state-transition test is the authoritative verification for this change and a human click check remains recommended after deployment/restart.

**Remaining requirement:** A working tenant-B admin fixture is still required before the Customers A → B → A isolation walkthrough can be completed.

**Exact next step:** Restart/deploy the updated web app, manually confirm Sign out shows Login and tenant A data disappears, then provision tenant B and complete the Customers isolation walkthrough. Do not begin Bookings implementation in that pass.

### Tenant-B Customers Isolation Attempt — June 28, 2026

**Status:** Externally blocked; isolation has not passed.

- Baseline on synchronized `master` at `58ec827` passed: ESLint, 104/104 Vitest assertions with exit code 0, and production build.
- Tenant A loaded 7 Dashboard leads and the existing `Beta Customer 0627 Edited` customer. No `Tenant B Isolation Customer 0627` record was visible.
- Sign out immediately showed the login screen and removed tenant-A data. Re-login restored the expected tenant-A Dashboard. Create Estimate loaded normally.
- The only repository-documented tenant-B candidate remains the placeholder `admin@example.com` / `test_tenant_001`. Its login was rejected by the live app, confirming it is not a configured beta fixture.
- No Firebase Admin service-account key or authorized tenant-B provisioning mechanism is available in this workspace. The existing migration script requires a separately supplied Admin key and is not intended to create this fixture.
- Tenant B was not created, `tenantBId` was not assigned, and `Tenant B Isolation Customer 0627` was not seeded. Tenant-B list/add/edit/reload, B → A leakage verification, and the full A → B → A walkthrough remain blocked.
- Current-session console warnings/errors: none.
- No Firebase rules, security logic, product code, Customer Portal, Dashboard, Create Estimate, Customers CRUD, payments, backend functions, or deferred modules were changed.

#### External setup still required

1. Create a non-production Firebase Auth admin user with a unique email; do not use a super-admin or tenant-null profile.
2. Create `tenants/{tenantBId}` with minimum valid tenant fields and include the UID in both `users` and `adminUsers`.
3. Create `users/{tenantBAdminUid}` with `role: admin`, `status: active`, `onboardingCompleted: true`, and `tenantId: tenantBId`.
4. Seed `Tenant B Isolation Customer 0627` at `tenants/{tenantBId}/customers/{customerId}` with clearly tenant-B-only contact/address data.
5. Supply the tenant-B email and password through the approved test-credential channel, then complete the documented A → B → A browser walkthrough.

#### Next recommended step

Provision the external tenant-B fixture and complete Customers isolation before claiming tenant isolation passed. Because the external blocker is now explicit and no product defect was found, a separately scoped Bookings admin-list audit may begin if prioritized, but Bookings implementation remains out of scope for this pass.
