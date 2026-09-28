# ServicesOS V1 Finish Board

Last updated: 2026-09-27

This document is the authoritative progress board for the defined customer-facing ServicesOS V1 finish line.

## Scope rule

ServicesOS remains priority one. The frozen wife-beta build proved the baseline owner workflow and exposed real cleaning-business friction; the active V1 branch incorporates that feedback and is now the source for remaining V1 work.

Do not expand V1 because legacy, prototype, or future code exists in the repository. Build only the already-defined customer-facing V1 requirements.

The Employee App is part of customer-facing V1. Mobile Tap to Pay is post-V1 because its native-platform migration would put the current release at material risk. Completed backend/payment foundations remain frozen in this branch and are not to be discarded.

The legacy `ImprovedOnboarding.jsx` / CleanOps-style flow is reference material only. Do not restore it as the production onboarding. New onboarding must use current canonical ServicesOS models and settings.

## V1 basic-capability rule

For V1, a feature family does not need its most advanced future form. V1 ships the smallest safe, useful, connected version of the capability that lets a real service business operate end to end.

Examples:

- routing/navigation V1 = ordered daily work, clear next-job progression, and reliable directions handoff; not route optimization, continuous GPS, fleet telemetry, or mileage automation,
- field safety V1 = emergency actions, tenant-scoped alerting, limited job-safety location when permitted, honest delivery state, and owner review; not a monitoring center, direct police dispatch, or all-day surveillance,
- offline V1 = targeted resilience only where required for safety/critical field actions; not a general offline-first employee platform,
- mobile Tap to Pay = post-V1 Employee App upgrade and native Terminal integration; V1 keeps the completed server/accounting foundations but does not require mobile card-present collection,
- extra-work V1 = employee request → owner/customer approval → authoritative scope refresh; not advanced field quoting or autonomous pricing.

Do not turn a basic V1 capability into a broad platform while trying to finish the release.

## Small-slice execution rule

Protect the late-October launch target by implementing V1 in small, heavily defined slices.

Each coding prompt should contain only one controlled capability delta and must define:

- exact goal,
- exact scope,
- task-specific exclusions,
- files/areas to avoid where relevant,
- acceptance criteria,
- tests/build/validation,
- stop conditions,
- required report-back.

Do not combine owner onboarding, mobile routing, field safety, post-V1 Tap to Pay, and release hardening into one coding task. Complete and validate one slice before promoting the next.

## Current checkpoint

Active V1 branch: `feature/owner-onboarding-v1`

Current application-code checkpoint: `075f40d3962a8ea105af431c24ea7e5464673a2b` — `Add employee Terminal payment gateway`

Current documentation checkpoint: `b7310dbee1a2069b4aaea9390829b974796aaa9b` — `Reconcile ServicesOS V1 release state`

The application-code checkpoint remains `075f40d3962a8ea105af431c24ea7e5464673a2b`; the later commit is documentation/process only. Historical reports and old test totals are not current-head release validation.

The deployed wife-beta build is older than this branch and cannot validate the newer V1 work.

### Accepted selective PR #9 hardening checkpoint

Selective PR #9 hardening is complete. The implementation record is the three
accepted commits `b3014a5` (customer email boundary), `b760850` (GrowthAI
provider kill switch), and `7337306` (Cloud Function deployment guardrails).
The final reconciliation found no accepted-scope protection still missing.
PR #9 and `hardening/firebase-cost-guardrails` are superseded reference
material and must not be merged or cherry-picked wholesale. The five existing
Stripe/Connect scaling exceptions remain intentional until payment/load
acceptance evidence exists; `stripeWebhook` retains its public invoker policy.
See `PR9_HARDENING_RECONCILIATION.md` for the detailed matrix.

## Overall status

