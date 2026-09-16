# ServicesOS V1 Current State

Updated: 2026-09-15

This file contains the changing ServicesOS checkpoint. Durable repository rules belong in `AGENTS.md`; detailed progress belongs in `SERVICESOS_V1_FINISH_BOARD.md`.

## Active priority

ServicesOS customer-facing V1 is the active build.

The original wife-beta build already served as discovery/UX validation. Many V1 requirements came directly from that testing and from the real problems encountered while trying to start a cleaning business.

Do not treat the older deployed beta as representative of the current V1 branch.

## Git checkpoint

Active branch:

`feature/owner-onboarding-v1`

Current checkpoint:

`8bce3919d8e26d2643a476e44b89ed34b7d34718` — `Add employee extra-work request review`

The branch is backed up to:

`origin/feature/owner-onboarding-v1`

Do not merge to `master` until current-head integration/security/release validation passes.

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

Current mobile work still requires current-head device/emulator acceptance and the later V1 Tap to Pay phase.

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

## Tap to Pay status

Tap to Pay remains part of ServicesOS V1.

It was intentionally deferred until the team returns to the Employee App/mobile-payment phase. Do not classify it as post-V1 and do not let it distract from the current owner/onboarding/payment sequence.

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

- current-head Android/device acceptance
- network/auth/photo/permission testing
- later V1 Tap to Pay implementation and acceptance

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
- payment/security integration smoke
- fix the known stale fixed-date/JSDOM test if it still reproduces

### V1 acceptance

After the integrated branch is validated and deployed to a controlled V1 test environment, Jamie's wife should test the current V1 using outcome-based tasks rather than click-by-click instructions. Only current V1 findings should drive final fixes/UI fine-tuning.

## Release sequence

Current sequence:

1. close remaining job-scope / extra-work edges
2. finish full owner onboarding
3. update owner SaaS billing to monthly + annual and finish required lifecycle
4. return to Employee App/mobile work, including Tap to Pay
5. run full current-head integration/security validation
6. controlled V1 test deployment
7. wife V1 acceptance
8. fix V1-specific findings
9. UI fine-tuning
10. customer-release hardening and final smoke
11. customer-facing V1 release

## Explicitly parked unless Jamie re-scopes them

- legacy CleanOps onboarding restoration
- broad multi-platform data import/migration
- AI setup wizard
- AI-recommended pricing as authority
- Training Library expansion
- office messaging
- push notifications
- full offline queue
- payroll/break management
- expenses/mileage
- advanced employee management
- photo deletion/retention automation
- GrowthAI expansion beyond the already-defined ServicesOS V1
- future standalone SLAI products

## Validation evidence rule

Old branch-specific test totals are historical evidence only. Do not reuse them as proof for the integrated current branch.

The next release-readiness audit must report the actual current totals and current-head results.