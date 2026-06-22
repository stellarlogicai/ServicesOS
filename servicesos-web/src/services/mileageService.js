// src/services/mileageService.js
/**
 * Mileage Tracking Service
 * Handles mileage tracking with start/end location and miles driven
 */

import { collection, doc, addDoc, updateDoc, getDoc, getDocs, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { calculateDistance } from './timeClockService';

/**
 * Start mileage tracking
 * @param {string} tenantId - Tenant ID
 * @param {string} employeeId - Employee ID
 * @param {string} jobId - Job ID (optional)
 * @param {object} startLocation - Start GPS location {lat, lng, accuracy}
 * @returns {Promise<DocumentReference>}
 */
export async function startMileageTracking(tenantId, employeeId, jobId = null, startLocation = null) {
  const mileageRef = collection(db, 'tenants', tenantId, 'mileage');
  
  const data = {
    employeeId,
    jobId,
    
    // Start data
    startTime: new Date().toISOString(),
    startLocation: startLocation || null,
    startAddress: startLocation ? await reverseGeocode(startLocation) : null,
    
    // End data
    endTime: null,
    endLocation: null,
    endAddress: null,
    
    // Calculated data
    miles: 0,
    
    // Status
    status: 'in_progress',
    
    // Notes
    notes: '',
    
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  return await addDoc(mileageRef, data);
}

/**
 * End mileage tracking
 * @param {string} tenantId - Tenant ID
 * @param {string} mileageId - Mileage entry ID
 * @param {object} endLocation - End GPS location {lat, lng, accuracy}
 * @param {string} notes - Optional notes
 * @returns {Promise<void>}
 */
export async function endMileageTracking(tenantId, mileageId, endLocation = null, notes = '') {
  const mileageRef = doc(db, 'tenants', tenantId, 'mileage', mileageId);
  const mileageSnap = await getDoc(mileageRef);
  
  if (!mileageSnap.exists()) {
    throw new Error('Mileage entry not found');
  }
  
  const mileage = mileageSnap.data();
  
  if (mileage.status === 'completed') {
    throw new Error('Mileage tracking already completed');
  }
  
  const endTime = new Date().toISOString();
  const endAddress = endLocation ? await reverseGeocode(endLocation) : null;
  
  // Calculate miles if both locations are available
  let miles = 0;
  if (mileage.startLocation && endLocation) {
    const distanceMeters = calculateDistance(mileage.startLocation, endLocation);
    miles = Math.round((distanceMeters / 1609.34) * 100) / 100; // Convert to miles
  }
  
  await updateDoc(mileageRef, {
    endTime,
    endLocation: endLocation || null,
    endAddress,
    miles,
    status: 'completed',
    notes: notes || mileage.notes,
    updatedAt: endTime
  });
}

/**
 * Get active mileage tracking for an employee
 * @param {string} tenantId - Tenant ID
 * @param {string} employeeId - Employee ID
 * @returns {Promise<Object|null>}
 */
export async function getActiveMileageTracking(tenantId, employeeId) {
  const mileageRef = collection(db, 'tenants', tenantId, 'mileage');
  const q = query(
    mileageRef,
    where('employeeId', '==', employeeId),
    where('status', '==', 'in_progress'),
    orderBy('startTime', 'desc')
  );
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) {
    return null;
  }
  
  return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
}

/**
 * Get mileage entries for an employee
 * @param {string} tenantId - Tenant ID
 * @param {string} employeeId - Employee ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Array>}
 */
export async function getMileageEntries(tenantId, employeeId, startDate, endDate) {
  const mileageRef = collection(db, 'tenants', tenantId, 'mileage');
  const q = query(
    mileageRef,
    where('employeeId', '==', employeeId),
    orderBy('startTime', 'desc')
  );
  const snapshot = await getDocs(q);
  
  return snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(entry => entry.startTime >= startDate && entry.startTime <= endDate);
}

/**
 * Get mileage entries for a job
 * @param {string} tenantId - Tenant ID
 * @param {string} jobId - Job ID
 * @returns {Promise<Array>}
 */
export async function getJobMileageEntries(tenantId, jobId) {
  const mileageRef = collection(db, 'tenants', tenantId, 'mileage');
  const q = query(
    mileageRef,
    where('jobId', '==', jobId),
    orderBy('startTime', 'desc')
  );
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get mileage summary for an employee
 * @param {string} tenantId - Tenant ID
 * @param {string} employeeId - Employee ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Object>}
 */
export async function getMileageSummary(tenantId, employeeId, startDate, endDate) {
  const entries = await getMileageEntries(tenantId, employeeId, startDate, endDate);
  
  let totalMiles = 0;
  let totalEntries = entries.length;
  let inProgressCount = 0;
  
  for (const entry of entries) {
    totalMiles += entry.miles || 0;
    
    if (entry.status === 'in_progress') {
      inProgressCount++;
    }
  }
  
  return {
    totalMiles: Math.round(totalMiles * 100) / 100,
    totalEntries,
    inProgressCount,
    averageMilesPerEntry: totalEntries > 0 
      ? Math.round((totalMiles / totalEntries) * 100) / 100 
      : 0
  };
}

/**
 * Update mileage notes
 * @param {string} tenantId - Tenant ID
 * @param {string} mileageId - Mileage entry ID
 * @param {string} notes - Notes
 * @returns {Promise<void>}
 */
export async function updateMileageNotes(tenantId, mileageId, notes) {
  const mileageRef = doc(db, 'tenants', tenantId, 'mileage', mileageId);
  await updateDoc(mileageRef, {
    notes,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Reverse geocode coordinates to address
 * @param {object} location - GPS location {lat, lng}
 * @returns {Promise<string>} Address string
 */
async function reverseGeocode(location) {
  try {
    // Using OpenStreetMap Nominatim API (free, no API key required)
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${location.lat}&lon=${location.lng}`,
      {
        headers: {
          'User-Agent': 'CleaningIntakeSystem'
        }
      }
    );
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    return data.display_name || null;
    
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    return null;
  }
}

/**
 * Calculate mileage reimbursement
 * @param {number} miles - Miles driven
 * @param {number} rate - Reimbursement rate per mile (default 0.67 - IRS standard)
 * @returns {number} Reimbursement amount
 */
export function calculateMileageReimbursement(miles, rate = 0.67) {
  return Math.round(miles * rate * 100) / 100;
}

/**
 * Get mileage analytics for a tenant
 * @param {string} tenantId - Tenant ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Object>}
 */
export async function getMileageAnalytics(tenantId, startDate, endDate) {
  const mileageRef = collection(db, 'tenants', tenantId, 'mileage');
  const q = query(mileageRef, orderBy('startTime', 'desc'));
  const snapshot = await getDocs(q);
  
  const entries = snapshot.docs
    .map(doc => doc.data())
    .filter(entry => entry.startTime >= startDate && entry.startTime <= endDate);
  
  // Calculate analytics
  const totalMiles = entries.reduce((sum, e) => sum + (e.miles || 0), 0);
  const totalReimbursement = calculateMileageReimbursement(totalMiles);
  
  // Group by employee
  const employeeStats = {};
  for (const entry of entries) {
    if (!employeeStats[entry.employeeId]) {
      employeeStats[entry.employeeId] = {
        totalMiles: 0,
        entryCount: 0
      };
    }
    employeeStats[entry.employeeId].totalMiles += entry.miles || 0;
    employeeStats[entry.employeeId].entryCount += 1;
  }
  
  return {
    totalEntries: entries.length,
    totalMiles: Math.round(totalMiles * 100) / 100,
    totalReimbursement,
    averageMilesPerEntry: entries.length > 0 
      ? Math.round((totalMiles / entries.length) * 100) / 100 
      : 0,
    employeeStats
  };
}

/**
 * Subscribe to mileage changes
 * @param {string} tenantId - Tenant ID
 * @param {string} employeeId - Employee ID
 * @param {function} callback - Callback function
 * @returns {function} Unsubscribe function
 */
export function subscribeToMileage(tenantId, employeeId, callback) {
  const mileageRef = collection(db, 'tenants', tenantId, 'mileage');
  const q = query(
    mileageRef,
    where('employeeId', '==', employeeId),
    orderBy('startTime', 'desc')
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
 * Auto-complete mileage tracking for forgotten entries (after 24 hours)
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<number>} Number of auto-completed entries
 */
export async function autoCompleteForgottenMileage(tenantId) {
  const mileageRef = collection(db, 'tenants', tenantId, 'mileage');
  const q = query(
    mileageRef,
    where('status', '==', 'in_progress'),
    orderBy('startTime', 'desc')
  );
  const snapshot = await getDocs(q);
  
  const now = new Date();
  let autoCompleted = 0;
  
  for (const doc of snapshot.docs) {
    const mileage = doc.data();
    const startTime = new Date(mileage.startTime);
    const hoursSinceStart = (now - startTime) / (1000 * 60 * 60);
    
    // Auto-complete after 24 hours with estimated mileage
    if (hoursSinceStart > 24) {
      // Estimate average mileage for forgotten entries (10 miles)
      const estimatedMiles = 10;
      
      await updateDoc(doc.ref, {
        endTime: new Date().toISOString(),
        miles: estimatedMiles,
        status: 'completed',
        notes: (mileage.notes || '') + ' [Auto-completed: 24+ hours]',
        updatedAt: new Date().toISOString()
      });
      
      autoCompleted++;
    }
  }
  
  return autoCompleted;
}

/**
 * Get mileage by date for an employee
 * @param {string} tenantId - Tenant ID
 * @param {string} employeeId - Employee ID
 * @param {string} date - Date (YYYY-MM-DD)
 * @returns {Promise<Object>} Daily mileage data
 */
export async function getDailyMileage(tenantId, employeeId, date) {
  const startDate = date;
  const endDate = date;
  
  const entries = await getMileageEntries(tenantId, employeeId, startDate, endDate);
  
  let totalMiles = 0;
  const trips = [];
  
  for (const entry of entries) {
    totalMiles += entry.miles || 0;
    trips.push({
      startTime: entry.startTime,
      endTime: entry.endTime,
      startAddress: entry.startAddress,
      endAddress: entry.endAddress,
      miles: entry.miles,
      jobId: entry.jobId
    });
  }
  
  return {
    date,
    totalMiles: Math.round(totalMiles * 100) / 100,
    tripCount: trips.length,
    trips
  };
}
