# ServicesOS Employee App

React Native Expo mobile app for ServicesOS employees to manage their assigned jobs, checklists, training, and communications.

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
│   │   ├── TrainingScreen.jsx   # Training modules
│   │   ├── MessagesScreen.jsx   # Messages
│   │   └── ProfileScreen.jsx    # Employee profile
│   ├── components/              # Reusable components
│   └── utils/                   # Utility functions
├── App.js                       # Main entry point
├── app.json                     # Expo configuration
└── package.json                 # Dependencies
```

## Features

- **Authentication**: Firebase-based login for employees
- **Today's Jobs**: View assigned jobs for the current day
- **Job Details**: Detailed job information with customer notes, access instructions, pet info
- **Training**: View assigned training modules and completion status
- **Messages**: Communicate with office/manager
- **Profile**: View employee profile and logout

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

Employees can only access:
- Their own profile
- Jobs assigned to them
- Their training assignments
- Their messages

Firestore security rules must be configured to enforce these restrictions.

## Next Steps

- Implement actual Firestore queries for jobs, training, messages
- Add checklist completion functionality
- Add photo upload capability
- Add time tracking
- Add Stripe Terminal for Tap to Pay
- Implement offline support
- Add push notifications
- Tighten Firestore security rules
