// src/services/featureUsageService.js
/**
 * Feature Usage Analytics Service
 * Tracks AI estimates, contracts signed, payments, photos
 */

import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Get feature usage for a tenant
 * @param {string} tenantId - Tenant ID
 * @param {number} month - Month (0-11)
 * @param {number} year - Year
 * @returns {Promise<Object>}
 */
export async function getFeatureUsage(tenantId, month, year) {
  const aiEstimates = await getAIEstimateUsage(tenantId, month, year);
  const contractsSigned = await getContractUsage(tenantId, month, year);
  const paymentsProcessed = await getPaymentUsage(tenantId, month, year);
  const photosUploaded = await getPhotoUsage(tenantId, month, year);
  const recurringServices = await getRecurringServiceUsage(tenantId, month, year);
  const upsellsOffered = await getUpsellUsage(tenantId, month, year);
  
  return {
    tenantId,
    month,
    year,
    aiEstimates,
    contractsSigned,
    paymentsProcessed,
    photosUploaded,
    recurringServices,
    upsellsOffered
  };
}

/**
 * Get AI estimate usage
 * @param {string} tenantId - Tenant ID
 * @param {number} month - Month (0-11)
 * @param {number} year - Year
 * @returns {Promise<Object>}
 */
async function getAIEstimateUsage(tenantId, month, year) {
  const leadsRef = collection(db, 'tenants', tenantId, 'leads');
  const snapshot = await getDocs(leadsRef);
  
  let total = 0;
  let withPhotos = 0;
  let accepted = 0;
  
  for (const doc of snapshot.docs) {
    const lead = doc.data();
    if (lead.createdAt) {
      const leadDate = new Date(lead.createdAt);
      if (leadDate.getMonth() === month && leadDate.getFullYear() === year) {
        total++;
        if (lead.photoUrls && lead.photoUrls.length > 0) {
          withPhotos++;
        }
        if (lead.status === 'scheduled' || lead.status === 'completed' || lead.status === 'paid') {
          accepted++;
        }
      }
    }
  }
  
  return {
    total,
    withPhotos,
    accepted,
    acceptanceRate: total > 0 ? (accepted / total) * 100 : 0
  };
}

/**
 * Get contract usage
 * @param {string} tenantId - Tenant ID
 * @param {number} month - Month (0-11)
 * @param {number} year - Year
 * @returns {Promise<Object>}
 */
async function getContractUsage(tenantId, month, year) {
  const contractsRef = collection(db, 'tenants', tenantId, 'contracts');
  const snapshot = await getDocs(contractsRef);
  
  let total = 0;
  let signed = 0;
  
  for (const doc of snapshot.docs) {
    const contract = doc.data();
    if (contract.createdAt) {
      const contractDate = new Date(contract.createdAt);
      if (contractDate.getMonth() === month && contractDate.getFullYear() === year) {
        total++;
        if (contract.signature) {
          signed++;
        }
      }
    }
  }
  
  return {
    total,
    signed,
    signingRate: total > 0 ? (signed / total) * 100 : 0
  };
}

/**
 * Get payment usage
 * @param {string} tenantId - Tenant ID
 * @param {number} month - Month (0-11)
 * @param {number} year - Year
 * @returns {Promise<Object>}
 */
async function getPaymentUsage(tenantId, month, year) {
  const paymentsRef = collection(db, 'tenants', tenantId, 'payments');
  const snapshot = await getDocs(paymentsRef);
  
  let total = 0;
  let completed = 0;
  let totalAmount = 0;
  let depositPayments = 0;
  let balancePayments = 0;
  
  for (const doc of snapshot.docs) {
    const payment = doc.data();
    if (payment.createdAt) {
      const paymentDate = new Date(payment.createdAt);
      if (paymentDate.getMonth() === month && paymentDate.getFullYear() === year) {
        total++;
        if (payment.status === 'completed') {
          completed++;
          totalAmount += payment.amount || 0;
          
          if (payment.type === 'deposit') {
            depositPayments++;
          } else if (payment.type === 'balance') {
            balancePayments++;
          }
        }
      }
    }
  }
  
  return {
    total,
    completed,
    successRate: total > 0 ? (completed / total) * 100 : 0,
    totalAmount,
    depositPayments,
    balancePayments,
    averageAmount: completed > 0 ? totalAmount / completed : 0
  };
}

/**
 * Get photo usage
 * @param {string} tenantId - Tenant ID
 * @param {number} month - Month (0-11)
 * @param {number} year - Year
 * @returns {Promise<Object>}
 */
