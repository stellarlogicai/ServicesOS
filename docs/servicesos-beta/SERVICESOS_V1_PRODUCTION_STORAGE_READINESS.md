# ServicesOS V1 Production Storage Readiness

Date: 2026-07-15
Production project: `cleaning-intake-system`
Production bucket: `cleaning-intake-system.firebasestorage.app`
Bucket location: `US-EAST1`
Working branch: `v1-lab-production-storage-rules-smoke`
Starting commit: `5d71894` (`Clarify ServicesOS V1 customer identity gates`)

The branch was created from the pushed two-document Storage-rules correction and customer
readiness history. Protected `master` was not modified.

## Status

| Area | Status | Evidence |
| --- | --- | --- |
| Default Firebase Storage bucket | Verified ready | Firebase console and Firebase Web SDK config identify the exact production bucket |
| Canonical V1 Storage rules | Verified deployed | Storage-only deploy succeeded; production rules are byte-equivalent to `cloud-functions/storage.rules` |
| Firestore access-call limit | Verified resolved | Field-photo authorization reads only the protected user profile and requested booking; Storage suite passes 20/20 |
| Cross-service authorization | Verified ready | Firebase Console attached only `Firebase Rules Firestore Service Agent` to one Firebase Storage managed service identity; warning cleared |
| Production Storage CORS | Verified ready | Bucket metadata read-back exactly matches the approved JSON |
| Public access | Verified private | No `allUsers` or `allAuthenticatedUsers` IAM binding; public-access prevention is inherited |
| Pre-smoke object inventory | Verified none | Object-list API returned zero objects before and after rules/IAM preparation |
| Firestore photo metadata path | Blocks photo smoke | Deployed Firestore rules contain no nested `fieldPhotos` rule; the production app cannot list photo metadata |
| Owner/admin photo smoke | Blocked, no upload attempted | Field Mode displayed upload controls but returned an honest metadata load error; stop condition applied |
| Loopback origin removal | Deferred | Keep until the controlled local owner/admin smoke passes |

## Field Photo Transport Contract

The mounted Field Mode photo implementation uses Firebase Web SDK `12.14.0`:

- `uploadBytes()` performs a one-shot multipart `POST`.
- `getBlob()` performs authenticated `GET` photo loading.
- Browser preflight uses `OPTIONS`.
- The application needs `Content-Type` exposed in the response.
- Resumable upload is not used, so `x-goog-resumable` is not exposed.
- Client photo deletion is denied by the deployed rules and no delete UI exists, so
  `DELETE` is not included in CORS.

## Applied CORS

```json
[
  {
    "origin": [
      "https://servicesos.netlify.app",
      "http://127.0.0.1:5173"
    ],
    "method": ["GET", "POST", "OPTIONS"],
    "responseHeader": ["Content-Type"],
    "maxAgeSeconds": 3600
  }
]
```

No wildcard, localhost alias, extra port, Netlify preview origin, or custom domain was
added.

## Commands

Read-only pre-check:

```bash
gcloud config get-value project
gcloud storage buckets describe gs://cleaning-intake-system.firebasestorage.app \
  --project=cleaning-intake-system \
  --format="json(name,location,storage_class,cors_config,iam_configuration.public_access_prevention)"
gcloud storage buckets get-iam-policy gs://cleaning-intake-system.firebasestorage.app \
  --project=cleaning-intake-system \
  --format=json
gcloud storage ls --recursive gs://cleaning-intake-system.firebasestorage.app
```

Applied write:

```bash
gcloud storage buckets update gs://cleaning-intake-system.firebasestorage.app \
  --project=cleaning-intake-system \
  --cors-file=/tmp/servicesos-storage-cors.json
```

The write completed for one bucket. It changed bucket CORS metadata only. It did not
change IAM, public access, Storage rules, objects, Firestore, indexes, Auth, or application
data.

Read-back verification:

```bash
gcloud storage buckets describe gs://cleaning-intake-system.firebasestorage.app \
  --project=cleaning-intake-system \
  --format="json(name,location,storage_class,cors_config,iam_configuration)"
gcloud storage buckets get-iam-policy gs://cleaning-intake-system.firebasestorage.app \
  --project=cleaning-intake-system \
  --format=json
```

