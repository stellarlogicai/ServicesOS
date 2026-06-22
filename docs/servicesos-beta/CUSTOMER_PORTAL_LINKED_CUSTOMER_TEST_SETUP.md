# Customer Portal Linked Customer Test Setup

## Purpose

This document explains how to safely set up a fake tenant-linked beta customer account so the Customer Portal quote request manual test can continue.

This is documentation only. No production data, app code, Firebase rules, auth behavior, Stripe/payment behavior, backend/cloud functions, Tap to Pay, or routing were changed.

## Why The Manual Quote Test Was Blocked

The manual Customer Portal quote request test stopped because the signed-in customer-role user showed:

> Business: Not linked

Customer Portal also showed:

> Your customer account is not linked to a business yet, so saved quote requests are not enabled.

That means the signed-in Firebase user either has no `users/{uid}.tenantId`, or the app cannot load the referenced tenant/customer record.

The submit guard worked correctly. It should not be bypassed.

## Existing Setup / Linking Paths Found

### Company onboarding

`servicesos-web/src/pages/CompanyOnboarding.jsx` creates:

- `tenants/{tenantId}`
- admin Firebase Auth account
- `users/{adminUid}` with `role: "admin"` and the new `tenantId`

This is useful for creating or identifying a test tenant/admin account.

### Customer login/signup

`servicesos-web/src/components/LoginForm.jsx` currently creates customer accounts with:

```js
signup(email, password, null, "customer")
loginWithGoogle()
```

That means normal customer signup or first Google sign-in creates a customer-role user with `tenantId: null`.

This explains why a customer can sign in but still show `Business: Not linked`.

### Customer management

`servicesos-web/src/components/CustomerManagement.jsx` can create tenant-scoped customer records with:

- `name`
- `email`
- `phone`
- `address`
- `city`
- `state`
- `zip`
- `notes`

It does not currently expose an `authUid` field in the UI.

### Customer resolver

`servicesos-web/src/services/customerPortalIdentityService.js` resolves a signed-in customer under:

```text
tenants/{tenantId}/customers
```

Resolution order:

1. `authUid == user.uid`
2. `email == user.email`

### Seed/demo utilities

No safe existing seed script, demo customer setup helper, customer invite flow, or customer linking UI was found.

## Decision

Use manual Firebase Console setup for now.

Do not add a script yet. A setup script would be useful later, but it should be a separate dev-only task with explicit fake data, no automatic execution, and clear safeguards.

## Required Firebase / Firestore State

Use fake test data only.

### Firebase Auth

A Firebase Auth user must exist for the test customer.

Example fake email:

```text
servicesos.beta.customer+quote001@example.test
```

Do not use a real customer email.

### Firestore `users/{uid}`

Create or update:

```text
users/{uid}
```

Required fields:

```js
{
  uid: "<firebase-auth-uid>",
  email: "servicesos.beta.customer+quote001@example.test",
  role: "customer",
  tenantId: "<test-tenant-id>",
  status: "active",
  displayName: "Beta Quote Test Customer"
}
```

### Firestore `tenants/{tenantId}`

A fake test tenant must exist.

Minimum useful fields:

```js
{
  id: "<test-tenant-id>",
  businessName: "ServicesOS Beta Cleaning Test",
  businessEmail: "servicesos.beta.owner@example.test",
  businessPhone: "555-0100",
  status: "active",
  subscriptionTier: "free"
}
```

If the currently deployed Firestore rules require tenant membership, also confirm the tenant document contains the test customer UID in a membership array:

```js
{
  users: ["<firebase-auth-uid>"]
}
```

For owner/admin testing, the admin UID may also need:

```js
{
  adminUsers: ["<admin-auth-uid>"]
}
```

This is test data setup, not a code or rules change.

### Firestore `tenants/{tenantId}/customers/{customerId}`

Create or update a fake customer record:

```js
{
  name: "Beta Quote Test Customer",
  email: "servicesos.beta.customer+quote001@example.test",
  phone: "555-0101",
  address: "123 Test Lane",
  city: "Test City",
  state: "MO",
  zip: "64101",
  notes: "Fake customer for Customer Portal quote request beta testing only.",
  authUid: "<firebase-auth-uid>",
  status: "active"
}
```

The most reliable link is:

```js
authUid === uid
```

The email fallback should also match:

```js
email === user.email
```

