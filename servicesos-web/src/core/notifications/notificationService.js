/**
 * Core Notification Service
 * 
 * This service handles all notification-related business logic
 * that is shared across all service verticals.
 * 
 * Core features should never depend on vertical-specific logic.
 */

import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc, query, where, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { addSchemaVersion } from '../../shared/schemas/schemaVersioning';
import { successResponse, errorResponse } from '../../shared/api/apiResponseStandard';
import { logError, ERROR_CODES, SEVERITY } from '../../shared/logging/errorLoggingStandard';

const COLLECTION_NAME = 'notifications';
const SCHEMA_TYPE = 'NOTIFICATION';

/**
 * Get all notifications for a tenant
 * @param {string} tenantId - The tenant ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getNotifications(tenantId) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }

    const notificationsRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const q = query(notificationsRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    
    const notificationsData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return successResponse(notificationsData);
  } catch (error) {
    logError({
      message: 'Failed to load notifications',
      module: 'core',
      feature: 'notifications',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load notifications', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get notifications by user ID
 * @param {string} tenantId - The tenant ID
 * @param {string} userId - The user ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getNotificationsByUser(tenantId, userId) {
  try {
    if (!tenantId || !userId) {
      return errorResponse('Tenant ID and User ID are required', 'VALIDATION_ERROR');
    }

    const notificationsRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const q = query(notificationsRef, where('userId', '==', userId), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    
    const notificationsData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return successResponse(notificationsData);
  } catch (error) {
    logError({
      message: 'Failed to load notifications by user',
      module: 'core',
      feature: 'notifications',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load notifications by user', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get unread notifications for a user
 * @param {string} tenantId - The tenant ID
 * @param {string} userId - The user ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getUnreadNotifications(tenantId, userId) {
  try {
    if (!tenantId || !userId) {
      return errorResponse('Tenant ID and User ID are required', 'VALIDATION_ERROR');
    }

    const notificationsRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const q = query(
      notificationsRef, 
      where('userId', '==', userId), 
      where('read', '==', false), 
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    
    const notificationsData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return successResponse(notificationsData);
  } catch (error) {
    logError({
      message: 'Failed to load unread notifications',
      module: 'core',
      feature: 'notifications',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load unread notifications', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get a single notification by ID
 * @param {string} tenantId - The tenant ID
 * @param {string} notificationId - The notification ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getNotificationById(tenantId, notificationId) {
  try {
    if (!tenantId || !notificationId) {
      return errorResponse('Tenant ID and Notification ID are required', 'VALIDATION_ERROR');
    }

    const notificationRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, notificationId);
    const snapshot = await getDoc(notificationRef);
    
    if (!snapshot.exists()) {
      return errorResponse('Notification not found', ERROR_CODES.NOT_FOUND);
    }

    return successResponse({ id: snapshot.id, ...snapshot.data() });
  } catch (error) {
    logError({
      message: 'Failed to load notification',
      module: 'core',
      feature: 'notifications',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load notification', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Create a new notification
 * @param {string} tenantId - The tenant ID
 * @param {object} notificationData - The notification data
 * @returns {Promise<object>} - Standardized API response
 */
export async function createNotification(tenantId, notificationData) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }

    // Add schema version
    const notificationWithVersion = addSchemaVersion(notificationData, SCHEMA_TYPE);

    const notificationsRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const docRef = await addDoc(notificationsRef, {
      ...notificationWithVersion,
      read: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: docRef.id, ...notificationWithVersion }, 'Notification created successfully');
  } catch (error) {
    logError({
      message: 'Failed to create notification',
      module: 'core',
      feature: 'notifications',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to create notification', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Mark notification as read
 * @param {string} tenantId - The tenant ID
 * @param {string} notificationId - The notification ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function markAsRead(tenantId, notificationId) {
  try {
    if (!tenantId || !notificationId) {
      return errorResponse('Tenant ID and Notification ID are required', 'VALIDATION_ERROR');
    }

    const notificationRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, notificationId);
    await updateDoc(notificationRef, {
      read: true,
      readAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: notificationId, read: true }, 'Notification marked as read');
  } catch (error) {
    logError({
      message: 'Failed to mark notification as read',
      module: 'core',
      feature: 'notifications',
      severity: SEVERITY.MEDIUM,
      tenantId,
      error
    });
    return errorResponse('Failed to mark notification as read', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Mark all notifications as read for a user
 * @param {string} tenantId - The tenant ID
 * @param {string} userId - The user ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function markAllAsRead(tenantId, userId) {
  try {
    if (!tenantId || !userId) {
      return errorResponse('Tenant ID and User ID are required', 'VALIDATION_ERROR');
    }

    const notificationsRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const q = query(notificationsRef, where('userId', '==', userId), where('read', '==', false));
    const snapshot = await getDocs(q);
    
    const updatePromises = snapshot.docs.map(doc => 
      updateDoc(doc.ref, {
        read: true,
        readAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
    );
    
    await Promise.all(updatePromises);

    return successResponse({ count: snapshot.size }, 'All notifications marked as read');
  } catch (error) {
    logError({
      message: 'Failed to mark all notifications as read',
      module: 'core',
      feature: 'notifications',
      severity: SEVERITY.MEDIUM,
      tenantId,
      error
    });
    return errorResponse('Failed to mark all notifications as read', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Delete a notification
 * @param {string} tenantId - The tenant ID
 * @param {string} notificationId - The notification ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function deleteNotification(tenantId, notificationId) {
  try {
    if (!tenantId || !notificationId) {
      return errorResponse('Tenant ID and Notification ID are required', 'VALIDATION_ERROR');
    }

    const notificationRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, notificationId);
    await deleteDoc(notificationRef);

    return successResponse({ id: notificationId }, 'Notification deleted successfully');
  } catch (error) {
    logError({
      message: 'Failed to delete notification',
      module: 'core',
      feature: 'notifications',
      severity: SEVERITY.MEDIUM,
      tenantId,
      error
    });
    return errorResponse('Failed to delete notification', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get unread notification count for a user
 * @param {string} tenantId - The tenant ID
 * @param {string} userId - The user ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getUnreadCount(tenantId, userId) {
  try {
    if (!tenantId || !userId) {
      return errorResponse('Tenant ID and User ID are required', 'VALIDATION_ERROR');
    }

    const notificationsRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const q = query(
      notificationsRef, 
      where('userId', '==', userId), 
      where('read', '==', false)
    );
    const snapshot = await getDocs(q);
    
    return successResponse({ count: snapshot.size });
  } catch (error) {
    logError({
      message: 'Failed to get unread count',
      module: 'core',
      feature: 'notifications',
      severity: SEVERITY.MEDIUM,
      tenantId,
      error
    });
    return errorResponse('Failed to get unread count', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}
