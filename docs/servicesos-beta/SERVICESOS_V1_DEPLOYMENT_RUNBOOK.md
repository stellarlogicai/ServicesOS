# ServicesOS V1 Deployment Runbook

Status: **Planning only. Do not execute without Jamie's approval.**

Production project: `cleaning-intake-system`

Protected application reference:
`031bb46249fd09bbe7014e5f9747d4a7a4737a6f`

V1 candidate reference:
`fcad78e7d7425c0b3add53482eb2515e141b9314`

Proposed release branch: `release/servicesos-v1`

## 1. Non-Negotiable Gates

Do not begin promotion until every item is checked:

- [ ] Deployed Firestore rules source and release timestamp captured privately.
- [ ] Deployed Storage rules source and release timestamp captured privately.
- [ ] Production composite indexes and field overrides captured.
- [ ] Current Netlify deploy ID, commit, production branch, and auto-publish state captured.
- [ ] Storage CORS and bucket protection settings captured.
- [ ] Every active Storage prefix classified against final rules.
- [ ] Production identities, memberships, linked customers, and booking assignments audited.
- [ ] No active user depends on a missing `authUid`, membership, or ambiguous assignment.
- [ ] Full Firestore export completed and verified.
- [ ] Storage inventory snapshot and object backup completed and verified.
- [ ] Existing app compatibility with final rules explicitly reviewed.
- [ ] Missing assignment index created and `READY`.
- [ ] Release branch validation is green.
- [ ] Jamie approves the maintenance/promotion window and rollback owner.

No V1 Cloud Functions runtime code changed. Do not deploy Functions. Do not deploy
Firebase Hosting; Netlify is the identified live web surface.

## 2. Read-Only Capture

These commands are read-only. Confirm the active account and target first.

```powershell
firebase projects:list
firebase firestore:databases:get "(default)" --project cleaning-intake-system
firebase firestore:indexes --project cleaning-intake-system
firebase functions:list --project cleaning-intake-system
firebase hosting:sites:list --project cleaning-intake-system
gcloud config get-value project
gcloud storage buckets describe gs://cleaning-intake-system.firebasestorage.app --format="default(cors_config,location,storage_class,soft_delete_policy,versioning_enabled)"
```

Use Firebase Console to privately copy deployed Firestore and Storage Rules source and
release timestamps. Use Netlify > Deploys to record the currently published deploy ID,
commit, branch, deploy time, and rollback permalink. Do not commit secrets or raw data.

## 3. Backup Execution

Everything in this section writes to production or backup infrastructure and requires a
separate Jamie approval.

### 3.1 Git checkpoints

Effect: creates release references only; no application deployment.

```powershell
git fetch origin --prune
git rev-parse origin/master
git rev-parse origin/v1-lab-field-assignment-visibility
git tag -a servicesos-v1-predeploy-<UTC> 031bb46249fd09bbe7014e5f9747d4a7a4737a6f -m "ServicesOS pre-V1 production reference"
git push origin servicesos-v1-predeploy-<UTC>
```

Verification: tag resolves to the protected commit locally and on origin.

### 3.2 Firestore managed export

Prerequisites: Blaze billing, an approved backup bucket near `nam5`, and Firestore
Import/Export Admin plus required Storage access. Managed export is not a perfectly
instantaneous snapshot and incurs document reads.

```powershell
gcloud firestore export gs://<APPROVED_BACKUP_BUCKET>/servicesos-v1/firestore/predeploy-<UTC> `
  --database="(default)" `
  --project=cleaning-intake-system

gcloud firestore operations list `
  --database="(default)" `
  --project=cleaning-intake-system
```

Effect: reads Firestore and writes export objects to the approved backup bucket.

Verification:

- operation reports success;
- destination contains the export metadata file and collection outputs;
- record exact path, operation ID, start/end time, and operator privately;
- retain until V1 is stable and the agreed retention period expires.

Restore is not automatic and is not an exact time reversal of later writes:

```powershell
gcloud firestore import gs://<APPROVED_BACKUP_BUCKET>/servicesos-v1/firestore/predeploy-<UTC> `
  --database="(default)" `
  --project=cleaning-intake-system
```

