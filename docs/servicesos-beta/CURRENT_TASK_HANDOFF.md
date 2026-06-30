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

### Bookings Admin-List Audit — June 28, 2026

**Status:** Hidden and not beta-ready; no dedicated Bookings admin list exists.

#### Current architecture

- There is no Bookings route, navigation item, or standalone admin-list component.
- Normal admins continue to see only Dashboard, Create Estimate, and Customers. Existing router coverage keeps Staff Scheduling, Calendar, payments, Settings, and other deferred modules hidden.
- `core/scheduling/schedulingService.js#getJobs(tenantId)` is the reusable list-read boundary. It validates tenant presence and reads only `tenants/{tenantId}/bookings`, ordered by `date` descending.
- Quote-to-booking writes remain in `quoteBookingConversionService.js` and target `tenants/{tenantId}/bookings/{bookingId}`. That conversion behavior was reviewed but not changed.
- The closest list UI is the hidden super-admin Calendar. It directly reads the tenant booking collection but is mounted without a `tenantId`, has no loading/error UI, assumes calendar-specific date/time fields, and also loads employees. It is a deferred scheduling surface, not a wife-beta Bookings list.
- Hidden Staff Scheduling also reads bookings as jobs, but combines booking creation/status changes with employee management and assignment. It remains outside the Bookings admin-list scope.

#### Audit result

- Tenant-scoped service reads, empty results, missing tenant rejection, load failures, and minimally populated booking documents now have focused audit coverage.
- No global/shared booking collection read was found in the audited list boundary.
- The service does not require payment or Stripe fields and does not mutate records while listing.
- Missing-field display resilience cannot be claimed because no dedicated Bookings list renderer exists. Calendar and Staff Scheduling are not suitable for exposure without broader scheduling/employee work that is explicitly deferred.
- No product behavior, navigation, Firebase rules, payments, Customer Portal, Dashboard conversion, Create Estimate, Customers, scheduling, or employee assignment code was changed.

#### Beta blockers remaining

1. No dedicated authenticated owner/admin Bookings list route or component exists.
2. No Bookings list loading, empty, permission/error, or defensive missing-field display states exist.
3. Existing candidate UIs are coupled to Calendar or Staff Scheduling and are intentionally hidden.

#### Recommendation

Keep Bookings hidden. Revisit it as a separately scoped minimal read-only owner/admin list using `getJobs(tenantId)` after product approval. That future pass must add explicit loading/empty/error states and safe fallbacks for customer, service, address, schedule, status, price, timestamps, assignment, lead, and customer identifiers before navigation exposure.

### Minimal Read-Only Bookings Admin List — June 28, 2026

**Status:** Wife-beta ready as a read-only list. This is not a full Bookings implementation.

- Added `components/BookingsList.jsx` and exposed a single `Bookings` navigation item to completed normal admins and super-admins with `manage_bookings` permission.
- The list uses `useAuth().tenantId` and calls `core/scheduling/schedulingService.js#getJobs(tenantId)`, which reads only `tenants/{tenantId}/bookings`.
- Displayed fields are customer name, service type, status, scheduled date/time, address, and price.
- Safe fallbacks are `Unknown customer`, `Service not specified`, `Booked`, `Not scheduled`, `Address not provided`, and `Price not set`.
- The page includes explicit loading, empty, tenant-unavailable, and retryable load-error states.
- The page is read-only. It exposes no create, edit, delete, payment, employee assignment, reschedule, calendar, or scheduling controls and performs no booking mutations.
- Dashboard quote-to-booking conversion remains unchanged and continues writing the same tenant-scoped booking records.
- Customer Portal, Schedule, Calendar, payments, Settings, and all other deferred modules remain hidden for normal admins.

#### Focused coverage

- Completed-admin route and navigation visibility, while deferred modules stay hidden.
- Active tenant ID passed to `getJobs`.
- Loading, empty, retryable error, complete record, and missing-field fallback states.
- No create/edit/delete/payment/assignment/reschedule controls.
- Existing tenant-scoped service-read and quote-to-booking conversion regressions.
- Final validation: ESLint passed; full Vitest passed 112/112 across 22 files with exit code 0; production build passed with the existing ineffective dynamic-import and large-chunk warnings.

#### Manual tenant-A verification

- Dashboard, Create Estimate, and Customers loaded successfully.
- Bookings loaded without a crash and displayed the existing scheduled `$245.00` booking. The record lacks customer/address data, so the intended `Unknown customer` and `Address not provided` fallbacks were shown.
- No mutation, payment, assignment, or scheduling controls appeared.
- Sign out showed Login and removed tenant data. Re-login restored the Bookings page and record.
- Console warnings/errors: none.

#### Remaining deferred work

- Booking creation, editing, deletion, rescheduling, recurring jobs, assignment, calendar integration, customer booking requests, notifications, status automation, routing, and payment collection remain explicitly deferred.
- Tenant-B Customers isolation remains externally blocked and is not changed by this Bookings list.

#### Next recommended step

Continue wife-beta verification of the read-only Bookings list with realistic complete and incomplete booking data. Separately provision tenant B and complete Customers A → B → A isolation when Firebase Admin access is available. Do not expand Bookings into scheduling or payment workflows.

### Create Estimate Notification Visibility — June 29, 2026

**Status:** Wife-beta ready; estimate persistence remains non-blocking and notification status is visible.

- `AIPhotoEstimateSystem.jsx` still persists through the admin `onLeadSaved` adapter before invoking customer notifications. AI/photo analysis remains optional.
- Email and SMS remain separate. `sendQuoteEmail` reports success/failure; the current `sendSMS` helper is a local logging stub and cannot confirm delivery.
- The results screen now conservatively reports notification status without delaying or reversing a successful estimate save:
  - Confirmed email success: `Estimate saved successfully. Customer notification sent.`
  - Email failure or throw: `Estimate saved successfully. Customer notification could not be sent. Please contact the customer manually for now.`
  - Unconfigured/unknown email status: `Estimate saved successfully. Customer notification status could not be confirmed. Please contact the customer manually if needed.`
- Missing email provider configuration now returns an unknown result instead of falsely reporting a sent notification.
- No notification queue, retries, delivery database schema, backend/provider configuration, payment behavior, booking conversion, or Customer Portal messaging was added.

#### Focused coverage

- Save success with confirmed notification success.
- Save success with notification failure, thrown error, and unavailable/unknown status.
- Failure paths never claim notification success and never undo the persisted estimate.
- Manual saving remains available after optional AI failure.
- Existing no-booking/no-payment persistence assertions and Dashboard, Bookings, and Customers regressions remain covered.

#### Manual tenant-A verification

- Created the no-photo/no-AI manual estimate `Notification Beta 0629` for `$180 - $225`.
- The local email request logged the known `[EMAIL] sendQuoteEmail failed: Failed to fetch`; the results UI displayed the explicit manual-follow-up failure message.
- Dashboard persisted and displayed the new lead. Total leads increased from 7 to 8, while booked jobs remained 2 and confirmed revenue remained $495, confirming no booking or payment was created.
- Customers and Bookings loaded successfully after the save.
- Sign out removed tenant data. One transient network retry briefly loaded the existing customer fallback profile; signing out and retrying restored the correct tenant-A admin Dashboard with 8 leads. No auth code was changed in this notification pass.
- Final console warning/error: the expected non-blocking email `Failed to fetch` entry only.

#### Remaining limitations

- Provider configuration, backend-secure delivery, SMS delivery confirmation, retries, queues, resend, and notification history remain deferred.
- `Customer notification sent` confirms only the existing email helper's success result; the SMS logging stub does not provide delivery confirmation.

#### Next recommended step

Keep manual customer follow-up as the beta fallback when the warning/unknown message appears. Address secure provider-backed email/SMS delivery in a separately authorized infrastructure task; do not couple it to estimate persistence.

### Auth Profile Load Fallback Guard — June 29, 2026

**Status:** Reproduced and fixed with a narrow auth-state guard.

