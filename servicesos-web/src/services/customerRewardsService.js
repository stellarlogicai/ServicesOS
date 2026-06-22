// src/services/customerRewardsService.js
/**
 * Customer Rewards Service
 * Manages points system and referral credits
 */

import { collection, addDoc, doc, setDoc, query, where, getDocs, updateDoc, increment } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Add points to a customer's account
 * @param {string} tenantId - Tenant ID
 * @param {string} customerId - Customer ID
 * @param {number} points - Points to add
 * @param {string} reason - Reason for points
 * @returns {Promise<void>}
 */
export async function addCustomerPoints(tenantId, customerId, points, reason) {
  const rewardsRef = doc(db, 'tenants', tenantId, 'customer_rewards', customerId);
  
  await setDoc(rewardsRef, {
    customerId,
    points: increment(points),
    updatedAt: new Date().toISOString()
  }, { merge: true });
  
  // Log points transaction
  const transactionsRef = collection(db, 'tenants', tenantId, 'reward_transactions');
  await addDoc(transactionsRef, {
    customerId,
    points,
    reason,
    type: 'earned',
    createdAt: new Date().toISOString()
  });
}

/**
 * Redeem points from a customer's account
 * @param {string} tenantId - Tenant ID
 * @param {string} customerId - Customer ID
 * @param {number} points - Points to redeem
 * @param {string} reason - Reason for redemption
 * @returns {Promise<boolean>} Success status
 */
export async function redeemCustomerPoints(tenantId, customerId, points, reason) {
  const rewardsRef = doc(db, 'tenants', tenantId, 'customer_rewards', customerId);
  const rewardsSnap = await getDocs(query(collection(db, 'tenants', tenantId, 'customer_rewards'), where('customerId', '==', customerId)));
  
  if (rewardsSnap.empty) {
    return false;
  }
  
  const currentPoints = rewardsSnap.docs[0].data().points || 0;
  
  if (currentPoints < points) {
    return false;
  }
  
  await updateDoc(rewardsRef, {
    points: increment(-points),
    updatedAt: new Date().toISOString()
  });
  
  // Log points transaction
  const transactionsRef = collection(db, 'tenants', tenantId, 'reward_transactions');
  await addDoc(transactionsRef, {
    customerId,
    points,
    reason,
    type: 'redeemed',
    createdAt: new Date().toISOString()
  });
  
  return true;
}

/**
 * Get customer points balance
 * @param {string} tenantId - Tenant ID
 * @param {string} customerId - Customer ID
 * @returns {Promise<number>} Points balance
 */
export async function getCustomerPoints(tenantId, customerId) {
  const rewardsRef = collection(db, 'tenants', tenantId, 'customer_rewards');
  const q = query(rewardsRef, where('customerId', '==', customerId));
  const querySnap = await getDocs(q);
  
  if (querySnap.empty) {
    return 0;
  }
  
  return querySnap.docs[0].data().points || 0;
}

/**
 * Get customer reward transactions
 * @param {string} tenantId - Tenant ID
 * @param {string} customerId - Customer ID
 * @returns {Promise<Array>} Reward transactions
 */
