# ServicesOS V1 Finish Board

Last updated: 2026-09-16

This document is the authoritative progress board for the defined customer-facing ServicesOS V1 finish line.

## Scope rule

ServicesOS remains priority one. The frozen wife-beta build proved the baseline owner workflow and exposed real cleaning-business friction; the active V1 branch incorporates that feedback and is now the source for remaining V1 work.

Do not expand V1 because legacy, prototype, or future code exists in the repository. Build only the already-defined customer-facing V1 requirements.

The Employee App is part of customer-facing V1. Tap to Pay is also part of V1, but intentionally belongs to the later mobile/payment phase after the current owner/onboarding/payment work is stabilized.

The legacy `ImprovedOnboarding.jsx` / CleanOps-style flow is reference material only. Do not restore it as the production onboarding. New onboarding must use current canonical ServicesOS models and settings.

## V1 basic-capability rule

For V1, a feature family does not need its most advanced future form. V1 ships the smallest safe, useful, connected version of the capability that lets a real service business operate end to end.

Examples:

- routing/navigation V1 = ordered daily work, clear next-job progression, and reliable directions handoff; not route optimization, continuous GPS, fleet telemetry, or mileage automation,
- field safety V1 = emergency actions, tenant-scoped alerting, limited job-safety location when permitted, honest delivery state, and owner review; not a monitoring center, direct police dispatch, or all-day surveillance,
- offline V1 = targeted resilience only where required for safety/critical field actions; not a general offline-first employee platform,
- Tap to Pay V1 = authorized card-present collection with verified backend truth and owner auditability; not every future mobile invoicing/tipping/reconciliation feature,
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

Do not combine owner onboarding, mobile routing, field safety, Tap to Pay, and release hardening into one coding task. Complete and validate one slice before promoting the next.

## Current checkpoint

Active V1 branch: `feature/owner-onboarding-v1`

Latest application-code checkpoint before the current documentation refresh: `8bce3919d8e26d2643a476e44b89ed34b7d34718` — `Add employee extra-work request review`

Documentation-only commits follow that application checkpoint on the same branch. See `SERVICESOS_V1_CURRENT_STATE.md` for the current remote branch head.

The deployed wife-beta build is older than this branch and cannot validate the newer V1 work.

## Overall status

| Area | Status |
| --- | --- |
| ServicesOS Core V1 | ✅ Complete |
| GrowthAI / SLAI Assistant V1 implementation | ✅ Substantially complete; V1 acceptance/freeze remains |
| Employee App core field workflow | 🟡 Substantially implemented |
| Employee App routing/navigation basic V1 | 🟡 Directions foundation built; day/next-job progression remains |
| Employee App field safety basic V1 | ⏳ Planned V1 work |
| Employee App Tap to Pay | ⏳ V1 later mobile/payment phase |
| Owner/business onboarding | 🟡 Partial — secure activation spine built; operational setup still incomplete |
| Owner SaaS billing | 🟡 Partial — checkout + verified paid activation built; annual/lifecycle work remains |
| Customer-job payments / Stripe Connect | 🟡 Foundation built; production verification remains |
| Release hardening | 🟡 In progress |
| Wife testing of current V1 | ⬜ Not yet deployed for testing |
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

# 2. GrowthAI / SLAI Assistant V1 — 🟡 ACCEPTANCE / FREEZE REMAINS

The already-defined V1 implementation is substantially complete. Do not add new GrowthAI feature scope before ServicesOS V1 is stable.

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
- [x] Production provider-backed action verified previously
- [ ] Re-test inside the current integrated V1 branch/release candidate
- [ ] Close any V1-specific regression findings
- [ ] GrowthAI V1 freeze

---

# 3. Employee App V1 — 🟡 SUBSTANTIALLY IMPLEMENTED, FIELD CAPABILITIES REMAIN

Project path: `employee-app/`

The Employee App must remain a field-execution client for ServicesOS, not a second independent operating system. Web/admin owns planning and approval; mobile confirms, navigates, executes, records, and collects approved payments.

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
- [ ] Define/confirm canonical ordered work sequence for the employee day
- [ ] Clear current-job / next-job progression in the mobile UX
- [ ] Ensure assignment, cancellation, reschedule, and reassignment changes refresh safely
- [ ] Owner/admin ↔ employee route/day correspondence acceptance
- [ ] Device acceptance for directions and next-job flow

Explicitly deferred unless re-scoped:

- advanced route optimization
- continuous route telemetry
- all-day/background GPS tracking
- fleet management
- automatic mileage calculation
- broad crew roll call / complex multi-crew logistics

## C. Field Safety / Emergency — basic V1 capability

This is a field-safety tool, not a guaranteed emergency-response system.

- [ ] Safety / Emergency action available from active job
- [ ] Call 911 device-dialer handoff
- [ ] Call owner/admin handoff when contact is available
- [ ] Tenant-scoped safety alert to owner/admin
- [ ] Include active job/address/timestamp and limited location when permission/connection allow
- [ ] Honest `sent` / `queued` / `failed` / `location unavailable` states
- [ ] Narrow offline queue for unsent safety alerts only
- [ ] Retry/sync queued safety alert when connection returns
- [ ] Owner/admin active-alert review
- [ ] Owner/admin resolve/close alert
- [ ] Missed-check-in / overdue basic safety status if included in promoted V1 slice
- [ ] Limited on-demand location ping for active-job safety/missed check-in when permitted
- [ ] Tenant-isolation and permission tests
- [ ] Device/network/location acceptance

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
- [ ] Verify owner-approved extra work reaches customer-approval-ready state correctly
- [ ] Verify customer approval before authoritative scope mutation
- [ ] Refresh employee JobPacket/checklist/time/price context after approved scope change
- [ ] Verify declined/unapproved requests do not alter employee-authoritative work
- [ ] Confirm owner/admin visibility for the full lifecycle

## E. Tap to Pay / mobile payments — V1 later phase

Tap to Pay is not removed from V1. It was intentionally deferred until the team returns to the Employee App/mobile-payment phase.

- [ ] Secure employee payment permission model
- [ ] Canonical mobile payment API
- [ ] Stripe mobile SDK integration
- [ ] Tap to Pay implementation
- [ ] Confirmed backend payment truth
- [ ] Owner visibility / audit trail
- [ ] Failure/retry handling
- [ ] Supported-device/payment acceptance testing

## F. Mobile acceptance / hardening

- [ ] Current V1 Android emulator/device pass
- [ ] Session persistence / auth expiration / recovery pass
- [ ] Camera/photo permission pass
- [ ] Location permission behavior for promoted V1 safety/routing slices
- [ ] Network failure/retry pass
- [ ] Duplicate-submit/idempotency pass
- [ ] Reassignment-away denial
- [ ] Cross-tenant denial
- [ ] Real owner → assign → employee execute → owner review workflow
- [ ] Real field-workflow acceptance

Training-library expansion, office messaging, push notifications, general offline-first sync, payroll/break management, advanced employee management, advanced route optimization, and continuous GPS do not become V1 blockers unless Jamie explicitly re-scopes them.

---

# 4. Owner / business onboarding — 🟡 PARTIAL

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

## Canonical V1 onboarding contract still to finish

The customer must go through onboarding that gathers the information ServicesOS needs to operate correctly. Subscription payment and onboarding completion are separate states.

### Business basics

- [x] Business name
- [x] Phone
- [x] Email
- [x] Timezone
- [x] Business address field exists
- [ ] Business type
- [ ] Service area in onboarding
- [ ] Optional website in onboarding
- [ ] Reuse current canonical `businessSettings` model instead of creating a parallel settings object

### Services & pricing

- [ ] Select offered services
- [ ] Add custom services
- [ ] Choose pricing method
- [ ] Create initial canonical deterministic pricing configuration
- [ ] Do not make AI pricing authoritative

### Availability / scheduling rules

- [x] Working-day model exists in Business Settings
- [ ] Gather working days during onboarding
- [ ] Business hours
- [ ] Typical duration
- [ ] Scheduling buffer
- [ ] Booking horizon

### Brand basics

- [ ] Logo
- [ ] Minimum canonical brand information ServicesOS / GrowthAI need
- [ ] Reuse current branding/brand-profile contracts; do not revive a parallel legacy config model

### Customer-payment setup

- [x] Stripe Connect component/foundation exists
- [ ] Include Stripe Connect in onboarding
- [ ] Allow `Skip / do later`

### Team

- [ ] `Just me` path
- [ ] `I have employees` path
- [ ] Basic employee setup/invite when applicable
- [ ] Employee created through onboarding can reach the canonical mobile authentication path

### Finish / resume

- [ ] Review setup
- [ ] Persist onboarding progress
- [ ] Resume interrupted onboarding safely
- [ ] Separate billing entitlement from `onboardingState`
- [ ] Verified subscription payment must not by itself mark operational onboarding complete
- [ ] Mark onboarding complete only after required operational setup is satisfied
- [ ] Clear first action after completion
- [ ] New-owner end-to-end acceptance test without founder/developer help