- Cause: an authenticated user's Firestore profile read failure was treated the same as a confirmed missing profile document. `AuthContext` synthesized `{ role: 'customer', tenantId: null }`, which could briefly route a tenant admin into Customer Portal during a transient network failure.
- Fix: a profile read exception now clears user, profile, tenant, tenant-loading state, and the stored tenant ID, then ends the Firebase session. It never fabricates a customer profile from an error.
- The intentional customer fallback remains unchanged when `users/{uid}` is successfully read and confirmed not to exist.
- Login, tenant loading after a valid profile read, Customer Portal identity handling, Firebase rules, tenant/security logic, and product workflows were not changed.

#### Verification

- Focused tests cover profile-read failure, clean sign-out, absence of customer/admin tenant state, a successful subsequent tenant-A admin login, and the legitimate missing-document customer fallback.
- Existing login, router, Customer Portal identity/submission, Dashboard, Create Estimate, Customers, and Bookings behavior remained covered.
- Manual tenant-A verification: Dashboard, Customers, Bookings, and Create Estimate navigation loaded as admin; sign-out returned to `Welcome Back` with tenant data absent; re-login restored `Test Cleaning Services`, admin navigation, and the Dashboard with 8 leads, 2 booked jobs, and $495 confirmed revenue.

#### Next recommended step

Provision a valid tenant-B admin fixture and complete Customers A → B → A isolation. Do not expand Bookings or other deferred modules during that verification.

### Customers Tenant Isolation Verification — June 29, 2026

**Status:** Wife-beta verified through a complete tenant A → tenant B → tenant A account-switching walkthrough.

- Tenant-B account `test.ownerb@gmail.com` authenticated as an admin and loaded the linked `test1` business shell. Dashboard, Customers, Bookings, and Create Estimate were available; no Customer Portal or Business Not Linked fallback appeared.
- The configured tenant-B ID for this fixture is `tenant_1781560864375`. The ID is not displayed in the current UI, so it was not independently read from the browser screen.
- The requested seed name `Tenant B Isolation Customer 0627` was initially absent, although an existing tenant-B-only `Customer B` record was visible. The requested fixture was added through the tenant-B Customers UI with tenant-specific contact data; it persisted after a full reload.
- Tenant A displayed `Beta Customer 0627 Edited` and never displayed either tenant-B customer record.
- Tenant B displayed its own customer records and never displayed `Beta Customer 0627 Edited`.
- Signing out from each account returned to Login and removed the prior tenant's data. Logging back into tenant A restored `Test Cleaning Services`, its Dashboard data, and its customer record without tenant-B data.
- Dashboard, Customers, the read-only Bookings list, and Create Estimate loaded successfully for both admins. Neither Bookings list displayed customer data from the other tenant.
- No tenant leakage, permission-denied, auth/profile, or route errors appeared during the walkthrough. The only retained console error was the known earlier non-blocking `[EMAIL] sendQuoteEmail failed: Failed to fetch` entry from the Create Estimate notification check; its timestamp preceded this walkthrough.
- No product code, Firebase rules, security logic, payments, scheduling, or deferred modules were changed.

#### Next recommended step

Treat Customers tenant isolation and account-switch clearing as wife-beta verified. Proceed with a separately scoped manual wife-beta pass for the minimal read-only Bookings list using realistic tenant-specific complete and incomplete records; do not expand Bookings into scheduling, assignment, or payments.

### Bookings Tenant-Specific Verification — June 29, 2026

**Status:** Wife-beta verified for the minimal read-only Bookings list with tenant-specific complete and incomplete records.

- Verified from latest local `master` with no product-code changes.
- Tenant A fixture tenant ID: `tenant_1781642309523`.
- Tenant B fixture tenant ID: `tenant_1781560864375`.
- Tenant A booking fixtures used:
  - `wife-beta-a-complete-0629`: `Tenant A Complete Booking 0629`
  - `wife-beta-a-incomplete-0629`: intentionally minimal/incomplete record
- Tenant B booking fixtures used:
  - `wife-beta-b-complete-0629`: `Tenant B Complete Booking 0629`
  - `wife-beta-b-incomplete-0629`: intentionally minimal/incomplete record
- Fixtures were written only under `tenants/{tenantId}/bookings/{bookingId}`. No global booking collection, Firebase rules, auth logic, backend functions, payments, or product schemas were changed.
- Incomplete fixtures keep `date: ""` so the current `orderBy('date', 'desc')` query includes them while still exercising display fallbacks.

#### A → B → A walkthrough result

- Tenant A Dashboard loaded expected tenant-A data.
- Tenant A Customers displayed `Beta Customer 0627 Edited` and did not display `Tenant B Isolation Customer 0627`.
- Tenant A Bookings displayed `Tenant A Complete Booking 0629` and did not display `Tenant B Complete Booking 0629`.
- Tenant A complete booking displayed customer, service, status, schedule, address, and price correctly.
- Tenant A incomplete booking displayed safe fallbacks: `Unknown customer`, `Service not specified`, `Booked`, `Not scheduled`, `Address not provided`, and `Price not set`.
- Tenant A Bookings exposed no create, edit, delete, payment, assignment, refund, or reschedule controls.
- Signing out from Tenant A returned to Login and removed tenant-A and tenant-B data from the screen.
- Tenant B authenticated as admin, loaded its admin shell, and Dashboard loaded.
- Tenant B Customers displayed `Tenant B Isolation Customer 0627` and did not display `Beta Customer 0627 Edited`.
- Tenant B Bookings displayed `Tenant B Complete Booking 0629` and did not display `Tenant A Complete Booking 0629`.
- Tenant B complete booking displayed customer, service, status, schedule, address, and price correctly.
- Tenant B incomplete booking displayed the same safe fallback text.
- Tenant B Bookings exposed no create, edit, delete, payment, assignment, refund, or reschedule controls.
- Signing out from Tenant B returned to Login and removed tenant-B and tenant-A data from the screen.
- Returning to Tenant A restored Dashboard, Customers, Bookings, and Create Estimate with tenant-A-only data.
- Console warnings/errors during the walkthrough: none.

#### Reload behavior

- Browser reload while viewing Bookings currently returns the in-memory admin shell to Dashboard.
- After reopening Bookings post-reload, each tenant's complete and incomplete booking records persisted and the opposite tenant's records remained absent.
- Treat direct Bookings page persistence across browser reload as future polish, not a wife-beta blocker for the current read-only admin list.

#### Remaining limitations

- Bookings remains read-only. Creation, editing, deletion, rescheduling, recurring jobs, employee assignment, calendar integration, route optimization, customer booking requests, notifications, status automation, and payment collection remain deferred.
- Truly missing `date` fields are not included by the current `orderBy('date', 'desc')` query; the live fallback check used an empty date field to verify the UI safely renders `Not scheduled` once a record is returned.

#### Validation

- Baseline validation before verification: ESLint passed; full Vitest passed 118/118 across 22 files with exit code 0; production build passed with existing Vite dynamic-import and large-chunk warnings.
- Final validation after documentation update: ESLint passed; full Vitest passed 118/118 across 22 files with exit code 0; production build passed with the existing Node `--localstorage-file`, Vite ineffective dynamic-import, and large-chunk warnings.

#### Next recommended step

Proceed to the next wife-beta verification pass for the next approved owner/admin surface. Do not expand Bookings into scheduling, assignment, payments, or route/calendar workflows.

### Wife-Beta Route Visibility Audit — June 29, 2026

**Status:** Wife-beta verified for normal-admin route/navigation visibility.

- Approved normal-admin surfaces remain:
  - Dashboard
  - Create Estimate
  - Customers
  - Bookings
- Normal-admin navigation does not show deferred/admin-only surfaces:
  - Settings
  - Payments / Payment Links
  - Stripe / Stripe Connect setup
  - Scheduling / Schedule
  - Calendar
  - Staff Scheduling
  - Customer Portal
  - Insurance
  - Data Export
  - Backup
  - Route Optimization
  - Payroll
  - Training / AI Training
  - Tap to Pay
  - Tenant Management
