/**
 * migrate-add-tenant-ids.js
 *
 * ONE-TIME MIGRATION SCRIPT
 * Adds `tenantId` to every existing Firestore user doc so the new
 * multi-tenant AuthContext can load tenants correctly.
 *
 * WHAT IT DOES
 *  1. Creates (or finds) a tenant doc for your existing business
 *     ("Aunt B's Cleaning Services") if one doesn't already exist.
 *  2. Loops through every doc in `users`:
 *       - super-admin  → tenantId: null   (they see all tenants)
 *       - admin/customer (no tenantId yet) → tenantId: <the new tenant's id>
 *       - anyone who already has a tenantId → left untouched
 *  3. Prints a full summary before AND after — nothing is silently changed.
 *
 * SAFETY
 *  - Idempotent: running it twice does nothing the second time.
 *  - Dry-run by default. You must pass --apply to actually write changes.
 *  - Only ever ADDS a missing tenantId field — never deletes/overwrites
 *    existing data on a user doc.
 *
 * SETUP
 *   1. npm install firebase-admin
 *   2. Download your service account key:
 *        Firebase Console → Project Settings → Service Accounts
 *        → Generate new private key → save as serviceAccountKey.json
 *      Keep this file OUT of git (.gitignore it immediately).
 *   3. Place serviceAccountKey.json in the same folder as this script,
 *      or set GOOGLE_APPLICATION_CREDENTIALS to its path.
 *
 * USAGE
 *   node scripts/migrations/migrate-add-tenant-ids.cjs                  ← dry run (no writes)
 *   node scripts/migrations/migrate-add-tenant-ids.cjs --apply           ← actually writes
 *   node scripts/migrations/migrate-add-tenant-ids.cjs --apply --business-name "Aunt B's Cleaning Services" --business-email hello@auntbscleaning.com --business-phone "(417) 555-0100"
 */

const admin = require("firebase-admin");
const path  = require("path");
const fs    = require("fs");

// ─── Parse CLI args ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name, fallback) => {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
};

const DRY_RUN       = !flag("apply");
const BUSINESS_NAME = value("business-name",  "Aunt B's Cleaning Services");
const BUSINESS_EMAIL= value("business-email", "hello@auntbscleaning.com");
const BUSINESS_PHONE= value("business-phone", "");
const SUBSCRIPTION_TIER = value("tier", "professional");

// ─── Init Firebase Admin ───────────────────────────────────────────────────────
const keyPath = path.join(__dirname, "serviceAccountKey.json");

if (fs.existsSync(keyPath)) {
  admin.initializeApp({
    credential: admin.credential.cert(require(keyPath)),
  });
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  admin.initializeApp({ credential: admin.credential.applicationDefault() });
} else {
  console.error(
    "\n❌  No service account key found.\n" +
    "    Place serviceAccountKey.json next to this script, or set\n" +
    "    GOOGLE_APPLICATION_CREDENTIALS to its path.\n"
  );
  process.exit(1);
}

const db = admin.firestore();

// ─── Helpers ────────────────────────────────────────────────────────────────────
function log(msg)  { console.log(msg); }
function ok(msg)   { console.log(`  ✅ ${msg}`); }
function warn(msg) { console.log(`  ⚠️  ${msg}`); }
function skip(msg) { console.log(`  ⏭️  ${msg}`); }

// ─── Step 1: Find or create the default tenant ────────────────────────────────
async function findOrCreateDefaultTenant() {
  log("\n── Step 1: Default tenant ──────────────────────────────");

  const tenantsRef = db.collection("tenants");
  const existing = await tenantsRef
    .where("businessEmail", "==", BUSINESS_EMAIL)
    .limit(1)
    .get();

  if (!existing.empty) {
    const doc = existing.docs[0];
    ok(`Found existing tenant "${doc.data().businessName}" (${doc.id})`);
    return { id: doc.id, ...doc.data() };
  }

  const tenantId = `tenant_${Date.now()}`;
  const tenantDoc = {
    id: tenantId,
    businessName:    BUSINESS_NAME,
    businessEmail:   BUSINESS_EMAIL,
    businessPhone:   BUSINESS_PHONE,
    businessAddress: "",
    subscriptionTier: SUBSCRIPTION_TIER,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    status: "active",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    settings: {
      customBranding: {},
      bookingUrl: "",
      emailFrom: "",
      businessLogo: "",
      features: {},
    },
    limits: { users: 50, locations: 5 },
    _createdByMigration: true,
  };

  if (DRY_RUN) {
    warn(`[DRY RUN] Would create tenant "${BUSINESS_NAME}" with id ${tenantId}`);
    return { id: tenantId, ...tenantDoc };
  }

  await tenantsRef.doc(tenantId).set(tenantDoc);
  ok(`Created tenant "${BUSINESS_NAME}" (${tenantId})`);
  return { id: tenantId, ...tenantDoc };
}