The read-back returned exactly two origins, methods `GET`, `POST`, and `OPTIONS`, response
header `Content-Type`, and max age `3600`. The post-CORS object-list API returned `{}`.

The Firebase JSON API exposes its service-level default CORS behavior and does not evaluate
bucket CORS. An empty-object XML API probe did not return useful preflight headers. Bucket
metadata read-back is the authoritative CORS verification until a real authenticated object
exists.

## Canonical Rules Verification

The Storage-only command was:

```bash
npx firebase-tools@13.35.1 deploy --only storage \
  --project cleaning-intake-system \
  --config firebase.json
```

It ran from `cloud-functions`, compiled `storage.rules`, and released only
`firebase.storage`. The resulting ruleset reference ends in `84d0`, was updated at
`2026-07-15T03:13:33.781481Z`, contains 125 lines, and is byte-equivalent to the canonical
source after line-ending normalization.

The Firestore rules release remained unchanged at its 2026-06-16 reference. All 21
Firestore indexes remained byte-equivalent to the predeployment inventory. CORS, public
access prevention, bucket IAM, objects, Functions, Hosting, Auth, and application code were
unchanged by the deployment.

Rollback was not executed. The prior deployed Storage ruleset ends in `b388` and the prior
committed source is available at `86a9f22:cloud-functions/storage.rules`. A rollback must
use a clean worktree at that commit and the same Storage-only deployment command.

## Prior Three-Document Access-Call Audit (Superseded)

This matrix documents the previous deployed rule graph and the reason it was replaced.
Production now runs the two-document correction described below. Cloud Storage Rules permit
at most two Firestore documents in one evaluation.

| Operation | Helpers and Firestore documents reached | Maximum distinct documents | Short-circuit dependency | Emulator coverage | Result |
| --- | --- | ---: | --- | --- | --- |
| Tenant admin photo create | `bookingExists`; failed `isSuperAdmin`; `isTenantAdmin`; booking, user profile, tenant | 3 | Admin branch stops before employee branch, but only after all three documents | Admin unassigned upload and cross-tenant admin denial | **Blocks promotion** |
| Tenant admin photo read | failed `isSuperAdmin`; `isTenantAdmin`; user profile, tenant | 2 | Successful admin branch prevents employee evaluation | Admin read | Within limit |
| Assigned employee photo create | `bookingExists`; failed super-admin/admin checks; `isAssignedTenantFieldUser`; booking, user profile, tenant | 3 | Booking is reused in assignment check, but three distinct documents remain | Employee JPEG/PNG/WebP upload, reassignment | **Blocks promotion** |
| Assigned employee photo read | failed super-admin/admin checks; `isTenantFieldUser`; booking assignment; user profile, tenant, booking | 3 | Employee branch is reached only after earlier role branches fail | Employee read and reassignment | **Blocks promotion** |
| Employee overwrite attempt | `allow update: if false` | 0 | No helper is evaluated | Employee overwrite denial | Within limit; denied |
| Employee delete attempt | `allow delete: if false` | 0 | No helper is evaluated | Employee delete denial | Within limit; denied |
| Customer photo read | failed super-admin/admin/employee role checks; user profile, tenant | 2 | Role mismatch prevents tenant-record and booking access | Customer read denial | Within limit; denied |
| Customer photo create | `bookingExists`; failed role checks; booking, user profile, tenant | 3 | Role mismatch prevents assignment lookup, but three documents are already reachable | Customer upload denial | Denied as intended, but evaluation can reach the limit blocker |
| Cross-tenant photo read | failed role/tenant checks; user profile, requested tenant | 2 | Tenant-ID mismatch prevents tenant-record and booking access | Cross-tenant admin/employee read denial | Within limit; denied |
| Cross-tenant photo create | `bookingExists`; failed role/tenant checks; booking, user profile, requested tenant | 3 | Tenant-ID mismatch prevents later assignment access | Cross-tenant upload denial | Denied as intended, but evaluation can reach the limit blocker |
| Anonymous photo read | failed authentication; requested tenant existence | 1 | Profile and assignment lookups stop at `request.auth == null` | Anonymous read denial | Within limit; denied |
| Anonymous photo create | `bookingExists`; failed authentication; requested tenant existence | 2 | Profile and assignment lookups stop at `request.auth == null` | Anonymous upload denial | Within limit; denied |
| Super-admin photo read | `isSuperAdmin`; user profile | 1 | First role branch succeeds | Super-admin read | Within limit |
| Super-admin photo create | `bookingExists`; `isSuperAdmin`; booking, user profile | 2 | First role branch succeeds | Super-admin upload | Within limit |
| Super-admin branding read/create | `tenantExists`; `isSuperAdmin`; tenant, user profile | 2 | Both checks are required | Branding read/upload | Within limit |
| Non-super-admin branding read/create | `tenantExists`; failed `isSuperAdmin`; tenant, user profile | 2 | Role failure ends evaluation | Admin/employee/customer/cross-tenant denial | Within limit; denied |

