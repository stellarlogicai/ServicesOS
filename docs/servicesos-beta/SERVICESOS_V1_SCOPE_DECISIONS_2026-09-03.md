# ServicesOS V1 Scope Decisions — 2026-09-03

Status: **Approved V1 planning decisions**

Purpose: preserve the ServicesOS V1 decisions made on 2026-09-03 without interrupting the active Employee App finish.

These decisions should be folded into the normal V1 implementation sequence when their planned phase begins.

---

# 1. Owner onboarding: SaaS agreement is a V1 launch requirement

## Agreement terminology — locked for V1

ServicesOS has two distinct agreements and implementation must not conflate them:

- **SaaS Agreement:** Stellar Logic AI ↔ ServicesOS business owner. This is accepted/signed during owner/business onboarding and governs use of the ServicesOS platform.
- **Service Agreement / Job Scope Agreement:** service business ↔ that business's customer. This defines the purchased service, scope, price, scheduled window, cancellation terms, and add-on/change-request terms for the customer job.

The owner-onboarding SaaS Agreement does not replace the customer Service Agreement, and the customer Service Agreement does not govern the business owner's subscription to ServicesOS.


## Current repository foundation

Relevant existing code includes:

- `servicesos-web/src/components/SaasAgreement.jsx`
- `servicesos-web/src/services/contractService.js`

The existing foundation includes customer-facing SaaS terms, acceptance controls, signature capture, and signed-contract persistence.

The current concern is not the absence of an agreement foundation. The concern is that the agreement is not currently proven to be enforced in the active owner/business onboarding path and portions of its language appear older than the current ServicesOS business model.

## V1 requirement

During the already-planned Owner / Business Onboarding work:

- review and update the ServicesOS SaaS agreement;
- align pricing and product language with the current V1 model;
- remove stale Starter / Professional / Enterprise language if it no longer applies;
- remove stale cleaning-only positioning if it no longer represents ServicesOS;
- confirm subscription, renewal, cancellation, billing, support, acceptable-use, data-ownership, and service-availability wording;
- require explicit terms acceptance;
- require billing authorization where applicable;
- require signer identity;
- require signature;
- require successful signed-contract persistence before the tenant is treated as fully onboarded.

## Versioned agreement evidence

The signed record should preserve enough evidence to determine exactly what was accepted.

Preferred V1 contract fields include the equivalent of:

```text
agreementType
agreementVersion
agreementSnapshot / immutable accepted terms
signedAt
signedByUid
signedByName
signedByEmail
signatureStoragePath / signatureRef
termsAccepted
billingAuthorized
```

Exact field names should follow the existing contract architecture after inspection.

Changing the current agreement later must not silently change the historical agreement a customer already signed.

## Sequence

This work belongs where owner onboarding is already planned.

Do **not** interrupt the active Employee App completion to implement it early.

---

# 2. Customer cancellation policy: simple disclosed V1 behavior

## Current baseline

Current repository behavior includes a fixed service cancellation rule centered on:

- 24 hours notice;
- deposit forfeiture for cancellation inside that window;
- a cancellation-policy field in the contract flow.

This is enough for a simple V1 policy if it remains the intended business rule.

## V1 rule

The applicable cancellation/deposit policy must be shown to the customer before the customer agrees/books.

ServicesOS must not quietly add an undisclosed fee later.

V1 does **not** require a generalized cancellation/no-show/late-payment policy engine.

The configurable/automated fee engine is V2.

---

# 3. Late-payment and no-show fees are not V1

Current code supports overdue invoice state, but there is no confirmed generalized implementation for:

- configurable late-payment fee;
- late-payment percentage;
- grace period;
- maximum late fee;
- configurable no-show fee;
- automatic fee assessment.

Do not build those systems as V1 blockers.

Preserve them in `SERVICESOS_V2_PLANNING.md`.

---

# 4. Create Booking: Residential / Commercial split is approved for V1

## Current product reality

The current ServicesOS booking/data model is already flexible enough to represent business/commercial cleaning work.

The current customer-facing cleaning intake is still residential-first.

V1 may add a simple Create Booking choice:

```text
Create Booking

[ Residential ]   [ Commercial ]
```

This is approved because a real commercial cleaning job may become part of wife/business beta once licensing and insurance are ready.

## Shared-core rule

Residential and Commercial are different intake experiences, **not different booking engines**.

Both must normalize into the same canonical:

- customer system;
- booking system;
- scheduling;
- employee assignment;
- Employee App / Field Mode;
- checklist;
- photos;
- payments;
- reporting;
- GrowthAI context where already supported.

