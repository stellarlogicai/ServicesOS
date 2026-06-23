# Customer Portal Tenant Link Fix Progress

## Root Cause

**CONFIRMED:** The signed-in user `brown.jamie08@gmail.com` is a super-admin with `tenantId: null`. The Customer Portal requires a tenantId to resolve customer identity, but super-admins intentionally have `tenantId: null` to access all tenants.

## Diagnostic Console Output

```
[Tenant Service] DEV DIAGNOSTICS: Document does not exist {tenantId: null, tenantPath: tenants/null}
[Tenant Service] Error getting tenant: Error: Tenant not found
[Tenant Service] DEV DIAGNOSTICS: Full error details {message: Tenant not found, code: undefined, name: Error}
[Auth] Failed to load tenant: Error: Tenant not found
```

## Firebase Project / Config Check

**App Firebase Project (masked):**
- Project ID: `clea...stem` (cleaning-intake-system) ✓
- Auth Domain: `clea....com` (cleaning-intake-system.firebaseapp.com) ✓

**Status:** Firebase project is correct and matches expected `cleaning-intake-system`.

## Tenant ID Analysis

**Actual tenantId read:** `null`
**Expected tenantId:** `tenant_1781642309523`

**Root cause:** The user document for `brown.jamie08@gmail.com` has `tenantId: null` because this is a super-admin account. Super-admins do not have a tenantId by design - they can access all tenants.

## Tenant Path Being Read

**Path attempted:** `tenants/null`
**Expected path:** `tenants/tenant_1781642309523`

**Status:** Path is correct for the tenantId being passed (`null`), but the tenantId itself is the issue.

## Firebase Console Project Match

**Status:** Confirmed - app is using `cleaning-intake-system` project.

## Customer Record Match

**Status:** Not tested - customer resolution cannot run without a valid tenantId.

## Files Changed

1. **src/services/tenantService.js**
   - Added dev-safe diagnostics (DEV mode only)
   - Logs masked projectId, tenantId, tenant path, tenantId type/length
   - Logs error details (message, code, name) on failure
   - Logs when document does not exist
   - No secrets logged

2. **src/components/CustomerPortal.jsx**
   - Fixed `getQuotes()` to only call when `resolvedTenantId` is available
   - Added error handling for quote loading
   - Changed dependency from `[]` to `[resolvedTenantId]`
   - Prevents misleading CRM tenant error on initial load

## Rules / Permissions

**Status:** Not applicable - issue is tenantId being null, not permissions.

## Temporary Logs

**Status:** Added (DEV mode only) - working correctly and providing clear diagnostics.

## Validation Results

**Lint:** Passed
**Test:** Passed (76 tests, 9 test files)
**Build:** Passed

## Manual Retest Result

**Test 1 - brown.jamie08@gmail.com (Initial):**
- Signed in as: `brown.jamie08@gmail.com` (Super Admin)
- User role: Super Admin
- tenantId: `null`
- Customer Portal status: Not linked (cannot resolve without tenantId)
- Business field: `null`

**Test 2 - test.customer@gmail.com:**
- Sign-in failed with 400 error from Firebase Auth
- Account either doesn't exist or credentials are incorrect
- Diagnostics would show `tenantId: null` if account existed

**Test 3 - brown.jamie08@gmail.com (After user update attempt):**
- Signed in as: `brown.jamie08@gmail.com` (Super Admin)
- User role: Super Admin
- tenantId: `null` (still null - Firestore user document not updated yet)
- Customer Portal status: Not linked (cannot resolve without tenantId)
- Business field: `null`
- Diagnostics working correctly: `[Tenant Service] DEV DIAGNOSTICS: Document does not exist {tenantId: null, tenantPath: tenants/null}`

## Next Fix

**To test Customer Portal properly, you need to:**

1. **Create or use a customer account** with `tenantId: tenant_1781642309523` set in their user document
2. **Sign in with that customer account** (not the super-admin account)
3. **Verify the customer user document has:**
   - `role: 'customer'`
   - `tenantId: 'tenant_1781642309523'`
   - `status: 'active'`
   - `email: <customer email>`
4. **Verify the customer record exists:**
   - `tenants/tenant_1781642309523/customers/customer_quote_test_001`
   - Has `authUid` matching the customer's Firebase Auth UID OR `email` matching the customer's email

**Alternative:** If you want to test with the super-admin account temporarily, you could set `users/{uid}.tenantId = 'tenant_1781642309523'` for the super-admin user in Firestore, but this is not recommended for production use.

## What Was Not Changed

- Firebase rules (not touched)
- Auth behavior (not touched)
- Stripe/payments (not touched)
- Backend/cloud functions (not touched)
- Tap to Pay (not touched)
- Tenant checks (not bypassed or disabled)
- Identity guards (not bypassed or disabled)
