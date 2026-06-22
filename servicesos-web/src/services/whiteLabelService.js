// src/services/whiteLabelService.js
/**
 * White Label Domain Service
 * Manages custom domains for enterprise tier tenants
 */

import { collection, doc, addDoc, updateDoc, getDoc, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase';

// Domain status constants
export const DOMAIN_STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
  FAILED: 'failed',
  DELETED: 'deleted'
};

/**
 * Create white label domain
 * @param {string} tenantId - Tenant ID
 * @param {object} domainData - Domain data
 * @returns {Promise<DocumentReference>}
 */
export async function createWhiteLabelDomain(tenantId, domainData) {
  const domainsRef = collection(db, 'tenants', tenantId, 'white_label_domains');
  
  const data = {
    domain: domainData.domain,
    subdomain: domainData.subdomain || null,
    
    // SSL certificate
    sslCertificate: domainData.sslCertificate || null,
    sslExpiry: domainData.sslExpiry || null,
    
    // DNS configuration
    dnsRecords: domainData.dnsRecords || [],
    dnsVerified: false,
    
    // Status
    status: DOMAIN_STATUS.PENDING,
    
    // Configuration
    redirectConfig: domainData.redirectConfig || {
      type: 'proxy', // proxy, redirect
      path: '/'
    },
    
    // Timestamps
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  return await addDoc(domainsRef, data);
}

/**
 * Update domain status
 * @param {string} tenantId - Tenant ID
 * @param {string} domainId - Domain ID
 * @param {string} status - New status
 * @returns {Promise<void>}
 */
export async function updateDomainStatus(tenantId, domainId, status) {
  const domainRef = doc(db, 'tenants', tenantId, 'white_label_domains', domainId);
  await updateDoc(domainRef, {
    status,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Verify DNS configuration
 * @param {string} tenantId - Tenant ID
 * @param {string} domainId - Domain ID
 * @returns {Promise<boolean>}
 */
export async function verifyDNS(tenantId, domainId) {
  // In production, this would check actual DNS records
  const domainRef = doc(db, 'tenants', tenantId, 'white_label_domains', domainId);
  const domainSnap = await getDoc(domainRef);
  
  if (!domainSnap.exists()) {
    throw new Error('Domain not found');
  }
  
  // Simulate DNS verification
  const verified = true;
  
  await updateDoc(domainRef, {
    dnsVerified: verified,
    status: verified ? DOMAIN_STATUS.ACTIVE : DOMAIN_STATUS.FAILED,
    updatedAt: new Date().toISOString()
  });
  
  return verified;
}

/**
 * Update SSL certificate
 * @param {string} tenantId - Tenant ID
 * @param {string} domainId - Domain ID
 * @param {object} sslData - SSL certificate data
 * @returns {Promise<void>}
 */
export async function updateSSLCertificate(tenantId, domainId, sslData) {
  const domainRef = doc(db, 'tenants', tenantId, 'white_label_domains', domainId);
  await updateDoc(domainRef, {
    sslCertificate: sslData.certificate,
    sslExpiry: sslData.expiry,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Get domain by ID
 * @param {string} tenantId - Tenant ID
 * @param {string} domainId - Domain ID
 * @returns {Promise<Object|null>}
 */
export async function getDomain(tenantId, domainId) {
  const domainRef = doc(db, 'tenants', tenantId, 'white_label_domains', domainId);
  const domainSnap = await getDoc(domainRef);
  
  if (!domainSnap.exists()) {
    return null;
  }
  
  return { id: domainSnap.id, ...domainSnap.data() };
}

/**
 * Get domain by domain name
 * @param {string} tenantId - Tenant ID
 * @param {string} domain - Domain name
 * @returns {Promise<Object|null>}
 */
export async function getDomainByName(tenantId, domain) {
  const domainsRef = collection(db, 'tenants', tenantId, 'white_label_domains');
  const q = query(domainsRef, where('domain', '==', domain));
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) {
    return null;
  }
  
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
}

/**
 * Get all domains for tenant
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>}
 */
export async function getAllDomains(tenantId) {
  const domainsRef = collection(db, 'tenants', tenantId, 'white_label_domains');
  const q = query(domainsRef, orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get active domains for tenant
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>}
 */
export async function getActiveDomains(tenantId) {
  const domainsRef = collection(db, 'tenants', tenantId, 'white_label_domains');
  const q = query(
    domainsRef,
    where('status', '==', DOMAIN_STATUS.ACTIVE),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Update DNS records
 * @param {string} tenantId - Tenant ID
 * @param {string} domainId - Domain ID
 * @param {Array} dnsRecords - DNS records
 * @returns {Promise<void>}
 */
export async function updateDNSRecords(tenantId, domainId, dnsRecords) {
  const domainRef = doc(db, 'tenants', tenantId, 'white_label_domains', domainId);
  await updateDoc(domainRef, {
    dnsRecords,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Update redirect configuration
 * @param {string} tenantId - Tenant ID
 * @param {string} domainId - Domain ID
 * @param {object} redirectConfig - Redirect configuration
 * @returns {Promise<void>}
 */
export async function updateRedirectConfig(tenantId, domainId, redirectConfig) {
  const domainRef = doc(db, 'tenants', tenantId, 'white_label_domains', domainId);
  await updateDoc(domainRef, {
    redirectConfig,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Delete domain
 * @param {string} tenantId - Tenant ID
 * @param {string} domainId - Domain ID
 * @returns {Promise<void>}
 */
export async function deleteDomain(tenantId, domainId) {
  const domainRef = doc(db, 'tenants', tenantId, 'white_label_domains', domainId);
  await updateDoc(domainRef, {
    status: DOMAIN_STATUS.DELETED,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Check if tenant has white label enabled
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<boolean>}
 */
export async function hasWhiteLabelEnabled(tenantId) {
  const domains = await getActiveDomains(tenantId);
  return domains.length > 0;
}

/**
 * Get domain analytics
 * @param {string} tenantId - Tenant ID
 * @param {string} domainId - Domain ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Object>}
 */
export async function getDomainAnalytics(tenantId, domainId, startDate, endDate) { // eslint-disable-line no-unused-vars
  // In production, this would query actual analytics data
  const domain = await getDomain(tenantId, domainId);
  
  if (!domain) {
    return null;
  }
  
  return {
    domain: domain.domain,
    status: domain.status,
    dnsVerified: domain.dnsVerified,
    sslExpiry: domain.sslExpiry,
    // Placeholder analytics
    visits: 0,
    uniqueVisitors: 0,
    pageViews: 0
  };
}

/**
 * Get SSL expiry warnings
 * @param {string} tenantId - Tenant ID
 * @param {number} daysThreshold - Days threshold for warning (default 30)
 * @returns {Promise<Array>}
 */
export async function getSSLExpiryWarnings(tenantId, daysThreshold = 30) {
  const domains = await getAllDomains(tenantId);
  const warnings = [];
  const now = new Date();
  const threshold = new Date();
  threshold.setDate(now.getDate() + daysThreshold);
  
  for (const domain of domains) {
    if (domain.sslExpiry && domain.status === DOMAIN_STATUS.ACTIVE) {
      const expiry = new Date(domain.sslExpiry);
      if (expiry < threshold) {
        warnings.push({
          domainId: domain.id,
          domain: domain.domain,
          sslExpiry: domain.sslExpiry,
          daysUntilExpiry: Math.floor((expiry - now) / (1000 * 60 * 60 * 24))
        });
      }
    }
  }
  
  return warnings;
}
