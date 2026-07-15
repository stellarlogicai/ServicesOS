# ServicesOS V1 Production Data Readiness Report

Prepared: 2026-07-14

Branch: `v1-lab-production-identity-readiness`

Production project: `cleaning-intake-system`

Protected `master` / `origin/master`: `031bb46249fd09bbe7014e5f9747d4a7a4737a6f`

Overall classification: **D - production promotion blocked**

## Approved Scope

Jamie approved one exact private backup bucket, one complete Firestore export, narrow
admin membership additions if proven missing, full customer identity inspection, and
customer `authUid` correction only when exact tenant-bound identity was proven.

No application document correction was made because the admin memberships were already
canonical and the customer audit triggered the tenant-mismatch stop condition.

## Backup Evidence

Backup gate: **Passed**.

| Evidence | Sanitized result |
| --- | --- |
| Bucket | `gs://cleaning-intake-system-firestore-backups-20260714-7a4c2e` |
| Bucket location/class | `US` / `STANDARD` |
| Uniform bucket-level access | Enabled |
| Public-access prevention | Enforced |
| Public IAM principal | None |
| Export prefix | `servicesos-v1-pre-identity-2026-07-14` |
| Database | `(default)` |
| Operation result | `SUCCESSFUL`; no error |
| Completion timestamp | `2026-07-15T00:13:55.869945Z` |
| Documents processed | 59/59 |
| Export objects | 3 |
| Approximate export bytes | 83,954 |
| Overall metadata files | 1 |

The bucket is backup infrastructure only. Firebase application Storage remains
uninitialized. No CORS, lifecycle, website, application path, or custom IAM setting was
added. Google Cloud applied its default soft-delete policy during bucket creation.

Restore command documented but not executed:

```powershell
gcloud firestore import `
  gs://cleaning-intake-system-firestore-backups-20260714-7a4c2e/servicesos-v1-pre-identity-2026-07-14 `
  --project=cleaning-intake-system `
  --database="(default)"
```

A full import can overwrite documents with matching IDs and does not remove unrelated
documents. It is an emergency recovery action requiring separate approval. Narrow data
corrections should also retain a private before/after ledger for field-level reversal.

## Admin Membership Readiness

The direct profile/tenant reread supersedes the earlier viewer-only missing-membership
classification.

| Result | Count |
| --- | ---: |
| Admin profiles reviewed | 3 |
| Active canonical admin profiles | 3 |
| Intended tenant documents present | 3 |
| Already in tenant `users` | 3 |
| Already in tenant `adminUsers` | 3 |
| Conflicting tenant membership | 0 |
| Corrections required/completed | 0 |
| Blocked/failed corrections | 0 |

No admin profile or tenant document was modified. Existing tenant members and unrelated
tenant fields remained unchanged.

## Customer Identity Readiness

All nine customer records were inspected and reconciled against all Auth identities and
`users` profiles.

This evidence is a release-track split, not permission to defer customer identity work
beyond V1. An owner-operator wife beta may proceed only with Customer Portal access kept
out of that beta. Customer-facing wife beta and customer-ready ServicesOS V1 remain
blocked until the conflicts below are resolved and production customer privacy smoke
passes.

| Classification | Count |
| --- | ---: |
| A - valid exact `authUid` link | 1 |
| B - exact safe correction permitted | 0 |
| C - ambiguous/manual review | 0 |
| D - no corresponding Auth identity | 5 |
| E - archived/disabled | 0 |
| F - tenant/profile/role conflict | 3 |
| Customer corrections completed | 0 |

The three blocking records consist of:

- one existing `authUid` linked to customers in two tenants while its profile belongs to
  only one tenant;
- one exact customer Auth identity whose profile has no tenant ID; and
- one customer record whose matching Auth profile has a non-customer role.

No approximate matching was used. Duplicate customer email data with no Auth identity
remains unlinked. No invitation or Customer Portal account was created.

The five records with no corresponding Auth identity are not automatically defective.
They may remain valid non-portal customer records, but they must remain inaccessible
through Customer Portal. Do not create or infer a portal link from names, phone numbers,
email similarity, record order, or any other approximate evidence.

## Correction And Verification Method

- Profiles, tenants, Auth identities, and all customer records were reread from the
  confirmed production project.
- Admin membership was checked across every tenant before deciding no write was needed.
- Customer linkage required exact Auth UID, customer role, profile tenant, customer path,
  uniqueness, and active/non-archived state.
- The existing cross-tenant duplicate and tenantless profile activated the stop condition.
- Exact references and identity evidence are retained only in the ignored local manifest
  `.servicesos-production-remediation.local.json`.

## Readiness By Workflow

| Workflow | Data readiness | Remaining gate |
| --- | --- | --- |
| Owner-operator wife beta without Customer Portal | **A/B** | Admin/tenant/booking data is ready; portal access must remain excluded and controlled rules/app promotion and smoke remain |
| Customer-facing wife beta | **D** | Identity ownership conflicts must be remediated and production customer privacy smoke must pass |
| Customer-ready ServicesOS V1 | **D** | Every portal-enabled customer must satisfy the exact identity contract and production customer privacy smoke must pass |
| Owner-operated photo workflow | **D** | Firebase application Storage, Storage rules, and CORS are absent |
| Employee workflow | **D** | No employees, all bookings unassigned, and assignment index missing |
| Existing proven customer identity | **A at record level only** | One exact link exists, but it does not make the customer-facing release ready while other ownership conflicts remain |

Absent employees and unassigned bookings do not block the owner-operator beta. They block
only employee assignment and employee Field Mode.

## No-Write Boundaries Preserved

No Firebase Auth user, application Storage resource, CORS policy, Firestore/Storage rule,
index, booking, lead, payment, Stripe field, service record, customer detail, or tenant
business field changed. No application was merged or deployed. The only production writes
were the separately approved backup bucket and complete Firestore export.

## Remaining Blockers

1. Deployed Firestore rules differ from canonical V1 and retain broad authenticated access.
2. Customer-ready V1 is blocked by one cross-tenant duplicate `authUid`, one
   customer/profile tenant mismatch, one customer linked to a non-customer role, and the
   resulting inability to complete a safe production customer-role privacy smoke.
3. Firebase application Storage, Storage rules, and CORS are absent for photo workflows.
4. No employees or assignments exist, and the employee assignment index is missing.
5. No production-equivalent staging Firebase project exists.

## Validation

No application or rules behavior changed.

| Gate | Result |
| --- | --- |
| Web lint | Pass |
| Web full suite | Pass: 47 files, 388 tests |
| Web production build | Pass: 324 modules; existing bundle warnings only |
| Cloud Functions | Pass: 39/39 |
| Firestore rules | Pass: 35/35 |
| Storage rules | Pass: 15/15 |
| Rules parity | Pass |

Rules tests ran only against the fake `demo-servicesos-rules` project on alternate
loopback ports. No validation command connected to production.

## Recommended Next Action

Customer identity remediation is required for customer-ready V1; it is not V1.1 or
optional cleanup. Jamie should approve a separate exact remediation plan for the three
Category F records, including how to remove the incorrect cross-tenant `authUid`, resolve
the tenant mismatch, and unlink or correct the non-customer role conflict. Owner-operator
wife-beta planning may proceed independently only while Customer Portal access remains
excluded from that track.
