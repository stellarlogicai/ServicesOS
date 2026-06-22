// src/services/checklistTemplateImportService.js
/**
 * Cleaning Checklist Template Import Service
 * Import company-specific workflow templates
 */

import { collection, addDoc, doc, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Import checklist template
 * @param {string} tenantId - Tenant ID
 * @param {Object} templateData - Template data
 * @returns {Promise<Object>} Imported template
 */
export async function importChecklistTemplate(tenantId, templateData) {
  const templatesRef = collection(db, 'tenants', tenantId, 'checklist_templates');
  
  const data = {
    name: templateData.name,
    description: templateData.description || '',
    serviceLevel: templateData.serviceLevel || 'standard',
    propertyType: templateData.propertyType || 'residential',
    items: templateData.items || [],
    isDefault: templateData.isDefault || false,
    status: 'active',
    createdAt: new Date().toISOString()
  };
  
  const docRef = await addDoc(templatesRef, data);
  return { id: docRef.id, ...data };
}

/**
 * Import checklist templates from CSV
 * @param {string} tenantId - Tenant ID
 * @param {Array} csvData - Parsed CSV data
 * @returns {Promise<Array>} Imported templates
 */
export async function importChecklistTemplatesFromCSV(tenantId, csvData) {
  const templatesRef = collection(db, 'tenants', tenantId, 'checklist_templates');
  const importedTemplates = [];
  
  for (const row of csvData) {
    const templateData = {
      name: row.name || 'Untitled Template',
      description: row.description || '',
      serviceLevel: row.serviceLevel || 'standard',
      propertyType: row.propertyType || 'residential',
      items: row.items ? row.items.split('|').map(item => item.trim()) : [],
      isDefault: row.isDefault === 'true',
      status: 'active',
      createdAt: new Date().toISOString()
    };
    
    const docRef = await addDoc(templatesRef, templateData);
    importedTemplates.push({ id: docRef.id, ...templateData });
  }
  
  return importedTemplates;
}

/**
 * Import checklist template from JSON
 * @param {string} tenantId - Tenant ID
 * @param {Object} jsonData - JSON data
 * @returns {Promise<Object>} Imported template
 */
export async function importChecklistTemplateFromJSON(tenantId, jsonData) {
  const templatesRef = collection(db, 'tenants', tenantId, 'checklist_templates');
  
  const templateData = {
    name: jsonData.name || 'Untitled Template',
    description: jsonData.description || '',
    serviceLevel: jsonData.serviceLevel || 'standard',
    propertyType: jsonData.propertyType || 'residential',
    items: jsonData.items || [],
    isDefault: jsonData.isDefault || false,
    status: 'active',
    createdAt: new Date().toISOString()
  };
  
  const docRef = await addDoc(templatesRef, templateData);
  return { id: docRef.id, ...templateData };
}

/**
 * Get all checklist templates for a tenant
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>} Checklist templates
 */
export async function getChecklistTemplates(tenantId) {
  const templatesRef = collection(db, 'tenants', tenantId, 'checklist_templates');
  const querySnap = await getDocs(templatesRef);
  
  return querySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get checklist template by service level
 * @param {string} tenantId - Tenant ID
 * @param {string} serviceLevel - Service level
 * @returns {Promise<Array>} Checklist templates
 */
export async function getChecklistTemplatesByServiceLevel(tenantId, serviceLevel) {
  const templatesRef = collection(db, 'tenants', tenantId, 'checklist_templates');
  const q = query(templatesRef, where('serviceLevel', '==', serviceLevel));
  const querySnap = await getDocs(q);
  
  return querySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get checklist template by property type
 * @param {string} tenantId - Tenant ID
 * @param {string} propertyType - Property type
 * @returns {Promise<Array>} Checklist templates
 */
export async function getChecklistTemplatesByPropertyType(tenantId, propertyType) {
  const templatesRef = collection(db, 'tenants', tenantId, 'checklist_templates');
  const q = query(templatesRef, where('propertyType', '==', propertyType));
  const querySnap = await getDocs(q);
  
  return querySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get default checklist template
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Default template
 */
export async function getDefaultChecklistTemplate(tenantId) {
  const templatesRef = collection(db, 'tenants', tenantId, 'checklist_templates');
  const q = query(templatesRef, where('isDefault', '==', true));
  const querySnap = await getDocs(q);
  
  if (querySnap.empty) {
    return null;
  }
  
  const doc = querySnap.docs[0];
  return { id: doc.id, ...doc.data() };
}

/**
 * Update checklist template
 * @param {string} tenantId - Tenant ID
 * @param {string} templateId - Template ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<void>}
 */
export async function updateChecklistTemplate(tenantId, templateId, updates) {
  const templateRef = doc(db, 'tenants', tenantId, 'checklist_templates', templateId);
  await updateDoc(templateRef, {
    ...updates,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Delete checklist template
 * @param {string} tenantId - Tenant ID
 * @param {string} templateId - Template ID
 * @returns {Promise<void>}
 */
export async function deleteChecklistTemplate(tenantId, templateId) {
  const templateRef = doc(db, 'tenants', tenantId, 'checklist_templates', templateId);
  await updateDoc(templateRef, {
    status: 'deleted',
    deletedAt: new Date().toISOString()
  });
}

/**
 * Set default checklist template
 * @param {string} tenantId - Tenant ID
 * @param {string} templateId - Template ID
 * @returns {Promise<void>}
 */
export async function setDefaultChecklistTemplate(tenantId, templateId) {
  const templatesRef = collection(db, 'tenants', tenantId, 'checklist_templates');
  const querySnap = await getDocs(templatesRef);
  
  // Remove default from all templates
  const batch = querySnap.docs.map(doc => {
    const docRef = doc(db, 'tenants', tenantId, 'checklist_templates', doc.id);
    return updateDoc(docRef, { isDefault: false });
  });
  
  await Promise.all(batch);
  
  // Set new default
  const templateRef = doc(db, 'tenants', tenantId, 'checklist_templates', templateId);
  await updateDoc(templateRef, {
    isDefault: true,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Duplicate checklist template
 * @param {string} tenantId - Tenant ID
 * @param {string} templateId - Template ID
 * @param {string} newName - New template name
 * @returns {Promise<Object>} Duplicated template
 */
export async function duplicateChecklistTemplate(tenantId, templateId, newName) {
  const templatesRef = collection(db, 'tenants', tenantId, 'checklist_templates');
  const q = query(templatesRef, where('__name__', '==', templateId));
  const querySnap = await getDocs(q);
  
  if (querySnap.empty) {
    throw new Error('Template not found');
  }
  
  const original = querySnap.docs[0].data();
  
  const duplicateData = {
    name: newName || `${original.name} (Copy)`,
    description: original.description,
    serviceLevel: original.serviceLevel,
    propertyType: original.propertyType,
    items: [...original.items],
    isDefault: false,
    status: 'active',
    createdAt: new Date().toISOString()
  };
  
  const docRef = await addDoc(templatesRef, duplicateData);
  return { id: docRef.id, ...duplicateData };
}

/**
 * Export checklist template
 * @param {string} tenantId - Tenant ID
 * @param {string} templateId - Template ID
 * @returns {Promise<Object>} Template data
 */
export async function exportChecklistTemplate(tenantId, templateId) {
  const templatesRef = collection(db, 'tenants', tenantId, 'checklist_templates');
  const q = query(templatesRef, where('__name__', '==', templateId));
  const querySnap = await getDocs(q);
  
  if (querySnap.empty) {
    return null;
  }
  
  return querySnap.docs[0].data();
}

/**
 * Export all checklist templates
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>} All templates
 */
export async function exportAllChecklistTemplates(tenantId) {
  const templatesRef = collection(db, 'tenants', tenantId, 'checklist_templates');
  const querySnap = await getDocs(templatesRef);
  
  return querySnap.docs.map(doc => doc.data());
}
