# ServicesOS V1 Production Preflight Evidence

Prepared: 2026-07-14

Branch: `v1-lab-production-console-evidence`

Base commit: `51d9cd0`

Protected production candidate: `master` / `origin/master` at
`031bb46249fd09bbe7014e5f9747d4a7a4737a6f`

Production project: `cleaning-intake-system`

Overall classification: **Blocks promotion**

## Approval And Safety

Jamie manually authenticated to Firebase Console and visually confirmed the production
project. The browser session was not copied, exported, or stored. This phase used only
viewer surfaces and local repository reads.

No production resource was created, changed, published, deployed, downloaded, copied,
moved, backed up, migrated, or deleted. No Stripe surface was inspected. The emulator
project remained separate.

Tracked evidence contains no names, emails, phone numbers, addresses, Auth UIDs,
Firestore document IDs, tenant IDs, credentials, tokens, complete Storage object names,
customer photographs, or private documents.

## Read-Only Evidence Operations

No new production CLI command was executed in this phase. Browser operations were
limited to opening these viewer surfaces in the confirmed production project:

- Firebase Console project overview;
- Firestore Rules, Indexes, users, tenants, customers, and bookings viewers;
- Firebase Authentication Users viewer;
- Firebase Storage viewer; and
- Google Cloud Storage bucket list and expected application-bucket viewer.

These operations only displayed metadata or document fields. No Edit, Publish, Add,
Delete, Upload, Download, Copy, Create, Activate, or Get started control was used.

The previous committed evidence phase used only these production list/get commands:

| Command | Read-only basis |
| --- | --- |
| `npx firebase-tools@13.35.1 projects:list --json` | Lists visible projects |
| `npx firebase-tools@13.35.1 firestore:databases:get "(default)" --project cleaning-intake-system --json` | Retrieves database metadata |
| `npx firebase-tools@13.35.1 firestore:indexes --project cleaning-intake-system --json` | Lists index definitions |

## Evidence Summary

| Evidence area | Classification | Sanitized evidence |
| --- | --- | --- |
| Production target | **Verified ready** | Console showed the confirmed project |
| Firestore database | **Verified ready** | `(default)`, native mode, `nam5` |
| Deployed Firestore rules | **Blocks promotion** | Different from V1 canonical rules and contain broad authenticated access |
| Firestore release version/time | **Not verified** | Console displayed an error loading rule versions |
| Deployed Storage rules | **Not verified** | Firebase Storage is not initialized for the application bucket |
| Storage CORS | **Blocks promotion** | Expected application bucket does not exist, so required browser CORS is unavailable |
| Production indexes | **Verified ready** | 21 composite indexes; all displayed `Enabled` |
| Required assignment index | **Blocks promotion** | Missing from production; present only in local canonical index file |
| Application Storage inventory | **Verified ready** | No application bucket or application objects were visible |
| Auth/profile reconciliation | **Data preparation required** | 7 Auth users and 7 matching profiles; one customer profile lacks tenant linkage |
| Admin membership | **Blocks promotion** | All 3 admin profiles lack required tenant `users` and `adminUsers` membership |
| Employee readiness | **Blocks promotion** | No employee Auth/profile records exist |
| Customer ownership | **Blocks promotion** | Only one complete profile-to-customer link confirmed; record audit is partial |
| Booking assignment | **Blocks promotion** for employees | 14 bookings inspected; all unassigned |
| Owner/admin booking operation | **Data preparation required** | Unassigned bookings can remain owner-operated after membership correction |

## 1. Deployed Firestore Rules

Status: **Blocks promotion**.

The deployed editor content was compared in memory with
`cloud-functions/firestore.rules`; no production rules file was saved or tracked.

| Comparison | Result |
| --- | --- |
| Exact source match | No |
| Deployed SHA-256 | `2e74770ad7dc2961bc8fb2f170131b329fe1ea1a6c47ba47ba5226cab7041a1d` |
| V1 canonical SHA-256 | `d1ec3d2fa6f4476f827d9ba92c8fb9a3d776da4df4c348471b59f43cac4294e0` |
| Deployed source lines | 191 |
| V1 canonical source lines | 559 |
| Release version/time | Not verified; Console could not load rule versions |

The deployed rules include temporary broad authenticated access. In particular, booking
updates and several tenant subcollections are available to any authenticated user. The
current frozen app can therefore read/write nested data more broadly than V1 permits.

The V1 rules must not be weakened to preserve this behavior. Deploying them now would
also block legitimate tenant-root admin access because production tenant membership data
is incomplete. Membership and customer-link preparation must happen before the rules
promotion window.

## 2. Deployed Storage Rules And CORS

Status: **Blocks promotion**.

Firebase Console showed only the Storage initialization surface. The expected application
bucket was not present in Google Cloud Storage. The project bucket list contained only a
managed Cloud Functions source bucket, which was not opened or inventoried.

Consequences:

- deployed application Storage rules cannot be compared because application Storage is
  not initialized;
- no application-bucket CORS configuration exists to support deployed browser `getBlob()`
  reads;