- `App.jsx` currently uses internal app state for admin surface selection. There is no URL-backed route table for these admin surfaces despite the `BrowserRouter` wrapper.
- Direct normal-admin URL attempts to deferred paths such as `/settings`, `/payments`, `/payment-links`, `/stripe`, `/scheduling`, `/schedule`, `/calendar`, `/staff-scheduling`, `/customer-portal`, `/insurance`, `/data-export`, `/backup`, `/route-optimization`, `/payroll`, `/training`, `/tap-to-pay`, `/ai-training`, and `/tenant-management` did not render the deferred modules. The app remained on an approved admin surface while the approved nav stayed limited to Dashboard, Create Estimate, Customers, and Bookings.
- Existing super-admin nav visibility was left unchanged and is now covered by a focused test.
- No product workflows, Firebase rules, auth/tenant logic, payments, Customer Portal quote submission, Dashboard conversion, Create Estimate behavior, Customers CRUD, Bookings list behavior, Schedule, Settings, Calendar, Staff Scheduling, or deferred module implementations were changed.

#### Focused coverage added

- Completed normal admin sees Dashboard, Create Estimate, Customers, and Bookings.
- Completed normal admin does not see deferred normal-admin nav items.
- Direct deferred path attempts by a completed normal admin do not render deferred modules.
- Approved surfaces still render.
- Existing super-admin nav visibility remains unchanged.
- Sign-out remains covered in the app router test.

#### Manual tenant-A verification

- Tenant-A admin nav showed only Dashboard, Create Estimate, Customers, and Bookings.
- Dashboard, Customers, Bookings, and Create Estimate each loaded from the approved nav.
- Direct deferred URL attempts did not expose deferred pages to the normal admin.
- Sign-out returned to Login and removed tenant data from the visible screen.
- Re-login restored the admin shell and approved nav. A browser-control timeout interrupted an extra root reload check after re-login; no product-code change was made for that tooling issue.
- Console warnings/errors captured during the route visibility walkthrough: none.

#### Remaining limitations

- Admin page selection is still state-based, not URL-route based. Direct URLs do not provide deep links to approved surfaces; they also do not expose deferred modules to normal admins.
- Super-admin access to existing deferred/admin tooling remains intentionally unchanged and should be audited separately before any broader beta exposure.

#### Validation

- Baseline validation before the audit: ESLint passed; full Vitest passed 118/118 across 22 files with exit code 0; production build passed with existing Node `--localstorage-file`, Vite ineffective dynamic-import, and large-chunk warnings.
- Focused route/router test passed: 4/4.
- Final validation after test and documentation updates: ESLint passed; full Vitest passed 120/120 across 22 files with exit code 0; production build passed with the existing Node `--localstorage-file`, Vite ineffective dynamic-import, and large-chunk warnings.

#### Next recommended step

Proceed to the next wife-beta owner/admin pass only for an approved surface. Do not implement Settings, payments, scheduling, calendar workflows, staff scheduling, route optimization, Tap to Pay, payroll, training, or future modules.

### Owner/Admin Golden Path Wife-Beta Walkthrough — June 29, 2026

**Status:** Wife-beta ready for human wife test with known annoyances.

- Verified from local `master` after the normal-admin route visibility audit.
- Approved normal-admin surfaces remained limited to Dashboard, Create Estimate, Customers, and Bookings for both tenant admins.
- Deferred surfaces remained hidden from normal admins.
- Tenant A account used: `test.owner@gmail.com`.
- Tenant B account used for isolation sanity: `test.ownerb@gmail.com`.
- No passwords were documented.

#### Golden-path records created or used

- Tenant A customer: `Golden Path Customer 0629`.
- Tenant A estimate/lead: `Golden Path Estimate 0629`.
- Tenant A booking: created from the Dashboard explicit `Create Booking` action for `Golden Path Estimate 0629`.
- Booking details persisted in Bookings with address `629 Golden Path Lane`, scheduled for July 2, 2026 at 9:00 AM, price `$180.00`.

#### What passed

- Tenant A Dashboard loaded and displayed tenant-A-only data.
- Tenant A Customers loaded and persisted `Golden Path Customer 0629`.
- A no-photo/no-AI manual estimate saved successfully.
- The Create Estimate results screen showed the non-blocking notification/manual-follow-up status after save.
- Dashboard displayed the saved estimate as a new lead; estimate save did not create a booking or payment.
- The explicit Dashboard `Create Booking` action converted the saved estimate into a booked lead.
- Dashboard updated from 2 booked jobs / `$495` confirmed revenue to 3 booked jobs / `$675` confirmed revenue after booking.
- Bookings displayed the new booking with the expected schedule, address, and price.
- Bookings stayed read-only: no create, edit, delete, payment, assignment, refund, or reschedule controls were exposed in the Bookings list.
- No payment confusion appeared: no false paid state, no required payment prompt, and no Stripe/payment action in the approved flow.
- Sign-out returned to the login screen and removed tenant data. Re-login restored tenant-A Dashboard, Customers, Bookings, and Create Estimate data.
- Tenant B loaded the admin shell for `test1` with the same approved surfaces only.
- Tenant B Customers displayed tenant-B-only customer data and did not display `Golden Path Customer 0629` or `Beta Customer 0627 Edited`.
- Tenant B Bookings displayed tenant-B bookings and did not display the tenant-A golden booking/address.
- Tenant B Dashboard and Create Estimate loaded without tenant-A data.
- Returning to Tenant A restored tenant-A golden customer, estimate/lead, and booking without tenant-B data.
- Console/page errors captured during the final account-switching verification: none.

#### Beta blocker fixed

- The Dashboard booking modal initialized its time input directly from `preferredTime`. Manual estimates can store time buckets such as `morning`, which are valid customer preference values but invalid `<input type="time">` values. After entering a booking date, the modal could appear ready while booking creation did not complete because the scheduled timestamp used an invalid time string.
- The fix is narrowly scoped to `Dashboard.jsx`: booking modal time values are normalized to valid times (`morning` → `09:00`, `afternoon` → `13:00`, `evening` → `17:00`, otherwise `09:00`) while preserving existing valid `HH:mm` times.
- Focused regression coverage now proves a manual estimate with `preferredTime: "morning"` opens with `09:00` and can create a booking.

#### Wife-beta annoyances found

- `Golden Path Customer 0629` appeared twice in Tenant A Customers because an earlier browser-automation retry submitted the add-customer action more than once. This is a manual-run artifact; duplicate detection remains future polish.
- The new booking appears in Bookings as `Unknown customer` even though the schedule, address, and price are correct. This is understandable enough for the read-only beta list but should be polished later by carrying/displaying a customer snapshot for admin-created estimate bookings.
- Direct browser reload behavior is still state-based rather than URL-route-based; approved surfaces reload back through the admin shell rather than deep-linking to the current surface.

#### Future polish / deferred work

- Duplicate-customer detection and merge/archive tools.
- Richer booking customer labels for admin-created estimate bookings.
- URL-backed deep links for approved admin surfaces.
- Settings, payments, Stripe/Connect, payment links, refunds, scheduling, calendar workflows, staff scheduling, assignment, route optimization, Tap to Pay, payroll, training, Customer Portal expansion, notification queues/retries, and future modules remain deferred.

#### Wife-Beta Completion Assessment

`Wife-beta ready for human wife test with known annoyances`

The approved owner/admin flow can now run across Dashboard, Customers, Create Estimate, and read-only Bookings with tenant-scoped data, persisted customer/estimate/booking records, understandable notification/payment state, sign-out/account switching, and no remaining beta-critical blocker found in this pass. Known annoyances are documented above and do not require expanding deferred modules.

#### Validation

- Baseline validation before this pass: ESLint passed; full Vitest passed 120/120 across 22 files with exit code 0; production build passed with existing warnings.
- Focused Dashboard regression after the booking-time fix: `DashboardPendingQuoteReview.test.jsx` passed 7/7.
- Final validation after code/test/docs updates: ESLint passed; full Vitest passed 121/121 across 22 files with exit code 0; production build passed with the existing Node `--localstorage-file`, Vite ineffective dynamic-import, and large-chunk warnings.

#### Next recommended step

Run the first human wife-beta pass on the approved surfaces only. Have the tester complete Dashboard → Customers → Create Estimate → Dashboard Create Booking → Bookings → sign out/re-login. Do not begin Settings, payments, Schedule, assignment, route optimization, payroll, Tap to Pay, training, or future modules unless a beta-critical blocker is found.

### Aunt B Estimate Pricing Profile — June 29, 2026

**Status:** Tenant/profile-specific pricing guardrails implemented and integrated behind explicit profile detection.

