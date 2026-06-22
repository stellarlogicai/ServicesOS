// src/shared/audit/auditTrailService.js
/**
 * Audit Trail Service
 * Tracks who changed what when for compliance and accountability
 * Reusable across all SaaS platforms
 */

import { collection, addDoc, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';

// Action type constants
export const AUDIT_ACTION = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  VIEW: 'view',
  EXPORT: 'export',
  LOGIN: 'login',
  LOGOUT: 'logout',
  APPROVE: 'approve',
  DENY: 'deny',
  ASSIGN: 'assign',
  COMPLETE: 'complete',
  CANCEL: 'cancel'
};

/**
 * Log audit event
 * @param {string} tenantId - Tenant ID
 * @param {object} auditData - Audit data
 * @returns {Promise<DocumentReference>}
 */
export async function logAuditEvent(tenantId, auditData) {
  const auditRef = collection(db, 'tenants', tenantId, 'audit_trail');
  
  const data = {
    userId: auditData.userId || null,
    userName: auditData.userName || '',
    userEmail: auditData.userEmail || '',
    
    // Action details
    action: auditData.action || AUDIT_ACTION.UPDATE,
    entityType: auditData.entityType || '',
    entityId: auditData.entityId || null,
    entityName: auditData.entityName || '',
    
    // Changes
    changes: auditData.changes || {},
    previousValues: auditData.previousValues || {},
    newValues: auditData.newValues || {},
    
    // Context
    ipAddress: auditData.ipAddress || null,
    userAgent: auditData.userAgent || null,
    description: auditData.description || '',
    
    // Related entities
    relatedEntityId: auditData.relatedEntityId || null,
    relatedEntityType: auditData.relatedEntityType || '',
    
    // Timestamps
    timestamp: new Date().toISOString(),
    createdAt: new Date().toISOString()
  };
  
  return await addDoc(auditRef, data);
}

/**
 * Get audit trail for entity
 * @param {string} tenantId - Tenant ID
 * @param {string} entityType - Entity type
 * @param {string} entityId - Entity ID
 * @returns {Promise<Array>}
 */
export async function getAuditTrailForEntity(tenantId, entityType, entityId) {
  const auditRef = collection(db, 'tenants', tenantId, 'audit_trail');
  const q = query(
    auditRef,
    where('entityType', '==', entityType),
    where('entityId', '==', entityId),
    orderBy('timestamp', 'desc')
  );
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get audit trail for user
 * @param {string} tenantId - Tenant ID
 * @param {string} userId - User ID
 * @returns {Promise<Array>}
 */
export async function getAuditTrailForUser(tenantId, userId) {
  const auditRef = collection(db, 'tenants', tenantId, 'audit_trail');
  const q = query(
    auditRef,
    where('userId', '==', userId),
    orderBy('timestamp', 'desc')
  );
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get audit trail by action type
 * @param {string} tenantId - Tenant ID
 * @param {string} action - Action type
 * @returns {Promise<Array>}
 */
export async function getAuditTrailByAction(tenantId, action) {
  const auditRef = collection(db, 'tenants', tenantId, 'audit_trail');
  const q = query(
    auditRef,
    where('action', '==', action),
    orderBy('timestamp', 'desc')
  );
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get all audit trail for tenant
 * @param {string} tenantId - Tenant ID
 * @param {string} startDate - Optional start date (YYYY-MM-DD)
 * @param {string} endDate - Optional end date (YYYY-MM-DD)
 * @returns {Promise<Array>}
 */
export async function getAllAuditTrail(tenantId, startDate = null, endDate = null) {
  const auditRef = collection(db, 'tenants', tenantId, 'audit_trail');
  let q;
  
  if (startDate && endDate) {
    q = query(
      auditRef,
      where('timestamp', '>=', startDate),
      where('timestamp', '<=', endDate),
      orderBy('timestamp', 'desc')
    );
  } else {
    q = query(auditRef, orderBy('timestamp', 'desc'));
  }
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get recent audit events
 * @param {string} tenantId - Tenant ID
 * @param {number} limit - Number of events to return
 * @returns {Promise<Array>}
 */
export async function getRecentAuditEvents(tenantId, limit = 100) {
  const auditRef = collection(db, 'tenants', tenantId, 'audit_trail');
  const q = query(auditRef, orderBy('timestamp', 'desc'));
  const snapshot = await getDocs(q);
  
  const allEvents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  return allEvents.slice(0, limit);
}

/**
 * Get audit analytics
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>}
 */
export async function getAuditAnalytics(tenantId) {
  const auditRef = collection(db, 'tenants', tenantId, 'audit_trail');
  const q = query(auditRef, orderBy('timestamp', 'desc'));
  const snapshot = await getDocs(q);
  
  const events = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  let total = events.length;
  
  // Count by action
  const actionCounts = {};
  for (const event of events) {
    actionCounts[event.action] = (actionCounts[event.action] || 0) + 1;
  }
  
  // Count by entity type
  const entityTypeCounts = {};
  for (const event of events) {
    entityTypeCounts[event.entityType] = (entityTypeCounts[event.entityType] || 0) + 1;
  }
  
  // Count by user
  const userCounts = {};
  for (const event of events) {
    if (event.userId) {
      userCounts[event.userId] = (userCounts[event.userId] || 0) + 1;
    }
  }
  
  // Top users
  const topUsers = Object.entries(userCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([userId, count]) => ({ userId, count }));
  
  return {
    total,
    actionCounts,
    entityTypeCounts,
    topUsers
  };
}

/**
 * Export audit trail as CSV
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<string>} CSV content
 */
export async function exportAuditTrailCSV(tenantId) {
  const auditRef = collection(db, 'tenants', tenantId, 'audit_trail');
  const q = query(auditRef, orderBy('timestamp', 'desc'));
  const snapshot = await getDocs(q);
  
  const events = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  let csv = 'Timestamp,User,Email,Action,Entity Type,Entity ID,Entity Name,Description\n';
  
  for (const event of events) {
    csv += `"${event.timestamp}","${event.userName}","${event.userEmail}","${event.action}","${event.entityType}","${event.entityId || ''}","${event.entityName}","${event.description.replace(/"/g, '""')}"\n`;
  }
  
  return csv;
}

/**
 * Delete old audit logs (cleanup)
 * @param {string} tenantId - Tenant ID
 * @param {number} daysToKeep - Number of days to keep
 * @returns {Promise<number>} Number of deleted records
 */
export async function deleteOldAuditLogs(tenantId, daysToKeep = 90) {
  const auditRef = collection(db, 'tenants', tenantId, 'audit_trail');
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  const cutoffISO = cutoffDate.toISOString();
  
  const q = query(auditRef, where('timestamp', '<', cutoffISO));
  const snapshot = await getDocs(q);
  
  // In production, this would use batch delete
  // For now, just return the count
  return snapshot.size;
}
