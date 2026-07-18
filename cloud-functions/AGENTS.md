# Firebase and Backend Instructions

These instructions apply to `cloud-functions/**` and supplement the repository root `AGENTS.md`.

## Security boundaries

Treat Firestore rules, Storage rules, Cloud Functions, and Stripe webhook code as security boundaries.

- Use explicit allowlists and exact state transitions.
- Preserve tenant isolation.
- Do not add broad `request.auth != null` fallbacks.
- Do not trust client-provided role, tenant, assignment, payment, or Stripe state.
- Do not introduce `DEFAULT`, first-record, or first-tenant fallbacks.
- Customer identity requires exact Auth UID, protected profile role, and matching tenant ownership.
- Employee photo/job access requires exact canonical assignment where the contract requires it.

## Canonical rules

Canonical sources:

- `cloud-functions/firestore.rules`
- `cloud-functions/storage.rules`

Required mirrors:

- `shared/firestore.rules`
- `shared/storage.rules`

Keep each canonical file byte-identical to its mirror. Run the repository parity check after every rules change.

Do not change Firestore and Storage rules in the same slice unless the task explicitly requires both contracts.

## Storage and Firestore integration

- Keep intended Storage rule evaluations within Firebase platform document-access limits.
- Count distinct Firestore document lookups structurally; do not rely on undocumented caching.
- Preserve private authenticated reads through approved paths.
- Do not add public object access or persist public download URLs for private field evidence.
- Keep file type, nonzero-size, size-limit, phase, path, update, and delete restrictions explicit.

## Payments and Stripe

- Trusted Stripe state comes only from approved backend/webhook paths.
- Client writes must not fabricate paid, refunded, payout-ready, session, intent, or connected-account status.
- Manual payment records must remain distinguishable from Stripe-confirmed payments.
- Do not alter fees, refunds, onboarding, checkout, webhooks, or connected-account behavior in unrelated tasks.

## Production and emulators

- Emulator tests must use fake demo project IDs and loopback services only.
- Never point seed/reset scripts or rules tests at production.
- Production deployments, IAM, rules, indexes, backups, CORS, and data corrections require exact approval.
- A deployment command must target only the approved Firebase resource.
- Capture rollback references before an approved production rules deployment.

## Testing

For authorization changes, test both allowed and denied paths, including:

- own tenant
- cross tenant
- anonymous
- customer
- active/inactive admin
- assigned/unassigned/reassigned employee
- archived/deleted/cancelled records where applicable
- unsupported mutation fields
- payment and Stripe invariants

Passing emulator tests do not override an identified production platform limitation.