# ServicesOS V1 Authenticated Smoke Report

Smoke date: 2026-07-14

Branch: `v1-lab-super-admin-tenant-propagation`

Code under test: `ed3e534 Fix super-admin selected-tenant propagation`

Protected production candidate: `master` / `origin/master` at `031bb46`

Deployment performed: No

## Executive Result

The repository and local browser build passed the smoke preflight, but the authenticated browser matrix was **not run**. The Firebase account exposes only `cleaning-intake-system`; no dedicated staging project exists, and the web app has no browser-emulator wiring for Auth, Firestore, or Storage. The local browser build is configured to call that existing Firebase project and opened at the signed-out login screen.

No approval was provided to create test users, alter tenant membership, upload objects, or write smoke data in `cleaning-intake-system`. Doing so would violate the production-data safety boundary in the smoke request. This is classified as **A - test setup/provisioning problem**, not a code failure.

ServicesOS must not be declared customer-ready from this report. The required authenticated role, persistence, cross-tenant, Storage CORS, and payment-truth checks remain unverified in a deployed or approved test environment.

## Repository Safety

| Check | Result |
| --- | --- |
| Current branch | `v1-lab-super-admin-tenant-propagation` |
| Current commit | `ed3e534` |
| Branch tracking | `origin/v1-lab-super-admin-tenant-propagation` |
| Working tree before evidence docs | Clean |
| Full V1 lab ancestry | Present through the completed Field Mode, rules, customer intake, employee access, field-photo, integration, and super-admin slices |
| `master` | Unchanged at `031bb46` |
| `origin/master` | Unchanged at `031bb46` |
| New implementation branch | None |
| Merge/deploy | None |

## Environment Used

### Local browser preflight

- Built web application served locally at `http://127.0.0.1:5262/`.
- HTTP response: 200.
- Browser result: ServicesOS login page rendered and the session was signed out.
- No credentials were entered and no authenticated request was made.

### Firebase target

- Firebase project ID configured by the web app and Firebase CLI: `cleaning-intake-system`.
- Firebase CLI project list exposed no dedicated staging project.
- Storage bucket configured by the web app: `cleaning-intake-system.firebasestorage.app`.
- The web app is not wired to `connectAuthEmulator`, `connectFirestoreEmulator`, or `connectStorageEmulator`.
- Existing emulator configuration supports automated rules tests, not a complete provisioned browser smoke environment.

### Environment decision

The safe-environment order could not progress past preflight:

1. Dedicated staging Firebase project: unavailable.
2. Local Auth/Firestore/Storage browser emulator environment: unavailable without a separate configuration slice.
3. Existing preview/test tenant: not approved for writes and personas were not supplied.
4. Production project: not used because explicit approval and backups were not provided.

Authenticated smoke status: **Not Run - requires an approved safe environment and persona credentials.**

## Persona Provisioning Contract

Use fake identities only. Record UIDs and document IDs in a private operator worksheet, not in screenshots or this repository.

| Persona | Required profile and membership | Provisioning status |
| --- | --- | --- |
| Tenant A admin | `users/{uid}` has `role: admin`, `status: active`, Tenant A `tenantId`; UID is in Tenant A `users` and `adminUsers` | Not provisioned/verified |
| Tenant A employee | `users/{uid}` has `role: employee`, `status: active`, Tenant A `tenantId`; UID is in Tenant A `users` | Not provisioned/verified |
| Tenant A customer | `users/{uid}` has `role: customer`, valid active status, Tenant A `tenantId`; one active `tenants/{tenantId}/customers/{customerId}` record has matching `authUid` | Not provisioned/verified |
| Tenant B admin/user | Same canonical contract for Tenant B; no Tenant A membership | Not provisioned/verified |
| Super-admin | `users/{uid}` has `role: super-admin` and valid existing profile contract; no fake tenant fallback | Not provisioned/verified |
| Unlinked customer | Controlled customer profile lacking a valid linked customer record, used only to prove blocked submission | Not provisioned/verified |

Do not add invented identity fields. Do not put customer UIDs in tenant admin membership. Do not set a super-admin profile tenant to bypass explicit tenant selection.

## Preflight Inventory

Status meanings: **Ready**, **Requires data preparation**, **Requires migration**, **Blocks rules deployment**, **Deferred legacy cleanup**, and **Not captured**.

