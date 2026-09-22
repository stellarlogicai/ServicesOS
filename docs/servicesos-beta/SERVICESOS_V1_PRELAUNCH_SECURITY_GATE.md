# ServicesOS V1 Pre-Launch Security Gate

Status: **Required V1 release gate**  
Owner: Stellar Logic AI / Jamie Brown  
Applies to: Customer-facing ServicesOS V1  
Timing: After wife-beta-critical fixes and release-candidate freeze, before public launch

## Purpose

ServicesOS V1 must receive a structured defensive security review before public launch. The review is a release gate, not a feature-development phase and not permission to redesign the product.

The preferred external AI-assisted review path is OpenAI Daybreak Blue when available and approved for the workflow. If Daybreak Blue is unavailable, the same checklist still applies using the strongest approved defensive review tooling available. The release requirement is the security evidence and remediation outcome, not dependence on one vendor or model.

Daybreak or any other model acts as an auditor and analysis aid. ServicesOS remains authoritative for architecture, policy, tests, deployment decisions, and remediation. No model may autonomously deploy, change production configuration, alter payment state, or approve its own remediation.

## Release position

Run this gate only after:

1. wife beta has completed enough to identify beta-critical defects;
2. beta-critical defects are fixed and re-tested;
3. V1 scope is frozen;
4. the intended release candidate is identified by immutable commit SHA;
5. production architecture, Firebase rules, Functions, Stripe paths, SLAI Assistant paths, and deployment configuration are known.

Do not mix broad feature development into the security gate. A security finding may justify the smallest safe remediation necessary for release.

## Review method

Use controlled, evidence-driven slices rather than one unconstrained "find vulnerabilities" prompt.

For every review slice:

1. define the exact boundary and assets under review;
2. provide the current architecture/contracts and relevant code;
3. ask the defensive reviewer to identify assumptions, trust boundaries, abuse cases, and plausible failure modes;
4. require file/function/rule references or other concrete evidence for findings;
5. validate findings independently before changing code;
6. classify validated findings by release severity;
7. remediate in small controlled changes;
8. add or strengthen regression tests;
9. re-run the affected security slice;
10. record residual risk and the final disposition.

Unverified model output is not a confirmed vulnerability.

## Required security review areas

### 1. Architecture and threat model

- Map trust boundaries across web, Employee App, Firebase Auth, Firestore, Storage, Cloud Functions, Stripe/Connect, AI providers, and external/public entry points.
- Identify protected assets: tenant/customer data, employee data, field photos, estimates, bookings, payment state, Stripe identifiers, AI-credit state, business settings, secrets, and audit history.
- Enumerate relevant attacker positions: anonymous Internet user, authenticated customer, employee, tenant admin/owner, cross-tenant authenticated user, compromised browser/session, malicious uploaded/input content, and abused third-party callback.
- Review client-trust assumptions and identify security decisions that must be server/rules enforced.

### 2. Authentication, authorization, and identity

- Verify role boundaries and canonical identity resolution.
- Test cross-tenant access denial.
- Test privilege escalation and role confusion.
- Verify customer ownership/linking cannot be inferred approximately.
- Review duplicate or conflicting auth UID handling.
- Verify disabled/removed/reassigned identities lose access as intended.
- Review session/token-expiration behavior and stale authorization state.

### 3. Firestore and tenant isolation

- Review canonical and deployed Firestore rules.
- Verify tenant-scoped reads/writes for all V1 runtime collections and subcollections.
- Test direct-SDK bypass attempts against controls otherwise enforced in UI/services.
- Review field-level mutation boundaries for sensitive booking/payment/assignment/completion fields.
- Verify default-deny behavior for unsupported/legacy paths reachable in production.
- Confirm rule tests cover anonymous, wrong-role, wrong-tenant, stale assignment, and malformed-data cases.

### 4. Firebase Storage and file/photo handling

- Review Storage rules and parity with Firestore metadata authorization.
- Verify before/after field photos cannot cross tenant, booking, role, or assignment boundaries.
- Review upload metadata, content/type/size constraints where applicable, path construction, enumeration exposure, and unauthorized overwrite/delete behavior.
- Verify public principals are absent unless explicitly required.
- Review download/read authorization and lifecycle transitions.

