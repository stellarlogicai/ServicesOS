# Aunt B's Cleaning Service — ServicesOS V1 Agreement Fixture

Status: **Approved development fixture for Agreement Lite planning/testing**
Source format: DOCX
Source filename: `Aunt_Bs_Cleaning_Service_Agreement_SERVICESOS_V1_FIXTURE.docx`
Source SHA-256: `67bb0bea2e8ff8335d26c1c431e5da24f738cae8c9e3803a997492c57bb85d22`
Current branch checkpoint when fixture was prepared: `00546f48be98308020d7bc8497122598a4817231`

## Purpose

This is the known-good real-business fixture for the scoped ServicesOS V1 Agreement Lite implementation.

Do not replace this fixture with a generic mock agreement during implementation. The first Agreement Lite acceptance path should prove that ServicesOS can take this known template, populate the approved dynamic fields, freeze the resulting customer-specific agreement, obtain the customer's electronic signature, and produce the final immutable signed PDF/evidence.

## V1 Scope Boundary

For V1, this fixture is intentionally a **known supported template**. Do not expand the implementation into a general arbitrary-DOCX/PDF template engine unless Jamie explicitly re-scopes it.

V1 should support:

- this DOCX template structure;
- the allowlisted placeholders below;
- customer/estimate/booking/business data population;
- immutable frozen agreement version;
- secure customer signing session;
- typed full-name electronic signature;
- explicit electronic-record consent and intent to sign;
- signed PDF/evidence generation and retention.

Deferred unless explicitly re-scoped:

- arbitrary PDF templates;
- AcroForm mapping;
- arbitrary DOCX field discovery;
- template designer;
- multiple signers;
- drawn-signature implementation;
- SMS/OTP signing;
- complex document conversion compatibility handling.

## Placeholder Contract

### Business-derived

- `{{business_name}}`
- `{{business_phone}}`
- `{{business_email}}`

### Customer-derived

- `{{customer_name}}`
- `{{customer_email}}`
- `{{customer_phone}}`
- `{{service_address}}`

### Estimate / booking-derived

- `{{service_name}}`
- `{{service_date}}`
- `{{service_time}}`
- `{{scope_of_work}}`
- `{{addons}}`
- `{{agreed_price}}`
- `{{deposit_amount}}`
- `{{balance_due}}`

### Agreement / signing-derived

- `{{agreement_date}}`
- `{{agreement_id}}`
- `{{agreement_version}}`
- `{{signer_name}}`
- `{{signed_at}}`
- `{{typed_signature}}`

The placeholders must remain whole tokens during document processing. `scope_of_work` and `addons` must be allowed to expand to multiple lines/bullets.

## Important Template Rules

- Static agreement language remains static.
- ServicesOS must not rewrite or invent the business's legal terms.
- After an agreement is sent for signature, the exact customer-specific version is frozen.
- Later changes to business settings, customer records, quotes, or the base template must not mutate an already-sent or signed agreement.
- If a sent agreement needs a material change, create/reissue a new version rather than mutating the old one.
- The current insurance disclosure and payment wording are business-specific and must be reviewed when those business conditions change.
- The agreement itself contains a legal-review disclaimer; ServicesOS should not represent the template as legal advice.

## Acceptance Fixture

The implementation should eventually prove this exact sequence:

`known DOCX fixture`
→ populate canonical ServicesOS data
→ render customer-specific PDF
→ freeze/version/hash
→ create secure signing session
→ customer reviews and consents
→ customer enters full name as electronic signature
→ server records signature/evidence
→ final signed PDF is produced
→ owner/customer can retrieve the signed record

## Source-of-truth note

The canonical binary DOCX fixture should be kept beside this manifest in the repository when the binary fixture is added to the local working tree. The SHA-256 above is the expected fixture identity for this prepared version.

Do not silently substitute a later edited agreement without updating this manifest, the expected hash, and the Agreement Lite acceptance evidence.
