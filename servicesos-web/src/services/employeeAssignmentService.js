// src/services/employeeAssignmentService.js
/**
 * Employee Assignment Service
 * Calculates the best employee for a job based on multiple factors
 * Scoring weights:
 * - Distance: 40%
 * - Availability: 30%
 * - Workload: 20%
 * - Skill: 10%
 */

/**
 * Calculate distance between two addresses (simplified - in production use geocoding API)
 * @param {string} address1 - First address
 * @param {string} address2 - Second address
 * @returns {number} Distance in miles (simplified calculation)
 */
function calculateDistance(address1, address2) {
  // In production, use Google Maps API or OpenRouteService for accurate distances
  // For now, return a placeholder value
  if (!address1 || !address2) return 25; // Default 25 miles
  if (address1 === address2) return 0;
  return Math.random() * 50; // Placeholder - replace with actual geocoding
}

/**
 * Calculate travel time based on distance (simplified)
 * @param {number} distance - Distance in miles
 * @returns {number} Travel time in minutes
 */
function calculateTravelTime(distance) {
  // Assume average 30 mph in city
  return Math.round((distance / 30) * 60);
}

/**
 * Check if employee is available for the job
 * @param {object} employee - Employee object
 * @param {object} job - Job object with date, startTime, estimatedHours
 * @param {array} existingJobs - Existing jobs for the day
 * @returns {boolean} Whether employee is available
 */
function isEmployeeAvailable(employee, job, existingJobs = []) {
  if (employee.status !== 'active') return false;
  
  // Check availability type
  if (employee.availability === 'weekends' && !isWeekend(job.date)) return false;
  
  // Check if employee is already booked during this time
  const jobStart = new Date(`${job.date}T${job.startTime}`);
  const jobEnd = new Date(jobStart.getTime() + job.estimatedHours * 60 * 60 * 1000);
  
  for (const existingJob of existingJobs) {
    if (existingJob.employeeId === employee.id) {
      const existingStart = new Date(`${existingJob.date}T${existingJob.startTime}`);
      const existingEnd = new Date(existingStart.getTime() + existingJob.estimatedHours * 60 * 60 * 1000);
      
      // Check for overlap
      if (jobStart < existingEnd && jobEnd > existingStart) {
        return false;
      }
    }
  }
  
  return true;
}

/**
 * Check if a date is a weekend
 * @param {string} dateStr - Date string (YYYY-MM-DD)
 * @returns {boolean}
 */
function isWeekend(dateStr) {
  const date = new Date(dateStr);
  const day = date.getDay();
  return day === 0 || day === 6; // Sunday or Saturday
}

/**
 * Calculate employee's current workload for the day
 * @param {string} employeeId - Employee ID
 * @param {string} date - Date string (YYYY-MM-DD)
 * @param {array} existingJobs - Existing jobs for the day
 * @returns {number} Total hours scheduled
 */
function calculateDailyWorkload(employeeId, date, existingJobs = []) {
  const employeeJobs = existingJobs.filter(job => 
    job.employeeId === employeeId && job.date === date
  );
  
  return employeeJobs.reduce((total, job) => total + (job.estimatedHours || 0), 0);
}

/**
 * Calculate distance score (40% weight)
 * Lower distance = higher score
 * @param {number} distance - Distance in miles
 * @param {number} serviceRadius - Employee's service radius
 * @returns {number} Score 0-100
 */
function calculateDistanceScore(distance, serviceRadius) {
  if (distance > serviceRadius) return 0;
  // Linear decrease from 100 to 0 as distance approaches service radius
  return Math.max(0, 100 - (distance / serviceRadius) * 100);
}

/**
 * Calculate availability score (30% weight)
 * @param {boolean} isAvailable - Whether employee is available
 * @param {string} availability - Employee's availability type
 * @param {string} jobDate - Job date
 * @returns {number} Score 0-100
 */
function calculateAvailabilityScore(isAvailable, availability, jobDate) {
  if (!isAvailable) return 0;
  
  // Bonus points for matching availability
  if (availability === 'full-time') return 100;
  if (availability === 'part-time') return 80;
  if (availability === 'weekends' && isWeekend(jobDate)) return 100;
  if (availability === 'flexible') return 90;
  
  return 70; // Default score
}

/**
 * Calculate workload score (20% weight)
 * Lower workload = higher score
 * @param {number} currentHours - Current scheduled hours
 * @param {number} maxDailyHours - Employee's max daily hours
 * @returns {number} Score 0-100
 */
function calculateWorkloadScore(currentHours, maxDailyHours) {
  if (currentHours >= maxDailyHours) return 0;
  // Linear decrease from 100 to 0 as workload approaches max
  return Math.max(0, 100 - (currentHours / maxDailyHours) * 100);
}