### 5. Cloud Functions and backend/API boundaries

- Inventory V1-reachable Functions/endpoints.
- Verify authentication and tenant authorization are server-derived rather than client asserted.
- Review input validation, replay/idempotency, rate/abuse controls, error disclosure, and sensitive logging.
- Confirm retired legacy endpoints are not production-reachable.
- Review CORS and origin assumptions without treating CORS as authorization.

### 6. Stripe, Stripe Connect, and payment integrity

- Review Connect onboarding/account binding and canonical account ownership.
- Verify client-controlled redirects or parameters cannot establish payment truth.
- Verify webhook signature validation, event handling, replay/idempotency, and booking/tenant binding.
- Confirm one tenant cannot influence another tenant's Stripe/payment state.
- Verify checkout creation cannot mutate paid state.
- Verify only trusted webhook/backend paths establish Stripe-confirmed payment.
- Review platform-fee behavior, readiness checks, failure/retry behavior, and secret handling.
- Keep manual-payment truth distinct from Stripe-confirmed truth.

### 7. SLAI Assistant / AI security

- Map every provider-backed V1 path and the data permitted to reach the provider.
- Review prompt-injection and instruction-confusion risks from owner-entered, customer-derived, review, brand, booking, estimate, and other contextual text.
- Verify server-side allowlists and canonical context reloads cannot be overridden by client claims.
- Confirm AI output cannot directly send, publish, mutate authoritative business records, alter payment truth, or bypass human review.
- Review tool/action routing boundaries and deterministic-vs-provider authority.
- Verify tenant switching cannot leak stale AI/context results across tenants.
- Verify secrets/provider credentials never ship to browser/mobile bundles.
- Review credit reservation, restoration, idempotency, and abuse paths.

### 8. Public/customer-facing input and data exposure

- Review public forms, customer portal paths, estimate/quote intake, URLs/query parameters, and unauthenticated surfaces.
- Test enumeration/IDOR-style access against customer, booking, estimate, photo, and tenant identifiers.
- Review output/error messages for sensitive-data leakage.
- Confirm internal notes, field-only information, payment internals, employee-private information, and cross-customer data remain inaccessible.

### 9. Employee App / field security

- Verify assigned-job-only access.
- Review reassignment, cancellation, completion, archived/deleted jobs, and stale local state.
- Verify employee writes are limited to authorized field workflow data.
- Review photo, checklist, note/issue, completion, and payment permissions.
- Verify SLAI Work Assistant receives only authorized job/business context.
- Review device/session loss and authentication expiration behavior relevant to V1.

### 10. Secrets, configuration, deployment, and supply chain

- Scan tracked source and production bundles for credentials/secrets.
- Review environment-variable boundaries and privileged configuration.
- Review dependency exposure and actionable known vulnerabilities.
- Verify production Firebase/Stripe/provider configuration matches the release candidate's assumptions.
- Capture final deployed rules/config hashes or equivalent immutable evidence where practical.
- Confirm rollback material and release procedures do not expose secrets.

### 11. Logging, privacy, and auditability

- Verify sensitive customer/payment/provider data is not unnecessarily logged.
- Confirm important security-relevant actions have useful audit evidence.
- Review GrowthAI/SLAI Assistant Drafts/Activity and backend logs for accidental sensitive context.
- Confirm logs do not become a cross-tenant data path.
- Document data sent to third-party providers as part of V1.

### 12. Abuse, resilience, and failure behavior

- Review rate-limit/abuse exposure on public and provider-backed endpoints.
- Test malformed, repeated, concurrent, stale, and replayed requests where relevant.
- Verify provider, Stripe, Firebase, and network failures fail safely and truthfully.
- Verify security controls do not depend only on client UI state.
- Review denial-of-wallet/credit-consumption risks on AI-backed paths.

## Severity and release policy

### Critical
A validated issue that can plausibly cause major cross-tenant compromise, authentication/authorization bypass, payment-integrity compromise, secret compromise, arbitrary privileged action, or similarly severe impact.