## Explicitly not required for initial V1 onboarding

- legacy CleanOps `ImprovedOnboarding.jsx` restoration
- data migration/import from multiple platforms
- AI setup wizard
- AI-recommended pricing as authority
- elaborate preview/celebration systems

These may be future improvements after the required operational onboarding works cleanly.

---

# 5. Owner SaaS subscription billing — 🟡 PARTIAL

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

## Remaining

- [ ] Add monthly + annual billing selection
- [ ] Add exactly two server-approved canonical Price IDs
- [ ] Update activation validation to accept either approved monthly or annual Price
- [ ] Preserve identical normal product entitlement across monthly/annual terms
- [ ] Define and implement post-activation billing lifecycle
- [ ] Subscription renewal verification
- [ ] Payment-failure handling
- [ ] Cancellation/end-of-term handling
- [ ] Recovery/reactivation behavior
- [ ] Customer Portal / self-service billing-management path if required for customer-ready V1
- [ ] Production Stripe test-mode/live-mode acceptance

---

# 6. Customer-job payments / Stripe Connect — 🟡 FOUNDATION BUILT

This is separate from the owner SaaS subscription.

- [x] Stripe Connect foundation
- [x] Canonical booking checkout foundation
- [x] Honest public return-state behavior
- [x] Webhook-confirmed payment truth foundation
- [x] Manual-payment separation
- [ ] Production Connect verification
- [ ] Production booking checkout verification
- [ ] Webhook end-to-end verification
- [ ] Platform-fee verification
- [ ] Payment tenant-isolation verification
- [ ] Failure/retry acceptance

Tap to Pay is tracked in the Employee App section and remains a later V1 mobile/payment phase.

---

# 7. Job scope / extra-work flow — 🟡 FINAL EDGE VERIFICATION

- [x] Residential/commercial intake
- [x] Customer-approved job scope control
- [x] Canonical tenant add-on catalog
- [x] Employee extra-work request submission
- [x] Owner review foundation
- [ ] Verify owner-approved extra work reaches a customer-approval-ready state correctly
- [ ] Verify customer approval is captured before extra work becomes authoritative scope
- [ ] Verify approved extra work updates the job packet/checklist/price/time contract safely
- [ ] Verify declined requests do not change authoritative scope
- [ ] Full owner → employee → owner → customer → job-scope integration test

---

# 8. Security / release hardening — 🟡 IN PROGRESS

Do not claim these complete from old branch evidence. Re-run against the integrated current V1 branch.

- [ ] Full current-head web test suite
- [ ] Full current-head Cloud Functions suite
- [ ] Employee App unit/auth suites
- [ ] Firestore rules suite
- [ ] Storage rules suite
- [ ] Lint
- [ ] Production build
- [ ] Customer identity ownership verification
- [ ] Customer-to-tenant matching
- [ ] Duplicate/cross-tenant `authUid` checks
- [ ] Customer privacy smoke
- [ ] Cross-tenant denial smoke
- [ ] Employee assignment/authorization smoke
- [ ] Field-photo authorization smoke
- [ ] Field-safety tenant/permission smoke after that slice is implemented
- [ ] Current payment/security integration smoke
- [ ] Fix known stale fixed-date/JSDOM test if it still reproduces
- [ ] Update deployment/release evidence after current-head validation

---

# 9. Wife V1 acceptance — ⬜ NOT YET AVAILABLE

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
- [ ] Customer-job payment flow
- [ ] Tap to Pay flow
- [ ] GrowthAI / SLAI Assistant
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
- [ ] Employee App Tap to Pay accepted
- [ ] Integrated security/tests/build green
- [ ] Controlled V1 deployment green
- [ ] Wife V1 acceptance critical findings closed
- [ ] UI fine-tuning pass
- [ ] Customer-facing release smoke green
- [ ] Feature freeze
- [ ] Final release candidate
- [ ] Customer-facing ServicesOS V1

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

---

# Board maintenance rule

After each validated GitHub push that changes ServicesOS V1 progress:

1. update the relevant checkboxes/status,
2. update the current checkpoint,
3. record the capability just completed,
4. identify the next locked-scope V1 task,
5. do not add new V1 scope without Jamie's explicit decision.

The concise chat progress view should be derived from this document after confirming it still matches the actual active branch.
