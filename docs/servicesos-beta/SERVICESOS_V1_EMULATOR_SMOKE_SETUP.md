# ServicesOS V1 Firebase Emulator Smoke Setup

This environment is for local authenticated ServicesOS V1 validation only. It uses fake identities, fake tenants, local Firebase emulators, and a Firebase `demo-` project ID. It does not require or write production Firebase credentials.

## Prerequisites

- Node.js and npm compatible with the repository lockfiles
- Java 17 or later for the Firebase Emulator Suite
- Android SDK/AVD only when exercising Employee App native smoke coverage
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
| Functions | `127.0.0.1:5001` |
| Vite | `http://127.0.0.1:5173/` by default |

Change the Vite port if it is occupied. Keep the Firebase emulator ports unchanged unless both Firebase and `.env.v1-smoke` are updated together.

## 1. Start Firebase Emulators

From `cloud-functions`:

```powershell
cd C:\Users\merce\Documents\SLAI_Real\ServicesOS\cloud-functions

# Firebase Functions Emulator resolves bound secrets before the mock provider runs.
# This ignored placeholder prevents any Secret Manager lookup and is not a real secret.
Set-Content -LiteralPath .secret.local -NoNewline -Value 'GROWTHAI_PROVIDER_API_KEY=local-smoke-placeholder'
Add-Content -LiteralPath .env.local -Value 'GROWTHAI_PROVIDER_MODE=mock'
Add-Content -LiteralPath .env.local -Value 'FUNCTIONS_EMULATOR=true'
Add-Content -LiteralPath .env.local -Value 'GROWTHAI_LOCAL_MOCK_PROJECT_ID=demo-servicesos-v1-smoke-local'

npm run emulators:v1-smoke
```

Keep this terminal running. Confirm Auth, Firestore, Functions, and Storage appear in the Emulator UI. The smoke command plus ignored local mock mode enable the Functions-only deterministic GrowthAI mock for the exact local demo project; it cannot use a real provider. The ignored `.secret.local` placeholder is required only because the emulator resolves bound secrets before that mock path is selected; never put a real secret in it.

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

## 4. Start Employee App Native Smoke

For the Android emulator, start Expo with the required local public configuration in its process environment. The Firebase client identifiers below are intentionally non-secret local placeholders; all backend traffic is pinned to the demo emulator project.

```powershell
cd C:\Users\merce\Documents\SLAI_Real\ServicesOS\employee-app

$env:EXPO_PUBLIC_SERVICESOS_FIREBASE_MODE = 'local-emulator'
$env:EXPO_PUBLIC_FIREBASE_API_KEY = 'local-smoke-api-key'
$env:EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN = 'demo-servicesos-v1-smoke-local.firebaseapp.test'
$env:EXPO_PUBLIC_FIREBASE_PROJECT_ID = 'demo-servicesos-v1-smoke-local'
$env:EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET = 'demo-servicesos-v1-smoke-local.appspot.com'
$env:EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID = '000000000000'
$env:EXPO_PUBLIC_FIREBASE_APP_ID = '1:000000000000:android:local-smoke'
$env:EXPO_PUBLIC_FIREBASE_EMULATOR_HOST = '10.0.2.2'

npm run android
```

`10.0.2.2` is appropriate for the Android emulator only. A physical device or another simulator must use an explicitly reachable host instead. Do not save these runtime values in a committed environment file.

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

- Tenant A: two customers, one linked customer quote request, and five bookings covering an assigned current field job, unassigned payment-pending, another employee's assigned job, completed/manual-paid, and future cancelled states.
- The assigned current field job has a current owner-approved three-task checklist, explicit access instructions, safety facts, and one approved employee-visible laminate-cleaning method for native Job Detail and Work Assistant smoke coverage.
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
- Never put a production secret in `.secret.local`; the documented placeholder exists only to keep local mock execution away from Secret Manager.
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