Do not create:

- `residentialBookings`;
- `commercialBookings`;
- a second scheduler;
- a second employee workflow;
- a second payment model.

## Residential form

Keep the current residential-oriented flow and fields where they remain appropriate.

## Bounded V1 Commercial form

The first Commercial form should ask only for practical booking/job-prep information, such as:

- business name;
- primary contact;
- phone;
- email;
- service address;
- facility/property type;
- square footage;
- service areas / rooms;
- restrooms;
- cleaning/service type;
- service frequency;
- preferred service window;
- operating-hours context where needed;
- access/key/alarm instructions;
- security requirements;
- hazards/special instructions;
- special floors/surfaces;
- whether client or cleaner supplies materials;
- general notes.

Do not turn the V1 form into a commercial contract-management system.

## V1 implementation gate

Add this during the planned owner/Create Booking work after the active Employee App finish.

Proceed only if the code audit confirms it is a bounded form/data-normalization slice.

Stop and reassess if it requires:

- a major booking schema redesign;
- a separate booking collection;
- a broad scheduler fork;
- a separate payment workflow;
- multi-day architecture work that materially delays V1.

If a real commercial job is available, use it as a controlled beta validation case.

---


# 5. Locked Job Scope + Add-On Request is approved for V1

## Problem this solves

A real wife/business workflow exposed a common service-business problem: a customer may change expectations after the job begins, request work that was not part of the confirmed booking, or keep adding tasks without accounting for price or the scheduled service window.

V1 should protect the employee, business, and customer with a simple locked-scope workflow instead of relying on memory or verbal disagreement.

## Locked scope

The internal V1 capability name is **Job Scope Control**, with the employee/customer workflow **Add-On / Change Request**.

Before field execution begins, the customer-facing service agreement/booking confirmation should make the purchased scope explicit. Where supported by the current canonical models, it should show:

- service type;
- included tasks;
- excluded / not-included-unless-added tasks;
- agreed price;
- estimated duration;
- scheduled service window;
- payment terms;
- cancellation policy;
- add-on / extra-work policy.

The purpose is to create a signed/accepted record of **what was purchased** before the job starts.

When a booking is confirmed for field execution, ServicesOS should preserve the agreed job scope using the existing canonical booking/checklist/pricing structures wherever possible.

The employee must be able to see what is included in today's work.

The original confirmed scope must not silently expand because a customer asks for something extra after work begins.

Do not create a second service catalog, add-on catalog, pricing table, or duplicate source of truth.

## Existing add-ons remain the source of truth

When the customer requests extra work and that work already exists in the business's canonical service/add-on catalog:

- the employee selects the existing add-on;
- ServicesOS reads the existing configured add-on name and price;
- use existing configured duration/time data if the canonical add-on model already stores it;
- the employee does not invent or re-enter a duplicate price;
- the employee does not create a duplicate add-on record.

If the requested work does not exist in the catalog, record it as a custom/other request and route it to the owner or another authorized pricing role rather than guessing a price.

## Optional last-minute scope-change fee

V1 may include one simple business-configurable surcharge for customer-requested work added after the agreed scope is locked.

Business Settings should support the equivalent of:

```text
Last-Minute Scope Change / Add-On Fee

Enabled: Yes / No
Fee: configured flat amount

Applies when:
customer requests additional work after the job has started
```

This is intentionally a small V1 setting, not the generalized V2 policy/fee engine.

Rules:

- use the canonical add-on price from the existing service/add-on catalog;
- add the configured last-minute scope-change fee only when the business has enabled it;
- for V1, treat the flat scope-change fee as **one fee per approved change request**, not one fee multiplied across every add-on inside the same approved request;
- show the customer each requested add-on price, the one applicable scope-change fee, and the additional total before the extra work begins;
- require explicit customer approval before the extra work begins;
- customer approval must be attributable to the customer and time-stamped; an employee must not be able to mark approval on the customer's behalf;
- if the requested work is custom/unknown, owner or another explicitly authorized pricing role must approve the price before customer approval;
- do not hide or silently apply the surcharge;
- do not create a duplicate add-on or pricing record to hold the surcharge.

## Scheduled-window protection

Approval of an additional charge does not automatically mean there is enough time to perform the work during the current visit.

ServicesOS should compare the requested add-on's known/estimated duration, where available, with the current scheduled window / remaining job time.

The V1 workflow should support a clear decision:

- complete during the current visit if the authorized user determines it fits;
- extend the current appointment only when permitted/approved;
- schedule the add-on for a future visit;
- decline the add-on.

