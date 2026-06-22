// src/services/estimateConversionService.js
/**
 * Estimate Conversion Service
 * Tracks estimate conversion metrics including sent, viewed, accepted, rejected, and close rates
 */

import { getDocs, collection } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Get estimate conversion dashboard data
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>}
 */
export async function getEstimateConversionDashboard(tenantId) {
  // Get all leads/estimates
  const leadsRef = collection(db, 'tenants', tenantId, 'leads');
  const leadsSnap = await getDocs(leadsRef);
  
  const leads = leadsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  // Calculate conversion metrics
  let estimatesSent = 0;
  let estimatesViewed = 0;
  let estimatesAccepted = 0;
  let estimatesRejected = 0;
  let estimatesPending = 0;
  let totalEstimateAmount = 0;
  let acceptedAmount = 0;
  
  for (const lead of leads) {
    if (lead.estimateGenerated) {
      estimatesSent++;
      totalEstimateAmount += lead.estimatedPrice || lead.estimateAmount || 0;
      
      if (lead.estimateViewed) {
        estimatesViewed++;
      }
      
      if (lead.status === 'Scheduled' || lead.status === 'Completed' || lead.status === 'Paid') {
        estimatesAccepted++;
        acceptedAmount += lead.estimatedPrice || lead.estimateAmount || 0;
      } else if (lead.status === 'Rejected' || lead.status === 'Lost') {
        estimatesRejected++;
      } else if (lead.status === 'Estimate Sent' || lead.status === 'Follow Up' || lead.status === 'New Lead') {
        estimatesPending++;
      }
    }
  }
  
  const closeRate = estimatesSent > 0 ? (estimatesAccepted / estimatesSent * 100).toFixed(1) : 0;
  const viewRate = estimatesSent > 0 ? (estimatesViewed / estimatesSent * 100).toFixed(1) : 0;
  const rejectionRate = estimatesSent > 0 ? (estimatesRejected / estimatesSent * 100).toFixed(1) : 0;
  const averageEstimateAmount = estimatesSent > 0 ? (totalEstimateAmount / estimatesSent).toFixed(0) : 0;
  const averageAcceptedAmount = estimatesAccepted > 0 ? (acceptedAmount / estimatesAccepted).toFixed(0) : 0;
  
  return {
    estimatesSent,
    estimatesViewed,
    estimatesAccepted,
    estimatesRejected,
    estimatesPending,
    closeRate,
    viewRate,
    rejectionRate,
    totalEstimateAmount,
    acceptedAmount,
    averageEstimateAmount,
    averageAcceptedAmount
  };
}

/**
 * Get estimate conversion by time period
 * @param {string} tenantId - Tenant ID
 * @param {string} period - Period (day, week, month, year)
 * @returns {Promise<Array>}
 */
export async function getEstimateConversionByPeriod(tenantId, period = 'month') {
  const leadsRef = collection(db, 'tenants', tenantId, 'leads');
  const leadsSnap = await getDocs(leadsRef);
  
  const leads = leadsSnap.docs.map(doc => doc.data());
  
  // Group by period
  const periodData = {};
  
  for (const lead of leads) {
    const date = new Date(lead.createdAt);
    let periodKey;
    
    switch (period) {
      case 'day': {
        periodKey = date.toISOString().split('T')[0];
        break;
      }
      case 'week': {
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        periodKey = weekStart.toISOString().split('T')[0];
        break;
      }
      case 'month': {
        periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        break;
      }
      case 'year': {
        periodKey = String(date.getFullYear());
        break;
      }
      default:
        periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }
    
    if (!periodData[periodKey]) {
      periodData[periodKey] = {
        period: periodKey,
        sent: 0,
        viewed: 0,
        accepted: 0,
        rejected: 0,
        pending: 0,
        totalAmount: 0,
        acceptedAmount: 0
      };
    }
    
    if (lead.estimateGenerated) {
      periodData[periodKey].sent++;
      periodData[periodKey].totalAmount += lead.estimatedPrice || lead.estimateAmount || 0;
      
      if (lead.estimateViewed) {
        periodData[periodKey].viewed++;
      }
      
      if (lead.status === 'Scheduled' || lead.status === 'Completed' || lead.status === 'Paid') {
        periodData[periodKey].accepted++;
        periodData[periodKey].acceptedAmount += lead.estimatedPrice || lead.estimateAmount || 0;
      } else if (lead.status === 'Rejected' || lead.status === 'Lost') {
        periodData[periodKey].rejected++;
      } else {
        periodData[periodKey].pending++;
      }
    }
  }
  
  // Calculate rates
  const trends = Object.values(periodData).map(data => ({
    ...data,
    closeRate: data.sent > 0 ? (data.accepted / data.sent * 100).toFixed(1) : 0,
    viewRate: data.sent > 0 ? (data.viewed / data.sent * 100).toFixed(1) : 0
  }));
  
  // Sort by period
  trends.sort((a, b) => a.period.localeCompare(b.period));
  
  return trends;
}

/**
 * Get estimate conversion by service type
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>}
 */
