# Customer Portal Tenant Permission Fix Progress

## Crash Root Cause

**CustomerPortal.jsx line 520** attempted to access `quote.formData.fullName` without checking if `quote.formData` exists. When quotes/leads have malformed or legacy data structures, `formData` may be undefined, causing:

```
Uncaught TypeError: Cannot read properties of undefined (reading 'fullName')
```

## Crash Fix

**File:** `src/components/CustomerPortal.jsx`

**Changes:**
- Added optional chaining (`?.`) to all quote data access
- Added fallback values for missing fields:
  - Customer name: `quote.formData?.fullName || quote.customerSnapshot?.fullName || quote.customerSnapshot?.displayName || quote.email || 'Customer'`
  - Service type: `quote.formData?._cleaningType || quote.requestSnapshot?.cleaningType || quote.formData?.cleaningType || 'Standard'`
  - Bedrooms/bathrooms: Fallback to `requestSnapshot` values or 0
  - Created date: Check if `quote.createdAt` exists before formatting
- Preserves valid data when present
- Does not change quote persistence or appointment behavior

## Tenant Read Permission Root Cause

**FirebaseError: Missing or insufficient permissions** when reading `tenants/tenant_1781642309523`

**Rules file:** `cloud-functions/firestore.rules` (deployed per `firebase.json` line 21)

**Blocking rule:** Line 30-35
```javascript
match /tenants/{tenantId} {
  allow read: if isSuperAdmin() || isTenantAdmin(tenantId) || isTenantUser(tenantId);
  // ...
}
```

**Helper functions:**
- `isTenantUser(tenantId)` (lines 20-23): Checks if `request.auth.uid in tenants/{tenantId}.data.users`
- `isTenantAdmin(tenantId)` (lines 15-18): Checks if `request.auth.uid in tenants/{tenantId}.data.adminUsers`

**Issue:** The signed-in customer UID is not in the tenant's `users` array, so `isTenantUser()` returns false. The user is not a super-admin, so tenant read is denied.

## Tenant Document Fields Expected by Rules

The rules expect the tenant document to have:
- `users`: Array of UIDs allowed to read the tenant
- `adminUsers`: Array of UIDs with admin access to the tenant

## Recommended Minimal Safe Fix

**Data fix (not rules change):** Add the customer's Firebase Auth UID to the tenant's `users` array in Firestore:

1. Open Firebase Console → Firestore → `tenants/tenant_1781642309523`
2. Add the customer's UID to the `users` array
3. If the customer should have admin access, add to `adminUsers` instead

**Why this is safe:**
- Rules already support the `users` array pattern
- This is the intended mechanism for tenant membership
- No rules deployment needed
- Follows existing security model

## Alternative Rules Change (Not Recommended)

A rules change could allow customers to read their tenant if they have a customer record under that tenant, but this is more complex and could have security implications. The data fix is simpler and follows the existing pattern.

## Rules Changed

**No** - rules were not changed. The issue is a data problem, not a rules problem.

## Rules Deployment Needed

**No** - rules deployment is not needed. The fix is to add the customer UID to the tenant's `users` array in Firestore.

## Manual Retest Steps

1. **Add customer UID to tenant:**
   - Open Firebase Console → Firestore → `tenants/tenant_1781642309523`
   - Add the signed-in customer's UID to the `users` array

2. **Restart Vite dev server** (if needed)

3. **Sign out and sign back in** to reload AuthContext

4. **Open Customer Portal** and verify:
   - Business field shows tenant name or tenant ID
   - Customer Match shows `authUid` or `email`
   - No permission errors in console
   - No crash when rendering quotes

5. **Test quote rendering** with malformed data:
   - Create a test quote with missing `formData`
   - Verify Customer Portal renders it with fallback values
   - Verify no crash occurs
