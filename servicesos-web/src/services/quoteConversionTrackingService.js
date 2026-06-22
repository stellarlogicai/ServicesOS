// src/services/quoteConversionTrackingService.js
/**
 * Quote Conversion Tracking Service
 * Tracks quote conversion with view status (sent, viewed, accepted, rejected with conversion percentages)
 */

import { getDocs, collection } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Get quote conversion tracking
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>}
 */
export async function getQuoteConversionTracking(tenantId) {
  // Get all leads/quotes
  const leadsRef = collection(db, 'tenants', tenantId, 'leads');
  const leadsSnap = await getDocs(leadsRef);
  
  const leads = leadsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  // Calculate conversion metrics with view tracking
  let quotesSent = 0;
  let quotesViewed = 0;
  let quotesAccepted = 0;
  let quotesRejected = 0;
  let quotesPending = 0;
  
  for (const lead of leads) {
    if (!lead.estimateGenerated) continue;
    
    quotesSent++;
    
    if (lead.estimateViewed) {
      quotesViewed++;
    }
    
    if (lead.status === 'Completed' || lead.status === 'Paid') {
      quotesAccepted++;
    } else if (lead.status === 'Rejected') {
      quotesRejected++;
    } else if (lead.status === 'Estimate Sent' || lead.status === 'Follow Up') {
      quotesPending++;
    }
  }
  
  // Calculate percentages
  const viewRate = quotesSent > 0 ? (quotesViewed / quotesSent * 100).toFixed(1) : 0;
  const acceptRate = quotesSent > 0 ? (quotesAccepted / quotesSent * 100).toFixed(1) : 0;
  const rejectRate = quotesSent > 0 ? (quotesRejected / quotesSent * 100).toFixed(1) : 0;
  const pendingRate = quotesSent > 0 ? (quotesPending / quotesSent * 100).toFixed(1) : 0;
  const viewToAcceptRate = quotesViewed > 0 ? (quotesAccepted / quotesViewed * 100).toFixed(1) : 0;
  
  return {
    quotesSent,
    quotesViewed,
    quotesAccepted,
    quotesRejected,
    quotesPending,
    viewRate,
    acceptRate,
    rejectRate,
    pendingRate,
    viewToAcceptRate
  };
}

/**
 * Get quote conversion by time period
 * @param {string} tenantId - Tenant ID
 * @param {number} days - Number of days to analyze
 * @returns {Promise<Array>}
 */
export async function getQuoteConversionByPeriod(tenantId, days = 30) {
  const leadsRef = collection(db, 'tenants', tenantId, 'leads');
  const leadsSnap = await getDocs(leadsRef);
  
  const leads = leadsSnap.docs.map(doc => doc.data());
  
  // Filter by date range
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  const recentLeads = leads.filter(lead => {
    const leadDate = new Date(lead.createdAt);
    return leadDate >= cutoffDate;
  });
  
  // Group by day
  const dailyData = {};
  
  for (const lead of recentLeads) {
    if (!lead.estimateGenerated) continue;
    
    const date = new Date(lead.createdAt).toISOString().split('T')[0];
    
    if (!dailyData[date]) {
      dailyData[date] = {
        date,
        sent: 0,
        viewed: 0,
        accepted: 0,
        rejected: 0,
        pending: 0
      };
    }
    
    dailyData[date].sent++;
    
    if (lead.estimateViewed) {
      dailyData[date].viewed++;
    }
    
    if (lead.status === 'Completed' || lead.status === 'Paid') {
      dailyData[date].accepted++;
    } else if (lead.status === 'Rejected') {
      dailyData[date].rejected++;
    } else if (lead.status === 'Estimate Sent' || lead.status === 'Follow Up') {
      dailyData[date].pending++;
    }
  }
  
  // Calculate conversion rates per day
  const trends = Object.values(dailyData).map(data => ({
    ...data,
    viewRate: data.sent > 0 ? (data.viewed / data.sent * 100).toFixed(1) : 0,
    acceptRate: data.sent > 0 ? (data.accepted / data.sent * 100).toFixed(1) : 0
  }));
  
  // Sort by date
  trends.sort((a, b) => a.date.localeCompare(b.date));
  
  return trends;
}

/**
 * Get pending quotes requiring follow-up
 * @param {string} tenantId - Tenant ID
 * @param {number} daysOld - Days since quote was sent
 * @returns {Promise<Array>}
 */
export async function getPendingQuotesForFollowUp(tenantId, daysOld = 7) {
  const leadsRef = collection(db, 'tenants', tenantId, 'leads');
  const leadsSnap = await getDocs(leadsRef);
  
  const leads = leadsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  
  const pendingQuotes = leads.filter(lead => {
    if (!lead.estimateGenerated) return false;
    if (lead.status !== 'Estimate Sent' && lead.status !== 'Follow Up') return false;
    
    const createdAt = new Date(lead.createdAt);
    return createdAt < cutoffDate;
  });
  
  // Sort by age (oldest first)
  pendingQuotes.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  
  return pendingQuotes.map(lead => ({
    leadId: lead.id,
    customerName: lead.customerName,
    estimateAmount: lead.estimatedPrice,
    createdAt: lead.createdAt,
    daysSinceSent: Math.floor((new Date() - new Date(lead.createdAt)) / (1000 * 60 * 60 * 24)),
    estimateViewed: lead.estimateViewed || false
  }));
}

/**
 * Track quote view
 * @param {string} tenantId - Tenant ID
 * @param {string} leadId - Lead ID
 * @returns {Promise<void>}
 */
export async function trackQuoteView(tenantId, leadId) {
  // This would update the lead document to mark the estimate as viewed
  // For now, this is a placeholder - actual implementation would use updateDoc
  console.log(`Tracking quote view for lead ${leadId} in tenant ${tenantId}`);
}

/**
 * Get quote conversion summary
 * @param {string} tenantId - Tenant ID
 * @param {number} days - Number of days to analyze
 * @returns {Promise<Object>}
 */
export async function getQuoteConversionSummary(tenantId, days = 30) {
  const tracking = await getQuoteConversionTracking(tenantId);
  const trends = await getQuoteConversionByPeriod(tenantId, days);
  const pending = await getPendingQuotesForFollowUp(tenantId);
  
  // Calculate average from trends
  const avgViewRate = trends.length > 0 
    ? (trends.reduce((sum, t) => sum + parseFloat(t.viewRate), 0) / trends.length).toFixed(1)
    : 0;
  
  const avgAcceptRate = trends.length > 0
    ? (trends.reduce((sum, t) => sum + parseFloat(t.acceptRate), 0) / trends.length).toFixed(1)
    : 0;
  
  return {
    ...tracking,
    avgViewRate,
    avgAcceptRate,
    pendingQuotesCount: pending.length,
    recentTrends: trends.slice(-7) // Last 7 days
  };
}
