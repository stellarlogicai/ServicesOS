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

2. Configure Firebase:
   - Update `src/api/firebase.js` with your Firebase configuration
   - Ensure Firebase Authentication and Firestore are enabled

3. Run the app:
```bash
npm start
```

## Firebase Configuration

Replace the placeholder values in `src/api/firebase.js` with your actual Firebase project credentials:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};
```

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
