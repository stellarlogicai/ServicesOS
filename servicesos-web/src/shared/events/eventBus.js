/**
 * Event Bus System
 * 
 * Rules from FutureProofing.md:
 * - Event-driven updates prevent feature dependencies
 * - Instead of direct updates, fire events
 * - Subscribers listen for events they care about
 * - Nobody knows who else exists
 * 
 * Example:
 * Instead of:
 *   Customer Saves → Dashboard Updates → Notification Updates
 * 
 * Use:
 *   Customer Saves → CUSTOMER_CREATED event
 *   Dashboard listens → Notification listens → AI listens
 */

class EventBus {
  constructor() {
    this.events = {};
  }

  /**
   * Subscribe to an event
   * @param {string} eventName - The event name
   * @param {Function} callback - The callback function
   * @returns {Function} - Unsubscribe function
   */
  on(eventName, callback) {
    if (!this.events[eventName]) {
      this.events[eventName] = [];
    }
    
    this.events[eventName].push(callback);
    
    // Return unsubscribe function
    return () => {
      this.off(eventName, callback);
    };
  }

  /**
   * Unsubscribe from an event
   * @param {string} eventName - The event name
   * @param {Function} callback - The callback function
   */
  off(eventName, callback) {
    if (!this.events[eventName]) {
      return;
    }
    
    this.events[eventName] = this.events[eventName].filter(cb => cb !== callback);
  }

  /**
   * Emit an event
   * @param {string} eventName - The event name
   * @param {*} data - The event data
   */
  emit(eventName, data) {
    if (!this.events[eventName]) {
      return;
    }
    
    this.events[eventName].forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in event handler for ${eventName}:`, error);
      }
    });
  }

  /**
   * Subscribe to an event once
   * @param {string} eventName - The event name
   * @param {Function} callback - The callback function
   * @returns {Function} - Unsubscribe function
   */
  once(eventName, callback) {
    const onceCallback = (data) => {
      callback(data);
      this.off(eventName, onceCallback);
    };
    
    return this.on(eventName, onceCallback);
  }

  /**
   * Get all event names
   * @returns {string[]} - Array of event names
   */
  getEventNames() {
    return Object.keys(this.events);
  }

  /**
   * Get subscriber count for an event
   * @param {string} eventName - The event name
   * @returns {number} - Number of subscribers
   */
  getSubscriberCount(eventName) {
    return this.events[eventName] ? this.events[eventName].length : 0;
  }

  /**
   * Clear all subscribers for an event
   * @param {string} eventName - The event name
   */
  clear(eventName) {
    if (eventName) {
      delete this.events[eventName];
    } else {
      this.events = {};
    }
  }
}

// Create singleton instance
const eventBus = new EventBus();

/**
 * Standard Event Names
 * Core business events that should be used consistently
 */
export const EVENTS = {
  // Customer Events
  CUSTOMER_CREATED: 'CUSTOMER_CREATED',
  CUSTOMER_UPDATED: 'CUSTOMER_UPDATED',
  CUSTOMER_DELETED: 'CUSTOMER_DELETED',
  
  // Lead Events
  LEAD_CREATED: 'LEAD_CREATED',
  LEAD_UPDATED: 'LEAD_UPDATED',
  LEAD_STATUS_CHANGED: 'LEAD_STATUS_CHANGED',
  LEAD_CONVERTED: 'LEAD_CONVERTED',
  
  // Estimate Events
  ESTIMATE_CREATED: 'ESTIMATE_CREATED',
  ESTIMATE_UPDATED: 'ESTIMATE_UPDATED',
  ESTIMATE_SENT: 'ESTIMATE_SENT',
  ESTIMATE_ACCEPTED: 'ESTIMATE_ACCEPTED',
  ESTIMATE_DECLINED: 'ESTIMATE_DECLINED',
  ESTIMATE_STATUS_CHANGED: 'ESTIMATE_STATUS_CHANGED',
  
  // Job Events
  JOB_CREATED: 'JOB_CREATED',
  JOB_UPDATED: 'JOB_UPDATED',
  JOB_ASSIGNED: 'JOB_ASSIGNED',
  JOB_STARTED: 'JOB_STARTED',
  JOB_COMPLETED: 'JOB_COMPLETED',
  JOB_CANCELLED: 'JOB_CANCELLED',
  JOB_STATUS_CHANGED: 'JOB_STATUS_CHANGED',
  
  // Employee Events
  EMPLOYEE_CREATED: 'EMPLOYEE_CREATED',
  EMPLOYEE_UPDATED: 'EMPLOYEE_UPDATED',
  EMPLOYEE_DELETED: 'EMPLOYEE_DELETED',
  EMPLOYEE_STATUS_CHANGED: 'EMPLOYEE_STATUS_CHANGED',
  
  // Payment Events
  PAYMENT_INITIATED: 'PAYMENT_INITIATED',
  PAYMENT_COMPLETED: 'PAYMENT_COMPLETED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  PAYMENT_REFUNDED: 'PAYMENT_REFUNDED',
  
  // Photo Events
  PHOTO_UPLOADED: 'PHOTO_UPLOADED',
  PHOTO_DELETED: 'PHOTO_DELETED',
  
  // Review Events
  REVIEW_REQUESTED: 'REVIEW_REQUESTED',
  REVIEW_SUBMITTED: 'REVIEW_SUBMITTED',
  
  // Training Events
  TRAINING_ASSIGNED: 'TRAINING_ASSIGNED',
  TRAINING_COMPLETED: 'TRAINING_COMPLETED',
  
  // Notification Events
  NOTIFICATION_CREATED: 'NOTIFICATION_CREATED',
  NOTIFICATION_READ: 'NOTIFICATION_READ',
  
  // Auth Events
  USER_LOGGED_IN: 'USER_LOGGED_IN',
  USER_LOGGED_OUT: 'USER_LOGGED_OUT',
  USER_CREATED: 'USER_CREATED',
  
  // Tenant Events
  TENANT_CREATED: 'TENANT_CREATED',
  TENANT_UPDATED: 'TENANT_UPDATED',
  TENANT_DELETED: 'TENANT_DELETED',
  
  // System Events
  ERROR_OCCURRED: 'ERROR_OCCURRED',
  SYSTEM_READY: 'SYSTEM_READY',
  DATA_MIGRATED: 'DATA_MIGRATED'
};

export default eventBus;
