# ServicesOS Hook Lint Inventory

This inventory captures the remaining React hook lint baseline before fixing hook-related issues.

Scope:

- Documentation only.
- No application code changes.
- No commits.
- No Stripe, Firebase, auth, tenant, routing, backend, payment, or Tap to Pay changes.

## Current Validation Snapshot

Command run from `C:\Users\merce\Documents\SLAI_Real\ServicesOS\servicesos-web`:

- `npm run lint`

Result:

- 19 errors.
- 1 warning.

Remaining error rule:

- `react-hooks/set-state-in-effect`

Remaining warning rule:

- `react-hooks/exhaustive-deps`

## Summary By File

| File | Hook Errors | Warning | Rule(s) | Effect Summary | Beta-Critical | Domain Touched | Risk | Fix Now? |
| --- | ---: | ---: | --- | --- | --- | --- | --- | --- |
| `src/App.jsx` | 1 | 0 | `react-hooks/set-state-in-effect` | Redirects the active in-app page when the current role can no longer see it. | Yes | App-wide navigation/routing state, permissions view gating | High | Defer |
| `src/components/AICreditWallet.jsx` | 1 | 1 | `react-hooks/set-state-in-effect`, `react-hooks/exhaustive-deps` | Loads AI credit totals, credit history, credit cost tables, and tier credit data when the tenant changes. | No for first beta pass | Credit/payment-adjacent state, tenant-scoped data | High | Defer |
| `src/components/AIModelTraining.jsx` | 1 | 0 | `react-hooks/set-state-in-effect` | Loads local AI training data, stats, jobs, custom models, and deployed model data on mount. | No | AI training/admin display state | Low | After `BackupPanel.jsx` |
| `src/components/BackupPanel.jsx` | 1 | 0 | `react-hooks/set-state-in-effect` | Initializes backup stats and auto-backup list from the backup service on mount. | No | Local backup display state; component also contains backup/restore controls | Low | Fix first |
| `src/components/CRMDashboard.jsx` | 1 | 0 | `react-hooks/set-state-in-effect` | Loads dashboard metrics and recent lead data for the tenant. | Yes | Dashboard, leads, core workflow visibility | Medium | Defer until low-risk files pass |
| `src/components/CalendarView.jsx` | 1 | 0 | `react-hooks/set-state-in-effect` | Loads bookings and employees for the current calendar month. | Yes | Scheduling, employee data, tenant-scoped Firestore data | Medium | Defer until core workflow pass |
| `src/components/CompanySettings.jsx` | 1 | 0 | `react-hooks/set-state-in-effect` | Loads tenant branding/settings into local settings state. | No for first beta pass | Tenant/company settings | High | Defer |
| `src/components/CustomerManagement.jsx` | 1 | 0 | `react-hooks/set-state-in-effect` | Loads customers for the current tenant. | Yes | Customer workflow, tenant-scoped saved data | Medium | Defer until after low-risk files |
| `src/components/CustomerPortal.jsx` | 1 | 0 | `react-hooks/set-state-in-effect` | Loads customer quotes and appointments on mount. | Maybe | Customer-facing quote/appointment workflow | Medium | Defer until after low-risk files |
| `src/components/EmployeeManagement.jsx` | 1 | 0 | `react-hooks/set-state-in-effect` | Loads employee records for the tenant. | Yes | Employee workflow, tenant-scoped saved data | Medium | Defer until core workflow pass |
| `src/components/EmployeeMobileApp.jsx` | 1 | 0 | `react-hooks/set-state-in-effect` | Loads today's assigned jobs for a cleaner. | Yes | Employee app, field workflow, job status visibility | Medium | Defer until employee workflow pass |
| `src/components/InsuranceTracking.jsx` | 1 | 0 | `react-hooks/set-state-in-effect` | Loads insurance data for the tenant. | No for first beta pass | Tenant compliance/settings data | Medium | Defer |
| `src/components/PaymentLinks.jsx` | 1 | 0 | `react-hooks/set-state-in-effect` | Loads tenant leads for payment link creation. | No until payments are in scope | Payment links, leads, tenant-scoped saved data | High | Defer |
| `src/components/RecurringServices.jsx` | 1 | 0 | `react-hooks/set-state-in-effect` | Loads recurring service records for the tenant. | Yes, but after first standard clean | Recurring customer workflow, tenant-scoped saved data | Medium | Defer until core workflow pass |
| `src/components/RouteOptimization.jsx` | 2 | 0 | `react-hooks/set-state-in-effect` | Loads employees, then loads jobs when employee/date selection changes. | No for first beta pass | Scheduling, employee assignment, route optimization | Medium | Defer |
| `src/components/StaffScheduling.jsx` | 1 | 0 | `react-hooks/set-state-in-effect` | Loads employees and shifts/jobs for the selected date. | Yes | Scheduling, employee workflow, tenant-scoped saved data | Medium | Defer until core workflow pass |
| `src/components/StripeConnectOnboarding.jsx` | 1 | 0 | `react-hooks/set-state-in-effect` | Fetches Stripe Connect account status when a tenant is available. | No until payment testing | Stripe Connect, payment onboarding, tenant identity | High | Defer |
| `src/components/TenantManagement.jsx` | 1 | 0 | `react-hooks/set-state-in-effect` | Loads tenant management data for the super-admin view. | No for wife beta | Tenant management, super-admin state | High | Defer |

