# ServicesOS Lint Baseline Progress

This document records the first focused lint-baseline pass after the Vitest baseline was restored.

Scope for this pass was intentionally narrow:

- No product behavior changes.
- No Stripe or payment behavior changes.
- No Firebase rules changes.
- No tenant data model changes.
- No routing changes.
- No backend/cloud functions logic changes.
- No Tap to Pay work.
- No UI polish.
- No broad React hook refactors.

## Original Lint Count

Initial `npm run lint` result from `servicesos-web`:

- 42 errors.
- 6 warnings.

## Lint Categories

### Nested Functions Package Included In Web Lint

- Original impact: 6 errors.
- Cause: top-level `servicesos-web` lint was scanning `cleaning-intake-system/**`, which is a nested Firebase functions-style package with CommonJS files.
- Examples:
  - `cleaning-intake-system/.eslintrc.js`
  - `cleaning-intake-system/index.js`
- Risk: tooling/config cleanup.

### Clearly Unused Imports / Variables

- Original impact: several errors.
- Cause: unused imports, unused local variables, unused state values, unused helper functions, and reserved onboarding values.
- Examples:
  - `src/AIPhotoEstimateSystem.jsx`
  - `src/components/AIModelTraining.jsx`
  - `src/components/CompanySettings.jsx`
  - `src/components/EmployeeMobileApp.jsx`
  - `src/components/ImprovedOnboarding.jsx`
  - `src/services/aiUsageEngineService.js`
- Risk: low when removal did not alter rendered output or active workflow behavior.

### React Hook `set-state-in-effect`

- Remaining impact: most remaining errors.
- Cause: React compiler lint rule flags synchronous state updates inside effects.
- Examples:
  - `src/App.jsx`
  - `src/components/AICreditWallet.jsx`
  - `src/components/CalendarView.jsx`
  - `src/components/CustomerManagement.jsx`
  - `src/components/EmployeeMobileApp.jsx`
  - `src/components/StripeConnectOnboarding.jsx`
  - `src/components/TenantManagement.jsx`
- Risk: needs a dedicated component behavior pass. Not fixed here.

### Auth Context Fast Refresh Export

- Fixed impact: 1 error.
- Cause: `src/contexts/AuthContext.jsx` exported a React context object from the same file as components/hooks.
- Fix: moved the raw context object to `src/contexts/AuthContextValue.js` and updated direct context consumers to import from that file.
- Risk: tooling-only when the same context object is consumed by `AuthProvider`, `useAuth`, and direct `useContext(AuthContext)` consumers.

### AI Usage `limit` Shadowing / Unused Import

- Fixed impact: 1 error.
- Cause: `src/services/aiUsageEngineService.js` imports Firestore `limit`, but `getCreditHistory(tenantId, limit = 50)` shadows it.
- Fix: aliased the Firestore helper to `limitQuery` and renamed the local argument to `maxResults`.
- Risk: low. This preserves the intended query behavior and the same positional function argument.

### Remaining Warning

- Remaining impact: 1 warning.
- Cause: missing hook dependency in `src/components/AICreditWallet.jsx`.
- Risk: should be reviewed with the related hook refactor.

## What Was Fixed In This Pass

- Scoped top-level `servicesos-web` lint away from the nested `cleaning-intake-system/**` package.
- Removed an unused saved quote assignment while preserving the existing `saveQuote(...)` call.
- Removed unused AI model training imports.
- Removed unused loading state in `CompanySettings` because the value was never read.
- Removed unused employee mobile state and helper functions that were not wired into the rendered workflow.
- Removed an unused `setCustomServices` setter in onboarding.
- Marked reserved onboarding/auth setup values as intentionally unused without enabling the currently commented account-creation behavior.
- Removed unused ESLint disable comments.
- Marked the reserved `operationType` parameter in AI usage cost tracking as intentionally unused while preserving the current hardcoded history value.

## Second Non-Hook Pass

- Fixed the Firestore `limit` shadowing issue in `src/services/aiUsageEngineService.js` without changing the `getCreditHistory(tenantId, maxResults)` call shape.
- Fixed the AuthContext fast-refresh export issue by moving the context object into `src/contexts/AuthContextValue.js`.
- Updated direct context consumers and the auth export test to use the new context-object file.

## First Single-File Hook Pass

