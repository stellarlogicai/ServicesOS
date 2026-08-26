# ServicesOS V1 Finish Board

Last updated: 2026-08-26

This document is the authoritative progress board for the defined customer-facing ServicesOS V1 finish line.

## Scope rule

ServicesOS Core V1 is reached. The remaining work is to finish the already-defined customer-facing product around that core.

GrowthAI V1 scope is locked: complete everything already designed and agreed for GrowthAI inside ServicesOS — no more, no less. New ideas outside the agreed V1 scope are parked unless Jamie explicitly changes the V1 scope.

The Employee App is part of customer-facing ServicesOS V1. It is the employee-side operating environment for assigned work, Field Mode, the employee assistant, safety functions, routing, and Tap to Pay as already planned.

Owner/business onboarding and release hardening are required before unfamiliar customers can self-serve and safely use ServicesOS.

## Overall status

| Area | Status |
| --- | --- |
| ServicesOS Core V1 | ✅ Complete |
| Legacy security cleanup | ✅ Complete |
| GrowthAI V1 | 🟡 Active priority |
| Employee App V1 | 🟡 Started |
| Owner/business onboarding | ⬜ Remaining |
| Payments / Tap to Pay | 🟡 Foundation built |
| Release hardening | 🟡 In progress |
| Wife beta | ⬜ Upcoming |
| Customer-ready release | ⬜ Final target |

## Current checkpoint

Feature branch: `feature/growthai-ai-gateway`

Latest validated product checkpoint: `70d75ec27d26272f3b64306f27fad503cc7f1379` — `Harden GrowthAI review-request lifecycle`

Current focus: **Finish GrowthAI V1**

Just completed: **Reputation V1 deterministic review-request opportunities, customer-scoped lifecycle/deduplication, review-response assistance, positive/neutral/sensitive draft handling, and human-review guardrails**

Next planned GrowthAI slice: **Brand Intelligence**

---

# 1. ServicesOS Core V1 — ✅ COMPLETE

- [x] Multi-tenant architecture
- [x] Authentication and role foundation
- [x] Customer management
- [x] Leads
- [x] Deterministic estimates and pricing
- [x] Bookings
- [x] Calendar and scheduling foundation
- [x] Repeat-customer workflows
- [x] Web Field Mode
- [x] Field photos
- [x] Business Settings foundation
- [x] Stripe / Stripe Connect foundation
- [x] Firestore / Storage security foundation
- [x] Tenant-isolation foundation

Core V1 should not be redefined by legacy, disabled, prototype, internal-only, or deferred code that happens to remain in the repository.

---

# 2. Security / legacy cleanup — ✅ COMPLETE FOR CURRENT FINDING

- [x] ServicesOS V1 completion audit performed
- [x] GrowthAI tenant async-isolation race fixed
- [x] Legacy unauthenticated payment exports retired
- [x] Legacy unauthenticated employee exports retired
- [x] Legacy model-training/image exports retired
- [x] Canonical booking checkout preserved
- [x] Stripe Connect preserved
- [x] Required webhooks preserved
- [x] GrowthAI gateway preserved
- [x] Functions/rules/build/test validation passed

Security and production verification still continue under Release Hardening.

---

# 3. GrowthAI V1 — 🟡 ACTIVE PRIORITY

## Foundation

- [x] Conversation-first Home foundation
- [x] GrowthAI first-run guide foundation
- [x] Deterministic opportunity detection
- [x] Draft persistence foundation
- [x] Activity/audit foundation
- [x] AI credit ledger/foundation
- [x] Human-review requirement
- [x] Provider gateway
- [x] Tenant isolation
- [x] Async tenant-switch hardening
- [x] AI Estimate Assistance foundation
- [x] ServicesOS deterministic estimate remains authoritative

## Business Briefing / intelligent Home — ✅ COMPLETE

- [x] Today's business summary
- [x] Today's wins from canonical completed-today booking data
- [x] Needs attention
- [x] GrowthAI noticed from existing deterministic opportunities
- [x] Estimate follow-up signals
- [x] Work signals where canonical data safely supports them; no payment metric invented without a safe canonical selector
- [x] Existing observed opportunities can surface without new AI generation
- [x] Dedicated rebooking opportunities from the completed Retention / rebooking V1 slice
- [x] Suggested next actions are non-mutating and use controlled existing workflows
- [x] Routine briefing is deterministic/free and does not call the AI provider
- [x] Natural-language briefing intents
- [x] Controlled-date behavior
- [x] Empty/loading behavior
- [x] Tenant A → B → A stale-result protection

