# ServicesOS V1 Production Preflight Evidence

Prepared: 2026-07-14

Branch: `v1-lab-production-preflight-evidence`

Base commit: `b03b5712aa0f4d049bf7306dcd598d64dc2512f6`

Protected production candidate: `master` / `origin/master` at
`031bb46249fd09bbe7014e5f9747d4a7a4737a6f`

Production project: `cleaning-intake-system`

Overall classification: **Blocks promotion**

## Approval And Safety

Jamie confirmed that `cleaning-intake-system` is the ServicesOS production Firebase
project and approved read-only production inspection. No production write was approved.

This inspection did not deploy, publish, migrate, back up, upload, download, copy, create,
update, disable, or delete any production resource. It did not inspect Stripe. The local
emulator target `demo-servicesos-v1-smoke-local` remained separate.

Tracked evidence contains no customer names, emails, phone numbers, addresses, UIDs,
tenant IDs, credentials, tokens, or complete customer-linked Storage object names.

## Read-Only Commands Executed

Each Firebase command used an explicit production target and a list/get operation with no
write behavior.

| Command | Why read-only | Sanitized result |
| --- | --- | --- |
| `npx firebase-tools@13.35.1 projects:list --json` | Lists projects visible to the authenticated CLI | Target found and active |
| `npx firebase-tools@13.35.1 firestore:databases:get "(default)" --project cleaning-intake-system --json` | Retrieves database metadata | Native Firestore in `nam5`; pessimistic concurrency; PITR and delete protection disabled |
| `npx firebase-tools@13.35.1 firestore:indexes --project cleaning-intake-system --json` | Lists deployed index definitions | 21 composite indexes; 0 field overrides; required assignment definition absent |

The first `projects:list` attempt failed locally with npm-cache `EPERM` before reaching
Firebase. The same read-only command was rerun with access to the existing npm cache.

An authenticated Firebase Console capture was attempted only by opening the project URL
in a separate read-only browser tab. The browser was signed out. No credentials were
entered and no Console control was changed.

## Evidence Classification

| Evidence area | Classification | Evidence |
| --- | --- | --- |
| Production target | **Verified ready** | Authenticated CLI returned the active `cleaning-intake-system` project |
| Firestore database target | **Verified ready** | `(default)`, native mode, `nam5` |
| Deployed Firestore rules source/release | **Not verified** | Firebase CLI has no proven source-export command; Console session unavailable |
| Deployed Storage rules source/release | **Not verified** | Same limitation |
| Storage CORS | **Not verified** | `gcloud`/`gsutil` unavailable and Console session unavailable |
| Production index inventory | **Verified ready** | 21 composite definitions and 0 field overrides captured |
| Index build statuses | **Not verified** | Firebase CLI response omitted state fields |
| Required employee-assignment index | **Blocks promotion** | Definition is absent |
| Storage path inventory | **Not verified** | No approved authenticated object-list surface was available |
| User/profile readiness | **Not verified** | No Auth Viewer plus Firestore read-only data surface was available |
| Admin membership readiness | **Not verified** | Same limitation |
| Employee readiness | **Not verified** | Same limitation |
| Customer `authUid` readiness | **Not verified** | Same limitation |
| Booking assignment readiness | **Not verified** | Same limitation |
| Firestore compatibility | **Blocks promotion** | Deployed rules and production data prerequisites are unknown; assignment index missing |
| Storage compatibility | **Blocks promotion** | Deployed rules, CORS, and active object categories are unknown |
| Production data preparation | **Data preparation required** | Exact counts are not yet available; gaps must be classified before any write is proposed |
| Migration requirement | **Not verified** | Cannot be decided until legacy assignments and Storage paths are counted |

## 1. Firestore Rules Status

**Not verified.** Local final rules are green, but the deployed Firestore rules source,
release identifier, timestamp, and hash were not readable through the proven Firebase CLI
commands. Do not infer deployed rules from repository files.

Required manual read-only step:

1. Sign in to Firebase Console with Rules Viewer access.
2. Select `cleaning-intake-system` explicitly.
3. Open Firestore Database > Rules and Rules history.
4. Save the exact deployed source privately, record release timestamp/version, and hash
   the private file.
5. Compare privately with `cloud-functions/firestore.rules`.
6. Do not click Edit or Publish.

Least-privilege access must include read/list access for Firebase Rules releases and
rulesets only. Do not grant rule-management or deploy permission.

## 2. Storage Rules Status

**Not verified.** The deployed Storage rules source, release identifier, timestamp, and
hash were unavailable for the same reason.

Use the equivalent Firebase Console Storage > Rules/history read-only capture. Compare
privately with `cloud-functions/storage.rules`. Do not click Edit or Publish.

## 3. Storage CORS Status

**Not verified.** Neither `gcloud` nor `gsutil` is installed in this environment, and the
Firebase Console browser was not authenticated.

Known-safe later read-only command, after an authenticated operator confirms the target:

```powershell
gcloud storage buckets describe gs://cleaning-intake-system.firebasestorage.app `
  --format="default(cors_config,location,storage_class,soft_delete_policy,versioning_enabled)" `
  --project=cleaning-intake-system
```

This requires bucket metadata read access, not Storage Admin. Do not run an update or
`gsutil cors set` command.

## 4. Production Index Inventory

**Verified ready** for definition inventory; **Not verified** for build status.

- Composite index definitions: 21
- Field overrides: 0
- Production-only definitions versus the repository: 0 (carried-forward normalized diff)
- Repository composite definitions: 22
- CLI-exposed build states: none; status must be checked in Console

Required employee assignment index:

```text
collection group: bookings
query scope: COLLECTION
assignedEmployeeAuthUid ASCENDING
status ASCENDING
date DESCENDING
```

Status: **Blocks promotion - missing**. Its build status is therefore not applicable yet.
Creating it is a production write and requires Jamie's separate approval. After creation,
wait for `READY` and run the exact employee query before publishing the V1 app.

## 5. Sanitized Storage Path Inventory

**Not verified.** No objects were listed or downloaded. The missing evidence is sanitized
counts, approximate bytes, MIME classes, and size-limit exceptions for:

| Sanitized category | Required V1 decision |
| --- | --- |
| `tenants/<tenant>/bookings/<booking>/field-photos/{before|after}/...` | Verify JPEG/PNG/WebP and <=10 MB |
| `tenants/<tenant>/branding/...` | Verify supported branding MIME and <=5 MB |
| customer/property/profile photos | Classify active canonical versus legacy use |
| documents/contracts/estimate attachments | Denied unless a separate reviewed V1 path is approved |
| signatures/incidents/property conditions | Denied/deferred; classify any active objects |
| global `jobPhotos/...` | Legacy; active use requires an approved migration decision |
| `tenants/DEFAULT/...` | Forbidden; active use requires investigation |
| arbitrary root/unknown prefixes | Unknown active use blocks rules promotion |

Minimum later permissions: `storage.objects.list` for sanitized aggregation and
`storage.buckets.get` for metadata/CORS. Do not grant object write/delete or Storage Admin.
Do not download object contents.

## 6. Sanitized Identity And Data Readiness Counts

All counts below are **Not verified** because no authenticated Auth/Firestore read-only
data surface was available.

| Audit count | Status |
| --- | --- |
| Auth users missing `users/{uid}` | Not verified |
| Profiles with unknown/legacy role | Not verified |
| Required profiles missing tenant/status | Not verified |
| Inactive/disabled/suspended profiles | Not verified |
| Admins missing tenant `users` membership | Not verified |
| Admins missing tenant `adminUsers` membership | Not verified |
| Employees missing tenant `users` membership | Not verified |
| Employee profiles without valid Auth user | Not verified |
| Customer records missing `authUid` | Not verified |
| Customer `authUid` without matching Auth user | Not verified |
| Duplicate customer `authUid` | Not verified |
| Customer tenant mismatch | Not verified |
| Email-only customer linkage | Not verified |
| Canonical active super-admin profiles | Not verified |
| Super-admin `DEFAULT` dependency | Not verified |
| Canonically assigned bookings | Not verified |
| Unassigned bookings | Not verified |
| Legacy `assignedEmployeeId` / `assignedEmployees` bookings | Not verified |
| Conflicting or invalid assignments | Not verified |
| Assigned inactive/out-of-tenant employees | Not verified |