## Manual Firebase Console Setup Steps

1. Open Firebase Console for the ServicesOS test project.
2. Open Authentication.
3. Find or create the fake customer Firebase Auth user.
4. Copy the customer user UID.
5. Open Firestore Database.
6. Open or create `users/{uid}`.
7. Add or update:
   - `uid`: copied Firebase Auth UID
   - `email`: fake test customer email
   - `role`: `customer`
   - `tenantId`: valid fake test tenant ID
   - `status`: `active`
   - `displayName`: `Beta Quote Test Customer`
8. Open or create `tenants/{tenantId}`.
9. Confirm it is a fake test tenant, not a production tenant.
10. Confirm the tenant has a readable `businessName`.
11. If rules require tenant membership, add the customer UID to `users`.
12. Open `tenants/{tenantId}/customers`.
13. Create or update a fake customer record.
14. Set `authUid` to the Firebase Auth UID.
15. Set `email` to the same fake test customer email.
16. Add fake name, phone, address, city, state, ZIP, and notes.
17. Save.
18. Reload the local app.
19. Sign in as the fake customer.
20. Confirm Customer Portal no longer says `Business: Not linked`.
21. Confirm Customer Portal shows `Customer identity resolved`.

## Fake Test Customer Fields To Use

Use this fake customer:

```text
Name: Beta Quote Test Customer
Email: servicesos.beta.customer+quote001@example.test
Phone: 555-0101
Address: 123 Test Lane
City: Test City
State: MO
ZIP: 64101
Notes: Fake customer for Customer Portal quote request beta testing only.
```

Use this fake tenant if a test tenant does not already exist:

```text
Business name: ServicesOS Beta Cleaning Test
Business email: servicesos.beta.owner@example.test
Business phone: 555-0100
Status: active
Subscription tier: free
```

## How To Verify The Link Worked

After reloading the local app and signing in as the fake customer:

1. Open Customer Portal.
2. Confirm the identity banner does not say `Saved quote requests not enabled`.
3. Confirm the banner says `Customer identity resolved`.
4. Confirm `Business` shows the fake tenant business name or tenant ID.
5. Confirm `Customer match` shows `authUid` or `email`.
6. Go to Request Quote.
7. Click `Review Quote Request Draft`.
8. Confirm `Submit Quote Request for Owner Review` is enabled.

If Customer Portal still says `Business: Not linked`, re-check `users/{uid}.tenantId`.

If Customer Portal shows a business but no customer match, re-check:

- `tenants/{tenantId}/customers/{customerId}.authUid`
- `tenants/{tenantId}/customers/{customerId}.email`

## How To Rerun The Manual Quote Request Test

Use fake cleaning data only:

- Service type: Standard clean
- Bedrooms: 3
- Bathrooms: 1
- Kitchens: 1
- Living rooms: 1
- Pets: present
- Pet hair level: medium
- Clutter level: medium
- Last cleaned: within the last month
- Preferred date/time: fake future date and time
- Access notes: `Use fake side gate code 0000.`
- Customer notes: `Fake beta quote request. Please review scope before pricing.`

Then:

1. Click `Review Quote Request Draft`.
2. Confirm preview details.
3. Click `Submit Quote Request for Owner Review`.
4. Confirm success message.
5. Switch to owner/admin view.
6. Confirm the quote request appears as a lead/quote request for review.
7. Confirm no booking was created.
8. Confirm no payment was created.

## What Not To Change

Do not:

- Use real customer data.
- Modify production tenants or production customers.
- Disable Customer Portal submit guards.
- Bypass tenant/customer identity checks.
- Change Firebase rules.
- Change auth behavior.
- Touch Stripe/payment behavior.
- Create bookings or payments during this test.
- Auto-create customer or property profiles during this setup.
- Add a production-facing customer linking feature in this pass.

## Risks Before Wife Beta

- There is no customer invite/linking UI yet.
- Customer signup currently creates `tenantId: null`.
- Customer Management does not expose `authUid`.
- Firestore rules differ between local rules files and still contain temporary testing allowances.
- Tenant membership arrays may be required by rules but are not clearly created by `createTenant`.
- Manual Firebase Console setup can accidentally touch real data if the wrong project or tenant is selected.

Before wife beta, create a deliberate fake tenant and fake customer account, verify the link, then rerun the Customer Portal quote request manual test.
