# Selective PR #9 Hardening Reconciliation

Audit baseline: `feature/owner-onboarding-v1` at `7337306def398df2b79ffdf4b7419679027acf80`.
Reference only: `hardening/firebase-cost-guardrails` (`180e5b6`, `11a94c1`, `36d8d8e`).

No PR #9 commit was merged, rebased, or cherry-picked. The protected
`sistant_Beta_UX_WIP.patch` is unrelated and remains untouched.

| PR #9 protection/change | Current V1 status | Classification | Evidence | Action required |
|---|---|---|---|---|
| Customer-email canonical auth/user validation | Active and server-enforced | PRESENT IN CURRENT V1 | `cloud-functions/sendCustomerEmail.js`; focused email tests | None |
| Customer-email tenant/admin authorization | Active, including tenant admin and super-admin paths | PRESENT IN CURRENT V1 | `sendCustomerEmail.js`; `sendCustomerEmail.test.js` | None |
| Email request shape and type allowlist | Exact keys and supported email types enforced | PRESENT IN CURRENT V1 | `sendCustomerEmail.js` | None |
| Subject/body and PDF attachment bounds | Server-side limits and PDF validation enforced | PRESENT IN CURRENT V1 | `sendCustomerEmail.js`; focused tests | None |
| Email idempotency and ledger | Operation idempotency and server ledger present | PRESENT IN CURRENT V1 | `sendCustomerEmail.js`; ledger tests | None |
| Platform, tenant, and actor quotas | 75/day platform, 50/day tenant, 20/hour actor | PRESENT IN CURRENT V1 | `sendCustomerEmail.js`; quota tests | None |
| Provider timeout, retry, and fail-closed control | Bounded timeout/retry; `CUSTOMER_EMAIL_PROVIDER_ENABLED` defaults false | PRESENT IN CURRENT V1 | `sendCustomerEmail.js`, `index.js`, configuration tests | None |
| Email ledger/quota client protection | Server-owned writes; rules deny ledger and usage paths | PRESENT IN CURRENT V1 | `cloud-functions/firestore.rules` and `shared/firestore.rules` | None |
| Customer-email runtime bound | Explicit `minInstances: 0`, `maxInstances: 3` | PRESENT IN CURRENT V1 | `index.js`; configuration test | None |
| GrowthAI explicit provider enablement | `GROWTHAI_PROVIDER_ENABLED` is explicit and defaults false | PRESENT IN CURRENT V1 | `growthAIProvider.js`, `index.js`, provider tests | None |
| GrowthAI fail-closed provider construction | Disabled/malformed configuration cannot call external provider | PRESENT IN CURRENT V1 | Central provider factory and tests | None |
| GrowthAI deterministic/free behavior | Deterministic paths remain available when provider is disabled | PRESENT IN CURRENT V1 | GrowthAI gateway/provider tests | None |
| GrowthAI credits/accounting compatibility | Existing reservation/restoration semantics unchanged | PRESENT IN CURRENT V1 | Existing and focused GrowthAI suites | None |
| GrowthAI runtime bounds | Generation, balance, and routing functions are 0/3 | PRESENT IN CURRENT V1 | `index.js`; `growthAIFunctionConfiguration.test.js` | None |
| PR #9 universal 0/3 policy | Not applied to every current function | INTENTIONALLY EXCLUDED | Accepted Slice 3 deployment decision and `deploymentGuardrails.test.js` | Retain selective policy; revisit only with payment/load evidence |
| Stripe/Connect legacy runtime caps | Five legacy/payment endpoints remain inherited/default | INTENTIONALLY EXCLUDED | `deploymentGuardrails.test.js` | No change in this audit |
| Public Stripe webhook invoker | Public invoker behavior preserved | PRESENT IN CURRENT V1 | `index.js`; deployment guardrail test | None |
| New owner billing/subscription runtime settings | Current bounded settings preserved | PRESENT IN CURRENT V1 | `ownerOnboardingBillingGateway`, `ownerSubscriptionActivationWebhook` configuration tests | None |
| PR #9 old Firebase rules wholesale | Not copied into current branch | SUPERSEDED BY NEWER V1 ARCHITECTURE | Current canonical/shared rules and parity | Do not port old rules |
| Email ledger/quota rule denial | Equivalent current catch-all/explicit denial exists | PRESENT IN CURRENT V1 | Canonical and shared Firestore rules | None |
| Old field-photo quota/upload implementation | Replaced by current reconciled V1 field-photo gateway | SUPERSEDED BY NEWER V1 ARCHITECTURE | `fieldPhotoUploadGateway.js`, current Firestore/Storage rules and tests | Do not port old implementation |
| Field-photo quota and exact reservation semantics | 20 total slots, bounded object size, reserve/upload/finalize, immutable metadata | PRESENT IN CURRENT V1 | Field-photo gateway, rules, and focused tests | None |
| Old PR #9 Stripe/payment behavior | Not used as the current payment architecture | SUPERSEDED BY NEWER V1 ARCHITECTURE | Current owner onboarding/payment functions and tests | Do not port old behavior |
| PR #9 broad 11-function inventory | Current V1 has a newer mixed function inventory | SUPERSEDED BY NEWER V1 ARCHITECTURE | Current `index.js` and deployment tests | Maintain explicit exceptions |
| Other PR #9 provider/config changes | Accepted customer-email and GrowthAI controls were reconciled selectively | PRESENT IN CURRENT V1 | `b3014a5`, `b760850`, `7337306` | None |

## Conclusion

No item is classified **STILL MISSING** for the accepted selective hardening
scope. PR #9 is fully reconciled where its protections apply, and the
remaining older implementation is superseded reference material rather than
an outstanding migration. The intentional uncapped Stripe/Connect endpoints
remain the only documented deployment concern; changing them requires
measured payment/load evidence and is outside this audit.

This audit made no application, rules, production, billing, deployment, push,
merge, or protected-artifact changes.