## Detailed Notes

### `src/App.jsx`

- Hook errors: 1.
- Exact rule: `react-hooks/set-state-in-effect`.
- Effect: checks whether the current page is still visible for the current role and calls `setPage(...)` if it is not.
- Beta-critical: yes. This is app-wide navigation state.
- Risk level: high.
- Touches: routing-like app state, role-based visibility, permission-related navigation.
- Recommended fix strategy: handle invalid page selection through derived render-time page calculation or a controlled navigation reducer. Avoid changing this until a focused app-shell test exists.
- Recommendation: defer.

### `src/components/AICreditWallet.jsx`

- Hook errors: 1.
- Warnings: 1.
- Exact rules:
  - `react-hooks/set-state-in-effect`
  - `react-hooks/exhaustive-deps`
- Effect: calls `loadCredits()` and `loadCreditCosts()` when `currentTenant` changes.
- Beta-critical: no for the first ServicesOS wife beta pass.
- Risk level: high because it is credit/payment-adjacent and tenant-scoped.
- Touches: AI credits, usage history, tenant credit records.
- Recommended fix strategy: split static credit-cost data from async tenant credit loading. Static reference data can likely use lazy state or direct render constants. Tenant credit loading should be handled in a dedicated, tested async data-loading pass.
- Recommendation: defer until payment/credit work is explicitly scoped.

### `src/components/AIModelTraining.jsx`

- Hook errors: 1.
- Exact rule: `react-hooks/set-state-in-effect`.
- Effect: loads training data, stats, training jobs, custom models, and deployed model data on mount.
- Beta-critical: no.
- Risk level: low.
- Touches: AI model training/admin display state only.
- Recommended fix strategy: initialize static/local service values lazily in state initializers or calculate stable local values outside the effect. Verify no training job mutation behavior changes.
- Recommendation: fix after `BackupPanel.jsx`.

### `src/components/BackupPanel.jsx`

- Hook errors: 1.
- Exact rule: `react-hooks/set-state-in-effect`.
- Effect: reads backup stats and auto-backups, then stores them in local display state.
- Beta-critical: no.
- Risk level: low.
- Touches: local backup display state. The component includes backup/restore controls, but the linting effect itself is read-only initialization.
- Recommended fix strategy: use lazy `useState(...)` initializers for `getBackupStats()` and `getAutoBackups()`, then keep the existing `loadStats()` refresh path for actions that change backup data.
- Recommendation: fix first.

### `src/components/CRMDashboard.jsx`

- Hook errors: 1.
- Exact rule: `react-hooks/set-state-in-effect`.
- Effect: loads dashboard data for the current tenant.
- Beta-critical: yes.
- Risk level: medium.
- Touches: dashboard counts, recent leads, tenant-scoped data.
- Recommended fix strategy: isolate data loading and loading state transitions carefully, then test dashboard counts and empty states.
- Recommendation: defer until lower-risk files pass.

