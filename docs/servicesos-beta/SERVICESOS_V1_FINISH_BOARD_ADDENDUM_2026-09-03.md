# ServicesOS V1 Finish Board Addendum — 2026-09-03

Status: **Approved additions to the V1 finish list**

Purpose: capture the September 3 scope decisions for the V1 finish board while the active Employee App work remains on an unpushed local feature branch.

This addendum should be folded into `SERVICESOS_V1_FINISH_BOARD.md` at the next controlled board/current-state synchronization after the local Employee App branch is safely reconciled.

---

# Owner / Business Onboarding — add to V1

## Agreement terminology

- [ ] Keep the **SaaS Agreement** (Stellar Logic AI ↔ ServicesOS business owner) distinct from the **Service Agreement / Job Scope Agreement** (service business ↔ its customer).
- [ ] Do not reuse one agreement as a substitute for the other.
- [ ] Keep owner subscription/legal acceptance in onboarding and customer job/scope acceptance in the customer booking/service flow.

## SaaS agreement

- [ ] Audit current `SaasAgreement.jsx` and contract persistence against the active onboarding flow.
- [ ] Update agreement copy to current ServicesOS V1 pricing and positioning.
- [ ] Remove stale plan names/terms that no longer match the product.
- [ ] Confirm subscription, renewal, cancellation, billing, support, acceptable-use, data-ownership, and service-availability terms.
- [ ] Add stable agreement version.
- [ ] Preserve immutable accepted-terms snapshot or equivalent durable historical evidence.
- [ ] Preserve signer name/email/identity.
- [ ] Preserve signature reference.
- [ ] Preserve signed timestamp.
- [ ] Require explicit terms acceptance.
- [ ] Require billing authorization where applicable.
- [ ] Require successful agreement/signature persistence before full tenant onboarding completes.
- [ ] Test interrupted onboarding/resume behavior around agreement step.
- [ ] Test that a later agreement update does not alter an already-signed historical record.
- [ ] Add/review service-agreement wording that defines included scope, excluded/unincluded work, add-on/change requests, added price/time, and possible future-visit handling.
- [ ] Ensure the agreement and locked booking scope can be correlated so the business can show what the customer accepted.

## Customer policy disclosure

- [ ] Review the current fixed 24-hour cancellation/deposit-forfeiture wording.
- [ ] Confirm the V1 policy reflects the actual intended business policy.
- [ ] Show the applicable cancellation/deposit policy before customer agreement/booking.
- [ ] Ensure customer acceptance/history can identify the policy/terms that applied.
- [ ] Do not add generalized automatic cancellation/no-show/late-payment fees in V1.

---

# Create Booking — Residential / Commercial V1

## Intake choice

- [ ] Add clear `Residential` and `Commercial` Create Booking paths/tabs.
- [ ] Keep Residential behavior compatible with the current residential flow.
- [ ] Keep Commercial intake separate enough that residential users do not see irrelevant business/facility fields.
- [ ] Normalize both paths into the same canonical booking/customer model.
- [ ] Do not create a second booking engine or collection.

## Commercial form — bounded V1 fields

- [ ] Business name.
- [ ] Primary contact.
- [ ] Phone/email.
- [ ] Service address.
- [ ] Facility/property type.
- [ ] Square footage.
- [ ] Service areas / rooms.
- [ ] Restrooms.
- [ ] Cleaning/service type.
- [ ] Frequency.
- [ ] Preferred service window.
- [ ] Operating-hours context where needed.
- [ ] Access/key/alarm instructions.
- [ ] Security requirements.
- [ ] Hazards/special instructions.
- [ ] Special floors/surfaces.
- [ ] Client-vs-cleaner supply responsibility.
- [ ] General notes.

## Commercial acceptance

- [ ] Commercial booking appears in the same Bookings system.
- [ ] Commercial booking appears in the same Calendar/scheduling flow.
- [ ] Existing employee assignment works.
- [ ] Employee App receives only the same safe canonical job data it needs.
- [ ] Existing checklist/photo/field execution can operate on the commercial booking.
- [ ] Existing payment model remains shared.
- [ ] Existing reporting/GrowthAI context remains shared where already supported.
- [ ] No residential-only field becomes incorrectly required for a commercial booking.
- [ ] No commercial-only field becomes incorrectly required for a residential booking.
- [ ] If a real wife/business commercial account is available, run one controlled commercial beta workflow.

## Stop condition

Do not let this slice expand into:

- separate commercial bookings collection;
- separate scheduler;
- advanced proposal engine;
- commercial contract negotiation engine;
- custom invoice/payment-term automation;
- major schema redesign.

If those are required, stop and move the advanced requirement to V2.

---


# Locked Job Scope + Add-On Request — add to V1

## Scope lock

- [ ] Treat the V1 capability as **Job Scope Control** with an **Add-On / Change Request** workflow.
- [ ] Customer-facing service agreement/booking acceptance clearly lists the purchased scope before field work begins.
- [ ] Show service type, included tasks, excluded/not-included-unless-added tasks, agreed price, estimated duration, scheduled window, payment terms, cancellation policy, and add-on/extra-work policy where supported by canonical data.
- [ ] Preserve/reference the applicable signed/accepted service-agreement version and customer acceptance timestamp.
- [ ] Preserve the confirmed job scope using the existing canonical booking/checklist/pricing structures.
- [ ] Employee can clearly see what is included in today's job.
- [ ] Customer-requested extra work does not silently alter the original agreed scope.
- [ ] Original scope remains auditable after add-ons are approved.

## Existing add-on reuse

