# Firebase Rules Reconciliation Report

Audit date: 2026-07-13
Lab branch: `v1-lab-firebase-rules-reconciliation`
Lab base: `2dba41e`
Protected production candidate: `master` / `origin/master` at `031bb46249fd09bbe7014e5f9747d4a7a4737a6f`
Deployment performed: No

## Decision Summary

The canonical deploy sources are:

- Firestore: `cloud-functions/firestore.rules`
- Storage: `cloud-functions/storage.rules`

`cloud-functions/firebase.json` points to those files. `shared/firestore.rules` and `shared/storage.rules` are exact mirrors for repository consumers; they are not independent implementations.

The reconciled rules remove broad authenticated-user access from tenant business data. Supported paths require an active recognized profile plus the applicable tenant, role, membership, ownership, changed-key, and data-shape checks. Unknown, stale, global, `DEFAULT`-tenant, and unproven paths are denied.

This work resolves the repository rules-source conflict and proves the local emulator contract. It does **not** prove live compatibility. Production Storage object inventory, production identity/membership consistency, deployed-rule capture, and authenticated browser smoke are still required before deployment.

## Rule Editing Workflow

1. Edit the canonical file under `cloud-functions/`.
2. Apply the same reviewed content to the corresponding `shared/` mirror.
3. Run `npm run test:rules-parity` from `cloud-functions`.
4. Run Firestore, Storage, and combined emulator suites.
5. Never deploy a mirror directly.

The parity script normalizes CRLF to LF but otherwise compares exact content. It also verifies `firebase.json` uses `firestore.rules` and `storage.rules` from the Cloud Functions directory.

## Classification Key

- **A - Active V1:** mounted and required by an approved current surface.
- **B - Mounted compatibility:** reachable only from an existing super-admin/deferred surface.
- **C - Unmounted/stale:** source exists but no canonical app-shell route reaches it.
- **D - Migration required:** ownership or tenant scope cannot be proven safely.
- **E - Production inventory required:** repository evidence is insufficient to prove deployed data/object compatibility.

## Active Firestore Path Inventory

