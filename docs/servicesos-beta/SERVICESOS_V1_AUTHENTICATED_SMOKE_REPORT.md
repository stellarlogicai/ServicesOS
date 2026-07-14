# ServicesOS V1 Authenticated Smoke Report

Smoke date: 2026-07-14

Branch: `v1-lab-field-assignment-visibility`

Base commit: `42bcee132fb02e89f320487363b35dc157085c4d`

Protected production candidate: `master` / `origin/master` at `031bb46`

Environment: local Firebase Emulator Suite using `demo-servicesos-v1-smoke-local`

Deployment performed: No

## Executive Result

The local Auth, Firestore, and Storage emulator environment remains reproducible and production guarded. This follow-up smoke verified the canonical employee assignment contract, owner/admin assignment and reassignment, employee-only active-job visibility, super-admin tenant switching, payment truth, and tenant-scoped CSV exports without touching production.

The confirmed Field Mode visibility blocker and owner-operator photo gap are resolved on this isolated lab branch. Employees see only current/future active bookings whose canonical `assignedEmployeeAuthUid` exactly matches their Firebase Auth UID. Unassigned, cancelled, another employee's, cross-tenant, and legacy-ID-only bookings do not grant employee access. Tenant admins can capture evidence in Field Mode without creating an employee assignment, and Booking Detail remains read-only. Production rules/index state must still be captured before any promotion or deployment.

## Environment And Safety

| Check | Result |
| --- | --- |
| Emulator project | `demo-servicesos-v1-smoke-local` |
| Auth | `127.0.0.1:9099` |
| Firestore | `127.0.0.1:8080` |
| Storage | `127.0.0.1:9199` |
| Emulator UI | `http://127.0.0.1:4000/` |
| Browser app | Vite at `http://127.0.0.1:5173/` during this run |
| Personas | Five fake Auth users seeded and authenticated |
| Credentials | Generated in ignored `.servicesos-smoke-credentials.local.json` |
| Production fallback | Blocked by explicit flag, exact demo project check, and seed host/project guards |
| Production writes | None |
| Deployment | None |
| `master` / `origin/master` | Unchanged at `031bb46` |

## Seed And Reset Evidence

- Emulator startup: Passed for Auth, Firestore, Storage, and Emulator UI.
- Initial deterministic seed: Passed; 5 Auth users and 19 Firestore documents created.
- Reset/reseed: Passed; emulator Auth, Firestore, and Storage cleared and rebuilt.
- Assignment fixtures: Passed; assigned active, unassigned active, other-employee assigned, completed, and future cancelled bookings were created for Tenant A.
- Employee directory fixture: Passed; a second active Tenant A employee profile was created without adding another login persona.
- Generated upload fixtures: JPEG, PNG, WebP, invalid text, and oversized binary created under ignored local fixtures.
- Seed safety tests: require all emulator hosts, reject non-loopback/production-like targets, and reject service-account credentials.

## Persona Results

### Tenant A admin

Overall: **Passed with partial items noted.**

| Check | Result |
| --- | --- |
| Normal login and Dashboard | Pass |
| Existing request and revenue snapshot | Pass |
| Convert request to booking | Pass |
| Refresh persistence | Pass |
| Booking creation does not collect payment | Pass; expected revenue increased while collected revenue stayed at `$320` |
| Calendar tenant data/read-only behavior | Pass |
| Business Settings save and refresh persistence | Pass |
| Stripe status read-only and production calls avoided | Pass; unavailable local Functions produced honest status instead of a false success |
| Data Export surfaces/counts | Pass |
| Download all four CSVs | Pass; customers 2 rows, leads 1 row, bookings 5 rows, and payments 5 rows |
| CSV tenant/payment inspection | Pass; no Tenant B rows or Stripe secrets, and manual cash versus unpaid/deposit-requested states remained distinct |
| Employee assignment control | Pass; only the two active Tenant A employee profiles appeared |
| Assign and reassign booking | Pass; assignment persisted and the employee's Field Mode list updated after each change |
| Assignment preserves booking truth | Pass; price, date, customer, payment status, and payment method were unchanged |
| Completed field summary, notes, and issue | Pass |
| Manual cash payment distinction | Pass |
| Customer archive | Pass; action removed it from the active list and emulator inspection confirmed `isArchived`, `archivedAt`, and the record remained present |
| Completed booking cancellation unavailable | Pass |
| Before/after photo review | Pass; persisted employee evidence displayed read-only in Booking Detail with no upload/edit/delete controls |
| Owner-operator Field Mode photo capture | Pass; Tenant A admin uploaded before and after evidence on an unassigned Tenant A booking and both persisted after refresh |
| Owner photo validation | Pass; unsupported type and file above 10 MB were rejected without replacing persisted evidence |
| Owner photo data integrity | Pass; assignment, payment, Stripe, price, date, customer, lead, and parent booking fields remained unchanged |