## Marketing — 🟡 MOSTLY COMPLETE

- [x] Marketing workflow foundation
- [x] Human-reviewed draft model
- [x] Completed-job content using verified minimal service context
- [x] Service spotlights
- [x] Promotional content
- [x] Seasonal content
- [x] Educational/tip content
- [x] Humor/engagement content
- [x] Availability content
- [x] Local/community content
- [x] Before/after copy-only draft path without invented visual facts
- [ ] Authorized photo/asset integration where supported by the approved canonical architecture
- [x] Testimonial/review content is structurally blocked unless an approved source exists; no fabricated testimonials or ratings
- [ ] Approved testimonial/review source integration — Reputation V1 intentionally does not create a canonical testimonial source; owner-pasted review text is temporary response context only
- [x] Platform variants: General, Facebook, Instagram, LinkedIn, Website
- [ ] Full canonical brand-aware generation integration
- [ ] Lightweight content planning already defined for V1
- [x] Deterministic marketing setup costs zero credits
- [x] Provider marketing generation preserves the existing one-credit contract
- [x] Completed-job provider payload excludes customer, address, photo, payment, Stripe, employee, and internal data
- [x] Marketing generation remains draft-only with no automatic publish/send behavior

## Customer communication — ✅ COMPLETE

- [x] Response workflow foundation
- [x] Estimate follow-up drafts
- [x] Scheduling responses without fabricated availability
- [x] Quote/estimate question drafts using authoritative saved values
- [x] Service-question drafts using verified tenant service context
- [x] Problem-resolution drafts with liability/refund/employee-data guardrails
- [x] Explicit rebooking messages
- [x] Explicit review-request messages
- [x] Deterministic/free templates where appropriate
- [x] Explicit one-credit AI enhancement where useful
- [x] Server reloads and verifies one typed lead or booking source reference
- [x] Provider context excludes customer identity, addresses, internal notes, payment, and Stripe data
- [x] Communication output is review-required and never auto-sent
- [x] No estimate, booking, customer, or payment mutation
- [x] Tenant-switch stale-result protection preserved

## Retention / rebooking — ✅ COMPLETE

- [x] Detect customers due for another service from supported canonical weekly, bi-weekly, and monthly cadence
- [x] Detect recurring customers missing a matching next booking
- [x] Long-gap handling is covered by authoritative cadence-based due detection; no separate guessed threshold is invented without a defensible history baseline
- [x] Surface stable tenant-scoped, service-aware rebooking opportunities
- [x] Resolve authoritative cadence from tenant-scoped `recurring_services` when `recurringServiceId` is present
- [x] Canonical recurring-service cadence overrides conflicting duplicated booking frequency
- [x] Missing, paused, invalid, unsupported, mismatched, or cross-tenant canonical recurrence does not fall back to stale booking cadence
- [x] Legacy supported booking cadence remains a fallback only when no `recurringServiceId` exists
- [x] Upcoming/in-progress suppression matches the same service identity so Service A does not suppress Service B
- [x] Prepare rebooking drafts through Customer Communication once the owner selects context
- [x] Require owner approval before action through the existing review-required communication workflow
- [x] Detection and opportunity display use zero provider calls and zero credits

## Reputation — ✅ COMPLETE

- [x] Identify tenant-scoped review-request opportunities from qualifying completed, non-problem bookings
- [x] Review-request lifecycle is customer-scoped so recurring work cannot flood the owner with simultaneous prompts
- [x] Most recent qualifying completed booking can refresh context while the customer-scoped opportunity identity remains stable
- [x] Acted opportunities remain acted and disable the duplicate action as `Review Request Drafted`
- [x] Dismissed/resolved opportunities preserve existing GrowthAI lifecycle behavior and are not reopened by refresh
- [x] Issue-flagged, cancelled, unlinked, and wrong-tenant booking contexts remain excluded
- [x] Draft explicit review-request messages through Customer Communication
- [x] Review-response assistance accepts bounded owner-pasted review text without creating a canonical review/testimonial record
- [x] Positive / neutral / sensitive deterministic response handling
- [x] Deterministic review-response drafts are free
- [x] Optional AI review-response enhancement uses the existing one-credit gateway contract
- [x] Human approval before sending/posting for review-request and review-response drafts
- [x] No automatic send/post, external review integration, reputation scoring, or satisfaction prediction
- [x] Owner-pasted review text is temporary response context and is not an approved Marketing testimonial source

## Brand intelligence