| Path | Type and caller | Read | Create | Update/delete | Isolation | Class / notes |
| --- | --- | --- | --- | --- | --- | --- |
| `users/{uid}` | Auth profile; `AuthContext`, customer identity | Self | Self only as active customer in an existing non-`DEFAULT` tenant | Self allowlist: `displayName`, `phone`, `photoURL`, `updatedAt`; no delete | Auth UID equals document ID | A. Role, tenant, status, permission, and admin authority remain immutable client-side. |
| `tenants/{tenantId}` | Tenant context and Business Settings | Active matching tenant admin; active super-admin | Active super-admin only; no `DEFAULT` | Super-admin, or tenant admin changing only `businessSettings`, `updatedAt`, `updatedByUid` | Profile tenant plus `adminUsers` membership | A. Employees/customers cannot read or create tenant administration data. |
| `tenants/{tenantId}/customers/{customerId}` | Customers, export, linked customer portal identity | Admin/super-admin; linked active customer reads own record | Admin/super-admin | Admin/super-admin | Admin membership or customer record `authUid` ownership | A. Customer cannot modify linked record. |
| `tenants/{tenantId}/leads/{leadId}` | Dashboard, Create Estimate, customer quote requests, export | Admin/super-admin; customer reads owned quote requests | Admin/super-admin; customer may create strict owned quote request | Admin/super-admin only | Tenant admin membership or customer UID + linked customer ownership | A. Create Estimate uses leads; no mounted estimates collection is required. |
| `tenants/{tenantId}/bookings/{bookingId}` | Bookings, Calendar, Dashboard, Field Mode, export | Admin/super-admin; active matching employee | Admin/super-admin with proven quote-to-booking field allowlist | Admin/super-admin safe admin/manual-payment/field/route allowlist; employee Field Mode allowlist; manager delete | Existing tenant, profile tenant, membership, role, changed keys | A. Link creation and Stripe-confirmed fields are not client-writable. |
| `.../bookings/{bookingId}/fieldPhotos/{photoId}` | `fieldPhotoService`, Field Mode, Booking Detail review | Admin/super-admin; active matching employee | Active matching employee with exact metadata/path contract | None | Parent tenant membership plus exact object identity | A. Customer denied. Metadata is immutable evidence. |
| `tenants/{tenantId}/payments/{paymentId}` | Legacy/reporting compatibility; no current manual-payment write | Admin/super-admin | None | None | Existing tenant plus admin membership | D/E for writes. Client writes cannot safely distinguish Stripe-confirmed truth. Manual V1 payment stays on booking fields. |
| `tenants/{tenantId}/employees/{employeeId}` | Mounted super-admin Staff Scheduling | Active super-admin | Active super-admin | Active super-admin | Existing non-`DEFAULT` tenant | B. Normal admin/employee/customer denied. |
| `tenants/{tenantId}/branding/{brandingId}` | Mounted super-admin Company Settings configuration | Active super-admin | Active super-admin | Active super-admin | Existing non-`DEFAULT` tenant | B. Separate from Storage branding object. |
| `tenants/{tenantId}/insurance/{insuranceId}` | Mounted super-admin Insurance | Active super-admin | Active super-admin | Active super-admin | Existing non-`DEFAULT` tenant | B. No normal-admin exposure is added. |
| `tenant_usage/{tenantId}` | Mounted super-admin Tenant Management compatibility | Active super-admin | Active super-admin | Active super-admin | Non-`DEFAULT` document ID | B. Global administration data, not tenant-member data. |
| `ai_usage/{tenantId}` | Super-admin AI usage helper | Active super-admin | Active super-admin | Active super-admin | Non-`DEFAULT` document ID | B. GrowthAI Phase 0 itself remains local-only. |
| `ai_credit_history/{historyId}` | Super-admin AI usage helper | Active super-admin | Active super-admin | None | Super-admin role | B. Immutable after creation. |
| `tenant_billing/{billingId}` | Billing status compatibility | Super-admin or matching tenant admin from stored `tenantId` | None | None | Trusted existing document tenant ID | B/E. Read-only client contract; production inventory required. |

Cloud Functions use Firebase Admin SDK and bypass client rules. Booking Stripe checkout and webhook functions still access tenant bookings through Admin SDK; this rules slice does not change their behavior.

## Firestore Access Matrix

| Operation | Customer | Employee | Tenant admin | Super-admin |
| --- | --- | --- | --- | --- |
| Own user profile read/safe edit | Yes | Yes | Yes | Yes |
| Tenant root read | No | No | Own tenant | Yes, existing tenant |
| Tenant membership/Stripe field edit | No | No | No | Existing intentional management access |
| Customer records | Own linked read only | No | Own tenant CRUD | Existing tenant CRUD |
| Leads | Owned quote request create/read | No | Own tenant CRUD | Existing tenant CRUD |
| Bookings read | No | Own tenant | Own tenant | Existing tenant |
| Booking create/admin edit | No | No | Safe admin/manual allowlists | Safe admin/manual allowlists plus route-only allowlist |
| Field execution edit | No | Approved keys only | Approved manager keys | Approved manager keys |
| Booking Stripe-confirmed fields | No | No | No | No client write |
| Payment documents | No | No | Read only | Read only |
| Mounted employees/branding/insurance | No | No | No | Existing tenant CRUD |
| Unknown/stale paths | No | No | No | No |

### Booking payment outcome

The tenant `payments` collection is client-read-only for tenant admins and super-admins. No client can fabricate a payment document.

