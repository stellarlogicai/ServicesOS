# ServicesOS V1 Production Smoke Checklist

Use controlled test records only. Do not use real customer data for destructive or
write-heavy checks. Each item must be marked **Pass**, **Fail - rollback/blocker**, or
**Not run** with UTC, operator, role, and sanitized evidence.

Any cross-tenant access, false payment state, or unauthorized photo/job access is an
immediate rollback trigger.

## Smoke Record

| Field | Value |
| --- | --- |
| Production URL | `https://servicesos.netlify.app` |
| Firebase project | `cleaning-intake-system` |
| Release commit |  |
| Netlify deploy ID |  |
| Firestore rules release |  |
| Storage rules release |  |
| Assignment index state |  |
| Firestore backup path | private record |
| Storage backup run | private record |
| Start/end UTC |  |
| Operator / Jamie approval |  |

## 1. Preflight

| Check | Result | Evidence/notes |
| --- | --- | --- |
| Published deploy is exact approved commit |  |  |
| Firebase project is `cleaning-intake-system` |  |  |
| Emulator flags absent/false in production |  |  |
| Assignment index is `READY` |  |  |
| Prior Netlify deploy and rules captures are available |  |  |
| Backups completed and verified |  |  |
| Browser console/network opened for errors |  |  |
| Controlled records/personas identified privately |  |  |

## 2. Normal Admin

| Step | Expected | Result | Notes |
| --- | --- | --- | --- |
| Sign in | tenant admin reaches Dashboard without console errors |  |  |
| Dashboard | pending requests, upcoming jobs, expected/collected/outstanding values are honest |  |  |
| Customers | only own-tenant active customers load |  |  |
| Controlled request | request is visible for owner review |  |  |
| Booking conversion | one controlled request creates one scheduled booking |  |  |
| Payment truth after conversion | booking is not marked paid; collected revenue does not increase |  |  |
| Refresh | request/booking survives refresh |  |  |
| Calendar | new booking is visible; Calendar has no write/payment controls |  |  |
| Booking Detail | schedule, customer snapshot, payment state, and field review load |  |  |
| Assignment | only active same-tenant employees are selectable |  |  |
| Assign/reassign | canonical assignment persists; no payment/price/customer/schedule mutation |  |  |
| Business Settings | allowlisted business field saves and survives refresh |  |  |
| Stripe status | status is read-only and matches tenant data; no false Connected state |  |  |
| Stripe setup action | Connect/Resume appears only when supported; do not create checkout during this smoke unless separately approved |  |  |
| Data Export | customers/leads/bookings/payments download for current tenant only |  |  |
| CSV inspection | no other tenant, secrets, or false Stripe confirmation |  |  |
| Owner Field Mode | assigned and unassigned own-tenant active jobs are visible as designed |  |  |
| Owner field write | controlled checklist/note/photo persists without changing payment |  |  |
| Photo review | Booking Detail shows persisted evidence read-only |  |  |

## 3. Employee

| Step | Expected | Result | Notes |
| --- | --- | --- | --- |
| Sign in | lands in Field Mode; no owner/admin navigation |  |  |
| Visibility | only exact-UID assigned active jobs appear |  |  |
| Unassigned job | not visible |  |  |
| Cancelled job | not visible |  |  |
| Other employee job | not visible |  |  |
| Other tenant job | not visible |  |  |
| Legacy-ID-only booking | not visible |  |  |
| Job packet privacy | payment badge/internal owner notes/admin controls are hidden |  |  |
| Start Job | field status/timestamp persists after refresh |  |  |
| Checklist | allowed checklist data persists after refresh |  |  |
| Notes/issues | employee notes and issue flag persist honestly |  |  |
| Invalid field write | payment/price/schedule/customer mutation is denied |  |  |
| Before photo | supported image under 10 MB uploads and reloads |  |  |
| After photo | supported image under 10 MB uploads and reloads |  |  |
| Invalid photo | unsupported MIME and over-10-MB file are rejected |  |  |
| Complete job | completion persists; booking/payment status remains independent |  |  |
| Reassignment | job disappears after reassignment to another employee |  |  |
| Revoked photo access | prior employee can no longer read assigned-only evidence |  |  |

## 4. Customer

| Step | Expected | Result | Notes |
| --- | --- | --- | --- |
| Sign in | only Customer Portal is available |  |  |
| Linked profile | linked customer record resolves by exact `authUid` |  |  |
| Own requests | only own customer-portal requests load |  |  |
| Submit request | controlled quote request persists |  |  |
| Request truth | copy states it is not a confirmed booking |  |  |
| No automatic booking | booking count does not increase from request submission |  |  |
| No automatic payment | no payment/session/paid state is created |  |  |
| Photo denial | booking field-photo metadata/object access is denied |  |  |
| Admin/export/Field Mode denial | navigation and direct access remain denied |  |  |
| Cross-customer request | another customer's request is not readable |  |  |

