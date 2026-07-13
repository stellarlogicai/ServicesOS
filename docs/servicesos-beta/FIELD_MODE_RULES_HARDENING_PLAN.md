# Field Mode Rules Hardening Plan

## Current rules state

Branch: `v1-lab-field-execution-mvp`

Field Mode job execution MVP writes through:

- Service: `updateBookingFieldExecution(tenantId, bookingId, ...)`
- Path: `tenants/{tenantId}/bookings/{bookingId}`

Rules files checked during the audit:

- `cloud-functions/firestore.rules`
- `shared/firestore.rules`
- `cloud-functions/firebase.json`

`cloud-functions/firebase.json` points Firestore rules at `cloud-functions/firestore.rules`, so that file appears to be the deploy source when Firebase deploys are run from `cloud-functions`.

Current `cloud-functions/firestore.rules` booking update rule:

```js
match /tenants/{tenantId}/bookings/{bookingId} {
  allow read: if isSuperAdmin() || isAuthenticated();
  allow create: if isSuperAdmin() || isAuthenticated();
  allow update: if isSuperAdmin() || isAuthenticated();
  allow delete: if isSuperAdmin() || isAuthenticated();
}
```

This is too broad for true V1 because any authenticated user could update any booking path if they know or guess the tenant and booking IDs.

`shared/firestore.rules` is stricter:

```js
match /tenants/{tenantId}/bookings/{bookingId} {
  allow read: if isSuperAdmin() || hasTenantAccess(tenantId);
  allow create: if isSuperAdmin() || isTenantAdmin(tenantId);
  allow update: if isSuperAdmin() || isTenantAdmin(tenantId);
  allow delete: if isSuperAdmin() || isTenantAdmin(tenantId);
}
```

That stricter model preserves tenant isolation for tenant admins, but it does not yet define a narrow employee-safe Field Mode update path.

## V1 decision

There are two possible Field Mode operating modes.

### Owner/admin-operated Field Mode

The owner/admin uses Field Mode from a phone and records execution status themselves.

Minimum rules requirement:

- Allow `isSuperAdmin()` or `isTenantAdmin(tenantId)` to update bookings.
- Still prefer field-level restrictions so Field Mode cannot accidentally become a payment/admin mutation surface.

### Employee-operated Field Mode

Workers use Field Mode from their own login to start jobs, save checklists, add notes/issues, and mark jobs complete.

Minimum rules requirement:

- Do not use the broad `isAuthenticated()` booking update rule.
- Allow tenant users/employees to update only Field Mode execution fields.
- Keep payment, Stripe, customer, lead, assignment, and admin fields blocked.

Recommendation:

Employee-operated Field Mode should require a narrow rules update before true V1. For the first V1 hardening pass, allow tenant admins and tenant users with membership in `tenants/{tenantId}.users`, limited to the field execution keys only. Add assignment enforcement later once assignment data is reliable.

## Allowed Field Mode update fields

Only the following fields should be writable through the Field Mode execution rule:

- `fieldStatus`
- `fieldStatusUpdatedAt`
- `fieldStartedAt`
- `fieldStartedByUid`
- `fieldChecklist`
- `fieldChecklistSummary`
- `fieldNotes`
- `fieldIssue`
- `completedAt`
- `completedByUid`
- `updatedAt`

The current app service already accepts only:

- `fieldStatus`
- `fieldChecklist`
- `fieldNotes`
- `fieldIssue`

The service derives the timestamp, summary, and UID fields internally. Firestore rules should still enforce the full final changed-key allowlist because clients can bypass frontend service helpers.

## Forbidden fields

Field Mode writes must not change:

- `paymentStatus`
- `paymentMethod`
- `amountReceived`
- `receivedAt`
- `paymentNote`
- `paymentStatusUpdatedAt`
- `paymentStatusUpdatedBy`
- `stripeSessionId`
- `stripeCheckoutSessionId`
- `stripePaymentIntentId`
- `stripeCheckoutUrl`
- `stripePaymentLinkUrl`
- `stripePaymentStatus`
- `stripePaidAt`
- `stripeAmountReceived`
- `stripeCurrency`
- `stripeReceiptUrl`
- `platformFee`
- refund fields
- customer fields
- lead fields
- `tenantId`
- booking price fields such as `price`, `agreedPrice`, `estimate`, `subtotal`, `total`
- assignment/admin ownership fields such as `assignedEmployeeId`, `assignedToId`, `ownerId`, `adminId`, `createdBy`, `updatedBy`
- `deleted`
- `isDeleted`
- broad booking admin fields such as `date`, `startTime`, `endTime`, `scheduledAt`, `status`, `notes`