If it cannot reasonably be completed in the allotted window, the employee must have a clear **Future Visit Required** path instead of being pressured to overrun the job.

For V1, **Future Visit Required** is an actionable workflow state, not just a note:

- the change request remains linked to the current booking/job;
- the owner/admin can create a linked follow-up booking using the existing booking system;
- the follow-up booking should carry only the approved future work/context needed for that visit;
- ServicesOS must not automatically choose the future date/time;
- ServicesOS must not automatically extend the employee's current schedule;
- the owner/customer scheduling decision remains human-controlled.

## Approval and audit trail

The original booking scope remains preserved.

An approved extra-work record should reference the existing canonical add-on where one exists and record only the job-specific event, such as:

- booking/job reference;
- canonical add-on/service reference;
- request time;
- requested-by context;
- applicable configured price;
- applicable last-minute fee;
- customer approval;
- owner/authorized approval where required;
- same-day vs future-visit disposition;
- completion/scheduling outcome.

Reuse any existing canonical booking-price snapshot mechanism rather than inventing a parallel historical pricing system.

The locked-scope evidence should remain tied to the signed/accepted service agreement or booking acceptance evidence so the business can establish what the customer approved before work began. At minimum, preserve or reference:

- applicable service-agreement version;
- customer acceptance/signature timestamp where the current contract flow supports it;
- included and excluded scope as accepted;
- agreed price/duration/window;
- approved add-on/change history.

The customer-facing service agreement should include clear scope-change language equivalent in meaning to:

> The agreed service includes only the tasks listed in the approved booking or service agreement. Additional work requested before or during the appointment may require additional charge and additional time. Add-on work is not guaranteed for the same visit and may require a future appointment based on availability and the remaining scheduled window.

Final legal/customer-facing wording should be reviewed during the planned service-agreement update rather than copied blindly from planning text.

## Employee-facing V1 rule

A simple employee-facing principle should guide the workflow:

> Not on today's scope? Submit it as an extra-work request instead of silently adding it to the job.

## V1 boundaries

Do not turn this slice into:

- a second add-on catalog;
- duplicate pricing configuration;
- AI-generated pricing;
- automatic negotiation;
- a generalized policy engine;
- percentage/capped/grace-period surcharge rules;
- advanced change-order contract automation;
- autonomous schedule extension.

Those remain V2 where applicable.

---

# 6. V1 / V2 boundary locked by this decision

## V1

- SaaS agreement update and owner-onboarding enforcement.
- Agreement versioning / historical accepted-terms evidence.
- Customer-visible cancellation/deposit policy before agreement/booking.
- Basic Residential / Commercial Create Booking split.
- Bounded Commercial intake normalized into the existing ServicesOS core.
- Locked Job Scope + Add-On Request workflow.
- Existing canonical add-on pricing reused as the single source of truth.
- Optional simple flat last-minute scope-change/add-on fee in Business Settings.
- Customer approval before extra work begins.
- Same-day vs Future Visit Required handling based on the scheduled window.

## V2

- Configurable cancellation fee engine.
- Configurable no-show fee engine.
- Automatic late-payment fees.
- Grace periods and fee caps.
- Automatic fee assessment/charging.
- Advanced commercial contract terms.
- Custom commercial invoice/payment-term automation.
- Broader policy automation.
- Advanced/percentage/capped last-minute scope-change fee rules.

---

# 7. Priority protection

These additions do not change the immediate build priority.

For planning purposes, distinguish **Employee App non-payment core** from the final fully frozen Employee App V1. Job Scope Control and Tap to Pay still require later Employee App work, so "finish Employee App" must not be interpreted as "never reopen the mobile app."

Locked execution sequence:

```text
Resume interrupted mobile field-photo transport
        ↓
Before / After photo UI
        ↓
Safety / method guidance
        ↓
Maps / navigation intent
        ↓
SLAI Work Assistant
        ↓
Employee App non-payment core polish / QA
        ↓
Owner / Business Onboarding
        ↓
Owner SaaS Agreement update + enforcement
        ↓
Residential / Commercial Create Booking bounded V1 slice
        ↓
Customer Service Agreement + Job Scope Control
        ↓
Employee App Add-On / Change Request action
        ↓
Stripe / Connect stabilization
        ↓
Tap to Pay
        ↓
Final Employee App + overall release QA
        ↓
Wife / real-business beta validation
        ↓
Customer-ready ServicesOS V1
```

The first Codex action after usage reset remains the interrupted mobile field-photo transport recovery: inspect the working tree first, preserve partial work, and resume in place.

No V2 policy engine work should begin during this sequence.
