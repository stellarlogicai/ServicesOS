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

**Status:** Automated safety gate implemented; live list/add/edit verification is still required before navigation restoration.

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

- Normal admins must not see Customers until list/add/edit pass manually with the wife-beta tenant and deployed permission contract.
- The component still needs a live tenant test proving create/update persistence and refresh behavior.
- Cross-tenant isolation must be verified before restoration; Firebase rules remain unchanged in this pass.

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

Run Customer list/add/edit manually against the wife-beta tenant while Customers remains hidden from normal navigation. Verify refresh persistence and deployed permissions, then add an explicit admin navigation test before changing the Customers role gate.
