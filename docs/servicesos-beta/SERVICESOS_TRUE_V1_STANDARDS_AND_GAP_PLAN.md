# ServicesOS True V1 Standards and Gap Plan

## Current baseline

- Branch: `v1-lab-customer-ready-plan`
- Commit: `031bb46 Polish beta workflow empty states and booking actions`
- Working tree before this planning doc: clean
- Smoke-test candidate status: `master` remains frozen at `031bb46` and is ready for the July 20 live manual smoke test based on the final audit. This document is post-smoke planning only.

## V1 definition

ServicesOS V1 means Aunt B's Cleaning Services can run real cleaning jobs through ServicesOS without Jamie manually holding the app together.

V1 must prove:

1. Real customers and leads can be captured and reviewed.
2. Estimates can become bookings without confusion.
3. Bookings can be scheduled, edited, cancelled, and viewed.
4. Payments are honest.
5. Field work can be executed from a phone.
6. Owner/admin can review completed work and clean up mistakes.
7. Data persists, stays tenant-scoped, and survives refresh/login/logout.

## V1 quality bar

- No fake success states.
- No fake paid states.
- No broken visible pages.
- No tenant leakage.
- No confusing payment status.
- No required workflow trapped in local-only state.
- No live beta user seeing unfinished future modules.

## Audit matrix

### 1. Field job execution

| Capability | Status | Existing files/components/services | Tests found | Gap | Smallest safe V1 fix | Suggested phase | Can wait until V1.5? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Assigned jobs | Partial | `servicesos-web/src/components/BookingsList.jsx`, `servicesos-web/src/components/FieldMode.jsx`, booking display helpers | `BookingsList.test.jsx`, `FieldMode.test.jsx` | Field Mode reads tenant bookings but does not provide a reliable assignment workflow or employee-specific job queue. | Add optional `assignedToName`/`assignedToId` display and owner-managed assignment only if existing booking schema supports it. Keep employee auth out of V1 unless already stable. | Field job execution MVP | No |
| Opening job packet | Implemented | `FieldMode.jsx` | `FieldMode.test.jsx` | Job packet opens and handles missing phone/address safely. | Keep as baseline. | Field job execution MVP | No |
| Starting job | Missing | None visible in Field Mode | `FieldMode.test.jsx` asserts no `Arrived`, `In Progress`, or write controls | Field worker cannot mark arrival/start. | Add a small tenant-scoped booking status transition such as `fieldStatus: started`, separate from payment truth. | Field job execution MVP | No |
| Checklist completion | Missing | Checklist-related services exist elsewhere, but not mounted in Field Mode job packet | Field Mode tests assert no completion controls | No worker-executable checklist in the job packet. | Add a minimal static checklist snapshot on booking and a completion write path scoped to the booking. | Field job execution MVP | No |
| Before photos | Missing | `photoService` exists, but no Field Mode before-photo UI | No Field Mode photo tests | No phone-first upload path for job evidence. | Add optional before-photo upload slots tied to `tenants/{tenantId}/bookings/{bookingId}` or a tenant-scoped booking subcollection. | Field job execution MVP | No |
| Employee notes/issues | Missing | Booking notes exist for owner/admin, Field Mode is read-only | Field Mode tests assert no write controls | Worker cannot report issues from job packet. | Add one `fieldNotes`/`fieldIssue` submit area with clear "not sent to customer" copy. | Field job execution MVP | No |
| After photos | Missing | `photoService` exists, but no Field Mode after-photo UI | No Field Mode photo tests | No completion photo evidence. | Add optional after-photo upload slots tied to the same booking evidence model. | Field job execution MVP | No |
| Marking job complete | Missing | Booking admin status allows `completed`, but Field Mode does not write completion | `bookingAdminUpdatePatch.test.js` covers allowed booking statuses; Field Mode tests assert no complete control | Field user cannot complete a job from phone. | Add field completion action that writes completion fields only after required checklist/evidence rules pass. | Field job execution MVP | No |
| Owner/admin seeing completion state | Partial | `BookingsList.jsx` can show status labels; no field-completion review UI | Booking tests cover status labels and detail view | Completed evidence, notes, photos, timestamp are not grouped for owner review. | Add a read-only completion summary to Booking Detail. | Owner/admin completed job review | No |