- [ ] Use the existing canonical service/add-on catalog as the single source of truth.
- [ ] Employee selects an existing add-on instead of re-entering it.
- [ ] Pull the existing configured add-on price automatically.
- [ ] Pull existing configured duration/time data when already available.
- [ ] Do not create a duplicate add-on catalog or duplicate pricing record.
- [ ] Unknown/custom requested work routes to owner/authorized pricing instead of guessing.

## Optional last-minute scope-change fee

- [ ] Add a simple Business Settings toggle for a last-minute scope-change/add-on fee.
- [ ] Allow one bounded flat configured fee for V1.
- [ ] Apply the flat fee once per approved change request, not once per individual add-on inside the same request.
- [ ] Apply it only when the configured V1 trigger is met, such as extra work requested after the job has started.
- [ ] Show add-on price, last-minute fee, and total additional charge before work begins.
- [ ] Require customer approval before the extra work becomes authorized.
- [ ] Customer approval is attributable to the customer and timestamped.
- [ ] Employee cannot mark customer approval on the customer's behalf.
- [ ] Custom/unknown work requires owner/authorized pricing approval before customer approval.
- [ ] Do not silently apply the surcharge.
- [ ] Do not use this V1 setting as a generalized cancellation/no-show/late-payment fee engine.

## Scheduled-window protection

- [ ] Treat available time separately from price approval.
- [ ] Compare known/estimated add-on duration with the scheduled/remaining job window where canonical duration data exists.
- [ ] Support same-visit completion when it fits and is authorized.
- [ ] Support explicit appointment extension only when authorized.
- [ ] Support Future Visit Required when the add-on cannot fit in the allotted window.
- [ ] Future Visit Required remains linked to the original change request/current booking.
- [ ] Owner/admin can create a linked follow-up booking using the existing booking system.
- [ ] Follow-up booking carries the approved future-work context needed for that visit.
- [ ] ServicesOS does not auto-select the future date/time.
- [ ] ServicesOS does not auto-extend the employee's current schedule.
- [ ] Support decline/cancel of the requested add-on.
- [ ] Do not force the employee to overrun the original job window merely because the customer approved the charge.

## Job-specific add-on record

- [ ] Reference the existing canonical add-on/service record rather than duplicating it.
- [ ] Record request time/requested-by context.
- [ ] Record applicable configured add-on price.
- [ ] Record applicable last-minute fee.
- [ ] Record customer approval.
- [ ] Record owner/authorized approval where required.
- [ ] Record same-day vs future-visit disposition.
- [ ] Reuse the existing canonical booking price-snapshot mechanism if one already exists.
- [ ] Preserve historical job truth if the catalog price changes later.

## Employee App / Field Mode

- [ ] Provide a simple Customer Requested Extra Work action.
- [ ] Employee can select a canonical add-on.
- [ ] Employee sees the configured price and known duration before requesting approval.
- [ ] Custom/other requests clearly require owner/authorized pricing.
- [ ] Employee sees when a request is approved, declined, or requires a future visit.
- [ ] Employee-facing rule: Not on today's scope? Submit it as an extra-work request.

## Acceptance

- [ ] Signed/accepted service scope establishes what the customer purchased before the job starts.
- [ ] Customer-facing agreement includes clear extra-work/scope-change language and same-day availability limitation.
- [ ] Historical signed scope is not silently rewritten by later template/catalog changes.
- [ ] Existing add-on catalog remains the only catalog/pricing source.
- [ ] No parallel pricing system is introduced.
- [ ] No extra work is silently folded into the original scope.
- [ ] No undisclosed last-minute fee is applied.
- [ ] Price approval does not bypass time-window constraints.
- [ ] Audit history shows what was requested, approved, charged, and scheduled.
- [ ] Owner/admin can review the scope change.
- [ ] Wife/business beta can validate the workflow against a real customer scope-change scenario.

## Stop condition

Move the requirement to V2 rather than widening V1 if implementation requires:

- percentage/capped/grace-period surcharge rules;
- generalized fee-policy automation;
- autonomous pricing;
- autonomous schedule extension;
- a second service/add-on catalog;
- major booking/payment architecture redesign.

---

# Explicit V2 deferrals — do not move the V1 finish line

- [ ] Configurable cancellation fee engine — V2.
- [ ] Configurable no-show fee engine — V2.
- [ ] Automatic late-payment fee engine — V2.
- [ ] Grace-period automation — V2.
- [ ] Fee caps/maximum-charge automation — V2.
- [ ] Automatic fee assessment/charging — V2.
- [ ] Advanced commercial contract management — V2.
- [ ] Custom commercial invoice/payment-term automation — V2.
- [ ] Broader customer-policy automation — V2.
- [ ] Advanced percentage/capped/grace-period last-minute scope-change fee rules — V2.

These items are planning records only and must not become current V1 implementation work.

---

# Locked implementation order

The Employee App should be treated in two stages: the **non-payment core** first, then later Employee App scope-control/payment integration before final freeze.

```text
1. Resume interrupted mobile field-photo transport
2. Before / After photo UI
3. Safety / method guidance
4. Maps / navigation intent
5. SLAI Work Assistant
6. Employee App non-payment core polish / QA
7. Owner / Business Onboarding
8. Owner SaaS Agreement update + enforcement
9. Residential / Commercial Create Booking bounded V1 slice
10. Customer Service Agreement + Job Scope Control
11. Employee App Add-On / Change Request action
12. Stripe / Connect stabilization
13. Tap to Pay
14. Final Employee App + overall release QA
15. Wife / real-business beta validation
16. Customer-ready ServicesOS V1
```

First Codex task after usage reset: resume the interrupted mobile field-photo transport in place after inspecting branch, HEAD, working tree, and partial changes. Do not reset or discard interrupted work.
