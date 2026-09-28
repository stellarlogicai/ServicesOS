# ServicesOS V1 Current State

Updated: 2026-09-28

This file contains the changing ServicesOS checkpoint. Durable repository rules belong in `AGENTS.md`; detailed progress belongs in `SERVICESOS_V1_FINISH_BOARD.md`.

## Active priority

ServicesOS customer-facing V1 is the active build.

The original wife-beta build already served as discovery/UX validation. Many V1 requirements came directly from that testing and from the real problems encountered while trying to start a cleaning business.

Do not treat the older deployed beta as representative of the current V1 branch.

## Git checkpoint

Active branch:

`feature/owner-onboarding-v1`

Current application-code checkpoint:

`075f40d3962a8ea105af431c24ea7e5464673a2b` — `Add employee Terminal payment gateway`

The branch is `feature/owner-onboarding-v1`. This document is reconciled against that exact HEAD. Historical reports and older checklists are not current-head validation evidence.

The current documentation checkpoint is:

`b7310dbee1a2069b4aaea9390829b974796aaa9b` — `Reconcile ServicesOS V1 release state`

The application-code checkpoint remains `075f40d3962a8ea105af431c24ea7e5464673a2b`; the later commit is documentation/process only.

The branch is backed up to:

`origin/feature/owner-onboarding-v1`

Do not merge to `master` until current-head integration/security/release validation passes.

### Accepted selective PR #9 hardening checkpoint

Selective PR #9 hardening is complete on the current V1 branch. The completed
implementation record is:

- `b3014a512684a7ab328c26377deededa805b2cdf` — Harden customer email boundary
- `b7608505424d3698bf875df436f7fd53ac1bc947` — Add GrowthAI provider kill switch
- `7337306def398df2b79ffdf4b7419679027acf80` — Add Cloud Function deployment guardrails

The final reconciliation found no accepted-scope protection still missing.
PR #9 and `hardening/firebase-cost-guardrails` are superseded reference
material and must not be merged or cherry-picked wholesale. The five existing
Stripe/Connect scaling exceptions remain intentional until payment/load
acceptance evidence exists; `stripeWebhook` retains its public invoker policy.
See `PR9_HARDENING_RECONCILIATION.md` for the matrix.

## V1 capability rule

A V1 feature family means the smallest safe, useful, connected form of that capability — not the most advanced version that could eventually exist.

For the Employee App this means:

- basic routing/day progression, not route optimization or fleet telemetry,
- limited active-job safety location, not all-day tracking,
- field safety alerting and emergency handoffs, not a monitoring center or direct police dispatch,
- narrow offline resilience for critical safety state, not a full offline-first platform,
- secure card-present payment foundations with verified backend truth and owner auditability; Employee App Terminal SDK, UI, and device workflow are post-V1.

Advanced forms remain deferred unless Jamie explicitly re-scopes them.

## Small-slice implementation rule

Protect the late-October launch target by keeping Codex/implementation work in small, heavily defined slices.

Each coding task should include one capability delta only and explicitly define goal, scope, exclusions, files/areas to avoid, acceptance criteria, validation, stop conditions, and report-back.

Do not combine major areas such as onboarding, mobile routing, field safety, post-V1 Tap to Pay, and release hardening into a single task. Complete and validate one slice before moving to the next.

## What is already implemented on the current V1 branch

### ServicesOS owner/core workflow

- multi-tenant owner/admin foundation
- customers, leads, estimates, bookings, calendar/scheduling
- deterministic estimate/pricing foundation
- repeat-customer workflow
- web Field Mode
- required checklist completion controls
- before/after field-photo evidence and owner review foundation
- cleaning methods/products guidance
- Business Settings foundation
- Stripe / Stripe Connect foundation
- GrowthAI / SLAI Assistant V1 feature set
- residential and commercial booking intake
- customer-approved job scope control
- canonical tenant add-on catalog
- employee extra-work request / owner-review foundation

### Employee App

The Employee App is no longer a placeholder-only shell. Current branch capabilities include:

- canonical employee authentication through the server-side session gateway
- My Day / assigned current and upcoming jobs
- employee-safe JobPacket loading
- approved job instructions, safety and method guidance
- start-work flow
- checklist progress
- notes/issues
- before/after photo evidence
- complete-job path through the server-owned execution gateway
- SLAI Work Assistant bounded to current authorized work
- verified employee profile/logout
- extra-work request UI using tenant add-ons or a bounded custom request
- native/Google/Apple Maps directions handoff foundation
- deterministic Today/Upcoming ordering and current/next-job progression, with refresh for changed safe summaries and generic change notices
- Field Safety actions and a bounded persistent safety-alert retry queue
- employee payment-collection permission and the server-owned Terminal payment gateway

The active navigation shell is intentionally narrow: Jobs/Today, Job Details, Work Assistant, and Profile. Legacy Training and Messages files do not make those features current V1 blockers.

Day progression and directions have focused implementation tests, but physical-device acceptance and owner/admin-to-employee assignment/day acceptance remain open. No generalized employee messaging or push-notification system is included.

## Completed current-branch capabilities

These implementation slices are present in branch history and have focused code/tests. This documentation audit did not rerun their suites; implementation status is not current-head validation or release acceptance.

### Customer scope and extra work

- Customer identity and booking ownership are checked server-side for approval.
- Customer approval creates one immutable authoritative scope revision; duplicate approval is idempotent.
- Employee JobPacket reads the revised scope on its next normal fetch. Declined, stale, cancelled, or unapproved requests do not revise scope.

### Owner onboarding and SaaS billing

- Canonical services/pricing, availability, branding, employee/team setup, Stripe Connect, and explicit final acceptance are implemented.
- Paid entitlement remains separate from operational completion; final acceptance revalidates prerequisites and fresh provider state.
- Monthly ($100) and annual ($1,000) subscription paths use two canonical server-configured Prices; lifecycle code covers renewal, failure/cure, recovery, scheduled cancellation, and termination.
- Owner billing Portal code validates its server-configured capabilities before session creation.
- Controlled test/live Price and Portal configuration, provider/webhook acceptance, onboarding journey acceptance, and current-head web/Functions regressions remain release gates. No production configuration change is implied here.

### Employee day and Field Safety

- Today/Upcoming order is deterministic; current/next job actions and refresh/change notice are implemented. Directions are an external maps handoff.
- Field Safety has explicit dialer/owner-call handoffs, optional foreground location, server-authorized alerts, and a bounded persistent queue with same-event retry and honest Sent/Queued/Failed states.
- Owner alert display is read-only. No acknowledgement, push, continuous location, or missed-check-in service is included in the accepted slice.
- Physical-device acceptance for auth/session, directions, photos, safety permissions/network/retry, and owner/employee field workflow remains open.

### Booking payments and post-V1 Terminal boundary

- Canonical booking payment accounting, immutable payment/refund/reversal records, owner display, and server-authoritative Checkout/manual payment are implemented.
- Checkout, manual, and terminal use one server-owned collection lease. Employee payment permission defaults false and is owner/admin controlled.
- `employeeTerminalPaymentGateway` is a backend foundation: it checks canonical employee permission/assignment, derives connected-account authority and amount server-side, prepares/reuses card-present PaymentIntents, issues scoped connection tokens, and reconciles only provider-confirmed results into canonical accounting.
- **Mobile Tap to Pay is post-V1.** The Employee App remains Expo 51 / React Native 0.74.5; SDK/platform migration, mobile Terminal transport/UI, and physical Tap to Pay acceptance are planned after ServicesOS V1 release. Do not treat them as V1 or wife-beta blockers, and do not discard the completed backend foundations.

### GrowthAI / SLAI Assistant

The existing V1 feature set, credit UX, tenant-safe provider gateway, and provider kill switch remain in code. The previously observed free-briefing assertion failure in `GrowthAIPage.test.jsx` no longer reproduces: the focused suite passed `59/59` after the Vitest worker storage fix. Provider-backed test-mode acceptance remains open.

