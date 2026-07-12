# ServicesOS V1 Guided Workflow Plan

Purpose: connect the already-built ServicesOS pieces into a smoother beta workflow without turning this into a V2 rebuild.

Core goal:

```text
Connect the already-built pieces into a smooth beta workflow.
```

The app should answer:

```text
What just happened?
What does it mean?
What should I do next?
What is still missing?
How do I clean up mistakes?
```

## Master Rules

Every phase should follow these rules:

```text
Smallest V1 version.
No full automation engine.
No rebuilds.
No payment truth changes.
No tenant isolation changes.
No unrelated modules.
```

Do not build:

```text
No AI.
No auto-send.
No SMS.
No backend changes unless a phase explicitly requires and approves it.
No Stripe logic changes unless a phase explicitly requires and approves it.
No fake paid states.
No fake automation success.
```

## Phase 0 - Prep / Safety Check

Goal: confirm the repo and validation baseline before starting workflow work.

Run from `servicesos-web`:

```powershell
git status -sb
git log --oneline --decorate -5
npm run lint
npm run test -- --run
npm run build
```

Pass criteria:

```text
Working tree is clean or known.
Current test baseline is known.
Payments are stable.
GrowthAI is not touched.
```

## Phase 1 - Shared Workflow Components

Status: beta blocker foundation.

Goal: create reusable UI patterns so every page does not invent its own workflow guidance.

Candidate components:

```text
NextStepPanel
SmartEmptyState
StatusActionButtons
PaymentStateBadge
MissingInfoChecklist
ArchiveConfirmModal
CopyMessageBox
```

Component intent:

| Component | V1 purpose |
| --- | --- |
| `NextStepPanel` | Show what just happened and the next safe actions after major saves. |
| `SmartEmptyState` | Explain empty pages and point to the next useful action. |
| `StatusActionButtons` | Show actions appropriate to the current estimate, booking, or payment status. |
| `PaymentStateBadge` | Separate unpaid, manual, Stripe pending, Stripe paid, partial, issue, and owed states. |
| `MissingInfoChecklist` | Show missing booking/job-packet fields before field work. |
| `ArchiveConfirmModal` | Confirm archive/cancel actions and capture reason. |
| `CopyMessageBox` | Provide copy-ready customer messages without auto-sending. |

Example `NextStepPanel` copy:

```text
Estimate saved.
This is not booked yet.

[Create Booking From This Estimate]
[View Estimate]
[Back to Dashboard]
```

Acceptance criteria:

```text
Components exist.
Components render cleanly.
No production workflow changed yet.
Lint, tests, and build pass.
```

## Phase 2 - Estimate -> Booking Guided Flow

Status: true beta blocker.

Current bad flow:

```text
Create estimate
-> Dashboard
-> manually create booking
-> go to Bookings
-> finish booking
```

Target V1 flow:

```text
Create estimate
-> Estimate saved
-> Create Booking From This Estimate
-> booking form prefilled
-> owner confirms date/time
-> booking created
```

After estimate save, show:

```text
Estimate saved.
This is not booked yet.

[Create Booking From This Estimate]
[View Estimate]
[Back to Dashboard]
```

Booking form should prefill where available:

```text
customer name
customer phone
customer email
service address
service type
estimate price
notes
add-ons
estimateId/reference
```

Rules:

```text
Estimate saved does not mean booked.
Booking is not auto-created.
Owner must confirm date/time.
```

Acceptance criteria:

```text
Estimate can become booking without dashboard bounce.
Booking appears in Bookings.
Booking appears in Calendar.
Estimate data carries over.
Data survives refresh/logout/login.
```

## Phase 3 - Booking -> Payment Guided Flow

Status: true beta blocker.

Goal: after a booking is created, guide the owner to a payment action without changing payment truth.

After booking save, show:

```text
Booking created.
This is not paid yet.

[Generate Payment Link]
[Record Manual Payment]
[Open Booking]
[Open Calendar]
```

If payment link is generated, show:

```text
Payment link created.
Customer is not marked paid until Stripe confirms payment.

[Email Customer]
[Copy Payment Link]
[View Booking]
```

V1 communication rule:

```text
Use Email Customer and Copy Payment Link if safe.
Hide Text Customer or show it only as Coming later.
```

Payment rules:

```text
Booking created does not mean paid.
Payment link created does not mean paid.
Paid means Stripe confirmed it or owner manually marked it.
Manual payment recorded does not equal Stripe confirmed.
```

Acceptance criteria:

```text
Owner can go from booking to payment link/manual payment naturally.
No fake paid state.
No fake success screen.
Manual payment and Stripe payment remain clearly separate.
```

## Phase 4 - Safe Archive / Cancel / Delete Controls

Status: true beta blocker.

Goal: let owner/admin clean up test records, duplicates, mistakes, and cancellations without destroying important history.

Default rule:

```text
Archive by default.
Hard delete almost never.
Money records are corrected, not erased.
```

Customer rules:

```text
Use Archive Customer.
Hide archived customers from normal lists.
Do not hard-delete customers with bookings, estimates, payments, or job history.
Restore can wait if not quick.
```

