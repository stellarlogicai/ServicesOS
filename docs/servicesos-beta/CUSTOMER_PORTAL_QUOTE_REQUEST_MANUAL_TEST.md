# Customer Portal Quote Request Manual Test

## Test Date

June 22, 2026

## Purpose

Verify whether a tenant-linked customer can submit a Customer Portal quote request and whether the owner/admin side can see it as a lead or quote request for review.

## Result

Blocked before quote submission.

The browser session was signed in as a customer-role user, but Customer Portal showed that the account is not linked to a business. Because `tenantId` was missing, the quote request submit path remained disabled by design.

No fake quote data was submitted.

## Test Account Used

- Masked email: `br***@gmail.com`
- Role shown in sidebar: `customer`

Do not use real customer data for this test.

## Tenant / Customer Linkage Status

Observed in Customer Portal:

- Signed-in user exists: yes
- `users/{uid}.tenantId`: missing or not available to Customer Portal
- Business: `Not linked`
- Customer match: `Not linked`
- Customer Portal message:

> Your customer account is not linked to a business yet, so saved quote requests are not enabled.

Because no tenant ID was available, the app could not safely check or use:

- `tenants/{tenantId}/customers/{customerId}`
- customer match by `authUid`
- customer match by email

## Data Entered

None.

The test stopped before entering fake quote data because the account was not linked to a tenant/business.

Planned fake data for the next run:

- Service type: Standard clean
- Bedrooms: 3
- Bathrooms: 1
- Kitchens: 1
- Living rooms: 1
- Pets: present
- Pet hair level: medium
- Clutter level: medium
- Last cleaned: 2-4 weeks ago
- Preferred date/time: fake future test date and time
- Access notes: fake access notes only
- Customer notes: fake customer notes only

## Submit Result

Not submitted.

Submit was correctly blocked because the customer account was not linked to a tenant/business.

## Owner / Admin Visibility

Not tested.

No lead or quote request was created, so there was nothing to verify in the owner/admin lead review area.

## Booking / Payment Status

- Booking created: no
- Payment created: no
- Stripe/payment behavior touched: no
- Appointment/localStorage booking flow touched: no

## Bugs Found

No code bug confirmed in this pass.

The blocking condition is a test-data/setup issue:

- The signed-in test customer needs a valid `tenantId`.
- A matching customer record must exist under `tenants/{tenantId}/customers/{customerId}`.
- The customer record should match the signed-in user by `authUid` first, or by email fallback.

## Screenshots Needed

Recommended screenshots for the next successful test:

- Customer Portal identity banner with private email masked.
- Request Quote form filled with fake data.
- Quote request preview.
- Success message after submission.
- Owner/admin lead review showing the submitted quote request with private email masked.

Do not include unmasked private emails, customer addresses, secrets, tokens, API keys, or production customer data.

## Recommended Fixes / Setup Before Retest

Create or link a fake beta customer account with:

1. Firebase Auth user.
2. `users/{uid}.tenantId` set to the test tenant ID.
3. A matching customer record at `tenants/{tenantId}/customers/{customerId}`.
4. Customer record field `authUid` equal to the Firebase user UID.
5. Matching fake/test email as fallback.

After setup, rerun the manual test with fake cleaning quote data only.