| Item | Status | Evidence and next requirement |
| --- | --- | --- |
| Firebase project/environment | Ready for identification only | `cleaning-intake-system` is the only CLI-visible project. It was not approved for smoke writes. |
| Canonical Firestore deploy source | Ready in repository | `cloud-functions/firebase.json` points to `cloud-functions/firestore.rules`; `shared/firestore.rules` is the parity mirror. |
| Canonical Storage deploy source | Ready in repository | `cloud-functions/firebase.json` points to `cloud-functions/storage.rules`; `shared/storage.rules` is the parity mirror. |
| Exact currently deployed Firestore rules | Not captured | Firebase CLI available in this environment has no read-only deployed-rules command used by this run; Google Cloud CLI is unavailable. Capture before any rules promotion. |
| Exact currently deployed Storage rules | Not captured | Same constraint as Firestore. Capture before any rules promotion. |
| Storage CORS configuration | Not captured / Blocks evidence smoke | Bucket CORS was not read and authenticated `getBlob()` was not exercised. Verify approved local and deployed origins before release. |
| Active Storage object path inventory | Not captured / Blocks rules deployment | Requires an authorized read-only bucket inventory and backup. Repository search cannot prove deployed objects. |
| Global `jobPhotos/**` objects | Not captured / Blocks rules deployment | Reconciled rules intentionally deny this legacy path; deployed object count is unknown. |
| `tenants/DEFAULT/**` objects | Not captured / Blocks rules deployment | Reconciled rules deny this path; deployed object count is unknown. |
| Tenant branding objects | Requires migration review | Mounted compatibility path is `tenants/{tenantId}/branding/{fileName}`. Inventory filenames and active usage before rules replacement. |
| Documents/signatures/legacy photos | Requires migration / Deferred legacy cleanup | Reconciled rules deny unproven legacy paths. Inventory before deployment. |
| Canonical field-photo path | Ready in repository | `tenants/{tenantId}/bookings/{bookingId}/field-photos/{before|after}/{photoId}.{jpg|png|webp}` with matching Firestore metadata. Live persistence not verified. |
| Customer records missing `authUid` | Requires data preparation | No approved data read was performed. Query/report privately in the target environment; email matching is not ownership. |
| Employee/admin profiles missing tenant/status | Requires data preparation | No approved data read was performed. Validate role, active status, tenant ID, and membership arrays. |
| Tenant `users`/`adminUsers` inconsistencies | Requires data preparation | No approved data read was performed. Admin must be in both arrays; employee must be in `users`. |
| Frontend Firebase environment | Ready for local preflight | Required Firebase variables are present without values being printed. They target `cleaning-intake-system`. |
| Browser-side provider credentials | Review before release | Anthropic and Twilio-named Vite variables are configured locally. The current built JavaScript did not contain either configured value, and the Anthropic endpoint was not present in the current build. Do not rely on this as a general secret-management policy. |

## Rules And Storage Evidence

Repository evidence from the completed reconciliation work shows:

- tenant admin access requires an active matching profile and tenant admin membership;
- employee booking writes are limited to approved Field Mode fields;
- customer quote-request ownership requires matching profile tenant, customer `authUid`, and request UID;
- Stripe-confirmed booking fields are not client writable;
- canonical field-photo paths are tenant scoped and limited by role, phase, MIME type, extension, and size;
- unknown, global, cross-tenant, and `DEFAULT` paths are denied by the reconciled rules.

This is automated/repository evidence only. It is not proof that the reconciled files are currently deployed.

## Authenticated Smoke Matrix

### Admin smoke

Overall: **Not Run - persona/environment approval required.**

| Check | Result |
| --- | --- |
| Dashboard loads | Not Run |
| Create Estimate loads and saves safely | Not Run |
| Customer/lead requests load | Not Run |
| Linked customer request appears for review | Not Run |
| Request converts to booking | Not Run |
| Request creates no automatic payment | Not Run |
| Booking survives refresh/sign-in | Not Run |
| Calendar displays booking | Not Run |
| Business Settings loads/saves/persists | Not Run |
| Stripe status remains read-only; Connect/Resume state is honest | Not Run |
| Four tenant-only CSV exports download and contain correct records | Not Run |
| Booking detail shows field execution and before/after evidence | Not Run |
| Customer archive preserves history | Not Run |
| Completed booking cannot be accidentally cancelled | Not Run |

### Employee smoke

Overall: **Not Run - persona/environment approval required.**