- [x] Existing GrowthAI brand preferences foundation
- [ ] Canonical tenant brand profile integration
- [ ] Logo/profile integration
- [ ] Brand colors
- [ ] Tone
- [ ] Preferred writing style
- [ ] Default CTA
- [ ] Words/topics to avoid
- [ ] Service-area context
- [ ] Platform preferences
- [ ] GrowthAI automatically uses approved brand profile

## Conversation orchestration

- [x] Intent-routing foundation
- [x] Estimate-assistance conversational trigger
- [x] Business-briefing questions
- [x] Marketing routing polish for the implemented Marketing V1 content types
- [x] Retention/rebooking detection routing
- [x] Reputation routing
- [x] Customer-communication routing
- [ ] Contextual follow-ups
- [ ] Natural transitions between controlled workflows

## Drafts / Activity

- [x] Draft persistence foundation
- [x] Audit foundation
- [ ] Owner-friendly draft statuses
- [ ] Needs Review state
- [ ] Approved state
- [ ] Clear source/context
- [ ] Clear human-vs-AI action history
- [ ] Activity reads like a business tool rather than a developer log

## Credits UX

- [x] Credit ledger/foundation
- [x] Explicit paid estimate-assistance action
- [x] Zero-credit blocking where AI is required
- [ ] Final customer-facing balance UX
- [ ] Clear free-vs-paid actions
- [ ] Included monthly allowance UX
- [ ] Failure/restore UX
- [ ] No-surprise-spending review

## GrowthAI finalization

- [ ] Update first-run guide for completed V1
- [ ] Desktop QA
- [ ] Tablet QA
- [ ] Approximately 390 × 844 mobile QA
- [ ] Empty-business states
- [ ] No-opportunity states
- [ ] No-estimate states
- [ ] Zero-credit states
- [ ] Provider failure
- [ ] Slow provider
- [ ] Malformed AI response
- [ ] Long names/content
- [ ] Accessibility
- [ ] Loading/error states
- [ ] Wife GrowthAI beta
- [ ] Fix beta findings
- [ ] GrowthAI V1 freeze

**GrowthAI V1 rule:** everything already designed and agreed gets completed. No more, no less.

---

# 4. Employee App V1 — 🟡 STARTED

Project path: `employee-app/`

## Foundation

- [x] React Native project started
- [x] Source/navigation/component structure exists
- [ ] Audit existing implementation against final Employee App V1 design
- [ ] Replace placeholder/demo Firebase configuration
- [ ] Replace placeholder jobs/actions
- [ ] Establish authenticated canonical ServicesOS mobile API/data path

## Employee workflow

- [ ] Login
- [ ] My Day
- [ ] Assigned jobs
- [ ] Ordered daily work
- [ ] Job details
- [ ] Customer-safe information
- [ ] Approved job instructions
- [ ] Checklist
- [ ] Before photos
- [ ] Start Job
- [ ] Employee notes/problems
- [ ] After photos
- [ ] Complete Job
- [ ] Owner/admin visibility of field updates

## Employee assistant

- [ ] Work Assistant UI
- [ ] Current authorized job context
- [ ] Tenant-approved knowledge
- [ ] Approved procedures
- [ ] Safe AI interpretation
- [ ] Manager escalation
- [ ] Permission boundaries

## Safety

- [ ] Property hazards
- [ ] Product/chemical warnings
- [ ] Allergy/prohibited-product instructions
- [ ] PPE reminders
- [ ] Do-not-mix rules
- [ ] Incident/problem reporting
- [ ] Emergency/manager escalation behavior
- [ ] Safety-critical facts are never invented by AI

## Routing

- [ ] Ordered daily jobs
- [ ] Next-job workflow
- [ ] Open navigation
- [ ] Routing foundation
- [ ] Advanced optimization only to the extent already defined for V1

## Payments / Tap to Pay

- [ ] Secure employee payment permissions
- [ ] Canonical mobile payment API
- [ ] Stripe mobile integration
- [ ] Tap to Pay
- [ ] Payment confirmation
- [ ] Owner visibility
- [ ] Audit trail
- [ ] Failure/retry handling

## Employee App QA

- [ ] Android device/emulator testing
- [ ] Permissions
- [ ] Photos
- [ ] Network failures
- [ ] Auth expiration
- [ ] Tenant isolation
- [ ] Employee authorization
- [ ] Safety escalation
- [ ] Payment testing
- [ ] Wife/field workflow testing
- [ ] Employee App V1 freeze

---

# 5. Owner / business onboarding — ⬜ REMAINING

The old CleanOps onboarding is legacy/reference material, not the current production onboarding.