- Pricing profile ID: `aunt-bs-cleaning-services`.
- Profile location: `servicesos-web/src/core/estimates/pricingProfiles.js`.
- Estimate utility location: `servicesos-web/src/core/estimates/calculateEstimate.js`.
- Create Estimate integration: enabled only when the active tenant has `pricingProfileId: "aunt-bs-cleaning-services"`, `pricingProfile.id: "aunt-bs-cleaning-services"`, or an exact matching normalized Aunt B business name. Tenants without that explicit profile keep the existing legacy estimate calculation.
- Aunt B pricing is not a global default.
- No Settings UI, profile editor UI, Firebase rules, payments, Stripe, booking conversion, notification flow, scheduling, assignment, route optimization, payroll, training, mobile, or future modules were changed.

#### EstimateResult shape

The reusable utility returns a deterministic structured result with:

- `tenantPricingProfileId`
- `market`
- `currency`
- `low`
- `suggested`
- `high`
- `requiresManualReview`
- `manualReviewReasons`
- `customerSummary`
- `internalNotes`
- `lineItems`
- `warnings`

The Create Estimate integration preserves legacy compatibility by keeping `priceLow` and `priceHigh` on the saved estimate payload and adding `priceSuggested`, pricing-profile metadata, review reasons, line items, notes, and warnings when a profile is active.

#### Manual-review triggers

Implemented manual-review handling for severe buildup, excessive clutter, pet waste or odor, smoke residue, mold, biohazard, hoarding cleanup, post-construction dust, large rural home, unclear scope, unsupported large homes, and over-35-mile travel. Manual-review results still return a guarded estimate when possible and include owner-facing reasons/notes instead of silently suppressing risk.

#### Tested scenarios

- 3 bed / 2 bath standard, normal condition, no pets, no add-ons, Bolivar core zone returns the Aunt B anchor around `$205` suggested.
- 3 bed / 2 bath deep clean with multiple pets returns a suggested quote around `$290–$295`.
- 2 bed / 1 bath standard, well-maintained, biweekly-after-initial-reset pricing does not go below the minimum job price.
- Move-out 3 bed / 2 bath with inside fridge and oven produces a higher quote and add-on notes.
- Pet waste or severe buildup requires manual review.
- Excessive clutter requires manual review.
- Over-35-mile travel requires manual review.
- Unsupported larger homes do not crash and warn/require review.
- Final prices round to the nearest `$5`.
- Minimum job and service-specific minimum prices are enforced.
- Create Estimate still saves a manual no-photo/no-AI estimate without booking/payment side effects, and explicit Aunt B profile opt-in produces the expected Aunt B range.

#### Wife-beta impact

When Aunt B’s tenant is configured with the pricing profile ID, Create Estimate uses structured Bolivar, Missouri cleaning price guardrails instead of the previous generic hourly/rural estimate. Human override remains possible through the existing Dashboard booking approval price. AI/photo analysis remains optional, and manual estimate save remains tenant-scoped.

#### Known limitations

- There is no Settings/profile editor UI; pricing profile assignment must be configured outside the normal-admin UI.
- The current Create Estimate form does not expose every pricing input directly, so some utility features are available for future form/profile inputs but not currently visible in the beta UI.
- The saved estimate keeps legacy `priceLow/priceHigh` fields for Dashboard/PDF/SMS compatibility; `priceSuggested` is additive metadata.
- Deep-linking and other known wife-beta annoyances remain unchanged.

#### Validation

- Focused pricing/Create Estimate tests passed: 16/16 across 2 files.
- Final full validation: ESLint passed; full Vitest passed 132/132 across 23 files with exit code 0; production build passed with the existing Node `--localstorage-file`, Vite ineffective dynamic-import, and large-chunk warnings.

#### Next recommended step

Configure Aunt B’s actual beta tenant with `pricingProfileId: "aunt-bs-cleaning-services"` in the real tenant document or equivalent tenant profile metadata, then run one human Create Estimate pass and confirm the visible range matches the structured profile. Do not build a Settings editor or deferred pricing-management UI yet.

### Booking Restore-and-Harden Audit — June 29, 2026

**Status:** Audit complete; no booking UI or product behavior was changed in this pass.

#### Files and capabilities audited

- `servicesos-web/src/components/BookingsList.jsx`
  - Current approved normal-admin Bookings surface.
  - Uses `useAuth().tenantId` and `getJobs(tenantId)`.
  - Read-only list only; no create, edit, delete, payment, assignment, refund, or reschedule controls.
- `servicesos-web/src/components/bookingDisplay.js`
  - Display fallback helpers for customer, service, status, schedule, address, and price.
  - Customer fallback order is `booking.customerName`, `booking.customer`, `booking.customerSnapshot`, then `booking.formData`.
- `servicesos-web/src/pages/Dashboard.jsx`
  - Contains the explicit `Create Booking` modal/action from leads.
  - Calls `approveQuoteRequestAndCreateBooking` and then reloads leads.
- `servicesos-web/src/services/quoteBookingConversionService.js`
  - Converts a lead into `tenants/{tenantId}/bookings/{bookingId}` and updates `tenants/{tenantId}/leads/{leadId}` in one batch.
  - Writes date/start/end time, scheduledAt, agreedPrice, status, serviceType, address, notes, lead/customer/property/request snapshots when available.
  - Does not write payments.
- `servicesos-web/src/core/scheduling/schedulingService.js`
  - Existing tenant-scoped service boundary for `getJobs`, `getJobsByDate`, `getJobById`, `createJob`, `updateJob`, `updateJobStatus`, `deleteJob`, and `assignEmployeeToJob`.
- Hidden/deferred components and services reviewed:
  - `CalendarView.jsx`
  - `StaffScheduling.jsx`
  - `JobCompletion.jsx`
  - `customerPortalService.js` reschedule functions
  - `rebookingService.js`
  - `employeeAssignmentService.js`, `staffSchedulingService.js`, and related employee/payment/service code by search.
- Tests reviewed:
  - `BookingsList.test.jsx`
  - `bookingAdminListAudit.test.js`
  - `quoteBookingConversionService.test.js`
  - `DashboardPendingQuoteReview.test.jsx`
  - router/route-visibility coverage in `AppOnboardingRouter.test.jsx`
  - older smoke/workflow tests that assert scheduling service exports.

#### Existing capability map

1. **Read-only Bookings list**
   - Data source: `getJobs(tenantId)`.
   - Tenant path: `tenants/{tenantId}/bookings`.
   - Current fields displayed: customer name, service type, status, scheduled date/time, address, and price.
   - Current fallbacks: `Unknown customer`, `Service not specified`, `Booked`, `Not scheduled`, `Address not provided`, `Price not set`.
   - Limitation: list does not show notes, phone/email, lead/customer IDs, or detail view.

2. **Dashboard Create Booking flow**
   - Conversion source: Dashboard lead row/modal.
   - Booking document shape: tenantId, leadId/sourceLeadId, source, customerId/propertyId, snapshots when present, date/startTime/endTime/scheduledAt, agreedPrice, status, serviceType, address, notes, createdBy/createdAt/updatedAt, schema version.
   - Lead patch: status becomes `booked`; lead estimate is locked to agreed price; review/appointmentRequest flags are cleared when present.
   - Why admin-created estimate bookings can show `Unknown customer`: admin-created leads persist customer identity mainly under `formData.fullName`, but the booking conversion currently does not copy `lead.formData` or synthesize `customerName/customerSnapshot` into the booking. `bookingDisplay.js` can already display those fields if present.

3. **Existing booking/status/edit/reschedule capabilities**
   - `getJobById`, `updateJob`, `updateJobStatus`, and `deleteJob` exist in the core scheduling service and are tenant-scoped.
   - `assignEmployeeToJob` exists but is employee-assignment scope and should remain deferred.
   - `StaffScheduling.jsx` can create jobs and update status to `in_progress`/`completed`, but it also creates/edits/deletes employees and schedules employee shifts, so it is too broad for Aunt B’s V1 restoration.
   - `customerPortalService.js` has reschedule request/confirm functions, but they target `tenants/{tenantId}/jobs/{jobId}` rather than the current approved `bookings` collection and live in Customer Portal scope.
   - `JobCompletion.jsx` updates `tenants/{tenantId}/jobs`, uploads photos/signatures, creates reviews and AI learning data; this is unsafe for the owner/admin V1 booking edit path.