The 15 Storage emulator tests cover the intended allow/deny behaviors listed above,
including assignment changes, owner/admin operation, overwrite/delete denial, customer,
anonymous, cross-tenant, branding, size, and MIME constraints. They do not remove the
production two-document limit: the rule graph itself proves that three distinct documents
are reachable on intended allowed paths.

## Firebase-Managed Cross-Service Permission

The Firebase Console proposal was inspected on the exact production project and bucket.
The supported `Attach permissions` action granted exactly
`roles/firebaserules.firestoreServiceAgent` to one principal in the Firebase Storage
managed service-identity category. No human or non-Storage principal received that role,
and the managed identity received no Owner, Editor, Storage Admin, Firestore Admin, Auth
Admin, or other broad role.

The Console warning cleared. The managed binding was verified by read-only project IAM
inspection by `2026-07-15T03:26:42Z`. Project and bucket public-principal counts remained
zero, public-access prevention remained inherited, CORS remained unchanged, and the bucket
still contained zero objects before smoke.

## Local Two-Document Correction

The local correction removes the tenant root document from field-photo Storage rule
evaluation. It does not weaken access to authenticated users generally and does not trust
Storage metadata. Authorization now uses exactly:

1. `users/{request.auth.uid}` for protected `role`, `status`, and `tenantId`.
2. `tenants/{tenantId}/bookings/{bookingId}` for booking existence, exact employee
   assignment, execution status, and archive/delete state.

The canonical Firestore rules prove the profile is a protected authorization source:

- self-update is allowlisted to `displayName`, `phone`, `photoURL`, and `updatedAt`;
- clients cannot change `role`, `tenantId`, or `status`;
- client profile creation is restricted to an active `customer` profile;
- client deletion is denied.

The exact third document removed from photo authorization is
`tenants/{tenantId}`. The object path and booking lookup establish the requested tenant;
the protected profile establishes the caller's tenant and role. Employees must also match
`assignedEmployeeAuthUid`, have an active profile, and access only a scheduled or completed
booking that is neither archived nor deleted.

| Operation | First document | Second document | Potential third access | Maximum | Local test |
| --- | --- | --- | --- | ---: | --- |
| Tenant admin photo create | Protected user profile | Tenant-scoped booking | None | 2 | Own-tenant unassigned upload; cross-tenant denial |
| Tenant admin photo read | Protected user profile | Tenant-scoped booking | None | 2 | Own-tenant read; cross-tenant denial |
| Assigned employee photo create | Protected user profile | Assigned active booking | None | 2 | Scheduled/completed upload; unassigned/cancelled/archived/deleted denial |
| Assigned employee photo read | Protected user profile | Assigned active booking | None | 2 | Read, reassignment, and former-employee denial |
| Super-admin photo create/read | Protected user profile | Tenant-scoped booking | None | 2 | Explicit canonical booking path |
| Customer photo create/read | Protected user profile | Tenant-scoped booking | None | 2 | Customer and guessed-path denial |
| Cross-tenant create/read | Protected user profile | Requested-tenant booking | None | 2 | Admin and employee cross-tenant denial |
| Missing profile or booking | Requested profile resource | Requested booking resource | None | 2 | Missing-profile and missing-booking denial |
| Anonymous create/read | None | None | Helper short-circuited before access | 0 | Anonymous denial |
| Photo overwrite/delete | None | None | Explicit `false` | 0 | Employee/admin overwrite and delete denial |
| Super-admin branding create/read | Protected user profile | Tenant root existence | None | 2 | Super-admin allow; all other roles denied |

