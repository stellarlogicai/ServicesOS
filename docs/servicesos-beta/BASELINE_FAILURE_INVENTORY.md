# ServicesOS Baseline Failure Inventory

Created before making ServicesOS fixes. This document summarizes the repo/package structure and the baseline validation failures observed before changing code, tests, Stripe, Firebase, auth, tenant logic, payments, routing, or backend behavior.

## 1. Workspace Structure

### Current Path

`C:\Users\merce\Documents\SLAI_Real\ServicesOS`

### Git Repo Root Found

- `C:\Users\merce\Documents\SLAI_Real\ServicesOS` is not a Git repo root.
- No child `.git` directory was found under `ServicesOS`.
- A `.git` directory exists at `C:\Users\merce\Documents\SLAI_Real\.git`, but Git does not recognize `C:\Users\merce\Documents\SLAI_Real` or `C:\Users\merce\Documents\SLAI_Real\ServicesOS` as a valid working tree.
- Result: no usable Git repo root was found for the ServicesOS workspace during this baseline check.

### App Folders Found

- `architecture`
- `cloud-functions`
- `docs`
- `employee-app`
- `servicesos-web`
- `shared`

### Package Files Found

- `cloud-functions/package.json`
- `employee-app/package.json`
- `servicesos-web/package.json`
- `servicesos-web/cleaning-intake-system/package.json`

### Package Scripts Found

#### `cloud-functions`

- `serve`: `firebase emulators:start --only functions`
- `shell`: `firebase functions:shell`
- `start`: `npm run shell`
- `deploy`: `firebase deploy --only functions`
- `logs`: `firebase functions:log`

#### `employee-app`

- `start`: `expo start`
- `android`: `expo start --android`
- `ios`: `expo start --ios`
- `web`: `expo start --web`

#### `servicesos-web`

- `dev`: `vite`
- `build`: `vite build`
- `lint`: `eslint .`
- `preview`: `vite preview`
- `test`: `vitest`
- `test:ui`: `vitest --ui`

#### `servicesos-web/cleaning-intake-system`

- `lint`: `eslint .`
- `serve`: `firebase emulators:start --only functions`
- `shell`: `firebase functions:shell`
- `start`: `npm run shell`
- `deploy`: `firebase deploy --only functions`
- `logs`: `firebase functions:log`

### Correct Folder For ServicesOS Web App Work

`C:\Users\merce\Documents\SLAI_Real\ServicesOS\servicesos-web`

This appears to be the correct ServicesOS web app folder because it contains the React/Vite app scripts: `dev`, `build`, `lint`, `test`, and `preview`.

### Monorepo Or Standalone App Folder

The ServicesOS workspace does not appear to be a conventional npm monorepo because there is no root `package.json` or workspace configuration at `C:\Users\merce\Documents\SLAI_Real\ServicesOS`.

`servicesos-web` appears to be a standalone app folder inside a larger ServicesOS workspace. It also contains a nested `servicesos-web/cleaning-intake-system` Firebase functions-style package.

## 2. Validation Commands Run

| Folder | Command | Pass/Fail | Summary |
| --- | --- | --- | --- |
| `servicesos-web` | `npm run lint` | Fail | ESLint reported 42 errors and 6 warnings. Main causes: CommonJS globals in functions files, unused variables, React hook `set-state-in-effect` issues, React refresh export warning. |
| `servicesos-web` | `npm run build` | Pass with warnings | Vite production build completed. Warnings included ineffective dynamic imports and chunks larger than 500 kB. |
| `servicesos-web` | `npm run test -- --run` | Fail | Vitest reported 10 passed tests, 2 failed tests, and 3 failed test files. Failures include missing shared imports and auth/permission expectation mismatches. |
| `servicesos-web/cleaning-intake-system` | `npm run lint` | Fail | ESLint failed before linting because config references missing rule `no-unassigned-vars` in plugin `@`. |

No fix commands were run.

## 3. Lint Failure Groups