### 2. Owner/admin completed job review

| Area | Status | Existing files/components/services | Tests found | Gap | Smallest safe V1 fix | Suggested phase | Can wait until V1.5? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Completed job status | Partial | `BookingsList.jsx`, `bookingDisplay.js`, `schedulingService.js` | `BookingsList.test.jsx`, `bookingAdminUpdatePatch.test.js` | Status can exist, but no focused completed-job review panel. | Add a completion summary panel in Booking Detail when status/completion fields exist. | Owner/admin completed job review | No |
| Checklist results | Missing | Checklist services/templates exist outside current mounted Field Mode | No owner review tests | No persisted checklist result displayed in Bookings. | Store checklist result snapshot on booking completion and show it read-only. | Owner/admin completed job review | No |
| Before/after photos | Missing | `photoService` exists | No booking completion photo tests | No before/after photo review in Booking Detail. | Add read-only photo evidence section after Field Mode upload MVP. | Owner/admin completed job review | No |
| Employee notes | Missing | Owner notes exist; employee notes do not appear distinct | No tests | No separate field-worker note history. | Add `fieldNotes` display with timestamp/author snapshot. | Owner/admin completed job review | No |
| Issue reports | Missing | None in mounted V1 flow | No tests | No way to flag damage/access/missing supplies/etc. | Add a small issue flag/comment model on booking completion. | Owner/admin completed job review | No |
| Completion timestamp | Missing | Payment timestamps exist; completion timestamp not visible in mounted flow | No tests | Owner cannot confirm when job was completed. | Add `completedAt` and show it in Booking Detail. | Owner/admin completed job review | No |

### 3. Customer/job cleanup controls

| Area | Status | Existing files/components/services | Tests found | Gap | Smallest safe V1 fix | Suggested phase | Can wait until V1.5? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Cancel bookings | Implemented | `BookingsList.jsx`, `schedulingService.js` | Status whitelist tests; booking UI tests nearby | Owner/admin can cancel through `updateBookingAdminFields` with `status: cancelled`; copy says payment history is preserved. | Add a focused cancel-booking UI test if not already present. | Safe archive/cleanup controls | No |
| Archive customers | Missing/Risky | `CustomerManagement.jsx`, `customerService.js` | `customerServiceSafetyGate.test.js`, `CustomerManagementSafetyGate.test.jsx` | Customer delete exists but V1 needs archive/hide, not hard delete. | Add `archived: true`, hide archived by default, preserve linked records and portal metadata. | Safe archive/cleanup controls | No |
| Archive leads/estimates | Missing/Risky | `Dashboard.jsx`, `crmService.js`, `leadService.js`, `estimateService.js` | Dashboard tests cover conversion and lead actions | Lead and estimate delete paths exist; paid/booked/completed records should not be hard deleted in V1. | Add archive status for leads/estimates and hide archived by default. | Safe archive/cleanup controls | No |
| Hide archived records | Partial | Customer request cards filter `requestStatus !== archived` | CustomerManagement tests | Only customer portal quote requests have clear archive filtering. | Standardize archive filters across customers, leads, estimates, and bookings where applicable. | Safe archive/cleanup controls | No |
| Preserve payments/history | Partial | Booking cancel preserves status/payment fields by patching only booking status | Booking update whitelist tests | Leads/customers/estimates do not yet have a uniform history-preserving archive policy. | Use archive fields rather than delete for records with booking/payment relationships. | Safe archive/cleanup controls | No |
| Avoid hard deleting paid/completed records | Partial/Risky | Delete functions exist in multiple core services | Safety gate tests exist for customers; booking admin tests reject delete fields | Some delete APIs remain available even if not visible in the wife-beta path. | Keep delete hidden; add archive-first service wrappers and tests for V1 surfaces. | Safe archive/cleanup controls | No |

