# Running the tenant migration script

This is a **one-time** script. You run it from your terminal (Node.js),
not from inside your React app — it needs admin-level Firestore access
that your browser app intentionally doesn't have.

## 1. Install the one dependency it needs

```bash
npm install firebase-admin --save-dev
```

(`--save-dev` because you'll likely only ever run this once or twice —
feel free to drop the flag if you want it as a regular dependency.)

## 2. Get your service account key

1. Go to the [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. ⚙️ **Project Settings → Service Accounts**
4. Click **Generate new private key**
5. Save the downloaded file as `serviceAccountKey.json`
6. Put it in the **same folder** as `migrate-add-tenant-ids.cjs`

⚠️ **Important:** Add this to your `.gitignore` immediately:
```
serviceAccountKey.json
```
This file has full admin access to your Firebase project. Never commit it.

## 3. Dry run first (always)

```bash
node scripts/migrations/migrate-add-tenant-ids.cjs
```

This shows you exactly what *would* happen — which tenant would be
created, which users would get which `tenantId` — without writing
anything. Read the output carefully.

## 4. Apply it for real

```bash
node scripts/migrations/migrate-add-tenant-ids.cjs --apply
```

## Optional: customize your business info

If "Aunt B's Cleaning Services" isn't quite right, or you want a
different contact email/phone on the tenant record:

```bash
node scripts/migrations/migrate-add-tenant-ids.cjs --apply \
  --business-name "Aunt B's Cleaning Services" \
  --business-email "hello@auntbscleaning.com" \
  --business-phone "(417) 555-0100" \
  --tier "professional"
```

## What it actually does, step by step

1. **Looks for an existing tenant** matching the business email you
   gave it. If found, reuses it. If not, creates a new tenant doc in
   the `tenants` collection.
2. **Loops through every doc in `users`:**
   - If a user already has a `tenantId` field (even `null`) → **skipped**, untouched.
   - If their role is `super-admin` → gets `tenantId: null` (they see all tenants).
   - Everyone else (`admin`, `customer`) → gets `tenantId: <the tenant from step 1>`.
3. **Verifies** afterward that every user doc has the field, and prints
   a summary.

## Is it safe to run twice?

Yes. The second run will find the tenant already exists (by email) and
find every user already has a `tenantId`, so it will report
"already migrated" for everyone and make zero writes.

## After running this

Your existing `AuthContext.jsx` will now successfully load `tenantId`
for every user on login, and the tenant switcher / tenant-scoped
dashboard will work correctly for accounts that existed before the
multi-tenant migration.
