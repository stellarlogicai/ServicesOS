# ServicesOS V1 Manual Smoke Checklist

Use this checklist only with fake data in an approved staging, emulator, preview, or explicitly approved test tenant. Never place passwords, tokens, secret keys, or private customer data in this file.

## 1. Approval And Environment

- [ ] Record tester, date, branch, commit, environment, Firebase project ID, and web URL.
- [ ] Confirm `master` / `origin/master` remain at the protected reference.
- [ ] Confirm no deployment is part of the smoke unless separately approved.
- [ ] Confirm the environment choice follows: staging, complete emulators, safe test tenant, then production only with explicit approval and backups.
- [ ] Confirm target tenant data and object cleanup IDs are recorded privately.
- [ ] Confirm Firestore backup/export and Storage inventory exist before any production-approved smoke.
- [ ] Capture currently deployed Firestore rules, Storage rules, indexes, and Storage CORS.
- [ ] Confirm browser developer tools are open for console and network evidence.

## 2. Persona Provisioning

- [ ] Tenant A admin: active `admin`, matching `tenantId`, UID in tenant `users` and `adminUsers`.
- [ ] Tenant A employee: active `employee`, matching `tenantId`, UID in tenant `users`.
- [ ] Tenant A customer: active `customer`, matching `tenantId`, linked customer record with matching `authUid`.
- [ ] Tenant B admin/user: valid Tenant B-only identity and membership.
- [ ] Super-admin: valid `super-admin` profile with no fake tenant fallback.
- [ ] Controlled unlinked customer: invalid/missing customer linkage for denial testing.
- [ ] Use separate browser profiles or fully sign out between personas.

## 3. Preflight Inventory

- [ ] Count and classify Storage objects under canonical field-photo paths.
- [ ] Count objects under global `jobPhotos/**`.
- [ ] Count objects under `tenants/DEFAULT/**`.
- [ ] Inventory branding object paths and filenames.
- [ ] Inventory documents, signatures, legacy photos, incidents, and property-condition paths.
- [ ] Report linked customers missing `authUid`.
- [ ] Report employee/admin profiles missing role, active status, or tenant ID.
- [ ] Report missing tenant `users`/`adminUsers` membership.
- [ ] Classify every item as Ready, Requires data preparation, Requires migration, Blocks rules deployment, or Deferred legacy cleanup.

## 4. Tenant A Admin

- [ ] Sign in and confirm Dashboard loads without changed-page console errors.
- [ ] Open Create Estimate and save a fake estimate/request where approved.
- [ ] Confirm customer/lead requests load.
- [ ] Confirm the linked fake customer's request appears for owner review.
- [ ] Convert the request and record the booking ID privately.
- [ ] Confirm request creation alone created no booking or payment.
- [ ] Refresh; confirm the new booking persists.
- [ ] Open Calendar; confirm the booking appears.
- [ ] Open Business Settings; record current fake values.
- [ ] Edit one reversible fake setting; refresh and confirm persistence.
- [ ] Restore the original fake setting if required by cleanup.
- [ ] Confirm Stripe status fields are read-only.
- [ ] Confirm Connect Stripe or Resume Stripe setup appears only when tenant status requires it.
- [ ] Do not complete Stripe onboarding without separate approval.
- [ ] Download customers, leads, bookings, and payment-record CSV files.
- [ ] Confirm every CSV contains only Tenant A records.
- [ ] Confirm payment rows distinguish manual and Stripe-confirmed status.
- [ ] Open booking detail and verify field status, timestamps, checklist summary, notes, and issue flag.
- [ ] Verify before/after evidence displays through authenticated Storage reads.
- [ ] Archive a fake customer and confirm history remains after refresh.
- [ ] Confirm a completed booking cannot be accidentally cancelled.

## 5. Tenant A Employee

- [ ] Sign in; confirm Field Mode is the landing page.
- [ ] Confirm only Field Mode and Sign out are visible.
- [ ] Refresh; confirm the employee remains in Field Mode.
- [ ] Confirm Dashboard, Business Settings, Data Export, Customer Portal, and admin pages cannot render.
- [ ] Confirm payment badge and internal owner notes are hidden.
- [ ] Confirm approved field instructions remain visible.
- [ ] Start a fake job; refresh and confirm persistence.
- [ ] Change checklist items; refresh and confirm persistence.
- [ ] Save a fake employee note; refresh and confirm persistence.
- [ ] Set an issue flag; refresh and confirm persistence.
- [ ] Upload a fake before JPEG; refresh and confirm it displays.
- [ ] Upload supported fake after JPEG/PNG/WebP evidence; refresh and confirm it displays.
- [ ] Confirm invalid file type is rejected.
- [ ] Confirm a file above the limit is rejected.
- [ ] On a controlled booking without after evidence, confirm completion warning appears.
- [ ] Confirm Complete Anyway works only after the explicit warning action.
- [ ] On a booking with after evidence, confirm no missing-after warning appears.
- [ ] Compare booking before/after and confirm price, schedule, payment, Stripe, customer, lead, and assignment fields did not change.

