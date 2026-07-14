# ServicesOS V1 Rollback Runbook

Status: **Planning only. No rollback action is pre-approved.**

Protected pre-V1 Git reference:
`031bb46249fd09bbe7014e5f9747d4a7a4737a6f`

V1 candidate:
`fcad78e7d7425c0b3add53482eb2515e141b9314`

The current production Netlify deploy ID, deployed Firestore/Storage rules release IDs,
CORS capture, and backup locations must be inserted into the private deployment record
before promotion. Their absence blocks promotion.

## 1. Authority And Decision

- Jamie is the release owner and decides rollback.
- The operator may stop the deployment immediately on a safety trigger, but must not
  improvise broad rules, data rewrites, or Stripe changes.
- Security isolation failures require immediate application rollback and traffic control,
  followed by rule rollback only to the captured known-safe ruleset.
- Data restoration requires a separate incident decision because it can overwrite valid
  writes made after backup.

## 2. Immediate Rollback Triggers

Rollback/block the release if any of these occur:

- cross-tenant data or object access;
- customer access to admin, Field Mode, export, or photo evidence;
- employee access to unassigned, cancelled, other-employee, or other-tenant jobs;
- employee writes outside Field Mode allowlisted fields;
- assignment, completion, or photo actions change payment/Stripe truth;
- broad permission denials on approved owner/customer workflows;
- Storage rules make an active required object family inaccessible;
- supported before/after photo upload/read fails after CORS is known correct;
- customer ownership links fail after verified preparation;
- booking assignments become incorrect or are inferred ambiguously;
- Stripe status/onboarding presentation is false or unsafe;
- the production app is not the reviewed commit.

## 3. Preserve Evidence First

Before changing anything, when safe:

1. Record UTC, operator, affected role/tenant category, request path category, browser
   error, and current deploy/rules IDs.
2. Stop further test writes and notify the release owner.
3. Lock Netlify auto-publishing so a later Git event cannot overwrite the rollback.
4. Do not copy names, emails, UIDs, addresses, or object names into tracked issues/docs.
5. Record booking/customer/object identifiers only in the private incident worksheet.

## 4. Web Application Rollback

Preferred action: in Netlify > Deploys, open the previously captured successful production
deploy and choose **Publish Deploy**. Netlify describes this as publishing a previous
atomic deploy; it does not create a new build. Keep auto-publishing locked because a new
Git-triggered deploy can overwrite the rollback.

Required verification:

- `https://servicesos.netlify.app` serves the captured prior deploy ID;
- login, Dashboard, Customers, Bookings, Calendar, and sign-out load;
- browser assets correspond to the prior deploy;
- no V1-only write is performed merely to test rollback.

Git fallback reference:

```powershell
git show --no-patch 031bb46249fd09bbe7014e5f9747d4a7a4737a6f
```

Do not force-push master. If Netlify cannot republish the captured atomic deploy, create a
separately approved rollback branch at the protected commit and deploy that exact commit
through the normal reviewed workflow.

## 5. Firestore Rules Rollback

Prerequisite: exact predeploy rules source was privately captured and reviewed before the
release. Repository master is not proof of what was deployed.

1. Place the captured source in a private incident worktree/configuration.
2. Confirm its hash matches the predeploy capture.
3. Run emulator syntax/behavior checks where possible.
4. With Jamie approval, deploy only Firestore rules to project
   `cleaning-intake-system`.
5. Record the resulting rules release ID/timestamp.

Never replace the incident with `allow read, write: if request.auth != null` or another
broad authenticated rule.

Verification:

- affected approved workflow behaves as it did before deployment;
- unauthenticated, cross-tenant, customer-admin, and employee-payment denials still hold;
- no data document was altered by rules rollback.

## 6. Storage Rules Rollback

Prerequisite: exact prior Storage rules and CORS were privately captured.

Deploy only the captured Storage rules after Jamie approval. Do not change CORS as part of
a rules rollback unless the incident is specifically a reviewed CORS regression and the
prior CORS file is known.

Verification:

- previously active required path categories are accessible to their prior roles;
- no object becomes public;
- customer and cross-tenant denial remains intact;
- object data is unchanged.

Rules rollback does not restore deleted/moved objects or metadata.

## 7. Index Rollback

The new assignment index can remain after application rollback; an unused composite index
does not change document access or data truth. Index deletion is not an immediate recovery
mechanism and can itself take time. Do not delete it during an incident unless a later
cost/cleanup review explicitly approves deletion.

