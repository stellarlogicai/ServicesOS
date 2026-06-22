// src/services/documentImportService.js
/**
 * Document Import Service
 * Import contracts, insurance certificates PDF/DOCX
 */

import { collection, addDoc, doc, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

/**
 * Upload a document to Firebase Storage
 * @param {string} tenantId - Tenant ID
 * @param {File} file - File to upload
 * @param {string} category - Document category (contract, insurance, etc.)
 * @returns {Promise<string>} Download URL
 */
export async function uploadDocument(tenantId, file, category) {
  const storage = getStorage();
  const fileName = `${category}_${Date.now()}_${file.name}`;
  const storageRef = ref(storage, `tenants/${tenantId}/documents/${fileName}`);
  
  await uploadBytes(storageRef, file);
  const downloadURL = await getDownloadURL(storageRef);
  
  return downloadURL;
}

/**
 * Save document metadata to Firestore
 * @param {string} tenantId - Tenant ID
 * @param {Object} documentData - Document metadata
 * @returns {Promise<string>} Document ID
 */
export async function saveDocumentMetadata(tenantId, documentData) {
  const documentsRef = collection(db, 'tenants', tenantId, 'documents');
  const docRef = await addDoc(documentsRef, {
    ...documentData,
    uploadedAt: new Date().toISOString()
  });
  
  return docRef.id;
}

/**
 * Import a contract document
 * @param {string} tenantId - Tenant ID
 * @param {File} file - Contract file
 * @param {Object} contractData - Contract metadata
 * @returns {Promise<Object>} Imported contract
 */
export async function importContract(tenantId, file, contractData) {
  const downloadURL = await uploadDocument(tenantId, file, 'contract');
  
  const documentData = {
    type: 'contract',
    fileName: file.name,
    fileType: file.type,
    fileUrl: downloadURL,
    fileSize: file.size,
    category: contractData.category || 'service',
    customerId: contractData.customerId,
    jobId: contractData.jobId,
    title: contractData.title || 'Contract',
    description: contractData.description || '',
    status: 'active',
    expiresAt: contractData.expiresAt || null
  };
  
  const documentId = await saveDocumentMetadata(tenantId, documentData);
  
  return {
    id: documentId,
    ...documentData
  };
}

/**
 * Import an insurance certificate document
 * @param {string} tenantId - Tenant ID
 * @param {File} file - Insurance certificate file
 * @param {Object} insuranceData - Insurance metadata
 * @returns {Promise<Object>} Imported insurance certificate
 */
export async function importInsuranceCertificate(tenantId, file, insuranceData) {
  const downloadURL = await uploadDocument(tenantId, file, 'insurance');
  
  const documentData = {
    type: 'insurance',
    fileName: file.name,
    fileType: file.type,
    fileUrl: downloadURL,
    fileSize: file.size,
    category: 'insurance',
    provider: insuranceData.provider,
    policyNumber: insuranceData.policyNumber,
    coverageAmount: insuranceData.coverageAmount,
    expirationDate: insuranceData.expirationDate,
    employeeId: insuranceData.employeeId || null,
    title: `${insuranceData.provider} Insurance Certificate`,
    description: `Policy: ${insuranceData.policyNumber}`,
    status: 'active'
  };
  
  const documentId = await saveDocumentMetadata(tenantId, documentData);
  
  // Also update insurance tracking collection
  const insuranceRef = collection(db, 'tenants', tenantId, 'insurance');
  const q = query(insuranceRef, where('policyNumber', '==', insuranceData.policyNumber));
  const querySnap = await getDocs(q);
  
  if (!querySnap.empty) {
    const insuranceDoc = doc(db, 'tenants', tenantId, 'insurance', querySnap.docs[0].id);
    await updateDoc(insuranceDoc, {
      certificateUrl: downloadURL,
      updatedAt: new Date().toISOString()
    });
  }
  
  return {
    id: documentId,
    ...documentData
  };
}

/**
 * Import a generic document
 * @param {string} tenantId - Tenant ID
 * @param {File} file - Document file
 * @param {Object} metadata - Document metadata
 * @returns {Promise<Object>} Imported document
 */
export async function importDocument(tenantId, file, metadata) {
  const downloadURL = await uploadDocument(tenantId, file, metadata.category || 'general');
  
  const documentData = {
    type: metadata.type || 'general',
    fileName: file.name,
    fileType: file.type,
    fileUrl: downloadURL,
    fileSize: file.size,
    category: metadata.category || 'general',
    customerId: metadata.customerId || null,
    jobId: metadata.jobId || null,
    employeeId: metadata.employeeId || null,
    title: metadata.title || file.name,
    description: metadata.description || '',
    status: 'active'
  };
  
  const documentId = await saveDocumentMetadata(tenantId, documentData);
  
  return {
    id: documentId,
    ...documentData
  };
}

/**
 * Get documents for a tenant
 * @param {string} tenantId - Tenant ID
 * @param {Object} filters - Optional filters (type, category, customerId, jobId, employeeId)
 * @returns {Promise<Array>} Documents
 */
export async function getDocuments(tenantId, filters = {}) {
  const documentsRef = collection(db, 'tenants', tenantId, 'documents');
  let q = documentsRef;
  
  if (filters.type) {
    q = query(q, where('type', '==', filters.type));
  }
  
  if (filters.category) {
    q = query(q, where('category', '==', filters.category));
  }
  
  if (filters.customerId) {
    q = query(q, where('customerId', '==', filters.customerId));
  }
  
  if (filters.jobId) {
    q = query(q, where('jobId', '==', filters.jobId));
  }
  
  if (filters.employeeId) {
    q = query(q, where('employeeId', '==', filters.employeeId));
  }
  
  const querySnap = await getDocs(q);
  
  return querySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get a specific document
 * @param {string} tenantId - Tenant ID
 * @param {string} documentId - Document ID
 * @returns {Promise<Object>} Document data
 */
export async function getDocument(tenantId, documentId) {
  const documentsRef = collection(db, 'tenants', tenantId, 'documents');
  const q = query(documentsRef, where('__name__', '==', documentId));
  const querySnap = await getDocs(q);
  
  if (querySnap.empty) {
    return null;
  }
  
  const doc = querySnap.docs[0];
  return { id: doc.id, ...doc.data() };
}

/**
 * Update document metadata
 * @param {string} tenantId - Tenant ID
 * @param {string} documentId - Document ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<void>}
 */
export async function updateDocument(tenantId, documentId, updates) {
  const documentRef = doc(db, 'tenants', tenantId, 'documents', documentId);
  await updateDoc(documentRef, {
    ...updates,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Delete a document
 * @param {string} tenantId - Tenant ID
 * @param {string} documentId - Document ID
 * @returns {Promise<void>}
 */
export async function deleteDocument(tenantId, documentId) {
  const documentRef = doc(db, 'tenants', tenantId, 'documents', documentId);
  await updateDoc(documentRef, {
    status: 'deleted',
    deletedAt: new Date().toISOString()
  });
}

/**
 * Get contracts for a customer
 * @param {string} tenantId - Tenant ID
 * @param {string} customerId - Customer ID
 * @returns {Promise<Array>} Contracts
 */
export async function getCustomerContracts(tenantId, customerId) {
  return getDocuments(tenantId, {
    type: 'contract',
    customerId
  });
}

/**
 * Get insurance certificates for an employee
 * @param {string} tenantId - Tenant ID
 * @param {string} employeeId - Employee ID
 * @returns {Promise<Array>} Insurance certificates
 */
export async function getEmployeeInsuranceCertificates(tenantId, employeeId) {
  return getDocuments(tenantId, {
    type: 'insurance',
    employeeId
  });
}

/**
 * Get documents expiring soon
 * @param {string} tenantId - Tenant ID
 * @param {number} days - Number of days to look ahead
 * @returns {Promise<Array>} Expiring documents
 */
export async function getExpiringDocuments(tenantId, days = 30) {
  const documentsRef = collection(db, 'tenants', tenantId, 'documents');
  const querySnap = await getDocs(documentsRef);
  
  const allDocuments = querySnap.docs.map(doc => doc.data());
  const now = new Date();
  const futureDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  
  const expiringDocuments = allDocuments.filter(doc => {
    if (!doc.expirationDate || !doc.expiresAt) {
      return false;
    }
    
    const expirationDate = new Date(doc.expirationDate || doc.expiresAt);
    return expirationDate >= now && expirationDate <= futureDate;
  });
  
  return expiringDocuments;
}

/**
 * Get document statistics
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Document statistics
 */
export async function getDocumentStatistics(tenantId) {
  const documentsRef = collection(db, 'tenants', tenantId, 'documents');
  const querySnap = await getDocs(documentsRef);
  
  const documents = querySnap.docs.map(doc => doc.data());
  
  const byType = {};
  const byCategory = {};
  let totalStorage = 0;
  
  documents.forEach(doc => {
    // Count by type
    byType[doc.type] = (byType[doc.type] || 0) + 1;
    
    // Count by category
    byCategory[doc.category] = (byCategory[doc.category] || 0) + 1;
    
    // Calculate total storage
    totalStorage += doc.fileSize || 0;
  });
  
  return {
    totalDocuments: documents.length,
    byType,
    byCategory,
    totalStorage,
    totalStorageMB: (totalStorage / (1024 * 1024)).toFixed(2)
  };
}
