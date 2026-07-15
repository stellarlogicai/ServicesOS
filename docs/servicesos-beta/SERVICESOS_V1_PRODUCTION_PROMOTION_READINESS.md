# ServicesOS V1 Production Promotion Readiness

Audit date: 2026-07-14

Audit branch: `v1-lab-production-promotion-readiness`

Audited V1 HEAD: `fcad78e7d7425c0b3add53482eb2515e141b9314`

Protected production candidate: `master` / `origin/master` at
`031bb46249fd09bbe7014e5f9747d4a7a4737a6f`

Production changes performed: **None**

Preflight follow-up: see `SERVICESOS_V1_PRODUCTION_PREFLIGHT_EVIDENCE.md`. Jamie manually
authenticated to the confirmed production Console. Viewer evidence now confirms that the
deployed Firestore rules differ from V1 and contain broad authenticated access, all 21
production indexes are enabled but the employee-assignment index is missing, application
Storage is not initialized, canonical admin tenant memberships are absent, no employee
profiles exist, all inspected bookings are unassigned, and customer ownership preparation
is incomplete. Overall classification remains **D - production promotion blocked**.

Storage-readiness follow-up: see `SERVICESOS_V1_PRODUCTION_STORAGE_READINESS.md`. The
deployed canonical Storage rules can reach three Firestore documents for intended
tenant-admin photo creates and assigned-employee photo reads/creates, exceeding the
two-document Storage Rules limit. The Firebase cross-service permission action and
production photo smoke remain blocked until a separately reviewed least-privilege rules
correction passes the call-count audit.

## Executive Result

The V1 lab history is complete, linear, pushed, and locally validated. Repository
configuration positively identifies Firebase project `cleaning-intake-system`, the
default Firestore database, the production Storage bucket, Node 22 Cloud Functions in
`us-central1`, and Netlify at `https://servicesos.netlify.app` as the live web surface.

Overall classification: **D - production promotion blocked**.

The block is operational evidence, not a newly found application defect. Promotion must
not begin until Jamie captures the deployed Firestore and Storage rules, classifies all
active Storage prefixes, audits production identities and booking assignments, captures
the current Netlify deployment, and prepares backups. A separate confirmed blocker is
that production does not yet contain the canonical employee-assignment composite index.

## Classification

- **A - Ready for controlled promotion:** proven in repository validation/emulators.
- **B - Requires production read-only verification:** credentials or console evidence needed.
- **C - Requires data preparation:** production records must be corrected before promotion.
- **D - Blocks production promotion:** promotion must not start.
- **E - Deferred V1.1 cleanup:** intentionally outside V1.

## 1. Git And Release Inventory

| Item | Evidence | Result |
| --- | --- | --- |
| Current branch | `v1-lab-production-promotion-readiness` | A |
| Current/base HEAD | `fcad78e7d7425c0b3add53482eb2515e141b9314` | A |
| Protected master | Local and origin both `031bb46249fd09bbe7014e5f9747d4a7a4737a6f` | A |
| V1 commit range | `031bb46249fd09bbe7014e5f9747d4a7a4737a6f..fcad78e7d7425c0b3add53482eb2515e141b9314` | A |
| History | 19 commits, zero merge commits, 88 changed tracked files | A |
| Remote state | V1 HEAD is on `origin/v1-lab-field-assignment-visibility`; local/remote divergence `0/0` | A |
| Tags | No release tags currently exist | B |
| Working tree at audit start | Clean | A |

### V1 commit inventory

1. `c27194b` Add ServicesOS true V1 standards and gap plan
2. `395e43a` Add Field Mode job execution MVP
3. `0898ac0` Add Field Mode rules hardening plan
4. `73187be` Harden Field Mode booking update rules
5. `b04abb9` Add owner job completion review
6. `cdb8238` Add safe cleanup archive controls
7. `6216adc` Add copy-ready customer messages
8. `bbe5f27` Add business settings readiness
9. `b4742fe` Restore safe Stripe onboarding action in business settings
10. `3d245b8` Add tenant-scoped CSV export basics
11. `70ffa84` Harden tenant-scoped customer intake and rules
12. `fbfd10c` Add employee-only Field Mode access
13. `18ea497` Add tenant-scoped field photo evidence
14. `2dba41e` Add ServicesOS V1 integration readiness report
15. `336c22a` Reconcile Firebase rules and active legacy paths
16. `ed3e534` Fix super-admin selected-tenant propagation
17. `64ac01d` Add ServicesOS V1 authenticated smoke plan
18. `42bcee1` Add ServicesOS V1 emulator smoke environment
19. `fcad78e` Restrict employee jobs and support owner-operator photos

