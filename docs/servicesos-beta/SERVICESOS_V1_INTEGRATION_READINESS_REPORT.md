# ServicesOS V1 Integration Readiness Report

Audit date: 2026-07-13
Protected production candidate: `master` / `origin/master` at `031bb46249fd09bbe7014e5f9747d4a7a4737a6f`
Audit branch: `v1-lab-v1-integration-readiness`
Lab base and current audited HEAD before this report: `18ea497`
Deployment performed: No

## Executive Readiness Summary

The accumulated V1 lab work is internally coherent enough for provisioned, authenticated browser smoke. Web, Cloud Functions, Firestore rules, Storage rules, and the production build all pass their current automated validation. The V1 customer, employee, admin, booking, field-execution, export, and field-photo paths are tenant-scoped in application code. Payment truth remains separate from booking creation, payment-link creation, field completion, and photo upload.

The branch is **not ready for production integration or rules deployment yet**. The final classification is **D - Code/rules blocker**, with these required follow-up slices:

1. The deploy-source `cloud-functions/firestore.rules` and mirror `shared/firestore.rules` are not equivalent. The deploy source also retains cross-tenant temporary legacy access for recognized non-employee roles on several legacy collections.
2. Super-admin selected-tenant state does not reach `Bookings`, `Calendar`, or `Field Mode`; those components read the profile tenant ID, which is intentionally null for super-admin.
3. The new Storage rules file allows only Field Mode evidence. Deploying it as written would deny existing Storage paths such as branding, signatures, documents, and legacy photos. Those paths must be explicitly retired or separately hardened before Storage rules deployment.

Authenticated browser smoke, production index observation, Storage `getBlob()` CORS behavior, and real-data compatibility remain classifications B or C after the blockers are resolved.

## Classification Key

- **A - Ready:** verified by current code/tests.
- **B - Requires authenticated smoke:** cannot be proven by unit/emulator tests alone.
- **C - Requires data preparation or configuration:** provisioning, index, bucket, or environment prerequisite.
- **D - Code/rules blocker:** must be fixed before production promotion.
- **E - Deferred V1.1 work:** intentionally outside true V1 and not a V1 blocker.

## 1. Git And Slice Inventory

History from `031bb46..18ea497` is linear: 13 commits, zero merge commits, no duplicate slice implementation, and no omitted listed slice.

| Order | Commit | V1 slice | Result |
| --- | --- | --- | --- |
| 1 | `c27194b` | True V1 standards and gap plan | A |
| 2 | `395e43a` | Field Mode job execution MVP | A |
| 3 | `0898ac0` | Field Mode rules hardening plan | A |
| 4 | `73187be` | Field Mode booking update rules | A, subject to final rules deployment blockers |
| 5 | `b04abb9` | Owner/admin job-completion review | A |
| 6 | `cdb8238` | Safe customer archive and booking cancel controls | A |
| 7 | `6216adc` | Copy-ready customer messages | A |
| 8 | `bbe5f27` | Business Settings readiness | A |
| 9 | `b4742fe` | Safe Stripe onboarding action restoration | A/B |
| 10 | `3d245b8` | Tenant-scoped CSV exports | A/B |
| 11 | `70ffa84` | Customer intake, identity, and rules hardening | A/B/C |
| 12 | `fbfd10c` | Employee-only Field Mode access | A/B/C |
| 13 | `18ea497` | Tenant-scoped before/after field-photo evidence | A/B/C |

At audit start the working tree was clean. `master` and `origin/master` both resolved to `031bb46`; neither was checked out, changed, merged, pushed, or deployed during this audit.

## 2. Role And Capability Matrix

`App.jsx` filters navigation through `NAV_ITEMS` and `useCanView()`. The page renderer repeats the same authorization check before rendering page state. Unauthorized page state renders the existing access-denied view, and role changes fall back to the role's default page. This is state-based routing; URL paths do not independently bypass the page authorization check.