### 4. Copy-ready customer messages

| Message type | Status | Existing files/components/services | Tests found | Gap | Smallest safe V1 fix | Suggested phase | Can wait until V1.5? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Estimate ready | Missing | Estimate creation exists; GrowthAI has local templates but is super-admin/internal | `CreateEstimateBeta.test.jsx` | No owner/admin copy-only template in the approved workflow. | Add a copy-only message box/button after estimate creation or in lead detail. | Copy-ready customer messages | No |
| Booking confirmation | Missing/Partial | GrowthAI local templates include booking response drafts; not owner V1 workflow | GrowthAI tests | No owner/admin booking confirmation copy button in Bookings. | Add copy-only booking confirmation message in Booking Detail. | Copy-ready customer messages | No |
| Payment link | Implemented | `BookingsList.jsx` | Payment link copy tests; copy-message implementation present | Copy message exists and says copied, not sent; targeted copy-message test should be added. | Add focused test for `Copy message` button and fallback name behavior. | Copy-ready customer messages | No |
| Follow-up | Missing/Partial | GrowthAI local response templates, not mounted for normal admin | GrowthAI tests | No copy-only follow-up in owner V1 flow. | Add simple copy-only follow-up template in Dashboard/Bookings. | Copy-ready customer messages | Yes |
| Review request | Missing/Partial | GrowthAI local response templates; review service exists but not V1 owner copy flow | GrowthAI tests | No owner-safe copy-only review request after completed job. | Add copy-only review request in completed-job review after completion MVP. | Copy-ready customer messages | Yes |

### 5. Payment live-readiness

| Area | Status | Existing files/components/services | Tests found | Gap | Smallest safe V1 fix | Suggested phase | Can wait until V1.5? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Stripe payment link creation path | Implemented | `BookingsList.jsx`, `stripeService.js`, `cloud-functions/bookingStripe.js` | `BookingsList.test.jsx`, `stripeServiceBookingCheckout.test.js`, `cloud-functions/test/bookingStripe.test.js` | Live behavior depends on deployed env, Connect readiness, and webhook setup. | Run deployed test-mode E2E after July 20 freeze; document env checklist. | Payment live verification/hardening | No |
| Stripe return/result screen | Implemented | `App.jsx`, `stripeCheckoutResult.js` | `AppOnboardingRouter.test.jsx` | Return screen is honest but should not be mistaken for owner-side paid confirmation. | Keep copy as-is; owner verification remains Booking Detail after webhook. | Payment live verification/hardening | No |
| Webhook paid confirmation | Implemented in code/tests | `cloud-functions/index.js`, `cloud-functions/bookingStripe.js` | `bookingStripe.test.js` | Needs deployed webhook delivery verification in production/test env. | Run and document Stripe test event delivery and booking update. | Payment live verification/hardening | No |
| Manual payment honesty | Implemented | `BookingsList.jsx`, `schedulingService.js`, `bookingDisplay.js` | `BookingsList.test.jsx`, `bookingAdminUpdatePatch.test.js` | Manual paid statuses are owner-entered; copy is reasonably clear. | Keep manual payment separate from Stripe confirmation. | Payment live verification/hardening | No |
| Cancelled booking payment preservation | Implemented | `BookingsList.jsx` | Booking status whitelist tests; UI evidence | Cancel patches only status and copy states payment history preserved. | Add focused test for cancel preserving payment fields in UI call. | Safe archive/cleanup controls | No |
| No fake paid states | Implemented | Removed `PaymentForm.jsx`/`PaymentLinks.jsx`; booking-scoped payment path | `paymentUiSafetyStatic.test.js`, `bookingStripe.test.js` | Legacy services remain in repo but hidden. | Keep old payment UI removed; do not expose payment modules. | Payment live verification/hardening | No |

### 6. Business settings readiness

