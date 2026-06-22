// src/services/recurringService.js
/**
 * Recurring Service Management
 * Handles creation, management, and job generation for recurring cleaning services
 */

import { collection, doc, addDoc, updateDoc, deleteDoc, getDoc, getDocs, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

// Recurring schedule types
export const SCHEDULE_TYPES = {
  WEEKLY: 'weekly',
  BIWEEKLY: 'biweekly',
  MONTHLY: 'monthly',
  EVERY_X_WEEKS: 'every_x_weeks',
  CUSTOM: 'custom'
};

/**
 * Create a new recurring service
 * @param {string} tenantId - Tenant ID
 * @param {object} recurringData - Recurring service data
 * @returns {Promise<DocumentReference>}
 */
export async function createRecurringService(tenantId, recurringData) {
  const recurringRef = collection(db, 'tenants', tenantId, 'recurring_services');
  
  const data = {
    customerId: recurringData.customerId,
    customerName: recurringData.customerName,
    customerAddress: recurringData.customerAddress,
    customerPhone: recurringData.customerPhone,
    customerEmail: recurringData.customerEmail,
    
    // Schedule configuration
    scheduleType: recurringData.scheduleType || SCHEDULE_TYPES.WEEKLY,
    intervalWeeks: recurringData.intervalWeeks || 1, // For "every X weeks"
    dayOfWeek: recurringData.dayOfWeek, // 0-6 (Sunday-Saturday)
    preferredTime: recurringData.preferredTime || '09:00',
    estimatedHours: recurringData.estimatedHours || 2,
    price: recurringData.price || 0,
    
    // Service details
    serviceType: recurringData.serviceType || 'standard',
    notes: recurringData.notes || '',
    
    // Status
    status: 'active',
    startDate: recurringData.startDate || new Date().toISOString().split('T')[0],
    nextServiceDate: calculateNextServiceDate(
      recurringData.scheduleType || SCHEDULE_TYPES.WEEKLY,
      recurringData.dayOfWeek,
      recurringData.intervalWeeks || 1,
      recurringData.startDate || new Date().toISOString().split('T')[0]
    ),
    
    // Metadata
    lastJobId: null,
    totalJobsCompleted: 0,
    totalRevenue: 0,
    
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  return await addDoc(recurringRef, data);
}

/**
 * Update a recurring service
 * @param {string} tenantId - Tenant ID
 * @param {string} recurringId - Recurring service ID
 * @param {object} updates - Fields to update
 * @returns {Promise<void>}
 */
export async function updateRecurringService(tenantId, recurringId, updates) {
  const recurringRef = doc(db, 'tenants', tenantId, 'recurring_services', recurringId);
  await updateDoc(recurringRef, {
    ...updates,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Delete a recurring service
 * @param {string} tenantId - Tenant ID
 * @param {string} recurringId - Recurring service ID
 * @returns {Promise<void>}
 */
export async function deleteRecurringService(tenantId, recurringId) {
  const recurringRef = doc(db, 'tenants', tenantId, 'recurring_services', recurringId);
  await deleteDoc(recurringRef);
}

/**
 * Get a recurring service by ID
 * @param {string} tenantId - Tenant ID
 * @param {string} recurringId - Recurring service ID
 * @returns {Promise<object|null>}
 */
export async function getRecurringService(tenantId, recurringId) {
  const recurringRef = doc(db, 'tenants', tenantId, 'recurring_services', recurringId);
  const docSnap = await getDoc(recurringRef);
  
  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() };
  }
  return null;
}

/**
 * Get all recurring services for a tenant
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>}
 */
export async function getRecurringServices(tenantId) {
  const recurringRef = collection(db, 'tenants', tenantId, 'recurring_services');
  const q = query(recurringRef, orderBy('customerName'));
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

/**
 * Get active recurring services for a tenant
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>}
 */
export async function getActiveRecurringServices(tenantId) {
  const recurringRef = collection(db, 'tenants', tenantId, 'recurring_services');
  const q = query(
    recurringRef,
    where('status', '==', 'active'),
    orderBy('nextServiceDate')
  );
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

/**
 * Calculate the next service date based on schedule type
 * @param {string} scheduleType - Schedule type
 * @param {number} dayOfWeek - Day of week (0-6)
 * @param {number} intervalWeeks - Interval in weeks
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @returns {string} Next service date (YYYY-MM-DD)
 */
export function calculateNextServiceDate(scheduleType, dayOfWeek, intervalWeeks, startDate) {
  const start = new Date(startDate);
  const now = new Date();
  
  // If start date is in the future, use that
  if (start > now) {
    return startDate;
  }
  
  let nextDate = new Date(now);
  
  switch (scheduleType) {
    case SCHEDULE_TYPES.WEEKLY: {
      // Find next occurrence of the specified day
      const currentDay = now.getDay();
      const daysUntil = (dayOfWeek - currentDay + 7) % 7;
      nextDate.setDate(now.getDate() + (daysUntil === 0 ? 7 : daysUntil));
      break;
    }
      
    case SCHEDULE_TYPES.BIWEEKLY: {
      // Every 2 weeks on the specified day
      const currentDayBi = now.getDay();
      const daysUntilBi = (dayOfWeek - currentDayBi + 7) % 7;
      nextDate.setDate(now.getDate() + (daysUntilBi === 0 ? 14 : daysUntilBi + 7));
      break;
    }
      
    case SCHEDULE_TYPES.MONTHLY: {
      // Same day of month
      nextDate.setMonth(now.getMonth() + 1);
      nextDate.setDate(start.getDate());
      break;
    }
      
    case SCHEDULE_TYPES.EVERY_X_WEEKS: {
      // Every X weeks on the specified day
      const currentDayX = now.getDay();
      const daysUntilX = (dayOfWeek - currentDayX + 7) % 7;
      const weeksToAdd = intervalWeeks || 1;
      nextDate.setDate(now.getDate() + (daysUntilX === 0 ? weeksToAdd * 7 : daysUntilX + (weeksToAdd - 1) * 7));
      break;
    }
      
    case SCHEDULE_TYPES.CUSTOM:
      // For custom schedules, next date should be set manually
      return startDate;
      
    default:
      nextDate.setDate(now.getDate() + 7);
  }
  
  return nextDate.toISOString().split('T')[0];
}

/**
 * Generate a job from a recurring service
 * @param {string} tenantId - Tenant ID
 * @param {object} recurringService - Recurring service object
 * @returns {Promise<DocumentReference>}
 */
export async function generateJobFromRecurring(tenantId, recurringService) {
  const bookingsRef = collection(db, 'tenants', tenantId, 'bookings');
  
  const jobData = {
    customerId: recurringService.customerId,
    customerName: recurringService.customerName,
    customerAddress: recurringService.customerAddress,
    customerPhone: recurringService.customerPhone,
    customerEmail: recurringService.customerEmail,
    
    date: recurringService.nextServiceDate,
    startTime: recurringService.preferredTime,
    estimatedHours: recurringService.estimatedHours,
    price: recurringService.price,
    
    serviceType: recurringService.serviceType,
    notes: recurringService.notes,
    
    // Link to recurring service
    recurringServiceId: recurringService.id,
    
    status: 'scheduled',
    createdAt: new Date().toISOString()
  };
  
  const jobRef = await addDoc(bookingsRef, jobData);
  
  // Update recurring service with last job info and calculate next date
  const nextDate = calculateNextServiceDate(
    recurringService.scheduleType,
    recurringService.dayOfWeek,
    recurringService.intervalWeeks,
    recurringService.nextServiceDate
  );
  
  await updateRecurringService(tenantId, recurringService.id, {
    lastJobId: jobRef.id,
    nextServiceDate: nextDate,
    totalJobsCompleted: (recurringService.totalJobsCompleted || 0) + 1,
    totalRevenue: (recurringService.totalRevenue || 0) + (recurringService.price || 0)
  });
  
  return jobRef;
}

/**
 * Generate jobs for all due recurring services
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<number>} Number of jobs generated
 */
export async function generateDueRecurringJobs(tenantId) {
  const today = new Date().toISOString().split('T')[0];
  const activeServices = await getActiveRecurringServices(tenantId);
  
  let jobsGenerated = 0;
  
  for (const service of activeServices) {
    if (service.nextServiceDate <= today) {
      await generateJobFromRecurring(tenantId, service);
      jobsGenerated++;
    }
  }
  
  return jobsGenerated;
}

/**
 * Pause a recurring service
 * @param {string} tenantId - Tenant ID
 * @param {string} recurringId - Recurring service ID
 * @returns {Promise<void>}
 */
export async function pauseRecurringService(tenantId, recurringId) {
  await updateRecurringService(tenantId, recurringId, {
    status: 'paused'
  });
}

/**
 * Resume a recurring service
 * @param {string} tenantId - Tenant ID
 * @param {string} recurringId - Recurring service ID
 * @returns {Promise<void>}
 */
export async function resumeRecurringService(tenantId, recurringId) {
  const service = await getRecurringService(tenantId, recurringId);
  if (!service) return;
  
  const nextDate = calculateNextServiceDate(
    service.scheduleType,
    service.dayOfWeek,
    service.intervalWeeks,
    new Date().toISOString().split('T')[0]
  );
  
  await updateRecurringService(tenantId, recurringId, {
    status: 'active',
    nextServiceDate: nextDate
  });
}

/**
 * Subscribe to recurring services changes
 * @param {string} tenantId - Tenant ID
 * @param {function} callback - Callback function
 * @returns {function} Unsubscribe function
 */
export function subscribeToRecurringServices(tenantId, callback) {
  const recurringRef = collection(db, 'tenants', tenantId, 'recurring_services');
  const q = query(recurringRef, orderBy('customerName'));
  
  return onSnapshot(q, (snapshot) => {
    const services = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    callback(services);
  });
}

/**
 * Get recurring services for a specific customer
 * @param {string} tenantId - Tenant ID
 * @param {string} customerId - Customer ID
 * @returns {Promise<Array>}
 */
export async function getCustomerRecurringServices(tenantId, customerId) {
  const recurringRef = collection(db, 'tenants', tenantId, 'recurring_services');
  const q = query(
    recurringRef,
    where('customerId', '==', customerId),
    orderBy('nextServiceDate')
  );
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}
