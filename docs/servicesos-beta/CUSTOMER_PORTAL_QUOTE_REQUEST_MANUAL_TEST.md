# Customer Portal Quote Request Manual Test

## Test Date

June 22, 2026

## Result

Passed with a tenant-linked beta customer.

The customer submitted a Customer Portal quote request successfully. The new record appeared in the owner/admin leads view for review.

## Confirmed Flow

- Customer account had `users/{uid}.tenantId` set to the beta tenant.
- A matching customer record existed under `tenants/{tenantId}/customers/{customerId}`.
- Customer identity resolved by the linked customer data.
- Customer Portal displayed:

> Customer profile linked. You can submit quote requests for owner review.

- Quote request preview preserved customer, property, request, and appointment-preference snapshots.
- Submit created a tenant-scoped lead with `type: quote_request`.
- Owner/admin could see the submitted request in leads.
- Pending quote requests displayed `Pending owner review.` instead of `$0 - $0`.
- Snapshot room values displayed instead of misleading legacy `0 bed / 0 bath` placeholders.
- The nested `appointmentRequest` remained a preference pending review and was not shown as a confirmed booking.

## Booking / Payment Status

- Booking created by quote submission: no
- Payment created by quote submission: no
- Stripe or Stripe Connect changed: no
- Backend or cloud functions changed: no
- Existing appointment booking behavior changed: no

## Regression Checks

- Quote submit behavior remains guarded by tenant, signed-in user, linked customer, and preview state.
- Submitted quote requests still use the existing tenant lead persistence path.
- Owner review remains required before pricing or booking.
- Customer quote cards and owner lead cards prefer `requestSnapshot`, `propertySnapshot`, and `customerSnapshot` before legacy `formData`.

## Retest Checklist

1. Sign in with a fake tenant-linked customer.
2. Confirm the linked profile banner copy.
3. Submit a quote request using fake cleaning data.
4. Confirm the request appears in owner/admin leads.
5. Confirm the request shows snapshot customer, service, and property details.
6. Confirm pricing says `Pending owner review.`
7. Confirm appointment preference is not labeled as a confirmed booking.
8. Confirm no booking or payment record is created.
