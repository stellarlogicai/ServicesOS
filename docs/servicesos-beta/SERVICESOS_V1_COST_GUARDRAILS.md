# ServicesOS V1 Cost Guardrails

Status: repository controls and operational runbook. Production actions require separate, explicit approval.

## Founder Cost Policy

The pre-revenue Firebase and Google Cloud target is **$10-$15 per month**. The current comfort ceiling is **$20 per month**.

Google Cloud Billing budgets and alerts are monitoring controls. They are not a universal hard spending cutoff, and ServicesOS does not guarantee a hard $20 cap. OpenAI-compatible provider, Resend, and Stripe costs are billed separately from Firebase and Google Cloud.

## Repository-Enforced Controls

- Every deployable Cloud Function has `maxInstances: 3` and `minInstances: 0`.
- `GROWTHAI_PROVIDER_ENABLED` is server-owned and defaults to disabled. Missing, false, or malformed values permit no external GrowthAI provider request.
- `CUSTOMER_EMAIL_PROVIDER_ENABLED` is server-owned and defaults to disabled. Disabled email performs no Resend request.
- GrowthAI uses a server-owned 100-credit monthly allowance with monthly, promotional, and purchased buckets.
- Paid GrowthAI actions use transactional reservation, finalization or restoration, and idempotency.
- GrowthAI provider requests have a 15-second timeout, bounded output, and no automatic retry loop.
- Opportunity reconciliation is capped at 20 documents per transaction.
- Customer email is limited to 75 accepted platform reservations per day, 50 per tenant per day, and 20 per actor per hour.
- Customer email uses application and Resend idempotency, a 15-second timeout, and no automatic provider retry.
- Service-agreement email permits one PDF attachment up to 2 MB decoded. Other email attachments are denied.
- Field photos require a server-owned reservation and finalization and are limited to 20 upload slots per booking and 10 MB per object, for a maximum theoretical 200 MB per booking.
- Field evidence is tenant scoped and immutable through client Storage operations.
- Branding objects are tenant scoped and limited to 5 MB.
- Unknown Storage paths fail closed.
- Canonical booking checkout and Stripe Connect endpoints require Firebase authentication and canonical tenant authorization.
- Stripe and subscription webhooks verify Stripe signatures. Retired unsafe payment exports remain unavailable.

## Provider Cost Separation

Firebase and Google Cloud billing is separate from:

- OpenAI-compatible provider billing;
- Resend provider billing;
- Stripe transaction costs.

Provider project spending limits remain separate backstops. Do not store provider secrets, account IDs, or private billing exports in this repository.

## Before Restoring Blaze

1. Review and approve the guardrail commits and exact master candidate.
2. Confirm provider switches will remain disabled during the initial infrastructure deployment.
3. Verify there is no unexplained billable infrastructure.
4. Prepare a $20 Google Cloud monthly budget.
5. Prepare budget alerts at $5, $10, $15, and $20.
6. Confirm Jamie receives the alerts.
7. Record that budget alerts are not a hard cap.

## Immediately After Restoring Blaze

1. Create or verify the $20 monthly budget and all four alerts.
2. Confirm alert delivery to Jamie.
3. Inspect active Firebase and Google Cloud services.
4. Inspect Cloud Functions and Cloud Run resources.
5. Verify every deployed Function has zero minimum instances and no more than three maximum instances.
6. Verify unexpected services and resources are absent.
7. Keep GrowthAI and email provider switches disabled until each provider is separately approved for smoke testing.

## Controlled Deployment Sequence

The guardrail branch contains interdependent Function, web, Firestore, and Storage behavior. Never publish a client that requires an endpoint before the endpoint exists.

### Field photos

1. Restore Blaze only after budget and monitoring configuration is confirmed.
2. Deploy the approved bounded Cloud Functions first, including `fieldPhotoUploadGateway`.
3. Verify the gateway exists, requires authentication, and rejects unsupported requests.
4. Merge or publish the compatible reviewed web client.
5. Smoke reservation, upload, and finalization with controlled data.
6. Deploy the restrictive Firestore and Storage field-photo rules only under their separate approved rules procedure.
7. Repeat valid own-tenant and denied role/cross-tenant smoke tests.

Old web code may continue using the prior rules temporarily. Do not deploy restrictive rules before the required gateway and compatible client are available.

### Customer email

Production notes currently identify `sendCustomerEmail` as absent. When it is later approved for deployment:

1. Deploy it with `CUSTOMER_EMAIL_PROVIDER_ENABLED` disabled.
2. Validate authentication, authorization, validation, and fail-closed behavior without contacting Resend.
3. Review Resend configuration separately.
4. Explicitly enable the provider.
5. Perform one controlled email smoke and inspect provider and quota usage.
6. Disable the provider immediately if behavior is unexplained.

### GrowthAI

1. Deploy GrowthAI Functions with `GROWTHAI_PROVIDER_ENABLED` disabled unless a provider smoke is separately approved.
2. Verify the provider-independent credit-balance endpoint.
3. Verify provider-backed generation and routing fail closed with no external call while disabled.
4. Explicitly enable the provider.
5. Perform one controlled one-credit smoke.
6. Inspect the canonical credit ledger and provider usage.
7. Disable the provider immediately if behavior is unexplained.

## Emergency Response

If usage or spend is abnormal:

1. Disable the GrowthAI provider.
2. Disable the customer email provider.
3. Stop nonessential testing.
4. Inspect Function invocation, concurrency, latency, and error counts.
5. Inspect Firestore read/write volume and Storage bytes/traffic.
6. Inspect OpenAI-compatible provider and Resend usage.
7. Inspect Stripe events only when relevant.
8. Identify the exact source before resuming.

Do not weaken security rules, delete production customer evidence, or delete production data as a cost-control shortcut.

## App Check

Firebase App Check is not currently initialized in the ServicesOS web application or Employee App and is not enforced by the current Cloud Functions source. Dependency lockfiles contain transitive App Check packages, but that is not initialization or enforcement.

App Check requires a later controlled compatibility slice before enforcement. Premature enforcement could break the ServicesOS web app, the incomplete Employee App, and future mobile or payment workflows. Do not enable App Check without client registration, token propagation, emulator handling, staged enforcement, and explicit production approval.

## Known Residual Risks

- An abandoned GrowthAI credit reservation can defer monthly renewal until separately reconciled. This is a bounded accounting/availability hardening item, not an automatic provider retry or new spend trigger.
- Some mounted screens use one-shot collection reads and feature-specific realtime listeners. The focused audit found no tight polling, recursive refetch, or external-provider loop in the active V1/GrowthAI paths, but data-volume query bounds should remain part of later scale reviews.
- Budgets alert after measured or forecast spend and may be delayed; provider-specific limits and the repository switches remain necessary.
