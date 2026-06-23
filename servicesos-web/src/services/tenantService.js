/**
 * Tenant management service
 * Handles multi-tenant setup, subscription management, and billing
 */

import { doc, getDoc, setDoc, updateDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { SUBSCRIPTION_TIERS } from '../lib/subscriptionConfig';

const TENANTS_COLLECTION = 'tenants';

/**
 * Create a new tenant (cleaning company)
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
    
    // Return the tenant with proper date handling for localStorage
    return {
      ...tenantDoc,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
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
    // Dev-safe diagnostics (DEV mode only)
    if (import.meta.env.DEV) {
      const maskedProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID?.substring(0, 4) + '...' + import.meta.env.VITE_FIREBASE_PROJECT_ID?.substring(import.meta.env.VITE_FIREBASE_PROJECT_ID.length - 4);
      console.log('[Tenant Service] DEV DIAGNOSTICS:', {
        maskedProjectId,
        tenantId,
        tenantPath: `${TENANTS_COLLECTION}/${tenantId}`,
        tenantIdType: typeof tenantId,
        tenantIdLength: tenantId?.length
      });
    }

    const tenantDoc = await getDoc(doc(db, TENANTS_COLLECTION, tenantId));
    
    if (!tenantDoc.exists()) {
      if (import.meta.env.DEV) {
        console.error('[Tenant Service] DEV DIAGNOSTICS: Document does not exist', {
          tenantId,
          tenantPath: `${TENANTS_COLLECTION}/${tenantId}`
        });
      }
      throw new Error('Tenant not found');
    }
    
    return { id: tenantDoc.id, ...tenantDoc.data() };
  } catch (error) {
    console.error('[Tenant Service] Error getting tenant:', error);
    if (import.meta.env.DEV) {
      console.error('[Tenant Service] DEV DIAGNOSTICS: Full error details', {
        message: error.message,
        code: error.code,
        name: error.name
      });
    }
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
    // Handle both string tier and object subscriptionData
    const tier = typeof subscriptionData === 'string' ? subscriptionData : subscriptionData.tier;
    
    const updateData = {
      subscriptionTier: tier || 'free',
      stripeSubscriptionId: subscriptionData.stripeSubscriptionId || null,
      stripeCustomerId: subscriptionData.stripeCustomerId || null,
      status: subscriptionData.status || 'active',
      updatedAt: serverTimestamp()
    };
    
    await updateDoc(doc(db, TENANTS_COLLECTION, tenantId), updateData);
    
    console.log(`[Tenant Service] Updated subscription for tenant ${tenantId} to ${tier}`);
    
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
    const { setDoc, doc } = await import('firebase/firestore');
    
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
    const tierConfig = SUBSCRIPTION_TIERS[tenant.subscriptionTier] || SUBSCRIPTION_TIERS.free;
    
    return {
      tier: tenant.subscriptionTier,
      tierName: tierConfig.name,
      monthlyPrice: tierConfig.monthlyPrice,
      transactionFee: tierConfig.transactionFee,
      features: tierConfig.features,
      limits: tierConfig.limits,
      stripeSubscriptionId: tenant.stripeSubscriptionId,
      stripeCustomerId: tenant.stripeCustomerId,
      status: tenant.status
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
    const subscription = await getTenantSubscription(tenantId);
    return subscription.features[feature] || false;
  } catch (error) {
    console.error('[Tenant Service] Error checking feature access:', error);
    return false;
  }
}