No completed V1 slice is absent from the linear range.

### Local-file safety

The following remain ignored and untracked:

- `.servicesos-smoke-credentials.local.json`
- `.servicesos-smoke-fixtures.local/`
- local `.env` and `.env.local` files
- emulator and Firebase debug logs

`servicesos-web/.env.v1-smoke` is intentionally tracked. It contains only the fixed fake
project `demo-servicesos-v1-smoke-local`, loopback emulator hosts, and no production
credentials.

## 2. Environment Inventory

| Environment | Project/URL | Evidence | Result |
| --- | --- | --- | --- |
| Production Firebase | `cleaning-intake-system` | `.firebaserc` plus read-only `firebase projects:list` | A |
| Production Firestore | `(default)`, `nam5`, native mode | read-only `firestore:databases:get` | A |
| Production Storage | `cleaning-intake-system.firebasestorage.app` | sanitized Firebase Web SDK config | A |
| Production Functions | `cleaning-intake-system`, `us-central1`, Node 22, first generation | read-only `functions:list` | A |
| Production web | `https://servicesos.netlify.app` | `netlify.toml`, repository references, HTTP 200/Netlify response | A |
| Firebase Hosting | `https://cleaning-intake-system.web.app` exists but is not the identified live app | read-only `hosting:sites:list` | B: do not deploy |
| Staging | No staging Firebase project or linked staging site found | repository audit | D for realistic preview |
| Emulator | `demo-servicesos-v1-smoke-local`; Auth 9099, Firestore 8080, Storage 9199 | `.env.v1-smoke`, `firebase.json` | A |

Production and emulator targets are explicitly distinguishable. Emulator mode requires
both the opt-in flag and the exact fake project ID; a production-like mismatch throws.

### Deployment configuration

- Netlify builds from `servicesos-web` with `npm run build`, publishes `dist`, and uses
  Node 20 with an SPA rewrite.
- Firebase deploy sources are `cloud-functions/firestore.rules`,
  `cloud-functions/firestore.indexes.json`, and `cloud-functions/storage.rules`.
- Cloud Functions use Node 22 from `cloud-functions/index.js`.
- No GitHub Actions deployment workflow exists.
- No local `.netlify/state.json` exists, so the Netlify site/deploy ID cannot be safely
  queried without linking or using Jamie's Netlify console.
- No V1 Cloud Functions runtime file changed. Promotion must not redeploy Functions.
- No Firebase Hosting deployment is part of the proposed promotion.

## 3. Read-Only Production Evidence

Commands below were run with explicit project `cleaning-intake-system`. Only sanitized
results were retained; SDK API keys and app IDs were not printed.

| Read-only command | Sanitized result |
| --- | --- |
| `firebase projects:list --json` | One accessible project; target found |
| `firebase apps:list WEB --project cleaning-intake-system --json` | One web app, display name `cleaning app` |
| `firebase apps:sdkconfig WEB <app-id> --project cleaning-intake-system --json` | Correct project/auth domain; production bucket captured; API key suppressed |
| `firebase firestore:databases:get '(default)' --project cleaning-intake-system --json` | `nam5`, native mode, pessimistic concurrency, PITR disabled, delete protection disabled |
| `firebase firestore:indexes --project cleaning-intake-system --json` | 21 composite indexes and zero field overrides captured |
| `firebase functions:list --project cleaning-intake-system --json` | 13 functions; Node 22, `us-central1`, first generation |
| `firebase hosting:sites:list --project cleaning-intake-system --json` | One Firebase Hosting site |
| HTTP `HEAD https://servicesos.netlify.app/` | 200, served by Netlify |

Deployed functions captured:

`cancelSubscription`, `confirmPayment`, `createBookingCheckoutSession`,
`createConnectedAccount`, `createPaymentIntent`, `createStripeCustomer`,
`createSubscription`, `generateOnboardingLink`, `getConnectedAccountStatus`,
`getSubscription`, `stripeWebhook`, `subscriptionWebhook`, `updateSubscription`.

### Not verified