### CommonJS Globals In Functions Files

- Approximate count: 4 errors.
- Example files:
  - `servicesos-web/.eslintrc.js`
  - `servicesos-web/index.js`
- Example issue:
  - `module` is not defined.
  - `require` is not defined.
- Risk classification: Tooling/config cleanup.
- Beta-critical? No, unless these files are required by the current beta runtime or deployment path.

### Unused Variables

- Approximate count: 15-20 errors across app and service files.
- Example files:
  - `servicesos-web/src/AIPhotoEstimateSystem.jsx`
  - `servicesos-web/src/components/AIModelTraining.jsx`
  - `servicesos-web/src/components/EmployeeMobileApp.jsx`
  - `servicesos-web/src/components/ImprovedOnboarding.jsx`
  - `servicesos-web/src/services/aiUsageEngineService.js`
- Risk classification: Minor cleanup.
- Beta-critical? Usually no, unless unused code is hiding incomplete beta-critical workflow behavior.

### React Hook `set-state-in-effect` Issues

- Approximate count: 18-22 errors.
- Example files:
  - `servicesos-web/src/App.jsx`
  - `servicesos-web/src/components/AICreditWallet.jsx`
  - `servicesos-web/src/components/CRMDashboard.jsx`
  - `servicesos-web/src/components/CalendarView.jsx`
  - `servicesos-web/src/components/CustomerManagement.jsx`
  - `servicesos-web/src/components/EmployeeManagement.jsx`
  - `servicesos-web/src/components/EmployeeMobileApp.jsx`
  - `servicesos-web/src/components/PaymentLinks.jsx`
  - `servicesos-web/src/components/StripeConnectOnboarding.jsx`
  - `servicesos-web/src/components/TenantManagement.jsx`
- Risk classification: Cleanup unless the related component fails at runtime.
- Beta-critical? Potentially beta-critical only if the affected screen is part of the manual beta path and actually fails to load or update.

### React Refresh Export Warning

- Approximate count: 1 error.
- Example file:
  - `servicesos-web/src/contexts/AuthContext.jsx`
- Example issue:
  - Fast refresh expects files to export only components.
- Risk classification: Tooling/config cleanup.
- Beta-critical? No by itself, but auth context behavior should be treated carefully because auth is part of beta access.

### Missing ESLint Rule / Config Issue

- Approximate count: 1 blocking config failure.
- Example folder:
  - `servicesos-web/cleaning-intake-system`
- Example issue:
  - ESLint could not find rule `no-unassigned-vars` in plugin `@`.
- Risk classification: Tooling/config cleanup.
- Beta-critical? No for manual beta testing, but it blocks that package's lint validation.

### Other Warnings

- Approximate count: 6 warnings in `servicesos-web` lint.
- Example issues:
  - Missing hook dependencies.
  - Unused eslint-disable directives.
- Risk classification: Warnings / polish.
- Beta-critical? No unless tied to observed runtime bugs.

## 4. Test Failure Groups

### Missing Shared Import In Smoke Test

- Test file: `servicesos-web/src/__tests__/smoke.test.js`
- Failed test name: suite failed before running tests.
- Exact failure summary:
  - Failed to resolve import `../shared/utils/errorLogging`.
- Missing import/export involved:
  - `../shared/utils/errorLogging`
  - Related imports in the same area also include `../shared/utils/apiResponse` and `../shared/features/featureRegistry`.
- Related to refactor? Likely yes. The test appears to expect shared utilities at paths that no longer resolve from `src/__tests__`.
- Blocks beta testing? It blocks automated test confidence, but not necessarily manual beta testing unless the app runtime depends on the same broken imports.
- Risk ranking: Beta-critical for automated baseline; possible blocker if the same missing utilities break runtime.

### Missing Shared Import In Workflow Test

- Test file: `servicesos-web/src/__tests__/workflow.test.js`
- Failed test name: suite failed before running tests.
- Exact failure summary:
  - Failed to resolve import `../shared/utils/apiResponse`.