- no application field photos, branding, customer photos, documents, or other application
  objects are currently available to migrate; and
- before/after photos and branding are blocked until Jamie separately approves bucket
  initialization, rules deployment, and CORS configuration.

No `Get started` or bucket-creation control was used. No object was opened or downloaded.

## 3. Sanitized Storage Inventory

No application bucket or application objects were visible. Approximate count and size for
every application category are therefore zero/not applicable at this pre-initialization
state. The managed function-source bucket is operational infrastructure, not an
application content path.

| Sanitized path/category | Observed state | V1 classification |
| --- | --- | --- |
| `tenants/<tenant>/bookings/<booking>/field-photos/{before|after}/...` | No app bucket/objects | **C - setup required** |
| `tenants/<tenant>/branding/...` | No app bucket/objects | **C - setup required** |
| customer/property/profile photos | No app bucket/objects | **D - no active legacy data found** |
| documents/contracts/signatures/attachments | No app bucket/objects | **D - no active legacy data found** |
| incident/property-condition evidence | No app bucket/objects | **D - no active legacy data found** |
| global `jobPhotos/...` | No app bucket/objects | **D - no active legacy data found** |
| `tenants/DEFAULT/...` | No app bucket/objects | **D - no active legacy data found** |
| arbitrary/unknown root paths | No app bucket/objects | **D - no active legacy data found** |

Content types and size-limit exceptions are not applicable until application Storage is
initialized. A post-initialization smoke must prove supported MIME types, limits, CORS,
and cross-tenant denials before photo workflows are promoted.

## 4. Production Indexes

Status: 21 production composite indexes are **Verified ready** and displayed `Enabled`.
There are no field overrides. The local canonical file has 22 indexes.

The only confirmed production delta is the required employee Field Mode index:

```text
collection: bookings
query scope: COLLECTION
assignedEmployeeAuthUid ASCENDING
status ASCENDING
date DESCENDING
```

Status: **Missing - Blocks promotion** for employee Field Mode.

The mounted employee query filters exact assignment, filters active status with `in`, and
orders by descending date. Calendar, owner booking lists, customer lists, and dashboard
lead lists use simpler tenant-scoped queries. Staff Scheduling is super-admin-only and no
production employee records currently exist. Do not add speculative indexes; any later
`FAILED_PRECONDITION` remains a stop signal.

## 5. Auth And User Profiles

Status: **Data preparation required**.

| Sanitized count | Result |
| --- | ---: |
| Auth users | 7 |
| `users` profiles | 7 |
| Auth users missing profile | 0 |
| Profiles without Auth user | 0 |
| Admin profiles | 3 |
| Customer profiles | 2 |
| Super-admin profiles | 2 |
| Employee profiles | 0 |
| Unknown/legacy roles | 0 |
| Missing status | 0 |
| Inactive/suspended profiles | 0 |
| Customer profiles missing required tenant ID | 1 |

No disabled marker was visible in the Auth viewer. Two canonical super-admin profiles
exist, neither depends on a profile tenant ID or `DEFAULT`; explicit application tenant
selection remains required.

## 6. Admin And Employee Readiness

Status: **Blocks promotion** for V1 rules and employee workflows.

| Admin readiness count | Result |
| --- | ---: |
| Admin profiles inspected | 3 |
| Referenced tenant documents present | 3 |
| Missing tenant `users` membership | 3 |
| Missing tenant `adminUsers` membership | 3 |
| Matching tenant `ownerId` | 1 |
| Invalid/missing admin profile tenant ID | 0 |

`ownerId` is not a substitute for the membership fields required by the V1 rules. All
three admin tenant documents require explicit reviewed membership correction.

| Employee readiness count | Result |
| --- | ---: |
| Employee profiles/Auth users | 0 |
| Ready employee tenant memberships | 0 |

Employee-operated Field Mode cannot be promoted until real employee Auth/profile and
tenant-membership records are explicitly created and verified. No identity may be
inferred from a name, email, array position, or legacy identifier.

## 7. Customer Ownership Readiness

Status: **Blocks promotion**. The viewer allowed complete inspection of 5 of 9 customer
records. Four records repeatedly failed to load, so global ownership and duplicate counts
remain **Not verified**.

| Sanitized count | Result |
| --- | ---: |
| Customer records visible | 9 |
| Customer records inspected | 5 |
| Inspected records missing `authUid` | 4 |
| Inspected email-only records | 4 |
| Inspected `authUid` values without Auth user | 0 |
| Duplicate `authUid` among inspected records | 0 |
| Complete profile/tenant/customer link confirmed | 1 |
| Customer profiles missing linked customer record | 1 |
| Archived/disabled confirmed links expected to log in | 0 |

Email-only linkage is not ownership proof. The four uninspected customer records must be
privately reviewed before any customer rules promotion or customer-link correction is
approved.

## 8. Booking Assignment Readiness

Status: **B - owner-safe while unassigned; D - blocks employee workflow**.