async function getPhotoUsage(tenantId, month, year) {
  const leadsRef = collection(db, 'tenants', tenantId, 'leads');
  const bookingsRef = collection(db, 'tenants', tenantId, 'bookings');
  
  const [leadsSnapshot, bookingsSnapshot] = await Promise.all([
    getDocs(leadsRef),
    getDocs(bookingsRef)
  ]);
  
  let totalPhotos = 0;
  let beforePhotos = 0;
  let afterPhotos = 0;
  
  // Count photos from leads (estimate photos)
  for (const doc of leadsSnapshot.docs) {
    const lead = doc.data();
    if (lead.createdAt && lead.photoUrls) {
      const leadDate = new Date(lead.createdAt);
      if (leadDate.getMonth() === month && leadDate.getFullYear() === year) {
        totalPhotos += lead.photoUrls.length;
      }
    }
  }
  
  // Count photos from bookings (before/after photos)
  for (const doc of bookingsSnapshot.docs) {
    const booking = doc.data();
    if (booking.date) {
      const bookingDate = new Date(booking.date);
      if (bookingDate.getMonth() === month && bookingDate.getFullYear() === year) {
        if (booking.beforePhotoUrls) {
          beforePhotos += booking.beforePhotoUrls.length;
          totalPhotos += booking.beforePhotoUrls.length;
        }
        if (booking.afterPhotoUrls) {
          afterPhotos += booking.afterPhotoUrls.length;
          totalPhotos += booking.afterPhotoUrls.length;
        }
      }
    }
  }
  
  return {
    totalPhotos,
    beforePhotos,
    afterPhotos
  };
}

/**
 * Get recurring service usage
 * @param {string} tenantId - Tenant ID
 * @param {number} month - Month (0-11)
 * @param {number} year - Year
 * @returns {Promise<Object>}
 */
async function getRecurringServiceUsage(tenantId, month, year) {
  const recurringRef = collection(db, 'tenants', tenantId, 'recurring_services');
  const snapshot = await getDocs(recurringRef);
  
  let total = 0;
  let active = 0;
  let jobsGenerated = 0;
  
  for (const doc of snapshot.docs) {
    const recurring = doc.data();
    if (recurring.createdAt) {
      const recurringDate = new Date(recurring.createdAt);
      if (recurringDate.getMonth() === month && recurringDate.getFullYear() === year) {
        total++;
        if (recurring.status === 'active') {
          active++;
        }
      }
    }
    
    // Count jobs generated from recurring services
    if (recurring.generatedJobs && Array.isArray(recurring.generatedJobs)) {
      // eslint-disable-next-line no-unused-vars
      for (const jobId of recurring.generatedJobs) {
        // Would need to check job date, simplified for now
        jobsGenerated++;
      }
    }
  }
  
  return {
    total,
    active,
    jobsGenerated
  };
}

/**
 * Get upsell usage
 * @param {string} tenantId - Tenant ID
 * @param {number} month - Month (0-11)
 * @param {number} year - Year
 * @returns {Promise<Object>}
 */
async function getUpsellUsage(tenantId, month, year) {
  const upsellsRef = collection(db, 'tenants', tenantId, 'upsells');
  const snapshot = await getDocs(upsellsRef);
  
  let total = 0;
  let accepted = 0;
  let totalRevenue = 0;
  
  for (const doc of snapshot.docs) {
    const upsell = doc.data();
    if (upsell.createdAt) {
      const upsellDate = new Date(upsell.createdAt);
      if (upsellDate.getMonth() === month && upsellDate.getFullYear() === year) {
        total++;
        if (upsell.status === 'accepted') {
          accepted++;
          totalRevenue += upsell.amount || 0;
        }
      }
    }
  }
  
  return {
    total,
    accepted,
    acceptanceRate: total > 0 ? (accepted / total) * 100 : 0,
    totalRevenue
  };
}

/**
 * Get feature usage trends over time
 * @param {string} tenantId - Tenant ID
 * @param {number} months - Number of months to look back
 * @returns {Promise<Array>}
 */
export async function getFeatureUsageTrends(tenantId, months = 6) {
  const trends = [];
  const now = new Date();
  
  for (let i = 0; i < months; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = date.getMonth();
    const year = date.getFullYear();
    
    const usage = await getFeatureUsage(tenantId, month, year);
    trends.push(usage);
  }
  
  return trends.reverse();
}

