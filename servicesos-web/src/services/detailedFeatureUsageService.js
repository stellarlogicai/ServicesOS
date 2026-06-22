// src/services/detailedFeatureUsageService.js
/**
 * Detailed Feature Usage Analytics Service
 * Tracks detailed feature usage per tenant including AI estimates, contracts, invoices, photos, SMS, emails, portal logins, and recurring jobs
 */

import { getDocs, collection } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Get detailed feature usage for a tenant
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>}
 */
export async function getDetailedFeatureUsage(tenantId) {
  // Get AI estimates
  const leadsRef = collection(db, 'tenants', tenantId, 'leads');
  const leadsSnap = await getDocs(leadsRef);
  const leads = leadsSnap.docs.map(doc => doc.data());
  
  const aiEstimatesUsed = leads.filter(lead => lead.estimateGenerated && lead.aiAnalysis).length;
  const totalEstimates = leads.filter(lead => lead.estimateGenerated).length;
  
  // Get contracts
  const contractsRef = collection(db, 'tenants', tenantId, 'contracts');
  const contractsSnap = await getDocs(contractsRef);
  const contractsSigned = contractsSnap.size;
  
  // Get invoices
  const invoicesRef = collection(db, 'tenants', tenantId, 'invoices');
  const invoicesSnap = await getDocs(invoicesRef);
  const invoicesCreated = invoicesSnap.size;
  
  // Get photos (from properties and job completions)
  const propertiesRef = collection(db, 'tenants', tenantId, 'properties');
  const propertiesSnap = await getDocs(propertiesRef);
  const properties = propertiesSnap.docs.map(doc => doc.data());
  
  const jobCompletionsRef = collection(db, 'tenants', tenantId, 'job_completions');
  const jobCompletionsSnap = await getDocs(jobCompletionsRef);
  const jobCompletions = jobCompletionsSnap.docs.map(doc => doc.data());
  
  let totalPhotos = 0;
  for (const property of properties) {
    totalPhotos += property.photos ? property.photos.length : 0;
  }
  for (const completion of jobCompletions) {
    totalPhotos += completion.beforePhotos ? completion.beforePhotos.length : 0;
    totalPhotos += completion.afterPhotos ? completion.afterPhotos.length : 0;
  }
  
  // Get jobs
  const jobsRef = collection(db, 'tenants', tenantId, 'jobs');
  const jobsSnap = await getDocs(jobsRef);
  const jobsScheduled = jobsSnap.size;
  
  // Get payments (from invoices)
  const invoicesData = invoicesSnap.docs.map(doc => doc.data());
  const paymentsProcessed = invoicesData.filter(inv => inv.balancePaid > 0).length;
  
  // Get recurring jobs
  const recurringRef = collection(db, 'tenants', tenantId, 'recurring_services');
  const recurringSnap = await getDocs(recurringRef);
  const recurringJobs = recurringSnap.size;
  
  // SMS and emails are tracked in audit trail or separate logs
  // For now, we'll estimate based on jobs and leads
  const smsSent = jobsScheduled + leads.length; // Approximate
  const emailsSent = jobsScheduled + leads.length * 2; // Approximate
  
  // Portal logins would be tracked in auth logs
  // For now, we'll estimate based on customers
  const customersRef = collection(db, 'tenants', tenantId, 'customers');
  const customersSnap = await getDocs(customersRef);
  const portalLogins = customersSnap.size; // Approximate
  
  return {
    aiEstimatesUsed,
    totalEstimates,
    contractsSigned,
    invoicesCreated,
    photosUploaded: totalPhotos,
    jobsScheduled,
    paymentsProcessed,
    recurringJobs,
    smsSent,
    emailsSent,
    portalLogins,
    aiEstimateRate: totalEstimates > 0 ? (aiEstimatesUsed / totalEstimates * 100).toFixed(1) : 0
  };
}

/**
 * Get feature usage trends over time
 * @param {string} tenantId - Tenant ID
 * @param {number} days - Number of days to analyze
 * @returns {Promise<Array>}
 */