**V1 policy: release blocker. Must be remediated and independently re-verified.**

### High
A validated exploitable issue with substantial confidentiality, integrity, authorization, payment, or account impact.

**V1 policy: release blocker unless the affected capability is safely disabled/removed from V1 and the resulting boundary is verified.**

### Medium
A validated issue with meaningful but constrained impact or significant defense-in-depth weakness.

**V1 policy: explicit disposition required. Fix before launch when reasonably achievable; otherwise document exploitability, compensating controls, owner acceptance, and a concrete post-launch remediation target. A Medium issue becomes a blocker when its real V1 exposure makes that appropriate.**

### Low / hardening
Limited-impact or defense-in-depth improvement.

**V1 policy: document and backlog unless the correction is low-risk and inexpensive.**

Severity is assigned from validated evidence and actual V1 exposure, not from an AI-generated label alone.

## Remediation rules

- Prefer the smallest safe fix.
- No opportunistic refactors during remediation.
- Preserve tenant isolation and existing canonical contracts.
- Every Critical/High remediation requires a regression test where technically practical.
- Re-run focused tests plus the relevant broader suite after each remediation slice.
- Payment, identity, Firebase rules, Storage, AI gateway, and deployment changes require their existing specialized validation.
- A finding is not closed merely because code changed; closure requires verification against the original failure mode.

## Final verification pass

After remediation:

1. re-run every Critical/High finding against the release candidate;
2. re-run the affected domain reviews;
3. run the full required V1 automated suites;
4. run final authenticated/unauthenticated and cross-tenant smokes;
5. run production/test-mode payment verification as defined by the release plan;
6. confirm no browser/mobile provider secret exposure;
7. confirm the release candidate SHA and deployed artifacts/configuration;
8. review all remaining Medium/Low findings and accepted risk;
9. produce a sanitized final security-gate report.

## Required evidence package

The final gate report must contain:

- release-candidate commit SHA;
- review date and reviewer/tooling used;
- reviewed surfaces and explicit exclusions;
- threat-model summary;
- findings with evidence and validation status;
- severity and rationale;
- remediation commits;
- regression tests added/updated;
- verification results;
- remaining accepted risks;
- production/configuration evidence appropriate to the boundary;
- final gate result.

Do not commit secrets, private rollback material, raw customer data, Stripe secrets, provider credentials, or exploit material that would unnecessarily increase risk.

## V1 acceptance criteria

The ServicesOS V1 pre-launch security gate is green only when:

- [ ] Review is run against the frozen intended release candidate.
- [ ] All required review areas above are completed or explicitly marked not applicable with rationale.
- [ ] No validated Critical finding remains open.
- [ ] No validated High finding remains open unless the affected capability is removed/disabled and the safe boundary is re-verified.
- [ ] Every Medium finding has an explicit documented disposition.
- [ ] Critical/High remediations have been re-tested against their original failure modes.
- [ ] Required automated security/regression suites are green.
- [ ] Cross-tenant, role, customer-privacy, employee-assignment, photo, AI, and payment boundaries have final evidence.
- [ ] Secrets/configuration review is green.
- [ ] Final sanitized security-gate report is committed.
- [ ] Jamie explicitly approves the security gate as satisfied before public launch.

## Stop conditions

Stop the review/remediation slice and escalate rather than improvising if:

- production/customer data would need destructive manipulation;
- a requested test could affect real payments or third-party accounts unexpectedly;
- production secrets would need to be exposed to an unapproved tool;
- the release candidate changes materially during the review;
- a finding implies broader compromise than the authorized test boundary;
- remediation would require a major architectural redesign rather than a controlled V1 fix.

## Non-goals

This gate does not:

- turn Daybreak into a runtime ServicesOS dependency;
- authorize autonomous exploitation of third-party systems;
- require a new security product or security dashboard;
- add unrelated V1 features;
- replace normal QA, wife beta, payment verification, or human approval;
- claim ServicesOS is "secure" in an absolute sense.

The goal is a documented, repeatable, evidence-based pre-launch security decision with human ownership.
