# ServicesOS V1 Authenticated Smoke Report

Smoke date: 2026-07-14

Branch: `v1-lab-authenticated-emulator-smoke`

Base commit: `64ac01d Add ServicesOS V1 authenticated smoke plan`

Protected production candidate: `master` / `origin/master` at `031bb46`

Environment: local Firebase Emulator Suite using `demo-servicesos-v1-smoke-local`

Deployment performed: No

## Executive Result

The local Auth, Firestore, and Storage emulator environment is reproducible and production guarded. All five required fake personas authenticated through the normal ServicesOS login screen. Admin, customer, Tenant B, and super-admin tenant-switch workflows persisted against emulator Firestore without touching production.

ServicesOS is **not ready for V1 promotion from this report**. One Field Mode release blocker was confirmed: the employee job list includes future cancelled and unassigned tenant bookings because its current list filter is date-only. Native field-photo upload remains Not Run and must be completed manually before promotion.

## Environment And Safety

| Check | Result |
| --- | --- |
| Emulator project | `demo-servicesos-v1-smoke-local` |
| Auth | `127.0.0.1:9099` |
| Firestore | `127.0.0.1:8080` |
| Storage | `127.0.0.1:9199` |
| Emulator UI | `http://127.0.0.1:4000/` |
| Browser app | Vite at `http://127.0.0.1:5176/` during this run |
| Personas | Five fake Auth users seeded and authenticated |
| Credentials | Generated in ignored `.servicesos-smoke-credentials.local.json` |
| Production fallback | Blocked by explicit flag, exact demo project check, and seed host/project guards |
| Production writes | None |
| Deployment | None |
| `master` / `origin/master` | Unchanged at `031bb46` |

## Seed And Reset Evidence

- Emulator startup: Passed for Auth, Firestore, Storage, and Emulator UI.
- Initial deterministic seed: Passed; 5 Auth users and 17 Firestore documents created.
- Reset/reseed: Passed; emulator Auth, Firestore, and Storage cleared and rebuilt.
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
| Download all four CSVs | Pass for download actions; CSV file contents Not Run in browser automation |
| Completed field summary, notes, and issue | Pass |
| Manual cash payment distinction | Pass |
| Customer archive | Pass; action removed it from the active list and emulator inspection confirmed `isArchived`, `archivedAt`, and the record remained present |
| Completed booking cancellation unavailable | Pass |
| Before/after photo review | Not Run; no uploaded fixtures existed |

### Tenant A employee

Overall: **Failed - confirmed release blocker.**

| Check | Result |
| --- | --- |
| Normal login and Field Mode landing | Pass |
| Only Field Mode and Sign out in navigation | Pass |
| Payment badge hidden | Pass |
| Owner/internal notes hidden | Pass |
| Approved access instructions visible | Pass |
| Start Job persistence | Pass |
| Checklist persistence | Pass; 3/3 after refresh |
| Employee note and issue persistence | Pass |
| Missing-after-photo completion warning | Pass |
| Complete Anyway after explicit warning | Pass |
| Completion preserves booking/payment truth | Pass by emulator inspection: booking remained scheduled, `not_paid`, `$185`, same customer; field status became completed |
| Before/after upload and refresh | Not Run; native file chooser unavailable to browser automation |
| Invalid and oversized upload rejection | Not Run for the same reason; fixtures are ready for manual use |
| Job-list safety | **Fail:** future cancelled and unassigned Tenant A bookings appeared in employee Field Mode |

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
- Switching to Tenant B cleared Tenant A content and loaded exactly one Tenant B booking.
- Clearing selection restored the selection-required state.
- Refresh did not persist selection and required explicit reselection.
- The fixture loader is enabled only when both the explicit emulator flag and exact demo project ID match; normal Tenant Management behavior is unchanged.

## Cross-Tenant Result

Browser-visible tenant separation passed for Tenant A admin, Tenant B admin, and super-admin switching. Tenant B booking/export views contained no Tenant A fixtures. Existing Firestore and Storage rules tests remain the direct denial evidence for cross-tenant reads and writes; their final totals are recorded after validation.

The employee's visibility of all same-tenant bookings is not a cross-tenant leak, but it is an authorization/work-assignment gap and a V1 blocker.

## Payment Truth

Passed for exercised emulator workflows:

- quote request remained distinct from booking;
- customer submission created no booking/payment state;
- admin conversion created a booking without increasing collected revenue;
- employee field completion did not change payment status, price, customer, or booking status;
- completed seed booking remained visibly manual cash payment;
- no Stripe APIs, secrets, checkout sessions, webhooks, fees, or refunds were used.

Stripe-confirmed payment behavior was intentionally not exercised in this emulator smoke.

## Persistence

Passed for:

- admin-created booking after reload;
- Business Settings after save, reload, and navigation away/back;
- employee start/checklist/note/issue/completion after refresh;
- customer quote request after refresh;
- super-admin explicit selection clearing after refresh.

Photo persistence remains Not Run.

## Findings And Classification

| Finding | Class | Required action |
| --- | --- | --- |
| Employee Field Mode includes cancelled future bookings | D - V1 blocker | Add a narrow active-status filter and focused tests before V1 promotion. |
| Employee Field Mode includes unassigned same-tenant bookings | D unless owner-operated visibility is explicitly accepted; otherwise V1.1 only with documented risk | Define the canonical assignment contract, then filter/query and enforce assignment consistently in rules. Do not guess assignment fields. |
| Field-photo UI upload, persistence, and rejection cases not run | A - validation tooling/manual step | Run the prepared files through the native browser chooser and inspect Storage metadata/object paths. |
| CSV files downloaded but contents not inspected | A - validation tooling/manual step | Open the four generated files and verify tenant-only rows and payment distinctions. |
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
- Web tests: 46 files, 373 tests passed.
- Web build: Passed; existing large-chunk and mixed dynamic/static Firebase import warnings only.
- Cloud Functions tests: 39/39 passed.
- Firestore rules tests: 27/27 passed.
- Storage rules tests: 12/12 passed.
- Rules parity: Passed.
- Emulator startup: Passed for Auth, Firestore, Storage, and Emulator UI.
- Seed: Passed; 5 personas and 17 Firestore documents.
- Reset/reseed: Passed and restored the deterministic baseline after browser smoke.
- Authenticated browser login: Passed for all five required personas.
- Built-app HTTP smoke: Passed with HTTP 200 at `http://127.0.0.1:5270/`.
- `git diff --check`: Passed in the final status audit.

## Recommendation

Do not promote this branch yet. First fix the employee Field Mode active/assignment visibility gap in an isolated branch, then manually run the prepared field-photo uploads and inspect CSV contents. Keep all production rules, Firebase data, Storage, deployment, and Stripe work separate.
