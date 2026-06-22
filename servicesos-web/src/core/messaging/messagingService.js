/**
 * Core Messaging Service
 * 
 * This service handles all messaging-related business logic
 * that is shared across all service verticals.
 * 
 * Core features should never depend on vertical-specific logic.
 */

import { collection, getDocs, addDoc, updateDoc, doc, getDoc, query, where, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { addSchemaVersion } from '../../shared/schemas/schemaVersioning';
import { successResponse, errorResponse } from '../../shared/api/apiResponseStandard';
import { logError, ERROR_CODES, SEVERITY } from '../../shared/logging/errorLoggingStandard';

const COLLECTION_NAME = 'messages';
const SCHEMA_TYPE = 'MESSAGE';

/**
 * Get all messages for a tenant
 * @param {string} tenantId - The tenant ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getMessages(tenantId) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }

    const messagesRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const q = query(messagesRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    
    const messagesData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return successResponse(messagesData);
  } catch (error) {
    logError({
      message: 'Failed to load messages',
      module: 'core',
      feature: 'messaging',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load messages', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get messages by customer ID
 * @param {string} tenantId - The tenant ID
 * @param {string} customerId - The customer ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getMessagesByCustomer(tenantId, customerId) {
  try {
    if (!tenantId || !customerId) {
      return errorResponse('Tenant ID and Customer ID are required', 'VALIDATION_ERROR');
    }

    const messagesRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const q = query(messagesRef, where('customerId', '==', customerId), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    
    const messagesData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return successResponse(messagesData);
  } catch (error) {
    logError({
      message: 'Failed to load messages by customer',
      module: 'core',
      feature: 'messaging',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load messages by customer', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get messages by job ID
 * @param {string} tenantId - The tenant ID
 * @param {string} jobId - The job ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getMessagesByJob(tenantId, jobId) {
  try {
    if (!tenantId || !jobId) {
      return errorResponse('Tenant ID and Job ID are required', 'VALIDATION_ERROR');
    }

    const messagesRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const q = query(messagesRef, where('jobId', '==', jobId), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    
    const messagesData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return successResponse(messagesData);
  } catch (error) {
    logError({
      message: 'Failed to load messages by job',
      module: 'core',
      feature: 'messaging',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load messages by job', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get a single message by ID
 * @param {string} tenantId - The tenant ID
 * @param {string} messageId - The message ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getMessageById(tenantId, messageId) {
  try {
    if (!tenantId || !messageId) {
      return errorResponse('Tenant ID and Message ID are required', 'VALIDATION_ERROR');
    }

    const messageRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, messageId);
    const snapshot = await getDoc(messageRef);
    
    if (!snapshot.exists()) {
      return errorResponse('Message not found', ERROR_CODES.NOT_FOUND);
    }

    return successResponse({ id: snapshot.id, ...snapshot.data() });
  } catch (error) {
    logError({
      message: 'Failed to load message',
      module: 'core',
      feature: 'messaging',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load message', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Create a new message
 * @param {string} tenantId - The tenant ID
 * @param {object} messageData - The message data
 * @returns {Promise<object>} - Standardized API response
 */
export async function createMessage(tenantId, messageData) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }

    // Add schema version
    const messageWithVersion = addSchemaVersion(messageData, SCHEMA_TYPE);

    const messagesRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const docRef = await addDoc(messagesRef, {
      ...messageWithVersion,
      status: 'sent',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: docRef.id, ...messageWithVersion }, 'Message sent successfully');
  } catch (error) {
    logError({
      message: 'Failed to create message',
      module: 'core',
      feature: 'messaging',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to create message', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Mark message as read
 * @param {string} tenantId - The tenant ID
 * @param {string} messageId - The message ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function markMessageAsRead(tenantId, messageId) {
  try {
    if (!tenantId || !messageId) {
      return errorResponse('Tenant ID and Message ID are required', 'VALIDATION_ERROR');
    }

    const messageRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, messageId);
    await updateDoc(messageRef, {
      status: 'read',
      readAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: messageId, status: 'read' }, 'Message marked as read');
  } catch (error) {
    logError({
      message: 'Failed to mark message as read',
      module: 'core',
      feature: 'messaging',
      severity: SEVERITY.MEDIUM,
      tenantId,
      error
    });
    return errorResponse('Failed to mark message as read', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get unread message count
 * @param {string} tenantId - The tenant ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getUnreadCount(tenantId) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }

    const messagesRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const q = query(messagesRef, where('status', '==', 'sent'));
    const snapshot = await getDocs(q);
    
    return successResponse({ count: snapshot.size });
  } catch (error) {
    logError({
      message: 'Failed to get unread count',
      module: 'core',
      feature: 'messaging',
      severity: SEVERITY.MEDIUM,
      tenantId,
      error
    });
    return errorResponse('Failed to get unread count', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}