4. **Hidden Calendar/Schedule/StaffScheduling code**
   - `CalendarView.jsx` reads `tenants/{tenantId}/bookings` and employees, supports month/week/day views, and includes a simple booking detail modal.
   - It is hidden from normal admins and coupled to employee display (`employeeId`) and calendar workflow assumptions. It may be a reference for future read-only layout only, not a direct V1 restoration.
   - `StaffScheduling.jsx` is intentionally deferred because it mixes booking/job creation, status changes, employee management, and assignment.

5. **Service boundaries**
   - Safe read boundary now in use: `getJobs(tenantId)`.
   - Potential read boundary for detail: `getJobById(tenantId, jobId)`.
   - Potential narrow mutation boundaries after hardening: `updateJob(tenantId, jobId, patch)` and `updateJobStatus(tenantId, jobId, status)`.
   - Unsafe for immediate V1: `deleteJob`, `assignEmployeeToJob`, StaffScheduling create-job flow, Customer Portal reschedule functions targeting `jobs`, recurring/rebooking automation, job completion/photo/signature/AI-learning flows.
   - All useful core scheduling service functions require tenantId; error handling returns standardized success/error responses and logs Firestore failures.

#### Safety assessment by capability

- Booking detail view: **Reusable after hardening**. Build a new minimal read-only detail from BookingsList data or `getJobById`; avoid Calendar dependency.
- Booking edit: **Needs new minimal implementation** using a whitelist patch for date/time/price/status/internal notes only.
- Booking reschedule: **Needs new minimal implementation** against `tenants/{tenantId}/bookings`; existing Customer Portal reschedule targets `jobs` and should not be reused directly.
- Booking status update: **Reusable after hardening** through `updateJobStatus`, with an owner/admin whitelist such as `scheduled`, `completed`, `cancelled`.
- Booking cancel: **Reusable after hardening** as a status update, not `deleteJob`.
- Customer snapshot display: **Safe to reuse now** by writing/displaying `customerName` or `customerSnapshot` for new Dashboard-created bookings while preserving old fallbacks.
- Customer/job notes: **Reusable after hardening** as read-only detail first; later editable as a single internal-notes field.
- Recurring service marker: **Too coupled to deferred modules**; keep read-only if present, no automation.
- Payment status marker: **Too coupled to deferred payments**; defer.
- Employee assignment: **Too coupled to deferred modules**; defer.
- Calendar display: **Too coupled to deferred modules** for now; maybe future read-only reference only.

#### Recommended staged Aunt B V1 path

**Stage A — Fix booking customer display**

- First restoration task: `Fix booking customer name display for admin-created estimate bookings`.
- Copy or synthesize enough customer display data during Dashboard booking conversion so new admin-created bookings have `customerName` and/or `customerSnapshot.fullName`.
- Preserve existing incomplete-record fallbacks.
- Do not add edit/reschedule/status controls.

**Stage B — Booking detail view**

- Add a read-only detail view from BookingsList.
- Show customer, phone/email if available, address, service, date/time, price, status, and notes.
- Use tenant-scoped data only.

**Stage C — Booking edit/reschedule/status**

- Add a small owner/admin edit modal limited to date, time, status, price, and internal/job notes.
- Use whitelisted fields and tenant-scoped service functions.
- Do not include employee assignment, route optimization, calendar workflows, payment collection, or recurring automation.

**Stage D — Manual payment status later**

- Keep separate from booking edit unless payment scope is explicitly approved.

#### Acceptance criteria for first restoration task

`Fix booking customer name display for admin-created estimate bookings`

- Dashboard Create Booking stores enough customer display data for admin-created estimate bookings.
- Bookings displays the customer name for newly created admin-estimate bookings.
- Existing incomplete bookings still show `Unknown customer`.
- No tenant leakage between Tenant A and Tenant B.
- No payment, scheduling, assignment, refund, delete, edit, or reschedule controls are introduced.
- Refresh/logout/re-login preserves customer display.
- Dashboard quote-to-booking conversion behavior remains otherwise unchanged.
- Create Estimate still saves tenant-scoped leads only and does not create bookings/payments.
- Focused conversion/display tests and full lint/test/build pass.

#### What not to touch in the first restoration task

- Firebase rules, backend/cloud functions, Stripe/payments/payment status, StaffScheduling, Calendar exposure, employee assignment, route optimization, payroll, training, mobile, Customer Portal expansion, pricing editor, broad Settings, recurring automation, and delete/cascade behavior.

#### Validation

- Baseline before audit: ESLint passed; full Vitest passed 132/132 across 23 files; production build passed with existing Node `--localstorage-file`, Vite ineffective dynamic-import, and large-chunk warnings.
- Final validation after this documentation-only audit: ESLint passed; full Vitest passed 132/132 across 23 files; production build passed with the existing Node `--localstorage-file`, Vite ineffective dynamic-import, and large-chunk warnings.

#### Next recommended task

Implement Stage A only: fix booking customer name display for admin-created estimate bookings with focused conversion/display tests. Do not expose edit/reschedule/status, Calendar, StaffScheduling, payment status, or assignment in that pass.

### Booking Customer Display Fix — June 30, 2026

**Status:** Stage A implemented and manually verified for Tenant A/Aunt B.

#### Root cause

Dashboard Create Booking converts leads into booking documents through `quoteBookingConversionService.js`. Customer Portal quote requests already carry `customerSnapshot`, but admin-created estimates primarily store the display name under `lead.formData.fullName` or first/last name fields. The conversion path did not synthesize `customerName` or a safe customer display snapshot from those admin lead fields, so the read-only Bookings list fell through to `Unknown customer`.

#### Fields added

The booking conversion path now adds customer display data when available from the existing lead payload only:

- `customerName`
- `customerSnapshot.name`
- `customerSnapshot.email`
- `customerSnapshot.phone`

Extraction priority is existing lead/customer snapshot data first, then `lead.formData.fullName`, then `lead.formData.firstName + lead.formData.lastName`. No customer collection lookup, customer mutation, tenant path change, booking ID change, payment behavior, or status behavior was added.

#### Tests added/updated

- `quoteBookingConversionService.test.js` now verifies an admin-created manual estimate lead copies `formData.fullName`, email, and phone into the booking display fields while preserving tenant-scoped conversion behavior.
- `BookingsList.test.jsx` now verifies a booking with `customerName` displays that customer name instead of `Unknown customer` and still exposes no create/edit/delete/payment/assignment/refund/reschedule controls.
- Existing incomplete booking fallback coverage still verifies `Unknown customer`.
- Focused validation passed: quote booking conversion, Bookings list, Dashboard booking, and Create Estimate tests passed 22/22.

#### Manual verification

- Tenant A/Aunt B UI smoke completed with `Customer Name Display Smoke 0630`.
- Approved admin nav remained limited to Dashboard, Create Estimate, Customers, and Bookings.
- Manual no-photo/no-AI estimate saved successfully. The optional email notification failed in local dev with a non-blocking manual-contact warning.
- Saved estimate persisted to Dashboard as a new lead and did not create a booking automatically.
- Dashboard Create Booking converted the lead to a booking at the expected $190 agreed price.
- Read-only Bookings displayed `Customer Name Display Smoke 0630` instead of `Unknown customer`.
- Schedule, address, and price displayed as `Jul 3, 2026, 9:00 AM`, `630 Display Smoke Lane`, and `$190.00`.
- Browser reload returned to Dashboard, and reopening Bookings still showed the customer name.
- Sign-out cleared tenant data from the visible UI. Re-login as Tenant A reloaded Dashboard and Bookings with the smoke booking still showing the customer name.
- Bookings still exposed no edit, delete, payment, assignment, refund, or reschedule controls.
- Optional Tenant B sanity was not run in this Stage A pass; prior Customers and Bookings tenant isolation remains the current tenant-isolation baseline.
- Console result: only known local notification warning, `[EMAIL] sendQuoteEmail failed: Failed to fetch`; no permission-denied, crash, booking display, or tenant/auth errors were captured.

#### Remaining limitations