| Area | Status |
| --- | --- |
| ServicesOS Core V1 | ✅ Complete |
| GrowthAI / SLAI Assistant V1 implementation | 🟡 Implementation exists; integrated current-head regression and freeze remain |
| Employee App core field workflow | 🟡 Implemented; integrated physical-device acceptance remains |
| Employee App routing/navigation basic V1 | 🟡 Day progression and directions implemented; human/device acceptance remains |
| Employee App field safety basic V1 | 🟡 Alert flow and bounded offline queue implemented; device/network acceptance remains |
| Employee App Tap to Pay | ⏭️ Post-V1 mobile platform migration and UI |
| Owner/business onboarding | ✅ Canonical stages and explicit final acceptance implemented; end-to-end release acceptance remains |
| Owner SaaS billing | ✅ Monthly/annual lifecycle and Portal code implemented; Stripe environment acceptance remains |
| Customer-job payments / Stripe Connect | ✅ Canonical accounting and shared collection lease implemented; controlled provider acceptance remains |
| Selective PR #9 hardening | ✅ Complete; broader current-head release validation remains |
| Wife testing of current V1 | ⬜ Requires current-head gates and controlled test deployment; Tap to Pay excluded |
| Customer-ready release | ⬜ Final target |

---

# 1. ServicesOS Core V1 — ✅ COMPLETE

- [x] Multi-tenant architecture
- [x] Authentication and role foundation
- [x] Customer management
- [x] Leads
- [x] Deterministic estimates and pricing foundation
- [x] Bookings
- [x] Residential and commercial booking intake
- [x] Calendar and scheduling foundation
- [x] Repeat-customer workflows
- [x] Web Field Mode
- [x] Required checklist completion controls
- [x] Field photos
- [x] Owner/admin field-photo review foundation
- [x] Business Settings foundation
- [x] Stripe / Stripe Connect foundation
- [x] Firestore / Storage security foundation
- [x] Tenant-isolation foundation
- [x] Customer-approved job scope control
- [x] Canonical tenant add-on catalog
- [x] Employee extra-work request submission and owner review foundation

---

# 2. GrowthAI / SLAI Assistant V1 — 🟡 CURRENT-HEAD ACCEPTANCE / FREEZE REMAINS

The already-defined V1 implementation is substantially complete. Do not add new GrowthAI feature scope before ServicesOS V1 is stable.

Current focused recheck: `GrowthAIPage.test.jsx` passed `59/59`; the earlier free-briefing assertion failure no longer reproduces after the Vitest worker storage fix. Provider-backed test-mode acceptance remains open.

- [x] Conversation-first Home
- [x] Business briefing
- [x] Marketing workflows
- [x] Customer communication workflows
- [x] Retention / rebooking detection
- [x] Reputation assistance
- [x] Brand intelligence
- [x] Drafts / Activity
- [x] Human review / approval boundaries
- [x] Provider gateway and tenant isolation
- [x] Credit ledger and customer-facing credit UX
- [x] First-run guide and responsive UI pass
- [ ] Re-verify provider-backed behavior only in an explicitly approved non-production/test environment; prior production evidence is historical
- [ ] Re-test inside the current integrated V1 branch/release candidate
- [ ] Close any V1-specific regression findings
- [ ] GrowthAI V1 freeze

---

# 3. Employee App V1 — 🟡 SUBSTANTIALLY IMPLEMENTED, FIELD CAPABILITIES REMAIN

Project path: `employee-app/`

The Employee App must remain a field-execution client for ServicesOS, not a second independent operating system. Web/admin owns planning and approval; mobile confirms, navigates, executes, and records. Mobile payment collection is post-V1.

## A. Core field workflow — substantially implemented

- [x] React Native Expo application
- [x] Canonical employee authentication through server verification
- [x] Session-gated app shell
- [x] My Day / assigned current and upcoming jobs
- [x] Fresh employee-safe JobPacket
- [x] Job details and approved instructions
- [x] Safety and method guidance
- [x] Start work
- [x] Required checklist progress
- [x] Employee notes / issue reporting
- [x] Before photo evidence
- [x] After photo evidence
- [x] Complete job through server-owned execution path
- [x] SLAI Work Assistant for current authorized work
- [x] Verified employee profile / logout
- [x] Extra-work request UI and server flow foundation
- [x] Tenant add-on catalog consumption in extra-work requests

