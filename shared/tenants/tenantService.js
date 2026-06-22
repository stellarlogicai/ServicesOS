// src/shared/tenants/tenantService.js
/**
 * Tenant Management Service
 * Multi-tenant setup, subscription management, and billing
 * Reusable across all SaaS platforms
 */

import { doc, getDoc, setDoc, updateDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';

const TENANTS_COLLECTION = 'tenants';

/**
 * Create a new tenant
 */
export async function createTenant(tenantData) {
  try {
    const tenantId = tenantData.id || `tenant_${Date.now()}`;
    
    const tenantDoc = {
      id: tenantId,
      businessName: tenantData.businessName,
      businessEmail: tenantData.businessEmail,
      businessPhone: tenantData.businessPhone,
      businessAddress: tenantData.businessAddress || '',
      subscriptionTier: tenantData.subscriptionTier || 'free',
      stripeCustomerId: tenantData.stripeCustomerId || null,
      stripeSubscriptionId: tenantData.stripeSubscriptionId || null,
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      settings: {
        customBranding: tenantData.customBranding || {},
        bookingUrl: tenantData.bookingUrl || '',
        emailFrom: tenantData.emailFrom || '',
        businessLogo: tenantData.businessLogo || ''
      },
      limits: {
        users: tenantData.users || 1,
        locations: tenantData.locations || 1
      }
    };
    
    await setDoc(doc(db, TENANTS_COLLECTION, tenantId), tenantDoc);
    
    // Initialize usage tracking
    await initializeTenantUsage(tenantId);
    
    console.log(`[Tenant Service] Created tenant: ${tenantId}`);
    return tenantDoc;
  } catch (error) {
    console.error('[Tenant Service] Error creating tenant:', error);
    throw error;
  }
}

/**
 * Get tenant by ID
 */
export async function getTenant(tenantId) {
  try {
    const tenantDoc = await getDoc(doc(db, TENANTS_COLLECTION, tenantId));
    
    if (!tenantDoc.exists()) {
      throw new Error('Tenant not found');
    }
    
    return { id: tenantDoc.id, ...tenantDoc.data() };
  } catch (error) {
    console.error('[Tenant Service] Error getting tenant:', error);
    throw error;
  }
}

/**
 * Get tenant by business email
 */
export async function getTenantByEmail(email) {
  try {
    const q = query(collection(db, TENANTS_COLLECTION), where('businessEmail', '==', email));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return null;
    }
    
    const doc = querySnapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  } catch (error) {
    console.error('[Tenant Service] Error getting tenant by email:', error);
    throw error;
  }
}

/**
 * Update tenant subscription
 */
export async function updateTenantSubscription(tenantId, subscriptionData) {
  try {
    const updateData = {
      subscriptionTier: subscriptionData.tier,
      stripeSubscriptionId: subscriptionData.stripeSubscriptionId,
      stripeCustomerId: subscriptionData.stripeCustomerId,
      status: subscriptionData.status || 'active',
      updatedAt: serverTimestamp()
    };
    
    await updateDoc(doc(db, TENANTS_COLLECTION, tenantId), updateData);
    
    console.log(`[Tenant Service] Updated subscription for tenant ${tenantId} to ${subscriptionData.tier}`);
    
    return await getTenant(tenantId);
  } catch (error) {
    console.error('[Tenant Service] Error updating subscription:', error);
    throw error;
  }
}

/**
 * Cancel tenant subscription
 */
export async function cancelTenantSubscription(tenantId) {
  try {
    await updateDoc(doc(db, TENANTS_COLLECTION, tenantId), {
      subscriptionTier: 'free',
      stripeSubscriptionId: null,
      status: 'cancelled',
      cancelledAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    console.log(`[Tenant Service] Cancelled subscription for tenant ${tenantId}`);
    return await getTenant(tenantId);
  } catch (error) {
    console.error('[Tenant Service] Error cancelling subscription:', error);
    throw error;
  }
}

/**
 * Update tenant settings
 */
export async function updateTenantSettings(tenantId, settings) {
  try {
    await updateDoc(doc(db, TENANTS_COLLECTION, tenantId), {
      settings: settings,
      updatedAt: serverTimestamp()
    });
    
    console.log(`[Tenant Service] Updated settings for tenant ${tenantId}`);
    return await getTenant(tenantId);
  } catch (error) {
    console.error('[Tenant Service] Error updating settings:', error);
    throw error;
  }
}

/**
 * Initialize tenant usage tracking
 */
async function initializeTenantUsage(tenantId) {
  try {
    await setDoc(doc(db, 'tenant_usage', tenantId), {
      tenantId,
      currentMonth: new Date().toISOString().slice(0, 7),
      quotes: 0,
      payments: 0,
      sms: 0,
      aiAnalysis: 0,
      lastReset: serverTimestamp()
    });
    
    console.log(`[Tenant Service] Initialized usage tracking for tenant ${tenantId}`);
  } catch (error) {
    console.error('[Tenant Service] Error initializing usage tracking:', error);
  }
}

/**
 * Get tenant subscription info
 */
export async function getTenantSubscription(tenantId) {
  try {
    const tenant = await getTenant(tenantId);
    
    return {
      tier: tenant.subscriptionTier,
      stripeSubscriptionId: tenant.stripeSubscriptionId,
      stripeCustomerId: tenant.stripeCustomerId,
      status: tenant.status,
      settings: tenant.settings,
      limits: tenant.limits
    };
  } catch (error) {
    console.error('[Tenant Service] Error getting subscription info:', error);
    throw error;
  }
}

/**
 * Check if tenant has access to a feature
 */
export async function tenantHasFeature(tenantId, feature) {
  try {
    const tenant = await getTenant(tenantId);
    return tenant.settings?.features?.[feature] || false;
  } catch (error) {
    console.error('[Tenant Service] Error checking feature access:', error);
    return false;
  }
}