| Area | Status | Existing files/components/services | Tests found | Gap | Smallest safe V1 fix | Suggested phase | Can wait until V1.5? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Business name | Implemented | `BusinessSettings.jsx`, `businessSettingsService.js` | `BusinessSettings.test.jsx`, `businessSettingsService.test.js` | Editable and saved under tenant business settings. | Keep. | Business settings readiness | No |
| Business phone/email | Implemented | `BusinessSettings.jsx`, `businessSettingsService.js` | Business settings tests | Editable and sanitized. | Keep. | Business settings readiness | No |
| Service area | Implemented | `BusinessSettings.jsx`, `businessSettingsService.js` | Business settings tests | Editable and sanitized. | Keep. | Business settings readiness | No |
| Basic business details | Partial | Business settings fields and availability days | Business settings tests | Minimal but useful; does not include deeper service catalog/pricing. | Keep V1 minimal. Add only fields needed by customer-facing copy. | Business settings readiness | Yes |
| Stripe status | Implemented/Partial | `StripeConnectOnboarding.jsx`, `stripeService.js` | `BusinessSettings.test.jsx` | Shows readiness and setup errors; live readiness requires Stripe environment. | Keep setup panel; add operator checklist for test/live mode. | Payment live verification/hardening | No |
| Owner/admin profile sanity | Missing | Auth/user profile exists but no owner profile settings surface | Auth/router tests | Normal admin cannot verify display name/contact/profile from settings. | Add read-only current admin email/role/tenant info, plus minimal editable display name only if existing auth profile supports it. | Business settings readiness | Yes |

### 7. CSV export / backup basics

| Area | Status | Existing files/components/services | Tests found | Gap | Smallest safe V1 fix | Suggested phase | Can wait until V1.5? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Customers export | Missing for normal admin | `DataExport.jsx` is super-admin-only and broad | App router tests show data export hidden from normal admin | No owner/admin safe customer export. Existing Data Export includes deferred/import/payroll/accounting surfaces. | Create a new narrow owner-safe export utility or hidden lab skeleton for CSV downloads from approved collections only. | CSV export / backup basics | Yes, but recommended for V1 |
| Leads/quote requests export | Missing for normal admin | `DataExport.jsx`, `leadService.js` | Router tests | Same as above. | Add simple CSV export for active/archive-filtered leads. | CSV export / backup basics | Yes |
| Bookings export | Missing for normal admin | `DataExport.jsx`, `schedulingService.js` | Router tests | Same as above. | Add simple CSV export for bookings with payment summary columns. | CSV export / backup basics | Yes |
| Payments/manual payment records export | Missing for normal admin | Booking payment fields exist; old payment reporting services are deferred | Payment tests | No owner-safe payment export separate from broad payment/reporting modules. | Export booking payment columns from bookings, not a new accounting system. | CSV export / backup basics | Yes |
| Backup basics | Partial/Risky | `DataExport.jsx`, backup services exist but hidden/deferred | Router tests | Existing export/backup surfaces are too broad for wife beta. | Keep hidden; build a narrow backup/export MVP only after V1 core workflow. | CSV export / backup basics | Yes |

### 8. Customer intake guardrails

| Area | Status | Existing files/components/services | Tests found | Gap | Smallest safe V1 fix | Suggested phase | Can wait until V1.5? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Tenant-specific quote/request flow | Implemented/Partial | `CustomerPortal.jsx`, `customerPortalQuoteRequestService.js`, payload builder/mapper | Customer portal and quote request tests | Tenant ID and linked customer are required for saved quote requests. Needs live invite/linking flow later. | Keep current guardrails; document manual setup until invite/linking MVP. | Customer intake guardrails | No |
| No orphan customer accounts | Partial | Customer portal identity resolution requires linked customer for saved quote requests | Identity and portal tests | Real customer invite/linking flow is still manual/not V1 complete. | Add real owner-created customer invite/linking flow after field execution and cleanup. | Customer intake guardrails | No |
| No fake success without business/tenant | Implemented/Partial | Customer portal guard messages and service validations | Customer portal tests | Guard copy exists; live permission-noise should be watched. | Keep tenant/customer guards; add manual regression script. | Customer intake guardrails | No |
| Owner/admin sees submitted requests | Implemented | `CustomerManagement.jsx`, `customerPortalQuoteRequestService.js`, Dashboard lead flow | CustomerManagement tests, Dashboard tests | Requests appear as leads/customer requests and can be archived/reviewed. | Keep and add V1 manual smoke doc around request-to-booking. | Customer intake guardrails | No |
| Customer portal/deferred flows hidden or safe | Implemented for normal admin | `App.jsx` roles | `AppOnboardingRouter.test.jsx` | Customer Portal is customer-only; normal admin cannot force-open deferred pages. | Keep. | Customer intake guardrails | No |

