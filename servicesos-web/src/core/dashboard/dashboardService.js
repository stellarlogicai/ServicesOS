/**
 * Core Dashboard Service
 * 
 * This service handles all dashboard-related business logic
 * that is shared across all service verticals.
 * 
 * Core features should never depend on vertical-specific logic.
 */

import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { successResponse, errorResponse } from '../../shared/api/apiResponseStandard';
import { logError, ERROR_CODES, SEVERITY } from '../../shared/logging/errorLoggingStandard';

/**
 * Get dashboard metrics for a tenant
 * @param {string} tenantId - The tenant ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getDashboardMetrics(tenantId) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }

    // Get customer count
    const customersRef = collection(db, 'tenants', tenantId, 'customers');
    const customersSnapshot = await getDocs(customersRef);
    const customerCount = customersSnapshot.size;

    // Get job count
    const jobsRef = collection(db, 'tenants', tenantId, 'bookings');
    const jobsSnapshot = await getDocs(jobsRef);
    const jobCount = jobsSnapshot.size;

    // Get active jobs (scheduled or in progress)
    const activeJobsQuery = query(
      jobsRef,
      where('status', 'in', ['scheduled', 'in_progress'])
    );
    const activeJobsSnapshot = await getDocs(activeJobsQuery);
    const activeJobCount = activeJobsSnapshot.size;

    // Get lead count
    const leadsRef = collection(db, 'tenants', tenantId, 'leads');
    const leadsSnapshot = await getDocs(leadsRef);
    const leadCount = leadsSnapshot.size;

    // Get employee count
    const employeesRef = collection(db, 'tenants', tenantId, 'employees');
    const employeesSnapshot = await getDocs(employeesRef);
    const employeeCount = employeesSnapshot.size;

    // Get revenue from completed jobs
    const completedJobsQuery = query(
      jobsRef,
      where('status', '==', 'completed')
    );
    const completedJobsSnapshot = await getDocs(completedJobsQuery);
    let totalRevenue = 0;
    completedJobsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      totalRevenue += data.totalAmount || 0;
    });

    const metrics = {
      customerCount,
      jobCount,
      activeJobCount,
      leadCount,
      employeeCount,
      totalRevenue,
      updatedAt: new Date().toISOString()
    };

    return successResponse(metrics);
  } catch (error) {
    logError({
      message: 'Failed to load dashboard metrics',
      module: 'core',
      feature: 'dashboard',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load dashboard metrics', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get recent activity for a tenant
 * @param {string} tenantId - The tenant ID
 * @param {number} limit - Number of recent items to return
 * @returns {Promise<object>} - Standardized API response
 */
export async function getRecentActivity(tenantId, limit = 10) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }

    const activities = [];

    // Get recent jobs
    const jobsRef = collection(db, 'tenants', tenantId, 'bookings');
    const jobsQuery = query(jobsRef, orderBy('createdAt', 'desc'));
    const jobsSnapshot = await getDocs(jobsQuery);
    
    jobsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      activities.push({
        type: 'job',
        id: doc.id,
        title: `Job ${data.status}`,
        description: data.serviceType || 'Service',
        timestamp: data.createdAt,
        data
      });
    });

    // Get recent leads
    const leadsRef = collection(db, 'tenants', tenantId, 'leads');
    const leadsQuery = query(leadsRef, orderBy('createdAt', 'desc'));
    const leadsSnapshot = await getDocs(leadsQuery);
    
    leadsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      activities.push({
        type: 'lead',
        id: doc.id,
        title: `Lead ${data.status}`,
        description: data.name || 'New Lead',
        timestamp: data.createdAt,
        data
      });
    });

    // Sort by timestamp and limit
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const limitedActivities = activities.slice(0, limit);

    return successResponse(limitedActivities);
  } catch (error) {
    logError({
      message: 'Failed to load recent activity',
      module: 'core',
      feature: 'dashboard',
      severity: SEVERITY.MEDIUM,
      tenantId,
      error
    });
    return errorResponse('Failed to load recent activity', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get upcoming jobs for a tenant
 * @param {string} tenantId - The tenant ID
 * @param {number} days - Number of days ahead to look
 * @returns {Promise<object>} - Standardized API response
 */
export async function getUpcomingJobs(tenantId, days = 7) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }

    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(today.getDate() + days);

    const jobsRef = collection(db, 'tenants', tenantId, 'bookings');
    const jobsQuery = query(
      jobsRef,
      where('status', '==', 'scheduled'),
      orderBy('date')
    );
    const jobsSnapshot = await getDocs(jobsQuery);
    
    const upcomingJobs = [];
    jobsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const jobDate = new Date(data.date);
      
      if (jobDate >= today && jobDate <= futureDate) {
        upcomingJobs.push({
          id: doc.id,
          ...data
        });
      }
    });

    return successResponse(upcomingJobs);
  } catch (error) {
    logError({
      message: 'Failed to load upcoming jobs',
      module: 'core',
      feature: 'dashboard',
      severity: SEVERITY.MEDIUM,
      tenantId,
      error
    });
    return errorResponse('Failed to load upcoming jobs', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get revenue data for a tenant
 * @param {string} tenantId - The tenant ID
 * @param {number} days - Number of days to look back
 * @returns {Promise<object>} - Standardized API response
 */
export async function getRevenueData(tenantId, days = 30) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }

    const jobsRef = collection(db, 'tenants', tenantId, 'bookings');
    const jobsQuery = query(
      jobsRef,
      where('status', '==', 'completed'),
      orderBy('date', 'desc')
    );
    const jobsSnapshot = await getDocs(jobsQuery);
    
    const revenueByDate = {};
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    jobsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const jobDate = new Date(data.date);
      
      if (jobDate >= cutoffDate) {
        const dateKey = data.date;
        if (!revenueByDate[dateKey]) {
          revenueByDate[dateKey] = 0;
        }
        revenueByDate[dateKey] += data.totalAmount || 0;
      }
    });

    // Convert to array and sort by date
    const revenueArray = Object.entries(revenueByDate)
      .map(([date, revenue]) => ({ date, revenue }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    const totalRevenue = revenueArray.reduce((sum, item) => sum + item.revenue, 0);

    return successResponse({
      revenueByDate: revenueArray,
      totalRevenue,
      period: `${days} days`
    });
  } catch (error) {
    logError({
      message: 'Failed to load revenue data',
      module: 'core',
      feature: 'dashboard',
      severity: SEVERITY.MEDIUM,
      tenantId,
      error
    });
    return errorResponse('Failed to load revenue data', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}
