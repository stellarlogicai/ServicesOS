# ServicesOS Netlify Deployment

Date: June 30, 2026

This document is for deploying the existing `servicesos-web` Vite React app to Netlify for the Aunt B wife beta.

This is deployment setup only. It does not enable Stripe, payment collection, payment links, refunds, invoices, Tap to Pay, Customer Portal payments, Settings, Schedule, Calendar, Staff Scheduling, or other deferred modules.

## Netlify site setup

1. In Netlify, choose **Add new site** → **Import an existing project**.
2. Connect the Git provider and select the ServicesOS repository.
3. Use these build settings:
   - Base directory: `servicesos-web`
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Confirm the repo-level `netlify.toml` is present. It already sets:
   - `base = "servicesos-web"`
   - `command = "npm run build"`
   - `publish = "dist"`
   - `NODE_VERSION = "20"`
   - SPA fallback redirect from `/*` to `/index.html`

If Netlify is configured from the repo root without using the base directory setting manually, the effective publish directory is still `servicesos-web/dist` because `netlify.toml` sets the base directory.

## Required Netlify environment variables

Set these in Netlify under **Site configuration** → **Environment variables**. Do not commit real values to the repo.

```text
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

These names are also listed in `servicesos-web/.env.example` with blank values.

## Optional existing environment variables

The current code references these optional Vite variables. Add them only if Jamie intentionally wants the corresponding existing behavior for this beta deployment.

```text
VITE_BUSINESS_NAME=
VITE_BUSINESS_PHONE=
VITE_BOOKING_URL=
VITE_EMAIL_FROM=
VITE_RESEND_API_KEY=
VITE_ANTHROPIC_API_KEY=
VITE_FUNCTIONS_URL=
VITE_ORS_API_KEY=
VITE_TWILIO_ACCOUNT_SID=
VITE_TWILIO_AUTH_TOKEN=
VITE_TWILIO_PHONE_NUMBER=
```

No Stripe environment variable is required for the approved wife-beta owner/admin surfaces to build or load safely. Stripe/payment collection/payment links/refunds/invoices remain deferred.

## Firebase authorized domain

After the first Netlify deploy:

1. Copy the deployed Netlify domain, for example `your-site-name.netlify.app`.
2. In Firebase Console, open the project used by the `VITE_FIREBASE_*` values.
3. Go to **Authentication** → **Settings** → **Authorized domains**.
4. Add the deployed Netlify domain.
5. If a custom domain is later connected in Netlify, add that custom domain to Firebase Authorized domains as well.

Without this step, Firebase Auth can reject sign-in from the deployed site.

## Aunt B Netlify smoke test

Run this after deployment using non-sensitive test credentials. Do not write passwords into docs, screenshots, logs, or commits.

1. Open deployed Netlify URL.
2. Log in as Tenant A/Aunt B admin.
3. Confirm approved nav only:
   - Dashboard
   - Create Estimate
   - Customers
   - Bookings
4. Confirm Dashboard says `Booked revenue`, not `Confirmed revenue`.
5. Confirm no payment links/Stripe/refund/collect-payment buttons appear.
6. Open Customers.
7. Add/edit a test customer.
8. Confirm duplicate prevention still blocks repeated email/phone.
9. Open Create Estimate.
10. Create a no-photo/no-AI manual estimate.
11. Confirm Aunt B pricing range is expected.
12. Save estimate.
13. Confirm Dashboard shows the lead.
14. Use Dashboard Create Booking.
15. Open Bookings.
16. Open booking detail.
17. Edit Date & Notes.
18. Edit Payment Status.
19. Refresh the page and confirm data persists.
20. Sign out and confirm tenant data clears.

## Rollback note

If the Netlify deployment has a beta-blocking issue:

1. In Netlify, open the site deploy list.
2. Select the last known-good deploy.
3. Use **Publish deploy** to roll back traffic.
4. Keep the repo unchanged until the issue is reproduced locally and validated with:
   - `npm run lint`
   - `npm run test -- --run`
   - `npm run build`

## Validation expectation before deploy

Before Jamie deploys or redeploys from a branch intended for beta:

```text
cd servicesos-web
npm run lint
npm run test -- --run
npm run build
```

Known non-blocking warnings may appear from Vitest local storage path handling and existing Vite chunk/dynamic-import warnings. Treat new errors or failed exits as blockers.
