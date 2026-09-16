# ServicesOS Employee App

React Native Expo mobile app for verified ServicesOS employees to complete assigned field work.

## V1 Product Rule

The Employee App is the field-execution surface for ServicesOS. The owner/admin web app remains the planning, approval, monitoring, and review source of truth.

For V1, each mobile capability should ship in its smallest safe and useful connected form. Do not turn V1 into the full future employee platform.

Examples:

- routing/navigation V1 = ordered daily work, clear next-job progression, and directions handoff; not advanced route optimization or fleet telemetry,
- field safety V1 = emergency actions, tenant-scoped alerting, limited active-job safety location, honest delivery state, and owner review; not constant live GPS or a monitoring center,
- offline V1 = narrow resilience for critical safety state where required; not a general offline-first app,
- Tap to Pay V1 = authorized card-present payment with backend-confirmed truth and owner auditability; not every future field-invoicing feature.

## Small-Slice Build Rule

Keep Employee App work in small, heavily defined implementation slices to protect the V1 deadline.

A coding slice should define one capability delta only, with explicit scope, exclusions, files/areas to avoid, acceptance criteria, validation, stop conditions, and report-back. Do not combine routing, field safety, Tap to Pay, and broad mobile polish into one task.

## Project Structure

```text
employee-app/
├── src/
│   ├── api/
│   ├── components/
│   ├── context/
│   ├── navigation/
│   └── screens/
├── App.js
├── app.json
└── package.json
```

## Current V1 Features

- **Canonical employee authentication**: Firebase credentials are verified against the server-side employee session gateway before the app shell unlocks.
- **My Day**: View only employee-safe summaries for assigned current and upcoming jobs.
- **Job Detail**: Load a fresh employee-safe JobPacket for each assigned job, including approved field instructions, safety/method guidance, and directions.
- **Field execution**: Start work, record approved checklist progress, save a field note or issue, and complete through the server-owned execution gateway.
- **Photo evidence**: Capture before/after evidence through the reserved-slot upload flow.
- **SLAI Work Assistant**: Get bounded help for the current authorized assigned job.
- **Extra-work requests**: If requested work is outside today's approved scope, submit a tenant add-on or bounded custom request for owner review instead of silently changing scope.
- **Navigation foundation**: Open the service address in the device's native maps flow with fallback behavior.
- **Profile**: View verified display name, email, and role; log out.

## V1 Work Still Required

The core field workflow is substantially implemented, but V1 is not yet frozen.

### Web-linked field correspondence

- verify the full extra-work lifecycle through owner review, customer approval, and authoritative scope update
- refresh employee JobPacket/checklist/time/price after approved extra work
- confirm declined/unapproved work never becomes authoritative employee scope
- confirm cancellation/reschedule/reassignment changes refresh safely
- confirm employees created through owner onboarding can enter the canonical mobile auth path

### Basic routing / day progression

V1 requires a useful daily field flow, not an optimization platform.

- define/confirm ordered work sequence
- clear current-job / next-job progression
- retain reliable external directions handoff
- verify owner/admin schedule changes reach mobile safely
- device acceptance for day progression and directions

Deferred unless re-scoped:

- advanced route optimization
- continuous/background GPS
- fleet telemetry
- automatic mileage
- complex crew roll call / multi-crew logistics

### Field Safety / Emergency — basic V1

This is a field-safety tool, not a guaranteed emergency-response system.

- Safety / Emergency action on the active job
- call-911 dialer handoff
- call owner/admin handoff when available
- tenant-scoped safety alert
- include job/address/timestamp and limited location when permission/connection allow
- honest sent/queued/failed/location-unavailable states
- narrow offline queue for unsent safety alerts
- retry/sync when connection returns
- owner/admin alert review and resolution
- basic missed-check-in / overdue safety state if promoted in the implementation slice
- limited on-demand active-job safety location ping when permitted
- tenant/permission/device/network acceptance

Deferred unless re-scoped:

- monitoring center
- direct police/public-safety dispatch integration
- guaranteed response claims
- hidden recording
- constant live GPS
- all-day employee surveillance
- advanced escalation trees

### Tap to Pay / mobile payments

Tap to Pay is still part of ServicesOS V1. It was intentionally deferred until the later Employee App/mobile-payment phase so the core field workflow and owner/payment architecture could be stabilized first.

Remaining Tap to Pay work includes:

- secure employee payment permissions
- canonical mobile payment API
- Stripe mobile SDK integration
- Tap to Pay implementation
- confirmed backend payment truth
- owner visibility and audit trail
- failure/retry behavior
- supported-device acceptance testing

Do not classify Tap to Pay as post-V1 unless Jamie explicitly changes scope.

### Mobile acceptance / hardening

- Android emulator/physical-device acceptance
- camera/photo permission testing
- location-permission behavior for promoted routing/safety slices
- network failure and retry behavior
- duplicate-submit/idempotency behavior
- auth expiration/session recovery
- reassignment-away denial
- tenant-isolation / employee-authorization smoke
- real owner → employee → owner field-workflow acceptance

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create an ignored `.env.local` from `.env.example` and set an explicit mode:
   - `local-emulator` for emulator-only development
   - `production` only when intentionally configuring the production client

3. Run the app:

```bash
npm start
```

## Firebase Configuration

Firebase client configuration is supplied through the `EXPO_PUBLIC_*` variables listed in `.env.example`. These values identify a Firebase client app; never place Admin SDK credentials, private keys, payment keys, email-provider keys, AI-provider keys, or webhook secrets in them.

The mode is required and fails closed when missing or unknown. Production mode requires all six client values and rejects the emulator-only demo project. Local emulator mode requires the exact `demo-servicesos-v1-smoke-local` project and an explicit emulator host reachable from the device.

Choose that host for the runtime being tested:

- Android emulator: commonly `10.0.2.2` when the emulator can reach the development computer there.
- Physical Expo device: the development computer's LAN address reachable from the phone.
- iOS simulator: the development host reachable from that simulator environment.

No host works universally. Physical-device testing may also require the Firebase emulators to listen on a non-loopback interface; this app does not alter emulator server bindings.

## Security

Employees can only access their verified employee session and server-projected assigned job data. The app never directly reads full booking documents.

Firestore security rules and server gateways must preserve tenant isolation, exact assignment checks, approved-scope boundaries, payment authority, and field-safety alert isolation.

Location must only be used for the promoted active-job routing/safety purpose with clear permission and must not silently become all-day employee tracking.

## Deferred Beyond Current V1 Scope Unless Re-scoped

The following should not be treated as current V1 blockers merely because ideas or legacy code exist:

- Training Library expansion
- Office messaging
- Push notifications
- General/full offline queue beyond narrow critical safety resilience
- Payroll / break management
- Advanced route optimization
- Continuous/all-day GPS tracking
- Fleet telemetry
- Automatic mileage
- Advanced crew-management/roll-call systems
- Advanced employee-management features
- Monitoring-center or direct emergency-dispatch platform