Minimum later access must be viewer-only:

- Firebase Authentication user read/list access, without create/update/disable/delete;
- Firestore entity read/list access, without document write/delete;
- Firebase Console project view access if required for discovery.

The operator must retain raw identifiers in a private, ignored worksheet and commit only
aggregate counts. Email/display-name matching is not acceptable ownership or assignment
evidence.

## 7. Compatibility Findings

### Firestore

- **Verified ready:** local final Firestore rules pass 35/35 tests and rules parity.
- **Blocks promotion:** deployed rules are unknown.
- **Blocks promotion:** required assignment index is missing.
- **Data preparation required:** identity, membership, customer ownership, and assignment
  counts must be completed before production writes are proposed.
- **Migration required:** not established. It depends on verified legacy assignment and
  linkage counts.

### Storage

- **Verified ready:** local final Storage rules pass 15/15 tests and rules parity.
- **Blocks promotion:** deployed rules, CORS, and active path categories are unknown.
- **Migration required:** not established. Active global/legacy paths would require a
  separately approved disposition or migration.

## 8. Items Requiring Jamie's Later Write Approval

Each item is a separate gate; none is approved by this inspection:

1. Create/deploy the missing assignment index.
2. Correct any approved user profile, tenant membership, customer linkage, or booking
   assignment records after a private before/after ledger is reviewed.
3. Migrate or disposition active legacy Storage objects, if found.
4. Change Storage CORS, if evidence shows it is incompatible.
5. Execute Firestore/Storage backups.
6. Deploy Firestore rules.
7. Deploy Storage rules.
8. Merge/push a release branch or publish the application.
9. Begin production smoke or perform rollback actions.

## 9. Evidence-Based Deployment Order

Current recommendation:

1. Complete private deployed-rules, CORS, Storage-path, Auth/profile, membership,
   customer-linkage, and booking-assignment read-only captures.
2. Classify all gaps as ready, data preparation, migration, or blocker.
3. Obtain separate backup approval and verify backups before any production change.
4. Obtain separate data-preparation approval and correct only explicitly reviewed gaps.
5. Obtain separate index approval; create only the missing assignment index, wait for
   `READY`, and verify the employee assignment query.
6. Recheck compatibility of the currently deployed app with the final rules.
7. Integrate the exact reviewed V1 commit range on a controlled release branch.
8. Run the full release validation and emulator smoke.
9. Deploy rules/application only in the separately approved order selected from actual
   compatibility evidence.
10. Run production smoke and tag only after every required check passes.

Do not choose rules-first or app-first while deployed rules and active legacy paths remain
unknown.

## 10. Local Validation

No application, rules, Functions runtime, environment, or deployment configuration file
changed in this evidence phase.

| Gate | Result |
| --- | --- |
| Web `npm run lint` | Pass |
| Web `npm test -- --run` | Pass: 47 files, 388 tests |
| Web `npm run build` | Pass: 324 modules; existing chunk/dynamic-import warnings only |
| Cloud Functions `npm test` | Pass: 39/39 |
| Rules parity | Pass |
| Firestore rules | Pass: 35/35 |
| Storage rules | Pass: 15/15 |

Rules tests used only the fake `demo-servicesos-rules` project on loopback emulator ports.
No test or seed connected to production.

## Final Readiness

**Blocks promotion.** The production target and index definitions are verified, and the
required employee assignment index is confirmed missing. Deployed rules, Storage CORS and
paths, production identity/linkage/membership counts, assignment counts, and index build
states remain **Not verified** due insufficient authenticated read-only surfaces. No
production change is justified until those evidence gaps are closed and Jamie separately
approves each write-capable phase.
