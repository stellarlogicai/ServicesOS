# ServicesOS V1 Finish Board Addendum — 2026-09-03

Status: **Approved additions to the V1 finish list**

Purpose: capture the September 3 scope decisions for the V1 finish board while the active Employee App work remains on an unpushed local feature branch.

This addendum should be folded into `SERVICESOS_V1_FINISH_BOARD.md` at the next controlled board/current-state synchronization after the local Employee App branch is safely reconciled.

---

# Owner / Business Onboarding — add to V1

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

These items are planning records only and must not become current V1 implementation work.

---

# Locked implementation order

The new V1 items do not interrupt the current Employee App work.

```text
1. Finish Employee App V1
2. Owner / Business Onboarding
3. SaaS agreement update + enforcement
4. Residential / Commercial Create Booking bounded V1 slice
5. Payments / Stripe stabilization
6. Release hardening
7. Wife / real-business beta validation
8. Customer-ready ServicesOS V1
```
