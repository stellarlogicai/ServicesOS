// src/shared/credits/aiUsageEngineService.js

/**
 * AI Usage Engine Service
 * Manages AI credit system for controlling AI costs across all platforms
 * Reusable across multiple SaaS products (Cleaning, FPS Coach, Anti-Cheat, Card Shop, etc.)
 */

import { doc, getDoc, setDoc, updateDoc, increment, collection, addDoc, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';

const AI_USAGE_COLLECTION = 'ai_usage';
const AI_CREDIT_HISTORY_COLLECTION = 'ai_credit_history';

// Credit costs per operation (configurable per platform)
const CREDIT_COSTS = {
  // Cleaning platform
  photo_analysis: 1,
  estimate_generation: 5,
  room_detection: 2,
  property_condition: 3,
  pricing_suggestion: 2,
  damage_detection: 4,
  quality_control: 3,
  checklist_generation: 2,
  contract_generation: 3,
  message_drafting: 1,
  
  // Card Shop platform (future)
  card_identification: 2,
  collection_analysis: 5,
  grading_estimation: 3,
  market_value_lookup: 1,
  
  // FPS Coach platform (future)
  match_analysis: 10,
  gameplay_review: 5,
  coaching_report: 8,
  
  // Anti-Cheat platform (future)
  server_review: 0.05,
  vision_review: 2,
  replay_analysis: 3
};

// Subscription tier included credits
const TIER_CREDITS = {
  free: 10,
  basic: 50,
  pro: 100,
  enterprise: 500
};

/**
 * Get or create AI usage record for tenant
 */
export async function getTenantAIUsage(tenantId) {
  try {
    const usageRef = doc(db, AI_USAGE_COLLECTION, tenantId);
    const usageDoc = await getDoc(usageRef);
    
    if (usageDoc.exists()) {
      return usageDoc.data();
    } else {
      // Create new usage record
      const newUsage = {
        tenantId,
        monthlyIncludedCredits: TIER_CREDITS.free, // Default to free tier
        purchasedCredits: 0,
        totalCreditsUsed: 0,
        creditsRemaining: TIER_CREDITS.free,
        lastResetDate: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await setDoc(usageRef, newUsage);
      return newUsage;
    }
  } catch (error) {
    console.error('Error getting tenant AI usage:', error);
    throw error;
  }
}

/**
 * Deduct credits for AI operation
 */
export async function deductCredits(tenantId, amount, operationType, metadata = {}) {
  try {
    const usageRef = doc(db, AI_USAGE_COLLECTION, tenantId);
    const usageDoc = await getDoc(usageRef);
    
    if (!usageDoc.exists()) {
      throw new Error('Tenant AI usage record not found');
    }
    
    const usage = usageDoc.data();
    
    // Check if enough credits
    if (usage.creditsRemaining < amount) {
      return {
        success: false,
        error: 'INSUFFICIENT_CREDITS',
        creditsRemaining: usage.creditsRemaining,
        creditsRequired: amount
      };
    }
    
    // Deduct credits
    await updateDoc(usageRef, {
      creditsRemaining: increment(-amount),
      totalCreditsUsed: increment(amount),
      updatedAt: new Date().toISOString()
    });
    
    // Record transaction in history
    await addDoc(collection(db, AI_CREDIT_HISTORY_COLLECTION), {
      tenantId,
      operationType,
      creditsDeducted: amount,
      creditsRemaining: usage.creditsRemaining - amount,
      timestamp: new Date().toISOString(),
      metadata
    });
    
    return {
      success: true,
      creditsRemaining: usage.creditsRemaining - amount,
      creditsDeducted: amount
    };
  } catch (error) {
    console.error('Error deducting credits:', error);
    throw error;
  }
}

/**
 * Purchase credits for tenant
 */
export async function purchaseCredits(tenantId, amount, paymentMethod, paymentDetails = {}) {
  try {
    const usageRef = doc(db, AI_USAGE_COLLECTION, tenantId);
    const usageDoc = await getDoc(usageRef);
    
    if (!usageDoc.exists()) {
      throw new Error('Tenant AI usage record not found');
    }
    
    const usage = usageDoc.data();
    
    // Add purchased credits
    await updateDoc(usageRef, {
      purchasedCredits: increment(amount),
      creditsRemaining: increment(amount),
      updatedAt: new Date().toISOString()
    });
    
    // Record purchase in history
    await addDoc(collection(db, AI_CREDIT_HISTORY_COLLECTION), {
      tenantId,
      operationType: 'credit_purchase',
      creditsAdded: amount,
      creditsRemaining: usage.creditsRemaining + amount,
      timestamp: new Date().toISOString(),
      paymentMethod,
      paymentDetails
    });
    
    return {
      success: true,
      creditsRemaining: usage.creditsRemaining + amount,
      creditsAdded: amount
    };
  } catch (error) {
    console.error('Error purchasing credits:', error);
    throw error;
  }
}

/**
 * Get remaining credits for tenant
 */
export async function getRemainingCredits(tenantId) {
  try {
    const usage = await getTenantAIUsage(tenantId);
    return {
      creditsRemaining: usage.creditsRemaining,
      monthlyIncludedCredits: usage.monthlyIncludedCredits,
      purchasedCredits: usage.purchasedCredits,
      totalCreditsUsed: usage.totalCreditsUsed
    };
  } catch (error) {
    console.error('Error getting remaining credits:', error);
    throw error;
  }
}

/**
 * Track model cost for analytics
 */
export async function trackModelCost(tenantId, model, tokensIn, tokensOut, actualCost) {
  try {
    await addDoc(collection(db, AI_CREDIT_HISTORY_COLLECTION), {
      tenantId,
      operationType: 'model_cost_tracking',
      model,
      tokensIn,
      tokensOut,
      actualCost,
      timestamp: new Date().toISOString()
    });
    
    return { success: true };
  } catch (error) {
    console.error('Error tracking model cost:', error);
    throw error;
  }
}

/**
 * Update tenant's subscription tier (affects included credits)
 */
export async function updateSubscriptionTier(tenantId, tier) {
  try {
    const usageRef = doc(db, AI_USAGE_COLLECTION, tenantId);
    const usageDoc = await getDoc(usageRef);
    
    if (!usageDoc.exists()) {
      throw new Error('Tenant AI usage record not found');
    }
    
    const usage = usageDoc.data();
    const newIncludedCredits = TIER_CREDITS[tier] || TIER_CREDITS.free;
    const creditDifference = newIncludedCredits - usage.monthlyIncludedCredits;
    
    await updateDoc(usageRef, {
      monthlyIncludedCredits: newIncludedCredits,
      creditsRemaining: increment(creditDifference),
      lastResetDate: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    
    return {
      success: true,
      previousTier: usage.monthlyIncludedCredits,
      newTier: newIncludedCredits,
      creditDifference
    };
  } catch (error) {
    console.error('Error updating subscription tier:', error);
    throw error;
  }
}

/**
 * Reset monthly credits (called at start of billing cycle)
 */
export async function resetMonthlyCredits(tenantId) {
  try {
    const usageRef = doc(db, AI_USAGE_COLLECTION, tenantId);
    const usageDoc = await getDoc(usageRef);
    
    if (!usageDoc.exists()) {
      throw new Error('Tenant AI usage record not found');
    }
    
    const usage = usageDoc.data();
    
    // Reset to monthly included credits + keep purchased credits
    await updateDoc(usageRef, {
      creditsRemaining: usage.monthlyIncludedCredits + usage.purchasedCredits,
      lastResetDate: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    
    return {
      success: true,
      creditsRemaining: usage.monthlyIncludedCredits + usage.purchasedCredits
    };
  } catch (error) {
    console.error('Error resetting monthly credits:', error);
    throw error;
  }
}

/**
 * Get credit usage history for tenant
 */
export async function getCreditHistory(tenantId, limit = 50) {
  try {
    const historyRef = collection(db, AI_CREDIT_HISTORY_COLLECTION);
    const q = query(
      historyRef,
      where('tenantId', '==', tenantId),
      orderBy('timestamp', 'desc'),
      limit(limit)
    );
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => doc.data());
  } catch (error) {
    console.error('Error getting credit history:', error);
    throw error;
  }
}

/**
 * Get credit cost for operation type
 */
export function getCreditCost(operationType) {
  return CREDIT_COSTS[operationType] || 1; // Default to 1 credit if unknown
}

/**
 * Get all credit costs (for pricing display)
 */
export function getAllCreditCosts() {
  return CREDIT_COSTS;
}

/**
 * Get tier information
 */
export function getTierCredits() {
  return TIER_CREDITS;
}

/**
 * Check if tenant has enough credits before operation
 */
export async function checkCredits(tenantId, amount) {
  try {
    const usage = await getTenantAIUsage(tenantId);
    return {
      hasEnough: usage.creditsRemaining >= amount,
      creditsRemaining: usage.creditsRemaining,
      creditsRequired: amount
    };
  } catch (error) {
    console.error('Error checking credits:', error);
    throw error;
  }
}
