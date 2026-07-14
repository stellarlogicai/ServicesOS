# Super-Admin Tenant Context Contract

## Purpose

ServicesOS tenant-scoped reads and writes must resolve one active tenant before a tenant page mounts. This contract prevents a super-admin from accidentally reading or writing a profile tenant, a stale tenant, `DEFAULT`, or another fallback tenant.

## Canonical resolution

`AuthContext` exposes `activeTenantId` and the backwards-compatible `tenantId` alias. Both contain the same canonical value.

- `admin`, `employee`, and `customer` use only `users/{uid}.tenantId`.
- `super-admin` uses only the explicitly selected and successfully loaded `currentTenant.id`.
- An empty, malformed, unsupported, or `DEFAULT` tenant ID resolves to `null`.
- Normal roles cannot replace their profile tenant through `switchTenant`.
- Super-admin profile tenant values are never used as an implicit fallback.

`currentTenant` remains the loaded tenant document for owner/admin screens that need business configuration. Customer and employee contexts intentionally do not load the full tenant document.

## Selection behavior

Super-admin selects a tenant from Tenant management. `switchTenant` loads that tenant document before publishing its ID as the active tenant.

When selection changes:

1. The previous tenant and auxiliary tenant ID are cleared immediately.
2. Tenant-scoped pages unmount and display a loading/selection state.
3. The requested tenant document is loaded.
4. The new tenant becomes active only if that request is still the newest selection request.
5. A late response from an older request is ignored.

Invalid or inaccessible tenant selections return a failure and do not become active.

The selected tenant is intentionally not persisted across sign-out or refresh in this V1 slice. After a fresh super-admin session, tenant-scoped pages require a new explicit selection instead of silently falling back.

## No-selection behavior

Without an active super-admin tenant, tenant-scoped pages render:

> Select a tenant to view this area.

The page component does not mount, so it cannot start a tenant read or expose a tenant write action.

Tenant-scoped pages include:

- Dashboard
- Create estimate
- Customers
- Bookings
- Calendar
- Field Mode
- Business Settings
- Data Export
- Staff Scheduling
- Route Optimization
- Insurance
- AI Training
- Company Settings

Global super-admin pages such as Tenant management and the local-only GrowthAI helper do not require a tenant selection.

## Stale-state protection

Tenant-scoped components are keyed by the canonical tenant ID so changing tenants creates a fresh component instance. Bookings, Calendar, and Field Mode also track their load request generation and the tenant associated with loaded records.

- Tenant A records are hidden as soon as the active ID changes.
- Tenant A dialogs/job packets close during the switch.
- Late Tenant A reads cannot overwrite Tenant B state.
- Retry actions always capture the current canonical tenant ID.
- Tenant-scoped components are unavailable during the gap between clearing Tenant A and confirming Tenant B.

Firestore requests already accepted by the browser cannot be physically recalled. The UI prevents starting a stale action after context invalidation and discards stale response state; backend rules remain the final tenant-isolation boundary.

## Page integration rule

New tenant-scoped UI must:

1. Read `tenantId` or `activeTenantId` from `useAuth()` rather than inventing a fallback.
2. Never use `DEFAULT`, a hardcoded tenant, or the super-admin profile tenant.
3. Avoid mounting for a super-admin until a tenant is selected.
4. Clear tenant-derived local state when the canonical ID changes.
5. Ignore async results whose request generation is no longer current.
6. Pass the canonical tenant ID to every tenant-scoped service read and write.

## Regression coverage

Focused tests cover:

- profile-tenant resolution for normal roles
- explicit-selection resolution for super-admin
- missing and `DEFAULT` rejection
- overlapping super-admin selection requests
- no-selection page blocking
- selected-tenant access to tenant pages
- late Tenant A responses in Bookings, Calendar, and Field Mode
- existing role and route boundaries

No Firebase rules, Storage rules, Cloud Functions runtime code, Stripe logic, payment truth behavior, or deployment configuration is changed by this contract.