/**
 * Get feature adoption rate across all tenants
 * @returns {Promise<Object>}
 */
export async function getFeatureAdoption() {
  const tenantsRef = collection(db, 'tenants');
  const snapshot = await getDocs(tenantsRef);
  const tenants = snapshot.docs.map(doc => doc.id);
  
  let aiEstimateUsers = 0;
  let contractUsers = 0;
  let paymentUsers = 0;
  let recurringUsers = 0;
  let upsellUsers = 0;
  
  for (const tenantId of tenants) {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    
    const usage = await getFeatureUsage(tenantId, month, year);
    
    if (usage.aiEstimates.total > 0) aiEstimateUsers++;
    if (usage.contractsSigned.total > 0) contractUsers++;
    if (usage.paymentsProcessed.total > 0) paymentUsers++;
    if (usage.recurringServices.total > 0) recurringUsers++;
    if (usage.upsellsOffered.total > 0) upsellUsers++;
  }
  
  const totalTenants = tenants.length;
  
  return {
    aiEstimateAdoption: totalTenants > 0 ? (aiEstimateUsers / totalTenants) * 100 : 0,
    contractAdoption: totalTenants > 0 ? (contractUsers / totalTenants) * 100 : 0,
    paymentAdoption: totalTenants > 0 ? (paymentUsers / totalTenants) * 100 : 0,
    recurringAdoption: totalTenants > 0 ? (recurringUsers / totalTenants) * 100 : 0,
    upsellAdoption: totalTenants > 0 ? (upsellUsers / totalTenants) * 100 : 0,
    totalTenants
  };
}

/**
 * Get most used features across all tenants
 * @param {number} month - Month (0-11)
 * @param {number} year - Year
 * @returns {Promise<Object>}
 */
export async function getMostUsedFeatures(month, year) {
  const tenantsRef = collection(db, 'tenants');
  const snapshot = await getDocs(tenantsRef);
  const tenants = snapshot.docs.map(doc => doc.id);
  
  let totalAIEstimates = 0;
  let totalContracts = 0;
  let totalPayments = 0;
  let totalPhotos = 0;
  let totalRecurring = 0;
  let totalUpsells = 0;
  
  for (const tenantId of tenants) {
    const usage = await getFeatureUsage(tenantId, month, year);
    
    totalAIEstimates += usage.aiEstimates.total;
    totalContracts += usage.contractsSigned.total;
    totalPayments += usage.paymentsProcessed.total;
    totalPhotos += usage.photosUploaded.totalPhotos;
    totalRecurring += usage.recurringServices.total;
    totalUpsells += usage.upsellsOffered.total;
  }
  
  const features = [
    { name: 'AI Estimates', count: totalAIEstimates },
    { name: 'Contracts', count: totalContracts },
    { name: 'Payments', count: totalPayments },
    { name: 'Photos', count: totalPhotos },
    { name: 'Recurring Services', count: totalRecurring },
    { name: 'Upsells', count: totalUpsells }
  ];
  
  features.sort((a, b) => b.count - a.count);
  
  return features;
}

/**
 * Export feature usage as CSV
 * @param {string} tenantId - Tenant ID
 * @param {number} months - Number of months to export
 * @returns {Promise<string>} CSV content
 */
export async function exportFeatureUsageCSV(tenantId, months = 6) {
  const trends = await getFeatureUsageTrends(tenantId, months);
  
  let csv = 'Month,Year,AI Estimates,AI with Photos,AI Accepted,Contracts,Contracts Signed,Payments,Payments Completed,Payment Amount,Photos,Before Photos,After Photos,Recurring Services,Active Recurring,Jobs Generated,Upsells,Upsells Accepted,Upsell Revenue\n';
  
  for (const usage of trends) {
    csv += `${usage.month + 1},${usage.year},${usage.aiEstimates.total},${usage.aiEstimates.withPhotos},${usage.aiEstimates.accepted},${usage.contractsSigned.total},${usage.contractsSigned.signed},${usage.paymentsProcessed.total},${usage.paymentsProcessed.completed},${usage.paymentsProcessed.totalAmount},${usage.photosUploaded.totalPhotos},${usage.photosUploaded.beforePhotos},${usage.photosUploaded.afterPhotos},${usage.recurringServices.total},${usage.recurringServices.active},${usage.recurringServices.jobsGenerated},${usage.upsellsOffered.total},${usage.upsellsOffered.accepted},${usage.upsellsOffered.totalRevenue}\n`;
  }
  
  return csv;
}
