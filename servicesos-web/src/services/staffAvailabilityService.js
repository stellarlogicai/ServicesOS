// src/services/staffAvailabilityService.js
/**
 * Staff Availability Service
 * Manages employee schedules, time off, and blocked time
 */

import { collection, doc, addDoc, updateDoc, getDoc, getDocs, query, where, orderBy, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';

// Availability status constants
export const AVAILABILITY_STATUS = {
  AVAILABLE: 'available',
  UNAVAILABLE: 'unavailable',
  TIME_OFF: 'time_off',
  BLOCKED: 'blocked'
};

// Time off type constants
export const TIME_OFF_TYPE = {
  VACATION: 'vacation',
  SICK: 'sick',
  PERSONAL: 'personal',
  HOLIDAY: 'holiday',
  OTHER: 'other'
};

/**
 * Create employee availability
 * @param {string} tenantId - Tenant ID
 * @param {object} availabilityData - Availability data
 * @returns {Promise<DocumentReference>}
 */
export async function createAvailability(tenantId, availabilityData) {
  const availabilityRef = collection(db, 'tenants', tenantId, 'staff_availability');
  
  const data = {
    employeeId: availabilityData.employeeId,
    employeeName: availabilityData.employeeName || '',
    
    // Regular schedule (weekly)
    regularSchedule: availabilityData.regularSchedule || {
      monday: { start: '08:00', end: '17:00', available: true },
      tuesday: { start: '08:00', end: '17:00', available: true },
      wednesday: { start: '08:00', end: '17:00', available: true },
      thursday: { start: '08:00', end: '17:00', available: true },
      friday: { start: '08:00', end: '17:00', available: true },
      saturday: { start: null, end: null, available: false },
      sunday: { start: null, end: null, available: false }
    },
    
    // Service area
    serviceArea: availabilityData.serviceArea || null,
    
    // Max daily hours
    maxDailyHours: availabilityData.maxDailyHours || 8,
    
    // Status
    status: availabilityData.status || AVAILABILITY_STATUS.AVAILABLE,
    
    // Notes
    notes: availabilityData.notes || '',
    
    // Timestamps
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  return await addDoc(availabilityRef, data);
}

/**
 * Update availability
 * @param {string} tenantId - Tenant ID
 * @param {string} availabilityId - Availability ID
 * @param {object} updates - Updates to apply
 * @returns {Promise<void>}
 */
export async function updateAvailability(tenantId, availabilityId, updates) {
  const availabilityRef = doc(db, 'tenants', tenantId, 'staff_availability', availabilityId);
  await updateDoc(availabilityRef, {
    ...updates,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Update regular schedule
 * @param {string} tenantId - Tenant ID
 * @param {string} availabilityId - Availability ID
 * @param {object} schedule - Schedule updates
 * @returns {Promise<void>}
 */
export async function updateRegularSchedule(tenantId, availabilityId, schedule) {
  const availabilityRef = doc(db, 'tenants', tenantId, 'staff_availability', availabilityId);
  await updateDoc(availabilityRef, {
    regularSchedule: schedule,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Get availability by ID
 * @param {string} tenantId - Tenant ID
 * @param {string} availabilityId - Availability ID
 * @returns {Promise<Object|null>}
 */
export async function getAvailability(tenantId, availabilityId) {
  const availabilityRef = doc(db, 'tenants', tenantId, 'staff_availability', availabilityId);
  const availabilitySnap = await getDoc(availabilityRef);
  
  if (!availabilitySnap.exists()) {
    return null;
  }
  
  return { id: availabilitySnap.id, ...availabilitySnap.data() };
}

/**
 * Get availability for employee
 * @param {string} tenantId - Tenant ID
 * @param {string} employeeId - Employee ID
 * @returns {Promise<Object|null>}
 */
export async function getEmployeeAvailability(tenantId, employeeId) {
  const availabilityRef = collection(db, 'tenants', tenantId, 'staff_availability');
  const q = query(availabilityRef, where('employeeId', '==', employeeId));
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) {
    return null;
  }
  
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
}

/**
 * Get all availability for tenant
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>}
 */
export async function getAllAvailability(tenantId) {
  const availabilityRef = collection(db, 'tenants', tenantId, 'staff_availability');
  const q = query(availabilityRef, orderBy('employeeName'));
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Create time off request
 * @param {string} tenantId - Tenant ID
 * @param {object} timeOffData - Time off data
 * @returns {Promise<DocumentReference>}
 */
export async function createTimeOffRequest(tenantId, timeOffData) {
  const timeOffRef = collection(db, 'tenants', tenantId, 'time_off_requests');
  
  const data = {
    employeeId: timeOffData.employeeId,
    employeeName: timeOffData.employeeName || '',
    type: timeOffData.type || TIME_OFF_TYPE.VACATION,
    startDate: timeOffData.startDate,
    endDate: timeOffData.endDate,
    startTime: timeOffData.startTime || null,
    endTime: timeOffData.endTime || null,
    allDay: timeOffData.allDay !== undefined ? timeOffData.allDay : true,
    reason: timeOffData.reason || '',
    status: 'pending', // pending, approved, denied
    approvedBy: null,
    approvedAt: null,
    notes: timeOffData.notes || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  return await addDoc(timeOffRef, data);
}

/**
 * Update time off request status
 * @param {string} tenantId - Tenant ID
 * @param {string} timeOffId - Time off ID
 * @param {string} status - New status (approved, denied)
 * @param {string} approvedBy - User ID who approved/denied
 * @returns {Promise<void>}
 */
export async function updateTimeOffStatus(tenantId, timeOffId, status, approvedBy) {
  const timeOffRef = doc(db, 'tenants', tenantId, 'time_off_requests', timeOffId);
  await updateDoc(timeOffRef, {
    status,
    approvedBy,
    approvedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

/**
 * Get time off requests for employee
 * @param {string} tenantId - Tenant ID
 * @param {string} employeeId - Employee ID
 * @returns {Promise<Array>}
 */
export async function getEmployeeTimeOffRequests(tenantId, employeeId) {
  const timeOffRef = collection(db, 'tenants', tenantId, 'time_off_requests');
  const q = query(timeOffRef, where('employeeId', '==', employeeId), orderBy('startDate', 'desc'));
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get all time off requests for tenant
 * @param {string} tenantId - Tenant ID
 * @param {string} status - Optional status filter
 * @returns {Promise<Array>}
 */
export async function getAllTimeOffRequests(tenantId, status = null) {
  const timeOffRef = collection(db, 'tenants', tenantId, 'time_off_requests');
  let q;
  
  if (status) {
    q = query(timeOffRef, where('status', '==', status), orderBy('startDate', 'desc'));
  } else {
    q = query(timeOffRef, orderBy('startDate', 'desc'));
  }
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Create blocked time
 * @param {string} tenantId - Tenant ID
 * @param {object} blockedTimeData - Blocked time data
 * @returns {Promise<DocumentReference>}
 */
export async function createBlockedTime(tenantId, blockedTimeData) {
  const blockedTimeRef = collection(db, 'tenants', tenantId, 'blocked_time');
  
  const data = {
    employeeId: blockedTimeData.employeeId || null, // null means all employees
    employeeName: blockedTimeData.employeeName || '',
    title: blockedTimeData.title || 'Blocked Time',
    startDate: blockedTimeData.startDate,
    endDate: blockedTimeData.endDate,
    startTime: blockedTimeData.startTime || null,
    endTime: blockedTimeData.endTime || null,
    allDay: blockedTimeData.allDay !== undefined ? blockedTimeData.allDay : true,
    reason: blockedTimeData.reason || '',
    recurring: blockedTimeData.recurring || false,
    recurringPattern: blockedTimeData.recurringPattern || null, // e.g., 'weekly', 'monthly'
    recurringEndDate: blockedTimeData.recurringEndDate || null,
    notes: blockedTimeData.notes || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  return await addDoc(blockedTimeRef, data);
}

/**
 * Get blocked time for employee
 * @param {string} tenantId - Tenant ID
 * @param {string} employeeId - Employee ID
 * @param {string} startDate - Start date to check
 * @param {string} endDate - End date to check
 * @returns {Promise<Array>}
 */
export async function getEmployeeBlockedTime(tenantId, employeeId, startDate, endDate) {
  const blockedTimeRef = collection(db, 'tenants', tenantId, 'blocked_time');
  const q = query(
    blockedTimeRef,
    where('employeeId', '==', employeeId),
    orderBy('startDate')
  );
  const snapshot = await getDocs(q);
  
  const allBlocked = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  // Filter by date range
  return allBlocked.filter(blocked => {
    const blockedStart = new Date(blocked.startDate);
    const blockedEnd = new Date(blocked.endDate);
    const checkStart = new Date(startDate);
    const checkEnd = new Date(endDate);
    
    return blockedStart <= checkEnd && blockedEnd >= checkStart;
  });
}

/**
 * Get all blocked time for tenant
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>}
 */
export async function getAllBlockedTime(tenantId) {
  const blockedTimeRef = collection(db, 'tenants', tenantId, 'blocked_time');
  const q = query(blockedTimeRef, orderBy('startDate'));
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Check if employee is available at specific date/time
 * @param {string} tenantId - Tenant ID
 * @param {string} employeeId - Employee ID
 * @param {string} date - Date to check (YYYY-MM-DD)
 * @param {string} time - Time to check (HH:MM)
 * @returns {Promise<Object>} { available: boolean, reason: string }
 */
export async function checkEmployeeAvailability(tenantId, employeeId, date, time) {
  // Get employee availability
  const availability = await getEmployeeAvailability(tenantId, employeeId);
  if (!availability) {
    return { available: false, reason: 'No availability schedule found' };
  }
  
  if (availability.status !== AVAILABILITY_STATUS.AVAILABLE) {
    return { available: false, reason: `Employee status: ${availability.status}` };
  }
  
  // Check regular schedule
  const dayOfWeek = new Date(date).toLocaleDateString('en-US', { weekday: 'lowercase' });
  const daySchedule = availability.regularSchedule[dayOfWeek];
  
  if (!daySchedule || !daySchedule.available) {
    return { available: false, reason: `Not available on ${dayOfWeek}` };
  }
  
  if (daySchedule.start && daySchedule.end) {
    if (time < daySchedule.start || time > daySchedule.end) {
      return { available: false, reason: `Outside working hours (${daySchedule.start} - ${daySchedule.end})` };
    }
  }
  
  // Check time off requests
  const timeOffRequests = await getEmployeeTimeOffRequests(tenantId, employeeId);
  const approvedTimeOff = timeOffRequests.filter(to => 
    to.status === 'approved' && 
    date >= to.startDate && 
    date <= to.endDate
  );
  
  if (approvedTimeOff.length > 0) {
    return { available: false, reason: 'Approved time off' };
  }
  
  // Check blocked time
  const blockedTime = await getEmployeeBlockedTime(tenantId, employeeId, date, date);
  if (blockedTime.length > 0) {
    return { available: false, reason: 'Blocked time scheduled' };
  }
  
  return { available: true, reason: 'Available' };
}

/**
 * Get available employees for a date/time
 * @param {string} tenantId - Tenant ID
 * @param {string} date - Date (YYYY-MM-DD)
 * @param {string} time - Time (HH:MM)
 * @returns {Promise<Array>} Array of available employee IDs
 */
export async function getAvailableEmployees(tenantId, date, time) {
  const allAvailability = await getAllAvailability(tenantId);
  const availableEmployees = [];
  
  for (const availability of allAvailability) {
    const check = await checkEmployeeAvailability(tenantId, availability.employeeId, date, time);
    if (check.available) {
      availableEmployees.push(availability.employeeId);
    }
  }
  
  return availableEmployees;
}

/**
 * Delete time off request
 * @param {string} tenantId - Tenant ID
 * @param {string} timeOffId - Time off ID
 * @returns {Promise<void>}
 */
export async function deleteTimeOffRequest(tenantId, timeOffId) {
  await deleteDoc(doc(db, 'tenants', tenantId, 'time_off_requests', timeOffId));
}

/**
 * Delete blocked time
 * @param {string} tenantId - Tenant ID
 * @param {string} blockedTimeId - Blocked time ID
 * @returns {Promise<void>}
 */
export async function deleteBlockedTime(tenantId, blockedTimeId) {
  await deleteDoc(doc(db, 'tenants', tenantId, 'blocked_time', blockedTimeId));
}
