# ServicesOS V1 Firebase Emulator Smoke Setup

This environment is for local authenticated ServicesOS V1 validation only. It uses fake identities, fake tenants, local Firebase emulators, and a Firebase `demo-` project ID. It does not require or write production Firebase credentials.

## Prerequisites

- Node.js and npm compatible with the repository lockfiles
- Java 17 or later for the Firebase Emulator Suite
- Three PowerShell terminals
- Repository checked out on the intended V1 lab branch

The configured local project is `demo-servicesos-v1-smoke-local`. Firebase recommends `demo-` project IDs for emulator-only work because they do not represent live Firebase resources and failed non-emulated access is prevented. See [Install, configure and integrate Local Emulator Suite](https://firebase.google.com/docs/emulator-suite/install_and_configure).

## Ports

| Service | Address |
| --- | --- |
| Emulator UI | `http://127.0.0.1:4000/` |
| Firestore | `127.0.0.1:8080` |
| Auth | `127.0.0.1:9099` |
| Storage | `127.0.0.1:9199` |
| Vite | `http://127.0.0.1:5173/` by default |

Change the Vite port if it is occupied. Keep the Firebase emulator ports unchanged unless both Firebase and `.env.v1-smoke` are updated together.

## 1. Start Firebase Emulators

From `cloud-functions`:

```powershell
cd C:\Users\merce\Documents\SLAI_Real\ServicesOS\cloud-functions
npm run emulators:v1-smoke
```

Keep this terminal running. Confirm Auth, Firestore, and Storage appear in the Emulator UI.

## 2. Reset And Seed

Open a second PowerShell terminal:

```powershell
cd C:\Users\merce\Documents\SLAI_Real\ServicesOS\cloud-functions

$env:GCLOUD_PROJECT = 'demo-servicesos-v1-smoke-local'
$env:FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
$env:FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199'
Remove-Item Env:GOOGLE_APPLICATION_CREDENTIALS -ErrorAction SilentlyContinue

npm run reset:v1-smoke
```

Use `npm run seed:v1-smoke` only when the emulators are empty. `reset:v1-smoke` clears local emulator Auth, Firestore, and Storage before reseeding.

The script refuses to run unless all three emulator hosts are loopback addresses, `GCLOUD_PROJECT` is the exact demo project, and service-account credentials are absent.

## 3. Start ServicesOS

Open a third PowerShell terminal:

```powershell
cd C:\Users\merce\Documents\SLAI_Real\ServicesOS\servicesos-web
npm run dev:v1-smoke -- --host 127.0.0.1 --port 5173 --strictPort
```

Open `http://127.0.0.1:5173/`. The normal ServicesOS login screen must render. The development console should report emulator mode for `demo-servicesos-v1-smoke-local` without printing credentials.

`.env.v1-smoke` explicitly enables Auth, Firestore, and Storage emulator connections. Normal/default Vite modes remain unchanged and do not connect to localhost. See Firebase's official connection guidance for [Auth](https://firebase.google.com/docs/emulator-suite/connect_auth), [Firestore](https://firebase.google.com/docs/emulator-suite/connect_firestore), and [Storage](https://firebase.google.com/docs/emulator-suite/connect_storage).

## Fake Personas

| Persona | Email | Tenant |
| --- | --- | --- |
| Tenant A admin | `admin-a@servicesos.test` | `tenant-smoke-a` |
| Tenant A employee | `employee-a@servicesos.test` | `tenant-smoke-a` |
| Tenant A linked customer | `customer-a@servicesos.test` | `tenant-smoke-a` |
| Tenant B admin | `admin-b@servicesos.test` | `tenant-smoke-b` |
| Super-admin | `superadmin@servicesos.test` | Explicit selection only |

The reset/seed command writes the shared fake emulator password and account list to:

`C:\Users\merce\Documents\SLAI_Real\ServicesOS\.servicesos-smoke-credentials.local.json`

That file is ignored by Git. These accounts exist only in the local Auth emulator and cannot authenticate to production.

## Seeded Data

- Tenant A: two customers, one linked customer quote request, and five bookings covering assigned field-ready, unassigned payment-pending, another employee's assigned job, completed/manual-paid, and future cancelled states.
- Tenant B: visibly distinct customer, lead, and scheduled booking.
- Payment states are fake Firestore fixtures only. No Stripe IDs, secrets, API calls, or fake webhook confirmation are created.
- Tenant A includes one login employee and one additional non-login employee profile so assignment and reassignment can be tested without adding a sixth Auth persona.
- Employee assignment uses `assignedEmployeeAuthUid`, which is the assigned employee's Firebase Auth UID and `users/{uid}` document ID. Legacy employee-record identifiers do not grant Field Mode access.
- Tenant A includes employee-visible access instructions and separate owner-only notes.
- A successful reset creates five fake Auth personas and 19 Firestore documents.
- Generated upload fixtures are placed in the ignored `.servicesos-smoke-fixtures.local` directory: valid JPEG/PNG/WebP, invalid text, and an oversized binary over 10 MB.

## Run The Smoke

Follow `docs/servicesos-beta/SERVICESOS_V1_MANUAL_SMOKE_CHECKLIST.md` and sign out fully between personas. Use the Emulator UI to inspect:

- Authentication users
- `users/{uid}` profiles
- `tenants/tenant-smoke-a/**`
- `tenants/tenant-smoke-b/**`
- Storage objects under canonical tenant booking paths

Do not bypass AuthContext or inject roles into React state.

## Stop And Reset

- Stop Vite and the Firebase emulators with `Ctrl+C` in their terminals.
- Run `npm run reset:v1-smoke` while emulators are running whenever a clean deterministic fixture set is needed.
- Emulator state is disposable. Do not copy emulator records into production.

## Production Safety Warnings

- Never change the demo project ID to `cleaning-intake-system`.
- Never set `GOOGLE_APPLICATION_CREDENTIALS` for the seed/reset command.
- Never remove the emulator-host guards.
- Do not use real customer data, real passwords, Stripe IDs, or production exports.
- This setup does not deploy rules, functions, or the web application.

## Limitations

- Emulator results do not prove which Firestore or Storage rules are deployed in production.
- Storage emulator results do not prove production Storage CORS behavior.
- This environment does not inventory production Storage objects or legacy paths.
- Stripe Connect, Checkout, webhook confirmation, fees, and refunds remain separate production/test-mode validation work.
- Native file upload controls still require a manual browser pass when the automation environment cannot operate the system file chooser.
- The required five personas do not include the optional unlinked-customer denial persona.