| Surface/capability | Customer | Employee | Admin | Super-admin |
| --- | --- | --- | --- | --- |
| Dashboard | Denied | Denied | Allowed | Allowed after intended tenant context |
| Create Estimate | Denied | Denied | Allowed | Allowed after tenant selection |
| Customers | Denied | Denied | Allowed | Allowed after tenant selection |
| Bookings | Denied | Denied | Allowed | **D: nav allowed, selected tenant not propagated** |
| Calendar | Denied | Denied | Allowed, read-only | **D: nav allowed, selected tenant not propagated** |
| Field Mode | Denied | Only normal employee surface | Allowed for owner testing | **D: nav allowed, selected tenant not propagated** |
| Business Settings | Denied | Denied | Allowed | Allowed after tenant selection |
| Data Export | Denied | Denied | Allowed | Allowed after tenant selection |
| Customer Portal | Only normal customer surface | Denied | Denied | Denied |
| Stripe Connect onboarding | Denied | Denied | Business Settings only | Business Settings after tenant selection |
| Field execution writes | Denied | Allowed-key patch only | Admin booking access remains | Super-admin rules allow; UI tenant gap applies |
| Field-photo upload | Denied | Allowed | No upload control | No upload control |
| Field-photo review | Denied | Own-tenant Field Mode display | Read-only in Booking Detail | Rules allow; UI tenant gap applies |
| Payment badge/internal owner notes in Field Mode | Denied | Hidden | Visible where existing admin UI allows | Visible where existing admin UI allows |

Identity handling:

- Missing profile: signed out with a configuration message. A.
- Unknown role: signed out with an unsupported-role message. A.
- Explicit `inactive`, `disabled`, or `suspended`: signed out. A.
- Employee: requires exact `role: employee`, `status: active`, and non-empty `tenantId`. A.
- Customer and employee tenant loading avoids the full tenant document. A.
- Admin rules require matching tenant profile plus membership in `adminUsers`; explicit non-active statuses fail. C for production data preparation.
- Super-admin profile tenant ID is intentionally null and tenant switching sets `currentTenant`. `Dashboard`, `Customers`, `Business Settings`, and `Data Export` resolve that selected tenant. `BookingsList`, `CalendarView`, and `FieldMode` consume `AuthContext.tenantId`, which still exposes only `userProfile.tenantId`. D.

Smallest super-admin follow-up: expose one resolved active tenant ID from `AuthContext` (`currentTenant.id` when selected, otherwise profile tenant ID), or consistently resolve `currentTenant` inside the three affected components. Add super-admin selected-tenant render tests. Do not change the role model.

## 3. Canonical Data Paths

| Domain | Canonical path | Audit result |
| --- | --- | --- |
| User profile | `users/{uid}` | A |
| Tenant | `tenants/{tenantId}` | A |
| Customers | `tenants/{tenantId}/customers/{customerId}` | A |
| Leads/quote requests | `tenants/{tenantId}/leads/{leadId}` | A |
| Bookings | `tenants/{tenantId}/bookings/{bookingId}` | A |
| Field-photo metadata | `tenants/{tenantId}/bookings/{bookingId}/fieldPhotos/{photoId}` | A |
| Field-photo object | `tenants/{tenantId}/bookings/{bookingId}/field-photos/{phase}/{photoId}.{extension}` | A |
| Business Settings | nested `tenants/{tenantId}.businessSettings` | A; no competing model added |

No active V1 source write was found to a global `leads` collection, `tenants/DEFAULT`, or global `jobPhotos`. Customer quote submission creates only a tenant lead. It does not create a booking, payment, Stripe session, or reserved appointment.

`updateBookingFieldExecution()` uses an allowlisted patch builder. It cannot add payment, Stripe, customer, lead, schedule, price, assignment, archive, delete, or arbitrary booking fields. Field-photo metadata is written to the nested subcollection and does not update the parent booking. CSV export reads customers, leads, and bookings through tenant-scoped services.

Remaining legacy paths exist outside the approved normal V1 surfaces, including super-admin/deferred modules and unmounted services for `jobs`, `properties`, legacy `photos`, signatures, branding, documents, incidents, property conditions, AI data, time clock, appointments, and similar collections. They were not cleaned up in this audit. Their existence is distinct from the canonical V1 paths, but their rules and Storage compatibility must be resolved before deploying a single global ruleset.

## 4. Firebase Configuration, Rules, And Indexes

### Configuration

`cloud-functions/firebase.json` points to:

- Firestore rules: `cloud-functions/firestore.rules`
- Firestore indexes: `cloud-functions/firestore.indexes.json`
- Storage rules: `cloud-functions/storage.rules`
- Functions runtime: Node 22

The rules scripts pin Firebase CLI `13.35.1` and use project `demo-servicesos-rules`. The combined command runs Firestore and Storage suites sequentially against the same emulator invocation.

### Firestore rule status

The new V1 rules are internally ordered correctly:

- customer lead create/read is tied to active customer profile, matching tenant, matching `createdByAuthUid`, and linked `customers/{customerId}.authUid`;
- customers cannot update/delete leads or customer records;
- employee booking updates use changed-key allowlisting;
- nested `fieldPhotos` rules do not inherit broad parent writes;
- employee access requires active profile, matching tenant, and tenant `users` membership;
- customer, unauthenticated, and cross-tenant photo access is denied;
- self-profile updates cannot change role, tenant, or status.

However, `cloud-functions/firestore.rules` and `shared/firestore.rules` are not equivalent. Storage mirrors are byte-equivalent, but Firestore mirrors differ for `quotes`, `jobs`, `properties`, legacy `photos`, `ai_learning_data`, `customer_reviews`, `employees`, `appointments`, and `time_clock`.

The deploy-source file retains `isLegacyBroadAccessUser()` on those legacy matches. That helper includes customer, admin, and super-admin without checking the requested tenant. It can therefore permit recognized users to access legacy collections outside their tenant. It also retains broad recognized-role tenant creation and `tenant_usage` access. This is a D blocker even though those pages are not normal customer navigation: client rules must be safe against direct SDK calls.

Smallest rules follow-up: make the deploy source and mirror identical, remove cross-tenant temporary legacy access, retain the tested V1 lead/customer/booking/field-photo/user rules, and add emulator assertions for customer/admin cross-tenant denial on every retained legacy match. Do not deploy either current Firestore file before that slice passes.

### Storage rule status

The Storage mirror files are equivalent and the Field Mode path is narrow. The rules reject unsupported MIME types, extension mismatches, zero bytes, files above 10 MB, invalid phases, `DEFAULT`, global paths, inactive/tenantless/cross-tenant employees, customers, and anonymous users. Employees cannot overwrite or delete persisted evidence; matching admin/employee and super-admin can read.

`cloud-functions/storage.rules` did not exist at protected base `031bb46`. It now contains only the Field Mode evidence match. Deploying it would deny unmatched existing paths, including currently mounted super-admin branding and legacy/unmounted signature, photo, document, incident, and property-condition paths. This is a D deployment blocker. Inventory each path, retire it explicitly or add separately reviewed least-privilege rules, then rerun all Storage tests.

### Index audit

Active normal V1 queries:

- Customers: tenant collection ordered by `name`; single-field index.
- Leads/dashboard/export: tenant collection ordered by `createdAt`; single-field index.
- Bookings/Calendar/Field Mode/export: tenant collection ordered by `date`; single-field index.
- Customer identity: one equality on `authUid` plus `limit(1)`; single-field index.
- Customer-owned quote requests: equality on `tenantId`, `createdByAuthUid`, `type`, and `source`, with client-side date sorting. Firestore can normally merge equality indexes, so no missing composite is proven. B: run the exact query against the target project before promotion because the emulator does not validate production index availability.
- Field-photo metadata: direct subcollection read with client-side sorting; no composite.

No proven active normal-V1 composite index is missing, so this audit does not change the canonical index file. If the target project returns `FAILED_PRECONDITION` for the customer-owned request query, use the generated console link or add this collection-scoped definition:

```json
{
  "collectionGroup": "leads",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "tenantId", "order": "ASCENDING" },
    { "fieldPath": "createdByAuthUid", "order": "ASCENDING" },
    { "fieldPath": "type", "order": "ASCENDING" },
    { "fieldPath": "source", "order": "ASCENDING" }
  ]
}
```

The super-admin-only Staff Scheduling service uses `where(date == ...)` plus `orderBy(startTime)`. The existing `bookings` index is `COLLECTION_GROUP` scope and may not satisfy this tenant collection query. If Staff Scheduling remains mounted for release, prove or add a `COLLECTION` scope `bookings` index with `date ASCENDING`, `startTime ASCENDING`. `getLeadsByStatus()` similarly needs `status ASCENDING`, `createdAt DESCENDING` if it becomes active; no mounted V1 caller was found.

## 5. Photo Integration Audit

| Requirement | Result |
| --- | --- |
| Tenant/booking/phase generated path | A |
| No customer name/address/original filename in path | A |
| JPEG/PNG/WebP only | A |
| Zero-byte and over-10-MB rejection | A |
| Success only after Storage and metadata writes | A |
| Cleanup attempt after metadata failure | A; delete is rule-denied for employee, so orphan risk remains E |
| No persisted download URL | A |
| Authenticated `getBlob()` | A in code; B/C in deployed browser |
| Object URL revocation | A |
| Customer privacy | A in code/rules/tests; B in browser |
| Employee upload/admin read-only review | A in code/rules/tests; B in browser |
| Payment mutation | None found; A |

