// src/services/timeClockService.js
/**
 * Employee Time Clock Service
 * Handles clock in/out, break start/end with GPS stamps
 */

import { collection, doc, addDoc, updateDoc, getDoc, getDocs, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Clock in an employee
 * @param {string} tenantId - Tenant ID
 * @param {string} employeeId - Employee ID
 * @param {string} jobId - Job ID (optional)
 * @param {object} location - GPS location {lat, lng, accuracy}
 * @returns {Promise<DocumentReference>}
 */
export async function clockIn(tenantId, employeeId, jobId = null, location = null) {
  const timeClockRef = collection(db, 'tenants', tenantId, 'time_clock');
  
  const data = {
    employeeId,
    jobId,
    
    // Clock in data
    clockInTime: new Date().toISOString(),
    clockInLocation: location || null,
    
    // Status
    status: 'clocked_in',
    
    // Break data
    breakStartTime: null,
    breakEndTime: null,
    totalBreakMinutes: 0,
    
    // Clock out data
    clockOutTime: null,
    clockOutLocation: null,
    
    // Totals
    totalWorkMinutes: 0,
    
    // Notes
    notes: '',
    
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  return await addDoc(timeClockRef, data);
}

/**
 * Clock out an employee
 * @param {string} tenantId - Tenant ID
 * @param {string} timeClockId - Time clock entry ID
 * @param {object} location - GPS location {lat, lng, accuracy}
 * @param {string} notes - Optional notes
 * @returns {Promise<void>}
 */
export async function clockOut(tenantId, timeClockId, location = null, notes = '') {
  const timeClockRef = doc(db, 'tenants', tenantId, 'time_clock', timeClockId);
  const timeClockSnap = await getDoc(timeClockRef);
  
  if (!timeClockSnap.exists()) {
    throw new Error('Time clock entry not found');
  }
  
  const timeClock = timeClockSnap.data();
  
  if (timeClock.status === 'clocked_out') {
    throw new Error('Already clocked out');
  }
  
  const clockOutTime = new Date().toISOString();
  const clockInTime = new Date(timeClock.clockInTime);
  
  // Calculate total work minutes (excluding breaks)
  const totalWorkMinutes = Math.floor((new Date(clockOutTime) - clockInTime) / 60000) - timeClock.totalBreakMinutes;
  
  await updateDoc(timeClockRef, {
    clockOutTime,
    clockOutLocation: location || null,
    status: 'clocked_out',
    totalWorkMinutes: Math.max(0, totalWorkMinutes),
    notes: notes || timeClock.notes,
    updatedAt: clockOutTime
  });
}

/**
 * Start a break
 * @param {string} tenantId - Tenant ID
 * @param {string} timeClockId - Time clock entry ID
 * @param {object} location - GPS location {lat, lng, accuracy}
 * @returns {Promise<void>}
 */
export async function startBreak(tenantId, timeClockId, location = null) {
  const timeClockRef = doc(db, 'tenants', tenantId, 'time_clock', timeClockId);
  const timeClockSnap = await getDoc(timeClockRef);
  
  if (!timeClockSnap.exists()) {
    throw new Error('Time clock entry not found');
  }
  
  const timeClock = timeClockSnap.data();
  
  if (timeClock.status !== 'clocked_in') {
    throw new Error('Must be clocked in to start a break');
  }
  
  if (timeClock.breakStartTime) {
    throw new Error('Break already in progress');
  }
  
  await updateDoc(timeClockRef, {
    breakStartTime: new Date().toISOString(),
    breakLocation: location || null,
    status: 'on_break',
    updatedAt: new Date().toISOString()
  });
}

/**
 * End a break
 * @param {string} tenantId - Tenant ID
 * @param {string} timeClockId - Time clock entry ID
 * @param {object} location - GPS location {lat, lng, accuracy}
 * @returns {Promise<void>}
 */
export async function endBreak(tenantId, timeClockId, location = null) {
  const timeClockRef = doc(db, 'tenants', tenantId, 'time_clock', timeClockId);
  const timeClockSnap = await getDoc(timeClockRef);
  
  if (!timeClockSnap.exists()) {
    throw new Error('Time clock entry not found');
  }
  
  const timeClock = timeClockSnap.data();
  
  if (timeClock.status !== 'on_break') {
    throw new Error('Not currently on break');
  }
  
  const breakEndTime = new Date().toISOString();
  const breakStartTime = new Date(timeClock.breakStartTime);
  const breakMinutes = Math.floor((new Date(breakEndTime) - breakStartTime) / 60000);
  
  await updateDoc(timeClockRef, {
    breakEndTime,
    breakEndLocation: location || null,
    totalBreakMinutes: (timeClock.totalBreakMinutes || 0) + breakMinutes,
    status: 'clocked_in',
    updatedAt: breakEndTime
  });
}

/**
 * Get active time clock entry for an employee
 * @param {string} tenantId - Tenant ID
 * @param {string} employeeId - Employee ID
 * @returns {Promise<Object|null>}
 */
export async function getActiveTimeClock(tenantId, employeeId) {
  const timeClockRef = collection(db, 'tenants', tenantId, 'time_clock');
  const q = query(
    timeClockRef,
    where('employeeId', '==', employeeId),
    where('status', 'in', ['clocked_in', 'on_break']),
    orderBy('clockInTime', 'desc')
  );
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) {
    return null;
  }
  
  return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
}

/**
 * Get time clock entries for an employee
 * @param {string} tenantId - Tenant ID
 * @param {string} employeeId - Employee ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Array>}
 */
export async function getTimeClockEntries(tenantId, employeeId, startDate, endDate) {
  const timeClockRef = collection(db, 'tenants', tenantId, 'time_clock');
  const q = query(
    timeClockRef,
    where('employeeId', '==', employeeId),
    orderBy('clockInTime', 'desc')
  );
  const snapshot = await getDocs(q);
  
  return snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(entry => entry.clockInTime >= startDate && entry.clockInTime <= endDate);
}

/**
 * Get time clock entries for a job
 * @param {string} tenantId - Tenant ID
 * @param {string} jobId - Job ID
 * @returns {Promise<Array>}
 */
export async function getJobTimeClockEntries(tenantId, jobId) {
  const timeClockRef = collection(db, 'tenants', tenantId, 'time_clock');
  const q = query(
    timeClockRef,
    where('jobId', '==', jobId),
    orderBy('clockInTime', 'desc')
  );
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get time clock summary for an employee
 * @param {string} tenantId - Tenant ID
 * @param {string} employeeId - Employee ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Object>}
 */
export async function getTimeClockSummary(tenantId, employeeId, startDate, endDate) {
  const entries = await getTimeClockEntries(tenantId, employeeId, startDate, endDate);
  
  let totalWorkMinutes = 0;
  let totalBreakMinutes = 0;
  let totalEntries = entries.length;
  let clockedInCount = 0;
  
  for (const entry of entries) {
    totalWorkMinutes += entry.totalWorkMinutes || 0;
    totalBreakMinutes += entry.totalBreakMinutes || 0;
    
    if (entry.status === 'clocked_in' || entry.status === 'on_break') {
      clockedInCount++;
    }
  }
  
  return {
    totalWorkMinutes,
    totalWorkHours: Math.round((totalWorkMinutes / 60) * 100) / 100,
    totalBreakMinutes,
    totalBreakHours: Math.round((totalBreakMinutes / 60) * 100) / 100,
    totalEntries,
    clockedInCount,
    averageWorkHours: totalEntries > 0 
      ? Math.round(((totalWorkMinutes / 60) / totalEntries) * 100) / 100 
      : 0
  };
}

/**
 * Get all active time clock entries for a tenant
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>}
 */
export async function getAllActiveTimeClocks(tenantId) {
  const timeClockRef = collection(db, 'tenants', tenantId, 'time_clock');
  const q = query(
    timeClockRef,
    where('status', 'in', ['clocked_in', 'on_break']),
    orderBy('clockInTime', 'desc')
  );
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Update time clock notes
 * @param {string} tenantId - Tenant ID
 * @param {string} timeClockId - Time clock entry ID
 * @param {string} notes - Notes
 * @returns {Promise<void>}
 */
export async function updateTimeClockNotes(tenantId, timeClockId, notes) {
  const timeClockRef = doc(db, 'tenants', tenantId, 'time_clock', timeClockId);
  await updateDoc(timeClockRef, {
    notes,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Get current GPS location
 * @returns {Promise<Object>} GPS location {lat, lng, accuracy}
 */
export async function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
      },
      (error) => {
        reject(error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  });
}

/**
 * Calculate distance between two GPS coordinates
 * @param {object} loc1 - Location 1 {lat, lng}
 * @param {object} loc2 - Location 2 {lat, lng}
 * @returns {number} Distance in meters
 */
export function calculateDistance(loc1, loc2) {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = loc1.lat * Math.PI / 180;
  const φ2 = loc2.lat * Math.PI / 180;
  const Δφ = (loc2.lat - loc1.lat) * Math.PI / 180;
  const Δλ = (loc2.lng - loc1.lng) * Math.PI / 180;
  
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c;
}

/**
 * Validate GPS location (check if within reasonable distance of job location)
 * @param {object} clockLocation - Clock location {lat, lng}
 * @param {object} jobLocation - Job location {lat, lng}
 * @param {number} maxDistanceMeters - Maximum allowed distance in meters (default 500)
 * @returns {boolean}
 */
export function validateLocation(clockLocation, jobLocation, maxDistanceMeters = 500) {
  if (!clockLocation || !jobLocation) {
    return false;
  }
  
  const distance = calculateDistance(clockLocation, jobLocation);
  return distance <= maxDistanceMeters;
}

/**
 * Subscribe to active time clock changes
 * @param {string} tenantId - Tenant ID
 * @param {function} callback - Callback function
 * @returns {function} Unsubscribe function
 */
export function subscribeToActiveTimeClocks(tenantId, callback) {
  const timeClockRef = collection(db, 'tenants', tenantId, 'time_clock');
  const q = query(
    timeClockRef,
    where('status', 'in', ['clocked_in', 'on_break']),
    orderBy('clockInTime', 'desc')
  );
  
  return onSnapshot(q, (snapshot) => {
    const entries = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    callback(entries);
  });
}

/**
 * Get time clock analytics for a tenant
 * @param {string} tenantId - Tenant ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Object>}
 */
export async function getTimeClockAnalytics(tenantId, startDate, endDate) {
  const timeClockRef = collection(db, 'tenants', tenantId, 'time_clock');
  const q = query(timeClockRef, orderBy('clockInTime', 'desc'));
  const snapshot = await getDocs(q);
  
  const entries = snapshot.docs
    .map(doc => doc.data())
    .filter(entry => entry.clockInTime >= startDate && entry.clockInTime <= endDate);
  
  // Calculate analytics
  const totalWorkMinutes = entries.reduce((sum, e) => sum + (e.totalWorkMinutes || 0), 0);
  const totalBreakMinutes = entries.reduce((sum, e) => sum + (e.totalBreakMinutes || 0), 0);
  
  // Group by employee
  const employeeStats = {};
  for (const entry of entries) {
    if (!employeeStats[entry.employeeId]) {
      employeeStats[entry.employeeId] = {
        totalWorkMinutes: 0,
        totalBreakMinutes: 0,
        entryCount: 0
      };
    }
    employeeStats[entry.employeeId].totalWorkMinutes += entry.totalWorkMinutes || 0;
    employeeStats[entry.employeeId].totalBreakMinutes += entry.totalBreakMinutes || 0;
    employeeStats[entry.employeeId].entryCount += 1;
  }
  
  return {
    totalEntries: entries.length,
    totalWorkMinutes,
    totalWorkHours: Math.round((totalWorkMinutes / 60) * 100) / 100,
    totalBreakMinutes,
    totalBreakHours: Math.round((totalBreakMinutes / 60) * 100) / 100,
    averageWorkHoursPerEntry: entries.length > 0 
      ? Math.round(((totalWorkMinutes / 60) / entries.length) * 100) / 100 
      : 0,
    employeeStats
  };
}

/**
 * Auto-clock out employees who forgot to clock out (after 12 hours)
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<number>} Number of auto-clock-outs
 */
export async function autoClockOutForgotten(tenantId) {
  const activeClocks = await getAllActiveTimeClocks(tenantId);
  const now = new Date();
  let autoClockedOut = 0;
  
  for (const clock of activeClocks) {
    const clockInTime = new Date(clock.clockInTime);
    const hoursSinceClockIn = (now - clockInTime) / (1000 * 60 * 60);
    
    // Auto-clock out after 12 hours
    if (hoursSinceClockIn > 12) {
      await clockOut(tenantId, clock.id, clock.clockInLocation, 'Auto clocked out (12+ hours)');
      autoClockedOut++;
    }
  }
  
  return autoClockedOut;
}