- Fixed the `react-hooks/set-state-in-effect` error in `src/components/BackupPanel.jsx`.
- Replaced the mount effect that immediately called `setStats(...)` and `setAutoBackups(...)` with lazy initial state for `getBackupStats()` and `getAutoBackups()`.
- Preserved the existing `loadStats()` refresh helper used after backup, restore, upload, auto-backup, and clear-data actions.

## Second Single-File Hook Pass

- Fixed the `react-hooks/set-state-in-effect` error in `src/components/AIModelTraining.jsx`.
- Replaced the mount effect that immediately called `loadData()` with lazy initial state for training data, stats, training jobs, custom models, and deployed model data.
- Preserved the existing `loadData()` refresh helper used after adding, verifying, deleting, training, deploying, and undeploying model data.

## Third Single-File Hook Pass

- Fixed the `react-hooks/set-state-in-effect` error in `src/components/CustomerPortal.jsx`.
- Replaced the mount-time appointment state write with lazy initial state from localStorage.
- Kept quote loading async on mount and preserved appointment refresh after booking.

## Fourth Single-File Hook Pass

- Fixed the `react-hooks/set-state-in-effect` error in `src/components/CRMDashboard.jsx`.
- Preserved the existing async tenant-scoped dashboard loader and status-update refresh path.
- Deferred the mount/tenant-triggered loader call to a microtask with an effect cleanup guard so dashboard data loading still runs after mount without synchronous state writes inside the effect body.

## Fifth Single-File Hook Pass

- Fixed the `react-hooks/set-state-in-effect` error in `src/components/CustomerManagement.jsx`.
- Preserved the existing async tenant-scoped customer loader and create/update/delete refresh path.
- Deferred the mount/tenant-triggered loader call to a microtask with an effect cleanup guard so customer data loading still runs after mount without synchronous state writes inside the effect body.

## Sixth Single-File Hook Pass

- Fixed the `react-hooks/set-state-in-effect` error in `src/components/EmployeeManagement.jsx`.
- Preserved the existing async tenant-scoped employee loader and create/update/delete refresh path.
- Deferred the mount/tenant-triggered loader call to a microtask with an effect cleanup guard so employee data loading still runs after mount without synchronous state writes inside the effect body.

## Seventh Single-File Hook Pass

- Fixed the `react-hooks/set-state-in-effect` error in `src/components/StaffScheduling.jsx`.
- Preserved the existing async tenant-scoped employee and date-based shift/job loaders.
- Preserved refresh behavior after scheduling, check-in/check-out, and employee create/update/delete actions.
- Deferred the mount/date-triggered loader calls to a microtask with an effect cleanup guard so scheduling data still loads after mount/date changes without synchronous state writes inside the effect body.

## Eighth Single-File Hook Pass

- Fixed the `react-hooks/set-state-in-effect` error in `src/components/CalendarView.jsx`.
- Preserved the existing tenant-scoped booking and employee Firestore queries.
- Deferred the mount/month-triggered loader calls to a microtask with an effect cleanup guard so calendar bookings and employees still load after mount/month changes without synchronous state writes inside the effect body.

## Ninth Single-File Hook Pass

- Fixed the `react-hooks/set-state-in-effect` error in `src/components/EmployeeMobileApp.jsx`.
- Preserved the existing tenant-scoped same-day booking query and employee profile lookup.
- Deferred the mount-triggered employee job loader to a microtask with an effect cleanup guard so the employee mobile view still loads assigned jobs after mount without synchronous state writes inside the effect body.

## Tenth Single-File Hook Pass

- Fixed the `react-hooks/set-state-in-effect` error in `src/components/RecurringServices.jsx`.
- Preserved the existing tenant-scoped recurring service Firestore query.
- Preserved refresh behavior after recurring service create, update, delete, and status-toggle actions.
- Deferred the mount-triggered recurring service loader to a microtask with an effect cleanup guard so recurring services still load after mount without synchronous state writes inside the effect body.

## Eleventh Single-File Hook Pass

- Fixed the two `react-hooks/set-state-in-effect` errors in `src/components/RouteOptimization.jsx`.
- Preserved the existing tenant-scoped active employee query and date/employee-scoped booking query.
- Preserved automatic route optimization after jobs load and preserved apply/reset route update behavior.
- Deferred the employee and job loader calls to microtasks with effect cleanup guards so route data still loads after mount, employee selection, and date changes without synchronous state writes inside the effect body.

## Twelfth Single-File Hook Pass