// ─── Step 2: Migrate user docs ──────────────────────────────────────────────────
async function migrateUsers(defaultTenant) {
  log("\n── Step 2: User documents ──────────────────────────────");

  const usersSnap = await db.collection("users").get();

  if (usersSnap.empty) {
    warn("No users found in the `users` collection. Nothing to migrate.");
    return { total: 0, updated: 0, skipped: 0, superAdmins: 0 };
  }

  let updated = 0, skipped = 0, superAdmins = 0;
  const batch = db.batch();
  let batchCount = 0;

  for (const userDoc of usersSnap.docs) {
    const data = userDoc.data();
    const uid  = userDoc.id;
    const role = data.role || "customer";

    // Already migrated — leave alone
    if (Object.prototype.hasOwnProperty.call(data, "tenantId")) {
      skip(`${data.email || uid} — already has tenantId (${data.tenantId ?? "null"})`);
      skipped++;
      continue;
    }

    // Super-admins get tenantId: null (they span all tenants)
    if (role === "super-admin") {
      superAdmins++;
      if (DRY_RUN) {
        warn(`[DRY RUN] Would set tenantId: null for super-admin ${data.email || uid}`);
      } else {
        batch.update(userDoc.ref, { tenantId: null });
        batchCount++;
      }
      updated++;
      continue;
    }

    // Everyone else gets assigned to the default tenant
    if (DRY_RUN) {
      warn(`[DRY RUN] Would set tenantId: ${defaultTenant.id} for ${role} ${data.email || uid}`);
    } else {
      batch.update(userDoc.ref, { tenantId: defaultTenant.id });
      batchCount++;
    }
    updated++;

    // Firestore batches max out at 500 writes
    if (batchCount >= 450) {
      await batch.commit();
      batchCount = 0;
    }
  }

  if (!DRY_RUN && batchCount > 0) {
    await batch.commit();
  }

  if (!DRY_RUN) {
    ok(`Committed ${updated} user doc update(s)`);
  }

  return { total: usersSnap.size, updated, skipped, superAdmins };
}

// ─── Step 3: Verify ─────────────────────────────────────────────────────────────
async function verify(defaultTenant) {
  log("\n── Step 3: Verification ────────────────────────────────");

  if (DRY_RUN) {
    skip("Skipped — dry run only");
    return;
  }

  const usersSnap = await db.collection("users").get();
  const missing = usersSnap.docs.filter(
    d => !Object.prototype.hasOwnProperty.call(d.data(), "tenantId")
  );

  if (missing.length === 0) {
    ok("Every user doc now has a tenantId field.");
  } else {
    warn(`${missing.length} user doc(s) still missing tenantId:`);
    missing.forEach(d => console.log(`     - ${d.id} (${d.data().email || "no email"})`));
  }

  const tenantSnap = await db.collection("tenants").doc(defaultTenant.id).get();
  if (tenantSnap.exists) {
    ok(`Tenant "${tenantSnap.data().businessName}" confirmed in Firestore.`);
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────────
(async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  Multi-tenant migration: add tenantId to user docs");
  console.log("═══════════════════════════════════════════════════════");

  if (DRY_RUN) {
    console.log("\n  🔍 DRY RUN MODE — no changes will be written.");
    console.log("     Re-run with --apply to actually migrate.\n");
  } else {
    console.log("\n  ⚡ APPLY MODE — changes WILL be written to Firestore.\n");
  }

  try {
    const tenant = await findOrCreateDefaultTenant();
    const result = await migrateUsers(tenant);
    await verify(tenant);

    console.log("\n── Summary ──────────────────────────────────────────────");
    console.log(`  Tenant:           ${tenant.businessName} (${tenant.id})`);
    console.log(`  Total users:      ${result.total}`);
    console.log(`  Updated:          ${result.updated}`);
    console.log(`  Already migrated: ${result.skipped}`);
    console.log(`  Super-admins:     ${result.superAdmins}`);
    console.log("═══════════════════════════════════════════════════════\n");

    if (DRY_RUN) {
      console.log("  Nothing was written. Run again with --apply to commit these changes.\n");
    } else {
      console.log("  ✅ Migration complete.\n");
    }

    process.exit(0);
  } catch (err) {
    console.error("\n❌ Migration failed:\n", err);
    process.exit(1);
  }
})();
