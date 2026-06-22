// src/services/franchiseModeService.js
/**
 * Franchise Mode Service
 * Manages multi-location under parent account
 */

import { collection, addDoc, doc, query, where, getDocs, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Create a franchise location
 * @param {string} parentTenantId - Parent tenant ID
 * @param {Object} locationData - Location data
 * @returns {Promise<string>} Location ID
 */
export async function createFranchiseLocation(parentTenantId, locationData) {
  const locationsRef = collection(db, 'tenants', parentTenantId, 'franchise_locations');
  const docRef = await addDoc(locationsRef, {
    ...locationData,
    parentTenantId,
    status: 'active',
    createdAt: new Date().toISOString()
  });
  
  return docRef.id;
}

/**
 * Get all franchise locations for a parent tenant
 * @param {string} parentTenantId - Parent tenant ID
 * @returns {Promise<Array>} Franchise locations
 */
export async function getFranchiseLocations(parentTenantId) {
  const locationsRef = collection(db, 'tenants', parentTenantId, 'franchise_locations');
  const querySnap = await getDocs(locationsRef);
  
  return querySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get a specific franchise location
 * @param {string} parentTenantId - Parent tenant ID
 * @param {string} locationId - Location ID
 * @returns {Promise<Object>} Location data
 */
export async function getFranchiseLocation(parentTenantId, locationId) {
  const querySnap = await getDocs(query(collection(db, 'tenants', parentTenantId, 'franchise_locations'), where('__name__', '==', locationId)));
  
  if (querySnap.empty) {
    return null;
  }
  
  const doc = querySnap.docs[0];
  return { id: doc.id, ...doc.data() };
}

/**
 * Update a franchise location
 * @param {string} parentTenantId - Parent tenant ID
 * @param {string} locationId - Location ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<void>}
 */
export async function updateFranchiseLocation(parentTenantId, locationId, updates) {
  const locationRef = doc(db, 'tenants', parentTenantId, 'franchise_locations', locationId);
  await updateDoc(locationRef, {
    ...updates,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Delete a franchise location
 * @param {string} parentTenantId - Parent tenant ID
 * @param {string} locationId - Location ID
 * @returns {Promise<void>}
 */
export async function deleteFranchiseLocation(parentTenantId, locationId) {
  const locationRef = doc(db, 'tenants', parentTenantId, 'franchise_locations', locationId);
  await deleteDoc(locationRef);
}

/**
 * Get franchise analytics for a parent tenant
 * @param {string} parentTenantId - Parent tenant ID
 * @returns {Promise<Object>} Franchise analytics
 */
export async function getFranchiseAnalytics(parentTenantId) {
  const locations = await getFranchiseLocations(parentTenantId);
  
  let totalRevenue = 0;
  let totalJobs = 0;
  let totalEmployees = 0;
  let totalCustomers = 0;
  
  for (const location of locations) {
    if (location.tenantId) {
      // Get jobs for this location
      const jobsRef = collection(db, 'tenants', location.tenantId, 'jobs');
      const jobsSnap = await getDocs(jobsRef);
      const jobs = jobsSnap.docs.map(doc => doc.data());
      
      totalJobs += jobs.length;
      totalRevenue += jobs.reduce((sum, job) => sum + (job.finalPrice || 0), 0);
      
      // Get employees for this location
      const employeesRef = collection(db, 'tenants', location.tenantId, 'employees');
      const employeesSnap = await getDocs(employeesRef);
      totalEmployees += employeesSnap.size;
      
      // Get customers for this location
      const customersRef = collection(db, 'tenants', location.tenantId, 'customers');
      const customersSnap = await getDocs(customersRef);
      totalCustomers += customersSnap.size;
    }
  }
  
  return {
    totalLocations: locations.length,
    totalRevenue,
    totalJobs,
    totalEmployees,
    totalCustomers,
    avgRevenuePerLocation: locations.length > 0 ? totalRevenue / locations.length : 0,
    avgJobsPerLocation: locations.length > 0 ? totalJobs / locations.length : 0
  };
}

/**
 * Get location-specific analytics
 * @param {string} parentTenantId - Parent tenant ID
 * @param {string} locationId - Location ID
 * @returns {Promise<Object>} Location analytics
 */
export async function getLocationAnalytics(parentTenantId, locationId) {
  const location = await getFranchiseLocation(parentTenantId, locationId);
  
  if (!location || !location.tenantId) {
    return null;
  }
  
  // Get jobs for this location
  const jobsRef = collection(db, 'tenants', location.tenantId, 'jobs');
  const jobsSnap = await getDocs(jobsRef);
  const jobs = jobsSnap.docs.map(doc => doc.data());
  
  const completedJobs = jobs.filter(job => job.status === 'completed');
  const totalRevenue = completedJobs.reduce((sum, job) => sum + (job.finalPrice || 0), 0);
  
  // Get employees for this location
  const employeesRef = collection(db, 'tenants', location.tenantId, 'employees');
  const employeesSnap = await getDocs(employeesRef);
  
  // Get customers for this location
  const customersRef = collection(db, 'tenants', location.tenantId, 'customers');
  const customersSnap = await getDocs(customersRef);
  
  return {
    totalJobs: jobs.length,
    completedJobs: completedJobs.length,
    totalRevenue,
    totalEmployees: employeesSnap.size,
    totalCustomers: customersSnap.size,
    avgJobValue: completedJobs.length > 0 ? totalRevenue / completedJobs.length : 0
  };
}

/**
 * Assign a tenant to a franchise location
 * @param {string} parentTenantId - Parent tenant ID
 * @param {string} locationId - Location ID
 * @param {string} tenantId - Tenant ID to assign
 * @returns {Promise<void>}
 */
export async function assignTenantToLocation(parentTenantId, locationId, tenantId) {
  const locationRef = doc(db, 'tenants', parentTenantId, 'franchise_locations', locationId);
  await updateDoc(locationRef, {
    tenantId,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Get revenue share configuration for a location
 * @param {string} parentTenantId - Parent tenant ID
 * @param {string} locationId - Location ID
 * @returns {Promise<Object>} Revenue share configuration
 */
export async function getRevenueShareConfig(parentTenantId, locationId) {
  const location = await getFranchiseLocation(parentTenantId, locationId);
  
  if (!location) {
    return {
      parentShare: 0.1,
      locationShare: 0.9
    };
  }
  
  return {
    parentShare: location.parentShare || 0.1,
    locationShare: location.locationShare || 0.9
  };
}

/**
 * Update revenue share configuration for a location
 * @param {string} parentTenantId - Parent tenant ID
 * @param {string} locationId - Location ID
 * @param {number} parentShare - Parent share percentage (0-1)
 * @param {number} locationShare - Location share percentage (0-1)
 * @returns {Promise<void>}
 */
export async function updateRevenueShareConfig(parentTenantId, locationId, parentShare, locationShare) {
  const locationRef = doc(db, 'tenants', parentTenantId, 'franchise_locations', locationId);
  await updateDoc(locationRef, {
    parentShare,
    locationShare,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Calculate revenue distribution for a location
 * @param {string} parentTenantId - Parent tenant ID
 * @param {string} locationId - Location ID
 * @param {number} totalRevenue - Total revenue
 * @returns {Promise<Object>} Revenue distribution
 */
export async function calculateRevenueDistribution(parentTenantId, locationId, totalRevenue) {
  const config = await getRevenueShareConfig(parentTenantId, locationId);
  
  return {
    totalRevenue,
    parentRevenue: totalRevenue * config.parentShare,
    locationRevenue: totalRevenue * config.locationShare
  };
}

/**
 * Get franchise performance report
 * @param {string} parentTenantId - Parent tenant ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Array>} Performance report
 */
export async function getFranchisePerformanceReport(parentTenantId, startDate, endDate) {
  const locations = await getFranchiseLocations(parentTenantId);
  
  const report = await Promise.all(
    locations.map(async (location) => {
      if (!location.tenantId) {
        return null;
      }
      
      const jobsRef = collection(db, 'tenants', location.tenantId, 'jobs');
      const jobsSnap = await getDocs(jobsRef);
      const jobs = jobsSnap.docs.map(doc => doc.data());
      
      const filteredJobs = jobs.filter(job => {
        const jobDate = job.date?.split('T')[0];
        return jobDate >= startDate && jobDate <= endDate;
      });
      
      const completedJobs = filteredJobs.filter(job => job.status === 'completed');
      const totalRevenue = completedJobs.reduce((sum, job) => sum + (job.finalPrice || 0), 0);
      
      const config = await getRevenueShareConfig(parentTenantId, location.id);
      
      return {
        locationId: location.id,
        locationName: location.name,
        totalJobs: filteredJobs.length,
        completedJobs: completedJobs.length,
        totalRevenue,
        parentRevenue: totalRevenue * config.parentShare,
        locationRevenue: totalRevenue * config.locationShare
      };
    })
  );
  
  return report.filter(item => item !== null);
}

/**
 * Create a franchise user with access to specific locations
 * @param {string} parentTenantId - Parent tenant ID
 * @param {string} userId - User ID
 * @param {Array} locationIds - Array of location IDs the user can access
 * @param {string} role - User role
 * @returns {Promise<void>}
 */
export async function createFranchiseUser(parentTenantId, userId, locationIds, role) {
  const usersRef = collection(db, 'tenants', parentTenantId, 'franchise_users');
  await addDoc(usersRef, {
    userId,
    locationIds,
    role,
    createdAt: new Date().toISOString()
  });
}

/**
 * Get franchise user permissions
 * @param {string} parentTenantId - Parent tenant ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} User permissions
 */
export async function getFranchiseUserPermissions(parentTenantId, userId) {
  const usersRef = collection(db, 'tenants', parentTenantId, 'franchise_users');
  const q = query(usersRef, where('userId', '==', userId));
  const querySnap = await getDocs(q);
  
  if (querySnap.empty) {
    return null;
  }
  
  const doc = querySnap.docs[0];
  return { id: doc.id, ...doc.data() };
}

/**
 * Update franchise user permissions
 * @param {string} parentTenantId - Parent tenant ID
 * @param {string} userId - User ID
 * @param {Array} locationIds - Array of location IDs
 * @param {string} role - User role
 * @returns {Promise<void>}
 */
export async function updateFranchiseUserPermissions(parentTenantId, userId, locationIds, role) {
  const permissions = await getFranchiseUserPermissions(parentTenantId, userId);
  
  if (permissions) {
    const userRef = doc(db, 'tenants', parentTenantId, 'franchise_users', permissions.id);
    await updateDoc(userRef, {
      locationIds,
      role,
      updatedAt: new Date().toISOString()
    });
  } else {
    await createFranchiseUser(parentTenantId, userId, locationIds, role);
  }
}

/**
 * Get all franchise users
 * @param {string} parentTenantId - Parent tenant ID
 * @returns {Promise<Array>} Franchise users
 */
export async function getFranchiseUsers(parentTenantId) {
  const usersRef = collection(db, 'tenants', parentTenantId, 'franchise_users');
  const querySnap = await getDocs(usersRef);
  
  return querySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}
