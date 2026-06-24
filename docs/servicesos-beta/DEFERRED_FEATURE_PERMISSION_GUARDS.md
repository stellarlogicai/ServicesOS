# Deferred Feature Permission Guards

## Cause

The wife-beta Dashboard eagerly loaded two deferred features whenever a tenant ID was available:

- `checkInsuranceExpiration(tenantId)` read `tenants/{tenantId}/insurance/policy`.
- `getRemainingCredits(tenantId)` read or attempted to create `ai_usage/{tenantId}`.

The current Firestore rules do not authorize these paths for the test admin. Both services log and rethrow permission failures, and Dashboard logged the errors again. This produced repeated `Missing or insufficient permissions` console noise during otherwise successful admin use.

## Why These Reads Are Deferred

Insurance and AI-credit billing are not wife-beta visible routes or accepted beta workflows:

- Insurance is hidden from admin navigation and its implementation is explicitly deferred.
- The Dashboard AI-credit card is not required for Dashboard quote, booking, revenue, or pipeline metrics.
- The subscription feature model has no Insurance flag.
- `aiPhotoAnalysis` does not establish authorization for the separate `ai_usage` collection and is not a safe proxy for showing an AI-credit billing widget.

## Guard Applied

Dashboard no longer imports or invokes the deferred Insurance and AI-credit services. Their state, eager effect, Insurance warning banner, and AI Credits stat card were removed from the wife-beta Dashboard.

This is intentionally scoped to Dashboard. The deferred feature components and services remain available for later implementation and can be restored behind explicit feature enablement and authorized Firestore paths.

Focused Dashboard coverage verifies:

- Insurance expiration checks are not called.
- AI-credit reads are not called.
- Lead count, booked-job count, and confirmed revenue still render.
- Pending quote review and explicit booking conversion remain available.

## Intentionally Unchanged

- Firebase rules
- Insurance service and Insurance module behavior
- AI usage and credit service behavior
- Stripe, payments, and payment links
- Customer Portal quote submission
- Quote-to-booking conversion
- Tenant and authentication logic
- Admin routing and wife-beta navigation

No errors are globally suppressed. Active Dashboard lead or booking failures continue to be reported normally.

## Manual Test

Completed on June 23, 2026 in a fresh authenticated browser tab:

- Dashboard loaded 6 leads, 2 booked jobs, `$495` confirmed revenue, and `$920` pipeline value.
- A pending customer quote opened with `Pending owner review` and the explicit booking action.
- The fresh tab reported no console errors or warnings.
- No Insurance banner or AI Credits card was rendered.

Repeatable steps:

1. Sign in as the configured wife-beta test admin.
2. Open Dashboard.
3. Confirm lead, booked-job, revenue, and pipeline metrics load.
4. Confirm pending quote requests still display `Pending owner review`.
5. Open a pending request and confirm `Approve / Create Booking` remains available.
6. Reload Dashboard.
7. Inspect the console and confirm there are no Insurance or AI-credit permission-denied errors.
8. Confirm Insurance and AI-credit widgets are not visible.

## Wife Beta Acceptance Criteria

- Normal Dashboard load does not access `tenants/{tenantId}/insurance/policy`.
- Normal Dashboard load does not access `ai_usage/{tenantId}`.
- No Insurance or AI-credit permission-denied errors appear during Dashboard use.
- Dashboard quote and booking metrics remain accurate.
- Pending quote conversion remains unchanged.
- Customer quote submission remains unchanged.
- Deferred features remain hidden.
- Firebase rules and tenant isolation remain unchanged.