export async function getEstimateConversionByService(tenantId) {
  const leadsRef = collection(db, 'tenants', tenantId, 'leads');
  const leadsSnap = await getDocs(leadsRef);
  
  const leads = leadsSnap.docs.map(doc => doc.data());
  
  // Group by service type
  const serviceData = {};
  
  for (const lead of leads) {
    const serviceType = lead.serviceType || lead.service || 'Unknown';
    
    if (!serviceData[serviceType]) {
      serviceData[serviceType] = {
        serviceType,
        sent: 0,
        viewed: 0,
        accepted: 0,
        rejected: 0,
        pending: 0,
        totalAmount: 0,
        acceptedAmount: 0
      };
    }
    
    if (lead.estimateGenerated) {
      serviceData[serviceType].sent++;
      serviceData[serviceType].totalAmount += lead.estimatedPrice || lead.estimateAmount || 0;
      
      if (lead.estimateViewed) {
        serviceData[serviceType].viewed++;
      }
      
      if (lead.status === 'Scheduled' || lead.status === 'Completed' || lead.status === 'Paid') {
        serviceData[serviceType].accepted++;
        serviceData[serviceType].acceptedAmount += lead.estimatedPrice || lead.estimateAmount || 0;
      } else if (lead.status === 'Rejected' || lead.status === 'Lost') {
        serviceData[serviceType].rejected++;
      } else {
        serviceData[serviceType].pending++;
      }
    }
  }
  
  // Calculate rates
  const byService = Object.values(serviceData).map(data => ({
    ...data,
    closeRate: data.sent > 0 ? (data.accepted / data.sent * 100).toFixed(1) : 0,
    viewRate: data.sent > 0 ? (data.viewed / data.sent * 100).toFixed(1) : 0,
    averageAmount: data.sent > 0 ? (data.totalAmount / data.sent).toFixed(0) : 0
  }));
  
  // Sort by close rate (highest first)
  byService.sort((a, b) => parseFloat(b.closeRate) - parseFloat(a.closeRate));
  
  return byService;
}

/**
 * Get estimate conversion by price range
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>}
 */
export async function getEstimateConversionByPriceRange(tenantId) {
  const leadsRef = collection(db, 'tenants', tenantId, 'leads');
  const leadsSnap = await getDocs(leadsRef);
  
  const leads = leadsSnap.docs.map(doc => doc.data());
  
  // Define price ranges
  const priceRanges = [
    { name: '$0-$100', min: 0, max: 100 },
    { name: '$100-$200', min: 100, max: 200 },
    { name: '$200-$300', min: 200, max: 300 },
    { name: '$300-$500', min: 300, max: 500 },
    { name: '$500+', min: 500, max: Infinity }
  ];
  
  const rangeData = {};
  
  for (const range of priceRanges) {
    rangeData[range.name] = {
      priceRange: range.name,
      sent: 0,
      viewed: 0,
      accepted: 0,
      rejected: 0,
      pending: 0,
      totalAmount: 0,
      acceptedAmount: 0
    };
  }
  
  for (const lead of leads) {
    if (lead.estimateGenerated) {
      const amount = lead.estimatedPrice || lead.estimateAmount || 0;
      
      for (const range of priceRanges) {
        if (amount >= range.min && amount < range.max) {
          rangeData[range.name].sent++;
          rangeData[range.name].totalAmount += amount;
          
          if (lead.estimateViewed) {
            rangeData[range.name].viewed++;
          }
          
          if (lead.status === 'Scheduled' || lead.status === 'Completed' || lead.status === 'Paid') {
            rangeData[range.name].accepted++;
            rangeData[range.name].acceptedAmount += amount;
          } else if (lead.status === 'Rejected' || lead.status === 'Lost') {
            rangeData[range.name].rejected++;
          } else {
            rangeData[range.name].pending++;
          }
          break;
        }
      }
    }
  }
  
  // Calculate rates
  const byPriceRange = Object.values(rangeData).map(data => ({
    ...data,
    closeRate: data.sent > 0 ? (data.accepted / data.sent * 100).toFixed(1) : 0,
    viewRate: data.sent > 0 ? (data.viewed / data.sent * 100).toFixed(1) : 0
  }));
  
  return byPriceRange;
}

/**
 * Get pending estimates requiring follow-up
 * @param {string} tenantId - Tenant ID
 * @param {number} daysOld - Days since estimate was sent
 * @returns {Promise<Array>}
 */
export async function getPendingEstimatesForFollowUp(tenantId, daysOld = 7) {
  const leadsRef = collection(db, 'tenants', tenantId, 'leads');
  const leadsSnap = await getDocs(leadsRef);
  
  const leads = leadsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  
  const pendingEstimates = leads.filter(lead => {
    if (!lead.estimateGenerated) return false;
    if (lead.status !== 'Estimate Sent' && lead.status !== 'Follow Up') return false;
    
    const createdAt = new Date(lead.createdAt);
    return createdAt < cutoffDate;
  });
  
  // Sort by age (oldest first)
  pendingEstimates.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  
  return pendingEstimates;
}

/**
 * Track estimate view
 * @param {string} tenantId - Tenant ID
 * @param {string} leadId - Lead ID
 * @returns {Promise<Object>}
 */
export async function trackEstimateView(tenantId, leadId) {
  // This would typically be called when a customer views an estimate
  // For now, this is a placeholder for the implementation
  return { success: true, leadId };
}
