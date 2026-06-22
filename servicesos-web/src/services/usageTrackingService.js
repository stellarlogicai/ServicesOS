/**
 * Usage tracking service
 * Tracks usage across quotes, payments, SMS, AI analysis for subscription billing
 */

import { doc, getDoc, updateDoc, increment, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

const USAGE_COLLECTION = 'tenant_usage';

/**
 * Get current usage for a tenant
 */
export async function getTenantUsage(tenantId) {
  try {
    const usageDoc = await getDoc(doc(db, USAGE_COLLECTION, tenantId));
    
    if (!usageDoc.exists()) {
      // Initialize usage document
      return {
        tenantId,
        currentMonth: new Date().toISOString().slice(0, 7), // YYYY-MM
        quotes: 0,
        payments: 0,
        sms: 0,
        aiAnalysis: 0,
        lastReset: serverTimestamp()
      };
    }
    
    const data = usageDoc.data();
    const currentMonth = new Date().toISOString().slice(0, 7);
    
    // Reset counters if new month
    if (data.currentMonth !== currentMonth) {
      await updateDoc(doc(db, USAGE_COLLECTION, tenantId), {
        currentMonth,
        quotes: 0,
        payments: 0,
        sms: 0,
        aiAnalysis: 0,
        lastReset: serverTimestamp()
      });
      
      return {
        tenantId,
        currentMonth,
        quotes: 0,
        payments: 0,
        sms: 0,
        aiAnalysis: 0,
        lastReset: serverTimestamp()
      };
    }
    
    return data;
  } catch (error) {
    console.error('[Usage Tracking] Error getting tenant usage:', error);
    throw error;
  }
}

/**
 * Track quote generation
 */
export async function trackQuoteUsage(tenantId) {
  try {
    const usageRef = doc(db, USAGE_COLLECTION, tenantId);
    const currentMonth = new Date().toISOString().slice(0, 7);
    
    await updateDoc(usageRef, {
      currentMonth,
      quotes: increment(1),
      lastUpdated: serverTimestamp()
    });
    
    console.log(`[Usage Tracking] Quote tracked for tenant ${tenantId}`);
  } catch (error) {
    console.error('[Usage Tracking] Error tracking quote:', error);
    // Don't throw - usage tracking shouldn't block the main flow
  }
}

/**
 * Track payment processing
 */
export async function trackPaymentUsage(tenantId, amount) {
  try {
    const usageRef = doc(db, USAGE_COLLECTION, tenantId);
    const currentMonth = new Date().toISOString().slice(0, 7);
    
    await updateDoc(usageRef, {
      currentMonth,
      payments: increment(1),
      totalPaymentVolume: increment(amount),
      lastUpdated: serverTimestamp()
    });
    
    console.log(`[Usage Tracking] Payment tracked for tenant ${tenantId}: $${amount}`);
  } catch (error) {
    console.error('[Usage Tracking] Error tracking payment:', error);
  }
}

/**
 * Track SMS sent
 */
export async function trackSMSUsage(tenantId) {
  try {
    const usageRef = doc(db, USAGE_COLLECTION, tenantId);
    const currentMonth = new Date().toISOString().slice(0, 7);
    
    await updateDoc(usageRef, {
      currentMonth,
      sms: increment(1),
      lastUpdated: serverTimestamp()
    });
    
    console.log(`[Usage Tracking] SMS tracked for tenant ${tenantId}`);
  } catch (error) {
    console.error('[Usage Tracking] Error tracking SMS:', error);
  }
}

/**
 * Track AI analysis
 */
export async function trackAIAnalysisUsage(tenantId) {
  try {
    const usageRef = doc(db, USAGE_COLLECTION, tenantId);
    const currentMonth = new Date().toISOString().slice(0, 7);
    
    await updateDoc(usageRef, {
      currentMonth,
      aiAnalysis: increment(1),
      lastUpdated: serverTimestamp()
    });
    
    console.log(`[Usage Tracking] AI analysis tracked for tenant ${tenantId}`);
  } catch (error) {
    console.error('[Usage Tracking] Error tracking AI analysis:', error);
  }
}

/**
 * Check if tenant can perform action based on subscription limits
 */
export async function canPerformAction(tenantId, subscriptionTier, actionType) {
  try {
    const { isWithinLimit } = await import('../lib/subscriptionConfig');
    const usage = await getTenantUsage(tenantId);
    
    // Map action types to usage fields
    const actionMapping = {
      quote: 'quotesPerMonth',
      payment: 'paymentsPerMonth',
      sms: 'smsPerMonth',
      aiAnalysis: 'aiAnalysisPerMonth'
    };
    
    const limitField = actionMapping[actionType];
    if (!limitField) return true; // No limit for this action
    
    const usageField = actionType === 'aiAnalysis' ? 'aiAnalysis' : actionType;
    const currentUsage = usage[usageField] || 0;
    
    return isWithinLimit(subscriptionTier, limitField, currentUsage);
  } catch (error) {
    console.error('[Usage Tracking] Error checking action limits:', error);
    return false; // Fail safe - deny if error
  }
}

/**
 * Get usage summary for billing
 */
export async function getUsageSummary(tenantId, month) {
  try {
    const usageDoc = await getDoc(doc(db, USAGE_COLLECTION, tenantId));
    
    if (!usageDoc.exists()) {
      return null;
    }
    
    const data = usageDoc.data();
    
    // If requesting specific month, filter accordingly
    if (month && data.currentMonth !== month) {
      // In production, you'd store historical data
      return null;
    }
    
    return {
      tenantId,
      month: data.currentMonth,
      quotes: data.quotes || 0,
      payments: data.payments || 0,
      sms: data.sms || 0,
      aiAnalysis: data.aiAnalysis || 0,
      totalPaymentVolume: data.totalPaymentVolume || 0,
      lastUpdated: data.lastUpdated
    };
  } catch (error) {
    console.error('[Usage Tracking] Error getting usage summary:', error);
    throw error;
  }
}