| Evidence | Why it is not verified | Jamie capture |
| --- | --- | --- |
| Deployed Firestore rules source/release timestamp | Firebase CLI used here has no proven read-only release export; no broad Rules API access was attempted | Firebase Console > Firestore > Rules: save exact source and release timestamp privately |
| Deployed Storage rules source/release timestamp | Same restriction | Firebase Console > Storage > Rules: save exact source and release timestamp privately |
| Storage CORS | `gcloud`/`gsutil` unavailable; no credential workaround attempted | Cloud Console > bucket > Configuration > CORS, or read-only `gcloud storage buckets describe ... --format="default(cors_config)"` |
| Storage path inventory | Storage listing credentials/tooling unavailable; no object names were requested | Run the sanitized inventory checklist below with Object Viewer only |
| Function update timestamps/revisions | Firebase CLI response did not include timestamps | Google Cloud Console > Cloud Functions; record name, region, runtime, last deployed time |
| Netlify deployment ID/commit/build time | repository is not locally linked to Netlify | Netlify > ServicesOS > Deploys > Published deploy; record deploy ID, commit, branch, time |
| Production identities, memberships, customer links | no approved read-only data credential | operator audit below |
| Production booking assignments | no approved read-only data credential | operator audit below |

Because the deployed rules and Storage inventory are not captured, the task stop
conditions are active. No promotion commit, merge, backup, or deployment may follow from
this report alone.

## 4. Production Storage Inventory Gate

Known bucket: `gs://cleaning-intake-system.firebasestorage.app`.

Use only `roles/storage.objectViewer` plus Viewer if the Console requires it. Record
sanitized prefix, object count, total bytes, MIME classes, largest object, and whether any
object exceeds the proposed limit. Do not record full object names.

Suggested read-only inventory command after Jamie confirms the account and target:

```powershell
gcloud config get-value project
gcloud storage ls --recursive --long gs://cleaning-intake-system.firebasestorage.app
```

The raw listing is private and must not be committed. Reduce it to these categories:

| Sanitized pattern/category | V1 rule treatment | Current classification |
| --- | --- | --- |
| `tenants/<tenant>/bookings/<booking>/field-photos/{before|after}/...` | JPEG/PNG/WebP, 10 MB, authenticated role/assignment | A in rules; B in production |
| `tenants/<tenant>/branding/...` | Super-admin only; JPEG/PNG/WebP/GIF/ICO, 5 MB | A in rules; B in production |
| `tenants/<tenant>/documents/...` | denied | E until proven active; active use becomes B/C/D |
| `tenants/<tenant>/signatures/...` | denied | E until proven active; active use becomes B/C/D |
| `tenants/<tenant>/photos/...` | denied | E until proven active; active use becomes B/C/D |
| `tenants/<tenant>/property_conditions/...` | denied | E until proven active |
| `tenants/<tenant>/incidents/...` | denied | E until proven active |
| global `jobPhotos/...` | denied | E until proven active; active use requires migration |
| `tenants/DEFAULT/...` | denied | D if active |
| arbitrary root prefixes | denied | E/unknown; active use blocks deployment |

Required classifications for each populated prefix:

- A: supported by final V1 rules.
- B: active and needs one narrow compatibility rule.
- C: active and must be migrated to the canonical path.
- D: stale and may remain inaccessible after explicit owner confirmation.
- E: unknown and blocks Storage rules deployment.

Explicitly identify SVG branding, documents/signatures, global photos, `DEFAULT` objects,
files larger than limits, and unsupported content types. Storage rules remain blocked
until every active category is classified.

## 5. Identity And Membership Gate

Use a private, non-versioned worksheet with columns:

`accountCategory`, `profilePresent`, `canonicalRole`, `status`, `tenantPresent`,
`tenantUsersMember`, `tenantAdminMember`, `linkedCustomerPresent`,
`customerAuthUidMatches`, `remediation`, `verifiedAt`.

Never copy names, emails, UIDs, tenant IDs, or customer IDs into tracked docs.

Sanitized counts required before promotion:

| Category | Required checks | Classification until counted |
| --- | --- | --- |
| All Auth users | profile present; role in customer/employee/admin/super-admin; supported status | B/D |
| Admin | active, tenant ID, UID in tenant `users` and `adminUsers` | B/C |
| Employee | active, tenant ID, UID in tenant `users` | B/C |
| Customer | active, tenant ID, linked customer record, exact `authUid`, not archived/disabled | B/C |
| Super-admin | active canonical profile; no `DEFAULT` dependency | B/C |

Email or display-name matching is not an ownership proof and must not be used for
remediation.

## 6. Booking Assignment Migration Gate

Sanitized production counts required:

- canonical `assignedEmployeeAuthUid` present;
- unassigned;
- legacy `assignedEmployeeId` only;
- legacy `assignedEmployees` only;
- canonical UID missing from Auth/profile;
- assigned employee inactive or outside tenant membership;
- cancelled, completed, and current/future scheduled.

Owner/admin operation remains safe for unassigned bookings. Employee Field Mode requires
an exact active same-tenant Firebase Auth UID in `assignedEmployeeAuthUid`. Legacy IDs do
not grant access and must not be mapped by email, name, array position, first employee, or
an ambiguous legacy identifier. Ambiguous records remain unassigned and invisible to
employees until manually verified.

