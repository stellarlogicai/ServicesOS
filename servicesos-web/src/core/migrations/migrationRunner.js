// src/core/migrations/migrationRunner.js
/**
 * Migration Runner System
 * 
 * This system handles schema migrations for Firestore documents.
 * Migrations are versioned and can be run to update data from one schema version to another.
 */

import { db } from '../../firebase';
import { collection, getDocs, query, where, updateDoc, doc, getDoc } from 'firebase/firestore';
import { logError } from '../../shared/utils/errorLogging';

// Migration registry - stores all available migrations
const MIGRATIONS = new Map();

/**
 * Register a migration
 * @param {string} collectionName - The Firestore collection name
 * @param {number} fromVersion - The schema version to migrate from
 * @param {number} toVersion - The schema version to migrate to
 * @param {Function} migrateFn - The migration function that transforms the document
 */
export function registerMigration(collectionName, fromVersion, toVersion, migrateFn) {
  const key = `${collectionName}_${fromVersion}_${toVersion}`;
  MIGRATIONS.set(key, {
    collectionName,
    fromVersion,
    toVersion,
    migrateFn
  });
}

/**
 * Get migration for a specific collection and version
 * @param {string} collectionName - The Firestore collection name
 * @param {number} fromVersion - The current schema version
 * @param {number} toVersion - The target schema version
 * @returns {Object|null} The migration object or null if not found
 */
export function getMigration(collectionName, fromVersion, toVersion) {
  const key = `${collectionName}_${fromVersion}_${toVersion}`;
  return MIGRATIONS.get(key) || null;
}

/**
 * Get all available migrations for a collection
 * @param {string} collectionName - The Firestore collection name
 * @returns {Array} Array of migration objects
 */
export function getMigrationsForCollection(collectionName) {
  return Array.from(MIGRATIONS.values())
    .filter(m => m.collectionName === collectionName)
    .sort((a, b) => a.fromVersion - b.fromVersion);
}

/**
 * Run a single migration on a document
 * @param {string} tenantId - The tenant ID
 * @param {string} collectionName - The Firestore collection name
 * @param {string} documentId - The document ID
 * @param {Object} migration - The migration object
 * @returns {Promise<Object>} Result object with success status
 */
export async function runMigrationOnDocument(tenantId, collectionName, documentId, migration) {
  try {
    const docRef = doc(db, 'tenants', tenantId, collectionName, documentId);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      return { success: false, message: 'Document not found' };
    }
    
    const data = docSnap.data();
    
    // Check if document is at the correct version
    if (data.schemaVersion !== migration.fromVersion) {
      return { 
        success: false, 
        message: `Document is at version ${data.schemaVersion}, expected ${migration.fromVersion}` 
      };
    }
    
    // Apply migration
    const migratedData = await migration.migrateFn({ id: documentId, ...data });
    
    // Update document with new version and migrated data
    await updateDoc(docRef, {
      ...migratedData,
      schemaVersion: migration.toVersion,
      migratedAt: new Date().toISOString()
    });
    
    return { success: true, message: 'Document migrated successfully' };
  } catch (error) {
    logError('migrationRunner', `Failed to run migration on document ${documentId}`, error);
    return { success: false, message: error.message };
  }
}

/**
 * Run a migration on all documents in a collection for a tenant
 * @param {string} tenantId - The tenant ID
 * @param {string} collectionName - The Firestore collection name
 * @param {number} fromVersion - The current schema version
 * @param {number} toVersion - The target schema version
 * @param {Object} options - Options object
 * @param {boolean} options.dryRun - If true, don't actually apply changes
 * @param {Function} options.onProgress - Callback function for progress updates
 * @returns {Promise<Object>} Result object with success status and statistics
 */