## B. Basic routing / day progression — V1

V1 routing is the useful field-worker version, not a route-optimization platform.

- [x] Today / upcoming assigned-job list
- [x] Job address available in employee-safe projection
- [x] Native/Google/Apple Maps directions handoff foundation
- [x] Deterministic Today/Upcoming order by date, start time, and booking ID
- [x] Current-job / next-job progression and finished-day state
- [x] Refresh shows changed safe summaries; removal uses a generic workday-change notice
- [x] Directions handoff foundation
- [ ] Owner/admin ↔ employee assignment/day acceptance
- [ ] Physical-device acceptance for directions, refresh, and next-job flow

No generalized messaging or push system is included. Assignment, cancellation, reschedule, and reassignment must be confirmed in integrated acceptance; employee visibility remains enforced by server JobPacket authority.

Explicitly deferred unless re-scoped:

- advanced route optimization
- continuous route telemetry
- all-day/background GPS tracking
- fleet management
- automatic mileage calculation
- broad crew roll call / complex multi-crew logistics

## C. Field Safety / Emergency — basic V1 capability

This is a field-safety tool, not a guaranteed emergency-response system.

- [x] Safety actions in Job Detail and explicit Call 911 dialer handoff
- [x] Call Owner uses only the bounded server-projected business phone
- [x] One optional foreground-location attempt; failure does not block the alert
- [x] Tenant-scoped server-authorized safety alert with job context and event-ID idempotency
- [x] Truthful Sent / Queued / Failed delivery states
- [x] Bounded persistent safety-alert queue, same-event retry on app open/resume, and successful-delivery cleanup
- [x] Read-only owner/admin recent-alert panel
- [x] Tenant/permission tests and Firestore client-denial coverage
- [ ] Physical-device/network/location acceptance

The accepted V1 slice does not add alert acknowledgement/resolution state, missed-check-in monitoring, push notifications, or background GPS. Do not resurrect these from an older checklist without an explicit scope decision.

Explicitly deferred unless re-scoped:

- monitoring center
- direct police/public-safety dispatch integration
- guaranteed emergency-response claims
- hidden recording
- constant live GPS
- all-day employee surveillance
- advanced escalation trees

## D. Extra work / scope refresh — V1

- [x] Tenant add-ons available to employee
- [x] Bounded custom extra-work request
- [x] Employee context/note
- [x] Submitted request reaches owner review foundation
- [x] Owner review creates an approval-ready request using owner-reviewed terms
- [x] Verified customer approval is required before authoritative scope mutation
- [x] Exactly one immutable scope revision is created; duplicate approval is idempotent
- [x] Employee JobPacket reads the new canonical scope on the next normal fetch
- [x] Declined, stale, cancelled, and unapproved requests cannot revise scope
- [ ] Integrated owner → employee → customer → refreshed-job acceptance

## E. Booking payments and Terminal backend — implemented; mobile Tap to Pay post-V1

- [x] Canonical server-owned booking payment/refund/reversal accounting
- [x] Shared Checkout/manual/terminal collection lease
- [x] Employee-specific `canCollectPayments`, owner/admin controlled and default deny
- [x] Employee Terminal backend gateway with assignment/permission checks, server-derived amount/account, idempotency, recovery, and canonical `card_present` reconciliation
- [x] Owner-visible canonical payment/audit history
- [ ] Controlled Stripe test-mode acceptance for booking payment paths
- [ ] Controlled Stripe production acceptance before customer release
- [ ] Employee App Expo/RN migration, Terminal SDK, mobile transport/UI, and physical Tap to Pay acceptance (POST-V1; not a current V1 blocker)

## F. Mobile acceptance / hardening