- [ ] Read-only onboarding architecture audit
- [ ] Map onboarding to canonical ServicesOS models
- [ ] New-business / first-login gate
- [ ] Welcome

## Business Basics

- [ ] Business name
- [ ] Business type
- [ ] Phone
- [ ] Email
- [ ] Service area
- [ ] Optional address
- [ ] Optional website

## Services & Pricing

- [ ] Select services
- [ ] Add custom service
- [ ] Pricing method
- [ ] Initial canonical pricing configuration

## Availability

- [ ] Business hours
- [ ] Working days
- [ ] Typical duration
- [ ] Scheduling buffer
- [ ] Booking horizon

## Brand

- [ ] Logo
- [ ] Existing canonical brand information
- [ ] Approved brand preferences

## Payments

- [ ] Connect Stripe
- [ ] Skip/do later

## Team

- [ ] Just me
- [ ] I have employees
- [ ] Basic employee setup/invite where appropriate

## Finish

- [ ] Review setup
- [ ] Completion marker
- [ ] Resume interrupted onboarding
- [ ] Start using ServicesOS
- [ ] New-owner end-to-end test

---

# 6. Payments / production readiness — 🟡 FOUNDATION BUILT

- [x] Stripe architecture
- [x] Stripe Connect foundation
- [x] Canonical booking checkout
- [x] Webhook foundation
- [x] Legacy unsafe payment exports retired
- [ ] Production Connect verification
- [ ] Production checkout verification
- [ ] Webhook end-to-end verification
- [ ] Success/cancel/return verification
- [ ] Platform-fee verification
- [ ] Payment tenant-isolation verification
- [ ] Employee App payment integration
- [ ] Tap to Pay verification
- [ ] Failure/retry testing

---

# 7. Customer / release hardening — 🟡 IN PROGRESS

## Security

- [ ] Customer identity ownership verification
- [ ] Customer-to-tenant matching
- [ ] Role validation
- [ ] Duplicate `authUid` detection/check
- [ ] Customer privacy smoke
- [ ] Cross-tenant denial
- [ ] Internal-note denial
- [ ] Field-data denial
- [ ] Payment-internal denial
- [ ] Photo authorization denial

## Firebase / production

- [ ] Verify deployed Firestore rules
- [ ] Verify deployed Storage rules
- [ ] Capture final rules hashes
- [ ] Production artifact review
- [ ] Production deploy verification
- [ ] Rollback readiness

## Customer experience

- [ ] Decide/finalize Customer Portal persistence requirements
- [ ] Email production smoke
- [ ] CORS production smoke
- [ ] Loading/error/empty-state pass
- [ ] Major viewport pass
- [ ] Fix known stale fixed-date test
- [ ] Update current-state/release documentation

---

# 8. Wife beta — ⬜ UPCOMING

- [ ] GrowthAI testing
- [ ] Owner workflow testing
- [ ] Estimate testing
- [ ] Booking testing
- [ ] Customer testing
- [ ] Field workflow testing
- [ ] Employee App testing
- [ ] Payments testing
- [ ] Onboarding testing
- [ ] Record friction/confusion
- [ ] Fix beta-critical findings
- [ ] Re-test

---

# 9. Customer-ready ServicesOS V1 — ⬜ FINAL TARGET

- [ ] Feature freeze
- [ ] All V1-required tests green
- [ ] Security gates green
- [ ] Production payment smoke green
- [ ] New owner can onboard without developer/founder help
- [ ] Employee can operate from Employee App
- [ ] GrowthAI V1 complete
- [ ] Wife-beta critical findings closed
- [ ] Final release candidate
- [ ] Customer-facing ServicesOS V1

---

# Deferred / not allowed to move the V1 finish line

Unless explicitly brought into scope by Jamie, these do not become V1 blockers merely because code or ideas exist:

- legacy CleanOps flows
- abandoned prototype endpoints
- autonomous AI actions
- unlimited/persistent general chat history
- unrelated AI/model-training experiments
- advanced offline mode beyond the locked V1 scope
- payroll/break management unless explicitly re-scoped
- future standalone SLAI products

Partially implemented legacy or future code must be classified based on whether the active customer-facing runtime actually depends on it.

---

# Board maintenance rule

After each validated GitHub push that changes ServicesOS V1 progress:

1. update the relevant checkboxes/status,
2. update the current checkpoint,
3. record the capability just completed,
4. identify the next locked-scope V1 task,
5. do not add new V1 scope without Jamie's explicit decision.

The concise chat progress view should be derived from this document; this repository document is the source of truth.