export async function getCustomerRewardTransactions(tenantId, customerId) {
  const transactionsRef = collection(db, 'tenants', tenantId, 'reward_transactions');
  const q = query(transactionsRef, where('customerId', '==', customerId));
  const querySnap = await getDocs(q);
  
  return querySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Create a referral for a customer
 * @param {string} tenantId - Tenant ID
 * @param {string} referrerId - Referrer customer ID
 * @param {string} referredEmail - Referred customer email
 * @returns {Promise<string>} Referral ID
 */
export async function createReferral(tenantId, referrerId, referredEmail) {
  const referralsRef = collection(db, 'tenants', tenantId, 'referrals');
  const docRef = await addDoc(referralsRef, {
    referrerId,
    referredEmail,
    status: 'pending',
    referralCode: generateReferralCode(),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
  });
  
  return docRef.id;
}

/**
 * Generate a unique referral code
 * @returns {string} Referral code
 */
function generateReferralCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Complete a referral (when referred customer books first job)
 * @param {string} tenantId - Tenant ID
 * @param {string} referralId - Referral ID
 * @param {string} referredCustomerId - Referred customer ID
 * @returns {Promise<void>}
 */
export async function completeReferral(tenantId, referralId, referredCustomerId) {
  const referralRef = doc(db, 'tenants', tenantId, 'referrals', referralId);
  const referralSnap = await getDocs(query(collection(db, 'tenants', tenantId, 'referrals'), where('__name__', '==', referralId)));
  
  if (referralSnap.empty) {
    return;
  }
  
  const referralData = referralSnap.docs[0].data();
  
  // Update referral status
  await setDoc(referralRef, {
    status: 'completed',
    referredCustomerId,
    completedAt: new Date().toISOString()
  }, { merge: true });
  
  // Award points to referrer
  await addCustomerPoints(tenantId, referralData.referrerId, 500, 'Referral completed');
  
  // Award points to referred customer
  await addCustomerPoints(tenantId, referredCustomerId, 200, 'Referral bonus');
}

/**
 * Get referrals for a customer
 * @param {string} tenantId - Tenant ID
 * @param {string} customerId - Customer ID
 * @returns {Promise<Array>} Referrals
 */
export async function getCustomerReferrals(tenantId, customerId) {
  const referralsRef = collection(db, 'tenants', tenantId, 'referrals');
  const q = query(referralsRef, where('referrerId', '==', customerId));
  const querySnap = await getDocs(q);
  
  return querySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get referral by code
 * @param {string} tenantId - Tenant ID
 * @param {string} referralCode - Referral code
 * @returns {Promise<Object>} Referral data
 */
export async function getReferralByCode(tenantId, referralCode) {
  const referralsRef = collection(db, 'tenants', tenantId, 'referrals');
  const q = query(referralsRef, where('referralCode', '==', referralCode));
  const querySnap = await getDocs(q);
  
  if (querySnap.empty) {
    return null;
  }
  
  const doc = querySnap.docs[0];
  return { id: doc.id, ...doc.data() };
}

/**
 * Get available rewards for a customer
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>} Available rewards
 */
export async function getAvailableRewards(tenantId) {
  const rewardsConfigRef = collection(db, 'tenants', tenantId, 'rewards_config');
  const querySnap = await getDocs(rewardsConfigRef);
  
  if (querySnap.empty) {
    // Return default rewards
    return [
      { id: '1', name: '$10 Off', points: 500, type: 'discount', value: 10 },
      { id: '2', name: '$25 Off', points: 1000, type: 'discount', value: 25 },
      { id: '3', name: '$50 Off', points: 2000, type: 'discount', value: 50 },
      { id: '4', name: 'Free Cleaning', points: 5000, type: 'service', value: 0 }
    ];
  }
  
  return querySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Redeem a reward
 * @param {string} tenantId - Tenant ID
 * @param {string} customerId - Customer ID
 * @param {string} rewardId - Reward ID
 * @returns {Promise<boolean>} Success status
 */
export async function redeemReward(tenantId, customerId, rewardId) {
  const rewards = await getAvailableRewards(tenantId);
  const reward = rewards.find(r => r.id === rewardId);
  
  if (!reward) {
    return false;
  }
  
  const success = await redeemCustomerPoints(tenantId, customerId, reward.points, `Redeemed reward: ${reward.name}`);
  
  if (success) {
    // Log reward redemption
    const redemptionsRef = collection(db, 'tenants', tenantId, 'reward_redemptions');
    await addDoc(redemptionsRef, {
      customerId,
      rewardId,
      rewardName: reward.name,
      points: reward.points,
      createdAt: new Date().toISOString()
    });
  }
  
  return success;
}

/**
 * Get customer reward redemptions
 * @param {string} tenantId - Tenant ID
 * @param {string} customerId - Customer ID
 * @returns {Promise<Array>} Reward redemptions
 */
export async function getCustomerRewardRedemptions(tenantId, customerId) {
  const redemptionsRef = collection(db, 'tenants', tenantId, 'reward_redemptions');
  const q = query(redemptionsRef, where('customerId', '==', customerId));
  const querySnap = await getDocs(q);
  
  return querySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get rewards leaderboard for a tenant
 * @param {string} tenantId - Tenant ID
 * @param {number} limit - Number of customers to return
 * @returns {Promise<Array>} Leaderboard data
 */
export async function getRewardsLeaderboard(tenantId, limit = 10) {
  const rewardsRef = collection(db, 'tenants', tenantId, 'customer_rewards');
  const querySnap = await getDocs(rewardsRef);
  
  const customers = querySnap.docs.map(doc => doc.data());
  
  // Sort by points descending
  customers.sort((a, b) => (b.points || 0) - (a.points || 0));
  
  // Get customer names
  const customersRef = collection(db, 'tenants', tenantId, 'customers');
  const customersSnap = await getDocs(customersRef);
  const customersMap = {};
  customersSnap.docs.forEach(doc => {
    customersMap[doc.id] = doc.data();
  });
  
  // Combine data
  const leaderboard = customers.slice(0, limit).map((reward, index) => {
    const customer = customersMap[reward.customerId] || {};
    return {
      rank: index + 1,
      customerId: reward.customerId,
      name: customer.name || 'Unknown',
      points: reward.points || 0
    };
  });
  
  return leaderboard;
}

/**
 * Calculate points for a completed job
 * @param {number} jobAmount - Job amount in dollars
 * @returns {number} Points earned
 */
export function calculatePointsForJob(jobAmount) {
  // 1 point per dollar spent
  return Math.round(jobAmount);
}

/**
 * Award points for a completed job
 * @param {string} tenantId - Tenant ID
 * @param {string} customerId - Customer ID
 * @param {number} jobAmount - Job amount
 * @returns {Promise<void>}
 */
export async function awardPointsForJob(tenantId, customerId, jobAmount) {
  const points = calculatePointsForJob(jobAmount);
  await addCustomerPoints(tenantId, customerId, points, 'Job completed');
}

/**
 * Get points value in dollars
 * @param {number} points - Points to convert
 * @returns {number} Dollar value
 */
export function pointsToDollars(points) {
  // 100 points = $1
  return points / 100;
}

/**
 * Get dollar value in points
 * @param {number} dollars - Dollars to convert
 * @returns {number} Points value
 */
export function dollarsToPoints(dollars) {
  // $1 = 100 points
  return Math.round(dollars * 100);
}
