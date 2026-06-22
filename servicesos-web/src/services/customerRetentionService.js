// src/services/customerRetentionService.js
/**
 * Customer Retention Service
 * Tracks customer retention metrics, identifies at-risk customers, and manages win-back campaigns
 */

import { doc, getDoc, getDocs, collection, query, where, orderBy, addDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Get customers at risk by days since last service
 * @param {string} tenantId - Tenant ID
 * @param {number} days - Days threshold
 * @returns {Promise<Array>}
 */
export async function getCustomersAtRisk(tenantId, days = 90) {
  const customersRef = collection(db, 'tenants', tenantId, 'customers');
  const customersSnap = await getDocs(customersRef);
  
  const atRiskCustomers = [];
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  for (const customerDoc of customersSnap.docs) {
    const customerId = customerDoc.id;
    const customerData = customerDoc.data();
    
    // Get customer's jobs to find last service date
    const jobsRef = collection(db, 'tenants', tenantId, 'jobs');
    const jobsQ = query(jobsRef, where('customerId', '==', customerId), orderBy('date', 'desc'));
    const jobsSnap = await getDocs(jobsQ);
    
    if (jobsSnap.empty) {
      continue;
    }
    
    const lastJob = jobsSnap.docs[0].data();
    const lastServiceDate = new Date(lastJob.date);
    
    if (lastServiceDate < cutoffDate) {
      const daysSinceLastService = Math.floor((new Date() - lastServiceDate) / (1000 * 60 * 60 * 24));
      
      atRiskCustomers.push({
        customerId,
        customerName: customerData.name || customerData.customerName,
        customerEmail: customerData.email || customerData.customerEmail,
        customerPhone: customerData.phone || customerData.customerPhone,
        lastServiceDate: lastJob.date,
        daysSinceLastService,
        totalJobs: jobsSnap.size,
        lastJobAmount: lastJob.finalPrice || lastJob.estimatedPrice
      });
    }
  }
  
  // Sort by days since last service (most at risk first)
  atRiskCustomers.sort((a, b) => b.daysSinceLastService - a.daysSinceLastService);
  
  return atRiskCustomers;
}

/**
 * Get retention dashboard data
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>}
 */
export async function getRetentionDashboard(tenantId) {
  const customers30Days = await getCustomersAtRisk(tenantId, 30);
  const customers60Days = await getCustomersAtRisk(tenantId, 60);
  const customers90Days = await getCustomersAtRisk(tenantId, 90);
  
  // Get total customer count
  const customersRef = collection(db, 'tenants', tenantId, 'customers');
  const customersSnap = await getDocs(customersRef);
  const totalCustomers = customersSnap.size;
  
  return {
    totalCustomers,
    atRisk30Days: customers30Days.length,
    atRisk60Days: customers60Days.length,
    atRisk90Days: customers90Days.length,
    customers30Days,
    customers60Days,
    customers90Days,
    retentionRate: totalCustomers > 0 ? ((totalCustomers - customers90Days.length) / totalCustomers * 100).toFixed(1) : 0
  };
}

/**
 * Create win-back campaign
 * @param {string} tenantId - Tenant ID
 * @param {object} campaignData - Campaign data
 * @returns {Promise<Object>}
 */
export async function createWinBackCampaign(tenantId, campaignData) {
  const campaignsRef = collection(db, 'tenants', tenantId, 'win_back_campaigns');
  
  const data = {
    name: campaignData.name,
    description: campaignData.description,
    daysThreshold: campaignData.daysThreshold || 90,
    emailTemplate: campaignData.emailTemplate,
    smsTemplate: campaignData.smsTemplate,
    discountOffer: campaignData.discountOffer,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  const campaignDoc = await addDoc(campaignsRef, data);
  
  return { success: true, campaignId: campaignDoc.id };
}

/**
 * Send win-back campaign to customers
 * @param {string} tenantId - Tenant ID
 * @param {string} campaignId - Campaign ID
 * @returns {Promise<Object>}
 */
export async function sendWinBackCampaign(tenantId, campaignId) {
  const campaignRef = doc(db, 'tenants', tenantId, 'win_back_campaigns', campaignId);
  const campaignSnap = await getDoc(campaignRef);
  
  if (!campaignSnap.exists()) {
    throw new Error('Campaign not found');
  }
  
  const campaign = campaignSnap.data();
  
  // Get at-risk customers based on campaign threshold
  const atRiskCustomers = await getCustomersAtRisk(tenantId, campaign.daysThreshold);
  
  // Create campaign records for each customer
  const recordsRef = collection(db, 'tenants', tenantId, 'win_back_records');
  const sentCount = atRiskCustomers.length;
  
  for (const customer of atRiskCustomers) {
    await addDoc(recordsRef, {
      campaignId,
      customerId: customer.customerId,
      customerName: customer.customerName,
      customerEmail: customer.customerEmail,
      customerPhone: customer.customerPhone,
      emailSent: !!campaign.emailTemplate,
      smsSent: !!campaign.smsTemplate,
      sentAt: new Date().toISOString(),
      status: 'sent',
      responded: false,
      rebooked: false
    });
  }
  
  // Update campaign with sent count
  await updateDoc(campaignRef, {
    lastSentAt: new Date().toISOString(),
    totalSent: sentCount
  });
  
  return { success: true, sentCount };
}

/**
 * Track win-back response
 * @param {string} tenantId - Tenant ID
 * @param {string} recordId - Record ID
 * @param {string} responseType - Response type (email_click, sms_reply, rebook)
 * @returns {Promise<Object>}
 */
export async function trackWinBackResponse(tenantId, recordId, responseType) {
  const recordRef = doc(db, 'tenants', tenantId, 'win_back_records', recordId);
  const recordSnap = await getDoc(recordRef);
  
  if (!recordSnap.exists()) {
    throw new Error('Record not found');
  }
  
  const updateData = {
    responded: true,
    respondedAt: new Date().toISOString(),
    responseType
  };
  
  if (responseType === 'rebook') {
    updateData.rebooked = true;
    updateData.rebookedAt = new Date().toISOString();
  }
  
  await updateDoc(recordRef, updateData);
  
  return { success: true };
}

/**
 * Get campaign analytics
 * @param {string} tenantId - Tenant ID
 * @param {string} campaignId - Campaign ID
 * @returns {Promise<Object>}
 */
export async function getCampaignAnalytics(tenantId, campaignId) {
  const recordsRef = collection(db, 'tenants', tenantId, 'win_back_records');
  const recordsQ = query(recordsRef, where('campaignId', '==', campaignId));
  const recordsSnap = await getDocs(recordsQ);
  
  const records = recordsSnap.docs.map(doc => doc.data());
  
  const totalSent = records.length;
  const responded = records.filter(r => r.responded).length;
  const rebooked = records.filter(r => r.rebooked).length;
  
  return {
    campaignId,
    totalSent,
    responded,
    rebooked,
    responseRate: totalSent > 0 ? (responded / totalSent * 100).toFixed(1) : 0,
    rebookRate: totalSent > 0 ? (rebooked / totalSent * 100).toFixed(1) : 0
  };
}

/**
 * Get customer retention score
 * @param {string} tenantId - Tenant ID
 * @param {string} customerId - Customer ID
 * @returns {Promise<Object>}
 */
export async function getCustomerRetentionScore(tenantId, customerId) {
  // Get customer's jobs
  const jobsRef = collection(db, 'tenants', tenantId, 'jobs');
  const jobsQ = query(jobsRef, where('customerId', '==', customerId), orderBy('date', 'desc'));
  const jobsSnap = await getDocs(jobsQ);
  
  const jobs = jobsSnap.docs.map(doc => doc.data());
  
  if (jobs.length === 0) {
    return { customerId, score: 0, factors: {} };
  }
  
  // Calculate retention score based on multiple factors
  let score = 100;
  const factors = {};
  
  // Factor 1: Days since last service (max 30 points)
  const lastServiceDate = new Date(jobs[0].date);
  const daysSinceLastService = (new Date() - lastServiceDate) / (1000 * 60 * 60 * 24);
  const daysScore = Math.max(0, 30 - (daysSinceLastService / 7));
  score += daysScore;
  factors.daysSinceLastService = daysSinceLastService;
  factors.daysScore = daysScore;
  
  // Factor 2: Total jobs (max 20 points)
  const jobsScore = Math.min(20, jobs.length * 2);
  score += jobsScore;
  factors.totalJobs = jobs.length;
  factors.jobsScore = jobsScore;
  
  // Factor 3: Job frequency (max 20 points)
  if (jobs.length > 1) {
    const firstServiceDate = new Date(jobs[jobs.length - 1].date);
    const daysBetween = (lastServiceDate - firstServiceDate) / (1000 * 60 * 60 * 24);
    const frequency = jobs.length / (daysBetween / 30); // jobs per month
    const frequencyScore = Math.min(20, frequency * 10);
    score += frequencyScore;
    factors.frequency = frequency;
    factors.frequencyScore = frequencyScore;
  }
  
  // Factor 4: Average rating (max 30 points)
  const completionsRef = collection(db, 'tenants', tenantId, 'job_completions');
  const completionsQ = query(completionsRef, where('customerId', '==', customerId));
  const completionsSnap = await getDocs(completionsQ);
  
  if (!completionsSnap.empty) {
    const ratings = completionsSnap.docs
      .map(doc => doc.data().rating)
      .filter(r => r !== undefined);
    
    if (ratings.length > 0) {
      const avgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
      const ratingScore = (avgRating / 5) * 30;
      score += ratingScore;
      factors.avgRating = avgRating;
      factors.ratingScore = ratingScore;
    }
  }
  
  // Normalize score to 0-100
  score = Math.min(100, Math.max(0, score));
  
  return {
    customerId,
    score: Math.round(score),
    factors
  };
}

/**
 * Get all customers retention scores
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>}
 */
export async function getAllCustomersRetentionScores(tenantId) {
  const customersRef = collection(db, 'tenants', tenantId, 'customers');
  const customersSnap = await getDocs(customersRef);
  
  const scores = [];
  
  for (const customerDoc of customersSnap.docs) {
    const customerId = customerDoc.id;
    const scoreData = await getCustomerRetentionScore(tenantId, customerId);
    scores.push({
      customerId,
      customerName: customerDoc.data().name || customerDoc.data().customerName,
      ...scoreData
    });
  }
  
  // Sort by score (highest first)
  scores.sort((a, b) => b.score - a.score);
  
  return scores;
}