/**
 * Calculate skill score (10% weight)
 * Based on employee's hourly rate as a proxy for skill level
 * @param {number} hourlyRate - Employee's hourly rate
 * @param {number} averageRate - Average hourly rate across all employees
 * @returns {number} Score 0-100
 */
function calculateSkillScore(hourlyRate, averageRate) {
  // Higher rate = higher skill score
  const ratio = hourlyRate / averageRate;
  return Math.min(100, ratio * 100);
}

/**
 * Calculate the best employee for a job
 * @param {object} job - Job object with address, date, startTime, estimatedHours
 * @param {array} employees - Array of employee objects
 * @param {array} existingJobs - Array of existing jobs for the day
 * @returns {object|null} Best employee object with score, or null if no employees available
 */
export function calculateBestEmployee(job, employees, existingJobs = []) {
  if (!employees || employees.length === 0) return null;
  
  // Calculate average hourly rate for skill scoring
  const averageRate = employees.reduce((sum, emp) => sum + (emp.hourlyRate || 0), 0) / employees.length;
  
  let bestEmployee = null;
  let bestScore = -1;
  
  for (const employee of employees) {
    // Check availability
    const available = isEmployeeAvailable(employee, job, existingJobs);
    if (!available) continue;
    
    // Calculate distance
    const distance = calculateDistance(employee.homeAddress, job.address);
    
    // Check if within service radius
    if (distance > (employee.serviceRadius || 25)) continue;
    
    // Calculate workload
    const currentWorkload = calculateDailyWorkload(employee.id, job.date, existingJobs);
    
    // Calculate individual scores
    const distanceScore = calculateDistanceScore(distance, employee.serviceRadius || 25);
    const availabilityScore = calculateAvailabilityScore(available, employee.availability, job.date);
    const workloadScore = calculateWorkloadScore(currentWorkload, employee.maxDailyHours || 8);
    const skillScore = calculateSkillScore(employee.hourlyRate || 15, averageRate);
    
    // Calculate weighted total score
    const totalScore = (
      distanceScore * 0.40 +
      availabilityScore * 0.30 +
      workloadScore * 0.20 +
      skillScore * 0.10
    );
    
    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestEmployee = {
        ...employee,
        assignmentScore: Math.round(totalScore),
        distance: Math.round(distance),
        travelTime: calculateTravelTime(distance),
        currentWorkload: Math.round(currentWorkload),
        scores: {
          distance: Math.round(distanceScore),
          availability: Math.round(availabilityScore),
          workload: Math.round(workloadScore),
          skill: Math.round(skillScore)
        }
      };
    }
  }
  
  return bestEmployee;
}

/**
 * Get ranked list of employees for a job
 * @param {object} job - Job object
 * @param {array} employees - Array of employee objects
 * @param {array} existingJobs - Array of existing jobs for the day
 * @returns {array} Ranked array of employees with scores
 */
export function rankEmployeesForJob(job, employees, existingJobs = []) {
  if (!employees || employees.length === 0) return [];
  
  const averageRate = employees.reduce((sum, emp) => sum + (emp.hourlyRate || 0), 0) / employees.length;
  
  const rankedEmployees = employees
    .map(employee => {
      const available = isEmployeeAvailable(employee, job, existingJobs);
      const distance = calculateDistance(employee.homeAddress, job.address);
      const withinRadius = distance <= (employee.serviceRadius || 25);
      
      if (!available || !withinRadius) {
        return null;
      }
      
      const currentWorkload = calculateDailyWorkload(employee.id, job.date, existingJobs);
      
      const distanceScore = calculateDistanceScore(distance, employee.serviceRadius || 25);
      const availabilityScore = calculateAvailabilityScore(available, employee.availability, job.date);
      const workloadScore = calculateWorkloadScore(currentWorkload, employee.maxDailyHours || 8);
      const skillScore = calculateSkillScore(employee.hourlyRate || 15, averageRate);
      
      const totalScore = (
        distanceScore * 0.40 +
        availabilityScore * 0.30 +
        workloadScore * 0.20 +
        skillScore * 0.10
      );
      
      return {
        ...employee,
        assignmentScore: Math.round(totalScore),
        distance: Math.round(distance),
        travelTime: calculateTravelTime(distance),
        currentWorkload: Math.round(currentWorkload),
        scores: {
          distance: Math.round(distanceScore),
          availability: Math.round(availabilityScore),
          workload: Math.round(workloadScore),
          skill: Math.round(skillScore)
        }
      };
    })
    .filter(emp => emp !== null)
    .sort((a, b) => b.assignmentScore - a.assignmentScore);
  
  return rankedEmployees;
}
