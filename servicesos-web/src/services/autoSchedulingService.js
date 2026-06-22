// src/services/autoSchedulingService.js
/**
 * Auto Scheduling Service
 * Automatically finds available cleaners, checks travel time, and checks workload
 */

import { collection, getDocs, query, where, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { getEmployeeAvailability, checkEmployeeAvailability, getAvailableEmployees } from './staffAvailabilityService';
import { calculateTravelTime } from './travelTimeService';

/**
 * Find best employee for a job
 * @param {string} tenantId - Tenant ID
 * @param {object} jobData - Job data (date, time, estimatedHours, propertyAddress, propertyId)
 * @returns {Promise<Object>} Best employee with score
 */
export async function findBestEmployee(tenantId, jobData) {
  const { date, time, estimatedHours, propertyAddress, propertyId } = jobData; // eslint-disable-line no-unused-vars
  
  // Get all available employees for the date/time
  const availableEmployeeIds = await getAvailableEmployees(tenantId, date, time);
  
  if (availableEmployeeIds.length === 0) {
    return { employee: null, reason: 'No employees available at this time' };
  }
  
  // Get employee details
  const employeesRef = collection(db, 'tenants', tenantId, 'employees');
  const snapshot = await getDocs(employeesRef);
  const allEmployees = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  const availableEmployees = allEmployees.filter(emp => availableEmployeeIds.includes(emp.id));
  
  if (availableEmployees.length === 0) {
    return { employee: null, reason: 'No employee data found' };
  }
  
  // Score each employee
  const scoredEmployees = await Promise.all(
    availableEmployees.map(async (employee) => {
      const score = await calculateEmployeeScore(tenantId, employee, jobData);
      return { employee, score };
    })
  );
  
  // Sort by score (highest first)
  scoredEmployees.sort((a, b) => b.score - a.score);
  
  return {
    employee: scoredEmployees[0].employee,
    score: scoredEmployees[0].score,
    allScores: scoredEmployees.map(s => ({ employeeId: s.employee.id, score: s.score }))
  };
}

/**
 * Calculate employee score for a job
 * @param {string} tenantId - Tenant ID
 * @param {object} employee - Employee data
 * @param {object} jobData - Job data
 * @returns {Promise<number>} Score (0-100)
 */
async function calculateEmployeeScore(tenantId, employee, jobData) {
  let score = 0;
  
  // Distance score (40% weight)
  const distanceScore = await calculateDistanceScore(tenantId, employee, jobData);
  score += distanceScore * 0.4;
  
  // Availability score (30% weight)
  const availabilityScore = await calculateAvailabilityScore(tenantId, employee, jobData);
  score += availabilityScore * 0.3;
  
  // Workload score (20% weight)
  const workloadScore = await calculateWorkloadScore(tenantId, employee, jobData);
  score += workloadScore * 0.2;
  
  // Skill score (10% weight)
  const skillScore = calculateSkillScore(employee, jobData);
  score += skillScore * 0.1;
  
  return Math.round(score);
}

/**
 * Calculate distance score
 * @param {string} tenantId - Tenant ID
 * @param {object} employee - Employee data
 * @param {object} jobData - Job data
 * @returns {Promise<number>} Score (0-100)
 */
async function calculateDistanceScore(tenantId, employee, jobData) {
  if (!employee.homeAddress || !jobData.propertyAddress) {
    return 50; // Neutral score if no location data
  }
  
  try {
    const travelTime = await calculateTravelTime(employee.homeAddress, jobData.propertyAddress);
    
    if (!travelTime) {
      return 50;
    }
    
    const travelMinutes = travelTime.duration / 60;
    
    // Score based on travel time (lower is better)
    if (travelMinutes <= 15) return 100;
    if (travelMinutes <= 30) return 80;
    if (travelMinutes <= 45) return 60;
    if (travelMinutes <= 60) return 40;
    return 20;
  } catch (error) {
    console.error('Error calculating distance score:', error);
    return 50;
  }
}

/**
 * Calculate availability score
 * @param {string} tenantId - Tenant ID
 * @param {object} employee - Employee data
 * @param {object} jobData - Job data
 * @returns {Promise<number>} Score (0-100)
 */
async function calculateAvailabilityScore(tenantId, employee, jobData) {
  const { date, time, estimatedHours } = jobData;
  
  try {
    const availability = await getEmployeeAvailability(tenantId, employee.id);
    
    if (!availability) {
      return 50;
    }
    
    // Check if employee is available at the specific time
    const check = await checkEmployeeAvailability(tenantId, employee.id, date, time);
    
    if (!check.available) {
      return 0;
    }
    
    // Check if job fits within max daily hours
    if (availability.maxDailyHours && estimatedHours > availability.maxDailyHours) {
      return 0;
    }
    
    // Check service area
    if (availability.serviceArea && jobData.propertyAddress) {
      // Simple check - in production, use geospatial query
      const inServiceArea = jobData.propertyAddress.includes(availability.serviceArea);
      if (!inServiceArea) {
        return 30;
      }
    }
    
    return 100;
  } catch (error) {
    console.error('Error calculating availability score:', error);
    return 50;
  }
}

/**
 * Calculate workload score
 * @param {string} tenantId - Tenant ID
 * @param {object} employee - Employee data
 * @param {object} jobData - Job data
 * @returns {Promise<number>} Score (0-100)
 */
async function calculateWorkloadScore(tenantId, employee, jobData) {
  const { date, estimatedHours } = jobData;
  
  try {
    // Get jobs for the same day
    const jobsRef = collection(db, 'tenants', tenantId, 'jobs');
    const q = query(
      jobsRef,
      where('date', '==', date),
      where('assignedEmployees', 'array-contains', employee.id)
    );
    const snapshot = await getDocs(q);
    
    const existingJobs = snapshot.docs.map(doc => doc.data());
    
    // Calculate total hours for the day
    const totalHours = existingJobs.reduce((sum, job) => sum + (job.estimatedHours || 0), 0);
    const newTotalHours = totalHours + estimatedHours;
    
    // Get employee's max daily hours
    const availability = await getEmployeeAvailability(tenantId, employee.id);
    const maxHours = availability?.maxDailyHours || 8;
    
    // Score based on workload (lower is better)
    const utilization = newTotalHours / maxHours;
    
    if (utilization <= 0.5) return 100;
    if (utilization <= 0.75) return 80;
    if (utilization <= 0.9) return 60;
    if (utilization <= 1.0) return 40;
    return 20;
  } catch (error) {
    console.error('Error calculating workload score:', error);
    return 50;
  }
}

/**
 * Calculate skill score
 * @param {object} employee - Employee data
 * @param {object} jobData - Job data
 * @returns {number} Score (0-100)
 */
function calculateSkillScore(employee, jobData) {
  // This is a simplified version - in production, use more complex skill matching
  let score = 50;
  
  // Check if employee has skills that match the job requirements
  if (employee.skills && jobData.requiredSkills) {
    const matchingSkills = employee.skills.filter(skill => 
      jobData.requiredSkills.includes(skill)
    );
    
    if (jobData.requiredSkills.length > 0) {
      score = (matchingSkills.length / jobData.requiredSkills.length) * 100;
    }
  }
  
  // Bonus for experience
  if (employee.yearsOfExperience) {
    const experienceBonus = Math.min(employee.yearsOfExperience * 5, 25);
    score = Math.min(score + experienceBonus, 100);
  }
  
  return Math.round(score);
}

/**
 * Auto-assign job to best employee
 * @param {string} tenantId - Tenant ID
 * @param {string} jobId - Job ID
 * @param {object} jobData - Job data
 * @returns {Promise<Object>} Assignment result
 */
export async function autoAssignJob(tenantId, jobId, jobData) {
  const result = await findBestEmployee(tenantId, jobData);
  
  if (!result.employee) {
    return {
      success: false,
      reason: result.reason,
      employeeId: null
    };
  }
  
  // Update job with assigned employee
  const jobRef = doc(db, 'tenants', tenantId, 'jobs', jobId);
  await updateDoc(jobRef, {
    assignedEmployees: [result.employee.id],
    autoAssigned: true,
    assignmentScore: result.score,
    updatedAt: new Date().toISOString()
  });
  
  return {
    success: true,
    employeeId: result.employee.id,
    employeeName: result.employee.name,
    score: result.score,
    allScores: result.allScores
  };
}

/**
 * Get scheduling suggestions for multiple jobs
 * @param {string} tenantId - Tenant ID
 * @param {Array} jobs - Array of job data objects
 * @returns {Promise<Array>} Array of job assignments
 */
export async function getSchedulingSuggestions(tenantId, jobs) {
  const suggestions = [];
  
  for (const job of jobs) {
    const result = await findBestEmployee(tenantId, job);
    suggestions.push({
      jobId: job.id,
      ...result
    });
  }
  
  return suggestions;
}

/**
 * Optimize schedule for a day
 * @param {string} tenantId - Tenant ID
 * @param {string} date - Date to optimize (YYYY-MM-DD)
 * @returns {Promise<Object>} Optimized schedule
 */
export async function optimizeSchedule(tenantId, date) {
  // Get all unscheduled jobs for the date
  const jobsRef = collection(db, 'tenants', tenantId, 'jobs');
  const q = query(
    jobsRef,
    where('date', '==', date),
    where('assignedEmployees', '==', [])
  );
  const snapshot = await getDocs(q);
  const unscheduledJobs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  if (unscheduledJobs.length === 0) {
    return { success: true, message: 'All jobs already scheduled', assignments: [] };
  }
  
  // Get scheduling suggestions for all jobs
  const suggestions = await getSchedulingSuggestions(tenantId, unscheduledJobs);
  
  // Sort by score (highest first) and assign
  const assignments = [];
  const assignedEmployeeIds = new Set();
  
  for (const suggestion of suggestions.sort((a, b) => (b.score || 0) - (a.score || 0))) {
    if (suggestion.employee && !assignedEmployeeIds.has(suggestion.employee.id)) {
      // Assign job
      const jobRef = doc(db, 'tenants', tenantId, 'jobs', suggestion.jobId);
      await updateDoc(jobRef, {
        assignedEmployees: [suggestion.employee.id],
        autoAssigned: true,
        assignmentScore: suggestion.score,
        updatedAt: new Date().toISOString()
      });
      
      assignments.push({
        jobId: suggestion.jobId,
        employeeId: suggestion.employee.id,
        employeeName: suggestion.employee.name,
        score: suggestion.score
      });
      
      assignedEmployeeIds.add(suggestion.employee.id);
    }
  }
  
  return {
    success: true,
    assignments,
    unassigned: suggestions.length - assignments.length
  };
}

/**
 * Check for scheduling conflicts
 * @param {string} tenantId - Tenant ID
 * @param {string} employeeId - Employee ID
 * @param {string} date - Date to check (YYYY-MM-DD)
 * @param {string} startTime - Start time (HH:MM)
 * @param {string} endTime - End time (HH:MM)
 * @returns {Promise<Array>} Array of conflicting jobs
 */
export async function checkSchedulingConflicts(tenantId, employeeId, date, startTime, endTime) {
  const jobsRef = collection(db, 'tenants', tenantId, 'jobs');
  const q = query(
    jobsRef,
    where('date', '==', date),
    where('assignedEmployees', 'array-contains', employeeId)
  );
  const snapshot = await getDocs(q);
  
  const existingJobs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const conflicts = [];
  
  for (const job of existingJobs) {
    if (job.startTime && job.endTime) {
      // Check for time overlap
      if (startTime < job.endTime && endTime > job.startTime) {
        conflicts.push(job);
      }
    }
  }
  
  return conflicts;
}