## True V1 implementation route

1. Smoke-test blocker fixes, if any
   - Only fix issues found in the July 20 live manual smoke test.
   - Do not start new V1 work until smoke-test results are written down.

2. Field job execution MVP
   - Add minimal field status: not started, started, completed.
   - Add optional required checklist snapshot for a booking.
   - Add field notes/issues.
   - Add before/after photo evidence only if storage path and permissions are already safe.
   - Keep payments out of Field Mode.

3. Owner/admin completed job review
   - Show field completion status, timestamp, checklist results, notes/issues, and photos in Booking Detail.
   - Keep review read-only except owner cleanup/correction controls.

4. Safe archive/cleanup controls
   - Convert visible destructive cleanup to archive/hide flows.
   - Preserve payment, Stripe, notes, photos, and completion history.
   - Hide archived by default, with an explicit "show archived" control.

5. Copy-ready customer messages
   - Add copy-only estimate ready, booking confirmation, follow-up, and review request messages.
   - Keep "copied" language only.
   - Do not add SMS or real email sending.

6. Payment live verification/hardening
   - Run a deployed test-mode Stripe E2E.
   - Verify link creation does not mark paid.
   - Verify webhook marks only the same booking paid.
   - Verify manual payment remains owner-entered.

7. Business settings readiness
   - Keep current business fields.
   - Add owner/admin profile sanity only if it uses existing profile data safely.
   - Keep Stripe status honest.

8. CSV export / backup basics
   - Add narrow owner-safe CSV export for customers, leads, bookings, and booking payment fields.
   - Do not expose the old broad Data Export module to normal admins.

9. Customer intake guardrails
   - Add real customer invite/linking flow only after core V1 job execution is stable.
   - Keep quote requests tenant-linked and owner-reviewed.

10. V1 final regression pass
   - Full lint/test/build.
   - Manual smoke across login, dashboard, customers, estimates, bookings, payments, calendar, Field Mode, completed job review, archive, refresh, logout/login, and mobile.

## Do not build yet

These remain parked for V1.5 or later unless Jamie explicitly reprioritizes them:

- GrowthAI expansion
- Training Library
- Expenses/mileage
- Recurring UI
- Customer timeline
- Tap to Pay
- SMS sending
- Real email sending
- AI generation
- Route optimization
- Payroll
- Inventory
- Full accounting
- Bank syncing
- OCR
- Refunds/disputes
- Autonomous posting or messaging

## Recommended next implementation phase

After the July 20 live manual smoke test, the next single phase should be:

**Field job execution MVP**

Reason: Field Mode is currently read-only and safe for the smoke test, but true V1 requires workers to execute jobs from a phone and leave owner-reviewable completion evidence. Without this, ServicesOS can schedule and view jobs, but Jamie still has to bridge real-world job completion outside the app.

Smallest safe first task:

1. Draft the booking field execution data contract.
2. Add tests for allowed field status/checklist/note/photo metadata.
3. Add a hidden/unmounted Field Mode completion prototype on the lab branch only.
4. Do not mount it for normal beta users until the data contract and tests are green.

Recommended commit message:

`Add ServicesOS true V1 standards and gap plan`
