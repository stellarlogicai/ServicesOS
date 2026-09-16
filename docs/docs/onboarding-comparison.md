# ServicesOS V1 Onboarding Contract

Updated: 2026-09-15

This document supersedes the old `CompanyOnboarding.jsx` vs `ImprovedOnboarding.jsx` comparison.

The legacy CleanOps-style `ImprovedOnboarding.jsx` is reference material only. Do not restore it as the production onboarding. Current ServicesOS onboarding must use the secure owner/tenant bootstrap and current canonical ServicesOS settings/data contracts.

## Product rule

A customer who creates a ServicesOS account must go through onboarding that gathers the information ServicesOS needs to function correctly for that business.

Onboarding is a business setup flow, not just account creation and billing.

Subscription payment and operational onboarding completion are separate facts:

- verified Stripe payment can activate billing entitlement,
- but the business is not onboarding-complete until required operational setup is finished.

## Current implementation

The current V1 branch already implements the secure activation spine:

1. server-owned owner/tenant bootstrap
2. basic business profile
3. versioned SaaS agreement
4. typed signer + explicit acceptance
5. owner subscription Checkout
6. verified paid-invoice activation

This is only the first portion of the full onboarding contract.

## Canonical V1 onboarding sequence

### 1. Secure account bootstrap — built

- create/verify owner identity
- create/verify canonical tenant
- establish exact admin/tenant relationship
- fail closed on malformed/conflicting identity state

### 2. Business basics — partial

Required:

- business name
- business type
- phone
- email
- timezone
- service area
- optional business address
- optional website

Compatible fields must write to the current canonical `businessSettings` model rather than a parallel onboarding-only settings object.

### 3. SaaS agreement — built

- display the immutable current agreement/version
- typed signer name
- explicit affirmation
- immutable acceptance evidence

### 4. ServicesOS subscription — partial

Company platform pricing:

- $100/month
- $1,000/year
- same normal entitlement either way

Required:

- owner chooses monthly or annual
- server accepts only the two approved canonical Price IDs
- secure platform-account Stripe Checkout
- verified `invoice.paid`
- active linked subscription
- exact tenant/customer/purpose/schema/Price/quantity validation

Do not use Stripe Connect destination charges, transfers, or application fees for the SLAI subscription itself.

### 5. Services & deterministic pricing — remaining

Required:

- select offered services
- add custom services
- choose pricing method
- create initial canonical pricing configuration

AI may assist later where explicitly approved, but deterministic ServicesOS pricing remains authoritative.

### 6. Availability / scheduling rules — partial

Required:

- working days
- business hours
- typical duration
- scheduling buffer
- booking horizon

The current Business Settings working-day model should be reused rather than duplicated.

### 7. Brand basics — remaining

Required minimum:

- logo
- canonical business/brand identity needed by customer-facing copy
- approved brand preferences needed by ServicesOS/GrowthAI

Reuse current branding/brand-profile contracts. Do not revive a second legacy settings model.

### 8. Customer-payment setup — partial

- integrate the existing Stripe Connect onboarding component
- show current connection status
- allow `Skip / do later`

This is separate from the ServicesOS SaaS subscription.

### 9. Team setup — remaining

Provide a simple fork:

- `Just me`
- `I have employees`

If employees are present, support the minimum employee setup/invite required for the V1 field workflow.

### 10. Review / resume / finish — remaining

Required:

- review key setup
- persist completed/skipped stages
- resume interrupted onboarding safely
- separate `billing entitlement active` from `onboarding complete`
- only mark onboarding complete after required operational setup is satisfied
- provide a clear first action in ServicesOS
- pass an end-to-end test where a new owner completes setup without founder/developer help

## Existing canonical destinations to reuse

Current V1 already has a Business Settings foundation for:

- business name
- phone
- email
- service area
- business address
- website
- Facebook link
- default service notes
- timezone
- working days
- Stripe Connect status/setup
- cleaning products/methods
- tenant add-on catalog

Onboarding should populate/reuse these contracts instead of introducing incompatible duplicates.

## Explicitly not required for initial V1 onboarding

These old ideas do not become launch blockers unless Jamie explicitly re-scopes them:

- restoring the legacy `ImprovedOnboarding.jsx` flow
- multi-platform data migration/import
- AI setup wizard
- AI-recommended pricing as authority
- elaborate live previews
- celebration/gamification systems
- broad template marketplaces

## Implementation order

1. preserve the existing secure activation spine
2. add monthly + annual subscription choice
3. separate paid entitlement from operational onboarding completion
4. extend onboarding through business basics/services/pricing/availability/brand/Connect/team
5. persist/resume progress
6. run new-owner end-to-end tests
7. deploy to controlled V1 test environment
8. run outcome-based wife V1 acceptance

## Acceptance rule

The onboarding is ready when a new business owner can create an account, provide the required business/operational information, choose billing, finish setup, enter ServicesOS, and successfully begin normal work without Jamie or a developer telling them where to click.