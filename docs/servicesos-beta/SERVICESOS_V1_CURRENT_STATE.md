# ServicesOS V1 Current State

Updated: 2026-09-16

This file contains the changing ServicesOS checkpoint. Durable repository rules belong in `AGENTS.md`; detailed progress belongs in `SERVICESOS_V1_FINISH_BOARD.md`.

## Active priority

ServicesOS customer-facing V1 is the active build.

The original wife-beta build already served as discovery/UX validation. Many V1 requirements came directly from that testing and from the real problems encountered while trying to start a cleaning business.

Do not treat the older deployed beta as representative of the current V1 branch.

## Git checkpoint

Active branch:

`feature/owner-onboarding-v1`

Latest application-code checkpoint before the current documentation refresh:

`8bce3919d8e26d2643a476e44b89ed34b7d34718` — `Add employee extra-work request review`

Documentation-only commits follow that application checkpoint on the same branch. Check the branch itself for the current remote HEAD rather than copying a docs-only commit SHA into planning state.

The branch is backed up to:

`origin/feature/owner-onboarding-v1`

Do not merge to `master` until current-head integration/security/release validation passes.

## V1 capability rule

A V1 feature family means the smallest safe, useful, connected form of that capability — not the most advanced version that could eventually exist.

For the Employee App this means:

- basic routing/day progression, not route optimization or fleet telemetry,
- limited active-job safety location, not all-day tracking,
- field safety alerting and emergency handoffs, not a monitoring center or direct police dispatch,
- narrow offline resilience for critical safety state, not a full offline-first platform,
- Tap to Pay with verified backend truth and owner auditability, not every future mobile payment feature.

Advanced forms remain deferred unless Jamie explicitly re-scopes them.

## Small-slice implementation rule

Protect the late-October launch target by keeping Codex/implementation work in small, heavily defined slices.

Each coding task should include one capability delta only and explicitly define goal, scope, exclusions, files/areas to avoid, acceptance criteria, validation, stop conditions, and report-back.

Do not combine major areas such as onboarding, mobile routing, field safety, Tap to Pay, and release hardening into a single task. Complete and validate one slice before moving to the next.

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

The active navigation shell is intentionally narrow: Jobs/Today, Job Details, Work Assistant, and Profile. Legacy Training and Messages files do not make those features current V1 blockers.

### Owner onboarding / SaaS activation spine

Implemented:

- server-owned owner/tenant bootstrap
- canonical admin/tenant relationship validation
- basic business profile step
- versioned SaaS agreement delivery and acceptance evidence
- owner subscription Checkout gateway
- server-owned Stripe Customer
- verified `invoice.paid` activation path
- exact tenant/customer/subscription/Price/quantity validation
- stale/idempotent event protection

Important: this is the secure activation spine, not the complete ServicesOS operational onboarding.

## Canonical V1 onboarding requirement

A new customer must complete onboarding that gathers the information ServicesOS needs to function correctly for that business.

The production onboarding must use current canonical ServicesOS models and settings. Do not restore the legacy CleanOps `ImprovedOnboarding.jsx` flow as-is.

Required V1 onboarding areas:

1. secure owner/tenant bootstrap
2. business basics
3. SaaS agreement
4. ServicesOS subscription choice and verified payment
5. services and deterministic pricing setup
6. availability / scheduling rules
7. brand basics
8. customer-payment setup through Stripe Connect, with `Skip / do later`
9. team choice/setup
10. review, resume support, completion marker, and clear first action

Existing `businessSettings` must remain the canonical destination for compatible business information rather than creating a competing onboarding-only settings object.

The `I have employees` path must eventually create/link employees through the canonical employee identity flow so those employees can authenticate into the mobile app safely.

## Billing state correction still required

Current implementation activates the paid tenant after verified subscription payment. V1 now needs to separate:

- **billing entitlement active**, from
- **operational onboarding complete**.

Verified subscription payment must not by itself mean the business has completed ServicesOS setup.

The company-wide ServicesOS pricing decision is:

- $100/month
- $1,000/year
- same normal entitlement either way

Current code still exposes a single monthly Price path. Monthly + annual selection and exact two-Price validation are required before customer release.

Post-activation subscription lifecycle work also remains: renewal, failed payment, cancellation/end-of-term, recovery/reactivation, and customer billing-management behavior as required for V1.

## Employee App V1 remaining work