`getBlob()` browser behavior cannot be proven by emulator/unit tests. Firebase Storage browser downloads can depend on the target bucket's CORS policy. Authenticated smoke must upload as an employee, refresh, load the same object via `getBlob()`, then load it as a tenant admin from Booking Detail while checking the browser network panel for preflight/CORS failures. Repeat from the intended production origin and an approved local origin. If CORS fails, configure only the required bucket origins/methods/response headers; do not replace authenticated reads with public download URLs.

## 6. Migration And Provisioning Checklist

Complete this checklist against fake/staging data before any rules deployment:

- [ ] Export/back up `users`, target tenant documents, customers, leads, bookings, and Stripe status fields.
- [ ] Customer Auth user exists.
- [ ] `users/{uid}` has `role: customer`, `status: active`, and matching non-empty `tenantId`.
- [ ] `tenants/{tenantId}/customers/{customerId}.authUid` equals the Auth UID.
- [ ] Customer record is not archived, disabled, or inactive.
- [ ] Legacy email-only customer records are linked by `authUid` or intentionally excluded; email matching is not ownership.
- [ ] Employee Auth user exists.
- [ ] Employee `users/{uid}` has exact `role: employee`, `status: active`, and matching non-empty `tenantId`.
- [ ] Employee UID is in `tenants/{tenantId}.users`.
- [ ] Tenant admin `users/{uid}` has `role: admin`, active status, and matching `tenantId`.
- [ ] Tenant admin UID is in both the tenant membership used by the app and `tenants/{tenantId}.adminUsers`.
- [ ] Tenant document exists and contains arrays expected by rules; missing arrays can cause rule evaluation denial.
- [ ] Super-admin has `role: super-admin`; do not assign a fake tenant ID to work around the selected-tenant bug.
- [ ] Existing root business fields and nested `businessSettings` are reviewed. Reads fall back from nested to legacy root fields; saves write the nested model.
- [ ] Bookings without `fieldStatus`, checklist, completion data, or photo subcollections render calm empty/default states.
- [ ] Existing booking price, schedule, customer, payment, Stripe, assignment, and archive fields are backed up before rules/application promotion.
- [ ] Existing Stripe fields (`stripeAccountId`, `chargesEnabled`, `payoutsEnabled`, `stripeStatus`, `stripeConnectStatus`, `stripeAccountStatus`, `stripeAccountMode`) are inspected but not rewritten or migrated.
- [ ] Target Storage bucket name and browser CORS behavior are verified.
- [ ] Existing Storage objects and all still-required object path families are inventoried before replacing bucket rules.
- [ ] Target project runs the customer-owned request query and any retained Staff Scheduling query without a missing-index error.

## 7. Payment Truth Audit

Result: **A for code invariants, B for deployed Stripe behavior. No unexpected checkout, webhook, fee, refund, or Connect backend diff was found.**

- Payment-link creation remains distinct from payment confirmation.
- Booking creation and customer quote submission do not mark payment paid.
- Manual payment uses the existing owner-entered path and remains distinct from `paymentStatusUpdatedBy: stripe_webhook`.
- CSV payment rows include `paymentStatusUpdatedBy` and `stripeConfirmed`; Stripe identifiers and secrets are not exported.
- Field execution and completion patches exclude payment and Stripe fields.
- Field-photo upload writes only Storage plus nested photo metadata.
- Business Settings save sanitizes business fields and does not include Stripe fields.
- Stripe onboarding still calls the existing `createConnectedAccount`, `generateOnboardingLink`, and `getConnectedAccountStatus` helpers.
- The only Stripe-named application file changed is `StripeConnectOnboarding.jsx`, for status/action presentation and restored use of existing helpers. Stripe service, checkout, webhook, platform-fee, refund, and Cloud Functions runtime behavior were not changed by these V1 slices.

## 8. Validation Results

Run on `v1-lab-v1-integration-readiness` at audited code HEAD `18ea497`:

| Command | Result |
| --- | --- |
| Web `npm run lint` | Pass |
| Web `npm test -- --run` | Pass: 43 files, 349 tests |
| Web `npm run build` | Pass: 321 modules; existing large-chunk/dynamic-import warnings only |
| Cloud Functions `npm test` | Pass: 32 tests |
| `npm run test:firestore-rules` | Pass: 1 suite, 20 tests |
| `npm run test:storage-rules` | Pass: 1 suite, 7 tests |
| `npm run test:rules` | Pass sequentially: Firestore 20 plus Storage 7 |

