// src/services/referralService.js
/**
 * Referral Tracking Service
 * Handles customer referrals, credit awards, and referral program management
 */

import { collection, doc, addDoc, updateDoc, getDoc, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase';

// Referral status constants
export const REFERRAL_STATUS = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

/**
 * Create a referral
 * @param {string} tenantId - Tenant ID
 * @param {object} referralData - Referral data
 * @returns {Promise<DocumentReference>}
 */
export async function createReferral(tenantId, referralData) {
  const referralsRef = collection(db, 'tenants', tenantId, 'referrals');
  
  const data = {
    referrerCustomerId: referralData.referrerCustomerId,
    referrerName: referralData.referrerName || '',
    referrerEmail: referralData.referrerEmail || '',
    
    // Referred person
    referredName: referralData.referredName || '',
    referredEmail: referralData.referredEmail || '',
    referredPhone: referralData.referredPhone || '',
    
    // Referral code
    referralCode: referralData.referralCode || generateReferralCode(),
    
    // Credit amount
    creditAmount: referralData.creditAmount || 50,
    
    // Status
    status: REFERRAL_STATUS.PENDING,
    
    // Related booking
    bookingId: referralData.bookingId || null,
    
    // Timestamps
    createdAt: new Date().toISOString(),
    completedAt: null,
    updatedAt: new Date().toISOString()
  };
  
  return await addDoc(referralsRef, data);
}

/**
 * Update referral status
 * @param {string} tenantId - Tenant ID
 * @param {string} referralId - Referral ID
 * @param {string} status - New status
 * @returns {Promise<void>}
 */
export async function updateReferralStatus(tenantId, referralId, status) {
  const referralRef = doc(db, 'tenants', tenantId, 'referrals', referralId);
  const updates = {
    status,
    updatedAt: new Date().toISOString()
  };
  
  if (status === REFERRAL_STATUS.COMPLETED) {
    updates.completedAt = new Date().toISOString();
  }
  
  await updateDoc(referralRef, updates);
}

/**
 * Award credit to referrer
 * @param {string} tenantId - Tenant ID
 * @param {string} referralId - Referral ID
 * @returns {Promise<void>}
 */
export async function awardReferralCredit(tenantId, referralId) {
  const referralRef = doc(db, 'tenants', tenantId, 'referrals', referralId);
  const referralSnap = await getDoc(referralRef);
  
  if (!referralSnap.exists()) {
    throw new Error('Referral not found');
  }
  
  const referral = referralSnap.data();
  
  if (referral.status === REFERRAL_STATUS.COMPLETED) {
    throw new Error('Referral already completed');
  }
  
  // Update referral status
  await updateDoc(referralRef, {
    status: REFERRAL_STATUS.COMPLETED,
    completedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  
  // Add credit to referrer's customer record
  if (referral.referrerCustomerId) {
    const customerRef = doc(db, 'tenants', tenantId, 'customers', referral.referrerCustomerId);
    const customerSnap = await getDoc(customerRef);
    
    if (customerSnap.exists()) {
      const customer = customerSnap.data();
      const currentCredit = customer.referralCredit || 0;
      
      await updateDoc(customerRef, {
        referralCredit: currentCredit + referral.creditAmount,
        updatedAt: new Date().toISOString()
      });
    }
  }
}

/**
 * Get referral by ID
 * @param {string} tenantId - Tenant ID
 * @param {string} referralId - Referral ID
 * @returns {Promise<Object|null>}
 */
export async function getReferral(tenantId, referralId) {
  const referralRef = doc(db, 'tenants', tenantId, 'referrals', referralId);
  const referralSnap = await getDoc(referralRef);
  
  if (!referralSnap.exists()) {
    return null;
  }
  
  return { id: referralSnap.id, ...referralSnap.data() };
}

/**
 * Get referrals for a tenant
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>}
 */
export async function getReferrals(tenantId) {
  const referralsRef = collection(db, 'tenants', tenantId, 'referrals');
  const q = query(referralsRef, orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get referrals for a customer (referrer)
 * @param {string} tenantId - Tenant ID
 * @param {string} customerId - Customer ID
 * @returns {Promise<Array>}
 */
export async function getCustomerReferrals(tenantId, customerId) {
  const referralsRef = collection(db, 'tenants', tenantId, 'referrals');
  const q = query(
    referralsRef,
    where('referrerCustomerId', '==', customerId),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get referral by code
 * @param {string} tenantId - Tenant ID
 * @param {string} referralCode - Referral code
 * @returns {Promise<Object|null>}
 */
export async function getReferralByCode(tenantId, referralCode) {
  const referralsRef = collection(db, 'tenants', tenantId, 'referrals');
  const q = query(referralsRef, where('referralCode', '==', referralCode));
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) {
    return null;
  }
  
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
}

/**
 * Get referral analytics
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>}
 */
export async function getReferralAnalytics(tenantId) {
  const referrals = await getReferrals(tenantId);
  
  let totalReferrals = referrals.length;
  let completedReferrals = 0;
  let pendingReferrals = 0;
  let cancelledReferrals = 0;
  let totalCreditAwarded = 0;
  
  for (const referral of referrals) {
    if (referral.status === REFERRAL_STATUS.COMPLETED) {
      completedReferrals++;
      totalCreditAwarded += referral.creditAmount || 0;
    } else if (referral.status === REFERRAL_STATUS.PENDING) {
      pendingReferrals++;
    } else if (referral.status === REFERRAL_STATUS.CANCELLED) {
      cancelledReferrals++;
    }
  }
  
  const conversionRate = totalReferrals > 0 ? (completedReferrals / totalReferrals) * 100 : 0;
  
  return {
    totalReferrals,
    completedReferrals,
    pendingReferrals,
    cancelledReferrals,
    totalCreditAwarded,
    conversionRate: Math.round(conversionRate * 10) / 10,
    averageCredit: completedReferrals > 0 ? totalCreditAwarded / completedReferrals : 0
  };
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
 * Get customer's referral credit balance
 * @param {string} tenantId - Tenant ID
 * @param {string} customerId - Customer ID
 * @returns {Promise<number>}
 */
export async function getCustomerReferralCredit(tenantId, customerId) {
  const customerRef = doc(db, 'tenants', tenantId, 'customers', customerId);
  const customerSnap = await getDoc(customerRef);
  
  if (!customerSnap.exists()) {
    return 0;
  }
  
  const customer = customerSnap.data();
  return customer.referralCredit || 0;
}

/**
 * Use referral credit
 * @param {string} tenantId - Tenant ID
 * @param {string} customerId - Customer ID
 * @param {number} amount - Amount to use
 * @returns {Promise<number>} Remaining credit
 */
export async function useReferralCredit(tenantId, customerId, amount) {
  const customerRef = doc(db, 'tenants', tenantId, 'customers', customerId);
  const customerSnap = await getDoc(customerRef);
  
  if (!customerSnap.exists()) {
    throw new Error('Customer not found');
  }
  
  const customer = customerSnap.data();
  const currentCredit = customer.referralCredit || 0;
  
  if (currentCredit < amount) {
    throw new Error('Insufficient referral credit');
  }
  
  const newCredit = currentCredit - amount;
  
  await updateDoc(customerRef, {
    referralCredit: newCredit,
    updatedAt: new Date().toISOString()
  });
  
  return newCredit;
}

/**
 * Get top referrers
 * @param {string} tenantId - Tenant ID
 * @param {number} limit - Maximum number of referrers to return
 * @returns {Promise<Array>}
 */
export async function getTopReferrers(tenantId, limit = 10) {
  const referrals = await getReferrals(tenantId);
  const referrerStats = {};
  
  for (const referral of referrals) {
    if (!referral.referrerCustomerId) continue;
    
    if (!referrerStats[referral.referrerCustomerId]) {
      referrerStats[referral.referrerCustomerId] = {
        customerId: referral.referrerCustomerId,
        name: referral.referrerName,
        email: referral.referrerEmail,
        totalReferrals: 0,
        completedReferrals: 0,
        totalCredit: 0
      };
    }
    
    referrerStats[referral.referrerCustomerId].totalReferrals++;
    
    if (referral.status === REFERRAL_STATUS.COMPLETED) {
      referrerStats[referral.referrerCustomerId].completedReferrals++;
      referrerStats[referral.referrerCustomerId].totalCredit += referral.creditAmount || 0;
    }
  }
  
  const topReferrers = Object.values(referrerStats);
  topReferrers.sort((a, b) => b.completedReferrals - a.completedReferrals);
  
  return topReferrers.slice(0, limit);
}

/**
 * Export referrals as CSV
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<string>} CSV content
 */
export async function exportReferralsCSV(tenantId) {
  const referrals = await getReferrals(tenantId);
  
  let csv = 'Date,Referrer Name,Referrer Email,Referred Name,Referred Email,Referral Code,Credit Amount,Status,Completed At\n';
  
  for (const referral of referrals) {
    csv += `"${referral.createdAt}","${referral.referrerName}","${referral.referrerEmail}","${referral.referredName}","${referral.referredEmail}","${referral.referralCode}",${referral.creditAmount},"${referral.status}","${referral.completedAt || ''}"\n`;
  }
  
  return csv;
}
