// src/services/liveTrackingService.js
/**
 * Live Appointment Tracking Service
 * Tracks real-time appointment status (crew assigned, en route, arrived, in progress, completed)
 */

import { collection, doc, addDoc, updateDoc, getDoc, getDocs, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

// Appointment status constants
export const APPOINTMENT_STATUS = {
  ASSIGNED: 'assigned',
  EN_ROUTE: 'en_route',
  ARRIVED: 'arrived',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

/**
 * Create live tracking record for a job
 * @param {string} tenantId - Tenant ID
 * @param {object} trackingData - Tracking data
 * @returns {Promise<DocumentReference>}
 */
export async function createLiveTracking(tenantId, trackingData) {
  const trackingRef = collection(db, 'tenants', tenantId, 'live_tracking');
  
  const data = {
    jobId: trackingData.jobId,
    jobDate: trackingData.jobDate || null,
    
    // Assigned employees
    assignedEmployees: trackingData.assignedEmployees || [],
    crewSize: trackingData.crewSize || 1,
    
    // Status
    status: APPOINTMENT_STATUS.ASSIGNED,
    
    // Location tracking
    currentLocation: null,
    lastLocationUpdate: null,
    estimatedArrival: null,
    
    // Timeline
    assignedAt: new Date().toISOString(),
    enRouteAt: null,
    arrivedAt: null,
    startedAt: null,
    completedAt: null,
    
    // Notes
    notes: trackingData.notes || '',
    
    // Customer notification
    customerNotified: false,
    
    // Timestamps
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  return await addDoc(trackingRef, data);
}

/**
 * Update tracking status
 * @param {string} tenantId - Tenant ID
 * @param {string} trackingId - Tracking ID
 * @param {string} status - New status
 * @param {object} updates - Additional updates
 * @returns {Promise<void>}
 */
export async function updateTrackingStatus(tenantId, trackingId, status, updates = {}) {
  const trackingRef = doc(db, 'tenants', tenantId, 'live_tracking', trackingId);
  const trackingSnap = await getDoc(trackingRef);
  
  if (!trackingSnap.exists()) {
    throw new Error('Tracking record not found');
  }
  
  const updateData = {
    status,
    updatedAt: new Date().toISOString(),
    ...updates
  };
  
  // Update timeline based on status
  switch (status) {
    case APPOINTMENT_STATUS.EN_ROUTE:
      updateData.enRouteAt = new Date().toISOString();
      break;
    case APPOINTMENT_STATUS.ARRIVED:
      updateData.arrivedAt = new Date().toISOString();
      break;
    case APPOINTMENT_STATUS.IN_PROGRESS:
      updateData.startedAt = new Date().toISOString();
      break;
    case APPOINTMENT_STATUS.COMPLETED:
      updateData.completedAt = new Date().toISOString();
      break;
  }
  
  await updateDoc(trackingRef, updateData);
}

/**
 * Update current location
 * @param {string} tenantId - Tenant ID
 * @param {string} trackingId - Tracking ID
 * @param {object} location - Location data (latitude, longitude, address)
 * @returns {Promise<void>}
 */
export async function updateCurrentLocation(tenantId, trackingId, location) {
  const trackingRef = doc(db, 'tenants', tenantId, 'live_tracking', trackingId);
  await updateDoc(trackingRef, {
    currentLocation: {
      latitude: location.latitude,
      longitude: location.longitude,
      address: location.address || null,
      accuracy: location.accuracy || null
    },
    lastLocationUpdate: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

/**
 * Update estimated arrival time
 * @param {string} tenantId - Tenant ID
 * @param {string} trackingId - Tracking ID
 * @param {string} eta - Estimated arrival time (ISO string)
 * @returns {Promise<void>}
 */
export async function updateEstimatedArrival(tenantId, trackingId, eta) {
  const trackingRef = doc(db, 'tenants', tenantId, 'live_tracking', trackingId);
  await updateDoc(trackingRef, {
    estimatedArrival: eta,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Get tracking by job ID
 * @param {string} tenantId - Tenant ID
 * @param {string} jobId - Job ID
 * @returns {Promise<Object|null>}
 */
export async function getTrackingByJob(tenantId, jobId) {
  const trackingRef = collection(db, 'tenants', tenantId, 'live_tracking');
  const q = query(trackingRef, where('jobId', '==', jobId));
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) {
    return null;
  }
  
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
}

/**
 * Get tracking by ID
 * @param {string} tenantId - Tenant ID
 * @param {string} trackingId - Tracking ID
 * @returns {Promise<Object|null>}
 */
export async function getTracking(tenantId, trackingId) {
  const trackingRef = doc(db, 'tenants', tenantId, 'live_tracking', trackingId);
  const trackingSnap = await getDoc(trackingRef);
  
  if (!trackingSnap.exists()) {
    return null;
  }
  
  return { id: trackingSnap.id, ...trackingSnap.data() };
}

/**
 * Get all active tracking for tenant
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>}
 */
export async function getActiveTracking(tenantId) {
  const trackingRef = collection(db, 'tenants', tenantId, 'live_tracking');
  const q = query(
    trackingRef,
    where('status', 'in', [APPOINTMENT_STATUS.ASSIGNED, APPOINTMENT_STATUS.EN_ROUTE, APPOINTMENT_STATUS.ARRIVED, APPOINTMENT_STATUS.IN_PROGRESS]),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get tracking for a specific date
 * @param {string} tenantId - Tenant ID
 * @param {string} date - Date (YYYY-MM-DD)
 * @returns {Promise<Array>}
 */
export async function getTrackingByDate(tenantId, date) {
  const trackingRef = collection(db, 'tenants', tenantId, 'live_tracking');
  const q = query(
    trackingRef,
    where('jobDate', '==', date),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Subscribe to tracking updates for a job
 * @param {string} tenantId - Tenant ID
 * @param {string} jobId - Job ID
 * @param {function} callback - Callback function for updates
 * @returns {function} Unsubscribe function
 */
export function subscribeToJobTracking(tenantId, jobId, callback) {
  const trackingRef = collection(db, 'tenants', tenantId, 'live_tracking');
  const q = query(trackingRef, where('jobId', '==', jobId));
  
  return onSnapshot(q, (snapshot) => {
    if (snapshot.empty) {
      callback(null);
      return;
    }
    
    const doc = snapshot.docs[0];
    callback({ id: doc.id, ...doc.data() });
  });
}

/**
 * Subscribe to all active tracking
 * @param {string} tenantId - Tenant ID
 * @param {function} callback - Callback function for updates
 * @returns {function} Unsubscribe function
 */
export function subscribeToActiveTracking(tenantId, callback) {
  const trackingRef = collection(db, 'tenants', tenantId, 'live_tracking');
  const q = query(
    trackingRef,
    where('status', 'in', [APPOINTMENT_STATUS.ASSIGNED, APPOINTMENT_STATUS.EN_ROUTE, APPOINTMENT_STATUS.ARRIVED, APPOINTMENT_STATUS.IN_PROGRESS]),
    orderBy('createdAt', 'desc')
  );
  
  return onSnapshot(q, (snapshot) => {
    const tracking = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(tracking);
  });
}

/**
 * Mark customer as notified
 * @param {string} tenantId - Tenant ID
 * @param {string} trackingId - Tracking ID
 * @returns {Promise<void>}
 */
export async function markCustomerNotified(tenantId, trackingId) {
  const trackingRef = doc(db, 'tenants', tenantId, 'live_tracking', trackingId);
  await updateDoc(trackingRef, {
    customerNotified: true,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Add note to tracking
 * @param {string} tenantId - Tenant ID
 * @param {string} trackingId - Tracking ID
 * @param {string} note - Note text
 * @returns {Promise<void>}
 */
export async function addTrackingNote(tenantId, trackingId, note) {
  const trackingRef = doc(db, 'tenants', tenantId, 'live_tracking', trackingId);
  const trackingSnap = await getDoc(trackingRef);
  
  if (!trackingSnap.exists()) {
    throw new Error('Tracking record not found');
  }
  
  const tracking = trackingSnap.data();
  const existingNotes = tracking.notes || '';
  const newNotes = existingNotes ? `${existingNotes}\n${note}` : note;
  
  await updateDoc(trackingRef, {
    notes: newNotes,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Get tracking analytics
 * @param {string} tenantId - Tenant ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Object>}
 */
export async function getTrackingAnalytics(tenantId, startDate, endDate) {
  const trackingRef = collection(db, 'tenants', tenantId, 'live_tracking');
  const q = query(
    trackingRef,
    where('jobDate', '>=', startDate),
    where('jobDate', '<=', endDate),
    orderBy('jobDate', 'desc')
  );
  const snapshot = await getDocs(q);
  
  const tracking = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  let total = tracking.length;
  let assigned = 0;
  let enRoute = 0;
  let arrived = 0;
  let inProgress = 0;
  let completed = 0;
  let cancelled = 0;
  
  let averageEnRouteTime = 0;
  let averageServiceTime = 0;
  let enRouteTimes = [];
  let serviceTimes = [];
  
  for (const t of tracking) {
    switch (t.status) {
      case APPOINTMENT_STATUS.ASSIGNED:
        assigned++;
        break;
      case APPOINTMENT_STATUS.EN_ROUTE:
        enRoute++;
        break;
      case APPOINTMENT_STATUS.ARRIVED:
        arrived++;
        break;
      case APPOINTMENT_STATUS.IN_PROGRESS:
        inProgress++;
        break;
      case APPOINTMENT_STATUS.COMPLETED:
        completed++;
        break;
      case APPOINTMENT_STATUS.CANCELLED:
        cancelled++;
        break;
    }
    
    // Calculate en route time
    if (t.enRouteAt && t.arrivedAt) {
      const enRouteMs = new Date(t.arrivedAt) - new Date(t.enRouteAt);
      enRouteTimes.push(enRouteMs);
    }
    
    // Calculate service time
    if (t.startedAt && t.completedAt) {
      const serviceMs = new Date(t.completedAt) - new Date(t.startedAt);
      serviceTimes.push(serviceMs);
    }
  }
  
  if (enRouteTimes.length > 0) {
    averageEnRouteTime = enRouteTimes.reduce((a, b) => a + b, 0) / enRouteTimes.length;
  }
  
  if (serviceTimes.length > 0) {
    averageServiceTime = serviceTimes.reduce((a, b) => a + b, 0) / serviceTimes.length;
  }
  
  return {
    total,
    assigned,
    enRoute,
    arrived,
    inProgress,
    completed,
    cancelled,
    completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    averageEnRouteTime: Math.round(averageEnRouteTime / 60000), // in minutes
    averageServiceTime: Math.round(averageServiceTime / 60000) // in minutes
  };
}

/**
 * Export tracking data as CSV
 * @param {string} tenantId - Tenant ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<string>} CSV content
 */
export async function exportTrackingCSV(tenantId, startDate, endDate) {
  const trackingRef = collection(db, 'tenants', tenantId, 'live_tracking');
  const q = query(
    trackingRef,
    where('jobDate', '>=', startDate),
    where('jobDate', '<=', endDate),
    orderBy('jobDate', 'desc')
  );
  const snapshot = await getDocs(q);
  
  const tracking = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  let csv = 'Job ID,Date,Status,Crew Size,Assigned At,En Route At,Arrived At,Started At,Completed At,Notes\n';
  
  for (const t of tracking) {
    csv += `"${t.jobId}","${t.jobDate}","${t.status}","${t.crewSize}","${t.assignedAt}","${t.enRouteAt || ''}","${t.arrivedAt || ''}","${t.startedAt || ''}","${t.completedAt || ''}","${t.notes.replace(/"/g, '""')}"\n`;
  }
  
  return csv;
}