## 5. Super-Admin

| Step | Expected | Result | Notes |
| --- | --- | --- | --- |
| Sign in/no selection | tenant-scoped pages say `Select a tenant to view this area.` |  |  |
| Select controlled Tenant A | Tenant A data loads |  |  |
| Open Bookings/Calendar/Field Mode | all use selected Tenant A |  |  |
| Switch to controlled Tenant B | Tenant A data clears before Tenant B data appears |  |  |
| Late response/state | no stale Tenant A content returns |  |  |
| CSV | selected Tenant B only |  |  |
| Clear selection | tenant-scoped pages return to selection-required state |  |  |
| Refresh | selection is not persisted; explicit reselection required |  |  |
| `DEFAULT` | never used as tenant fallback |  |  |

## 6. Direct Cross-Tenant Denial

Use controlled Tenant A/Tenant B records and browser SDK/network tools without changing
real records.

| Check | Expected | Result | Notes |
| --- | --- | --- | --- |
| Tenant A admin reads Tenant B booking/customer/lead | denied |  |  |
| Tenant A admin writes Tenant B booking/customer | denied |  |  |
| Tenant A employee reads/writes Tenant B booking | denied |  |  |
| Tenant A employee reads/uploads Tenant B photo | denied |  |  |
| Customer reads admin booking/photo/payment path | denied |  |  |
| Unauthenticated reads tenant data/object | denied |  |  |
| Export after tenant switch | no mixed rows |  |  |

Any unexpected allow is **Fail - immediate rollback**.

## 7. Payment Truth

| Check | Expected | Result | Notes |
| --- | --- | --- | --- |
| Quote request | does not create booking/payment |  |  |
| Booking creation | does not mark paid |  |  |
| Payment link creation, if separately approved | link-created/pending only, never paid |  |  |
| Manual payment | clearly owner-recorded and uses allowed method/date/amount |  |  |
| Stripe-confirmed record | paid only when existing webhook-confirmed fields say so |  |  |
| Assignment | no payment/Stripe field changes |  |  |
| Field start/checklist/completion | no payment/Stripe field changes |  |  |
| Photo upload | no payment/Stripe/parent booking truth changes |  |  |
| Business Settings | cannot edit Stripe readiness fields |  |  |
| CSV | manual and Stripe-confirmed states remain distinct |  |  |

Do not run a real/live payment merely to complete this promotion smoke. A Stripe test-mode
checkout/webhook smoke requires separate approval and environment confirmation.

## 8. Storage And Branding

| Check | Expected | Result | Notes |
| --- | --- | --- | --- |
| Production-origin `getBlob()` | supported photo loads without CORS failure |  |  |
| Allowed local origin, if retained | behavior matches captured CORS |  |  |
| JPEG/PNG/WebP | accepted within 10 MB on field-photo path |  |  |
| SVG/executable/invalid extension | denied |  |  |
| Owner/admin review | allowed for same tenant |  |  |
| Branding read/upload | only approved super-admin flow and supported MIME/size |  |  |
| Public URL/access | object is not publicly readable |  |  |
| Legacy/DEFAULT/global path | denied or handled by approved migration/compatibility plan |  |  |

## 9. Sign-Out And Refresh

| Check | Expected | Result | Notes |
| --- | --- | --- | --- |
| Each persona signs out | session clears without crash |  |  |
| Back navigation after sign-out | protected content does not reappear |  |  |
| Admin refresh | tenant context remains correct |  |  |
| Employee refresh | assignment-scoped jobs only |  |  |
| Customer refresh | own requests only |  |  |
| Super-admin refresh | tenant selection cleared |  |  |

## 10. Release Decision

- [ ] All required checks passed.
- [ ] No required check is `Not run` without Jamie's written waiver.
- [ ] No rollback trigger occurred.
- [ ] Browser console/network errors are understood and non-safety-impacting.
- [ ] All controlled writes and IDs are recorded privately for cleanup/reconciliation.
- [ ] Netlify, rules, index, and backup references are complete.
- [ ] Jamie approved V1 as customer-ready.

Decision: **Pass / Fail - rollback / Blocked - additional verification required**

Approver and UTC:

## 11. Immediate Rollback Triggers

Stop and follow `SERVICESOS_V1_ROLLBACK_RUNBOOK.md` for:

- cross-tenant allow;
- customer photo/admin access;
- employee unauthorized job access;
- false paid/collected state;
- broad permission denial on core owner/customer flows;
- unsupported active Storage paths becoming inaccessible;
- wrong release commit/project/environment;
- photo/object public access;
- unresolved assignment index failure.