### `src/components/CalendarView.jsx`

- Hook errors: 1.
- Exact rule: `react-hooks/set-state-in-effect`.
- Effect: loads bookings and employees when date or tenant-dependent loaders change.
- Beta-critical: yes.
- Risk level: medium.
- Touches: scheduling, employee data, tenant-scoped Firestore data.
- Recommended fix strategy: handle bookings and employees as separate data subscriptions or carefully guarded async loads. Retest calendar month navigation and employee visibility.
- Recommendation: defer until the core workflow lint pass.

### `src/components/CompanySettings.jsx`

- Hook errors: 1.
- Exact rule: `react-hooks/set-state-in-effect`.
- Effect: loads tenant branding/settings into local settings state.
- Beta-critical: no for first wife beta.
- Risk level: high because it touches tenant/company configuration.
- Touches: tenant settings and branding configuration.
- Recommended fix strategy: defer until tenant settings are explicitly scoped. If fixed later, preserve unsaved form state and preview behavior.
- Recommendation: defer.

### `src/components/CustomerManagement.jsx`

- Hook errors: 1.
- Exact rule: `react-hooks/set-state-in-effect`.
- Effect: loads customers for the current tenant.
- Beta-critical: yes.
- Risk level: medium.
- Touches: customer management, tenant-scoped saved data, core workflow.
- Recommended fix strategy: fix in a dedicated customer workflow pass with customer create/load tests before and after.
- Recommendation: defer until after the low-risk files.

### `src/components/CustomerPortal.jsx`

- Hook errors: 1.
- Exact rule: `react-hooks/set-state-in-effect`.
- Effect: loads quotes and appointments on mount.
- Beta-critical: maybe. It is customer-facing, but not the first owner/admin workflow blocker.
- Risk level: medium.
- Touches: quotes and appointments.
- Recommended fix strategy: separate quote loading from local appointment loading. Confirm customer portal empty states still render.
- Recommendation: defer until after low-risk files.

### `src/components/EmployeeManagement.jsx`

- Hook errors: 1.
- Exact rule: `react-hooks/set-state-in-effect`.
- Effect: loads employee records for the tenant.
- Beta-critical: yes.
- Risk level: medium.
- Touches: employee management, employee assignment readiness, tenant-scoped saved data.
- Recommended fix strategy: fix as part of the employee workflow lint pass. Retest employee creation/listing before employee app testing.
- Recommendation: defer until core employee workflow work is scoped.

### `src/components/EmployeeMobileApp.jsx`

- Hook errors: 1.
- Exact rule: `react-hooks/set-state-in-effect`.
- Effect: loads today's jobs for the selected cleaner.
- Beta-critical: yes.
- Risk level: medium.
- Touches: employee app, assigned jobs, job execution workflow.
- Recommended fix strategy: fix after owner/admin core workflow is stable. Retest assigned job visibility, checklist flow, completion status, and admin status update.
- Recommendation: defer until employee app pass.

### `src/components/InsuranceTracking.jsx`

- Hook errors: 1.
- Exact rule: `react-hooks/set-state-in-effect`.
- Effect: loads tenant insurance data.
- Beta-critical: no for first wife beta.
- Risk level: medium.
- Touches: tenant compliance data.
- Recommended fix strategy: handle after core workflow lint items. Preserve existing save/load behavior.
- Recommendation: defer.

### `src/components/PaymentLinks.jsx`

- Hook errors: 1.
- Exact rule: `react-hooks/set-state-in-effect`.
- Effect: loads leads for creating payment links.
- Beta-critical: no until payment testing is explicitly in scope.
- Risk level: high.
- Touches: payments, payment links, leads, tenant-scoped data.
- Recommended fix strategy: defer until payment testing starts. Retest lead selection and payment link creation with safe test data only.
- Recommendation: defer.

### `src/components/RecurringServices.jsx`