Automated validation does not prove authenticated deployed behavior, production indexes, bucket CORS, Stripe account readiness, or persistence after browser refresh.

## 9. Authenticated Browser Smoke Checklist

Use fake data and separate browser profiles. Record pass/fail, timestamp, UID, tenant, booking/request IDs, console errors, and screenshots where useful.

### Tenant admin

- [ ] Sign in and confirm Dashboard loads without console errors.
- [ ] Create Estimate loads and saves only to the selected tenant.
- [ ] Review a customer request and create a booking through the existing flow.
- [ ] Refresh and confirm lead/booking persistence.
- [ ] Customers load; archive preserves the record and does not hard-delete.
- [ ] Booking Detail loads; cancel preserves payment history and Stripe references.
- [ ] Business Settings save and survive refresh.
- [ ] Stripe status is honest; Connect/Resume appears only when supported by tenant data.
- [ ] Data Export downloads customers, leads, bookings, and payment CSVs for this tenant only.
- [ ] Payment CSV distinguishes manual from `stripe_webhook` confirmation.
- [ ] Employee field status, checklist summary, notes, issue flag, and completion timestamps display read-only.
- [ ] Before/after photos load through authenticated review; no upload/delete admin control appears.

### Active tenant employee

- [ ] Sign in and confirm navigation contains Field Mode and Sign out only.
- [ ] Dashboard, estimates, customers, bookings admin, Calendar, Business Settings, Data Export, Customer Portal, and super-admin pages remain blocked.
- [ ] Confirm no payment badge and no internal owner notes.
- [ ] Start a job; refresh and confirm `in_progress` persists.
- [ ] Save checklist, field notes, and issue flag; refresh after each meaningful write.
- [ ] Upload supported before and after photos; refresh and confirm authenticated previews load.
- [ ] Reject unsupported, empty, and over-10-MB files honestly.
- [ ] Attempt completion without a persisted after photo and confirm the warning.
- [ ] Complete the job and confirm completion fields persist.
- [ ] Confirm payment status, amount, price, customer, schedule, assignment, and archive fields did not change.

### Linked tenant customer

- [ ] Sign in and confirm Customer Portal is the only normal surface.
- [ ] Confirm only own requests load.
- [ ] Submit a quote request and confirm copy says owner review, not confirmed booking.
- [ ] Refresh and confirm the request persists.
- [ ] Confirm no booking, payment, or Stripe session was created.
- [ ] Confirm Field Mode, Data Export, admin pages, field-photo metadata, and Storage objects are inaccessible.

### Second-tenant user

- [ ] Attempt direct reads/writes against first-tenant lead, customer, booking, field-photo metadata, and photo object paths; all must be denied.
- [ ] Confirm first-tenant IDs are not exposed through UI lists or exports.

### Super-admin

- [ ] Confirm global tenant-management landing remains available.
- [ ] Select a tenant and verify Dashboard, Customers, Business Settings, and Data Export.
- [ ] Record expected failure for Bookings, Calendar, and Field Mode until the selected-tenant propagation blocker is fixed.
- [ ] After that fix, repeat Booking Detail and field-photo review with selected tenant, then clear selection and confirm tenant pages do not silently reuse stale scope.

### Payment truth

- [ ] Creating a payment link does not mark a booking paid.
- [ ] Field start/checklist/notes/issue/completion does not change payment fields.
- [ ] Photo upload does not change payment fields.
- [ ] Manual paid-another-way remains owner-entered and visibly distinct.
- [ ] Stripe paid status is accepted only after existing verified webhook behavior in a separate test-mode Stripe smoke.

## 10. Ordered Integration And Deployment Plan

