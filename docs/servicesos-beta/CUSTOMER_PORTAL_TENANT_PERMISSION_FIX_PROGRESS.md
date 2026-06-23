# Customer Portal Tenant Permission Fix Progress

## Diagnosis

The denied tenant read originates from this call chain:

1. `src/contexts/AuthContext.jsx`
2. `loadTenant(tenantId, userRole)`
3. `src/services/tenantService.js`
4. `getTenant(tenantId)`
5. Firestore `getDoc(doc(db, "tenants", tenantId))`

Deployed tenant rules reject that full tenant-document read for a customer who is not listed in the tenant document's admin/user membership arrays.

## Cause Classification

The Customer Portal does not need the full `tenants/{tenantId}` document. It only needs the tenant ID from `users/{uid}.tenantId` to scope customer and quote-request access.

This matches cause 3: AuthContext loading full tenant data unnecessarily for customer users.

The active `src/contexts/AuthContext.jsx` now has the minimal guard:

```javascript
if (userRole === 'customer') {
  setCurrentTenantId(tenantId);
  setCurrentTenant(null);
} else {
  const tenant = await getTenant(tenantId);
  setCurrentTenant(tenant);
  setCurrentTenantId(tenantId);
}
```

The app entry point imports this active context from `src/contexts/AuthContext.jsx`.

## Security Impact

- No Firebase rules were loosened.
- Customers are not allowed to read all tenant documents.
- Tenant isolation remains based on `users/{uid}.tenantId`.
- Customer Portal continues to query only tenant-scoped customer and lead data.
- No broad tenant membership data change is required merely to render Customer Portal.

## Console Error Status

The code path causing the `tenantService` permission denial is guarded for customer-role users. A fresh build/sign-in should no longer call `tenantService.getTenant` during customer auth loading.

If the same log appears after deploying this build, verify:

1. The browser is running the current bundle rather than a stale cached build.
2. `users/{uid}.role` is exactly `customer`.
3. The app is using `src/contexts/AuthContext.jsx`, not the unused legacy `src/contexts/auth/AuthContext.jsx`.
4. The stack trace still points to `tenantService.getTenant`.

Do not change Firestore rules unless a new stack trace proves a separate tenant read is required.

## Rules Recommendation

No rules change is recommended for this cleanup.

If a future customer feature truly requires tenant branding fields, add a narrowly scoped public/customer-safe tenant profile document or an explicit rule limited to the authenticated user's linked tenant. Do not allow all authenticated users to read all tenants.

## Manual Retest

1. Sign out and sign back in as a linked customer.
2. Open Customer Portal.
3. Confirm no `tenantService` permission-denied stack appears.
4. Confirm `tenantId` is still available for customer/customer-quote queries.
5. Confirm customer identity resolves.
6. Submit a quote request and confirm it appears in owner/admin leads.