## Current-head local validation audit (2026-09-28)

The following evidence was collected on the current branch without provider or production actions:

- Cloud Functions: `495/495` passed.
- Firestore rules: `64/64` passed.
- Storage rules: `21/21` passed.
- Rules parity, Cloud Function syntax checks, web lint, and web production build: passed.
- Employee App API/unit tests: `95/95` passed.
- Employee App React Native tests: `99/99` passed.
- Expo Doctor: `17/17` checks passed; Expo dependency check reported current/compatible and public config resolved.
- Focused Field Mode: `39/39` passed.
- Focused `AppOnboardingRouter.test.jsx`: `24/24` passed after fixing Vitest's Node/jsdom Web Storage conflict. The test bodies ran, and the invalid `--localstorage-file` warning disappeared.
- Focused auth/onboarding regression set: `73/73` passed across four files.
- Focused `GrowthAIPage.test.jsx`: `59/59` passed; the prior free-briefing failure no longer reproduces.
- Combined router and GrowthAI tests: `83/83` passed.
- Canonical aggregate web suite (`npm run test -- --run --reporter=verbose`): `94/94` files and `844/844` tests passed, `0` failed, `0` skipped, exit code `0`, duration `104.50` seconds. `AppOnboardingRouter`, `GrowthAIPage`, and Field Mode passed in the aggregate run. The earlier aggregate stall did not reproduce. React `act(...)` warnings appeared; no assertion failures occurred.
- The historical targeted release set reported as `140/165` cannot be reproduced because its exact file selection was not recorded. It is historical context, not current acceptance evidence and is not the current acceptance result.

The full current-head web validation gate is clean. The router localStorage environment blocker is resolved, and the prior GrowthAI focused failure no longer reproduces. React `act(...)` warnings remain test-hygiene debt, but are not established as a V1 release blocker. ServicesOS V1 is not thereby release-ready; the controlled deployment, device, provider, security, and integrated workflow gates below remain open.

## Remaining V1 work and release gates

1. Complete integration acceptance for customer-approved scope refresh, employee assignment/cancel/reschedule/reassignment behavior, employee authentication, and owner/admin-to-employee day/assignment communication. No generalized messaging system is implied.
2. Complete physical-device Employee App acceptance for Android auth persistence/recovery, camera/photos, directions handoff, foreground location, and Field Safety queue/recovery/idempotent owner alert. Verify exactly one owner-visible safety alert after retry; never place an actual emergency call.
3. Re-audit customer identity ownership, duplicate/cross-tenant `authUid`, tenant membership, employee identity/assignment, field-photo and safety authorization, and cross-tenant denial against the current candidate and controlled test data.
4. Before promotion, re-verify deployed Firestore and Storage rules against the candidate, rules parity, required indexes, Storage initialization/CORS, existing object-prefix compatibility, identity/membership and assignment data readiness, and customer privacy/tenant smoke. July production reports are historical snapshots, not current readiness proof.
5. Re-verify Netlify build/commit and deployed Cloud Function revisions for the selected candidate. Prepare backups and rollback evidence under the deployment runbook.
6. Complete controlled Stripe test-mode/live acceptance for owner monthly/annual billing and Portal, Connect onboarding, booking Checkout, payment/refund webhooks, fees, tenant isolation, and failure/retry. Verify separate test/live Price and Portal configuration; this audit changed no provider state.
7. Deploy only to a controlled V1 test environment after approved gates, then complete wife V1 acceptance, close critical findings, tune UI, and run final release smoke. Mobile Tap to Pay remains post-V1 and excluded from these gates.

## Staging infrastructure readiness (2026-09-28)

The isolated Firebase and Netlify staging resources exist, but they are not ready for application deployment:

- Firebase project `servicesos-v1-staging` (`ServicesOS V1 Staging`) has one registered web app, `ServicesOS Staging Web` (app ID `1:431826220393:web:0dfa7ddbd837878b9f79f8`). Its six client configuration values are now confirmed on the Netlify staging site as detailed below.
- The staging `(default)` Firestore database is in `nam5`, matching the observed production Firestore location. On 2026-09-28, reviewed Firestore rules and indexes were deployed explicitly to `servicesos-v1-staging`. The rules CLI reported successful compilation/release but emitted warnings involving `request`, an unused helper, and `exists`; these remain pending review, not resolved or dismissed. The CLI exposed no rules release/version identifier. Firebase Console manually verified all 22 of 22 staging composite indexes as `Enabled`, with none Building or Missing. The `bookings` collection index on `assignedEmployeeAuthUid ASC`, `status ASC`, and `date DESC` (Collection query scope) is `Enabled`; the staging composite-index readiness gate is closed. Local Firestore rules tests passed 64/64 and rules parity passed. A read-only unauthenticated GET for a synthetic nonexistent user document returned HTTP 403 `PERMISSION_DENIED` (anonymous-denial pass; no staging data was written). Authenticated staging access, ownership, assignment, cross-tenant, spoofing, and direct-client write cases remain unverified because representative staging identities and tenant/booking data do not exist and safe bootstrap was unavailable; these are not failures, and emulator evidence does not prove deployed behavior. The warnings trace to an unused field-photo metadata-create helper chain; active `fieldPhotos` rules deny direct client creates and no active allow rule calls that helper. No code change was made; warning review remains open and this evidence does not establish effective deployed-rule correspondence. Production Storage location was observed as `us-east1`; staging Storage is not initialized.
- Staging Auth has Email/Password and Google sign-in enabled, and `servicesos-v1-staging.netlify.app` is an authorized Auth domain. Google OAuth uses the approved public-facing name `ServicesOS by Stellar Logic AI` and support email `stellar.logic.ai@gmail.com`. No staging users have been created, and production Auth was untouched.
- Netlify site `servicesos-v1-staging` (`servicesos-v1-staging.netlify.app`) remains isolated from production and has no application deployment. The six required Firebase client variables (`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, and `VITE_FIREBASE_APP_ID`) were manually confirmed in the staging dashboard; `VITE_FIREBASE_PROJECT_ID` is `servicesos-v1-staging`. Configuration was completed manually because connector writes did not persist. No application build or deploy was triggered, and no production configuration was changed. No `VITE_FUNCTIONS_URL` or provider/server-secret variables were added by this configuration task.
- The staging project remains on Spark. Upgrading it to Blaze is temporarily deferred because Google requires a temporary card authorization hold; this is an operational/cash-flow sequencing decision, not a code or product defect. No ServicesOS V1 feature scope is being removed. The current plan is to enable Blaze when the business can comfortably absorb the authorization hold, at or after the first paying customer. No billing upgrade has occurred.
- Staging Storage initialization and real-cloud Cloud Functions deployment remain blocked until Blaze is enabled. The Netlify staging site remains undeployed, Stripe staging/test-mode acceptance and physical-device acceptance remain pending, and wife beta remains pending. Mobile Tap to Pay remains post-V1.
- Work that does not require Blaze may continue: obtain safe representative staging identities/data and complete authenticated Firestore security smoke; review deployment warnings and verify effective deployed-rule correspondence; verify Firebase Auth; configure Netlify staging; run local/emulator Functions and Storage validation; and complete non-provider acceptance work. The staging composite-index Enabled/READY gate is closed based on manual Firebase Console verification. The 64/64 local rules result, parity pass, and anonymous-denial smoke do not close authenticated staging verification.
- Firestore rules and indexes were deployed to staging only. No Functions, Storage rules, Hosting, or web deployment occurred. Production Firebase and Netlify were not modified. Staging is not release-ready; do not interpret this billing deferral or the available Spark work as release approval.

Staging is **not ready** for Storage initialization or real-cloud Functions/web deployment. The deployed Firestore rules still require effective-rule review and security smoke on Spark. Composite-index readiness is verified Enabled in Firebase Console, but this does not establish overall deployment or release readiness.

### Local wife-beta emulator verification (2026-09-28)

The local wife-beta environment is **ready with minor non-blocking issues** for a limited owner-web session using synthetic emulator data. This is not release-ready and is not equivalent to Blaze-backed staging acceptance. The smoke project is `demo-servicesos-v1-smoke-local`; Auth (`127.0.0.1:9099`), Firestore (`127.0.0.1:8080`), Functions (`127.0.0.1:5001`), Storage (`127.0.0.1:9199`), and Emulator UI (`http://127.0.0.1:4000/`) ran on loopback, with Vite at `http://127.0.0.1:5173/`.

Functions discovery succeeded on two actual emulator starts, both reaching “All emulators ready.” The earlier discovery timeout did not reproduce; its root cause remains unknown and no code fix is currently justified. Reset/seed succeeded with five synthetic personas, 22 Firestore documents, and local upload fixtures. Tenant A admin login succeeded; Tenant A business and bookings rendered, and the Tenant B business marker was absent from the normal Tenant A dashboard/bookings views. Local non-provider reads through Functions succeeded for service catalog, add-on catalog, and owner safety alerts.

Business Settings automatically invoked `getConnectedAccountStatus`. The seeded tenant had no Stripe account pointer, so the local handler returned before making a Stripe request. No Stripe/provider request occurred. Keep local beta synthetic; do not add real Stripe/Connect provider state or credentials.

Firebase CLI may inject its signed-in user credential-file path into the Functions emulator child. Runtime used `demo-servicesos-v1-smoke-local` and loopback Auth/Firestore/Storage emulator hosts; no real Firebase project or external provider access was observed, and credential-file contents were not inspected. Minor warnings were a stale `.env.v1-smoke` comment claiming Functions is not started, a repeated “multiple emulator instances” warning that did not prevent discovery, an existing Functions-version warning, and missing local email configuration. None is established as a local wife-beta blocker.

This readiness supports owner-web usability testing, synthetic customer/booking workflows, navigation, and UI-friction/bug finding only. Open gates remain Blaze-backed Storage and real-cloud Functions, authenticated staging tenant/security smoke, Stripe/provider acceptance, physical-device acceptance, integrated owner/employee/customer acceptance, and final release work.

Production promotion is **not established by this audit**. Old production reports document previous observations/actions but must be re-audited against the intended release candidate; no claim is made that their July state remains current or was corrected.

## Release sequence

1. Close current-head automated integration/security/build validation and remaining customer-scope, employee-day/correspondence, and device acceptance edges.
2. Re-audit production configuration/data/rules/index/storage readiness and collect current deployment evidence.
3. Complete controlled test/live Stripe acceptance and a controlled V1 test deployment.
4. Run wife V1 acceptance using outcome-based tasks, **excluding mobile Tap to Pay**; customer-job payment tests cover approved web/manual paths.
5. Fix V1-specific critical findings, perform UI fine-tuning, and complete customer-release security and smoke gates.
6. Freeze and release the customer-facing ServicesOS V1 candidate.

After V1 release, separately upgrade the Employee App platform to Expo 56 / React Native 0.85, integrate the Stripe Terminal React Native SDK, then deliver mobile Tap to Pay as the first post-V1 Employee App payment update. Keep this work isolated from the release candidate.

## Explicitly parked unless Jamie re-scopes them

- legacy CleanOps onboarding restoration
- broad multi-platform data import/migration
- AI setup wizard
- AI-recommended pricing as authority
- Training Library expansion
- office messaging
- push notifications
- general/full offline queue beyond narrow critical safety resilience
- payroll/break management
- expenses/mileage
- advanced route optimization
- continuous/all-day GPS tracking
- fleet telemetry
- advanced crew-management/roll-call systems
- advanced employee management
- photo deletion/retention automation
- monitoring-center or direct emergency-dispatch platform
- GrowthAI expansion beyond the already-defined ServicesOS V1
- future standalone SLAI products

## Validation evidence rule

Old branch-specific test totals are historical evidence only. Do not reuse them as proof for the integrated current branch.

The 2026-09-27 current-head audit totals above are the latest local evidence. They do not replace physical-device, controlled provider, deployment, production-readiness, or wife-acceptance gates.