1. **Preserve the freeze.** Keep `master`/`origin/master` at `031bb46` through the July 20 smoke. Tag or record that exact rollback reference. Do not merge lab history during the frozen smoke.
2. **Fix D blockers on separate lab slices.** First reconcile/harden Firestore rules and mirrors. Separately resolve Storage path compatibility. Separately fix super-admin selected-tenant propagation. Re-run all validation after each.
3. **Create a controlled integration branch.** Merge or fast-forward the completed lab slices in their existing linear order. Do not rewrite the audited history.
4. **Back up and inventory.** Export relevant Firestore collections and Storage object inventory. Record current deployed Firestore/Storage rules, indexes, web deploy ID, and function revisions.
5. **Provision staging/test identities and data.** Complete the checklist above for two tenants, admin, employee, customer, and super-admin.
6. **Prove indexes in the target project.** Run exact V1 queries. Add only proven index definitions and wait for index build completion before smoke.
7. **Validate bucket CORS and Storage path policy.** Ensure every still-supported Storage path has reviewed rules. Test `getBlob()` from intended origins.
8. **Run authenticated smoke against emulators or a dedicated staging Firebase project.** Do not describe unit/emulator results as browser validation.
9. **Deploy the web app to staging before production rules.** Most new fields are optional and the app is backward-compatible with old booking documents. Do not expose employee/photo workflows to production while old broad rules remain.
10. **Deploy hardened rules in a controlled window after data preparation.** Firestore admin/customer/employee membership prerequisites must already exist. Storage rules must include all retained path families. Rules and the new app should be promoted close together because the employee workflow needs both, while the current broad Firestore rules are unsafe for employee exposure.
11. **Do not redeploy Cloud Functions unless an independent function diff requires it.** These slices did not change runtime payment functions.
12. **Run immediate post-deploy smoke.** Repeat admin, employee, customer, cross-tenant, photo, export, refresh-persistence, and payment-truth checks. Monitor permission denials and Storage CORS/network errors.

Backward-compatible application changes include optional booking field rendering, read-only owner completion/photo review, nested Business Settings fallback, archive/cancel UI, copy-ready messages, and CSV export. Rule changes are not automatically backward-compatible: hardened admin/customer membership requirements can block unprepared records, and the current Storage rules would block unmatched legacy object paths.

## 11. Rollback Plan

- Frozen application rollback: `031bb46249fd09bbe7014e5f9747d4a7a4737a6f`.
- Lab code rollback before integration: `18ea497` is the audited pre-report V1 head; each slice can also be reverted by its listed commit if needed.
- Before deployment, save the exact current production Firestore rules, Storage rules, index definitions, web deploy ID, and function revisions outside the deploy working tree.
- Web rollback: restore the previous known-good deploy built from `031bb46`.
- Rules rollback: redeploy the captured prior rules only after confirming they remain compatible with any writes created during the failed window. Never use a broad permissive emergency rule.
- Data rollback: restore only from the pre-deploy export after reviewing writes made after backup time. Prefer forward repair for valid new customer/field/photo records.
- Storage rollback: rules rollback does not delete objects. Keep object inventory and reconcile orphan field-photo objects separately.
- Stop/rollback trigger: cross-tenant access, customer photo visibility, employee broad booking write, owner/admin lockout, widespread permission denial, CORS-blocked evidence review, or any field action changing payment truth.

## 12. Findings And Deferred Work

### D - Blockers

- Firestore deploy source and mirror diverge; deploy source retains cross-tenant temporary legacy access.
- Super-admin selected tenant is not propagated to Bookings, Calendar, or Field Mode.
- Storage rules cover only new evidence and would deny still-existing Storage path families if deployed unchanged.

### B - Authenticated smoke required

- End-to-end role navigation and rendered denial.
- Customer own-request visibility and persistence.
- Field execution persistence after refresh.
- Employee upload and admin `getBlob()` review.
- Data Export browser downloads and tenant contents.
- Business Settings persistence and Stripe onboarding button state.
- Deployed Stripe test-mode confirmation remains a separate payment smoke.

### C - Data/configuration required

- Customer `authUid` linking and active profiles.
- Employee/admin tenant membership arrays and active profile fields.
- Production query/index proof.
- Bucket CORS and complete Storage path policy.
- Backup/export and staging persona setup.

### E - Deferred V1.1

- Assigned-worker-only booking and photo filtering.
- Full offline queue/background retry.
- Automatic orphaned-Storage cleanup.
- Employee management/invitation UI.
- Public tenant-specific quote links.
- Photo deletion/retention management.
- Expenses and mileage.
- Training Library.
- Tap to Pay.

## Final Recommendation

Do not merge or deploy yet. The safest next action is a narrow **Firebase rules source and legacy-path reconciliation slice**, because the deploy-source Firestore rules and the new Storage rules are the highest-risk integration boundary. After that passes combined emulator tests, fix super-admin selected-tenant propagation, provision staging personas/data, and run the authenticated smoke matrix.

Recommended commit message for this report: `Add ServicesOS V1 integration readiness report`