- Fixed the `react-hooks/set-state-in-effect` error in `src/components/InsuranceTracking.jsx`.
- Preserved the existing tenant-scoped insurance loading and expiration status check.
- Preserved save behavior and the post-save expiration status refresh.
- Deferred the mount-triggered insurance loader to a microtask with an effect cleanup guard so insurance data still loads after mount without synchronous state writes inside the effect body.

## Thirteenth Single-File Hook Pass

- Fixed the `react-hooks/set-state-in-effect` error in `src/components/CompanySettings.jsx`.
- Preserved the existing tenant-scoped branding/settings loader and default branding fallback.
- Preserved save, import/export, reset, preset, upload, and live preview behavior.
- Deferred the mount/tenant-triggered branding loader to a microtask with an effect cleanup guard so company settings still load after mount or tenant changes without synchronous state writes inside the effect body.

## Fourteenth Single-File Hook Pass

- Fixed the `react-hooks/set-state-in-effect` error in `src/App.jsx`.
- Preserved the existing role-triggered fallback behavior when the current page becomes inaccessible.
- Kept page state correction semantics instead of deriving an effective page, because a purely derived page would remember inaccessible prior pages across role changes.
- Deferred the role-triggered page correction to a microtask with an effect cleanup guard and a functional state update.

## Fifteenth Single-File Hook Pass

- Fixed the `react-hooks/set-state-in-effect` error in `src/components/PaymentLinks.jsx`.
- Preserved the existing tenant-scoped lead loading query.
- Preserved lead selection, amount autofill, payment link creation, Firestore payment-link write, and Stripe checkout redirect behavior.
- Deferred the mount/tenant-triggered lead loader to a microtask with an effect cleanup guard so leads still load after mount or tenant changes without synchronous state writes inside the effect body.

## Sixteenth Single-File Hook Pass

- Fixed the `react-hooks/set-state-in-effect` error and `react-hooks/exhaustive-deps` warning in `src/components/AICreditWallet.jsx`.
- Preserved the existing tenant-scoped AI credit and credit history loading behavior.
- Preserved credit cost and subscription tier display data by initializing those static values with lazy state.
- Stabilized the credit loader with `useCallback` and deferred the mount/tenant-triggered credit loader to a microtask with an effect cleanup guard.

## Seventeenth Single-File Hook Pass

- Fixed the `react-hooks/set-state-in-effect` error in `src/components/TenantManagement.jsx`.
- Preserved the existing tenant list loading behavior from local tenant storage.
- Preserved tenant create, delete, select, details, subscription update, and subscription cancellation behavior.
- Deferred the mount-triggered tenant loader to a microtask with an effect cleanup guard so tenant data still loads after mount without synchronous state writes inside the effect body.

## Eighteenth Single-File Hook Pass

- Fixed the `react-hooks/set-state-in-effect` error in `src/components/StripeConnectOnboarding.jsx`.
- Preserved the existing tenant-scoped Stripe Connect account status request.
- Preserved onboarding account creation, onboarding link generation, manual refresh, status display, charges-enabled display, and payouts-enabled display behavior.
- Deferred the mount/tenant-triggered account status loader to a microtask with an effect cleanup guard so Stripe Connect status still loads after mount or tenant changes without synchronous state writes inside the effect body.

## What Was Intentionally Not Fixed

- Nested `cleaning-intake-system` package's own lint command/config.
- Build chunk-size warnings.
- Ineffective dynamic import warnings.
- Stripe/payment behavior.
- Firebase rules.
- Tenant model.
- Routing.
- Backend/cloud functions logic.
- Tap to Pay.
- UI polish.

## Remaining Lint Count

After the eighteenth single-file hook pass, `npm run lint` from `servicesos-web` reports:

- 0 errors.
- 0 warnings.

## Risk Notes

- The React hook lint baseline is now clear in `servicesos-web`.
- `AuthContext.jsx` no longer exports the raw context object; auth behavior should still be manually watched during future auth work.
- `aiUsageEngineService.js` now uses the intended Firestore query limit helper. This was treated as a small compatibility/tooling fix, not a product feature change.
- Top-level web lint now ignores `cleaning-intake-system/**` because that folder is a nested functions package, not the web app source. Its own lint configuration should be handled separately.

## Recommended Next Lint Pass

Recommended next pass:

1. Run full validation before any commit.
2. Keep build chunk-size and ineffective dynamic import warnings as a separate optimization pass.
3. Handle the nested `cleaning-intake-system` package lint separately if that package needs its own baseline.
