# ServicesOS V1 Current State

Updated: 2026-07-22

This file contains the changing ServicesOS checkpoint. Keep durable repository rules in `AGENTS.md` files and update this document when the active branch, blocker, completed gate, or next task changes.

## Active priority

ServicesOS customer-facing V1 is the active build.

The frozen wife-beta candidate remains protected on `master` / `origin/master` at:

`031bb46249fd09bbe7014e5f9747d4a7a4737a6f`

It is waiting for the planned deployment and manual wife testing. V1 work continues in isolated lab branches while that candidate remains protected.

## Git checkpoint

Operational checkpoint branch:

`v1-lab-production-storage-rules-smoke`

Latest known owner job-prep and outcome-checklist checkpoint:

`c638aa205627a4bb6a7a66dd119983448d14f83a`

The two-document Storage-rules correction commit `af05274` is in that history.

Codex-instruction setup branch:

`v1-lab-codex-instructions-setup`

This setup branch was created from the known clean V1 checkpoint above and adds only Codex instruction/current-state files.

Active local remediation branch:

`fix/v1-checkout-confirmation-wording`

This branch starts from the committed required-checklist completion fix `d04afff`.
The public Stripe Checkout return page no longer treats the client-controlled
`stripe_booking_checkout=success` query parameter as proof of payment. It shows a
pending confirmation state instead. Confirmed Stripe-paid wording remains in the
authenticated Booking Detail view and is driven by the booking payment fields that
the verified Stripe webhook updates.

The required-checklist completion blocker is fixed in `d04afff` through the
supported Field Mode and scheduling-service path. Field Mode lists incomplete
required parent outcomes and disables completion until they are complete. The
scheduling service also rejects completion without the current checklist, rejects
incomplete required outcomes, and preserves owner-approved checklist structure.
Optional outcomes and job-aid steps do not block completion.

Firestore rules cannot derive required completion from the current arbitrary list
shape, so this slice does not claim server-side enforcement against a caller that
bypasses the supported client service and writes directly through the Firebase SDK.
A trusted backend or enforcement-oriented data contract would be required for that
stronger boundary.

Separate narrow beta defect to fix after required-checklist enforcement and before
the final release-candidate smoke: date-only payment values are parsed as UTC and
can display one calendar day early in Central time.

## Completed production gates

- Production Firebase project confirmed: `cleaning-intake-system`.
- Firestore database confirmed: `(default)`, native mode, `nam5`.
- Verified full Firestore backup completed successfully: 59/59 documents.
- Production Firebase Storage initialized:
  - bucket: `cleaning-intake-system.firebasestorage.app`
  - location: `US-EAST1`
- Narrow bucket CORS configured for:
  - `https://servicesos.netlify.app`
  - `http://127.0.0.1:5173` temporarily for controlled local production smoke
- Corrected two-document Storage rules deployed successfully.
- Deployed Storage ruleset:
  - `0789729e-2caa-42f7-972a-0b15a80d84d0`
  - updated `2026-07-15T03:13:33.781481Z`
- Firebase Rules Firestore Service Agent permission enabled only for the managed Firebase Storage service identity.
- Public Storage principals remain absent.
- Firestore rules, indexes, Functions, Hosting, Auth, and application code were not changed by the Storage deployment.

## Current blocker

Production photo smoke is blocked before upload because deployed Firestore rules do not contain the nested metadata contract:

`tenants/{tenantId}/bookings/{bookingId}/fieldPhotos/{photoId}`

Canonical V1 Firestore rules contain this contract and pass the local Firestore rules suite, but production still uses older rules with broader authenticated behavior.

No production photo objects or field-photo metadata were created during the blocked smoke. Booking, payment, price, schedule, customer, lead, assignment, status, and Stripe fields remained unchanged.

## Next production task

Perform the controlled canonical-versus-deployed Firestore rules compatibility review.

Only when current-app compatibility is proven:

1. Capture the deployed Firestore rollback reference.
2. Deploy only canonical Firestore rules.
3. Confirm indexes, Storage rules, IAM, CORS, Auth, Functions, Hosting, and application code remain untouched.
4. Complete owner/admin before-and-after photo smoke.
5. Confirm refresh persistence and Booking Detail read-only review.
6. Verify own-tenant success and cross-tenant/anonymous denial.
7. Record and commit sanitized evidence.

Do not begin customer identity remediation before the photo path is proven and the Storage/photo evidence is committed.

## Current local V1 slice

- Owner job prep and outcome checklists are implemented at the `c638aa2` checkpoint.
- Phase 1 cleaning-product work at `d4eba89` adds immutable starter company methods, tenant commercial-product review, and tenant-scoped Firestore authorization.
- Phase 2 at `4d7c912` adds deterministic tenant adoption of immutable system defaults, owner approval lifecycle enforcement, stable outcome-level mappings, owner review guidance, and employee-safe read-only Field Mode guidance.
- Phase 3 aggregates approved mixtures, exact commercial products, tools, PPE, surface and chemical warnings, and owner exceptions across today's ready jobs. It excludes unusable methods and jobs without current approved snapshots from usable preparation totals.

## Remaining customer-facing V1 blockers

- Production Firestore `fieldPhotos` metadata contract and full photo smoke.
- Exact customer identity remediation:
  - cross-tenant duplicate `authUid`
  - customer/profile tenant mismatch
  - customer linked to a non-customer role
  - production customer privacy smoke
- Cohesive Field Job Workspace redesign centered on the real checklist.
- Required employee assignment index, real employee setup/assignment, and production employee smoke before claiming the employee workflow production-ready.
- Controlled release integration, production deployment, and final customer-facing smoke.

## Release-track distinction

- Frozen wife-beta candidate: built; awaiting deployment and manual testing.
- Owner-operator workflow: separately advanced and not equivalent to customer-ready V1.
- Customer-facing V1: blocked until exact customer ownership and production privacy smoke pass.
- Customers without Auth accounts may remain valid non-portal records and must never be linked approximately.

## Parked beyond V1

Unless Jamie explicitly changes scope, keep these parked:

- Recurring Service Plans and rotating periodic tasks
- Training Library expansion
- Tap to Pay
- route optimization
- expenses and mileage
- full offline queue
- advanced employee management
- photo deletion/retention automation
- GrowthAI expansion

## Established local validation baselines

Latest known green baselines for the required-checklist completion remediation:

- focused Field Mode and scheduling service: 89 tests
- full web: 465 tests
- Cloud Functions: 39 tests
- Firestore rules: 42 tests
- Storage rules: 20 tests
- lint: passed
- build: passed
- Firestore and Storage rules were unchanged by this remediation. The local
  authenticated emulator smoke confirmed blocked states with zero completed
  required outcomes and with one required outcome remaining, refresh persistence,
  completion with all required outcomes and one
  optional outcome open, persisted notes/issues, and unchanged payment, price,
  schedule, assignment, and customer fields.

Treat these as checkpoint evidence, not permanent expected totals. Report current totals honestly after future changes.

Latest checkout-confirmation wording validation on `fix/v1-checkout-confirmation-wording`:

- focused checkout and payment safety: 65 tests
- full web: 465 tests
- Cloud Functions: 39 tests
- lint: passed
- build: passed
- local fake-data smoke: a forged success return remained confirmation-pending
  after refresh; cancelled, failed, expired, incomplete, and unpaid return values
  showed no confirmed-payment claim; an authenticated webhook-confirmed fake booking
  showed `Paid in full` and `Stripe (confirmed by Stripe)`; no console errors or
  payment-state mutations occurred.
- Stripe checkout creation, Connect, webhook processing, payment-link generation,
  manual-payment behavior, Firestore rules, and production configuration were
  unchanged.
