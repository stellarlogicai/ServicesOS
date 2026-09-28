# ServicesOS V1 Deployment Targets

Status: target mapping only. Staging resources are not fully configured or deployed.
This document does not authorize a deployment.

| Environment | Firebase project | Netlify site |
| --- | --- | --- |
| Production | `cleaning-intake-system` | `servicesos.netlify.app` |
| Staging | `servicesos-v1-staging` | `servicesos-v1-staging` |

## Firebase targeting

`cloud-functions/.firebaserc` preserves `default` as production for backward
compatibility and defines explicit `production` and `staging` aliases. Every
future staging Firebase command must explicitly use `--project staging` (or the
verified project ID `servicesos-v1-staging`). Never rely on the Firebase
default for staging.

The staging project still requires separately approved setup and verification
for its Firebase web app, Auth, Firestore, Storage, Functions, indexes, and
other required services. No production deployment is authorized by staging
instructions.

## Netlify targeting

The staging site is named `servicesos-v1-staging`. It has not been linked to the
repository or configured for builds by this task. Any future Netlify staging
deployment must explicitly select that site and verify its target before
publishing. Do not change the production site's branch, domains, or settings.

## Configuration safety

- `VITE_FIREBASE_*` values are browser-visible Firebase application
  configuration, not server secrets.
- Never place Resend, Twilio, Stripe, or other server credentials in `VITE_*`
  variables. Resend remains server-side as `RESEND_API_KEY`.
- Use distinct staging credentials and provider test configuration when those
  are separately authorized and configured; never copy production values.
- The historical `NETLIFY_DEPLOYMENT.md` describes the prior wife-beta setup
  and is not authority for current V1 staging or production actions.