- [ ] Current V1 Android physical-device pass
- [ ] Session persistence / auth expiration / recovery pass
- [ ] Camera/photo permission pass
- [ ] Foreground location permission behavior for Field Safety
- [ ] Network failure/retry pass
- [ ] Duplicate-submit/idempotency pass
- [ ] Reassignment-away denial
- [ ] Cross-tenant denial
- [ ] Owner → assign → employee execute → owner review physical workflow
- [ ] Real field-workflow acceptance including safety queue recovery

Training-library expansion, office messaging, push notifications, general offline-first sync, payroll/break management, advanced employee management, advanced route optimization, and continuous GPS do not become V1 blockers unless Jamie explicitly re-scopes them.

---

# 4. Owner / business onboarding — ✅ IMPLEMENTED; ACCEPTANCE REMAINS

## Completed secure activation spine

- [x] Server-owned owner/tenant bootstrap
- [x] Verified admin/tenant relationship
- [x] Basic business profile gateway and UI
- [x] Versioned immutable SaaS agreement delivery
- [x] Typed signer + explicit affirmation
- [x] Immutable agreement acceptance evidence
- [x] Owner subscription checkout gateway
- [x] Server-owned Stripe Customer relationship
- [x] Verified `invoice.paid` activation path
- [x] Exact tenant/customer/subscription/Price/quantity validation
- [x] Idempotent/stale-event protections

## Canonical V1 onboarding implementation

The customer must go through onboarding that gathers the information ServicesOS needs to operate correctly. Subscription payment and onboarding completion are separate states.

### Business basics

- [x] Business name
- [x] Phone
- [x] Email
- [x] Timezone
- [x] Business address field exists
- [x] Current canonical business profile/settings boundary is reused

### Services & pricing

- [x] Canonical service catalog and deterministic configured pricing
- [x] Legacy/static fallback remains compatible but cannot satisfy schema-managed onboarding

### Availability / scheduling rules

- [x] Working-day model exists in Business Settings
- [x] Canonical availability days gate onboarding progression
- [x] Other detailed availability/scheduling settings remain in existing Business Settings; no new scheduling architecture was added

### Brand basics

- [x] Valid default branding completes the stage; canonical custom branding is validated and saved through the gateway
- [x] Logo and color customization remain optional

### Customer-payment setup

- [x] Stripe Connect component/foundation exists
- [x] Stripe Connect stage is included and advances only from fresh canonical readiness
- [x] Connect setup can be resumed; no permanent skip completes the stage

### Team

- [x] `owner_only` completes without a fake employee
- [x] `employees` requires a qualifying canonical UID employee and usable delivered activation state
- [x] Canonical employee provisioning uses the server identity gateway

### Finish / resume

- [x] Server-derived progress and resume behavior
- [x] Billing entitlement remains separate from operational `onboardingState`
- [x] Explicit Finish setup revalidates prerequisites and fresh subscription/Connect state before setting operational state active
- [x] Completed schema-managed tenants bypass onboarding; legacy tenants retain compatibility behavior
- [ ] New-owner end-to-end acceptance test without founder/developer help

## Explicitly not required for initial V1 onboarding

- legacy CleanOps `ImprovedOnboarding.jsx` restoration
- data migration/import from multiple platforms
- AI setup wizard
- AI-recommended pricing as authority
- elaborate preview/celebration systems

These may be future improvements after the required operational onboarding works cleanly.

---

# 5. Owner SaaS subscription billing — ✅ IMPLEMENTED; PROVIDER ACCEPTANCE REMAINS

Company platform pricing is:

- $100/month
- $1,000/year
- same normal entitlement either way

## Complete

- [x] Secure platform-account subscription Checkout
- [x] Server-owned tenant/customer metadata
- [x] Quantity locked to 1
- [x] No Connect destination/transfer/application fee on SLAI subscription billing
- [x] Verified paid-invoice activation
- [x] Active linked subscription required before activation

## Implemented contract