Manual paid-another-way details remain on `bookings/{bookingId}`. A tenant manager may change only the existing manual payment fields, must set `paymentStatusUpdatedBy` to the authenticated UID, and must use the approved manual status/method values. The rules deny client changes to Stripe checkout/session/payment-intent, platform-fee, and refund fields. `paymentStatusUpdatedBy: stripe_webhook` cannot be spoofed by an admin client.

Stripe webhook Admin SDK writes are unaffected by client rules.

## Explicitly Denied Firestore Paths

These tenant collections are denied because their source files are unmounted, their ownership contract is unproven, or the current V1 uses a different canonical path:

- `quotes` (Create Estimate uses `leads`)
- `jobs` (current job management uses `bookings`)
- `properties`
- legacy `photos`
- `appointments`
- `ai_learning_data`
- `ai_models`
- `customer_reviews`
- `white_label_domains`
- `upsell_offers`, `upsell_impressions`, `upsell_acceptances`
- `time_clock`
- any other tenant subcollection caught by the tenant fallback

Any unknown global collection is denied by the global fallback. `tenants/DEFAULT` is denied on tenant documents and every supported nested tenant path, including super-admin requests.

Several other service files reference contracts, messages, notifications, recurring jobs, invoices, incidents, property conditions, expenses, training, signatures, and similar paths. They are not mounted in the canonical app shell for this V1 slice and receive no rule exception.

## Active Storage Path Inventory

| Object path | Caller | Read | Create | Update/delete | Limits | Class / notes |
| --- | --- | --- | --- | --- | --- | --- |
| `tenants/{tenantId}/bookings/{bookingId}/field-photos/{before|after}/{photoId}.{jpg|png|webp}` | Field Mode and Booking Detail via `fieldPhotoService` | Active matching employee, tenant admin, super-admin | Active matching employee | None | JPEG/PNG/WebP, exact extension, nonzero, max 10 MB | A. No original customer/file name in canonical path. |
| `tenants/{tenantId}/branding/{fileName}` | Mounted super-admin Company Settings/branding service | Active super-admin | Active super-admin | None | JPEG/PNG/WebP/GIF/ICO, nonzero, max 5 MB; SVG denied | B/E. Current app path may include the original filename; inventory and filename migration review are required. |

Storage authorization reads the same Firestore user profiles and tenant membership arrays as Firestore rules. Missing profiles, unknown roles, inactive/disabled/suspended users, tenant mismatches, `DEFAULT`, customers, and anonymous users are denied.

## Explicitly Denied Storage Paths

- `tenants/{tenantId}/documents/**`
- `tenants/{tenantId}/signatures/**`
- `tenants/{tenantId}/photos/**`
- `tenants/{tenantId}/property_conditions/**`
- `tenants/{tenantId}/incidents/**`
- global `jobPhotos/**`
- `tenants/DEFAULT/**`
- root profile images and arbitrary root uploads
- every unknown path through the catch-all denial

Documents/contracts and signatures require migration before client access. Customer ownership cannot be proven safely from the legacy object paths or trusted metadata. If retained, use a tenant/customer-bound path with reviewed Firestore ownership metadata or signed backend delivery. Do not grant broad customer Storage reads.

No mounted legacy job-photo flow was found. Legacy photo components and employee mobile prototypes remain unmounted, so their object paths are denied rather than preserved.

## Mounted Compatibility Analysis