If the index never reached `READY`, keep the prior web app active and wait or investigate.
Do not publish employee assignment queries that require a building/failed index.

## 8. Data Preparation Rollback

Every preparation write must have a private before/after ledger.

### Identity/membership

- restore only the exact prior fields when the new value is proven wrong;
- never remove a membership while the account is actively being used without coordinating
  sign-out/session handling;
- do not roll back correct canonical role/status/tenant data merely because the app was
  rolled back.

### Customer `authUid`

- remove or restore only after confirming the intended Auth/customer link;
- treat any cross-customer link as a security incident;
- never substitute email matching during rollback.

### Employee assignment

- restore the exact prior assignment from the ledger;
- ambiguous legacy values remain unassigned;
- verify reassignment immediately revokes/grants employee access as intended;
- confirm payment, price, schedule, customer, Stripe, and field-execution fields did not
  change.

## 9. Firestore Data Restore

Managed import is a last-resort operation, not the first response to an application/rules
failure. It can overwrite documents with exported versions and does not automatically
remove unrelated later documents. It also cannot safely reconcile valid writes made after
the export without analysis.

Only after incident approval:

```powershell
gcloud firestore import gs://<APPROVED_BACKUP_BUCKET>/servicesos-v1/firestore/predeploy-<UTC> `
  --database="(default)" `
  --project=cleaning-intake-system
```

Before import:

- freeze affected writes where operationally possible;
- export the current incident state to a new path;
- identify all writes since the predeploy export;
- choose whole-database import or targeted manual reconciliation;
- confirm the export operation completed successfully.

After import, reconcile post-backup customer requests, bookings, payment confirmations,
manual payments, assignments, field execution, and photo metadata. Never overwrite a
Stripe webhook-confirmed state with an older export without payment reconciliation.

## 10. Storage Object Restore

Use the verified predeploy Storage copy and manifest. Prefer restoring only impacted
objects/prefixes into a controlled location first. A reverse Storage Transfer Service job
is write-capable and requires explicit incident approval.

Do not:

- use delete-from-source or delete-from-destination options;
- make objects public;
- restore legacy objects into canonical paths without an approved mapping;
- overwrite newer evidence without preserving its generation/metadata;
- claim rules rollback restored objects.

Verify object count, bytes, checksums/generations, content type, cache metadata, and access
rules after restoration.

## 11. Scenario Matrix

| Failure | First action | Rollback scope | Data reconciliation |
| --- | --- | --- | --- |
| Web UI/runtime regression | republish prior Netlify deploy | web only | inspect writes during window |
| Firestore permission regression | web rollback, then captured rule rollback if needed | web/rules | normally none |
| Storage permission regression | web rollback, captured Storage rules | web/rules | normally none |
| Missing index | keep/restore prior web | web only | none |
| Failed employee mapping | revoke/restore exact assignment | targeted data | assignment ledger |
| Failed customer link | block access; restore exact link | targeted data/security | ownership audit |
| Active legacy Storage path denied | stop Storage rules/app promotion | rules/web | object migration later |
| Photo upload/read regression | stop photo use; web/rules rollback | web/Storage rules | inspect orphan metadata/object |
| Stripe onboarding display regression | web rollback | web only | do not change Stripe account |
| Cross-tenant access | lock release, web rollback, known-safe rules | web and affected rules | security incident audit |

## 12. Rollback Verification

Minimum checks after any rollback:

- production URL serves the intended prior deploy;
- normal admin can log in and open core owner surfaces;
- customer sees only own portal data;
- employee cannot see another tenant/unassigned/cancelled jobs;
- super-admin has no tenant selected after refresh;
- cross-tenant Firestore and Storage attempts remain denied;
- no field/assignment/photo action altered payment truth;
- current rules/deploy IDs are recorded;
- all writes during the deployment/rollback window are inventoried for reconciliation.

## 13. Closeout

Do not unlock Netlify or resume promotion until Jamie records:

- root cause;
- rollback actions and exact references;
- verification evidence;
- data reconciliation status;
- whether backups were used;
- corrected promotion plan and a new approval.

Official references:

- Netlify rollback: https://docs.netlify.com/deploy/manage-deploys/manage-deploys-overview/#rollbacks
- Firestore import/export: https://firebase.google.com/docs/firestore/manage-data/export-import
- Firebase Rules management: https://firebase.google.com/docs/rules/manage-deploy
- Cloud Storage protection: https://cloud.google.com/storage/docs/protection-backup-recovery-overview