- [x] $100 monthly and $1,000 annual plans map to two server-configured canonical Price IDs; browser supplies only the interval
- [x] Checkout quantity is one and both terms grant the same normal entitlement
- [x] Renewal, payment failure/seven-day cure, recovery, scheduled cancellation, and actual termination are handled through canonical webhook state
- [x] Owner billing Portal is available through a server gateway; allowed capabilities are checked before session creation
- [x] Portal supports payment-method updates, invoice history, and cancel-at-period-end; plan switching/pause are disabled

## Release gates

- [ ] Verify separate test/live Price IDs and billing Portal configurations in controlled Stripe environments
- [ ] Test Checkout, renewal, failure/recovery, scheduled cancellation/termination, return routing, and webhook synchronization in test mode
- [ ] Complete live-mode controlled acceptance before customer release

---

# 6. Customer-job payments / Stripe Connect — ✅ ACCOUNTING IMPLEMENTED; PROVIDER ACCEPTANCE REMAINS

This is separate from the owner SaaS subscription.

- [x] Stripe Connect foundation
- [x] Canonical booking checkout foundation
- [x] Honest public return-state behavior
- [x] Webhook-confirmed payment truth foundation
- [x] Manual-payment separation
- [x] Immutable canonical payment, refund, and reversal records with idempotent reconciliation
- [x] Shared server-owned collection lease excludes competing Checkout/manual/Terminal collection
- [x] Cutover tooling is explicit-booking, emulator-only, and dry-run by default; no production cutover occurred
- [ ] Controlled test-mode Connect/Checkout/refund/webhook, fee, tenant-isolation, and failure/retry acceptance
- [ ] Production Connect and booking-payment verification before customer release

Mobile Tap to Pay is post-V1; see Employee App section E. Its backend foundations are complete and remain frozen.

---

# 7. Job scope / extra-work flow — ✅ IMPLEMENTED; INTEGRATED ACCEPTANCE REMAINS

- [x] Residential/commercial intake
- [x] Customer-approved job scope control
- [x] Canonical tenant add-on catalog
- [x] Employee extra-work request submission
- [x] Owner review foundation
- [x] Owner-approved terms transition to customer approval-ready state
- [x] Verified customer approval creates one immutable authoritative scope revision
- [x] Employee JobPacket reads the updated scope on subsequent fetch
- [x] Declined, stale, cancelled, or unapproved requests cannot revise scope
- [ ] Full integrated owner → employee → customer → updated-job acceptance

---

# 8. Security / release hardening — 🟡 CURRENT-HEAD VALIDATION REQUIRED

The code-level slices below are implemented, but prior branch totals and July production reports are not evidence for this HEAD. The selective PR #9 hardening checkpoint is complete; do not merge/cherry-pick that branch wholesale.

- [x] Full current-head web test suite: `npm run test -- --run --reporter=verbose` passed `94/94` files and `844/844` tests, with `0` failures and `0` skipped (exit code `0`, 104.50 seconds). `AppOnboardingRouter`, `GrowthAIPage`, and Field Mode passed in the aggregate run; the earlier aggregate stall did not reproduce. React `act(...)` warnings remain test-hygiene debt, not an established V1 release blocker.
- [x] Full current-head Cloud Functions suite: `495/495` passed, including onboarding/billing lifecycle, payment/refund accounting, shared collection lease, employee provisioning, Terminal backend authority, JobPacket, extra work, Field Safety, and GrowthAI provider controls.
- [x] Employee App API/unit and React Native/auth suites: `95/95` and `99/99` passed.
- [x] Firestore rules suite: `64/64` passed.
- [x] Storage rules suite: `21/21` passed.
- [x] Rules parity and Cloud Function syntax checks passed.
- [x] Web lint passed.
- [x] Web production build passed.
- [x] Expo Doctor: `17/17` checks passed; dependency check is current/compatible and public config resolved.
- [x] Focused Field Mode: `39/39` passed.
- [x] Focused router/auth/onboarding and GrowthAI checks passed: router `24/24`, adjacent auth/onboarding `73/73`, GrowthAI `59/59`, and combined router + GrowthAI `83/83`; the invalid `--localstorage-file` warning is gone.
- Historical targeted web set previously reported as `140/165`: exact file selection was not recorded and cannot be reproduced; it is historical context, not the current acceptance result.
- [ ] Customer identity ownership verification
- [ ] Customer-to-tenant matching
- [ ] Duplicate/cross-tenant `authUid` checks
- [ ] Customer privacy smoke
- [ ] Cross-tenant denial smoke
- [ ] Employee assignment/authorization smoke
- [ ] Field-photo authorization smoke
- [ ] Field-safety tenant/permission and physical-device/network acceptance
- [ ] Current payment/security integration smoke
- [ ] Reproduce and classify known fixed-date/JSDOM failures on current HEAD; fix only current-slice regressions
- [ ] Verify current production Firestore/Storage rules, rules parity, indexes, Storage setup/CORS, object-prefix compatibility, and identity/assignment readiness before promotion
- [ ] Capture current Netlify commit/build and Cloud Functions deployed-revision evidence
- [ ] Verify test/live Stripe Prices, Portal configuration, Connect, booking Checkout, fees, and webhook synchronization
- [ ] Controlled test deployment, wife acceptance, beta-critical fixes, UI fine-tuning, and final release smoke

