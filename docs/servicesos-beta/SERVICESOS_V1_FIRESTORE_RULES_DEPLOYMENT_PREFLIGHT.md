# ServicesOS V1 Firestore Rules Deployment Preflight

Status: **Preflight captured. Deployment not authorized or performed.**

Updated: 2026-07-26

Production project: `cleaning-intake-system`

Branch: `release/v1-firestore-rules-deployment-preflight`

Candidate commit: `a1221c8` (`Align employee photo metadata authorization`)

Protected `master` / `origin/master`: `031bb46249fd09bbe7014e5f9747d4a7a4737a6f`

## Scope and production effect

This phase used read-only Firebase Rules API operations to capture the currently released
Firestore rules and prepare a private rollback package. It did not deploy rules, modify
Firestore data, upload Storage objects, or change Storage rules, indexes, Functions,
Hosting, Auth, IAM, CORS, Stripe, or application code.

The production capture command was:

```powershell
node "$env:TEMP\servicesos-firestore-preflight-readonly.js"
```

The temporary script used only authenticated Rules API `GET` operations for releases,
rulesets, and ruleset source. It wrote only to the local temporary directory. The script
and captured source are not repository files.

## Deployed release evidence

| Evidence | Captured value |
| --- | --- |
| Release | `projects/cleaning-intake-system/releases/cloud.firestore` |
| Ruleset ID | `80453f00-867d-4936-9a02-198aa2cdc4d5` |
| Release created | `2026-06-03T00:51:11.789794Z` |
| Release updated | `2026-06-16T21:05:42.902574Z` |
| Ruleset created | `2026-06-16T21:05:42.696815Z` |
| Deployed normalized SHA-256 | `32127306d63bf550a36f26fe77bb5d2a88a4aab434718d9d11daf9d7a254b3b2` |
| Deployed source lines | 190 |

The exact source and complete metadata are private local rollback evidence under:

`%TEMP%\servicesos-v1-firestore-rules-preflight`

Do not commit, paste, or upload that directory. Re-capture it if the production release
changes before deployment approval.

## Comparison with `a1221c8`

The captured source does not match `a1221c8:cloud-functions/firestore.rules`.

| Comparison | Deployed | Candidate `a1221c8` |
| --- | --- | --- |
| Normalized SHA-256 | `32127306d63bf550a36f26fe77bb5d2a88a4aab434718d9d11daf9d7a254b3b2` | `77c065a495c8cce3d7aa3a231f99d670375bf7eacc1d34880cca9bf5e78fc517` |
| Source lines | 190 | 725 |
| Nested booking `fieldPhotos` contract | Missing | Present |
| Legacy broad authenticated booking update | Present | Removed |

The source-level diff contains 700 additions and 165 deletions. The candidate is the
accumulated V1 authorization model, not a one-line photo exception. In particular, it
adds the nested photo metadata path and replaces broad authenticated booking updates with
tenant-, role-, assignment-, booking-state-, and changed-key-aware rules. Local rules
tests remain the required behavioral proof; production smoke and immediate rollback
readiness remain mandatory because the production delta is substantial.

## Private rollback package

The private directory contains:

- `rollback.firestore.rules`: byte-normalized copy of the deployed source;
- `firebase.rollback.json`: config containing only
  `firestore.rules = rollback.firestore.rules`;
- `capture-metadata.private.json`: release metadata, hashes, and comparison evidence.

The rollback rules hash was independently recomputed and matches the captured deployed
hash exactly. The rollback config has one top-level key, `firestore`, and one Firestore
property, `rules`. It contains no index, Storage, Functions, Hosting, Auth, or data target.

The rollback command is prepared but was not run:

```powershell
Set-Location "$env:TEMP\servicesos-v1-firestore-rules-preflight"
npx firebase-tools@13.35.1 deploy --only firestore:rules `
  --project cleaning-intake-system `
  --config firebase.rollback.json
```

The forward command is prepared but was not run:

```powershell
Set-Location "C:\Users\merce\Documents\SLAI_Real\ServicesOS\cloud-functions"
npx firebase-tools@13.35.1 deploy --only firestore:rules `
  --project cleaning-intake-system `
  --config firebase.json
```