- Hook errors: 1.
- Exact rule: `react-hooks/set-state-in-effect`.
- Effect: loads recurring service records for the tenant.
- Beta-critical: yes, but after standard clean flow is stable.
- Risk level: medium.
- Touches: recurring customer workflow and tenant-scoped saved data.
- Recommended fix strategy: fix after the first standard clean workflow passes. Retest repeat job creation and persisted customer notes.
- Recommendation: defer until core workflow pass.

### `src/components/RouteOptimization.jsx`

- Hook errors: 2.
- Exact rule: `react-hooks/set-state-in-effect`.
- Effects:
  - Loads employees for route planning.
  - Loads jobs when an employee is selected or the selected date changes.
- Beta-critical: no for first wife beta.
- Risk level: medium.
- Touches: scheduling, employees, jobs, route optimization.
- Recommended fix strategy: defer until scheduling basics are stable. Fix both effects together to avoid partial route-planning behavior changes.
- Recommendation: defer.

### `src/components/StaffScheduling.jsx`

- Hook errors: 1.
- Exact rule: `react-hooks/set-state-in-effect`.
- Effect: loads employees and shifts/jobs for the selected date.
- Beta-critical: yes.
- Risk level: medium.
- Touches: scheduling, employee availability, job/staff workflow.
- Recommended fix strategy: fix with scheduling workflow tests. Retest selected date changes and employee modal behavior.
- Recommendation: defer until scheduling workflow pass.

### `src/components/StripeConnectOnboarding.jsx`

- Hook errors: 1.
- Exact rule: `react-hooks/set-state-in-effect`.
- Effect: fetches Stripe Connect account status when `tenantId` exists.
- Beta-critical: no until payment testing.
- Risk level: high.
- Touches: Stripe Connect, payment onboarding, tenant identity.
- Recommended fix strategy: do not touch until payment work is explicitly scoped. Use safe Stripe test mode only when fixed.
- Recommendation: defer.

### `src/components/TenantManagement.jsx`

- Hook errors: 1.
- Exact rule: `react-hooks/set-state-in-effect`.
- Effect: loads tenant management data for the super-admin view.
- Beta-critical: no for wife beta.
- Risk level: high.
- Touches: tenant management and super-admin workflows.
- Recommended fix strategy: defer until tenant management is explicitly scoped. Preserve tenant switching and admin visibility behavior.
- Recommendation: defer.

## Recommended Fix Order

Start with the lowest-risk, non-payment, non-auth, non-tenant components:

1. `src/components/BackupPanel.jsx`
2. `src/components/AIModelTraining.jsx`
3. `src/components/CustomerPortal.jsx`
4. `src/components/CRMDashboard.jsx`
5. `src/components/CustomerManagement.jsx`
6. `src/components/EmployeeManagement.jsx`
7. `src/components/StaffScheduling.jsx`
8. `src/components/CalendarView.jsx`
9. `src/components/EmployeeMobileApp.jsx`
10. `src/components/RecurringServices.jsx`
11. `src/components/RouteOptimization.jsx`
12. `src/components/InsuranceTracking.jsx`

Defer high-risk files until explicitly scoped:

1. `src/App.jsx`
2. `src/components/AICreditWallet.jsx`
3. `src/components/CompanySettings.jsx`
4. `src/components/PaymentLinks.jsx`
5. `src/components/StripeConnectOnboarding.jsx`
6. `src/components/TenantManagement.jsx`

## Recommended Next One-File Fix Prompt

Use this as the next focused task:

```text
You are working in:
C:\Users\merce\Documents\SLAI_Real\ServicesOS\servicesos-web

Goal: Fix only the `react-hooks/set-state-in-effect` lint error in `src/components/BackupPanel.jsx`.

Scope:
- Modify only `src/components/BackupPanel.jsx` and, if needed, `docs/servicesos-beta/LINT_BASELINE_PROGRESS.md`.
- Do not touch payments, Stripe, Firebase rules, auth, tenant management, routing, backend, Tap to Pay, or unrelated components.
- Preserve backup/restore behavior.
- Prefer lazy initial state for read-only backup stats and auto-backup list.
- Keep existing refresh behavior after backup actions.

After changes, run:
- npm run lint
- npm run test -- --run
- npm run build

Do not commit.
Report files changed, lint result, test result, build result, and whether behavior changed.
```

