# Auth Domain Diagnosis

## Error Observed

Manual testing showed a Google sign-in console error:

> App domain is unauthorized

Customer Portal still loaded after sign-in, so the issue appears limited to the Google/Firebase auth flow for the current development host rather than a Customer Portal render failure.

## Auth Files Inspected

- `servicesos-web/src/firebase.js`
- `servicesos-web/src/contexts/AuthContext.jsx`
- `servicesos-web/src/components/LoginForm.jsx`
- `servicesos-web/src/App.jsx`

## Google Sign-In Method

Google sign-in is implemented through Firebase Auth using popup sign-in:

- `GoogleAuthProvider` is created in `src/firebase.js`.
- `loginWithGoogle()` calls `signInWithPopup(auth, googleProvider)` in `src/contexts/AuthContext.jsx`.
- `LoginForm.jsx` calls `loginWithGoogle()` from the "Continue with Google" button.

No redirect-based Google sign-in was found in the active auth path.

## Masked Firebase Auth Domain

The app reads Firebase config from Vite environment variables:

- `VITE_FIREBASE_AUTH_DOMAIN`

The configured local value appears to be set and masked as:

- `clea...aseapp.com`

Do not publish the full Firebase config or API keys in beta notes.

## Development Domains Observed

Manual testing is currently using local development hosts such as:

- `127.0.0.1`
- `localhost` if the same app is opened with a localhost URL

The current in-app browser URL was:

- `http://127.0.0.1:5173/`

Firebase Authorized Domains are configured by hostname, not by Vite port, so `127.0.0.1` is the important host value here.

## Likely Cause

This is most likely a Firebase Console authorized-domain configuration issue, not an application code issue.

The active code uses the standard Firebase popup flow. The error wording matches Firebase Auth blocking the current browser host because it is not listed under Authentication authorized domains.

## Domains That Likely Need Firebase Console Authorization

In Firebase Console, confirm these hosts are present under Authentication authorized domains:

- `localhost`
- `127.0.0.1`
- The future Netlify preview or production domain, when available
- Any custom production domain, when available

If Jamie continues opening local builds as `http://127.0.0.1:5173/`, `127.0.0.1` should be authorized. If only `localhost` is authorized, opening `http://localhost:5173/` may avoid the error.

## Manual Firebase Console Checklist

1. Open Firebase Console.
2. Select the ServicesOS Firebase project.
3. Go to Authentication.
4. Open Settings.
5. Find Authorized domains.
6. Add `127.0.0.1` if it is missing.
7. Confirm `localhost` is present.
8. Confirm the deployed Netlify/custom domain before any hosted beta test.
9. Confirm Google is enabled as a sign-in provider under Sign-in method.
10. Retest Google popup sign-in from the same local URL.

## Whether Code Changes Are Needed

No auth code change is recommended from this diagnosis.

The current code:

- Initializes Firebase from environment variables.
- Uses `GoogleAuthProvider`.
- Uses `signInWithPopup`.
- Creates a customer user document on first Google sign-in if one does not exist.

If the error persists after authorizing the local/deployed domain, the next diagnostic step should inspect the exact Firebase error code returned by `loginWithGoogle()` without logging private user data.