| Application operation | Path | Role | Rules result | Automated | Browser smoke |
| --- | --- | --- | --- | --- | --- |
| Dashboard/load/export leads | tenant leads | Admin | Allowed | Yes | Required |
| Create Estimate | tenant leads | Admin | Allowed | Lead rules covered | Required |
| Customer quote request | tenant leads + linked customer | Customer | Strict own create/read | Yes | Required |
| Customers/archive | tenant customers | Admin | Allowed | Existing coverage | Required |
| Quote request to booking | tenant booking + lead update | Admin | Allowed safe booking shape | Yes | Required |
| Booking limited edit/cancel | tenant booking | Admin | Allowed approved keys | Existing and emulator coverage | Required |
| Manual paid-another-way | tenant booking | Admin | Allowed with authenticated updater; Stripe fields denied | Yes | Required |
| Stripe checkout/webhook | tenant booking through Admin SDK | Function runtime | Client rules do not apply | Function tests | Separate deployed Stripe smoke |
| Calendar | tenant bookings | Admin | Read allowed | Existing app tests | Required |
| Employee Field Mode | tenant bookings | Employee | Read plus execution allowlist | Yes | Required |
| Employee field photo upload | field object + metadata | Employee | Allowed exact contract | Yes | Required, including bucket CORS |
| Owner field photo review | field object + metadata | Admin | Read allowed | Yes | Required |
| Business Settings | tenant root nested settings | Admin | Allowed exact settings shape | Yes | Required |
| Data Export | customers/leads/bookings | Admin | Read allowed | Existing app tests | Required |
| Staff Scheduling | employees/bookings | Super-admin | Allowed for existing tenant | Partial emulator coverage | Required after selected-tenant fix |
| Route Optimization | bookings route fields | Super-admin | Dedicated `routeOrder`, `estimatedTravelTime`, `distanceFromPrevious`, `optimizedAt`, `updatedAt` allowlist | Yes | Required after selected-tenant fix |
| Insurance | tenant insurance policy | Super-admin | Allowed | Mounted path covered | Required |
| Company Settings branding | Firestore branding + Storage branding | Super-admin | Allowed create/read; Storage immutable | Yes | Required plus object inventory |
| Tenant Management usage | tenant + `tenant_usage` | Super-admin | Allowed | Yes | Required |
| AI usage helper | `ai_usage`, `ai_credit_history` | Super-admin | Allowed | Yes | Required if retained |

No mounted normal-admin operation is intentionally blocked by the reconciled rules based on repository evidence. The following remain constrained:

- Super-admin Bookings, Calendar, and Field Mode still have the separate selected-tenant propagation blocker documented in the integration-readiness report. It was not changed here.
- Normal tenant admins cannot use super-admin-only Staff Scheduling, Insurance, Company Settings branding, or AI usage paths. This matches current navigation.
- Legacy/unmounted services will receive permission denied. This is classification A (correctly blocked unsafe behavior) until a separate mounted migration proves need.
- Branding upload needs classification D/E review because current filenames may include user-provided names and production objects are unknown.
- Documents/signatures/legacy photos are classification B/D: application migration and production inventory are required before support.

## Emulator Coverage

Firestore scenarios cover:

- customer-owned quote request create/read/query and spoof denial;
- linked customer ownership and cross-tenant denial;
- safe self-profile edit and immutable role/tenant/status;
- active employee booking read and every Field Mode execution key;
- employee denial for payment, Stripe, price, schedule, customer, assignment, delete, and unrelated collections;
- field-photo metadata shape, identity, immutable evidence, and role/tenant boundaries;
- tenant admin/super-admin booking access;
- Business Settings allowlist and tenant membership/Stripe-field denial;
- tenant creation and tenant root denial for employee/customer/anonymous users;
- payment document read-only contract;
- proven quote-to-booking create shape;
- manual payment updater identity and Stripe/platform-fee/refund denial;
- mounted super-admin compatibility paths;
- stale, global, `DEFAULT`, and unknown path denial.

Storage scenarios cover:

- supported before/after field evidence;
- MIME, extension, zero-byte, size, phase, tenant, role, status, customer, anonymous, overwrite, and delete restrictions;
- super-admin branding create/read plus role, MIME, size, `DEFAULT`, overwrite, and delete restrictions;
- missing profile and unknown role denial;
- legacy documents/signatures/photos/property-condition/incidents/global/unknown path denial.

Parity tests cover both rule mirrors and both `firebase.json` deploy-source pointers.

## Production Prerequisites And Blockers

Do not deploy until all items are complete:

1. Capture the exact currently deployed Firestore rules, Storage rules, index configuration, Firebase release/deployment identifier, web deploy ID, and function revisions.
2. Export/back up relevant Firestore tenant/user/customer/lead/booking/payment data.
3. Inventory all Storage object path prefixes and counts, especially branding, documents, contracts, signatures, legacy photos, `jobPhotos`, root uploads, and `tenants/DEFAULT`.
4. Confirm whether production Company Settings branding objects use user-provided filenames and decide whether to migrate to generated object IDs.
5. Confirm every admin/employee/customer user profile has the expected exact role, active status, tenant ID, and required tenant membership array entry.
6. Confirm linked customers have complete `authUid` ownership fields.
7. Confirm no production workflow still depends on denied legacy collections or object paths.
8. Run the exact mounted Firestore queries against a staging project and verify required indexes.
9. Run authenticated browser smoke with two tenants, admin, employee, linked customer, and super-admin. Include refresh persistence and direct cross-tenant attempts.
10. Verify authenticated Storage reads and `getBlob()` CORS from the intended web origin and approved local origins.
11. Resolve the separate super-admin selected-tenant propagation blocker before claiming all super-admin mounted operations compatible.

Storage deployment remains blocked pending production object-path inventory. Repository searches cannot prove which historical objects exist or are still operationally required.

## Rollback Considerations

- Keep `031bb46249fd09bbe7014e5f9747d4a7a4737a6f` recorded as the frozen application reference.
- Save deployed rule files before any future rules release; repository history is not proof of the currently deployed rules.
- Save Storage object inventory and Firestore exports before deployment.
- Promote rules first to a dedicated staging project with representative identity/membership data.
- If production promotion causes broad permission denials, cross-tenant exposure, or evidence-read failures, stop traffic and redeploy the captured prior rules after checking writes made during the window.
- Never use an authenticated wildcard or broad permissive emergency rule.
- Rules rollback does not remove or restore data/objects. Reconcile post-backup writes separately.

## Verification Commands

From `cloud-functions`:

```powershell
npm test
npm run test:rules-parity
npm run test:firestore-rules
npm run test:storage-rules
npm run test:rules
```

From `servicesos-web`:

```powershell
npm run lint
npm test -- --run
npm run build
```

Repository checks:

```powershell
git status -sb
git diff --check
git diff --no-index -- cloud-functions/firestore.rules shared/firestore.rules
git diff --no-index -- cloud-functions/storage.rules shared/storage.rules
```

## Validation Results

| Command | Result |
| --- | --- |
| Web `npm run lint` | Pass |
| Web `npm test -- --run` | Pass: 43 files, 349 tests |
| Web `npm run build` | Pass: 321 modules; existing dynamic-import and large-chunk warnings only |
| Cloud Functions `npm test` | Pass: 35 tests, including 3 parity unit tests |
| `npm run test:rules-parity` | Pass |
| `npm run test:firestore-rules` | Pass: 1 suite, 27 tests |
| `npm run test:storage-rules` | Pass: 1 suite, 12 tests |
| `npm run test:rules` | Pass sequentially: Firestore 27 plus Storage 12 |
| Built application HTTP check | `HTTP 200` from `http://127.0.0.1:5261/` |
| `git diff --check` | Pass |

The first combined web command recorded two unchanged 5-second dynamic-import test timeouts (`login.test.js` and `smoke.test.js`), with 347/349 passing. An immediate isolated rerun passed all 349 tests. No files from either timed-out test or their imported application modules changed in this rules-only slice.

## Remaining Recommendation

Do not deploy this rule set yet. First capture production rules and Storage path inventory, then run the reconciled rules against a dedicated staging project with provisioned personas and authenticated browser smoke. Keep the separate super-admin selected-tenant propagation fix as the next application slice; do not weaken these rules to work around that UI context gap.

Recommended commit message after review: `Reconcile Firebase rules and active legacy paths`