Import requires incident approval and a reconciliation plan for writes made after export.

### 3.3 Storage inventory and copy

First create a private metadata inventory. Do not commit object names.

```powershell
gcloud storage ls --all-versions --recursive --long `
  gs://cleaning-intake-system.firebasestorage.app `
  > <PRIVATE_BACKUP_DIR>\servicesos-storage-inventory-<UTC>.txt
```

Effect: read-only object listing written to a private local backup location.

Preferred backup: one-time Cloud Storage-to-Cloud Storage Transfer Service job to an
approved backup bucket. Preserve metadata, never delete from source or destination, and
do not overwrite an existing dated prefix.

```powershell
gcloud transfer jobs create `
  gs://cleaning-intake-system.firebasestorage.app/ `
  gs://<APPROVED_BACKUP_BUCKET>/servicesos-v1/storage/predeploy-<UTC>/ `
  --description="ServicesOS V1 predeploy backup <UTC>" `
  --overwrite-when=different `
  --preserve-metadata=acl,cacheControl,contentDisposition,contentEncoding,contentLanguage,contentType,customMetadata,customTime `
  --log-actions=copy `
  --log-action-states=succeeded,failed `
  --project=cleaning-intake-system
```

Effect: creates and runs a transfer that reads source objects and writes copies. Do not
use either `--delete-from` option.

Verification:

- transfer operation succeeds with zero failed objects;
- source and destination sanitized object counts and total bytes match;
- sample metadata and checksums match without downloading customer objects;
- backup bucket retention/soft-delete policy is recorded;
- restore is a separately approved reverse transfer into a controlled prefix or the
  source bucket after impact analysis.

## 4. Release Branch Integration

The protected master is an ancestor of the V1 candidate and the range is linear. Use a
fast-forward-only release branch to preserve the 19 reviewed commits.

```powershell
git fetch origin --prune
git switch --create release/servicesos-v1 origin/master
git merge --ff-only origin/v1-lab-field-assignment-visibility
git log --oneline --decorate 031bb46249fd09bbe7014e5f9747d4a7a4737a6f..HEAD
git diff --check
git status -sb
```

Expected release HEAD:
`fcad78e7d7425c0b3add53482eb2515e141b9314`.

Reject the release if:

- fast-forward-only merge fails;
- commit count is not 19;
- a merge commit appears;
- any unrelated file changes;
- any Stripe/backend runtime diff appears;
- credentials, fixture data, or emulator outputs are tracked.

Push the release branch only after review:

```powershell
git push -u origin release/servicesos-v1
```

Do not merge or push master at this stage.

## 5. Release Validation

From `servicesos-web`:

```powershell
npm run lint
npm test -- --run
npm run build
```

From `cloud-functions`:

```powershell
npm test
npm run test:rules-parity
npm run test:firestore-rules
npm run test:storage-rules
npm run test:rules
```

Run the established authenticated emulator smoke with project
`demo-servicesos-v1-smoke-local`. The seed/reset scripts must refuse to run without all
loopback emulator variables. Never point them at production.

## 6. Index Preparation

Production is missing exactly this repository index:

```text
bookings, COLLECTION scope
assignedEmployeeAuthUid ASC
status ASC
date DESC
```

After confirming the production/local diff still contains only that addition, Jamie may
approve:

```powershell
cd cloud-functions
npx firebase-tools@13.35.1 deploy --only firestore:indexes --project cleaning-intake-system
```

Effect: writes index configuration. It must not be combined with rules deployment.

Verification:

```powershell
npx firebase-tools@13.35.1 firestore:indexes --project cleaning-intake-system
```

Wait until the new index is `READY`, then run the employee assignment query using a
controlled test account. Do not publish the app while the index is building.

## 7. Production Data Preparation

Only execute a separately reviewed, deterministic remediation plan based on the private
worksheet. Back up first. Every change must record before/after values and operator.

Allowed preparation categories:

- canonical profile role/status/tenant fields;
- admin UID membership in tenant `users` and `adminUsers`;
- employee UID membership in tenant `users`;
- customer record `authUid` verified against the intended Firebase Auth user;
- canonical booking `assignedEmployeeAuthUid` after explicit human mapping.