Both commands target only the Firestore rules release. They do not target Firestore
indexes, Storage rules, Functions, Hosting, Auth, application data, or application code.
Neither command may be run without a new explicit production deployment approval.

## Deployment-window verification

Immediately before any separately approved deployment:

1. Confirm the branch and commit are exactly this approved candidate.
2. Re-run the read-only capture and stop if the release/ruleset/hash differs from this
   record.
3. Confirm the private rollback rules hash matches the then-current deployed hash.
4. Confirm `firebase.rollback.json` still contains only the Firestore rules path.
5. Run the canonical Firestore rules suite and rules-parity check.
6. Name the operator, smoke tester, maintenance window, and rollback decision owner.
7. Confirm the fake photo fixtures and exact test tenant, admin, and booking privately.
8. Obtain explicit approval for the Firestore-rules-only forward command.

After deployment, use the same GET-only capture to verify that the released source hash
equals the candidate hash. Any other hash is a stop-and-rollback condition.

## Exact production photo/privacy smoke

Use harmless fake JPEG fixtures and one explicitly approved production test booking. Do
not use real customer photos. Keep all document IDs, user IDs, and object names private.

### Before deployment

1. Record the test admin's proven tenant membership and role.
2. Record the booking's tenant, status, archive/delete state, and assignment.
3. Capture a private before-state for payment, Stripe, price, schedule, customer, lead,
   assignment, booking status, existing `fieldPhotos` metadata count, and Storage object
   count.
4. Confirm the browser points to `cleaning-intake-system`, not an emulator.
5. Confirm the production Storage bucket and approved CORS configuration are unchanged.

### Owner/admin success path

1. Sign in as the proven tenant admin and open Field Mode for the approved booking.
2. Confirm the photo panel loads without a Firestore permission error.
3. Upload one fake before photo and verify one nested metadata record is created.
4. Refresh and verify the before photo and metadata persist.
5. Upload one fake after photo and verify one nested metadata record is created.
6. Refresh and verify both photos and metadata persist.
7. Open Booking Detail and verify both photos render read-only.
8. Confirm Booking Detail exposes no upload, edit, or delete controls.
9. Confirm invalid file type and file-over-10-MB controls reject locally without creating
   metadata or Storage objects.
10. Confirm the browser console has no Firestore, Storage, CORS, or authorization error.

### Privacy denial path

1. Confirm an anonymous request cannot list or read the nested photo metadata or object.
2. Confirm a proven other-tenant admin cannot list/read the metadata or object and cannot
   create either.
3. Run customer-role denial only with a proven, unambiguous customer Auth identity whose
   profile role and tenant are correct. The customer must not access Field Mode, internal
   notes, payment internals, metadata, or photo objects.
4. If no safe production customer identity exists, record customer privacy smoke as
   blocked. Do not approximate-match or alter identity data during this window.

### Integrity and rollback decision

1. Compare the protected booking fields with the before-state. Payment, Stripe, price,
   schedule, customer, lead, assignment, and booking status must be unchanged.
2. Confirm only the two expected fake Storage objects and two expected nested metadata
   records were created.
3. Roll back immediately if owner/admin access fails, any denied role succeeds, an
   unexpected path is writable, protected booking data changes, the released hash differs,
   or unrelated Firebase resources change.
4. Preserve the fake smoke evidence until Jamie separately approves cleanup.

## Readiness decision

- Canonical Firestore rules tests: **44/44 passed** using the local
  `demo-servicesos-rules` emulator project.
- Canonical/shared rules parity: **Passed**.
- Private deployed source capture: **Verified ready**.
- Deployed ruleset ID and timestamps: **Verified ready**.
- Candidate comparison: **Verified ready; material delta confirmed**.
- Private Firestore-only rollback package: **Verified ready**.
- Forward and rollback command scope: **Verified ready; not executed**.
- Owner/admin production photo smoke: **Not run; requires deployment approval**.
- Customer-role production privacy smoke: **Blocked by unresolved exact customer identity
  ownership unless a proven test identity is available**.
- Firestore-rules deployment: **Awaiting explicit approval**.
