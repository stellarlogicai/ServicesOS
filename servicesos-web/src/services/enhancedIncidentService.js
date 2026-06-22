// src/services/enhancedIncidentService.js
/**
 * Enhanced Incident Tracking Service
 * Tracks broken items, property damage, injury, and complaints
 */

import { collection, doc, addDoc, updateDoc, getDoc, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase';

// Incident type constants
export const INCIDENT_TYPE = {
  BROKEN_ITEM: 'broken_item',
  PROPERTY_DAMAGE: 'property_damage',
  INJURY: 'injury',
  COMPLAINT: 'complaint',
  THEFT: 'theft',
  OTHER: 'other'
};

// Incident severity constants
export const INCIDENT_SEVERITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

// Incident status constants
export const INCIDENT_STATUS = {
  OPEN: 'open',
  INVESTIGATING: 'investigating',
  RESOLVED: 'resolved',
  CLOSED: 'closed'
};

/**
 * Create incident
 * @param {string} tenantId - Tenant ID
 * @param {object} incidentData - Incident data
 * @returns {Promise<DocumentReference>}
 */
export async function createIncident(tenantId, incidentData) {
  const incidentsRef = collection(db, 'tenants', tenantId, 'incidents');
  
  const data = {
    jobId: incidentData.jobId || null,
    jobDate: incidentData.jobDate || null,
    customerId: incidentData.customerId || null,
    customerName: incidentData.customerName || '',
    employeeId: incidentData.employeeId || null,
    employeeName: incidentData.employeeName || '',
    
    // Incident details
    type: incidentData.type || INCIDENT_TYPE.OTHER,
    severity: incidentData.severity || INCIDENT_SEVERITY.MEDIUM,
    title: incidentData.title || '',
    description: incidentData.description || '',
    
    // Specific details based on type
    brokenItemDetails: incidentData.brokenItemDetails || null,
    propertyDamageDetails: incidentData.propertyDamageDetails || null,
    injuryDetails: incidentData.injuryDetails || null,
    complaintDetails: incidentData.complaintDetails || null,
    
    // Photos
    photos: incidentData.photos || [],
    
    // Status
    status: INCIDENT_STATUS.OPEN,
    
    // Resolution
    resolution: incidentData.resolution || '',
    resolvedAt: null,
    resolvedBy: null,
    
    // Cost impact
    estimatedCost: incidentData.estimatedCost || 0,
    actualCost: incidentData.actualCost || 0,
    
    // Insurance claim
    insuranceClaimId: incidentData.insuranceClaimId || null,
    
    // Timestamps
    reportedAt: new Date().toISOString(),
    reportedBy: incidentData.reportedBy || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  return await addDoc(incidentsRef, data);
}

/**
 * Update incident status
 * @param {string} tenantId - Tenant ID
 * @param {string} incidentId - Incident ID
 * @param {string} status - New status
 * @param {object} updates - Additional updates
 * @returns {Promise<void>}
 */
export async function updateIncidentStatus(tenantId, incidentId, status, updates = {}) {
  const incidentRef = doc(db, 'tenants', tenantId, 'incidents', incidentId);
  const updateData = {
    status,
    updatedAt: new Date().toISOString(),
    ...updates
  };
  
  if (status === INCIDENT_STATUS.RESOLVED || status === INCIDENT_STATUS.CLOSED) {
    updateData.resolvedAt = new Date().toISOString();
  }
  
  await updateDoc(incidentRef, updateData);
}

/**
 * Update incident resolution
 * @param {string} tenantId - Tenant ID
 * @param {string} incidentId - Incident ID
 * @param {object} resolutionData - Resolution data
 * @returns {Promise<void>}
 */
export async function updateIncidentResolution(tenantId, incidentId, resolutionData) {
  const incidentRef = doc(db, 'tenants', tenantId, 'incidents', incidentId);
  await updateDoc(incidentRef, {
    resolution: resolutionData.resolution || '',
    actualCost: resolutionData.actualCost || 0,
    resolvedBy: resolutionData.resolvedBy || null,
    resolvedAt: new Date().toISOString(),
    status: INCIDENT_STATUS.RESOLVED,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Add photo to incident
 * @param {string} tenantId - Tenant ID
 * @param {string} incidentId - Incident ID
 * @param {string} photoUrl - Photo URL
 * @returns {Promise<void>}
 */
export async function addIncidentPhoto(tenantId, incidentId, photoUrl) {
  const incidentRef = doc(db, 'tenants', tenantId, 'incidents', incidentId);
  const incidentSnap = await getDoc(incidentRef);
  
  if (!incidentSnap.exists()) {
    throw new Error('Incident not found');
  }
  
  const incident = incidentSnap.data();
  const photos = incident.photos || [];
  photos.push(photoUrl);
  
  await updateDoc(incidentRef, {
    photos,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Link incident to insurance claim
 * @param {string} tenantId - Tenant ID
 * @param {string} incidentId - Incident ID
 * @param {string} claimId - Insurance claim ID
 * @returns {Promise<void>}
 */
export async function linkToInsuranceClaim(tenantId, incidentId, claimId) {
  const incidentRef = doc(db, 'tenants', tenantId, 'incidents', incidentId);
  await updateDoc(incidentRef, {
    insuranceClaimId: claimId,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Get incident by ID
 * @param {string} tenantId - Tenant ID
 * @param {string} incidentId - Incident ID
 * @returns {Promise<Object|null>}
 */
export async function getIncident(tenantId, incidentId) {
  const incidentRef = doc(db, 'tenants', tenantId, 'incidents', incidentId);
  const incidentSnap = await getDoc(incidentRef);
  
  if (!incidentSnap.exists()) {
    return null;
  }
  
  return { id: incidentSnap.id, ...incidentSnap.data() };
}

/**
 * Get incidents for job
 * @param {string} tenantId - Tenant ID
 * @param {string} jobId - Job ID
 * @returns {Promise<Array>}
 */
export async function getIncidentsForJob(tenantId, jobId) {
  const incidentsRef = collection(db, 'tenants', tenantId, 'incidents');
  const q = query(incidentsRef, where('jobId', '==', jobId), orderBy('reportedAt', 'desc'));
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get incidents for customer
 * @param {string} tenantId - Tenant ID
 * @param {string} customerId - Customer ID
 * @returns {Promise<Array>}
 */
export async function getIncidentsForCustomer(tenantId, customerId) {
  const incidentsRef = collection(db, 'tenants', tenantId, 'incidents');
  const q = query(incidentsRef, where('customerId', '==', customerId), orderBy('reportedAt', 'desc'));
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get all incidents for tenant
 * @param {string} tenantId - Tenant ID
 * @param {string} status - Optional status filter
 * @returns {Promise<Array>}
 */
export async function getAllIncidents(tenantId, status = null) {
  const incidentsRef = collection(db, 'tenants', tenantId, 'incidents');
  let q;
  
  if (status) {
    q = query(incidentsRef, where('status', '==', status), orderBy('reportedAt', 'desc'));
  } else {
    q = query(incidentsRef, orderBy('reportedAt', 'desc'));
  }
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get incidents by type
 * @param {string} tenantId - Tenant ID
 * @param {string} type - Incident type
 * @returns {Promise<Array>}
 */
export async function getIncidentsByType(tenantId, type) {
  const incidentsRef = collection(db, 'tenants', tenantId, 'incidents');
  const q = query(incidentsRef, where('type', '==', type), orderBy('reportedAt', 'desc'));
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get incidents by severity
 * @param {string} tenantId - Tenant ID
 * @param {string} severity - Incident severity
 * @returns {Promise<Array>}
 */
export async function getIncidentsBySeverity(tenantId, severity) {
  const incidentsRef = collection(db, 'tenants', tenantId, 'incidents');
  const q = query(incidentsRef, where('severity', '==', severity), orderBy('reportedAt', 'desc'));
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get open incidents
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>}
 */
export async function getOpenIncidents(tenantId) {
  const incidentsRef = collection(db, 'tenants', tenantId, 'incidents');
  const q = query(
    incidentsRef,
    where('status', 'in', [INCIDENT_STATUS.OPEN, INCIDENT_STATUS.INVESTIGATING]),
    orderBy('reportedAt', 'desc')
  );
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get incident analytics
 * @param {string} tenantId - Tenant ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Object>}
 */
export async function getIncidentAnalytics(tenantId, startDate, endDate) { // eslint-disable-line no-unused-vars
  const incidentsRef = collection(db, 'tenants', tenantId, 'incidents');
  const q = query(incidentsRef, orderBy('reportedAt', 'desc'));
  const snapshot = await getDocs(q);
  
  const incidents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  let total = incidents.length;
  let open = 0;
  let investigating = 0;
  let resolved = 0;
  let closed = 0;
  
  let brokenItems = 0;
  let propertyDamage = 0;
  let injuries = 0;
  let complaints = 0;
  let theft = 0;
  let other = 0;
  
  let lowSeverity = 0;
  let mediumSeverity = 0;
  let highSeverity = 0;
  let criticalSeverity = 0;
  
  let totalEstimatedCost = 0;
  let totalActualCost = 0;
  
  for (const incident of incidents) {
    switch (incident.status) {
      case INCIDENT_STATUS.OPEN:
        open++;
        break;
      case INCIDENT_STATUS.INVESTIGATING:
        investigating++;
        break;
      case INCIDENT_STATUS.RESOLVED:
        resolved++;
        break;
      case INCIDENT_STATUS.CLOSED:
        closed++;
        break;
    }
    
    switch (incident.type) {
      case INCIDENT_TYPE.BROKEN_ITEM:
        brokenItems++;
        break;
      case INCIDENT_TYPE.PROPERTY_DAMAGE:
        propertyDamage++;
        break;
      case INCIDENT_TYPE.INJURY:
        injuries++;
        break;
      case INCIDENT_TYPE.COMPLAINT:
        complaints++;
        break;
      case INCIDENT_TYPE.THEFT:
        theft++;
        break;
      case INCIDENT_TYPE.OTHER:
        other++;
        break;
    }
    
    switch (incident.severity) {
      case INCIDENT_SEVERITY.LOW:
        lowSeverity++;
        break;
      case INCIDENT_SEVERITY.MEDIUM:
        mediumSeverity++;
        break;
      case INCIDENT_SEVERITY.HIGH:
        highSeverity++;
        break;
      case INCIDENT_SEVERITY.CRITICAL:
        criticalSeverity++;
        break;
    }
    
    totalEstimatedCost += incident.estimatedCost || 0;
    totalActualCost += incident.actualCost || 0;
  }
  
  return {
    total,
    open,
    investigating,
    resolved,
    closed,
    resolutionRate: total > 0 ? Math.round(((resolved + closed) / total) * 100) : 0,
    
    byType: {
      brokenItems,
      propertyDamage,
      injuries,
      complaints,
      theft,
      other
    },
    
    bySeverity: {
      low: lowSeverity,
      medium: mediumSeverity,
      high: highSeverity,
      critical: criticalSeverity
    },
    
    totalEstimatedCost,
    totalActualCost,
    averageCost: total > 0 ? Math.round(totalActualCost / total) : 0
  };
}

/**
 * Export incidents as CSV
 * @param {string} tenantId - Tenant ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<string>} CSV content
 */
export async function exportIncidentsCSV(tenantId, startDate, endDate) { // eslint-disable-line no-unused-vars
  const incidentsRef = collection(db, 'tenants', tenantId, 'incidents');
  const q = query(incidentsRef, orderBy('reportedAt', 'desc'));
  const snapshot = await getDocs(q);
  
  const incidents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  let csv = 'ID,Job ID,Customer,Employee,Type,Severity,Status,Reported At,Description,Estimated Cost,Actual Cost\n';
  
  for (const incident of incidents) {
    csv += `"${incident.id}","${incident.jobId || ''}","${incident.customerName || ''}","${incident.employeeName || ''}","${incident.type}","${incident.severity}","${incident.status}","${incident.reportedAt}","${incident.description.replace(/"/g, '""')}","${incident.estimatedCost}","${incident.actualCost}"\n`;
  }
  
  return csv;
}
