// src/services/routeOptimizationImportsService.js
/**
 * Route Optimization Imports Service
 * Import employee home locations, service areas
 */

import { collection, addDoc, doc, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Import employee home locations from CSV
 * @param {string} tenantId - Tenant ID
 * @param {Array} employees - Array of employee objects with home locations
 * @returns {Promise<Array>} Imported employees
 */
export async function importEmployeeHomeLocations(tenantId, employees) {
  const employeesRef = collection(db, 'tenants', tenantId, 'employees');
  const importedEmployees = [];
  
  for (const employee of employees) {
    // Check if employee already exists by email or name
    const q = query(employeesRef, where('email', '==', employee.email));
    const querySnap = await getDocs(q);
    
    if (!querySnap.empty) {
      // Update existing employee
      const employeeRef = doc(db, 'tenants', tenantId, 'employees', querySnap.docs[0].id);
      await updateDoc(employeeRef, {
        homeAddress: employee.homeAddress,
        homeCity: employee.homeCity,
        homeState: employee.homeState,
        homeZip: employee.homeZip,
        homeLat: employee.homeLat,
        homeLng: employee.homeLng,
        serviceRadius: employee.serviceRadius || 25,
        maxDailyHours: employee.maxDailyHours || 8,
        updatedAt: new Date().toISOString()
      });
      importedEmployees.push({ id: querySnap.docs[0].id, ...employee, updated: true });
    } else {
      // Create new employee
      const employeeData = {
        name: employee.name,
        email: employee.email,
        phone: employee.phone,
        hourlyRate: employee.hourlyRate || 0,
        homeAddress: employee.homeAddress,
        homeCity: employee.homeCity,
        homeState: employee.homeState,
        homeZip: employee.homeZip,
        homeLat: employee.homeLat,
        homeLng: employee.homeLng,
        serviceRadius: employee.serviceRadius || 25,
        maxDailyHours: employee.maxDailyHours || 8,
        availability: employee.availability || 'available',
        status: 'active',
        createdAt: new Date().toISOString()
      };
      
      const docRef = await addDoc(employeesRef, employeeData);
      importedEmployees.push({ id: docRef.id, ...employeeData, created: true });
    }
  }
  
  return importedEmployees;
}

/**
 * Import service areas from CSV
 * @param {string} tenantId - Tenant ID
 * @param {Array} serviceAreas - Array of service area objects
 * @returns {Promise<Array>} Imported service areas
 */
export async function importServiceAreas(tenantId, serviceAreas) {
  const serviceAreasRef = collection(db, 'tenants', tenantId, 'service_areas');
  const importedAreas = [];
  
  for (const area of serviceAreas) {
    // Check if service area already exists by name
    const q = query(serviceAreasRef, where('name', '==', area.name));
    const querySnap = await getDocs(q);
    
    if (!querySnap.empty) {
      // Update existing service area
      const areaRef = doc(db, 'tenants', tenantId, 'service_areas', querySnap.docs[0].id);
      await updateDoc(areaRef, {
        description: area.description,
        zipCodes: area.zipCodes || [],
        polygon: area.polygon || [],
        centerLat: area.centerLat,
        centerLng: area.centerLng,
        radius: area.radius,
        basePriceMultiplier: area.basePriceMultiplier || 1,
        updatedAt: new Date().toISOString()
      });
      importedAreas.push({ id: querySnap.docs[0].id, ...area, updated: true });
    } else {
      // Create new service area
      const areaData = {
        name: area.name,
        description: area.description,
        zipCodes: area.zipCodes || [],
        polygon: area.polygon || [],
        centerLat: area.centerLat,
        centerLng: area.centerLng,
        radius: area.radius,
        basePriceMultiplier: area.basePriceMultiplier || 1,
        status: 'active',
        createdAt: new Date().toISOString()
      };
      
      const docRef = await addDoc(serviceAreasRef, areaData);
      importedAreas.push({ id: docRef.id, ...areaData, created: true });
    }
  }
  
  return importedAreas;
}

/**
 * Import service areas from zip codes
 * @param {string} tenantId - Tenant ID
 * @param {Array} zipCodes - Array of zip codes
 * @param {string} areaName - Service area name
 * @returns {Promise<Object>} Imported service area
 */
export async function importServiceAreaFromZipCodes(tenantId, zipCodes, areaName) {
  const serviceAreasRef = collection(db, 'tenants', tenantId, 'service_areas');
  
  // Check if service area already exists
  const q = query(serviceAreasRef, where('name', '==', areaName));
  const querySnap = await getDocs(q);
  
  const areaData = {
    name: areaName,
    description: `Service area covering ${zipCodes.length} zip codes`,
    zipCodes,
    polygon: [],
    centerLat: null,
    centerLng: null,
    radius: null,
    basePriceMultiplier: 1,
    status: 'active',
    createdAt: new Date().toISOString()
  };
  
  if (!querySnap.empty) {
    const areaRef = doc(db, 'tenants', tenantId, 'service_areas', querySnap.docs[0].id);
    await updateDoc(areaRef, {
      ...areaData,
      updatedAt: new Date().toISOString()
    });
    return { id: querySnap.docs[0].id, ...areaData, updated: true };
  } else {
    const docRef = await addDoc(serviceAreasRef, areaData);
    return { id: docRef.id, ...areaData, created: true };
  }
}

/**
 * Get all service areas for a tenant
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>} Service areas
 */
export async function getServiceAreas(tenantId) {
  const serviceAreasRef = collection(db, 'tenants', tenantId, 'service_areas');
  const querySnap = await getDocs(serviceAreasRef);
  
  return querySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get service area by zip code
 * @param {string} tenantId - Tenant ID
 * @param {string} zipCode - Zip code
 * @returns {Promise<Object>} Service area
 */
export async function getServiceAreaByZipCode(tenantId, zipCode) {
  const serviceAreasRef = collection(db, 'tenants', tenantId, 'service_areas');
  const querySnap = await getDocs(serviceAreasRef);
  
  const areas = querySnap.docs.map(doc => doc.data());
  
  for (const area of areas) {
    if (area.zipCodes && area.zipCodes.includes(zipCode)) {
      return area;
    }
  }
  
  return null;
}

/**
 * Get employees within service radius of a location
 * @param {string} tenantId - Tenant ID
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<Array>} Available employees
 */
export async function getEmployeesWithinRadius(tenantId, lat, lng) {
  const employeesRef = collection(db, 'tenants', tenantId, 'employees');
  const querySnap = await getDocs(employeesRef);
  
  const employees = querySnap.docs.map(doc => doc.data());
  const availableEmployees = [];
  
  for (const employee of employees) {
    if (!employee.homeLat || !employee.homeLng || !employee.serviceRadius) {
      continue;
    }
    
    const distance = calculateDistance(lat, lng, employee.homeLat, employee.homeLng);
    
    if (distance <= employee.serviceRadius) {
      availableEmployees.push({
        ...employee,
        distance
      });
    }
  }
  
  // Sort by distance
  availableEmployees.sort((a, b) => a.distance - b.distance);
  
  return availableEmployees;
}

/**
 * Calculate distance between two coordinates (Haversine formula)
 * @param {number} lat1 - Latitude 1
 * @param {number} lng1 - Longitude 1
 * @param {number} lat2 - Latitude 2
 * @param {number} lng2 - Longitude 2
 * @returns {number} Distance in miles
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 3959; // Earth's radius in miles
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c;
}

function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

/**
 * Optimize route for multiple jobs
 * @param {string} tenantId - Tenant ID
 * @param {Array} jobs - Array of jobs with coordinates
 * @param {string} employeeId - Employee ID (starting point)
 * @returns {Promise<Array>} Optimized route
 */
export async function optimizeRoute(tenantId, jobs, employeeId) {
  const employeesRef = collection(db, 'tenants', tenantId, 'employees');
  const employeeQ = query(employeesRef, where('__name__', '==', employeeId));
  const employeeSnap = await getDocs(employeeQ);
  
  if (employeeSnap.empty) {
    throw new Error('Employee not found');
  }
  
  const employee = employeeSnap.docs[0].data();
  const startLat = employee.homeLat;
  const startLng = employee.homeLng;
  
  // Simple nearest neighbor algorithm for route optimization
  const unvisited = [...jobs];
  const route = [];
  let currentLat = startLat;
  let currentLng = startLng;
  
  while (unvisited.length > 0) {
    let nearestIndex = 0;
    let nearestDistance = Infinity;
    
    for (let i = 0; i < unvisited.length; i++) {
      const job = unvisited[i];
      const distance = calculateDistance(currentLat, currentLng, job.lat, job.lng);
      
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = i;
      }
    }
    
    const nearestJob = unvisited.splice(nearestIndex, 1)[0];
    route.push({
      ...nearestJob,
      distanceFromPrevious: nearestDistance
    });
    
    currentLat = nearestJob.lat;
    currentLng = nearestJob.lng;
  }
  
  // Calculate total distance
  const totalDistance = route.reduce((sum, job) => sum + job.distanceFromPrevious, 0);
  
  return {
    route,
    totalDistance,
    startLocation: { lat: startLat, lng: startLng }
  };
}

/**
 * Get route statistics
 * @param {string} tenantId - Tenant ID
 * @param {string} date - Date (YYYY-MM-DD)
 * @returns {Promise<Object>} Route statistics
 */
export async function getRouteStatistics(tenantId, date) {
  const jobsRef = collection(db, 'tenants', tenantId, 'jobs');
  const q = query(jobsRef, where('date', '==', date));
  const querySnap = await getDocs(q);
  
  const jobs = querySnap.docs.map(doc => doc.data());
  
  let totalDistance = 0;
  let totalTravelTime = 0;
  const employeeRoutes = {};
  
  for (const job of jobs) {
    if (!job.assignedEmployees || job.assignedEmployees.length === 0) {
      continue;
    }
    
    const employeeId = job.assignedEmployees[0];
    
    if (!employeeRoutes[employeeId]) {
      employeeRoutes[employeeId] = {
        jobs: 0,
        distance: 0,
        travelTime: 0
      };
    }
    
    employeeRoutes[employeeId].jobs += 1;
    
    if (job.travelDistance) {
      employeeRoutes[employeeId].distance += job.travelDistance;
      totalDistance += job.travelDistance;
    }
    
    if (job.travelTime) {
      employeeRoutes[employeeId].travelTime += job.travelTime;
      totalTravelTime += job.travelTime;
    }
  }
  
  return {
    totalJobs: jobs.length,
    totalDistance,
    totalTravelTime,
    employeeRoutes,
    avgDistancePerJob: jobs.length > 0 ? totalDistance / jobs.length : 0
  };
}