- Missing import/export involved:
  - `../shared/utils/apiResponse`
- Related to refactor? Likely yes. The test likely points to a stale shared utility path.
- Blocks beta testing? It blocks automated workflow test confidence. Runtime impact needs inspection before manual beta.
- Risk ranking: Beta-critical for automated baseline; possible blocker if runtime imports are also broken.

### Permission Service Export Mismatch

- Test file: `servicesos-web/src/__tests__/login.test.js`
- Failed test name:
  - `should verify permission service exports permission functions`
- Exact failure summary:
  - Expected `permissionService.checkPermission` to be a function, received `undefined`.
- Missing import/export involved:
  - `checkPermission`
  - Possibly `hasPermission`, depending on current service API.
- Related to refactor? Likely yes. The test and current permission service API appear out of sync.
- Blocks beta testing? Potentially beta-critical if the actual app needs these permission functions for role access.
- Risk ranking: Beta-critical until auth/permission behavior is inspected.

### Auth Context State Expectation Mismatch

- Test file: `servicesos-web/src/__tests__/login.test.js`
- Failed test name:
  - `should verify auth context provides user state`
- Exact failure summary:
  - Expected user-related state properties to exist, but the assertion received `false`.
- Missing import/export involved:
  - Expected auth context user state such as `currentUser` or `user`.
- Related to refactor? Likely yes. The test and current auth context shape appear out of sync.
- Blocks beta testing? Potentially beta-critical if login/session state is unclear or broken in the app.
- Risk ranking: Beta-critical until auth behavior is confirmed manually and in tests.

## 5. Risk Ranking

| Failure Group | Ranking | Reason |
| --- | --- | --- |
| Missing shared imports in tests | Beta-critical | Automated baseline cannot run, and missing shared utilities may indicate refactor path drift. |
| Permission service export mismatch | Beta-critical | Permission logic affects owner/admin/employee access and could block beta workflows. |
| Auth context state expectation mismatch | Beta-critical | Auth/session state is required for beta access and role workflows. |
| Runtime-breaking shared import failures, if found outside tests | Blocker | Any runtime import failure could stop the app from loading or completing core workflow. |
| Nested functions ESLint missing rule | Tooling/config cleanup | Blocks lint validation for that package but does not directly prove beta runtime failure. |
| React hook `set-state-in-effect` errors | Minor cleanup unless observed at runtime | Important cleanup, but not automatically a beta blocker without a visible runtime issue. |
| CommonJS globals in functions files | Tooling/config cleanup | Likely ESLint environment/config mismatch. |
| Unused variables | Minor cleanup | Should be cleaned, but not the first beta blocker. |
| Build chunk-size and dynamic-import warnings | Later | Build passes; warnings should not block manual beta. |

## 6. Recommended Fix Order

1. Missing imports/exports that break tests.
2. Auth/permission test failures.
3. Any runtime-breaking shared import failures.
4. ESLint config missing rule issue.
5. React hook errors.
6. Unused variables.
7. Warnings / polish.

The first fix pass should focus on restoring baseline confidence without changing product behavior. Prefer aligning stale tests/import paths with the current structure before touching auth, tenant, Firebase, Stripe, or payment behavior.

## 7. Do Not Fix Yet List

Do not touch these during the first fix pass unless a failure is directly proven to require it:

- Stripe/payment behavior.
- Firebase rules.
- Tenant data model.
- Auth behavior unless directly related to missing exports/tests.
- Tap to Pay.
- Future modules.
- UI polish.

## 8. Recommended First Fix Prompt

Use this as the next focused prompt:

> In `C:\Users\merce\Documents\SLAI_Real\ServicesOS\servicesos-web`, inspect the failing Vitest files and the current shared/auth/permission service exports. Do not change product behavior yet. Fix only stale test import paths or missing compatibility exports needed to restore baseline tests, and report before touching auth behavior, Firebase, Stripe, tenant logic, payments, routing, or backend code.
