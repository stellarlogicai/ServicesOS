# ServicesOS V1 Pre-Reset Handoff

Date: 2026-09-28
Branch: `feature/owner-onboarding-v1`
Checkpoint: `f0f287412d4c58316fb85317e0475386452236d6` — `Fix existing customer booking rules`

## Founder acceptance

Jamie completed a normal-operator/manual owner-web pass before wife beta to
catch obvious workflow blockers, operational friction, and UI inconsistencies.
That pass is complete for now. Wife beta has **not** yet been completed on this
V1 candidate.

### Closed booking-rules finding

Commit `f0f287412d4c58316fb85317e0475386452236d6` fixed the existing-customer
booking rules/schema mismatch. Residential existing-customer booking succeeds;
the bounded commercial shape is supported; commercial-only fields remain
excluded from residential bookings; unknown/untrusted fields remain denied; and
tenant, role, and payment protections remain intact. Validation recorded for
the fix: Firestore rules `65/65`, rules parity passed, focused web tests
`26/26`, and a seeded Tenant A local transaction succeeded before its temporary
booking was removed. This finding is closed.

### Highest-priority V1 experience gap: SLAI Assistant

The current conversation surface behaves too much like an intent/workflow
router. Asked “How many bookings do I have coming up?”, it gave a generic
capability prompt instead of a factual answer from ServicesOS data. The next
functional slice should answer supported business questions naturally from
bounded, authorized, tenant-scoped canonical evidence. Deterministic retrieval
and calculations remain free; credits are for explicit provider-backed
generation, analysis, interpretation, or research. Consequential actions remain
human-approved. This is an existing V1 experience gap, not a new autonomous
agent or product scope.

### UI polish findings

- **SLAI Assistant:** declutter the desktop center, reduce persistent quick
  actions, and keep conversation/composer primary. Mobile needs its own
  conversation-first composition, not a vertically stacked desktop dashboard.
- **Services & Pricing and Add-on Catalog:** align forms, field widths, labels,
  and spacing with the established Business Settings treatment.
- **Booking Details:** improve left alignment, hierarchy, scanability, task-list
  alignment, section separation, and modal density while preserving existing
  Details / Assignment / Job Prep behavior.
- **Edit Customer:** use a compact responsive form and keep actions visible at
  normal desktop sizes, with scrolling for genuinely constrained viewports.

These are usability/consistency improvements, not new capability scope.

## Recommended post-reset sequence

1. Implement the smallest safe SLAI Assistant V1 conversational-business-facts
   slice.
2. Validate natural factual questions against canonical tenant-scoped
   ServicesOS evidence.
3. Perform SLAI Assistant responsive desktop/mobile UI cleanup.
4. Perform owner-web consistency work for Services & Pricing, Add-on Catalog,
   Booking Details, and Edit Customer.
5. Jamie performs a short manual regression pass.
6. Begin wife beta using outcome-based tasks.
7. Fix only beta-critical, security, data, or workflow findings.
8. Complete UI fine-tuning.
9. When Blaze is financially practical, complete cloud/provider/device release
   gates.
10. Run final release smoke and complete ServicesOS V1 release.

Do not move future products ahead of ServicesOS. Mobile Tap to Pay remains
post-V1. Remaining release gates include wife beta, physical Employee App
acceptance, Blaze-backed Storage/Functions, authenticated staging security
smoke, Stripe/provider acceptance, integrated owner/employee/customer
acceptance, and final release smoke. This handoff does not claim release
readiness.

## Usage/reset note

Jamie reported approximately 8% Codex usage remaining on 2026-09-28, with an
expected reset in approximately five days. This is user-reported, not live
usage telemetry. Preserve remaining usage for emergency or beta-critical fixes;
avoid speculative implementation and broad audits before reset. Resume controlled
V1 work from this handoff after reset.