### Tenant A employee

Overall: **Passed for assignment visibility and native photo evidence.**

| Check | Result |
| --- | --- |
| Normal login and Field Mode landing | Pass |
| Only Field Mode and Sign out in navigation | Pass |
| Payment badge hidden | Pass |
| Owner/internal notes hidden | Pass |
| Approved access instructions visible | Pass |
| Start Job persistence | Pass |
| Checklist persistence | Pass after refresh |
| Employee note and issue persistence | Pass |
| Missing-after-photo completion warning | Pass |
| Complete Anyway after explicit warning | Pass |
| Completion preserves booking/payment truth | Pass by emulator inspection: booking remained scheduled, `not_paid`, `$185`, same customer; field status became completed |
| Before/after upload and refresh | Pass; assigned employee uploaded valid before and after fixtures and both persisted after refresh |
| Invalid and oversized upload rejection | Pass; unsupported type and file above 10 MB were rejected without persistence |
| Assigned active-job visibility | Pass; only the current active booking assigned to the signed-in employee appeared |
| Unassigned booking hidden | Pass; it appeared only after the admin assigned it to the employee |
| Other employee booking hidden | Pass |
| Future cancelled assigned booking hidden | Pass |
| Reassignment revokes visibility | Pass; the booking disappeared after reassignment to the second Tenant A employee |
| Legacy assignment fields | Pass in focused tests; legacy employee-record IDs do not grant Field Mode access |

### Tenant A linked customer

Overall: **Passed with one partial form-control observation.**

| Check | Result |
| --- | --- |
| Normal login and Customer Portal-only navigation | Pass |
| Linked identity by `authUid` | Pass |
| Own quote requests only | Pass |
| Submit fake quote request | Pass |
| Exact not-a-confirmed-booking wording | Pass |
| Refresh persistence | Pass; quote count increased to 2 |
| No automatic booking or payment | Pass by emulator inspection; new request had no booking ID or payment status and booking count increased only from the earlier admin conversion |
| No admin/export/Field Mode navigation | Pass |
| Preferred-date control | Partial; automated fill did not persist in the preview, not reproduced manually |
| Unlinked-customer denial | Not Run; the required five-persona fixture set does not include a sixth unlinked customer |

### Tenant B admin

Overall: **Passed.**

- Normal login loaded `ServicesOS Smoke Cleaning B`.
- Dashboard showed only Tenant B's lead and `$475` expected revenue.
- Bookings showed exactly one Tenant B booking and no Tenant A customer.
- Data Export showed one record in each of customers, leads, bookings, and payment records.

### Super-admin

Overall: **Passed after emulator-only fixture discovery was added.**

- With no tenant selected, tenant-scoped pages showed `Select a tenant to view this area.`
- Tenant Management loaded the two deterministic emulator tenants only.
- Selecting Tenant A loaded Tenant A booking data.
- Tenant A booking detail exposed the same active-employee assignment control used by tenant admins.
- Switching to Tenant B cleared Tenant A content and loaded exactly one Tenant B booking.
- Tenant B Field Mode retained tenant-wide owner/super-admin visibility and did not show Tenant A records.
- Clearing selection restored the selection-required state.
- Refresh did not persist selection and required explicit reselection.
- The fixture loader is enabled only when both the explicit emulator flag and exact demo project ID match; normal Tenant Management behavior is unchanged.

## Cross-Tenant Result

Browser-visible tenant separation passed for Tenant A admin, Tenant B admin, employee assignment transitions, and super-admin switching. Tenant B booking/export/Field Mode views contained no Tenant A fixtures. Firestore and Storage rules tests directly verified cross-tenant denial, assignment transfer, customer denial, and owner/admin review access.

## Payment Truth

Passed for exercised emulator workflows:

- quote request remained distinct from booking;
- customer submission created no booking/payment state;
- admin conversion created a booking without increasing collected revenue;
- employee field completion did not change payment status, price, customer, or booking status;
- admin assignment and reassignment did not change payment status, price, schedule, customer, or Stripe fields;
- completed seed booking remained visibly manual cash payment;
- payment CSV kept the completed `$320` cash record distinct from unpaid and deposit-requested bookings;
- no Stripe APIs, secrets, checkout sessions, webhooks, fees, or refunds were used.

