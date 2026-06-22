// src/services/claimWorkflowService.js
/**
 * Claim Workflow Service
 * Manages insurance claim workflow (open, investigating, resolved, paid, denied)
 */

import { collection, doc, addDoc, updateDoc, getDoc, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase';

// Claim status constants
export const CLAIM_STATUS = {
  OPEN: 'open',
  INVESTIGATING: 'investigating',
  APPROVED: 'approved',
  DENIED: 'denied',
  PAID: 'paid',
  CLOSED: 'closed'
};

/**
 * Create claim
 * @param {string} tenantId - Tenant ID
 * @param {object} claimData - Claim data
 * @returns {Promise<DocumentReference>}
 */
export async function createClaim(tenantId, claimData) {
  const claimsRef = collection(db, 'tenants', tenantId, 'insurance_claims');
  
  const data = {
    incidentId: claimData.incidentId || null,
    insurancePolicyId: claimData.insurancePolicyId || null,
    
    // Claim details
    claimNumber: await generateClaimNumber(tenantId),
    title: claimData.title || '',
    description: claimData.description || '',
    
    // Financial details
    claimedAmount: claimData.claimedAmount || 0,
    approvedAmount: 0,
    paidAmount: 0,
    
    // Status
    status: CLAIM_STATUS.OPEN,
    
    // Dates
    incidentDate: claimData.incidentDate || null,
    filedDate: new Date().toISOString(),
    approvedDate: null,
    paidDate: null,
    
    // Insurance company
    insuranceCompany: claimData.insuranceCompany || '',
    policyNumber: claimData.policyNumber || '',
    
    // Documentation
    documents: claimData.documents || [],
    photos: claimData.photos || [],
    
    // Investigation notes
    investigationNotes: claimData.investigationNotes || '',
    
    // Resolution
    denialReason: claimData.denialReason || '',
    resolutionNotes: claimData.resolutionNotes || '',
    
    // Assigned to
    assignedTo: claimData.assignedTo || null,
    
    // Timestamps
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  return await addDoc(claimsRef, data);
}

/**
 * Generate claim number
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<string>}
 */
async function generateClaimNumber(tenantId) {
  const claimsRef = collection(db, 'tenants', tenantId, 'insurance_claims');
  const q = query(claimsRef, orderBy('claimNumber', 'desc'));
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) {
    return 'CLM-0001';
  }
  
  const lastClaim = snapshot.docs[0].data();
  const lastNumber = parseInt(lastClaim.claimNumber.split('-')[1]);
  const newNumber = String(lastNumber + 1).padStart(4, '0');
  
  return `CLM-${newNumber}`;
}

/**
 * Update claim status
 * @param {string} tenantId - Tenant ID
 * @param {string} claimId - Claim ID
 * @param {string} status - New status
 * @param {object} updates - Additional updates
 * @returns {Promise<void>}
 */
export async function updateClaimStatus(tenantId, claimId, status, updates = {}) {
  const claimRef = doc(db, 'tenants', tenantId, 'insurance_claims', claimId);
  const updateData = {
    status,
    updatedAt: new Date().toISOString(),
    ...updates
  };
  
  if (status === CLAIM_STATUS.APPROVED) {
    updateData.approvedDate = new Date().toISOString();
  } else if (status === CLAIM_STATUS.PAID) {
    updateData.paidDate = new Date().toISOString();
  }
  
  await updateDoc(claimRef, updateData);
}

/**
 * Approve claim
 * @param {string} tenantId - Tenant ID
 * @param {string} claimId - Claim ID
 * @param {number} approvedAmount - Approved amount
 * @param {string} notes - Approval notes
 * @returns {Promise<void>}
 */
export async function approveClaim(tenantId, claimId, approvedAmount, notes = '') {
  const claimRef = doc(db, 'tenants', tenantId, 'insurance_claims', claimId);
  await updateDoc(claimRef, {
    status: CLAIM_STATUS.APPROVED,
    approvedAmount,
    resolutionNotes: notes,
    approvedDate: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

/**
 * Deny claim
 * @param {string} tenantId - Tenant ID
 * @param {string} claimId - Claim ID
 * @param {string} denialReason - Reason for denial
 * @param {string} notes - Additional notes
 * @returns {Promise<void>}
 */
export async function denyClaim(tenantId, claimId, denialReason, notes = '') {
  const claimRef = doc(db, 'tenants', tenantId, 'insurance_claims', claimId);
  await updateDoc(claimRef, {
    status: CLAIM_STATUS.DENIED,
    denialReason,
    resolutionNotes: notes,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Mark claim as paid
 * @param {string} tenantId - Tenant ID
 * @param {string} claimId - Claim ID
 * @param {number} paidAmount - Amount paid
 * @returns {Promise<void>}
 */
export async function markClaimAsPaid(tenantId, claimId, paidAmount) {
  const claimRef = doc(db, 'tenants', tenantId, 'insurance_claims', claimId);
  await updateDoc(claimRef, {
    status: CLAIM_STATUS.PAID,
    paidAmount,
    paidDate: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

/**
 * Close claim
 * @param {string} tenantId - Tenant ID
 * @param {string} claimId - Claim ID
 * @returns {Promise<void>}
 */
export async function closeClaim(tenantId, claimId) {
  const claimRef = doc(db, 'tenants', tenantId, 'insurance_claims', claimId);
  await updateDoc(claimRef, {
    status: CLAIM_STATUS.CLOSED,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Add investigation note
 * @param {string} tenantId - Tenant ID
 * @param {string} claimId - Claim ID
 * @param {string} note - Investigation note
 * @returns {Promise<void>}
 */
export async function addInvestigationNote(tenantId, claimId, note) {
  const claimRef = doc(db, 'tenants', tenantId, 'insurance_claims', claimId);
  const claimSnap = await getDoc(claimRef);
  
  if (!claimSnap.exists()) {
    throw new Error('Claim not found');
  }
  
  const claim = claimSnap.data();
  const existingNotes = claim.investigationNotes || '';
  const newNotes = existingNotes ? `${existingNotes}\n\n${new Date().toISOString()}: ${note}` : `${new Date().toISOString()}: ${note}`;
  
  await updateDoc(claimRef, {
    investigationNotes: newNotes,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Add document to claim
 * @param {string} tenantId - Tenant ID
 * @param {string} claimId - Claim ID
 * @param {string} documentUrl - Document URL
 * @returns {Promise<void>}
 */
export async function addClaimDocument(tenantId, claimId, documentUrl) {
  const claimRef = doc(db, 'tenants', tenantId, 'insurance_claims', claimId);
  const claimSnap = await getDoc(claimRef);
  
  if (!claimSnap.exists()) {
    throw new Error('Claim not found');
  }
  
  const claim = claimSnap.data();
  const documents = claim.documents || [];
  documents.push(documentUrl);
  
  await updateDoc(claimRef, {
    documents,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Get claim by ID
 * @param {string} tenantId - Tenant ID
 * @param {string} claimId - Claim ID
 * @returns {Promise<Object|null>}
 */
export async function getClaim(tenantId, claimId) {
  const claimRef = doc(db, 'tenants', tenantId, 'insurance_claims', claimId);
  const claimSnap = await getDoc(claimRef);
  
  if (!claimSnap.exists()) {
    return null;
  }
  
  return { id: claimSnap.id, ...claimSnap.data() };
}

/**
 * Get claim by incident
 * @param {string} tenantId - Tenant ID
 * @param {string} incidentId - Incident ID
 * @returns {Promise<Object|null>}
 */
export async function getClaimByIncident(tenantId, incidentId) {
  const claimsRef = collection(db, 'tenants', tenantId, 'insurance_claims');
  const q = query(claimsRef, where('incidentId', '==', incidentId));
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) {
    return null;
  }
  
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
}

/**
 * Get all claims for tenant
 * @param {string} tenantId - Tenant ID
 * @param {string} status - Optional status filter
 * @returns {Promise<Array>}
 */
export async function getAllClaims(tenantId, status = null) {
  const claimsRef = collection(db, 'tenants', tenantId, 'insurance_claims');
  let q;
  
  if (status) {
    q = query(claimsRef, where('status', '==', status), orderBy('filedDate', 'desc'));
  } else {
    q = query(claimsRef, orderBy('filedDate', 'desc'));
  }
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get open claims
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>}
 */
export async function getOpenClaims(tenantId) {
  const claimsRef = collection(db, 'tenants', tenantId, 'insurance_claims');
  const q = query(
    claimsRef,
    where('status', 'in', [CLAIM_STATUS.OPEN, CLAIM_STATUS.INVESTIGATING]),
    orderBy('filedDate', 'desc')
  );
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get claims by insurance policy
 * @param {string} tenantId - Tenant ID
 * @param {string} insurancePolicyId - Insurance policy ID
 * @returns {Promise<Array>}
 */
export async function getClaimsByPolicy(tenantId, insurancePolicyId) {
  const claimsRef = collection(db, 'tenants', tenantId, 'insurance_claims');
  const q = query(claimsRef, where('insurancePolicyId', '==', insurancePolicyId), orderBy('filedDate', 'desc'));
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get claim analytics
 * @param {string} tenantId - Tenant ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Object>}
 */
export async function getClaimAnalytics(tenantId, startDate, endDate) { // eslint-disable-line no-unused-vars
  const claimsRef = collection(db, 'tenants', tenantId, 'insurance_claims');
  const q = query(claimsRef, orderBy('filedDate', 'desc'));
  const snapshot = await getDocs(q);
  
  const claims = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  let total = claims.length;
  let open = 0;
  let investigating = 0;
  let approved = 0;
  let denied = 0;
  let paid = 0;
  let closed = 0;
  
  let totalClaimed = 0;
  let totalApproved = 0;
  let totalPaid = 0;
  
  for (const claim of claims) {
    switch (claim.status) {
      case CLAIM_STATUS.OPEN:
        open++;
        break;
      case CLAIM_STATUS.INVESTIGATING:
        investigating++;
        break;
      case CLAIM_STATUS.APPROVED:
        approved++;
        break;
      case CLAIM_STATUS.DENIED:
        denied++;
        break;
      case CLAIM_STATUS.PAID:
        paid++;
        break;
      case CLAIM_STATUS.CLOSED:
        closed++;
        break;
    }
    
    totalClaimed += claim.claimedAmount || 0;
    totalApproved += claim.approvedAmount || 0;
    totalPaid += claim.paidAmount || 0;
  }
  
  return {
    total,
    open,
    investigating,
    approved,
    denied,
    paid,
    closed,
    approvalRate: total > 0 ? Math.round((approved / total) * 100) : 0,
    denialRate: total > 0 ? Math.round((denied / total) * 100) : 0,
    totalClaimed,
    totalApproved,
    totalPaid,
    averageClaimAmount: total > 0 ? Math.round(totalClaimed / total) : 0,
    averageApprovedAmount: approved > 0 ? Math.round(totalApproved / approved) : 0
  };
}

/**
 * Export claims as CSV
 * @param {string} tenantId - Tenant ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<string>} CSV content
 */
export async function exportClaimsCSV(tenantId, startDate, endDate) { // eslint-disable-line no-unused-vars
  const claimsRef = collection(db, 'tenants', tenantId, 'insurance_claims');
  const q = query(claimsRef, orderBy('filedDate', 'desc'));
  const snapshot = await getDocs(q);
  
  const claims = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  let csv = 'Claim Number,Title,Status,Filed Date,Claimed Amount,Approved Amount,Paid Amount,Insurance Company,Policy Number\n';
  
  for (const claim of claims) {
    csv += `"${claim.claimNumber}","${claim.title}","${claim.status}","${claim.filedDate}","${claim.claimedAmount}","${claim.approvedAmount}","${claim.paidAmount}","${claim.insuranceCompany}","${claim.policyNumber}"\n`;
  }
  
  return csv;
}