- This pass fixes customer display data for new bookings only. Existing bookings that were already created without customer display fields may still show `Unknown customer`.
- Booking detail, edit, reschedule, status update, cancel, payment status, employee assignment, Calendar, StaffScheduling, and recurring automation remain deferred.

#### Validation

- Baseline before changes: ESLint passed; full Vitest passed 132/132 across 23 files; production build passed with existing warnings.
- Focused validation after code/test updates: 22/22 passed across 4 files.
- Final full validation after manual verification: ESLint passed; full Vitest passed 134/134 across 23 files with the known `--localstorage-file` warning; production build passed with existing Vite dynamic import/chunk-size warnings.

#### Recommended next task

After final validation and commit, proceed to Stage B only: a read-only booking detail view showing customer, contact, address, service, date/time, price, status, and notes. Do not expose edit/reschedule/status controls yet.

### Read-Only Booking Detail View — June 30, 2026

**Status:** Stage B implemented and manually verified for Tenant A/Aunt B.

#### What was added

- The read-only Bookings list now exposes a `View Details` action on each booking card.
- Clicking `View Details` opens a local read-only modal using the booking already returned by `getJobs(tenantId)`.
- Closing the modal returns the owner/admin to the Bookings list.
- No second Firestore fetch, write, customer lookup, tenant path change, payment behavior, status behavior, assignment behavior, or deferred module exposure was added.

#### Files changed

- `servicesos-web/src/components/BookingsList.jsx`
- `servicesos-web/src/components/bookingDisplay.js`
- `servicesos-web/src/__tests__/BookingsList.test.jsx`

#### Fields displayed

- Customer name
- Customer email
- Customer phone
- Service
- Status
- Scheduled date/time
- Address
- Price
- Reference ID when available
- Notes

#### Fallback behavior

The detail modal uses safe display fallbacks for incomplete bookings:

- `Unknown customer`
- `Email not provided`
- `Phone not provided`
- `Service not specified`
- `Booked`
- `Not scheduled`
- `Address not provided`
- `Price not set`
- `Reference not provided`
- `No notes provided`

Existing older bookings that lack customer display data still fall back safely instead of crashing.

#### Tests added/updated

- `BookingsList.test.jsx` now verifies each booking card exposes `View Details`.
- Detail modal opens and displays customer, email, phone, service, status, schedule, address, price, reference, and notes for a complete booking.
- Detail modal closes cleanly.
- Incomplete bookings show safe fallback text in the detail modal.
- List and modal remain read-only with no edit, delete, payment, assignment, refund, reschedule, or status-update controls.
- Existing tenant-bound `getJobs(tenantId)`, loading, empty, error, and incomplete fallback behavior remains covered.

#### Manual Tenant A result

- Logged in as Tenant A/Aunt B admin.
- Approved admin nav remained limited to Dashboard, Create Estimate, Customers, and Bookings.
- Opened Bookings and verified `View Details` appears for booking cards.
- Opened detail view for `Customer Name Display Smoke 0630`.
- Detail showed customer name, email, phone, service, status, schedule, address, price, reference, and notes.
- Closed the detail view successfully.
- Opened an incomplete older booking and confirmed fallback text was understandable.
- Refreshed, reopened Bookings, and confirmed the detail view still works.
- Signed out and verified tenant data cleared from the login screen.
- Re-logged in as Tenant A and confirmed the detail view still works.
- No edit, delete, payment, assignment, refund, reschedule, or status-update controls appeared in the Bookings list or detail modal.

#### Tenant B sanity

Optional Tenant B sanity was not run in this Stage B pass. Prior Customers and Bookings tenant isolation remains the current tenant-isolation baseline.

#### Console result

Only the known local notification warning was present: `[EMAIL] sendQuoteEmail failed: Failed to fetch`. No permission-denied, crash, booking detail, or tenant/auth errors were captured.

#### Deferred

Booking edit, reschedule, status update, cancel/delete, payment status, payment collection, Stripe, Tap to Pay, Calendar, StaffScheduling, employee assignment, route optimization, payroll, training, mobile app, Settings, pricing editor, Customer Portal expansion, and recurring automation remain deferred.

#### Validation

- Baseline before changes: ESLint passed; full Vitest passed 134/134 across 23 files; production build passed with existing warnings.
- Focused validation after code/test updates: Bookings list, admin router, and booking admin-list audit tests passed 15/15 across 3 files.
- Final full validation after documentation update: ESLint passed; full Vitest passed 136/136 across 23 files with the known `--localstorage-file` warning; production build passed with existing Vite dynamic import/chunk-size warnings.

#### Recommended next task

Continue Aunt B V1 restore-and-harden with the next approved owner/admin beta blocker or verification pass. Do not expose edit/reschedule/status controls, Calendar, StaffScheduling, payments, assignment, Settings, or future modules without explicit approval.

### Limited Booking Edit Audit — June 30, 2026

**Status:** Audit-only Stage C pass completed. No booking edit, reschedule, status, delete, payment, assignment, Calendar, StaffScheduling, Settings, Customer Portal expansion, or future-module UI was exposed.

#### Files audited

- `servicesos-web/src/components/BookingsList.jsx`
- `servicesos-web/src/components/bookingDisplay.js`
- `servicesos-web/src/core/scheduling/schedulingService.js`
- `servicesos-web/src/pages/Dashboard.jsx`
- `servicesos-web/src/services/quoteBookingConversionService.js`
- `servicesos-web/src/__tests__/BookingsList.test.jsx`
- `servicesos-web/src/__tests__/DashboardPendingQuoteReview.test.jsx`
- `servicesos-web/src/__tests__/quoteBookingConversionService.test.js`
- `servicesos-web/src/__tests__/bookingAdminListAudit.test.js`
- `servicesos-web/src/__tests__/AppOnboardingRouter.test.jsx`
- Deferred/risk reference only: `CalendarView.jsx`, `StaffScheduling.jsx`, `customerPortalService.js`, `JobCompletion.jsx`

#### Current booking document shape

Dashboard Create Booking writes booking documents through `approveQuoteRequestAndCreateBooking()` and `buildQuoteBookingConversion()` under:

- `tenants/{tenantId}/bookings/{bookingId}`

Current booking fields written by the conversion path:

- `tenantId`: copied from the active tenant
- `leadId` / `sourceLeadId`: source lead linkage
- `source`: lead source, defaulting to `admin`
- `customerId` / `propertyId`
- `customerName` when available
- `customerSnapshot` with safe display fields when available
- `propertySnapshot`
- `requestSnapshot`
- `appointmentRequest`
- `date`: local `YYYY-MM-DD` from `scheduledAt`
- `startTime`: local `HH:mm` from `scheduledAt`
- `endTime`: local `HH:mm`, computed from appointment duration
- `scheduledAt`: ISO string
- `agreedPrice`: number
- `status`: currently `scheduled`
- `serviceType`
- `address`
- `notes`: string, trimmed
- `createdBy`
- `createdAt`: ISO string
- `updatedAt`: ISO string
- schema version metadata from `addSchemaVersion(..., 'JOB')`

Dashboard also patches the source lead in the same batch:

- `lead.status: "booked"`
- `lead.booking.bookingId`
- `lead.booking.scheduledAt`
- `lead.booking.agreedPrice`
- `lead.booking.notes`
- `lead.booking.status`
- `lead.estimate.priceLow` / `priceHigh` set to agreed price
- owner-review flags cleared
- `lead.updatedAt`

Fixtures/tests currently exercise booking statuses including `scheduled`, `completed`, `cancelled`, `in_progress`, and lead statuses including `new`, `quoted`, `booked`, `lost`, `pending_owner_review`, and `pending_review`.

#### Service mutation boundaries

`schedulingService.js` uses the tenant-scoped collection path `tenants/{tenantId}/bookings` for its core booking functions.

