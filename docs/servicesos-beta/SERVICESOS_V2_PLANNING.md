# ServicesOS V2 Planning

Decision checkpoint: 2026-09-03

Status: **PARKED until ServicesOS customer-facing V1 is stable and released.**

ServicesOS remains priority one, but V2 work must not interrupt the active V1 finish. This document preserves approved future scope so it does not leak back into V1.

## V2 scope rule

Do not implement any item in this document unless Jamie explicitly activates V2 work.

V2 should extend the existing ServicesOS core rather than create parallel booking, customer, scheduling, payment, or field-work engines.

Core rule:

```text
Different configuration and intake
        ↓
Same canonical ServicesOS operating core
```

---

# 1. Configurable customer policy and fee engine

## Current V1 baseline

Repository behavior currently includes:

- a fixed 24-hour cancellation notice policy;
- late cancellation inside that window forfeiting the deposit;
- a stored cancellation-policy field in the contract flow;
- overdue invoice status support;
- no confirmed configurable no-show fee implementation;
- no confirmed configurable late-payment fee, percentage, grace period, cap, or automatic late-fee calculation.

V1 may keep the existing simple disclosed cancellation/deposit rule.

The generalized policy engine belongs to V2.

V1 is separately allowed one bounded flat last-minute scope-change/add-on surcharge in Business Settings for extra work requested after a job has started. That V1 setting must reuse the canonical add-on catalog, be disclosed before approval, and must not grow into the generalized fee engine described here.

## V2 customer-policy configuration

Business Settings may eventually expose a customer-policy configuration surface such as:

### Cancellation

- notice period;
- no fee;
- forfeit deposit;
- flat cancellation fee;
- percentage of booking;
- optional maximum charge;
- explicit effective date/version.

### No-show

- enabled/disabled;
- flat amount or percentage;
- optional cap;
- owner review behavior where appropriate.

### Payment terms

- due immediately;
- due upon completion;
- Net 7;
- Net 15;
- Net 30;
- grace period.

### Late payment

- enabled/disabled;
- flat fee or percentage;
- when the fee becomes eligible;
- recurrence behavior if ever added;
- maximum fee/cap.

## Required architecture

Future automated policy behavior must be based on a versioned policy that was actually shown to the customer.

Preferred flow:

```text
Owner configures policy
        ↓
ServicesOS versions policy
        ↓
Customer sees applicable terms
        ↓
Customer agrees/books
        ↓
Booking preserves policy version/snapshot
        ↓
Cancellation / no-show / overdue event occurs
        ↓
System calculates allowed consequence
        ↓
Human review where required
        ↓
Ledger records what happened
```

Do not silently assess a fee the customer was never shown.

Do not rewrite historical policy snapshots when Business Settings change.

Keep calculation, application, payment collection, and audit history distinct.

## Human responsibility

AI may explain or summarize a policy, but AI must not invent, waive, assess, or change a financial obligation without an authorized deterministic workflow.

Before automatic fee charging is enabled for real customers, customer-facing terms and applicable legal requirements should be reviewed appropriately.

---

# 2. Advanced commercial / business service operations

## V1 boundary

V1 is approved to add a bounded Residential / Commercial Create Booking split using the same canonical booking core.

V2 contains the advanced commercial workflows that would make V1 sprawl.

## Parked commercial capabilities

Potential V2 commercial expansion includes:

- richer commercial facility profiles;
- reusable business-property/service-area profiles;
- recurring commercial contract terms;
- custom invoice/payment terms;
- proposal/contract workflow beyond the simple V1 booking path;
- more advanced service-area definitions;
- commercial-specific recurring scope management;
- business-specific policy configuration;
- deeper facility access/security requirements where needed.

These features must continue to feed the same canonical customer, booking, scheduling, employee, field-work, photo, payment, and reporting systems.

Do **not** create separate `commercialBookings` or a second scheduling engine.

---

# 3. Customer policy configuration architecture

The long-term configuration model should allow business owners to configure operating rules without code changes.

Examples:

- cancellation policy;
- no-show policy;
- payment terms;
- late-payment policy;
- commercial-specific defaults;
- advanced last-minute scope-change/add-on surcharge rules beyond the bounded V1 flat-fee setting.

Configuration should be:

- tenant-scoped;
- versioned where customer obligations are involved;
- auditable;
- human-owned;
- safely defaulted;
- separated from historical snapshots.

Future SLAI internal tooling may help manage or explain configuration, but ServicesOS must remain able to enforce its own canonical policy records.

---

# 4. Explicitly not V1 blockers

The following must not move the ServicesOS V1 finish line:

- configurable cancellation fee engine;
- configurable no-show fee engine;
- automated late-payment fee calculation;
- automatic fee charging;
- policy caps/grace-period automation;
- advanced commercial contract management;
- custom commercial invoice-term automation;
- proposal automation beyond the bounded V1 booking workflow;
- percentage/capped/grace-period last-minute scope-change fee logic beyond the simple V1 flat surcharge.

They are preserved here specifically so they can be built later without distracting from ServicesOS V1.

---

# 5. Activation gate

Before any V2 item is implemented:

1. ServicesOS customer-facing V1 is stable.
2. Employee App V1 is stable.
3. Owner onboarding is stable.
4. Payments are production-verified.
5. Real customer usage provides evidence for the feature.
6. Jamie explicitly activates the V2 slice.
7. The slice receives narrow acceptance criteria and must reuse the canonical ServicesOS core.
