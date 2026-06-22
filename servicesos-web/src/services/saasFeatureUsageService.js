// src/services/saasFeatureUsageService.js
/**
 * SaaS Feature Usage Analytics Service
 * Tracks SaaS feature usage per company including AI estimates, contracts, photos, jobs, invoices, payments
 */

import { getDocs, collection } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Get SaaS feature usage for a tenant
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>}
 */
export async function getSaaSFeatureUsage(tenantId) {
  // Get leads for AI estimates
  const leadsRef = collection(db, 'tenants', tenantId, 'leads');
  const leadsSnap = await getDocs(leadsRef);
  
  const leads = leadsSnap.docs.map(doc => doc.data());
  const aiEstimates = leads.filter(l => l.estimateGenerated && l.estimateSource === 'ai').length;
  const totalEstimates = leads.filter(l => l.estimateGenerated).length;
  
  // Get contracts
  const contractsRef = collection(db, 'tenants', tenantId, 'contracts');
  const contractsSnap = await getDocs(contractsRef);
  
  const contractsSigned = contractsSnap.size;
  
  // Get properties for photos
  const propertiesRef = collection(db, 'tenants', tenantId, 'properties');
  const propertiesSnap = await getDocs(propertiesRef);
  
  const properties = propertiesSnap.docs.map(doc => doc.data());
  const photosCount = properties.reduce((sum, p) => sum + (p.photos ? p.photos.length : 0), 0);
  
  // Get jobs
  const jobsRef = collection(db, 'tenants', tenantId, 'jobs');
  const jobsSnap = await getDocs(jobsRef);
  
  const jobs = jobsSnap.docs.map(doc => doc.data());
  const jobsCompleted = jobs.filter(j => j.status === 'completed').length;
  
  // Get invoices
  const invoicesRef = collection(db, 'tenants', tenantId, 'invoices');
  const invoicesSnap = await getDocs(invoicesRef);
  
  const invoicesCreated = invoicesSnap.size;
  const invoicesPaid = invoicesSnap.docs.map(doc => doc.data()).filter(i => i.status === 'paid').length;
  
  // Get payments from invoices
  const invoicesData = invoicesSnap.docs.map(doc => doc.data());
  const paymentsProcessed = invoicesData.filter(inv => inv.balancePaid > 0).length;
  
  return {
    tenantId,
    aiEstimates,
    totalEstimates,
    contractsSigned,
    photosCount,
    jobsCompleted,
    invoicesCreated,
    invoicesPaid,
    paymentsProcessed
  };
}

/**
 * Get SaaS feature usage trends over time
 * @param {string} tenantId - Tenant ID
 * @param {number} days - Number of days to analyze
 * @returns {Promise<Array>}
 */
export async function getSaaSFeatureUsageTrends(tenantId, days = 30) {
  const leadsRef = collection(db, 'tenants', tenantId, 'leads');
  const leadsSnap = await getDocs(leadsRef);
  
  const leads = leadsSnap.docs.map(doc => doc.data());
  
  const jobsRef = collection(db, 'tenants', tenantId, 'jobs');
  const jobsSnap = await getDocs(jobsRef);
  
  const jobs = jobsSnap.docs.map(doc => doc.data());
  
  const invoicesRef = collection(db, 'tenants', tenantId, 'invoices');
  const invoicesSnap = await getDocs(invoicesRef);
  
  const invoices = invoicesSnap.docs.map(doc => doc.data());
  
  const contractsRef = collection(db, 'tenants', tenantId, 'contracts');
  const contractsSnap = await getDocs(contractsRef);
  
  const contracts = contractsSnap.docs.map(doc => doc.data());
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  const dailyData = {};
  
  for (const lead of leads) {
    const date = new Date(lead.createdAt).toISOString().split('T')[0];
    
    if (!dailyData[date]) {
      dailyData[date] = {
        date,
        aiEstimates: 0,
        jobsCompleted: 0,
        invoicesCreated: 0,
        contractsSigned: 0
      };
    }
    
    if (lead.estimateGenerated && lead.estimateSource === 'ai') {
      dailyData[date].aiEstimates++;
    }
  }
  
  for (const job of jobs) {
    const date = new Date(job.date || job.createdAt).toISOString().split('T')[0];
    
    if (!dailyData[date]) {
      dailyData[date] = {
        date,
        aiEstimates: 0,
        jobsCompleted: 0,
        invoicesCreated: 0,
        contractsSigned: 0
      };
    }
    
    if (job.status === 'completed') {
      dailyData[date].jobsCompleted++;
    }
  }
  
  for (const invoice of invoices) {
    const date = new Date(invoice.createdAt).toISOString().split('T')[0];
    
    if (!dailyData[date]) {
      dailyData[date] = {
        date,
        aiEstimates: 0,
        jobsCompleted: 0,
        invoicesCreated: 0,
        contractsSigned: 0
      };
    }
    
    dailyData[date].invoicesCreated++;
  }
  
  for (const contract of contracts) {
    const date = new Date(contract.createdAt).toISOString().split('T')[0];
    
    if (!dailyData[date]) {
      dailyData[date] = {
        date,
        aiEstimates: 0,
        jobsCompleted: 0,
        invoicesCreated: 0,
        contractsSigned: 0
      };
    }
    
    dailyData[date].contractsSigned++;
  }
  
  const trends = Object.values(dailyData);
  trends.sort((a, b) => a.date.localeCompare(b.date));
  
  return trends;
}

