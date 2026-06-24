# Pending Quote Review And Booking Conversion

## Current Flow

1. A linked customer submits a quote request through Customer Portal.
2. The request is created at `tenants/{tenantId}/leads/{leadId}`.
3. Dashboard reads the lead and displays it as `Pending owner review`.
4. The admin opens the request and reviews snapshot-backed customer, property, service, and appointment-preference data.
5. `Approve / Create Booking` requires a scheduled date/time and a positive approved price.
6. One Firestore batch creates `tenants/{tenantId}/bookings/{bookingId}` and updates the source lead.
7. No payment record is created and no Stripe code is called.

Create Estimate remains a separate admin intake path. It saves a lead through `crmService.saveLead`, and `AIPhotoEstimateSystem` continues to receive `enablePayments={false}`.

## Data Fields

Admin display preference:

- `customerSnapshot` before legacy `formData`
- `propertySnapshot` before legacy `formData`
- `requestSnapshot` before legacy `formData`
- `appointmentRequest` for the requested date/time

Pending customer quote request:

- `type: quote_request`
- `source: customer-portal`
- `status: new`
- `booking: null`
- `estimate.status: pending_owner_review`
- `estimate.requiresReview: true`
- `review.requiresOwnerReview: true`
- `appointmentRequest.status: pending_review`

Approved booking record:

- `status: scheduled`
- `leadId` and `sourceLeadId`
- `customerId` and `propertyId`
- customer, property, request, and appointment snapshots
- `date`, `startTime`, `endTime`, and `scheduledAt`
- `agreedPrice`
- `createdBy`

## Status Transition

The explicit conversion changes the source lead as follows:

- `status`: `new` to `booked`
- `booking`: populated with the booking ID, schedule, approved price, notes, and `scheduled` status
- `estimate.status`: `pending_owner_review` to `approved`
- `estimate.requiresReview`: `true` to `false`
- `review.status`: `approved`
- `review.requiresOwnerReview`: `true` to `false`
- `review.reviewedBy` and `review.reviewedAt`: populated
- `appointmentRequest.status`: `pending_review` to `approved`
- `appointmentRequest.approvedBookingId`: populated

The generic `Mark booked` action is not available. A booking can only be created through the explicit booking action.

## Firestore Setup Requirements

The test admin account needs:

- `users/{uid}.role: admin`
- `users/{uid}.tenantId`: valid tenant ID
- `users/{uid}.status: active`
- `users/{uid}.onboardingCompleted: true`
- UID in `tenants/{tenantId}.users`
- UID in `tenants/{tenantId}.adminUsers`

The checked strict rules require `adminUsers` membership for both the lead update and booking create. Do not broaden the rules. `ownerId` does not replace `adminUsers`.

## Manual Test

Completed on June 23, 2026 against `tenant_1781642309523` with the configured test admin:

- Opened a fake customer quote request that displayed `Pending owner review`.
- Confirmed the detail view said the appointment preference was not a confirmed booking.
- Approved the request for `$245`.
- The atomic Firestore batch completed without a permission error.
- The source lead changed to `Booked`, displayed the `$245` agreed price, and no longer exposed the approval action.
- Dashboard booked-job count changed from 1 to 2 and confirmed revenue changed from `$250` to `$495`.
- Reload confirmed the converted state persisted.
- No payment or Stripe function is present in the conversion path.

Repeatable steps:

1. Sign in as the configured test admin.
2. Open Dashboard.
3. Confirm a customer quote request shows `Pending owner review`, not `Booked`.
4. Open the request and confirm snapshot-backed contact, property, service, and appointment-preference details.
5. Confirm the appointment preference says it is not a confirmed booking.
6. Select `Approve / Create Booking`.
7. Enter a positive approved price and confirm the requested or chosen date/time.
8. Submit.
9. Confirm the lead now shows `Booked` with the agreed price and booking details.
10. Confirm a document exists at `tenants/{tenantId}/bookings/{bookingId}` and the source lead contains the same booking ID.
11. Confirm no payment document was created.
12. Refresh and confirm the converted state persists.

## Known Limitations

- Scheduling remains hidden from wife-beta navigation, so booking verification is currently through Dashboard and Firestore.
- The conversion does not assign an employee.
- End time is derived from the estimate appointment duration, with a two-hour fallback.
- Customer notification is not sent by this conversion.
- If the deployed rules differ from the checked strict rules, deployed-rule identity still requires separate confirmation.

## Deferred Payment Behavior

Booking approval does not collect payment, create a payment intent, create a payment link, or write to a payments collection. All Stripe and payment behavior remains deferred.

## Wife Beta Acceptance Criteria

- Pending requests are clearly distinct from booked jobs.
- Snapshot data is used for admin review.
- Missing property values do not render as zero-value placeholders.
- Conversion requires an explicit admin action and a positive approved price.
- Booking creation and source-lead update succeed atomically.
- The approved state persists after refresh.
- No payment is created.
- Customer quote submission, onboarding, navigation hardening, and tenant isolation remain unchanged.
