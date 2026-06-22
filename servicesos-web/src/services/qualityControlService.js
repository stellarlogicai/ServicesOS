// src/services/qualityControlService.js
/**
 * Quality Control Checklist Service
 * Handles quality control checklists for job completion
 */

import { collection, doc, addDoc, updateDoc, getDoc, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase';

// Checklist item status constants
export const CHECKLIST_STATUS = {
  PENDING: 'pending',
  PASSED: 'passed',
  FAILED: 'failed',
  NA: 'not_applicable'
};

/**
 * Create a quality control checklist
 * @param {string} tenantId - Tenant ID
 * @param {object} checklistData - Checklist data
 * @returns {Promise<DocumentReference>}
 */
export async function createChecklist(tenantId, checklistData) {
  const checklistsRef = collection(db, 'tenants', tenantId, 'quality_checklists');
  
  const data = {
    jobId: checklistData.jobId,
    jobDate: checklistData.jobDate || null,
    
    // Employee completing the checklist
    employeeId: checklistData.employeeId || null,
    employeeName: checklistData.employeeName || '',
    
    // Checklist items
    items: checklistData.items || [],
    
    // Overall status
    overallStatus: CHECKLIST_STATUS.PENDING,
    
    // Notes
    notes: checklistData.notes || '',
    issues: checklistData.issues || [],
    
    // Photos
    photoUrls: checklistData.photoUrls || [],
    
    // Customer signature
    customerSignature: checklistData.customerSignature || null,
    customerSignedAt: null,
    
    // Timestamps
    createdAt: new Date().toISOString(),
    completedAt: null,
    updatedAt: new Date().toISOString()
  };
  
  return await addDoc(checklistsRef, data);
}

/**
 * Update checklist
 * @param {string} tenantId - Tenant ID
 * @param {string} checklistId - Checklist ID
 * @param {object} updates - Updates to apply
 * @returns {Promise<void>}
 */
export async function updateChecklist(tenantId, checklistId, updates) {
  const checklistRef = doc(db, 'tenants', tenantId, 'quality_checklists', checklistId);
  await updateDoc(checklistRef, {
    ...updates,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Update checklist item status
 * @param {string} tenantId - Tenant ID
 * @param {string} checklistId - Checklist ID
 * @param {number} itemIndex - Item index
 * @param {string} status - New status
 * @returns {Promise<void>}
 */
export async function updateChecklistItemStatus(tenantId, checklistId, itemIndex, status) {
  const checklistRef = doc(db, 'tenants', tenantId, 'quality_checklists', checklistId);
  const checklistSnap = await getDoc(checklistRef);
  
  if (!checklistSnap.exists()) {
    throw new Error('Checklist not found');
  }
  
  const checklist = checklistSnap.data();
  const items = checklist.items || [];
  
  if (itemIndex < 0 || itemIndex >= items.length) {
    throw new Error('Invalid item index');
  }
  
  items[itemIndex].status = status;
  items[itemIndex].completedAt = new Date().toISOString();
  
  // Recalculate overall status
  const overallStatus = calculateOverallStatus(items);
  
  await updateDoc(checklistRef, {
    items,
    overallStatus,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Complete checklist
 * @param {string} tenantId - Tenant ID
 * @param {string} checklistId - Checklist ID
 * @param {object} completionData - Completion data
 * @returns {Promise<void>}
 */
export async function completeChecklist(tenantId, checklistId, completionData) {
  const checklistRef = doc(db, 'tenants', tenantId, 'quality_checklists', checklistId);
  const checklistSnap = await getDoc(checklistRef);
  
  if (!checklistSnap.exists()) {
    throw new Error('Checklist not found');
  }
  
  const checklist = checklistSnap.data();
  const items = checklist.items || [];
  
  // Mark all pending items as passed if not specified
  for (const item of items) {
    if (item.status === CHECKLIST_STATUS.PENDING) {
      item.status = CHECKLIST_STATUS.PASSED;
      item.completedAt = new Date().toISOString();
    }
  }
  
  const overallStatus = calculateOverallStatus(items);
  
  await updateDoc(checklistRef, {
    items,
    overallStatus,
    notes: completionData.notes || checklist.notes,
    issues: completionData.issues || checklist.issues,
    photoUrls: completionData.photoUrls || checklist.photoUrls,
    completedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

/**
 * Add customer signature
 * @param {string} tenantId - Tenant ID
 * @param {string} checklistId - Checklist ID
 * @param {string} signature - Signature data URL
 * @returns {Promise<void>}
 */
export async function addCustomerSignature(tenantId, checklistId, signature) {
  const checklistRef = doc(db, 'tenants', tenantId, 'quality_checklists', checklistId);
  await updateDoc(checklistRef, {
    customerSignature: signature,
    customerSignedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

/**
 * Get checklist by ID
 * @param {string} tenantId - Tenant ID
 * @param {string} checklistId - Checklist ID
 * @returns {Promise<Object|null>}
 */
export async function getChecklist(tenantId, checklistId) {
  const checklistRef = doc(db, 'tenants', tenantId, 'quality_checklists', checklistId);
  const checklistSnap = await getDoc(checklistRef);
  
  if (!checklistSnap.exists()) {
    return null;
  }
  
  return { id: checklistSnap.id, ...checklistSnap.data() };
}

/**
 * Get checklists for a tenant
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>}
 */
export async function getChecklists(tenantId) {
  const checklistsRef = collection(db, 'tenants', tenantId, 'quality_checklists');
  const q = query(checklistsRef, orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get checklist for a job
 * @param {string} tenantId - Tenant ID
 * @param {string} jobId - Job ID
 * @returns {Promise<Object|null>}
 */
export async function getJobChecklist(tenantId, jobId) {
  const checklistsRef = collection(db, 'tenants', tenantId, 'quality_checklists');
  const q = query(checklistsRef, where('jobId', '==', jobId));
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) {
    return null;
  }
  
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
}

/**
 * Get default checklist template
 * @returns {Array>} Default checklist items
 */
export function getDefaultChecklistTemplate() {
  return [
    {
      id: '1',
      category: 'General',
      item: 'Arrived on time',
      status: CHECKLIST_STATUS.PENDING,
      required: true
    },
    {
      id: '2',
      category: 'General',
      item: 'Wore proper uniform',
      status: CHECKLIST_STATUS.PENDING,
      required: true
    },
    {
      id: '3',
      category: 'General',
      item: 'Professional demeanor',
      status: CHECKLIST_STATUS.PENDING,
      required: true
    },
    {
      id: '4',
      category: 'Living Areas',
      item: 'Dusted all surfaces',
      status: CHECKLIST_STATUS.PENDING,
      required: true
    },
    {
      id: '5',
      category: 'Living Areas',
      item: 'Vacuumed carpets',
      status: CHECKLIST_STATUS.PENDING,
      required: true
    },
    {
      id: '6',
      category: 'Living Areas',
      item: 'Mopped hard floors',
      status: CHECKLIST_STATUS.PENDING,
      required: true
    },
    {
      id: '7',
      category: 'Kitchen',
      item: 'Cleaned countertops',
      status: CHECKLIST_STATUS.PENDING,
      required: true
    },
    {
      id: '8',
      category: 'Kitchen',
      item: 'Cleaned sink and faucet',
      status: CHECKLIST_STATUS.PENDING,
      required: true
    },
    {
      id: '9',
      category: 'Kitchen',
      item: 'Wiped down appliances',
      status: CHECKLIST_STATUS.PENDING,
      required: true
    },
    {
      id: '10',
      category: 'Bathroom',
      item: 'Cleaned toilet',
      status: CHECKLIST_STATUS.PENDING,
      required: true
    },
    {
      id: '11',
      category: 'Bathroom',
      item: 'Cleaned sink and vanity',
      status: CHECKLIST_STATUS.PENDING,
      required: true
    },
    {
      id: '12',
      category: 'Bathroom',
      item: 'Cleaned shower/tub',
      status: CHECKLIST_STATUS.PENDING,
      required: true
    },
    {
      id: '13',
      category: 'Bathroom',
      item: 'Cleaned mirrors',
      status: CHECKLIST_STATUS.PENDING,
      required: true
    },
    {
      id: '14',
      category: 'Bathroom',
      item: 'Mopped floors',
      status: CHECKLIST_STATUS.PENDING,
      required: true
    },
    {
      id: '15',
      category: 'Bedroom',
      item: 'Made beds',
      status: CHECKLIST_STATUS.PENDING,
      required: true
    },
    {
      id: '16',
      category: 'Bedroom',
      item: 'Dusted furniture',
      status: CHECKLIST_STATUS.PENDING,
      required: true
    },
    {
      id: '17',
      category: 'Bedroom',
      item: 'Vacuumed floors',
      status: CHECKLIST_STATUS.PENDING,
      required: true
    },
    {
      id: '18',
      category: 'Final',
      item: 'Removed trash',
      status: CHECKLIST_STATUS.PENDING,
      required: true
    },
    {
      id: '19',
      category: 'Final',
      item: 'Locked doors/windows',
      status: CHECKLIST_STATUS.PENDING,
      required: true
    },
    {
      id: '20',
      category: 'Final',
      item: 'Left property in good condition',
      status: CHECKLIST_STATUS.PENDING,
      required: true
    }
  ];
}

/**
 * Calculate overall status from items
 * @param {Array} items - Checklist items
 * @returns {string} Overall status
 */
function calculateOverallStatus(items) {
  if (!items || items.length === 0) {
    return CHECKLIST_STATUS.PENDING;
  }
  
  let hasPending = false;
  let hasFailed = false;
  
  for (const item of items) {
    if (item.status === CHECKLIST_STATUS.PENDING) {
      hasPending = true;
    } else if (item.status === CHECKLIST_STATUS.FAILED) {
      hasFailed = true;
    }
  }
  
  if (hasPending) {
    return CHECKLIST_STATUS.PENDING;
  }
  
  if (hasFailed) {
    return CHECKLIST_STATUS.FAILED;
  }
  
  return CHECKLIST_STATUS.PASSED;
}

/**
 * Get quality control analytics
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>}
 */
export async function getQualityControlAnalytics(tenantId) {
  const checklists = await getChecklists(tenantId);
  
  let totalChecklists = checklists.length;
  let passed = 0;
  let failed = 0;
  let pending = 0;
  
  const categoryStats = {};
  
  for (const checklist of checklists) {
    if (checklist.overallStatus === CHECKLIST_STATUS.PASSED) {
      passed++;
    } else if (checklist.overallStatus === CHECKLIST_STATUS.FAILED) {
      failed++;
    } else {
      pending++;
    }
    
    // Track category stats
    if (checklist.items) {
      for (const item of checklist.items) {
        if (!categoryStats[item.category]) {
          categoryStats[item.category] = { total: 0, passed: 0, failed: 0 };
        }
        categoryStats[item.category].total++;
        
        if (item.status === CHECKLIST_STATUS.PASSED) {
          categoryStats[item.category].passed++;
        } else if (item.status === CHECKLIST_STATUS.FAILED) {
          categoryStats[item.category].failed++;
        }
      }
    }
  }
  
  const passRate = totalChecklists > 0 ? (passed / totalChecklists) * 100 : 0;
  
  return {
    totalChecklists,
    passed,
    failed,
    pending,
    passRate: Math.round(passRate * 10) / 10,
    categoryStats
  };
}

/**
 * Export checklists as CSV
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<string>} CSV content
 */
export async function exportChecklistsCSV(tenantId) {
  const checklists = await getChecklists(tenantId);
  
  let csv = 'Date,Job ID,Employee Name,Overall Status,Notes,Completed At\n';
  
  for (const checklist of checklists) {
    csv += `"${checklist.createdAt}","${checklist.jobId || ''}","${checklist.employeeName}","${checklist.overallStatus}","${checklist.notes}","${checklist.completedAt || ''}"\n`;
  }
  
  return csv;
}