## 6. Linked Customer

- [ ] Sign in and confirm Customer Portal is the only application area.
- [ ] Confirm only the signed-in customer's quote requests appear.
- [ ] Confirm another fake customer's request is not visible.
- [ ] Submit a fake quote request.
- [ ] Confirm success copy: `Your quote request was submitted for owner review. This is not a confirmed booking yet.`
- [ ] Refresh and confirm the request persists.
- [ ] Confirm no booking was created automatically.
- [ ] Confirm no payment or Stripe session was created automatically.
- [ ] Confirm field photos are not shown or readable.
- [ ] Confirm Data Export, Field Mode, and admin pages are blocked.

## 7. Unlinked Customer

- [ ] Sign in with the controlled unlinked customer.
- [ ] Attempt quote submission.
- [ ] Confirm submission is blocked.
- [ ] Confirm no lead document was created.
- [ ] Confirm the honest account-connection message appears.

## 8. Super-Admin Two-Tenant Test

### No selection

- [ ] Confirm Bookings, Calendar, and Field Mode show `Select a tenant to view this area.`
- [ ] Confirm Business Settings and Data Export do not mount tenant data.
- [ ] Confirm no tenant-scoped service call occurs.

### Tenant A selected

- [ ] Confirm Tenant A Bookings, Calendar, Field Mode, Business Settings, and Data Export load.
- [ ] Open one Tenant A booking and its photo review.

### Switch to Tenant B

- [ ] Confirm Tenant A lists clear immediately.
- [ ] Confirm selected booking, Calendar selection, Field Mode job, and photo surfaces clear.
- [ ] Confirm Tenant B data loads.
- [ ] Confirm late Tenant A responses never reappear.
- [ ] Perform one approved reversible write and confirm it uses Tenant B only.

### Clear and refresh

- [ ] Clear selection and confirm all tenant-scoped data clears.
- [ ] Confirm selection-required states return.
- [ ] Refresh and confirm selection is intentionally not persisted.
- [ ] Confirm explicit reselection is required.

## 9. Cross-Tenant Security

- [ ] Tenant A admin cannot read Tenant B customers, leads, bookings, payments, or photos.
- [ ] Tenant A employee cannot read/write Tenant B bookings or photos.
- [ ] Tenant A customer cannot read Tenant B customer/request data.
- [ ] Tenant B user cannot access Tenant A field-photo metadata or objects.
- [ ] CSV exports never mix tenants.
- [ ] Super-admin transitions never show Tenant A and Tenant B data together.
- [ ] Use emulator assertions and approved console inspection to confirm denials; never weaken rules to make a call succeed.

## 10. Payment Truth

- [ ] Quote request remains distinct from booking.
- [ ] Booking creation does not mark payment paid.
- [ ] Payment-link creation does not mark payment paid.
- [ ] Manual payment is visibly manual and owner-recorded.
- [ ] Stripe-confirmed payment remains identified by verified webhook state.
- [ ] Field start/checklist/notes/issue/completion do not change payment fields.
- [ ] Photo upload does not change payment fields.
- [ ] Business Settings save does not change Stripe fields.
- [ ] CSV export preserves manual versus Stripe-confirmed distinctions.

Any failed item in this section is a V1 release blocker.

## 11. Persistence And Evidence

After every meaningful approved write:

- [ ] Record the sanitized action and timestamp.
- [ ] Refresh and confirm persistence.
- [ ] Sign out/in when the workflow requires session persistence proof.
- [ ] Confirm the intended persona can still see the result.
- [ ] Confirm unauthorized personas cannot see or change it.
- [ ] Inspect the expected Firestore/Storage path in the safe environment.
- [ ] Save screenshots with private identifiers removed or obscured.
- [ ] Record console/network errors without tokens or private payloads.

## 12. Cleanup And Classification

- [ ] Remove smoke-only fake records and objects according to the approved cleanup list.
- [ ] Do not delete evidence needed to prove payment or booking history.
- [ ] Classify each failure: A setup, B data preparation, C UI annoyance, D V1 blocker, or E V1.1.
- [ ] Stop on D-level findings; document exact reproduction and recommend one isolated repair branch.
- [ ] Do not fix C or E findings during smoke.

## 13. Post-Smoke Validation

- [ ] `git status -sb`
- [ ] `git diff --check`
- [ ] From `cloud-functions`: `npm run test:rules-parity`
- [ ] Run relevant automated suites only if environment/configuration changed.
- [ ] Confirm `master` / `origin/master` are unchanged.
- [ ] Confirm no application, rules, functions, or environment deployment occurred unless separately approved.
- [ ] Update `SERVICESOS_V1_AUTHENTICATED_SMOKE_REPORT.md` with pass/fail/not-run evidence and the final recommendation.