Never infer identity or assignment from name, email, array position, first employee, or
ambiguous legacy IDs. Never alter payment, Stripe, price, schedule, customer, or field
execution truth as part of preparation.

## 8. Deployment Order Decision

No order is approved until deployed rules and Storage usage are captured.

### Rejected now: Option A, app before final rules

Publishing employee/photo features while unknown older rules are active could expose
broader booking or Storage access. Reject unless deployed rules are captured and proven at
least as strict for every new operation.

### Preferred when compatibility is proven: Option C

```text
backups and evidence
-> index READY
-> data preparation
-> lock Netlify auto-publishing / controlled window
-> final Firestore rules
-> final Storage rules
-> V1 web application
-> production smoke
-> unlock publishing
```

Use this only if the current production app is proven compatible with the final rules and
the Storage inventory shows no active denied legacy path. It avoids exposing the new app
under older permissive rules. The brief risk is old-app permission denial, so schedule a
controlled window and publish the V1 web immediately after both rules deploys pass.

### Conditional Option B: narrow bridge

Use only if one proven current-app operation needs temporary compatibility while the V1
app changes its path. The bridge must name the exact role, path, and changed keys, be
emulator-tested, have an expiration/removal step in the same window, and never use broad
authenticated access. No bridge is currently implemented or approved.

### Reject Option C if

- current app depends on a path denied by final rules;
- Storage contains active unsupported objects;
- required memberships/authUid values are incomplete.

In that case, stop. Prepare data/migrate objects or implement a separately reviewed narrow
bridge. Do not switch to app-first by default.

## 9. Controlled Promotion Commands

These are write-capable and require Jamie's explicit per-step approval.

1. Lock Netlify auto-publishing in the UI and record the current deploy ID.
2. Deploy Firestore rules only:

```powershell
cd cloud-functions
npx firebase-tools@13.35.1 deploy --only firestore:rules --project cleaning-intake-system
```

3. Verify rule release and run immediate admin/customer/employee denial checks.
4. Deploy Storage rules only:

```powershell
npx firebase-tools@13.35.1 deploy --only storage --project cleaning-intake-system
```

5. Verify Storage rule release and controlled photo/branding access.
6. Publish the reviewed Netlify deploy built from exact release HEAD `fcad78e...`.
   Prefer a Netlify Git deploy from the approved release/master commit; do not use an
   untracked local artifact.
7. Run `SERVICESOS_V1_PRODUCTION_SMOKE_CHECKLIST.md` immediately.
8. If every required check passes, merge/fast-forward protected master through the
   approved repository process and tag the released commit:

```powershell
git tag -a servicesos-v1 -m "ServicesOS V1" fcad78e7d7425c0b3add53482eb2515e141b9314
git push origin servicesos-v1
```

9. Unlock Netlify auto-publishing only after confirming the configured production branch
   and released commit.

Do not deploy Cloud Functions, Firebase Hosting, Stripe configuration, CORS, refunds, or
platform-fee changes in this release.

## 10. Immediate Stop/Rollback Triggers

- cross-tenant Firestore or Storage access;
- customer access to photos/admin data;
- employee sees unassigned, cancelled, another employee's, or other-tenant jobs;
- field/assignment/photo action changes payment or Stripe fields;
- linked customer cannot access own request after verified data preparation;
- normal admin cannot perform booking/customer/settings workflows;
- photo upload/read fails for supported roles after CORS is confirmed;
- widespread permission-denied errors;
- missing-index error after index was expected ready;
- Stripe status falsely changes or onboarding display regresses.

Follow `SERVICESOS_V1_ROLLBACK_RUNBOOK.md`. Do not deploy permissive emergency rules.

## 11. Completion Record

Record privately:

- operator and approver;
- start/end UTC;
- predeploy Git tag;
- Firestore export path and operation ID;
- Storage transfer job/run ID;
- prior and new rule release IDs;
- index status;
- prior and new Netlify deploy IDs;
- production smoke results;
- rollback decision and any writes requiring reconciliation.