### Staging infrastructure checkpoint (2026-09-28)

- [x] Isolated Firebase staging project and `ServicesOS Staging Web` app registered; staging `(default)` Firestore database created in `nam5`.
- [x] Deploy reviewed Firestore rules to `servicesos-v1-staging`; CLI reported successful compilation/release, with warnings involving `request`, an unused helper, and `exists` pending review. No rules release/version identifier was exposed; effective deployed-rule correspondence remains unverified.
- [x] Deploy Firestore indexes to `servicesos-v1-staging`; post-deploy listing returned 22 definitions matching source, including the employee-assignment composite index.
- [x] Verify staging composite-index readiness in Firebase Console: 22/22 indexes show `Enabled`, with none Building or Missing. The `bookings` index on `assignedEmployeeAuthUid ASC`, `status ASC`, and `date DESC` (Collection scope) is `Enabled`.
- [ ] Review staging rules warnings and verify effective deployed rules. These tasks can proceed on Spark and do not require Blaze.
- [x] Enable staging Email/Password Auth and authorize `servicesos-v1-staging.netlify.app`; no staging users were created and production Auth was untouched.
- [x] Enable Google Auth for current web sign-in with approved public-facing name `ServicesOS by Stellar Logic AI` and support email `stellar.logic.ai@gmail.com`.
- [ ] Initialize staging Storage in the approved matching region (`us-east1`); blocked until staging is upgraded to Blaze.
- [ ] Configure the six staging Firebase web client variables on the empty, unlinked Netlify site; the connector rejected the attempted write, so values are not confirmed/set.
- [ ] Confirm staging deployment controls, then deploy only a reviewed application candidate. Firestore rules/indexes alone have been deployed; no Functions, Storage rules, Hosting, or web application deployment has occurred.

The staging project remains on Spark. Blaze is temporarily deferred because Google requires a temporary card authorization hold; this is an operational/cash-flow sequencing decision, not a code or product defect, and no V1 feature scope is being removed. The current plan is to enable Blaze when the business can comfortably absorb the hold, at or after the first paying customer. No billing upgrade has occurred. Storage initialization and real-cloud Functions deployment remain blocked until then.

Work that does not require Blaze may continue: Firestore rules deployment/verification; Firestore index deployment and READY verification; Firebase Auth verification; Netlify staging configuration; local/emulator Functions and Storage validation; and non-provider acceptance work. Production Firebase and Netlify remain untouched. Stripe staging/test-mode setup, physical-device acceptance, and wife beta remain open; mobile Tap to Pay remains post-V1. Staging resource creation does not mean ServicesOS V1 is release-ready.