- `getJobs(tenantId)`: read-only; requires tenant ID; safe and currently used by Bookings.
- `getJobsByDate(tenantId, date)`: read-only; requires tenant ID and date; used by hidden/deferred scheduling surfaces; safe as a read, but not needed for Stage C Bookings.
- `getJobById(tenantId, jobId)`: read-only; requires tenant ID and job ID; safe, but Stage B proved `getJobs(tenantId)` already returns enough detail, so Stage C should avoid a second fetch unless stale-data handling requires it.
- `createJob(tenantId, jobData)`: writes arbitrary job data and defaults status to `scheduled`; unsafe/deferred for Stage C because owner/admin booking creation already flows through Dashboard quote conversion and this bypasses lead synchronization.
- `updateJob(tenantId, jobId, jobData)`: writes arbitrary fields plus `updatedAt` and schema version. Usable only behind a strict whitelist wrapper; unsafe if called directly from UI.
- `updateJobStatus(tenantId, jobId, status)`: writes arbitrary status plus `updatedAt`. Usable only behind approved status validation; unsafe if called directly from UI.
- `deleteJob(tenantId, jobId)`: destructive booking delete; deferred.
- `assignEmployeeToJob(tenantId, jobId, employeeId)`: employee assignment; deferred.

Recommended future service boundary is a new narrow wrapper, not direct UI access to broad mutation functions:

```js
updateBookingAdminFields(tenantId, bookingId, patch)
```

The wrapper should validate tenant ID, booking ID, allowed fields, date/time normalization, price, status, note length, and should write only tenant-scoped booking fields. It can internally call `updateJob()` only after building a clean whitelisted payload.

#### Dashboard and revenue impact

Dashboard does not currently calculate owner/admin metrics from `tenants/{tenantId}/bookings`. It calculates from leads:

- Booked jobs: `leads.filter(l => l.status === "booked")`
- Confirmed revenue: sum of `lead.booking.agreedPrice`
- Revenue chart: booked leads grouped by `lead.booking.scheduledAt`
- Pipeline: lead estimate low/high values

Impact:

- Editing booking `agreedPrice` alone will not update Dashboard confirmed revenue.
- Editing booking `scheduledAt`/`date`/`startTime` alone will not move the Dashboard revenue chart.
- Editing booking `status` alone will not affect Dashboard booked count because booked count is lead-status based.
- Editing booking notes alone will not update the Dashboard lead drawer unless `lead.booking.notes` is also patched.
- Patching both booking and source lead may be required for price/date/status/notes consistency, but that adds cross-document mutation risk and should be designed deliberately.

Recommendation:

- Stage C should not start with price/status if Dashboard consistency is required.
- If price/date/status edits are exposed later, decide whether the source lead snapshot must be patched in the same batch using `sourceLeadId`/`leadId`.
- Do not silently update customer records, payment records, employee records, or global collections.

#### Safe future field whitelist

Recommended future editable booking fields, with project conventions:

```js
{
  date: "YYYY-MM-DD",
  startTime: "HH:mm",
  endTime: "HH:mm",
  scheduledAt: "ISO-8601 string",
  agreedPrice: number,
  status: "scheduled" | "completed" | "cancelled",
  notes: "string",
  updatedAt: "ISO-8601 string"
}
```

Notes:

- `endTime` should be computed from existing booking duration when possible, otherwise from a conservative default such as two hours.
- `updatedAt` should follow current project convention: `new Date().toISOString()`.
- `agreedPrice` must be numeric and non-negative. If Dashboard revenue consistency is required, delay price editing until lead synchronization is included and tested.
- `notes` should remain internal/job notes and should have a length cap.
- Do not allow customer, tenant, payment, employee, source linkage, schema, createdAt, createdBy, review, appointment request, or customer snapshot edits through Stage C.

#### Status whitelist recommendation

Current safest status values for the owner/admin Bookings UI:

- `scheduled`
- `completed`
- `cancelled`

Defer these until display/metric semantics are explicit:

- `confirmed`: not currently used by booking creation; hidden Calendar falls back to grey unless updated.
- `needs_reschedule`: not currently used by booking creation; Customer Portal reschedule writes a different deferred `jobs` path and separate reschedule fields.
- `in_progress`: currently appears in StaffScheduling/check-in flows and should remain employee/field-work deferred.

User-facing labels can map as:

- `scheduled` → Booked
- `completed` → Completed
- `cancelled` → Cancelled

If the product needs `Confirmed` or `Needs Reschedule`, add them in a separate status semantics pass with Dashboard/Bookings display tests.

#### Deferred component risks

- `CalendarView.jsx` reads `tenants/{tenantId}/bookings` by date/startTime and displays status colors for `scheduled`, `in_progress`, `completed`, and `cancelled`; it also expects employee IDs. Do not expose it for Stage C.
- `StaffScheduling.jsx` can create jobs, update employee records, and set `in_progress`/`completed`; it imports employee services and is broader than owner/admin booking edits. Do not reuse or expose it for Stage C.
- `customerPortalService.js` has reschedule request/confirm helpers, but they write to `tenants/{tenantId}/jobs`, not the restored `bookings` path. Do not reuse for Stage C Bookings.
- `JobCompletion.jsx` writes to `jobs`, storage, photos, reviews, signatures, and AI learning data. It is completion/training workflow scope and remains deferred.

#### Future validation and safety rules

Future Stage C implementation should enforce:

- Active tenant ID required.
- Booking ID required.
- Tenant-scoped path only: `tenants/{tenantId}/bookings/{bookingId}`.
- No global writes.
- No unknown fields.
- No employee assignment fields.
- No payment/refund/status/payment-link fields.
- No customer mutation.
- No lead/customer collection writes unless the implementation explicitly handles Dashboard consistency in one tested batch.
- Date/time normalized before write.
- `scheduledAt`, `date`, `startTime`, and `endTime` kept internally consistent.
- Price numeric and non-negative.
- Status from whitelist only.
- Notes string length limited.
- Existing read-only detail fallback still works.
- Route visibility remains unchanged.

#### Future tests required before exposing mutation UI

1. Edit modal opens from booking detail only after explicit user action.
2. Only allowed fields appear: date, time, status, agreed price, notes.
3. Date/time update writes only whitelisted booking fields.
4. Date/time update keeps `scheduledAt`, `date`, `startTime`, and `endTime` consistent.
5. Price update writes numeric `agreedPrice` only, or is delayed until lead/Dashboard synchronization is implemented.
6. Status update accepts only whitelisted statuses.
7. Invalid status is rejected by helper and is not rendered as an option.
8. Notes update persists safely and respects length limit.
9. No payment, assignment, delete/cancel, Customer Portal reschedule, Calendar, or StaffScheduling controls appear.
10. Tenant ID and booking ID are passed to the update boundary.
11. Cross-tenant/global writes are impossible through the service helper.
12. Dashboard/Bookings consistency is tested for any field that Dashboard displays from `lead.booking`.
13. Read-only detail still works for incomplete bookings.
14. Route visibility remains unchanged.
15. Full lint, full tests, and build pass.

#### Recommended implementation split

- **Stage C1:** Add service-level whitelist builder/helper and focused tests only. No UI exposure.
- **Stage C2:** Add edit modal for date/time and notes only. Update booking document only. Manual Tenant A verification.
- **Stage C3:** Add status dropdown only for `scheduled`, `completed`, and `cancelled`; keep `confirmed`, `needs_reschedule`, and `in_progress` deferred until semantics are explicit.
- **Stage C4:** Add price edit only after deciding whether to patch source lead booking/estimate fields in the same batch so Dashboard revenue stays accurate.
- **Stage C5:** Manual A → B → A verification for tenant isolation, refresh persistence, sign-out/re-login clearing, Dashboard consistency, and no deferred controls.

#### What remains deferred

Booking delete/cancel, broad reschedule workflow, payment status, payment collection, Stripe, Stripe Connect, Tap to Pay, Calendar, StaffScheduling, employee assignment, route optimization, payroll, training, mobile app, Settings, pricing editor, Customer Portal expansion, JobCompletion, AI learning, signatures, photos, and recurring automation remain deferred.

#### Validation

- Baseline before audit documentation: ESLint passed; full Vitest passed 136/136 across 23 files with the known `--localstorage-file` warning; production build passed with existing Vite dynamic import/chunk-size warnings.
- Final full validation after documentation update: ESLint passed; full Vitest passed 136/136 across 23 files with the known `--localstorage-file` warning; production build passed with existing Vite dynamic import/chunk-size warnings.

#### Clear next prompt recommendation

Implement Stage C1 only: add and test a pure service-level whitelist helper for limited booking admin updates. Do not expose any edit UI yet.

