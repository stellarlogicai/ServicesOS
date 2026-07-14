# Customer Portal Linked Customer Test Setup

## Purpose

This document defines the true V1 test setup for a tenant-linked Customer Portal account and quote request. Use fake test data only. Do not use a real customer email, phone number, address, or payment information.

Customer accounts are tenant/invite connected. The app does not provide generic open customer registration, and public business-specific quote intake remains deferred until a trusted tenant link or invite mechanism is approved.

## V1 Customer Model

A usable Customer Portal identity requires all of the following:

- A Firebase Auth user.
- `users/{uid}` with `role: "customer"`, `status: "active"`, and a valid `tenantId`.
- A customer record at `tenants/{tenantId}/customers/{customerId}`.
- The customer record's `authUid` must equal the Firebase Auth UID.
- The customer record must not be archived, disabled, or inactive.

Email-only matching is not a valid authenticated customer link. The customer record may retain an email for contact purposes, but `authUid` is the ownership field.

If the account is not connected correctly, Customer Portal must show:

> Your account is not connected to a service business yet. Please use the business's quote request link or contact the business directly.

No lead may be created in that state.

## Required Test Data

### Firebase Auth

Create a fake test customer account. Example:

```text
servicesos.beta.customer+quote001@example.test
```

Record the Firebase Auth UID.

### User Profile

Create or verify:

```text
users/{uid}
```

Required fields:

```js
{
  email: "servicesos.beta.customer+quote001@example.test",
  displayName: "Beta Quote Test Customer",
  role: "customer",
  tenantId: "<test-tenant-id>",
  status: "active"
}
```

The customer must not be able to rewrite `role`, `tenantId`, or `status`. Self-profile updates are limited to `displayName`, `phone`, `photoURL`, and `updatedAt`.

### Tenant Customer Record

Create or verify:

```text
tenants/{tenantId}/customers/{customerId}
```

Minimum fields:

```js
{
  name: "Beta Quote Test Customer",
  email: "servicesos.beta.customer+quote001@example.test",
  phone: "555-0100",
  authUid: "<firebase-auth-uid>",
  status: "active",
  isArchived: false
}
```

Do not add a customer-role UID to tenant admin membership arrays. Customer access is based on the user's tenant profile plus the customer record's `authUid`, not owner/admin membership.

## Expected Request Behavior

A valid request is created only at:

```text
tenants/{tenantId}/leads/{leadId}
```

The request must include:

- `type: "quote_request"`
- `source: "customer-portal"`
- `status: "new"`
- `tenantId` matching the document path
- `customerId` for the linked customer record
- `createdByAuthUid` matching the signed-in UID
- `booking: null`
- pending owner-review estimate and appointment-preference semantics

Successful customer copy must say:

> Your quote request was submitted for owner review. This is not a confirmed booking yet.

Creating a request does not create a booking, payment, Stripe session, or reserved appointment.

## Visibility Expectations

- Customer: sees only quote requests where `createdByAuthUid` matches their UID.
- Owner/admin: sees tenant requests through the existing tenant lead review surfaces.
- Employee: cannot read or manage customer records or leads through the customer-management paths.
- Other tenant: cannot read or write the request or customer record.
- Unauthenticated user: cannot read or create tenant requests.

## Manual Test

1. Sign in as the linked fake customer.
2. Confirm Customer Portal shows `Customer profile linked`.
3. Confirm the business label is a real business name or `Your service business`, never a raw tenant ID.
4. Submit a fake quote request.
5. Confirm the success copy says owner review and not a confirmed booking.
6. Refresh and confirm the customer's own request remains visible.
7. Sign in as the tenant admin and confirm the request appears for owner review.
8. Confirm no booking or payment was created.
9. Sign in as another customer and confirm the first customer's request is not readable.
10. Test a tenantless or unlinked customer and confirm submission is blocked with no lead write.

## Firestore Rules Verification

The deploy-source rules are `cloud-functions/firestore.rules`; `shared/firestore.rules` mirrors the intended policy.

Run from `cloud-functions`:

```powershell
npm run test:rules
```

The command pins Firebase CLI `13.35.1` so the Firestore emulator remains compatible with the repository machine's JDK 17 runtime. This CLI is test tooling only and is not added to the production runtime or web bundle.

The rules suite covers tenant admin access, own-tenant customer creation/read, spoofed tenant/UID/customer denial, no customer lead update/delete, own customer-record reads, employee and unauthenticated denial, immutable role/tenant/status, and the existing Field Mode employee allowlist.

## Deferred Work

- Real owner-created customer invitations and linking UI.
- Trusted business slug or signed public quote-request links.
- Public unauthenticated quote intake.
- Customer scheduling or payment during quote submission.

Do not add broad unauthenticated Firestore writes to implement these deferred items.