Still required before controlled wife beta: GrowthAI V1 regression/freeze review, controlled test deployment, physical Employee App acceptance, and real owner/employee/customer end-to-end workflow acceptance. The aggregate web suite is clean, but React `act(...)` warnings remain test-hygiene debt. Focused GrowthAI passes; provider-backed test-mode acceptance remains open. Android auth persistence/recovery, camera/photos, directions handoff, foreground location, Field Safety queue/recovery/idempotent owner alert, and Stripe Checkout/refund/webhook/Connect/Portal behavior remain manual/device/provider acceptance work.

Still required before customer release: current production-readiness re-audit; deployed Firestore/Storage rules and revision evidence; required indexes; Storage CORS and object-path compatibility; identity/membership and assignment readiness; Netlify/Functions deployment evidence; customer privacy/tenant smoke; and controlled Stripe test/live acceptance. Physical/device acceptance remains open, including Android auth, camera/photos, directions, foreground location, and Field Safety retry/recovery. Mobile Tap to Pay remains post-V1 and is not a V1 or wife-beta blocker.

---

# 9. Wife V1 acceptance — ⬜ PENDING CONTROLLED TEST DEPLOYMENT

The original wife beta has already served as discovery/UX validation and helped define this V1. Do not re-test solved beta issues merely because the old build is still deployed.

After the current V1 branch passes integration/release validation and is deployed to a controlled test environment:

- [ ] Give outcome-based tasks, not click-by-click instructions
- [ ] New-owner onboarding
- [ ] Business setup
- [ ] Customer / estimate / booking workflow
- [ ] Customer-approved scope
- [ ] Add-on / extra-work workflow
- [ ] Employee field workflow
- [ ] Basic day/next-job navigation flow
- [ ] Basic field-safety flow
- [ ] Customer-job web/manual payment flow
- [ ] GrowthAI / SLAI Assistant
- [ ] Confirm assignment changes and day progression are understandable
- [ ] Record hesitation/confusion/blockers
- [ ] Fix V1-specific findings
- [ ] Re-test

---

# 10. Customer-ready ServicesOS V1 — ⬜ FINAL TARGET

- [ ] Remaining V1 workflow edges complete
- [ ] Full owner onboarding complete
- [ ] Monthly + annual SaaS billing complete
- [ ] Required post-activation subscription lifecycle complete
- [ ] Employee App core field workflow accepted
- [ ] Employee App basic routing/day progression accepted
- [ ] Employee App basic field-safety capability accepted
- [ ] Integrated security/tests/build green
- [ ] Controlled V1 deployment green
- [ ] Wife V1 acceptance critical findings closed
- [ ] UI fine-tuning pass
- [ ] Customer-facing release smoke green
- [ ] Feature freeze
- [ ] Final release candidate
- [ ] Customer-facing ServicesOS V1

Mobile Tap to Pay is not part of this V1 acceptance checklist; it is explicitly post-V1 work.

---

# Deferred / not allowed to move the V1 finish line

Unless Jamie explicitly changes scope, these do not become V1 blockers merely because code or ideas exist:

- legacy CleanOps flows
- abandoned prototype endpoints
- autonomous AI actions
- unlimited/persistent general chat history
- broad data-import/migration platform
- AI pricing authority
- Training Library expansion
- office messaging
- push notifications
- general/full offline queue beyond narrow critical V1 safety resilience
- payroll/break management
- route optimization beyond the basic approved V1 field flow
- continuous/all-day GPS tracking
- fleet telemetry
- expenses and mileage
- advanced crew-management/roll-call systems
- advanced employee management
- photo deletion/retention automation
- monitoring-center or direct emergency-dispatch platform
- future standalone SLAI products
- Employee App Expo/RN migration, Stripe Terminal SDK, mobile Tap to Pay UX, and physical card-present acceptance (post-V1)

---

# Board maintenance rule

After each validated GitHub push that changes ServicesOS V1 progress:

1. update the relevant checkboxes/status,
2. update the current checkpoint,
3. record the capability just completed,
4. identify the next locked-scope V1 task,
5. do not add new V1 scope without Jamie's explicit decision.

The concise chat progress view should be derived from this document after confirming it still matches the actual active branch.
