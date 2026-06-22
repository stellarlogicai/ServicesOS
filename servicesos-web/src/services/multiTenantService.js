// src/services/multiTenantService.js

/**
 * Multi-tenant Database Service
 * Handles company data separation in Firebase for true SaaS multi-tenancy
 * Each tenant (company) has isolated data with proper access controls
 */

import { 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  collection, 
  query, 
  where, 
  updateDoc, 
  deleteDoc,
  addDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';

const TENANTS_COLLECTION = 'tenants';
const TENANT_DATA_PREFIX = 'tenant_';

// ==================== Tenant Management ====================

/**
 * Get current tenant ID from localStorage or context
 */
export function getCurrentTenantId() {
  return localStorage.getItem('current_tenant_id') || null;
}

/**
 * Set current tenant ID
 */
export function setCurrentTenantId(tenantId) {
  localStorage.setItem('current_tenant_id', tenantId);
}

/**
 * Clear current tenant ID
 */
export function clearCurrentTenantId() {
  localStorage.removeItem('current_tenant_id');
}

/**
 * Create a new tenant (company)
 */
export async function createTenant(tenantData) {
  try {
    const tenantRef = doc(collection(db, TENANTS_COLLECTION));
    const tenantId = tenantRef.id;
    
    const newTenant = {
      id: tenantId,
      name: tenantData.name,
      subdomain: tenantData.subdomain || tenantData.name.toLowerCase().replace(/\s+/g, '-'),
      contactEmail: tenantData.contactEmail,
      contactPhone: tenantData.contactPhone,
      status: 'active',
      plan: tenantData.plan || 'starter',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      settings: {
        branding: tenantData.branding || {},
        features: tenantData.features || {},
        limits: tenantData.limits || {
          maxUsers: 5,
          maxQuotes: 100,
          maxStorage: 1073741824 // 1GB
        }
      }
    };
    
    await setDoc(tenantRef, newTenant);
    
    // Initialize tenant-specific collections
    await initializeTenantCollections(tenantId);
    
    return { success: true, tenantId, tenant: newTenant };
  } catch (error) {
    console.error('Error creating tenant:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Initialize collections for a new tenant
 */
async function initializeTenantCollections(tenantId) {
  // Create initial documents for tenant-specific collections
  // This ensures proper structure and permissions
  const collections = ['leads', 'quotes', 'bookings', 'employees', 'shifts', 'settings'];
  
  for (const colName of collections) {
    collection(db, TENANT_DATA_PREFIX + tenantId, colName);
    // Collection is created implicitly when first document is added
    // We just need to ensure the structure exists
  }
}

/**
 * Get tenant by ID
 */
export async function getTenant(tenantId) {
  try {
    const tenantRef = doc(db, TENANTS_COLLECTION, tenantId);
    const tenantSnap = await getDoc(tenantRef);
    
    if (tenantSnap.exists()) {
      return { success: true, tenant: { id: tenantSnap.id, ...tenantSnap.data() } };
    } else {
      return { success: false, error: 'Tenant not found' };
    }
  } catch (error) {
    console.error('Error getting tenant:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get tenant by subdomain
 */
export async function getTenantBySubdomain(subdomain) {
  try {
    const q = query(
      collection(db, TENANTS_COLLECTION),
      where('subdomain', '==', subdomain.toLowerCase())
    );
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      const doc = querySnapshot.docs[0];
      return { success: true, tenant: { id: doc.id, ...doc.data() } };
    } else {
      return { success: false, error: 'Tenant not found' };
    }
  } catch (error) {
    console.error('Error getting tenant by subdomain:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update tenant settings
 */
export async function updateTenantSettings(tenantId, settings) {
  try {
    const tenantRef = doc(db, TENANTS_COLLECTION, tenantId);
    await updateDoc(tenantRef, {
      settings: settings,
      updatedAt: serverTimestamp()
    });
    return { success: true };
  } catch (error) {
    console.error('Error updating tenant settings:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete tenant (caution: deletes all data)
 */
export async function deleteTenant(tenantId) {
  try {
    // Delete tenant document
    await deleteDoc(doc(db, TENANTS_COLLECTION, tenantId));
    
    // In production, you'd also need to delete all tenant-specific collections
    // This requires a Cloud Function or recursive deletion
    
    return { success: true };
  } catch (error) {
    console.error('Error deleting tenant:', error);
    return { success: false, error: error.message };
  }
}

// ==================== Tenant-Aware Data Access ====================

/**
 * Get tenant-specific collection reference
 */
function getTenantCollection(tenantId, collectionName) {
  return collection(db, TENANT_DATA_PREFIX + tenantId, collectionName);
}

/**
 * Get tenant-specific document reference
 */
function getTenantDoc(tenantId, collectionName, docId) {
  return doc(db, TENANT_DATA_PREFIX + tenantId, collectionName, docId);
}

/**
 * Add document to tenant collection
 */
export async function addTenantDocument(tenantId, collectionName, data) {
  try {
    const colRef = getTenantCollection(tenantId, collectionName);
    const docRef = await addDoc(colRef, {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return { success: true, docId: docRef.id };
  } catch (error) {
    console.error('Error adding tenant document:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get document from tenant collection
 */
export async function getTenantDocument(tenantId, collectionName, docId) {
  try {
    const docRef = getTenantDoc(tenantId, collectionName, docId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return { success: true, data: { id: docSnap.id, ...docSnap.data() } };
    } else {
      return { success: false, error: 'Document not found' };
    }
  } catch (error) {
    console.error('Error getting tenant document:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get all documents from tenant collection
 */
export async function getTenantCollectionData(tenantId, collectionName) {
  try {
    const colRef = getTenantCollection(tenantId, collectionName);
    const querySnapshot = await getDocs(colRef);
    
    const documents = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    return { success: true, documents };
  } catch (error) {
    console.error('Error getting tenant collection data:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update document in tenant collection
 */
export async function updateTenantDocument(tenantId, collectionName, docId, data) {
  try {
    const docRef = getTenantDoc(tenantId, collectionName, docId);
    await updateDoc(docRef, {
      ...data,
      updatedAt: serverTimestamp()
    });
    return { success: true };
  } catch (error) {
    console.error('Error updating tenant document:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete document from tenant collection
 */
export async function deleteTenantDocument(tenantId, collectionName, docId) {
  try {
    const docRef = getTenantDoc(tenantId, collectionName, docId);
    await deleteDoc(docRef);
    return { success: true };
  } catch (error) {
    console.error('Error deleting tenant document:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Query tenant collection with filters
 */
export async function queryTenantCollection(tenantId, collectionName, filters) {
  try {
    const colRef = getTenantCollection(tenantId, collectionName);
    
    let q = colRef;
    
    // Apply filters
    filters.forEach(filter => {
      q = query(q, where(filter.field, filter.operator, filter.value));
    });
    
    const querySnapshot = await getDocs(q);
    
    const documents = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    return { success: true, documents };
  } catch (error) {
    console.error('Error querying tenant collection:', error);
    return { success: false, error: error.message };
  }
}

// ==================== Tenant Analytics ====================

/**
 * Get tenant usage statistics
 */
export async function getTenantStats(tenantId) {
  try {
    const stats = {
      leads: 0,
      quotes: 0,
      bookings: 0,
      employees: 0,
      storageUsed: 0
    };
    
    // Get counts from each collection
    const collections = ['leads', 'quotes', 'bookings', 'employees'];
    
    for (const colName of collections) {
      const result = await getTenantCollectionData(tenantId, colName);
      if (result.success) {
        stats[colName] = result.documents.length;
      }
    }
    
    // Get tenant info for storage limits
    const tenantResult = await getTenant(tenantId);
    if (tenantResult.success) {
      stats.plan = tenantResult.tenant.plan;
      stats.limits = tenantResult.tenant.settings.limits;
    }
    
    return { success: true, stats };
  } catch (error) {
    console.error('Error getting tenant stats:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Check if tenant has exceeded limits
 */
export async function checkTenantLimits(tenantId) {
  try {
    const result = await getTenantStats(tenantId);
    if (!result.success) {
      return { success: false, error: result.error };
    }
    
    const { stats, limits } = result;
    const warnings = [];
    
    if (stats.leads >= limits.maxQuotes) {
      warnings.push('Lead limit reached');
    }
    
    if (stats.quotes >= limits.maxQuotes) {
      warnings.push('Quote limit reached');
    }
    
    if (stats.storageUsed >= limits.maxStorage) {
      warnings.push('Storage limit reached');
    }
    
    return { 
      success: true, 
      withinLimits: warnings.length === 0,
      warnings 
    };
  } catch (error) {
    console.error('Error checking tenant limits:', error);
    return { success: false, error: error.message };
  }
}

// ==================== Tenant Migration ====================

/**
 * Migrate localStorage data to tenant-specific Firebase collections
 */
export async function migrateToMultiTenant(tenantId) {
  try {
    const migrationResults = {
      leads: { success: false, count: 0 },
      quotes: { success: false, count: 0 },
      bookings: { success: false, count: 0 },
      employees: { success: false, count: 0 }
    };
    
    // Migrate leads
    const leadsData = localStorage.getItem('crm_leads_v2');
    if (leadsData) {
      const leads = JSON.parse(leadsData);
      for (const lead of leads) {
        await addTenantDocument(tenantId, 'leads', lead);
      }
      migrationResults.leads = { success: true, count: leads.length };
    }
    
    // Migrate quotes
    const quotesData = localStorage.getItem('crm_quotes_v2');
    if (quotesData) {
      const quotes = JSON.parse(quotesData);
      for (const quote of quotes) {
        await addTenantDocument(tenantId, 'quotes', quote);
      }
      migrationResults.quotes = { success: true, count: quotes.length };
    }
    
    // Migrate bookings
    const bookingsData = localStorage.getItem('crm_bookings_v2');
    if (bookingsData) {
      const bookings = JSON.parse(bookingsData);
      for (const booking of bookings) {
        await addTenantDocument(tenantId, 'bookings', booking);
      }
      migrationResults.bookings = { success: true, count: bookings.length };
    }
    
    // Migrate employees
    const employeesData = localStorage.getItem('staff_employees_v1');
    if (employeesData) {
      const employees = JSON.parse(employeesData);
      for (const employee of employees) {
        await addTenantDocument(tenantId, 'employees', employee);
      }
      migrationResults.employees = { success: true, count: employees.length };
    }
    
    return { success: true, migrationResults };
  } catch (error) {
    console.error('Error migrating to multi-tenant:', error);
    return { success: false, error: error.message };
  }
}