Navigation isolation, refresh landing, hidden payment/internal notes, Field Mode persistence, file validation, evidence refresh, completion warning, and unchanged protected booking/payment fields all remain Not Run.

### Customer smoke

Overall: **Not Run - persona/environment approval required.**

Own-request visibility, quote submission and copy, refresh persistence, no automatic booking/payment, blocked admin/Field Mode/export/photo access, and unlinked-customer denial all remain Not Run.

### Super-admin two-tenant smoke

Overall: **Not Run - two approved tenants and super-admin persona required.**

Selection-required states, Tenant A load, immediate state clearing on Tenant B switch, stale-response protection, write scoping, clear-selection behavior, and non-persisted selection after refresh all remain Not Run.

### Cross-tenant security smoke

Overall: **Automated rules evidence available; authenticated browser/deployed result Not Run.**

Rules tests cover cross-tenant denials for canonical Firestore and Storage paths. Browser behavior, deployed rules, CSV contents, and transition rendering still require the approved two-tenant smoke.

### Payment-truth smoke

Overall: **Automated code/rules evidence available; authenticated persistence result Not Run.**

Repository tests and changed-key rules preserve these intended distinctions:

- quote request is not a booking;
- booking creation is not payment;
- payment-link creation is not payment confirmation;
- manual payment is distinct from `stripe_webhook` confirmation;
- field execution and photo upload do not include payment fields;
- Business Settings save does not include Stripe fields.

The browser and deployed-data checks remain Not Run. Any observed violation during the approved smoke is a D release blocker.

### Persistence smoke

Overall: **Not Run.**

No Firestore or Storage writes were made. Refresh, sign-out/in, role visibility, object persistence, and cross-persona denial require an approved test environment.

## Failures And Classification

| Finding | Class | Impact |
| --- | --- | --- |
| No dedicated staging Firebase project | A - test setup/provisioning | Prevents safest authenticated smoke option. |
| Browser app has no complete Auth/Firestore/Storage emulator wiring | A - test setup/provisioning | Emulator rules tests cannot be represented as browser smoke. |
| No explicit approval for writes to `cleaning-intake-system` | A - test setup/provisioning | Prevents persona provisioning and persistence smoke. |
| No supplied approved persona credentials | A - test setup/provisioning | Browser remained signed out. |
| Deployed rules, CORS, and object inventory not captured | B - data preparation and deployment gate | Reconciled rules must not be deployed until captured and reviewed. |
| No authenticated workflow violation observed | None | No V1 code blocker was confirmed because authenticated execution did not occur. |

## Data Corrections Required Before Smoke

These are required checks, not confirmed defects:

1. Validate all five persona profiles against the canonical role, status, and tenant contract.
2. Validate Tenant A and Tenant B membership arrays.
3. Link the fake customer through `customers/{customerId}.authUid`.
4. Prepare one Tenant A booking with no field data, one in progress, and one completed with safe fake content.
5. Prepare field-photo fixtures using fake images only.
6. Prepare manual and Stripe-confirmed test booking examples without altering real payment records.
7. Back up target test tenant documents and record cleanup IDs before any write smoke.

## Deployment Readiness

### Firebase rules

**Not ready for production deployment.** Exact deployed rules, identity/membership consistency, active Storage object paths, and bucket CORS remain uncaptured. Repository parity and emulator tests do not remove these deployment gates.

### Application

**Not ready for customer declaration.** The code validation baseline is green, but the required authenticated admin, employee, customer, super-admin, cross-tenant, persistence, and Storage browser smoke has not run.

### Cloud Functions and payments

No functions were changed or deployed. No Stripe onboarding, checkout, webhook, fee, refund, or payment-truth behavior was changed or exercised in this phase.

## Recommended Next Action

Jamie should choose one of these safe execution paths:

1. Provision a dedicated staging Firebase project and provide fake persona credentials; this is preferred.
2. Approve a separate environment-only lab slice that adds explicit Auth/Firestore/Storage emulator wiring and seed scripts for fake personas.
3. Explicitly approve use of a named existing test tenant in `cleaning-intake-system`, confirm backups, identify the five fake persona accounts, and authorize only reversible test-tenant writes.

After approval, execute `SERVICESOS_V1_MANUAL_SMOKE_CHECKLIST.md`, record sanitized evidence here, rerun rules parity, and stop immediately on any D-level violation.