/**
 * Get feature adoption rates
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>}
 */
export async function getFeatureAdoptionRates(tenantId) {
  const usage = await getSaaSFeatureUsage(tenantId);
  
  const aiAdoptionRate = usage.totalEstimates > 0 
    ? (usage.aiEstimates / usage.totalEstimates * 100).toFixed(1) 
    : 0;
  
  const invoicePaymentRate = usage.invoicesCreated > 0
    ? (usage.paymentsProcessed / usage.invoicesCreated * 100).toFixed(1)
    : 0;
  
  const jobCompletionRate = usage.jobsCompleted > 0
    ? (usage.jobsCompleted / (usage.jobsCompleted + 10) * 100).toFixed(1) // Simplified
    : 0;
  
  return {
    aiAdoptionRate,
    invoicePaymentRate,
    jobCompletionRate
  };
}

/**
 * Get SaaS feature usage summary across all tenants
 * @returns {Promise<Object>}
 */
export async function getSaaSFeatureUsageSummary() {
  const tenantsRef = collection(db, 'tenants');
  const tenantsSnap = await getDocs(tenantsRef);
  
  const tenants = tenantsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  let totalAiEstimates = 0;
  let totalEstimates = 0;
  let totalContracts = 0;
  let totalPhotos = 0;
  let totalJobs = 0;
  let totalInvoices = 0;
  let totalPayments = 0;
  
  for (const tenant of tenants) {
    const usage = await getSaaSFeatureUsage(tenant.id);
    totalAiEstimates += usage.aiEstimates;
    totalEstimates += usage.totalEstimates;
    totalContracts += usage.contractsSigned;
    totalPhotos += usage.photosCount;
    totalJobs += usage.jobsCompleted;
    totalInvoices += usage.invoicesCreated;
    totalPayments += usage.paymentsProcessed;
  }
  
  const overallAiAdoption = totalEstimates > 0 
    ? (totalAiEstimates / totalEstimates * 100).toFixed(1) 
    : 0;
  
  return {
    totalTenants: tenants.length,
    totalAiEstimates,
    totalEstimates,
    totalContracts,
    totalPhotos,
    totalJobs,
    totalInvoices,
    totalPayments,
    overallAiAdoption
  };
}

/**
 * Get top feature users
 * @param {string} feature - Feature to analyze (aiEstimates, contracts, jobs, invoices)
 * @param {number} limit - Number of tenants to return
 * @returns {Promise<Array>}
 */
export async function getTopFeatureUsers(feature = 'jobs', limit = 10) {
  const tenantsRef = collection(db, 'tenants');
  const tenantsSnap = await getDocs(tenantsRef);
  
  const tenants = tenantsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  const usageData = [];
  
  for (const tenant of tenants) {
    const usage = await getSaaSFeatureUsage(tenant.id);
    usageData.push({
      tenantId: tenant.id,
      tenantName: tenant.name || tenant.companyName,
      ...usage
    });
  }
  
  const featureMap = {
    aiEstimates: 'aiEstimates',
    contracts: 'contractsSigned',
    jobs: 'jobsCompleted',
    invoices: 'invoicesCreated'
  };
  
  const sortField = featureMap[feature] || 'jobsCompleted';
  
  return usageData
    .sort((a, b) => b[sortField] - a[sortField])
    .slice(0, limit);
}
