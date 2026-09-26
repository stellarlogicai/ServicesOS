# Booking payment accounting V1 cutover

This is the code contract for the uncommitted V1 accounting slice. The current-state board is updated only after a validated push.

## Authority

The booking's `agreedPrice ?? price` remains the total. The server converts it to integer USD cents. `paymentAccounting` holds the cutover snapshot and cached, transactionally maintained totals. `amountReceived`, `remainingBalanceCents`, and `paymentStatus` are compatibility projections of that state. Clients cannot write these fields or the payment collections. After cutover, direct owner edits to `agreedPrice` and booking deletion are denied to keep payment history attached to an unchanged total.

Post-cutover immutable entries live at `tenants/{tenantId}/bookings/{bookingId}/paymentRecords/{recordId}`. Stripe PaymentIntent IDs have deterministic, hashed record IDs; a tenant-level `bookingPaymentIdentities` claim prevents that PaymentIntent from being attributed to a second booking. Manual payment record IDs are server-derived hashes of the authenticated actor and a bounded caller-stable idempotency key; the raw key is not stored. A retry with the same key and payload returns the original record, while conflicting reuse fails closed. Refunds and full manual reversals are separate immutable records linked to their original payment. The mutable `paymentReductionState` is a transaction-only cap per original payment, not a payment source.

The server balance helper computes `legacyOpeningPaidCents + confirmedPaymentCents - confirmedRefundCents - confirmedManualReversalCents` and clamps remaining to zero. The original positive overpayment remains visible in net paid for review. `collectible` is false for a canceled, archived, deleted, fully paid, or issue-marked booking. Manual entry cannot exceed the current remaining amount or race an active Checkout link.

## Legacy opening balance

Cutover snapshots the current `amountReceived` once into `legacyOpeningPaidCents`. It does not infer the underlying method or number of payments and never adds `stripeAmountReceived` separately. Stored Stripe IDs are preserved only as legacy identity references. A replay of the stored PaymentIntent ID does not add money. A pre-cutover Stripe event with an identifier no longer stored becomes an unresolved legacy record, with no balance change. Unmapped legacy refunds are also unresolved and block further collection pending review. Invalid/zero received amounts paired with old Stripe references and overpaid legacy balances are reported as cutover issues.

The first authenticated owner payment action or valid connected-account booking webhook cuts over that booking in a transaction. Checkout creates the marker before opening a new session. This lazy cutover keeps migration and live payment writes serialized on the booking document and avoids a collection-wide race. It does not run at module import or deployment.

## Emulator cutover inspection

`cloud-functions/scripts/bookingPaymentCutover.js` operates on one explicitly named booking at a time and refuses to run unless `FIRESTORE_EMULATOR_HOST` points to loopback. It uses a demo project ID. Dry run is the default; `--apply` writes only to the emulator. Repeated apply is idempotent.

```powershell
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
node cloud-functions/scripts/bookingPaymentCutover.js demo-tenant demo-booking
node cloud-functions/scripts/bookingPaymentCutover.js demo-tenant demo-booking --apply
```

This tool does not scan or access production. Before any controlled release, inspect and resolve all reported ambiguous test/demo bookings. There is no automatic reconstruction of older payment provenance.

## Stripe and next integration

Checkout remains a connected-account direct charge with the existing platform fee. It charges the server-derived remaining amount, reserves one open session at a time, and reuses an unexpired session. The webhook checks the Connect event account against the tenant account and records only confirmed USD payments. `charge.refunded` and `refund.updated` reconcile succeeded refund IDs against canonical post-cutover payments. The Connect webhook must be configured to deliver the relevant event types in the eventual test environment; this code does not change webhook configuration.

Future Terminal code must perform booking and employee authorization, obtain the server balance, coordinate any open Checkout link, and pass the confirmed Stripe PaymentIntent through `reconcilePayment` with `channel: 'card_present'`. Device, Location, token, and native SDK setup are outside this slice.