Current classification: **B/C - not verified; production preparation may be required**.

## 7. Firestore Compatibility Matrix

The matrix reflects the reconciled repository rules, not the unknown deployed rules.

| Operation | Caller/path | Required data | Final rules | Evidence | Production gate |
| --- | --- | --- | --- | --- | --- |
| Profile read / safe self update | own `users/{uid}` | Auth UID; allowlisted profile fields | Allowed | rules tests | Smoke |
| Tenant read | admin/super-admin `tenants/{tenant}` | active role; membership or selected tenant | Allowed | rules/context tests | membership audit |
| Business Settings update | admin tenant root | admin membership; allowlisted nested settings | Allowed | rules/service tests | smoke |
| Customer CRUD/archive | manager customer path | same tenant admin/super-admin | Allowed | rules/service tests | smoke |
| Customer own record read | linked customer path | exact active `authUid` | Allowed | rules tests | authUid audit |
| Customer quote create/read | tenant lead path | linked customer, matching UID/tenant, fixed request truth | Allowed | rules/service tests | authUid audit/smoke |
| Owner lead review | tenant leads | admin membership/selected super-admin tenant | Allowed | rules tests | smoke |
| Booking create | tenant bookings | manager; fixed allowlist; scheduled; valid optional assignment | Allowed | rules/workflow tests | membership audit |
| Booking cancel/admin edit | tenant booking | manager; allowlisted patch | Allowed | rules/component tests | smoke |
| Canonical assignment | tenant booking | active same-tenant employee in tenant users | Allowed | rules/assignment tests | assignment audit |
| Manual payment update | tenant booking | manager; manual states; updater UID | Allowed | rules/payment tests | smoke |
| Tenant payment read | tenant payments | manager | Read-only | rules tests | smoke if active |
| Employee Field Mode read | assigned booking | active employee, tenant member, exact assignment | Allowed | rules/UI tests | index plus smoke |
| Employee field execution | assigned booking | only 11 execution keys | Allowed | rules/service tests | smoke |
| Field-photo metadata | nested booking subcollection | manager or assigned employee; canonical metadata | create/read only | rules/service tests | Storage inventory/CORS |
| Data Export | tenant customers/leads/bookings | active manager/selected tenant | Allowed | service/context tests | cross-tenant smoke |
| Calendar | tenant booking query | active manager/selected tenant | Allowed/read-only UI | tests | smoke |
| Super-admin selected tenant | tenant-scoped reads | explicit current selection; no `DEFAULT` | Allowed | context/emulator smoke | production smoke |
| Branding metadata | tenant branding | super-admin | Allowed | rules tests | object inventory |
| Insurance/usage compatibility | existing super-admin paths | super-admin only | narrow allowed paths | rules tests | deferred surface smoke if retained |

No application/rules incompatibility is proven in the tested canonical V1 paths. The
unknown deployed rules, missing assignment index, and production data prerequisites are
deployment blockers. Denied legacy jobs, properties, photos, documents, signatures,
appointments, time clock, AI, review, upsell, and unknown paths are intentionally E unless
production inventory proves active use.

## 8. Storage Compatibility Matrix

| Operation | Final rule result | Evidence | Production gate |
| --- | --- | --- | --- |
| Assigned employee before/after upload/read | Allowed for exact active assignment | 15 Storage tests plus authenticated emulator smoke | CORS and object inventory |
| Tenant admin owner-operated upload/read | Allowed without employee assignment | tests plus manual emulator smoke | CORS |
| Super-admin selected-tenant upload/read | Allowed with explicit selection | tests plus manual emulator smoke | production smoke |
| Reassignment revokes employee access | Enforced by current booking assignment | tests plus emulator smoke | production smoke |
| Admin Booking Detail review | Read-only UI; object read allowed | component/rules tests | CORS |
| Customer access | Denied | rules tests | production denial smoke |
| Branding | super-admin; supported MIME/size only | rules tests | prefix/MIME inventory |
| Favicon | ICO supported | rules tests | inventory |
| SVG branding | denied | rules tests | D if active |
| Documents/signatures/legacy photos/global paths | denied | rules tests | D if active and required |
| Public reads / `DEFAULT` / global paths | denied | rules tests | must remain denied |

## 9. Index Readiness

The repository defines 22 composite indexes and zero field overrides. Production exposes
21 composite indexes and zero field overrides. A normalized definition comparison found
no production-only index. The only confirmed delta is the required collection-scoped
booking assignment index:

```text
collection: bookings
scope: COLLECTION
assignedEmployeeAuthUid ASCENDING
status ASCENDING
date DESCENDING
```

The employee query filters exact `assignedEmployeeAuthUid`, uses `status in` active
states, and orders by descending date. The index is absent in production and must be
created before the V1 web app is published. Firebase documents that composite indexes can
take minutes to build; wait for `READY` and run the query before continuing.

Other active queries either use automatic indexes or an existing composite. Any
production `FAILED_PRECONDITION` is a stop signal; do not add speculative indexes.

## 10. Payment And Stripe Compatibility

Result: **A in the V1 diff; B for production smoke**.

- Payment link creation does not mark paid.
- Booking creation and field completion do not mark paid.
- Manual payment remains explicitly owner-recorded.
- Trusted Stripe status remains webhook-controlled.
- Employee execution allowlists exclude all payment, Stripe, fee, refund, price,
  customer, schedule, and assignment fields.
- Photo actions write only the object and nested photo metadata.
- Assignment changes cannot alter payment fields.
- Business Settings sanitization excludes Stripe readiness fields.
- Tenant payment documents remain client read-only.
- No Cloud Functions runtime, checkout, webhook, platform-fee, or refund implementation
  changed in the 19-commit V1 range.
- `StripeConnectOnboarding.jsx` changed only to retain existing safe status/onboarding UI.

Unexpected Stripe/backend changes during release integration are a D blocker.

## 11. Promotion Blockers

1. **D:** deployed Firestore rules source/release not captured.
2. **D:** deployed Storage rules source/release not captured.
3. **D:** production Storage prefix/MIME/size inventory not captured.
4. **D:** required employee-assignment composite index is absent.
5. **B/C:** production identity and tenant-membership counts are not audited.
6. **B/C:** booking assignment migration counts are not audited.
7. **B:** production Storage CORS is not captured.
8. **B:** current Netlify deploy ID, commit, production branch, and auto-publish state are
   not captured.
9. **B:** Cloud Functions revisions/update timestamps are not captured.
10. **B:** no dedicated staging Firebase project exists for a production-equivalent preview.
11. **D until evidence:** compatibility of the current production app with final rules is
    unknown because deployed rules and active legacy paths are unknown.

## 12. Jamie Approval Gates

Jamie must explicitly approve each write-capable phase separately:

1. Create release branch/tag or push any release reference.
2. Execute Firestore and Storage backups.
3. Prepare production user/customer/assignment data.
4. Create/deploy the missing index.
5. Lock/unlock Netlify auto-publishing or publish a preview/production deploy.
6. Deploy Firestore rules.
7. Deploy Storage rules.
8. Begin the production smoke window.
9. Roll back application, rules, or data.

## 13. Recommendation

Do not merge or deploy. Jamie should first complete the read-only console captures and
sanitized production audits. After all active Storage prefixes and data prerequisites are
classified, review compatibility with the current app and choose the deployment order in
`SERVICESOS_V1_DEPLOYMENT_RUNBOOK.md`. The index can only be approved after the backups
and final production index diff are recorded.

## 14. Validation On This Audit Branch

Application and rules source were unchanged. One full validation pass completed:

| Command/gate | Result |
| --- | --- |
| Web `npm run lint` | Pass |
| Web `npm test -- --run` | Pass: 47 files, 388 tests |
| Web `npm run build` | Pass: 324 modules; existing chunk/dynamic-import warnings only |
| Cloud Functions `npm test` | Pass: 39/39 |
| Rules parity | Pass |
| Firestore rules | Pass: 35/35 |
| Storage rules | Pass: 15/15 |
| Combined rules | Pass: Firestore 35 plus Storage 15 |

The first standalone Firestore-rules invocation could not start because the existing
authenticated-smoke emulator already occupied loopback port 8080. No test ran or failed.
The Firestore, Storage, and combined gates were rerun against the same fake
`demo-servicesos-rules` project on isolated alternate loopback ports; the existing smoke
emulator was left running and repository configuration was not changed.

Official references:

- Firestore export/import: https://firebase.google.com/docs/firestore/manage-data/export-import
- Firestore indexes: https://firebase.google.com/docs/firestore/query-data/indexing
- Firebase Rules management: https://firebase.google.com/docs/rules/manage-deploy
- Cloud Storage object listing: https://cloud.google.com/storage/docs/listing-objects
- Cloud Storage CORS: https://cloud.google.com/storage/docs/using-cors
- Netlify deploy management/rollback: https://docs.netlify.com/deploy/manage-deploys/manage-deploys-overview/