| Sanitized count | Result |
| --- | ---: |
| Booking records inspected | 14 |
| Canonical `assignedEmployeeAuthUid` | 0 |
| Unassigned | 14 |
| Legacy `assignedEmployeeId` | 0 |
| Legacy `assignedEmployees` | 0 |
| Conflicting canonical/legacy assignment | 0 |
| Invalid canonical references | 0 |
| Active | 14 |
| Completed | 0 |
| Cancelled | 0 |

Owner/admin operation may continue with unassigned bookings after tenant membership is
corrected. Employee Field Mode requires an exact active same-tenant employee Auth UID,
the missing composite index, and explicit assignment. Do not infer assignments.

## 9. Compatibility Conclusion

| V1 surface | Classification | Production finding |
| --- | --- | --- |
| Current admin login | **B** | Profiles exist, but canonical tenant membership is missing |
| Business Settings | **D** | V1 root update requires corrected admin membership |
| Customer requests | **D** | Ownership audit incomplete; most inspected records lack `authUid` |
| Customer auth ownership | **D** | One complete link; one tenantless profile; four records uninspected |
| Booking creation/admin management | **B/D** | Data exists; canonical rules require membership correction |
| Calendar | **B** | Query shape is supported; admin membership still required |
| Employee assignment | **D** | No employees, all bookings unassigned, index missing |
| Employee Field Mode | **D** | Same blockers plus Storage setup for photos |
| Owner-operated Field Mode | **B/D** | Execution can work after membership; photos require Storage setup |
| Before/after photos | **D** | Application Storage bucket/rules/CORS absent |
| Admin photo review | **D** | Same Storage blocker |
| Data Export | **B** | Tenant data exists; canonical admin membership required |
| Stripe status/onboarding display | **B** | No Stripe change; requires authenticated production smoke later |
| Super-admin tenant selection | **A/B** | Canonical profiles exist with no `DEFAULT`; production smoke remains |

Local V1 Firestore and Storage rules remain green. Production rules are older and broader;
they must not be treated as proof of V1 isolation.

## 10. Exact Prerequisites And Approval Gates

Read-only work complete:

1. Confirm project/database and deployed index inventory.
2. Compare deployed Firestore rules privately with canonical rules.
3. Count Auth/profile/admin/employee/customer/booking readiness where the viewer allowed.
4. Confirm application Storage is not initialized.

Write work requiring Jamie's explicit approval:

1. Capture approved rollback references and execute approved Firestore backup.
2. Decide whether a Storage backup is applicable before initialization; document that
   there is no application bucket rather than creating one implicitly.
3. Correct the three admin tenant memberships with a private before/after ledger.
4. Correct the tenantless customer profile and complete the four-record private customer
   audit; link only exact verified identities.
5. Create employee Auth/profile/membership records only for approved real workers.
6. Assign only explicitly verified employees to selected bookings.
7. Initialize application Storage, then deploy reviewed Storage rules and CORS.
8. Create the one missing booking assignment index and wait for `Enabled`/`Ready`.

Deployment work requiring separate Jamie approval:

1. Integrate the reviewed V1 range on a controlled release branch.
2. Run preview/staging validation; no dedicated staging Firebase project currently exists.
3. Re-run production preflight after data and Storage preparation.
4. Deploy the approved rules/index/application in the reviewed runbook order.
5. Run production smoke and roll back on any isolation, query, photo, or payment-truth
   failure.

Do not choose rules-first or app-first until the data corrections, Storage setup, missing
index, and current-app compatibility review are complete.

## 11. Current Promotion Blockers

1. Deployed Firestore rules differ from canonical V1 and contain broad authenticated access.
2. All admin profiles lack canonical tenant membership fields required by V1 rules.
3. Customer ownership evidence is incomplete and most inspected records are email-only.
4. No employee records exist and every inspected booking is unassigned.
5. The required employee-assignment index is missing.
6. Application Storage, Storage rules, and browser CORS are not initialized/configured.
7. Four customer records could not be safely classified in the viewer.
8. No production-equivalent staging Firebase project exists.

## 12. Validation

No application code, rules source, Functions runtime, environment, or deployment
configuration changed in this evidence phase.

| Gate | Result |
| --- | --- |
| Web `npm run lint` | Pass |
| Web `npm test -- --run` | Pass: 47 files, 388 tests |
| Web `npm run build` | Pass: 324 modules; existing chunk/dynamic-import warnings only |
| Cloud Functions `npm test` | Pass: 39/39 |
| Firestore rules | Pass: 35/35 |
| Storage rules | Pass: 15/15 |
| Rules parity | Pass |
| `git diff --check` | Pass |

The first standalone Firestore-rules invocation did not run because the authenticated
smoke emulator already owned loopback port 8080. It was rerun successfully on isolated
alternate loopback ports using only the fake `demo-servicesos-rules` project. The same
isolated configuration was used for Storage rules and removed afterward. No validation
command connected to production.

## Final Readiness

**D - Blocks promotion.** The production target, deployed rules difference, enabled index
inventory, missing assignment index, absent application Storage, and major identity/data
counts are now evidenced. Production needs approved membership/customer preparation,
employee/assignment setup if employee Field Mode is included, Storage initialization,
CORS/rules deployment, and the missing index before controlled promotion can begin.
