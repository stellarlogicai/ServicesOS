# Customer Portal Tenant Link Diagnosis

## Error Observed

Manual Customer Portal testing still showed the customer account as not linked:

- Business: null / not linked
- Customer Match: Not linked

Observed console errors:

- `[CRM Service] Tenant ID is required for getting leads`
- `[Tenant Service] Error getting tenant: Error: Tenant not found`
- `[Auth] Failed to load tenant: Error: Tenant not found`

Firestore was expected to contain:

- `users/{uid}.tenantId = tenant_1781642309523`
- `tenants/tenant_1781642309523`
- `tenants/tenant_1781642309523/customers/customer_quote_test_001`

## Firebase Project / Config Checked

The app reads Firebase configuration from `servicesos-web/.env` through `src/firebase.js`.

Masked local config observed:

- `VITE_FIREBASE_AUTH_DOMAIN=clea....com`
- `VITE_FIREBASE_PROJECT_ID=clea...stem`
- `VITE_FIREBASE_STORAGE_BUCKET=clea....app`
- `VITE_FIREBASE_MESSAGING_SENDER_ID=9926...4983`
- `VITE_FIREBASE_APP_ID=1:99...9852`

No API keys or secrets were printed.

## Firebase Config Source

`src/firebase.js` initializes Firebase with:

- `import.meta.env.VITE_FIREBASE_API_KEY`
- `import.meta.env.VITE_FIREBASE_AUTH_DOMAIN`
- `import.meta.env.VITE_FIREBASE_PROJECT_ID`
- `import.meta.env.VITE_FIREBASE_STORAGE_BUCKET`
- `import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID`
- `import.meta.env.VITE_FIREBASE_APP_ID`

Because this is a Vite app, `.env` changes require restarting the dev server before the browser will use the new values.

## Tenant Service Path

`src/services/tenantService.js` uses:

```js
getDoc(doc(db, 'tenants', tenantId))
```

For the expected test tenant, the lookup path is:

```text
tenants/tenant_1781642309523
```

`getTenant()` does not check extra business fields before throwing. It throws `Tenant not found` only when the tenant document snapshot does not exist from the app's configured Firebase project/path.

## Auth Tenant Loading Flow

`src/contexts/AuthContext.jsx` loads identity in this order:

1. Firebase Auth returns `firebaseUser`.
2. Firestore reads `users/{firebaseUser.uid}`.
3. The profile is built with `uid` plus the user document data.
4. AuthContext calls `loadTenant(profile.tenantId || null)`.
5. `loadTenant()` calls `getTenant(tenantId)`.
6. If tenant loading succeeds:
   - `currentTenant` is set.
   - `current_tenant_id` is written to localStorage through `setCurrentTenantId(tenantId)`.
7. If tenant loading fails:
   - `[Auth] Failed to load tenant` is logged.
   - `currentTenant` is set to `null`.
   - `userProfile.tenantId` is not intentionally cleared.

That means the customer can still have a `userProfile.tenantId` while the displayed business object remains null because `currentTenant` failed to load.

## Customer Portal Identity Flow

`src/components/CustomerPortal.jsx` reads:

- `user`
- `userProfile`
- `tenantId`
- `currentTenant`

It resolves a tenant ID from:

```js
tenantId || currentTenant?.id || null
```

It then calls `resolveCustomerPortalCustomer()` with that tenant ID and the signed-in user.

`src/services/customerPortalIdentityService.js` resolves the customer record by querying:

1. `tenants/{tenantId}/customers` where `authUid == user.uid`
2. fallback: `tenants/{tenantId}/customers` where `email == user.email`

If the tenant ID is missing, customer matching does not run.

## Separate Quote List Error

The CRM error is a separate Customer Portal issue:

```js
getQuotes().then(...)
```

`CustomerPortal.jsx` currently calls `getQuotes()` without passing a tenant ID. `crmService.getQuotes(tenantId)` delegates to `getLeads(tenantId)`, so it logs:

```text
[CRM Service] Tenant ID is required for getting leads
```

This does not prove the user has no tenant link. It means the quotes list still needs to be tenant-aware in a follow-up fix.

## Firebase Rules Note

The local Firestore rules include:

- `match /tenants/{tenantId}`
- tenant read is allowed for super-admin, tenant admin, or tenant user.
- `isTenantUser(tenantId)` checks whether `request.auth.uid` is in `tenants/{tenantId}.data.users`.
- `match /tenants/{tenantId}/customers/{customerId}` currently allows authenticated reads in the local rules.

If deployed rules deny tenant reads, the usual client error should be permission-related, not the custom `Tenant not found` error. The observed `Tenant not found` points more strongly to a missing document from the app's configured project/path, a mismatched tenant ID, or stale runtime config/state.

## Likely Cause

Most likely causes, in order:

1. The tenant document exists in a different Firebase project than the one currently configured by `servicesos-web/.env`.
2. The tenant document ID differs from `users/{uid}.tenantId` by a typo, case difference, trailing space, or hidden character.
3. The dev server/browser is still using stale Firebase config or stale auth profile state from before the Firestore edits.
4. The tenant document exists but deployed Firestore rules do not allow this signed-in customer UID to read `tenants/{tenantId}`.
5. The customer record exists, but its `authUid` or `email` does not match the signed-in Firebase Auth user after tenant resolution succeeds.

## Manual Fix Steps

1. Confirm the Firebase Console project matches the app's masked local project:
   - Project ID begins with `clea` and ends with `stem`.
   - Auth domain begins with `clea` and ends with `.com`.
2. In that same Firebase project, open Firestore.
3. Confirm this exact tenant document exists:
   - `tenants/tenant_1781642309523`
   - No trailing spaces.
   - Same capitalization.
4. Open the signed-in test customer's user document:
   - `users/{uid}`
5. Confirm:
   - `tenantId` is a string exactly equal to `tenant_1781642309523`.
   - `role` is `customer`.
   - `status` is `active`.
6. If deployed rules require tenant membership, add the signed-in UID to the tenant document membership field expected by rules:
   - `tenants/tenant_1781642309523.users` should include the customer UID.
7. Confirm the customer record exists under the same tenant:
   - `tenants/tenant_1781642309523/customers/customer_quote_test_001`
8. Confirm the customer record has at least one exact match:
   - `authUid` equals the signed-in Firebase Auth UID, or
   - `email` equals the signed-in Firebase Auth email.
9. Restart the Vite dev server if `.env` was changed.
10. Sign out and sign back in, or hard refresh the browser, so AuthContext reloads `users/{uid}` and the tenant document.
11. Reopen Customer Portal and verify:
   - Business shows the tenant name or tenant ID.
   - Customer Match shows `authUid` or `email`.

## Code Change Recommendation

No code change is recommended for the tenant guard itself until the Firebase project/path and test records are confirmed.

Recommended follow-up code fix after the data link is verified:

- Update Customer Portal quote loading so `getQuotes(resolvedTenantId)` is called only after a tenant ID is available.
- Avoid logging the misleading CRM tenant error on initial Customer Portal load.
- Optionally add dev-safe diagnostics that log masked UID, tenant ID, masked project ID, and the tenant path being read.

## What Not To Change

- Do not bypass Customer Portal identity guards.
- Do not disable tenant checks.
- Do not loosen Firebase rules as a shortcut.
- Do not change auth behavior.
- Do not change Stripe, Stripe Connect, payments, backend/cloud functions, Tap to Pay, or production data.

## Temporary Logging Status

No temporary diagnostic logs were added in this pass.