The source-level Storage test extracts the helper graph and verifies one profile lookup and
one booking lookup with no tenant-document helper. This limit does not depend on repeated
same-document caching. Canonical and shared Storage rules remain byte-identical.

Branding remains the existing mounted super-admin-only compatibility surface. It still
uses two documents and was not expanded to tenant admins.

End-to-end Firestore booking and photo-metadata rules continue to enforce tenant membership.
Because the Storage object rule cannot read a third document, access revocation must update
the protected profile and/or booking assignment rather than only removing a UID from tenant
membership arrays. No application or Firestore rule change is included in this correction.

## Owner/Admin Photo Smoke

The production-connected app ran at `http://127.0.0.1:5173` with emulator mode disabled and
the exact production project/bucket configuration. A verified tenant admin opened Field
Mode and an existing unassigned, own-tenant fake booking. Before/after upload controls
appeared without an employee assignment.

The photo panel could not list Firestore photo metadata. A read-only ruleset comparison
confirmed that the deployed 2026-06-16 Firestore rules have no nested `fieldPhotos` rule,
while the canonical V1 Firestore rules do. The stop condition was applied before selecting
or uploading a file. Therefore:

- before-photo upload: not run;
- after-photo upload: not run;
- refresh persistence: not run;
- invalid type and over-10-MB browser checks: not run against production;
- Booking Detail read-only review: not run;
- cross-tenant and anonymous object denial: not run because no object exists;
- customer production smoke: not run because customer identity remediation remains blocked;
- employee production smoke: not run because no production employees exist;
- emulator customer, assignment, reassignment, cross-tenant, and anonymous coverage: passed;
- browser result: Firestore photo-metadata load error; no CORS or object-loading result was
  available because upload never began;
- production photo objects created: zero;
- production photo metadata created: zero;
- booking document: byte-equivalent to the captured pre-smoke baseline.

Payment, price, schedule, customer/lead references, assignment, booking status, Stripe
session/payment-intent markers, and unrelated booking fields remained unchanged.

## Offboarding Contract

- Protected `users/{uid}` values for role, tenant ID, and status are authoritative for
  Storage authorization.
- Removing a UID only from tenant membership arrays does not revoke raw Storage access.
- Admin offboarding must deactivate or correct the protected profile.
- Employee offboarding must deactivate or correct the profile and clear or reassign affected
  bookings.
- Reassignment revokes the former employee's booking-photo access.
- No employee accounts currently exist, so this does not block owner operation.
- This operational contract is required before employee rollout; do not reintroduce the
  third tenant-document lookup.

## Validation

| Gate | Result |
| --- | --- |
| Focused field-photo web tests | Pass: 5 files, 77 tests |
| Full web tests | Pass: 47 files, 388 tests |
| Web lint | Pass |
| Web build | Pass: 324 modules; existing chunk and dynamic-import warnings only |
| Cloud Functions tests | Pass: 39/39 |
| Firestore rules tests | Pass: 35/35 |
| Storage rules tests | Pass: 20/20 for the local correction |
| Rules parity | Pass |
| `git diff --check` | Pass; line-ending conversion warnings only |
| Sensitive-data scan | Pass; no key, private-key, or email patterns in changed documents |

The first Storage rules command did not start because the existing local smoke emulator
owned Firestore port `8080`. It was rerun successfully against the same fake
`demo-servicesos-rules` project on isolated temporary ports. The temporary config was
removed and the running smoke environment was not changed.

## Next Action

Under separate approval, reconcile and deploy the canonical Firestore rules that include
the tenant-scoped nested `fieldPhotos` metadata contract, then rerun the controlled
production owner/admin photo smoke from the beginning. Do not weaken Storage rules or write
metadata outside that canonical path. Keep `http://127.0.0.1:5173` in CORS until the full
smoke passes; remove it only in a separate approved CORS update.
