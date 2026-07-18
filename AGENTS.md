# ServicesOS Repository Instructions

## Read order

Before working, read:

1. This file.
2. The nearest nested `AGENTS.md` for the files being changed.
3. `docs/servicesos-beta/SERVICESOS_V1_CURRENT_STATE.md` for the changing checkpoint.
4. The task-specific reports or contracts named in the request.

Keep stable rules here. Keep changing branches, blockers, test totals, and next steps in the current-state document.

## Priority and scope

ServicesOS customer-facing V1 is the active build.

- Finish and stabilize V1 before parked features.
- Do not implement V1.1 ideas unless Jamie explicitly authorizes them.
- Recurring Service Plans, rotating tasks, Training Library expansion, Tap to Pay, route optimization, expenses, mileage, and GrowthAI remain parked unless a task says otherwise.
- Build the smallest safe slice that completes the approved workflow.

## Product principles

- AI assists; humans remain responsible for important decisions.
- Preserve honest states. Never fabricate payment, assignment, upload, save, deployment, or completion success.
- Tenant isolation is mandatory.
- Payment-link creation, booking creation, and manual payment records must never be presented as Stripe-confirmed payment.
- Do not weaken access controls to preserve unsafe legacy behavior.
- Preserve historical booking and checklist snapshots rather than silently rewriting completed work.

## Protected Git reference

Protected `master` / `origin/master` reference for the frozen wife-beta candidate:

`031bb46249fd09bbe7014e5f9747d4a7a4737a6f`

Unless the task explicitly authorizes it:

- Do not modify, merge, push, reset, rebase, or deploy `master`.
- Do not squash or rewrite established V1 lab history.
- Confirm the active branch and working-tree state before editing.
- Preserve unrelated work and ignored local evidence files.
- Do not commit until reporting back unless the task explicitly authorizes a commit.

## Production safety

Production Firebase project:

`cleaning-intake-system`

Local emulator projects must remain clearly separate from production.

Production actions require explicit, scope-specific approval, including:

- deployments
- Firestore or Storage rules
- indexes
- IAM or service permissions
- CORS
- Auth changes
- Firestore or Storage data writes
- migrations
- backups
- Hosting or application releases
- Stripe actions

Before any approved production command, state the exact target, command, expected write effect, and resources that will remain untouched. Stop when target, authorization, or command behavior is uncertain.

Never place credentials, tokens, service-account keys, raw customer identities, UIDs, tenant IDs, private object names, or production exports in tracked files.

## Implementation discipline

- Inspect existing code, rules, tests, and contracts before editing.
- Prefer focused changes with explicit acceptance criteria.
- Use existing canonical identifiers and data conventions.
- Do not create fallback tenants, first-record defaults, approximate identity matching, or fake compatibility layers.
- Do not modify payment, Stripe, price, customer, schedule, assignment, or tenant data from unrelated workflow slices.
- Add or update focused tests for changed behavior.
- Treat emulator success as necessary but not sufficient when a production platform limit or permission also applies.

## Validation

Run the smallest relevant focused checks first, then the full validation required by the task.

Standard validation may include:

- web focused tests
- full web test suite
- lint
- production build
- Cloud Functions tests
- Firestore rules tests
- Storage rules tests
- canonical/shared rules parity
- `git diff --check`
- sensitive-data scan
- `git status -sb`

Use repository-established commands. Do not invent global retries, skips, or timeout increases to hide failures. Report exact totals and known warnings honestly.

## Reporting

Report back with:

- branch and HEAD
- base or protected reference status
- files changed
- behavior changed
- tests and exact totals
- production commands and mutations, if any
- resources explicitly untouched
- blockers, risks, and stop conditions encountered
- documentation status
- recommended next action
- recommended commit message

Do not claim readiness beyond the evidence actually completed.