### Booking Admin Update Whitelist Helper — June 30, 2026

**Status:** Stage C1 implemented with service-level helper and focused tests only. No booking edit UI, reschedule UI, status dropdown UI, price edit UI, cancel/delete control, payment control, employee assignment, Calendar, StaffScheduling, Settings, or future-module route was exposed.

#### What was added

- Added `buildBookingAdminUpdatePatch(proposedPatch, options)` in `servicesos-web/src/core/scheduling/schedulingService.js`.
- The helper is pure and returns the existing standardized API response shape.
- The helper validates a proposed owner/admin booking update and returns a sanitized payload containing only approved booking fields plus `updatedAt`.
- The helper accepts an optional `now` value for deterministic tests; production default follows the current project timestamp convention, `new Date().toISOString()`.

#### Write wrapper

- No Firestore-writing wrapper was added in this pass.
- `updateBookingAdminFields(...)` remains a future Stage C implementation step after the pure whitelist helper is stable.
- Existing broad `updateJob(...)` and `updateJobStatus(...)` are still not wired to Bookings UI.

#### Allowed fields

The helper allows only:

- `date`
- `startTime`
- `endTime`
- `scheduledAt`
- `status`
- `notes`
- `agreedPrice`

The sanitized payload always adds:

- `updatedAt`

#### Forbidden fields behavior

Unknown or forbidden fields are rejected with `VALIDATION_ERROR`; they are not stripped silently. This includes tenant, customer, payment, employee, source lead, route, Stripe, refund, delete/cancel, and schema fields such as:

- `tenantId`
- `customerId`
- `customerName`
- `customerSnapshot`
- `propertyId`
- `propertySnapshot`
- `leadId`
- `sourceLeadId`
- `source`
- `createdAt`
- `createdBy`
- `schemaVersion`
- `paymentStatus`
- `payment`
- `payments`
- `stripe`
- `stripePaymentIntentId`
- `employeeId`
- `assignedEmployee`
- `assignment`
- `route`
- `routeOptimization`
- `refund`
- `delete`
- `cancelledBy`

#### Status whitelist

Allowed:

- `scheduled`
- `completed`
- `cancelled`

Rejected/deferred:

- `confirmed`
- `needs_reschedule`
- `in_progress`
- any other value

#### Date/time validation

- `date` must use local `YYYY-MM-DD`.
- `startTime` and `endTime` must use `HH:mm`.
- `scheduledAt` must be a valid ISO string.
- If `date` and `startTime` are supplied without `scheduledAt`, the helper generates `scheduledAt`.
- If `scheduledAt` is supplied, the helper validates supplied `date` and `startTime` against its local date/time parts.
- Supplying only `date` or only `startTime` is rejected because the helper cannot safely infer the missing temporal field.

#### Notes and price validation

- `notes` must be a string.
- `notes` are trimmed.
- `notes` are limited to 1000 characters.
- `agreedPrice` must be numeric and non-negative.
- Price support exists only in the helper and tests; no price edit UI or Dashboard/lead synchronization was added.

#### Tests added

Added `servicesos-web/src/__tests__/bookingAdminUpdatePatch.test.js` covering:

- Date/time/notes update and `updatedAt`.
- `scheduledAt`, `date`, and `startTime` consistency.
- Rejection of inconsistent or partial temporal input.
- Status whitelist acceptance/rejection.
- Numeric non-negative `agreedPrice`.
- Negative/non-numeric `agreedPrice` rejection.
- Notes trimming and notes length rejection.
- Unknown field rejection.
- Explicit forbidden-field rejection for tenant/customer/payment/employee/source/route/Stripe/refund/schema fields.
- Empty patch rejection.

Focused validation after helper/tests passed 37/37 across booking admin update helper, Bookings list/detail, admin router, booking audit, quote conversion, and Create Estimate beta tests.

#### No UI exposure confirmation

- `BookingsList.jsx` was not changed in Stage C1.
- The existing Bookings detail modal remains read-only.
- No edit, reschedule, status, price, cancel/delete, payment, assignment, Calendar, StaffScheduling, Settings, or future-module control was added.

#### Validation

- Baseline before changes: ESLint passed; full Vitest passed 136/136 across 23 files; production build passed with existing Vite dynamic import/chunk-size warnings.
- Focused validation after helper/tests: 37/37 passed across 6 files.
- Final full validation after documentation update: ESLint passed; full Vitest passed 148/148 across 24 files with the known `--localstorage-file` warning; production build passed with existing Vite dynamic import/chunk-size warnings.

#### Remaining limitations

- No write wrapper exists yet.
- No UI uses the helper yet.
- Dashboard/revenue and lead synchronization remain intentionally unresolved for price/date/status edits.
- Status semantics remain limited to `scheduled`, `completed`, and `cancelled`.

#### Recommended next task

Implement Stage C2 only after explicit approval: add a write wrapper and/or UI for date/time and notes only, with no price/status exposure until Dashboard/lead synchronization is designed.

### Aunt B Pricing Profile Tenant Configuration — June 29, 2026

**Status:** Tenant configuration completed with mixed results - Tenant A correctly using Aunt B profile, Tenant B showing legacy pricing despite configuration.

#### Configuration Applied

- **Tenant A (test.owner@gmail.com)**: Added `pricingProfileId: "aunt-bs-cleaning-services"` to tenant document
- **Tenant B (test.ownerb@gmail.com)**: Added `pricingProfileId: "aunt-bs-cleaning-services"` to tenant document

#### Smoke Test Results

**Tenant A (Test Cleaning Services) - Aunt B Profile Active:**
- Customer: "Pricing Smoke Customer 0629"
- Service: Standard Clean, One-Time
- Property: 3 bed, 2 bath, 1 kitchen, 1 living room
- Condition: Normal clutter, Monthly cleaning, No pets, Rural market
- **Pricing Result: $190 - $220** (4.5 hours labor)
- **Status:** ✅ Matches expected Aunt B profile anchors (low ~$190, high ~$220)
- Estimate saved successfully with notification status: "Estimate saved successfully. Customer notification could not be sent."
- Booking conversion: Successfully converted to booking at $190 agreed price
- Booking persisted and visible in Bookings list

**Tenant B (test1) - Unexpected Legacy Pricing:**
- Customer: "Fallback Test Customer 0629"
- Service: Standard Clean, One-Time
- Property: 3 bed, 2 bath, 1 kitchen, 1 living room
- Condition: Normal clutter, Monthly cleaning, No pets, Rural market
- **Pricing Result: $180 - $225** (4.5 hours labor)
- **Status:** ⚠️ Does NOT match Aunt B profile anchors (expected $190 - $220)
- Estimate saved successfully with notification status: "Estimate saved successfully. Customer notification could not be sent."

#### Analysis

**Tenant A Success:**
- The Aunt B pricing profile is correctly activated for Tenant A
- Pricing matches the expected anchors defined in `pricingProfiles.js`
- Estimate save, persistence, and booking conversion work as expected
- No booking or payment auto-creation occurred (manual booking required)

**Tenant B Discrepancy:**
- Despite manual configuration of `pricingProfileId: "aunt-bs-cleaning-services"`, Tenant B is using legacy/default pricing ($180 - $225)
- This suggests either:
  1. The tenant document configuration was not applied correctly to Tenant B
  2. There's a caching issue with tenant data loading
  3. The profile detection logic has an edge case for this specific tenant
- Further investigation needed to determine why Tenant B is not using the Aunt B profile

#### Profile Detection Logic Confirmed

- Primary field: `tenant.pricingProfileId`
- Secondary field: `tenant.pricingProfile.id`
- Fallback: Normalized business name matching
- Detection occurs in `getPricingProfileForTenant()` in `pricingProfiles.js`
- Integration point in `AIPhotoEstimateSystem.jsx` line 167

#### Console Errors (Non-blocking)

- Email notification failures due to CORS policy on Resend API (expected in local development)
- No product code errors related to pricing profile detection or calculation

#### Next Steps

1. Investigate why Tenant B is not using the Aunt B profile despite configuration
2. Verify Tenant B tenant document actually has the `pricingProfileId` field in Firestore
3. Consider adding tenant data refresh or cache invalidation if needed
4. Once Tenant B pricing is corrected, repeat smoke test to confirm