Stripe-confirmed payment behavior was intentionally not exercised in this emulator smoke.

## Persistence

Passed for:

- admin-created booking after reload;
- Business Settings after save, reload, and navigation away/back;
- employee start/checklist/note/issue/completion after refresh;
- admin assignment after refresh and employee visibility after sign-out/sign-in;
- reassignment removal from the original employee's Field Mode list;
- customer quote request after refresh;
- super-admin explicit selection clearing after refresh.

Assigned-employee and tenant-admin owner-operator photo persistence passed. Tenant A admin uploaded both phases from Field Mode without an employee assignment; Booking Detail displayed the same evidence read-only. Super-admin upload also required an explicit Tenant A selection, wrote only under Tenant A, and Tenant A state cleared after switching to Tenant B.

## Findings And Classification

| Finding | Class | Required action |
| --- | --- | --- |
| Employee Field Mode included cancelled future bookings | Resolved on this branch | Active employee queries allow only `scheduled` and `completed`, then apply a defensive active/deleted/archive filter. |
| Employee Field Mode included unassigned same-tenant bookings | Resolved on this branch | `assignedEmployeeAuthUid` is the sole V1 authority and must equal the signed-in employee's Auth UID. Firestore and Storage rules enforce the same contract. |
| Assigned-employee field-photo upload, persistence, and rejection cases | Resolved by manual smoke | Valid before/after evidence persisted after refresh; invalid type and over-10-MB fixtures were rejected; Booking Detail stayed read-only. |
| Tenant admin owner-operator could not upload Field Mode evidence without an employee assignment | Resolved by manual smoke | Tenant admin upload succeeded on an unassigned own-tenant booking, preserved parent booking truth, and did not grant an unassigned employee access. |
| CSV content inspection was outstanding | Resolved in this follow-up smoke | All four files were parsed; counts, headers, Tenant A-only content, no Stripe secrets, and payment distinctions were confirmed. |
| Full-suite GrowthAI Phase 0 test exceeded the fixed 5-second timeout | Resolved with test-only reliability scope | Isolated execution remained fast. A 10-second timeout was applied only to the affected render-heavy test; two consecutive exact full-suite runs passed 388/388. GrowthAI application behavior was unchanged. |
| Preferred-date automated fill did not remain in customer preview | C - unconfirmed UI annoyance | Reproduce manually before changing code. |
| Production rules, Storage CORS, and object inventory not verified | B - production gate | Capture deployed state and inventory before any rules deployment. |

## Production-Only Checks Still Outstanding

- Capture exact deployed Firestore and Storage rules.
- Verify production Storage CORS for approved web origins.
- Inventory production Storage objects, including legacy and `DEFAULT` paths.
- Validate production/staging identity and tenant membership data.
- Run real Stripe test-mode checkout/webhook confirmation separately.
- Repeat the approved smoke in staging or a separately approved test tenant before customer rollout.

## Validation Totals

- Web lint: Passed.
- Owner-photo focused web tests: 5 files, 77 tests passed.
- Initial full web run during the owner-photo correction: 47 files, 388 tests passed.
- Isolated GrowthAI verification after the test-only correction: 1 file, 2 tests passed in 2.3 seconds.
- First exact final full-suite run: 47 files, 388 tests passed.
- Second consecutive exact final full-suite run: 47 files, 388 tests passed.
- Web build: Passed; existing large-chunk and mixed dynamic/static Firebase import warnings only.
- Cloud Functions tests: 39/39 passed.
- Firestore rules tests: 35/35 passed.
- Storage rules tests: 15/15 passed.
- Rules parity: Passed.
- Emulator startup: Passed for Auth, Firestore, Storage, and Emulator UI.
- Seed: Passed; 5 Auth personas and 19 Firestore documents.
- Reset/reseed: Passed before the final owner/admin, employee, customer, and super-admin photo smoke.
- Authenticated browser login: Passed for all five required personas.
- Built-app HTTP smoke: Passed with HTTP 200 at `http://127.0.0.1:5261/`.
- `git diff --check`: Passed in the final status audit.

## Recommendation

The Field Mode active/assignment visibility blocker, assigned-employee photo flow, and tenant-admin owner-operator photo flow are validated on this isolated branch. The unrelated full-suite GrowthAI timeout remains resolved with a narrowly scoped test-only correction. Do not promote or deploy yet: capture deployed Firestore/Storage rules and index state and review the branch independently before integration. Keep all production rules, Firebase data, Storage, deployment, and Stripe work separate.
