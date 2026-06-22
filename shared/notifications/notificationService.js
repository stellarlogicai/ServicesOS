// src/shared/notifications/notificationService.js
/**
 * Notification Service
 * Manages email, SMS, and push notifications across all platforms
 * Reusable across multiple SaaS products
 */

import { collection, addDoc, query, where, orderBy, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';

const NOTIFICATIONS_COLLECTION = 'notifications';

// Notification types
export const NOTIFICATION_TYPE = {
  EMAIL: 'email',
  SMS: 'sms',
  PUSH: 'push',
  IN_APP: 'in_app'
};

// Notification categories
export const NOTIFICATION_CATEGORY = {
  BOOKING: 'booking',
  PAYMENT: 'payment',
  SYSTEM: 'system',
  MARKETING: 'marketing',
  ALERT: 'alert',
  REMINDER: 'reminder'
};

/**
 * Create notification
 * @param {string} tenantId - Tenant ID
 * @param {object} notificationData - Notification data
 * @returns {Promise<DocumentReference>}
 */
export async function createNotification(tenantId, notificationData) {
  const notificationRef = collection(db, 'tenants', tenantId, NOTIFICATIONS_COLLECTION);
  
  const data = {
    userId: notificationData.userId || null,
    type: notificationData.type || NOTIFICATION_TYPE.IN_APP,
    category: notificationData.category || NOTIFICATION_CATEGORY.SYSTEM,
    
    // Content
    title: notificationData.title || '',
    body: notificationData.body || '',
    data: notificationData.data || {},
    
    // Delivery status
    status: notificationData.status || 'pending',
    sentAt: notificationData.sentAt || null,
    deliveredAt: notificationData.deliveredAt || null,
    readAt: notificationData.readAt || null,
    
    // Retry logic
    retryCount: notificationData.retryCount || 0,
    maxRetries: notificationData.maxRetries || 3,
    
    // Timestamps
    createdAt: new Date().toISOString(),
    scheduledFor: notificationData.scheduledFor || null
  };
  
  return await addDoc(notificationRef, data);
}

/**
 * Send notification (creates and marks as sent)
 * @param {string} tenantId - Tenant ID
 * @param {object} notificationData - Notification data
 * @returns {Promise<DocumentReference>}
 */
export async function sendNotification(tenantId, notificationData) {
  const notificationRef = await createNotification(tenantId, {
    ...notificationData,
    status: 'sent',
    sentAt: new Date().toISOString()
  });
  
  // In production, this would trigger actual delivery
  // Email via Resend, SMS via Twilio, Push via FCM
  
  return notificationRef;
}

/**
 * Get notifications for user
 * @param {string} tenantId - Tenant ID
 * @param {string} userId - User ID
 * @returns {Promise<Array>}
 */
export async function getUserNotifications(tenantId, userId) {
  const notificationRef = collection(db, 'tenants', tenantId, NOTIFICATIONS_COLLECTION);
  const q = query(
    notificationRef,
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get unread notifications for user
 * @param {string} tenantId - Tenant ID
 * @param {string} userId - User ID
 * @returns {Promise<Array>}
 */
export async function getUnreadNotifications(tenantId, userId) {
  const notificationRef = collection(db, 'tenants', tenantId, NOTIFICATIONS_COLLECTION);
  const q = query(
    notificationRef,
    where('userId', '==', userId),
    where('readAt', '==', null),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Mark notification as read
 * @param {string} tenantId - Tenant ID
 * @param {string} notificationId - Notification ID
 * @returns {Promise<void>}
 */
export async function markNotificationAsRead(tenantId, notificationId) {
  const notificationRef = doc(db, 'tenants', tenantId, NOTIFICATIONS_COLLECTION, notificationId);
  await updateDoc(notificationRef, {
    readAt: new Date().toISOString()
  });
}

/**
 * Mark all notifications as read for user
 * @param {string} tenantId - Tenant ID
 * @param {string} userId - User ID
 * @returns {Promise<void>}
 */
export async function markAllAsRead(tenantId, userId) {
  const notifications = await getUnreadNotifications(tenantId, userId);
  
  const updates = notifications.map(notification => 
    markNotificationAsRead(tenantId, notification.id)
  );
  
  await Promise.all(updates);
}

/**
 * Delete notification
 * @param {string} tenantId - Tenant ID
 * @param {string} notificationId - Notification ID
 * @returns {Promise<void>}
 */
export async function deleteNotification(tenantId, notificationId) {
  // In production, this would be a real delete
  // For now, just mark as deleted
  const notificationRef = doc(db, 'tenants', tenantId, NOTIFICATIONS_COLLECTION, notificationId);
  await updateDoc(notificationRef, {
    deletedAt: new Date().toISOString()
  });
}

/**
 * Get notification stats for user
 * @param {string} tenantId - Tenant ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>}
 */
export async function getNotificationStats(tenantId, userId) {
  const allNotifications = await getUserNotifications(tenantId, userId);
  const unreadNotifications = await getUnreadNotifications(tenantId, userId);
  
  return {
    total: allNotifications.length,
    unread: unreadNotifications.length,
    read: allNotifications.length - unreadNotifications.length
  };
}

/**
 * Schedule notification for future delivery
 * @param {string} tenantId - Tenant ID
 * @param {object} notificationData - Notification data
 * @param {Date} scheduledFor - When to send
 * @returns {Promise<DocumentReference>}
 */
export async function scheduleNotification(tenantId, notificationData, scheduledFor) {
  return await createNotification(tenantId, {
    ...notificationData,
    scheduledFor: scheduledFor.toISOString(),
    status: 'scheduled'
  });
}

/**
 * Batch send notifications to multiple users
 * @param {string} tenantId - Tenant ID
 * @param {Array<string>} userIds - User IDs
 * @param {object} notificationData - Notification data
 * @returns {Promise<Array>}
 */
export async function batchSendNotifications(tenantId, userIds, notificationData) {
  const promises = userIds.map(userId => 
    sendNotification(tenantId, {
      ...notificationData,
      userId
    })
  );
  
  return await Promise.all(promises);
}