export async function runMigrationOnCollection(tenantId, collectionName, fromVersion, toVersion, options = {}) {
  const { dryRun = false, onProgress } = options;
  
  const migration = getMigration(collectionName, fromVersion, toVersion);
  if (!migration) {
    return { 
      success: false, 
      message: `No migration found for ${collectionName} from v${fromVersion} to v${toVersion}` 
    };
  }
  
  try {
    const collectionRef = collection(db, 'tenants', tenantId, collectionName);
    const q = query(collectionRef, where('schemaVersion', '==', fromVersion));
    const snapshot = await getDocs(q);
    
    const documents = snapshot.docs;
    const total = documents.length;
    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    const errors = [];
    
    if (dryRun) {
      return {
        success: true,
        message: `Dry run: Would migrate ${total} documents`,
        statistics: { total, processed: 0, succeeded: 0, failed: 0, errors: [] }
      };
    }
    
    // Process documents in batches
    const batchSize = 500;
    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      
      for (const docSnapshot of batch) {
        const result = await runMigrationOnDocument(
          tenantId,
          collectionName,
          docSnapshot.id,
          migration
        );
        
        processed++;
        
        if (result.success) {
          succeeded++;
        } else {
          failed++;
          errors.push({ documentId: docSnapshot.id, error: result.message });
        }
        
        if (onProgress) {
          onProgress({ processed, total, succeeded, failed });
        }
      }
    }
    
    return {
      success: true,
      message: `Migration completed: ${succeeded}/${total} documents migrated`,
      statistics: { total, processed, succeeded, failed, errors }
    };
  } catch (error) {
    logError('migrationRunner', `Failed to run migration on collection ${collectionName}`, error);
    return { success: false, message: error.message, statistics: null };
  }
}

/**
 * Run all pending migrations for a tenant
 * @param {string} tenantId - The tenant ID
 * @param {Object} options - Options object
 * @param {boolean} options.dryRun - If true, don't actually apply changes
 * @param {Function} options.onProgress - Callback function for progress updates
 * @returns {Promise<Object>} Result object with success status and migration results
 */
export async function runAllPendingMigrations(tenantId, options = {}) {
  const { dryRun = false, onProgress } = options;
  
  const results = [];
  const collectionsToMigrate = ['customers', 'employees', 'bookings', 'contracts', 'photos', 'reviews', 'training', 'messaging', 'notifications'];
  
  for (const collectionName of collectionsToMigrate) {
    const migrations = getMigrationsForCollection(collectionName);
    
    for (const migration of migrations) {
      const result = await runMigrationOnCollection(
        tenantId,
        collectionName,
        migration.fromVersion,
        migration.toVersion,
        { dryRun, onProgress }
      );
      
      results.push({
        collection: collectionName,
        fromVersion: migration.fromVersion,
        toVersion: migration.toVersion,
        ...result
      });
    }
  }
  
  const totalSucceeded = results.filter(r => r.success).length;
  const totalFailed = results.filter(r => !r.success).length;
  
  return {
    success: totalFailed === 0,
    message: `Migrations completed: ${totalSucceeded} succeeded, ${totalFailed} failed`,
    results
  };
}

/**
 * Get current schema version for a document
 * @param {string} tenantId - The tenant ID
 * @param {string} collectionName - The Firestore collection name
 * @param {string} documentId - The document ID
 * @returns {Promise<number|null>} The schema version or null if document not found
 */
export async function getDocumentSchemaVersion(tenantId, collectionName, documentId) {
  try {
    const docRef = doc(db, 'tenants', tenantId, collectionName, documentId);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      return null;
    }
    
    const data = docSnap.data();
    return data.schemaVersion || 1; // Default to version 1 if not set
  } catch (error) {
    logError('migrationRunner', 'Failed to get document schema version', error);
    return null;
  }
}

/**
 * Check if a document needs migration
 * @param {string} tenantId - The tenant ID
 * @param {string} collectionName - The Firestore collection name
 * @param {string} documentId - The document ID
 * @param {number} targetVersion - The target schema version
 * @returns {Promise<boolean>} True if migration is needed
 */
export async function needsMigration(tenantId, collectionName, documentId, targetVersion) {
  const currentVersion = await getDocumentSchemaVersion(tenantId, collectionName, documentId);
  return currentVersion !== null && currentVersion < targetVersion;
}
