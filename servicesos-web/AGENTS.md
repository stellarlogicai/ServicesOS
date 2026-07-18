# ServicesOS Web Instructions

These instructions apply to `servicesos-web/**` and supplement the repository root `AGENTS.md`.

## Role-sensitive rendering

Preserve the approved role boundaries.

### Tenant admin / owner-operator

- May operate Field Mode without an employee assignment for own-tenant bookings.
- May see approved admin-only context such as honest payment state and private owner notes where the existing contract allows it.
- Must not gain cross-tenant access.

### Employee

- May see only assigned active jobs through canonical `assignedEmployeeAuthUid` rules.
- Must not see private owner/admin notes, price, payment state, Stripe data, Data Export, or admin controls.
- Reassignment must remove former-employee access.

### Customer

- May access only the Customer Portal and their own proven tenant/customer/request data.
- Must not access Field Mode, employee execution notes, issue reports, internal payment details, assignment controls, exports, or field-photo evidence.
- Never authorize through name, phone, email similarity, record order, or other approximate matching.

### Super-admin

- Must select an explicit tenant.
- Do not restore `DEFAULT`, first-tenant, or stale selected-tenant fallbacks.
- Tenant switching must clear tenant-scoped state.

## Field Mode invariants

Field Mode changes must not mutate unrelated:

- payment or Stripe fields
- agreed price
- customer identity
- schedule
- lead reference
- assignment
- tenant ownership

Before/after photo uploads and checklist saves must report success only after the required persistence completes.

Booking Detail remains read-only for field evidence unless a task explicitly approves a review action. Do not add upload, replace, edit, or delete controls there by accident.

## Customer Portal invariants

- A quote request is not a confirmed booking.
- A booking is not a payment.
- Payment-link creation is not payment confirmation.
- Missing or conflicting customer identity must block portal ownership rather than fall back to email-only matching.
- Non-portal customers may remain valid business records without Auth accounts.

## UI and accessibility

- Optimize field workflows for mobile first, with large touch targets and no nested-scroll traps.
- Prefer one cohesive workflow over stacked cards and patched modal sections.
- Consolidate duplicate statuses.
- Keep the primary action clear by execution state.
- Preserve keyboard, focus, loading, error, and retry behavior.
- Do not show success before Firestore, Storage, or the approved backend confirms it.

## Testing

Add focused tests for changed role behavior, persistence, tenant switching, error handling, and mobile workflow logic.

When changing Field Mode or Customer Portal, verify the relevant negative cases as carefully as the successful path.