Estimate rules:

```text
Use Archive Estimate.
Draft estimate can be archived/removed from normal lists.
Sent estimate should archive with reason.
Estimate tied to booking should not hard-delete.
```

Booking rules:

```text
Use Cancel Booking and Archive Booking.
Scheduled booking can be cancelled/archived.
Completed booking should archive only.
Paid booking should never hard-delete.
Payment history stays preserved.
```

Suggested fields:

```ts
isArchived
archivedAt
archivedByUid
archiveReason
archiveType

cancelledAt
cancelledByUid
cancelReason
```

Confirmation copy:

```text
Archive this booking?

This will remove it from normal booking lists and calendar views.
It will not delete payment history.

Reason:
[Test record / Duplicate / Customer cancelled / Other]

[Archive Booking] [Cancel]
```

Acceptance criteria:

```text
Owner can clean up mistakes.
Archived records disappear from normal active lists.
Cancelled bookings do not appear as active calendar jobs.
Payment records are preserved.
Tenant isolation is preserved.
```

## Phase 5 - Smart Empty States

Status: beta blocker / quick smoother.

Goal: no main page should feel like a dead end.

Add smart empty states to:

```text
Customers
Estimates
Bookings
Calendar
Payments/payment section
Field Mode
GrowthAI
```

Examples:

```text
No bookings yet.
Bookings are scheduled jobs. Create one from an accepted estimate.

[Create Estimate]
```

```text
No scheduled jobs on the calendar yet.
Create a booking with a date and time to see it here.

[Create Booking]
```

```text
No customers yet.
Start by adding a lead or customer, then create an estimate.

[Add Customer]
```

Acceptance criteria:

```text
Each empty page explains what belongs there.
Each empty page gives the next useful action.
No empty state sends the user to the wrong flow.
```

## Phase 6 - Status-Based Action Buttons

Status: beta blocker / workflow smoother.

Goal: cards should show the next action based on status.

Estimate actions:

```text
Draft -> Finish Estimate
Saved -> Create Booking
Sent -> Follow Up / Mark Accepted
Accepted -> Create Booking
Booked -> View Booking
Lost -> Reopen / Archive
```

Booking actions:

```text
Scheduled -> Generate Payment Link / Record Manual Payment
Payment pending -> Copy Payment Link / Email Customer
Manual payment recorded -> View Payment Details
Stripe paid -> Open Calendar / Field Mode
Completed -> Record Final Payment / Request Review later
Cancelled -> View / Archive
```

Acceptance criteria:

```text
Owner does not have to guess where to go next.
Wrong actions do not show for wrong statuses.
Payment actions stay honest.
```

## Phase 7 - Save & Continue Buttons

Status: strong beta smoother.

Goal: reduce page-hopping by giving better save actions.

Add where useful:

```text
Save Estimate
Save & Create Booking

Save Booking
Save & Generate Payment Link

Save Payment Details
Save & View Booking
```

Rule:

```text
Do not remove the normal save button if it is still useful.
No accidental auto-booking.
No accidental auto-payment.
```

Acceptance criteria:

```text
Owner can continue the workflow naturally after saving.
Normal save remains available where useful.
No accidental auto-booking.
No accidental auto-payment.
```

## Phase 8 - Copy-Ready Customer Messages

Status: strong beta smoother.

Goal: give the owner ready-to-copy text after major actions. Use static templates only.

Example messages:

```text
Hi Sarah! Your cleaning estimate is ready. The total is $140 for a standard clean. Let me know if you'd like to book a time.
```

```text
Hi Sarah! You're booked for Tuesday at 10:00 AM. The address I have is 123 Maple Street.
```

```text
Hi Sarah! Here is your payment link for your upcoming cleaning: [link]
```

```text
Hi Sarah! Just checking in to see if you had any questions about your cleaning estimate.
```

```text
Thank you for choosing Aunt B's Cleaning Services! If you were happy with your clean, a review would mean a lot.
```

Acceptance criteria:

```text
Copy button works.
Message uses customer/job data when available.
No auto-send unless the email flow is already safe.
Text/SMS is not shown as active if not implemented.
```

## Phase 9 - Dashboard Needs-Attention Section

Status: strong beta smoother.

Goal: dashboard becomes the owner's daily command center.

Candidate sections:

```text
Today's jobs
New leads / quote requests
Estimates needing follow-up
Bookings missing payment
Bookings missing date/time/address
Payment issues
Recently worked on
```

Keep it simple:

```text
No analytics engine.
No charts required.
Items should link to related customer/estimate/booking when possible.
Archived/cancelled items are not active work.
```

Acceptance criteria:

```text
Owner can open dashboard and know what needs attention today.
Each item links to the related customer/estimate/booking when possible.
Archived/cancelled items are not treated as active work.
```

## Phase 10 - Missing Info / Job Packet Ready

Status: strong beta smoother, important for Field Mode.

Goal: before a cleaner goes to a job, ServicesOS should show whether the job packet is ready.

Job packet includes:

```text
customer name
customer phone
address
service type
scheduled date/time
job notes
checklist if available
safety instructions if available
payment status
```

Statuses:

```text
Ready for field
Missing info
Needs owner review
```

Warning example:

```text
This booking is missing:
- Service address
- Scheduled time
- Field instructions

[Add Address]
[Set Time]
[Add Job Notes]
```

Acceptance criteria:

```text
Owner can see what is missing before the job.
Field Mode has enough information for the cleaner.
No job appears ready if critical fields are missing.
```

## Phase 11 - Recently Worked On

Status: nice beta smoother.

Goal: help owner recover from interruptions.

V1 version:

```text
Recently worked on:
- Sarah Johnson estimate
- Maple Street booking
- Jones move-out clean
```

Implementation note:

```text
This can be local/recent navigation based if needed.
Do not build a full activity tracking system unless it is already easy.
No cross-tenant leakage.
```

Acceptance criteria:

```text
Recently opened or edited records are easy to return to.
No cross-tenant leakage.
```

## Phase 12 - Bad-Fit / Safety Review Flag

Status: useful beta smoother, safety-related.

Goal: give owner/admin a simple way to mark a customer or job as needing review.

V1 statuses:

```text
Good fit
Needs review
Do not service
```

Rules:

```text
Human decides.
System records.
No automatic rejection.
Field workers see practical instructions, not sensitive private details.
Do not service blocks or warns before booking/assignment.
```

Where it appears:

```text
Customer detail
Booking detail
Job packet / Field Mode safety instructions
```

Acceptance criteria:

```text
Owner can mark a customer/job as needs review.
Field worker sees practical instructions, not sensitive private details.
Do not service blocks or warns before booking/assignment.
```

## Phase 13 - Follow-Up Reminders

Status: can be light before beta / not hard blocker.

Goal: prevent estimates from being forgotten.

V1 version:

```text
Estimate sent 3 days ago.
Follow up?

[Copy Follow-Up Message]
[Mark Lost]
[Create Booking]
```

Do not build:

```text
No automated email sequence.
No CRM campaign engine.
No SMS.
No AI.
```

Acceptance criteria:

```text
Owner can see old estimates needing follow-up.
Owner can copy a message or take next action.
```

## Phase 14 - Recurring Job Suggestion

Status: can wait unless very quick.

Goal: help Aunt B's build repeat revenue.

V1 version after completed residential job:

```text
Would you like to set this customer as recurring?

[Every 2 weeks]
[Monthly]
[Not now]
```

If recurring engine is not ready:

```text
Mark as recurring interest
```

Acceptance criteria:

```text
Owner can record recurring interest or simple recurrence if supported.
No fake recurring automation if it does not actually schedule future jobs.
```

## Phase 15 - Customer Timeline

Status: useful, but can wait if needed.

Goal: show what happened with a customer.

MVP timeline:

```text
Lead created
Estimate created
Estimate sent
Booking created
Payment link sent
Payment received
Job completed
Review requested
```

Implementation note:

```text
Read from existing timestamps/status fields only.
Do not build a full event system unless already easy.
Timeline does not invent events.
```

Acceptance criteria:

```text
Owner can open customer and understand history.
Timeline does not invent events.
```

## Final Phase - Wife Beta Retest

Status: required before broader beta.

Required pass:

```text
Customer/lead created
Estimate created
Booking created from estimate
Booking appears in Bookings
Booking appears in Calendar
Payment link/manual payment flow is clear
Archived/test records can be cleaned up
Dashboard shows what needs attention
Job packet readiness is understandable
Mobile flow is usable
Data survives refresh/logout/login
```

Beta pass decision:

```text
Can Aunt B's run the business through ServicesOS without Jamie explaining every step?
```

Target:

```text
Wife confidence score: 4/5
```

## Recommended Build Order

Use this exact order:

```text
0. Repo safety check
1. Shared workflow components
2. Estimate -> Booking guided flow
3. Booking -> Payment guided flow
4. Safe archive/cancel controls
5. Smart empty states
6. Status-based action buttons
7. Save & continue buttons
8. Copy-ready customer messages
9. Dashboard needs-attention
10. Missing info / job packet ready
11. Recently worked on
12. Bad-fit / safety review flag
13. Follow-up reminders
14. Recurring job suggestion
15. Customer timeline
16. Wife beta retest
```

## Beta Blocker Minimum

Require before broader beta:

```text
Estimate -> Booking guided flow
Booking -> Payment guided flow
Safe archive/cancel controls
Smart empty states
Status-based action buttons
Honest payment badges
Missing-info warnings
```

Strongly preferred before beta:

```text
Save & continue buttons
Copy-ready messages
Dashboard needs-attention
Job packet ready
Bad-fit / safety review flag
```

Can wait if needed:

```text
Recently worked on
Follow-up reminders
Recurring job suggestion
Customer timeline
Restore archived records
```

## How To Use This Plan

For each implementation session:

1. Pick exactly one phase.
2. Run the Phase 0 safety check first.
3. Restate the phase's hard boundaries.
4. Implement the smallest V1 version.
5. Add focused tests for that phase.
6. Run:

```powershell
npm run lint
npm run test -- --run
npm run build
```

7. Do not commit unless all validation is green.