## Suggested rule strategy

Use a changed-keys check on booking updates.

Conceptual direction:

```js
function fieldExecutionKeysOnly() {
  return request.resource.data.diff(resource.data).affectedKeys().hasOnly([
    'fieldStatus',
    'fieldStatusUpdatedAt',
    'fieldStartedAt',
    'fieldStartedByUid',
    'fieldChecklist',
    'fieldChecklistSummary',
    'fieldNotes',
    'fieldIssue',
    'completedAt',
    'completedByUid',
    'updatedAt'
  ]);
}
```

Do not paste this blindly into rules without verifying syntax and existing helper naming. The final rules should be tested in the Firebase emulator before deployment.

The hardened booking update rule should separate admin booking updates from Field Mode updates. Example shape:

```js
allow update: if isSuperAdmin()
  || isTenantAdmin(tenantId)
  || (isTenantUser(tenantId) && fieldExecutionKeysOnly());
```

If owner/admin booking edits later need field-level rules too, use a second allowlist for admin booking fields instead of returning to broad booking updates.

## Role strategy

Existing helper functions:

- `isSuperAdmin()`
- `isTenantAdmin(tenantId)`
- `isTenantUser(tenantId)`
- `hasTenantAccess(tenantId)`

Recommended permissions:

- Super admin: allowed for operational support.
- Tenant admin: allowed for owner/admin-operated Field Mode and owner booking management.
- Tenant user / employee: allowed only for Field Mode execution fields and only if their UID is in `tenants/{tenantId}.users`.
- Customer user: should not be allowed to update owner/admin booking execution fields unless a future customer-facing flow has its own separate rule and path.
- Unauthenticated user: never allowed.

Important:

`hasTenantAccess(tenantId)` includes both tenant admins and tenant users. It is acceptable for read access, but update rules should be explicit about whether the actor is a tenant admin or tenant user. Do not use `hasTenantAccess(tenantId)` for all booking updates unless combined with a strict field allowlist.

## Assignment safety

Ideal V1.1 rule:

- Employee can update Field Mode fields only when the booking is assigned to that employee.

Potential assignment fields to evaluate later:

- `assignedEmployeeId`
- `assignedToId`
- `assignedToUid`
- `assignedEmployeeUid`
- assignment snapshots inside booking data

Current recommendation:

- Mark assignment enforcement as V1.1.
- For initial V1 hardening, require tenant membership via `isTenantUser(tenantId)` and field allowlist.
- Do not rely on assignment checks until the app has one stable assignment field and owner/admin assignment workflow.

## Testing plan

Use Firebase emulator/rules tests before deploying any rule change.

Required tests:

1. Tenant admin can update allowed Field Mode fields.
2. Tenant user/employee can update allowed Field Mode fields if employee-operated mode is intended.
3. Tenant user/employee cannot update `paymentStatus`.
4. Tenant user/employee cannot update `amountReceived`.
5. Tenant user/employee cannot update Stripe fields.
6. Tenant user/employee cannot update price fields.
7. Tenant user/employee cannot update assignment/admin ownership fields.
8. Tenant user/employee cannot update another tenant's booking.
9. Customer user cannot update owner/admin booking fields.
10. Unauthenticated user cannot update any booking.
11. Existing owner/admin booking update flow still works for schedule/notes/cancel where intended.
12. Stripe webhook/backend booking updates are not moved into client rules; webhook writes should remain server-side/admin SDK.

Manual permission smoke after emulator tests:

1. Login as tenant admin and perform Field Mode start/checklist/notes/complete.
2. Login as tenant user/employee and perform only Field Mode execution actions if employee mode is enabled.
3. Attempt to edit payment fields from a crafted client request and confirm denial.
4. Attempt cross-tenant booking update and confirm denial.
5. Confirm Booking Detail still reads field completion data.

## Do not change yet

This is a planning document only.

Do not edit:

- `cloud-functions/firestore.rules`
- `shared/firestore.rules`
- app code
- Cloud Functions
- Stripe/payment code
- production env vars
- deployment settings

## Recommended smallest safe next implementation

After the July 20 smoke-test freeze is cleared and before Field Mode job execution is promoted beyond lab:

1. Add emulator-backed Firestore rules tests for booking Field Mode updates.
2. Harden `cloud-functions/firestore.rules` booking update logic with:
   - strict tenant membership checks
   - field execution changed-key allowlist
   - explicit denial of broad authenticated booking updates
3. Keep owner/admin booking management separate from employee Field Mode writes.
4. Run rules tests, web lint/tests/build, and manual permission smoke.
5. Deploy rules only after Jamie approves.

Recommended commit message:

`Add Field Mode rules hardening plan`