### Web-linked field correspondence

- finish extra-work through customer approval and authoritative scope refresh
- ensure approved scope changes refresh the employee JobPacket/checklist/time/price safely
- ensure declined/unapproved requests do not alter authoritative mobile work
- verify assignment, cancellation, reschedule, and reassignment changes refresh safely
- verify employees created through onboarding can enter the canonical mobile login path

### Basic routing / day progression

V1 requires the practical field-worker form only:

- define/confirm ordered work sequence for the employee day
- clear current-job / next-job progression
- retain reliable external maps/directions handoff
- owner/admin ↔ employee day/assignment correspondence acceptance

Do not expand this into advanced route optimization, continuous GPS, mileage automation, fleet telemetry, or complex crew logistics during V1 unless explicitly re-scoped.

### Field Safety / Emergency — basic V1 capability

Planned V1 field-safety work includes:

- Safety / Emergency action from the active job
- call-911 device dialer handoff
- call owner/admin handoff when contact exists
- tenant-scoped safety alert
- job/address/timestamp context
- limited on-demand location when permission/connection allow
- honest sent/queued/failed/location-unavailable state
- narrow local queue for unsent safety alerts
- owner/admin alert review and resolution
- basic missed-check-in / overdue safety status if promoted in the implementation slice
- tenant/permission/device/network acceptance

This is not a monitoring-center or emergency-dispatch product. Do not add constant live GPS, hidden recording, all-day surveillance, direct police dispatch, or advanced escalation trees to V1.

### Tap to Pay / mobile payments

Tap to Pay remains part of ServicesOS V1 and was intentionally deferred until the later Employee App/mobile-payment phase.

Remaining work:

- secure employee payment permission model
- canonical mobile payment API
- Stripe mobile SDK integration
- Tap to Pay implementation
- confirmed backend payment truth
- owner visibility/audit trail
- failure/retry behavior
- supported-device acceptance

### Mobile hardening

- Android emulator/physical-device acceptance
- auth persistence/expiration/recovery
- camera/photo permissions
- location permissions for promoted V1 safety/routing slices
- network failure/retry behavior
- duplicate-submit/idempotency behavior
- reassignment-away and cross-tenant denial
- full owner → employee → owner field workflow acceptance

## Current remaining V1 work

### Immediate workflow edges

- verify the extra-work flow through customer approval and authoritative job-scope update
- confirm declined/unapproved extra work cannot mutate authoritative scope

### Owner onboarding

- finish the operational setup stages described above
- persist/resume onboarding progress
- separate paid entitlement from onboarding completion
- new-owner end-to-end acceptance

### Owner SaaS billing

- add monthly + annual choice
- approve exactly two canonical server-side Price IDs
- accept either approved Price in activation verification
- implement required ongoing subscription lifecycle

### Employee App / mobile

- finish web-linked correspondence pieces
- finish basic routing/day progression
- implement basic V1 field safety
- implement Tap to Pay
- complete device/network/auth/permission acceptance

### Security / release

- current-head full web tests
- current-head Cloud Functions tests
- Employee App tests
- Firestore rules tests
- Storage rules tests
- lint and production build
- customer identity/tenant/privacy verification
- employee assignment/authorization smoke
- field-photo authorization smoke
- field-safety tenant/permission smoke after implementation
- payment/security integration smoke
- fix the known stale fixed-date/JSDOM test if it still reproduces

### V1 acceptance

After the integrated branch is validated and deployed to a controlled V1 test environment, Jamie's wife should test the current V1 using outcome-based tasks rather than click-by-click instructions. Only current V1 findings should drive final fixes/UI fine-tuning.

## Release sequence

Current sequence:

1. close remaining job-scope / extra-work edges
2. finish full owner onboarding
3. update owner SaaS billing to monthly + annual and finish required lifecycle
4. finish Employee App web-linked correspondence pieces
5. finish basic routing/day progression
6. implement basic V1 field safety
7. implement Tap to Pay/mobile payment acceptance
8. run full current-head integration/security validation
9. controlled V1 test deployment
10. wife V1 acceptance
11. fix V1-specific findings
12. UI fine-tuning
13. customer-release hardening and final smoke
14. customer-facing V1 release

The sequence can use parallel planning, but coding should remain small-slice and controlled. Do not let later mobile capability expansion move the V1 finish line.

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

The next release-readiness audit must report the actual current totals and current-head results.
