# ServicesOS Employee App

React Native Expo mobile app for verified ServicesOS employees to complete assigned field work.

## Project Structure

```
employee-app/
├── src/
│   ├── api/
│   │   └── firebase.js          # Firebase configuration
│   ├── context/
│   │   └── AuthContext.jsx      # Authentication context
│   ├── navigation/
│   │   └── AppNavigator.jsx     # Navigation structure
│   ├── screens/
│   │   ├── LoginScreen.jsx      # Login screen
│   │   ├── TodayScreen.jsx      # Today's jobs
│   │   ├── JobDetailsScreen.jsx # Job details
│   │   └── ProfileScreen.jsx    # Employee profile
│   ├── components/              # Reusable components
│   └── utils/                   # Utility functions
├── App.js                       # Main entry point
├── app.json                     # Expo configuration
└── package.json                 # Dependencies
```

## Features

- **Canonical employee authentication**: Firebase credentials are verified against the server-side employee session gateway before the app shell unlocks.
- **My Day**: View only the employee-safe summaries for assigned current and upcoming jobs.
- **Job Detail**: Load a fresh employee-safe JobPacket for each job, including field instructions, safety and method guidance, and directions.
- **Field execution**: Start work, record approved checklist progress, save field notes or an issue, and complete through the server-owned execution gateway.
- **Photo evidence**: Capture before/after evidence through the reserved-slot upload flow.
- **SLAI Work Assistant**: Get bounded help for the current assigned job.
- **Profile**: View verified display name, email, and role; log out.

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

Firebase client configuration is supplied through the `EXPO_PUBLIC_*` variables listed in
`.env.example`. These values identify a Firebase client app; never place Admin SDK credentials,
private keys, payment keys, email-provider keys, AI-provider keys, or webhook secrets in them.

The mode is required and fails closed when missing or unknown. Production mode requires all six
client values and rejects the emulator-only demo project. Local emulator mode requires the exact
`demo-servicesos-v1-smoke-local` project and an explicit emulator host reachable from the device.

Choose that host for the runtime being tested:

- Android emulator: commonly `10.0.2.2` when the emulator can reach the development computer there.
- Physical Expo device: the development computer's LAN address reachable from the phone.
- iOS simulator: the development host reachable from that simulator environment.

No host works universally. Physical-device testing may also require the Firebase emulators to
listen on a non-loopback interface; this app does not alter emulator server bindings.

## Security

Employees can only access their verified employee session and server-projected assigned job data. The app never directly reads full booking documents.

Firestore security rules must be configured to enforce these restrictions.

## Later Work

The following are intentionally not active in this V1 app:

- Add-On / Change Request
- Tap to Pay
- Training library
- Office messaging
- Offline queue
- Push notifications