export async function getFeatureUsageTrends(tenantId, days = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  // Get leads
  const leadsRef = collection(db, 'tenants', tenantId, 'leads');
  const leadsSnap = await getDocs(leadsRef);
  const leads = leadsSnap.docs.map(doc => doc.data());
  
  // Get jobs
  const jobsRef = collection(db, 'tenants', tenantId, 'jobs');
  const jobsSnap = await getDocs(jobsRef);
  const jobs = jobsSnap.docs.map(doc => doc.data());
  
  // Get invoices
  const invoicesRef = collection(db, 'tenants', tenantId, 'invoices');
  const invoicesSnap = await getDocs(invoicesRef);
  const invoices = invoicesSnap.docs.map(doc => doc.data());
  
  // Group by day
  const dailyData = {};
  
  for (const lead of leads) {
    const date = new Date(lead.createdAt).toISOString().split('T')[0];
    if (!dailyData[date]) {
      dailyData[date] = {
        date,
        aiEstimates: 0,
        totalEstimates: 0,
        jobs: 0,
        invoices: 0
      };
    }
    
    if (lead.estimateGenerated) {
      dailyData[date].totalEstimates++;
      if (lead.aiAnalysis) {
        dailyData[date].aiEstimates++;
      }
    }
  }
  
  for (const job of jobs) {
    const date = job.date || job.createdAt;
    if (!date) continue;
    
    const dateKey = new Date(date).toISOString().split('T')[0];
    if (!dailyData[dateKey]) {
      dailyData[dateKey] = {
        date: dateKey,
        aiEstimates: 0,
        totalEstimates: 0,
        jobs: 0,
        invoices: 0
      };
    }
    
    dailyData[dateKey].jobs++;
  }
  
  for (const invoice of invoices) {
    const date = invoice.createdAt;
    if (!date) continue;
    
    const dateKey = new Date(date).toISOString().split('T')[0];
    if (!dailyData[dateKey]) {
      dailyData[dateKey] = {
        date: dateKey,
        aiEstimates: 0,
        totalEstimates: 0,
        jobs: 0,
        invoices: 0
      };
    }
    
    dailyData[dateKey].invoices++;
  }
  
  // Convert to array and sort
  const trends = Object.values(dailyData).sort((a, b) => a.date.localeCompare(b.date));
  
  return trends;
}

/**
 * Get feature adoption rate
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>}
 */
export async function getFeatureAdoptionRate(tenantId) {
  const usage = await getDetailedFeatureUsage(tenantId);
  
  const customersRef = collection(db, 'tenants', tenantId, 'customers');
  const customersSnap = await getDocs(customersRef);
  const totalCustomers = customersSnap.size;
  
  return {
    aiEstimateAdoption: usage.totalEstimates > 0 ? (usage.aiEstimatesUsed / usage.totalEstimates * 100).toFixed(1) : 0,
    contractAdoption: totalCustomers > 0 ? (usage.contractsSigned / totalCustomers * 100).toFixed(1) : 0,
    recurringAdoption: totalCustomers > 0 ? (usage.recurringJobs / totalCustomers * 100).toFixed(1) : 0,
    paymentAdoption: usage.invoicesCreated > 0 ? (usage.paymentsProcessed / usage.invoicesCreated * 100).toFixed(1) : 0
  };
}

/**
 * Get feature usage comparison with other tenants (SaaS admin only)
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>}
 */
export async function getFeatureUsageComparison(tenantId) {
  const usage = await getDetailedFeatureUsage(tenantId);
  
  // This would typically query all tenants for comparison
  // For now, return the current tenant's usage as a baseline
  return {
    currentTenant: usage,
    averagePerTenant: usage, // Placeholder - would calculate from all tenants
    percentile: 50 // Placeholder - would calculate actual percentile
  };
}

/**
 * Get feature usage summary for dashboard
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>}
 */
export async function getFeatureUsageSummary(tenantId) {
  const usage = await getDetailedFeatureUsage(tenantId);
  const adoption = await getFeatureAdoptionRate(tenantId);
  
  return {
    ...usage,
    adoption,
    totalFeaturesUsed: Object.values(usage).reduce((sum, val) => sum + (typeof val === 'number' ? val : 0), 0)
  };
}
