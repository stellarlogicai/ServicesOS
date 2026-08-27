# ServicesOS V1 Finish Board

Last updated: 2026-08-27

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

Latest validated product checkpoint: `a9e43d8420e37b3751b36e6417aa5c85c2995b2f` — `Refine SLAI Assistant operating surface`

Current focus: **Finish GrowthAI V1**

Just completed: **SLAI Assistant three-column operating surface with customer-facing SLAI naming, left navigation, center conversation/workspace, dynamic right context rail, quick actions, SLAI Noticed, Recent Drafts, canonical AI Credits, responsive mobile/tablet behavior, and regression/accessibility coverage**

Next planned GrowthAI slice: **Final QA / failure-state / accessibility hardening before wife beta**

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

## Marketing — ✅ COMPLETE

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
- [x] Authorized photo/asset integration reuses canonical field-photo identity and separate Marketing review metadata
- [x] Marketing photo approval follows the trusted tenant-management boundary: active tenant admin plus explicit-tenant super-admin
- [x] Field-photo evidence remains immutable; approval/revocation changes only separate Marketing review state
- [x] Gateway re-verifies selected stable photo IDs and current Marketing approval under the authenticated tenant's canonical booking path before credit reservation/provider use
- [x] Provider receives only approved-asset count; no image binary, URL, storage path, room label, notes, or customer data
- [x] Testimonial/review content is structurally blocked unless an approved source exists; no fabricated testimonials or ratings
- [x] Verified testimonial Marketing is intentionally unavailable in V1 because no approved canonical testimonial source exists; external review-platform ingestion is post-V1
- [x] Platform variants: General, Facebook, Instagram, LinkedIn, Website
- [x] Full canonical brand-aware generation integration through the shared approved Brand Intelligence context
- [x] Lightweight deterministic content planning
- [x] Content planning uses zero provider calls and zero credits
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

## Brand intelligence — ✅ COMPLETE

- [x] Existing GrowthAI brand preferences foundation
- [x] Canonical tenant brand profile integration through trusted tenant Business Settings plus tenant-scoped GrowthAI preferences
- [x] Logo/profile integration reuses tenant-controlled logo metadata; logo remains display-only and is not sent to the text provider
- [x] Brand colors
- [x] Tone
- [x] Preferred writing style
- [x] Default CTA
- [x] Words/topics to avoid
- [x] Service-area context from canonical tenant Business Settings, with legacy tenant service-area fallback only
- [x] Platform preferences
- [x] GrowthAI automatically uses the approved brand context for Marketing, Customer Communication AI enhancement, and Reputation AI response enhancement
- [x] Gateway reloads and sanitizes canonical tenant brand context server-side before provider use
- [x] Client-supplied business name/service area cannot override canonical tenant facts
- [x] Workflow-specific factual and safety guardrails outrank brand styling
- [x] Missing brand preferences fall back to neutral-safe behavior without AI inference or extra credit use

## Conversation orchestration — ✅ COMPLETE

- [x] Intent-routing foundation
- [x] Allowlisted V1 skill registry
- [x] Deterministic fast paths for clear intents
- [x] Constrained ambiguous-intent router with validated skill output
- [x] Routing costs zero user GrowthAI credits
- [x] Router provider input is limited to authenticated tenant context plus the owner's current message; no customer, payment, photo, draft, or Brand context is used for classification
- [x] Router cannot send, publish, mutate records, or reserve credits
- [x] Estimate-assistance conversational trigger
- [x] Business-briefing questions
- [x] Marketing routing polish for the implemented Marketing V1 content types
- [x] Retention/rebooking detection routing
- [x] Reputation routing
- [x] Customer-communication routing
- [x] Contextual follow-ups use only current bounded/visible tenant-scoped workflow context
- [x] Natural transitions between controlled workflows
- [x] Rebooking and review-request opportunities hand off to Customer Communication without automatic send or draft creation
- [x] Marketing-photo opportunities hand off to Marketing
- [x] Estimate follow-up remains in Opportunities for explicit owner action
- [x] Active writing refinements remain in the current workflow while explicit new intents can change workflows
- [x] Tenant-switch stale router/context results are ignored
- [x] Malformed, unsupported, or ambiguous routing falls back to controlled clarification

## Drafts / Activity — ✅ COMPLETE

- [x] Draft persistence foundation
- [x] Audit foundation
- [x] Owner-friendly draft statuses
- [x] Needs Review state
- [x] Approved state
- [x] Clear source/context with safe unavailable-source fallback
- [x] Clear human-vs-AI action history
- [x] Activity reads like a business tool rather than a developer log
- [x] Human-friendly draft type labels replace internal implementation identifiers in owner-facing UI
- [x] Legacy/malformed drafts degrade safely without leaking raw IDs or crashing
- [x] Cross-tenant or missing source references do not resolve into owner-facing context
- [x] Drafts/Activity rendering is deterministic, provider-free, and zero-credit
- [x] Existing approval semantics remain intact: Approved means owner-approved content, not sent/published/executed
- [x] Existing immutable per-draft audit history remains authoritative for activity events

## Credits UX — ✅ COMPLETE

- [x] Credit ledger/foundation
- [x] Canonical server-owned monthly entitlement foundation
- [x] 100 included AI credits per calendar month
- [x] Canonical tenant timezone authority at `businessSettings.timeZone` using validated IANA identifiers
- [x] Missing/invalid tenant timezone uses server-side UTC fallback
- [x] Monthly period renewal uses tenant-local calendar boundaries rather than fixed durations
- [x] Monthly allowance does not roll over; renewal resets the monthly bucket to exactly 100
- [x] Promotional and purchased buckets survive monthly renewal
- [x] Existing consumption order remains monthly → promotional → purchased
- [x] First authenticated server interaction can lazily provision/advance the period atomically and idempotently
- [x] Legacy canonical balances gain period metadata without overwriting existing bucket values
- [x] Active old-period reservations defer renewal rather than risking duplicate/lost credit accounting
- [x] Explicit paid estimate-assistance action
- [x] Zero-credit blocking where AI is required
- [x] Final customer-facing balance UX
- [x] Clear free-vs-paid actions
- [x] Included monthly allowance UX
- [x] Failure/restore UX
- [x] No-surprise-spending review
- [x] Canonical remaining balance, monthly allowance, tenant-local renewal date, and timezone are consumed from server-owned state
- [x] Loading, unavailable, malformed, zero, and normal balance states remain distinct
- [x] Every provider-backed V1 action shows its one-credit cost before explicit owner initiation
- [x] Zero credits block only provider-backed generation; deterministic/free alternatives remain available
- [x] Provider failure messaging reflects backend-authored credit restoration behavior and refreshes canonical balance
- [x] Successful generation refreshes canonical balance without optimistic subtraction
- [x] Tenant A → B → A stale-balance protection is preserved
- [x] Credits UX is reusable for the upcoming SLAI Assistant shell without duplicating entitlement logic

## GrowthAI finalization

- [x] Update first-run guide for completed V1
- [x] SLAI Assistant three-column UI refinement and customer-facing naming pass
- [x] Desktop QA
- [x] Tablet QA
- [x] Approximately 390 × 844 mobile QA
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
- [ ] Triage the pre-existing local smoke `false for 'list'` alert if it reproduces during final QA
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
- [ ] GrowthAI abandoned/stuck credit-reservation reconciliation or expiry review so a stale reservation cannot defer monthly renewal indefinitely
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